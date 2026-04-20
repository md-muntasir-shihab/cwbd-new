import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import fc from 'fast-check';
import QuestionBankQuestion from '../models/QuestionBankQuestion';
import { ExamQuestionModel } from '../models/examQuestion.model';
import Exam from '../models/Exam';

/**
 * Feature: exam-question-bank, Property 18: Exam duplication preserves data
 *
 * Validates: Requirements 11.1, 11.2, 11.3
 *
 * For any exam, duplicating it should create a new Exam record with title
 * suffixed with "(Copy)", status set to "draft", `isPublished` set to false,
 * and the same number of ExamQuestion records with matching question data,
 * order, and marks.
 */

let mongoServer: MongoMemoryServer;

beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    await mongoose.connect(mongoServer.getUri());
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
});

beforeEach(async () => {
    await QuestionBankQuestion.deleteMany({});
    await ExamQuestionModel.deleteMany({});
    await Exam.deleteMany({});
});

// ─── Arbitrary Generators ────────────────────────────────────────────────────

const examTitleArb = fc
    .string({ minLength: 3, maxLength: 60 })
    .filter((s) => s.trim().length >= 3)
    .map((s) => s.trim());

const bankQuestionPayloadArb = fc.record({
    question_en: fc
        .string({ minLength: 10, maxLength: 80 })
        .filter((s) => s.trim().length >= 10)
        .map((s) => s.trim()),
    question_bn: fc
        .string({ minLength: 10, maxLength: 80 })
        .filter((s) => s.trim().length >= 10)
        .map((s) => s.trim()),
    subject: fc.constantFrom('Math', 'Science', 'English'),
    moduleCategory: fc.constantFrom('Algebra', 'Physics', 'Grammar'),
    difficulty: fc.constantFrom('easy', 'medium', 'hard') as fc.Arbitrary<'easy' | 'medium' | 'hard'>,
    correctKey: fc.constantFrom('A', 'B', 'C', 'D') as fc.Arbitrary<'A' | 'B' | 'C' | 'D'>,
    options: fc.constant([
        { key: 'A' as const, text_en: 'Option A', text_bn: 'বিকল্প ক' },
        { key: 'B' as const, text_en: 'Option B', text_bn: 'বিকল্প খ' },
        { key: 'C' as const, text_en: 'Option C', text_bn: 'বিকল্প গ' },
        { key: 'D' as const, text_en: 'Option D', text_bn: 'বিকল্প ঘ' },
    ]),
    explanation_en: fc.string({ minLength: 0, maxLength: 50 }),
    explanation_bn: fc.string({ minLength: 0, maxLength: 50 }),
    marks: fc.integer({ min: 1, max: 10 }),
    isActive: fc.constant(true),
    isArchived: fc.constant(false),
});

// ─── Clone logic (mirrors adminCloneExam controller) ─────────────────────────

async function cloneExam(sourceExamId: string): Promise<{ clonedExam: any }> {
    const source = await Exam.findById(sourceExamId).lean();
    if (!source) throw new Error('Exam not found');

    const uniqueSuffix = new mongoose.Types.ObjectId().toString();
    const clonedExamPayload = {
        ...source,
        _id: undefined,
        title: `${String(source.title || 'Exam')} (Copy)`,
        isPublished: false,
        status: 'draft',
        share_link: `clone-${uniqueSuffix}`,
        short_link: `clone-short-${uniqueSuffix}`,
        createdBy: new mongoose.Types.ObjectId(),
        createdAt: undefined,
        updatedAt: undefined,
    };
    const clonedExam = await Exam.create(clonedExamPayload);

    // Duplicate ExamQuestion records, preserving orderIndex and marks
    const sourceExamQuestions = await ExamQuestionModel.find({ examId: String(source._id) }).lean();
    if (sourceExamQuestions.length > 0) {
        await ExamQuestionModel.insertMany(
            sourceExamQuestions.map((eq) => ({
                ...eq,
                _id: undefined,
                examId: String(clonedExam._id),
                createdAt: undefined,
                updatedAt: undefined,
            })),
        );
    }

    // Update totalQuestions and totalMarks on the cloned exam
    const totalQ = sourceExamQuestions.length;
    if (totalQ > 0) {
        const totalMarks = sourceExamQuestions.reduce(
            (sum, eq) => sum + (Number((eq as any).marks) || 0),
            0,
        );
        await Exam.findByIdAndUpdate(clonedExam._id, {
            totalQuestions: totalQ,
            ...(totalMarks > 0 ? { totalMarks } : {}),
        });
    }

    const updatedClone = await Exam.findById(clonedExam._id).lean();
    return { clonedExam: updatedClone };
}

// ─── Property Tests ──────────────────────────────────────────────────────────

