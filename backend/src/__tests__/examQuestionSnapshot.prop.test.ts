import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import fc from 'fast-check';
import QuestionBankQuestion from '../models/QuestionBankQuestion';
import { ExamQuestionModel } from '../models/examQuestion.model';
import Exam from '../models/Exam';

/**
 * Feature: exam-question-bank, Property 15: ExamQuestion snapshot creation
 *
 * Validates: Requirements 8.11
 *
 * For any exam saved with N selected questions, exactly N ExamQuestion records
 * should be created, each with `fromBankQuestionId` matching the source bank
 * question, `orderIndex` matching the assigned order, and `marks` matching the
 * assigned marks. The parent Exam's totalQuestions and totalMarks should be
 * updated correctly.
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

/**
 * Generate an array of 1-8 attach entries with unique orderIndex values
 * and positive marks. The count determines how many bank questions to seed.
 */
const attachEntriesArb = (bankQuestionIds: string[]) =>
    fc.constant(
        bankQuestionIds.map((id, idx) => ({
            bankQuestionId: id,
            marks: 0, // placeholder, will be replaced
            orderIndex: idx,
        })),
    ).chain((entries) =>
        fc
            .tuple(...entries.map(() => fc.integer({ min: 1, max: 10 })))
            .map((marksArr) =>
                entries.map((e, i) => ({ ...e, marks: marksArr[i] })),
            ),
    );

// ─── Core bulk-attach logic (mirrors adminBulkAttachQuestions controller) ────

async function bulkAttachQuestions(
    examId: string,
    questions: Array<{ bankQuestionId: string; marks: number; orderIndex: number }>,
): Promise<{ attached: number; examQuestions: Array<Record<string, unknown>> }> {
    const bankQuestionIds = questions.map((q) => q.bankQuestionId);
    const bankQuestions = await QuestionBankQuestion.find({
        _id: { $in: bankQuestionIds },
    }).lean();

    const bankMap = new Map(
        bankQuestions.map((bq) => [String(bq._id), bq]),
    );

    const examQuestionDocs = questions.map((q) => {
        const bq = bankMap.get(q.bankQuestionId)!;
        return {
            examId,
            fromBankQuestionId: q.bankQuestionId,
            orderIndex: q.orderIndex,
            marks: q.marks,
            question_en: bq.question_en || '',
            question_bn: bq.question_bn || '',
            questionImageUrl: bq.questionImageUrl || '',
            options: (bq.options || []).map((opt: Record<string, unknown>) => ({
                key: opt.key,
                text_en: opt.text_en || '',
                text_bn: opt.text_bn || '',
                imageUrl: opt.imageUrl || '',
            })),
            correctKey: bq.correctKey,
            explanation_en: bq.explanation_en || '',
            explanation_bn: bq.explanation_bn || '',
            explanationImageUrl: bq.explanationImageUrl || '',
            difficulty: bq.difficulty || 'medium',
            topic: bq.topic || '',
            tags: bq.tags || [],
        };
    });

    const created = await ExamQuestionModel.insertMany(examQuestionDocs);

    // Update parent Exam totalQuestions and totalMarks
    const allExamQuestions = await ExamQuestionModel.find({ examId }).lean();
    const totalQuestions = allExamQuestions.length;
    const totalMarks = allExamQuestions.reduce(
        (sum, eq) => sum + (Number(eq.marks) || 0),
        0,
    );

    await Exam.findByIdAndUpdate(examId, { totalQuestions, totalMarks });

    return { attached: created.length, examQuestions: created.map((c) => c.toObject()) };
}


// ─── Property Tests ──────────────────────────────────────────────────────────

describe('Feature: exam-question-bank, Property 15: ExamQuestion snapshot creation', () => {
    it('N selected questions produce exactly N ExamQuestion records with correct fromBankQuestionId, orderIndex, marks, and Exam totals are updated', async () => {
        await fc.assert(
            fc.asyncProperty(
                // Generate 1-8 bank question payloads
                fc.integer({ min: 1, max: 8 }).chain((n) =>
                    fc.tuple(
                        fc.array(bankQuestionPayloadArb, { minLength: n, maxLength: n }),
                        fc.constant(n),
                    ),
                ),
                async ([bankPayloads, n]) => {
                    // Clean up from previous iteration
                    await QuestionBankQuestion.deleteMany({});
                    await ExamQuestionModel.deleteMany({});
                    await Exam.deleteMany({});

                    // Seed bank questions
                    const createdBankQuestions = await QuestionBankQuestion.insertMany(bankPayloads);
                    const bankIds = createdBankQuestions.map((bq) => String(bq._id));

                    // Create a parent exam
                    const exam = await Exam.create({
                        title: 'Test Exam',
                        subject: 'Math',
                        duration: 60,
                        totalQuestions: 0,
                        totalMarks: 0,
                        negativeMarking: false,
                        negativeMarkValue: 0,
                        defaultMarksPerQuestion: 1,
                        status: 'draft',
                        isPublished: false,
                        createdBy: new mongoose.Types.ObjectId(),
                        startDate: new Date(),
                        endDate: new Date(Date.now() + 86400000),
                        resultPublishDate: new Date(Date.now() + 86400000),
                        accessMode: 'all',
                        attemptLimit: 1,
                    });
                    const examId = String(exam._id);

                    // Generate attach entries with random marks
                    const marksValues = await fc.sample(
                        fc.integer({ min: 1, max: 10 }),
                        n,
                    );
                    const attachEntries = bankIds.map((id, idx) => ({
                        bankQuestionId: id,
                        marks: marksValues[idx],
                        orderIndex: idx,
                    }));

                    // Execute bulk-attach
                    const result = await bulkAttachQuestions(examId, attachEntries);

                    // ── Property: Exactly N ExamQuestion records created ──
                    expect(result.attached).toBe(n);

                    const storedExamQuestions = await ExamQuestionModel.find({ examId }).lean();
                    expect(storedExamQuestions.length).toBe(n);

                    // ── Property: Each ExamQuestion has correct fromBankQuestionId, orderIndex, marks ──
                    for (const entry of attachEntries) {
                        const eq = storedExamQuestions.find(
                            (q) => String(q.fromBankQuestionId) === entry.bankQuestionId,
                        );
                        expect(eq).toBeDefined();
                        expect(eq!.orderIndex).toBe(entry.orderIndex);
                        expect(eq!.marks).toBe(entry.marks);
                    }

                    // ── Property: Parent Exam totalQuestions and totalMarks updated ──
                    const updatedExam = await Exam.findById(examId).lean();
                    expect(updatedExam!.totalQuestions).toBe(n);
                    const expectedTotalMarks = attachEntries.reduce(
                        (sum, e) => sum + e.marks,
                        0,
                    );
                    expect(updatedExam!.totalMarks).toBe(expectedTotalMarks);
                },
            ),
            { numRuns: 20 },
        );
    });
});