describe('Feature: exam-question-bank, Property 18: Exam duplication preserves data', () => {
    it('cloned exam has "(Copy)" suffix, draft status, isPublished false, and same question count with matching data', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.tuple(
                    examTitleArb,
                    fc.integer({ min: 1, max: 6 }).chain((n) =>
                        fc.tuple(
                            fc.array(bankQuestionPayloadArb, { minLength: n, maxLength: n }),
                            fc.array(fc.integer({ min: 1, max: 10 }), { minLength: n, maxLength: n }),
                            fc.constant(n),
                        ),
                    ),
                ),
                async ([title, [bankPayloads, marksArr, n]]) => {
                    // Clean up from previous iteration
                    await QuestionBankQuestion.deleteMany({});
                    await ExamQuestionModel.deleteMany({});
                    await Exam.deleteMany({});

                    // Seed bank questions
                    const createdBankQuestions = await QuestionBankQuestion.insertMany(bankPayloads);

                    const totalMarks = marksArr.reduce((sum, m) => sum + m, 0);

                    // Create source exam with unique share_link
                    const sourceId = new mongoose.Types.ObjectId();
                    const sourceExam = await Exam.create({
                        title,
                        subject: 'Math',
                        duration: 60,
                        totalQuestions: n,
                        totalMarks,
                        negativeMarking: false,
                        negativeMarkValue: 0,
                        defaultMarksPerQuestion: 1,
                        status: 'scheduled',
                        isPublished: true,
                        createdBy: new mongoose.Types.ObjectId(),
                        startDate: new Date(),
                        endDate: new Date(Date.now() + 86400000),
                        resultPublishDate: new Date(Date.now() + 86400000),
                        accessMode: 'all',
                        attemptLimit: 1,
                        share_link: `source-${sourceId.toString()}`,
                        short_link: `source-short-${sourceId.toString()}`,
                    });
                    const sourceExamId = String(sourceExam._id);

                    // Create ExamQuestion records for the source exam
                    const examQuestionDocs = createdBankQuestions.map((bq, idx) => ({
                        examId: sourceExamId,
                        fromBankQuestionId: String(bq._id),
                        orderIndex: idx,
                        marks: marksArr[idx],
                        question_en: bq.question_en || '',
                        question_bn: bq.question_bn || '',
                        questionImageUrl: bq.questionImageUrl || '',
                        options: (bq.options || []).map((opt: any) => ({
                            key: opt.key,
                            text_en: opt.text_en || '',
                            text_bn: opt.text_bn || '',
                        })),
                        correctKey: bq.correctKey,
                        explanation_en: bq.explanation_en || '',
                        explanation_bn: bq.explanation_bn || '',
                        difficulty: bq.difficulty || 'medium',
                    }));
                    await ExamQuestionModel.insertMany(examQuestionDocs);

                    // Clone the exam
                    const { clonedExam } = await cloneExam(sourceExamId);

                    // ── Property: Title has "(Copy)" suffix ──
                    expect(clonedExam.title).toBe(`${title} (Copy)`);

                    // ── Property: Status is draft ──
                    expect(clonedExam.status).toBe('draft');

                    // ── Property: isPublished is false ──
                    expect(clonedExam.isPublished).toBe(false);

                    // ── Property: Same number of ExamQuestion records ──
                    const clonedQuestions = await ExamQuestionModel.find({
                        examId: String(clonedExam._id),
                    })
                        .sort({ orderIndex: 1 })
                        .lean();
                    const sourceQuestions = await ExamQuestionModel.find({
                        examId: sourceExamId,
                    })
                        .sort({ orderIndex: 1 })
                        .lean();

                    expect(clonedQuestions.length).toBe(sourceQuestions.length);
                    expect(clonedQuestions.length).toBe(n);

                    // ── Property: Duplicated questions preserve order and marks ──
                    for (let i = 0; i < sourceQuestions.length; i++) {
                        const src = sourceQuestions[i];
                        const cloned = clonedQuestions[i];

                        expect(cloned.orderIndex).toBe(src.orderIndex);
                        expect(cloned.marks).toBe(src.marks);
                        expect(cloned.fromBankQuestionId).toBe(src.fromBankQuestionId);
                        expect(cloned.question_en).toBe(src.question_en);
                        expect(cloned.question_bn).toBe(src.question_bn);
                        expect(cloned.correctKey).toBe(src.correctKey);
                        expect(cloned.difficulty).toBe(src.difficulty);

                        // Cloned question should have a different _id
                        expect(String(cloned._id)).not.toBe(String(src._id));
                        // Cloned question should reference the new exam
                        expect(cloned.examId).toBe(String(clonedExam._id));
                    }
                },
            ),
            { numRuns: 20 },
        );
    });
});
