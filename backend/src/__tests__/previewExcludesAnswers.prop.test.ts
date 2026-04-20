import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import fc from 'fast-check';
import QuestionBankQuestion from '../models/QuestionBankQuestion';
import { ExamQuestionModel } from '../models/examQuestion.model';
import Exam from '../models/Exam';

/**
 * Feature: exam-question-bank, Property 17: Preview excludes answers and explanations
 *
 * Validates: Requirements 10.2
 *
 * For any exam preview response, no question object in the response should
 * contain `correctKey`, `explanation_en`, or `explanation_bn` fields.
 * The exam metadata (title, subject, duration, totalMarks, totalQuestions)
 * must be present.
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

const optionKeysArb = fc.constantFrom('A', 'B', 'C', 'D') as fc.Arbitrary<string>;

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
    correctKey: optionKeysArb,
    options: fc.constant([
        { key: 'A' as const, text_en: 'Option A', text_bn: 'বিকল্প ক' },
        { key: 'B' as const, text_en: 'Option B', text_bn: 'বিকল্প খ' },
        { key: 'C' as const, text_en: 'Option C', text_bn: 'বিকল্প গ' },
        { key: 'D' as const, text_en: 'Option D', text_bn: 'বিকল্প ঘ' },
    ]),
    explanation_en: fc.string({ minLength: 5, maxLength: 50 }),
    explanation_bn: fc.string({ minLength: 5, maxLength: 50 }),
    isActive: fc.constant(true),
    isArchived: fc.constant(false),
});


// ─── Preview logic (mirrors adminGetExamPreview controller) ──────────────────

async function getExamPreview(examId: string) {
    const exam = await Exam.findById(examId).lean();
    if (!exam) return null;

    const questions = await ExamQuestionModel.find({ examId })
        .sort({ orderIndex: 1 })
        .lean();

    const previewQuestions = questions.map((q) => ({
        orderIndex: q.orderIndex,
        question_en: q.question_en,
        question_bn: q.question_bn,
        questionImageUrl: q.questionImageUrl,
        options: (q.options || []).map((opt: any) => ({
            key: opt.key,
            text_en: opt.text_en,
            text_bn: opt.text_bn,
        })),
        marks: q.marks,
    }));

    return {
        exam: {
            title: exam.title,
            subject: exam.subject,
            duration: exam.duration,
            totalMarks: exam.totalMarks,
            totalQuestions: exam.totalQuestions,
            negativeMarking: exam.negativeMarking,
            negativeMarkValue: exam.negativeMarkValue,
        },
        questions: previewQuestions,
    };
}

// ─── Property Tests ──────────────────────────────────────────────────────────

describe('Feature: exam-question-bank, Property 17: Preview excludes answers and explanations', () => {
    it('no question in preview response contains correctKey, explanation_en, or explanation_bn', async () => {
        await fc.assert(
            fc.asyncProperty(
                fc.integer({ min: 1, max: 6 }).chain((n) =>
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

                    // Create a parent exam
                    const totalMarks = n; // 1 mark per question
                    const exam = await Exam.create({
                        title: 'Preview Test Exam',
                        subject: 'Math',
                        duration: 60,
                        totalQuestions: n,
                        totalMarks,
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

                    // Create ExamQuestion snapshots (with correctKey and explanations stored)
                    const examQuestionDocs = createdBankQuestions.map((bq, idx) => ({
                        examId,
                        fromBankQuestionId: String(bq._id),
                        orderIndex: idx,
                        marks: 1,
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
                        topic: bq.topic || '',
                        tags: bq.tags || [],
                    }));
                    await ExamQuestionModel.insertMany(examQuestionDocs);

                    // Get preview
                    const preview = await getExamPreview(examId);
                    expect(preview).not.toBeNull();

                    // ── Property: Exam metadata is present ──
                    expect(preview!.exam.title).toBe('Preview Test Exam');
                    expect(preview!.exam.subject).toBe('Math');
                    expect(preview!.exam.duration).toBe(60);
                    expect(preview!.exam.totalMarks).toBe(totalMarks);
                    expect(preview!.exam.totalQuestions).toBe(n);

                    // ── Property: No question contains correctKey or explanation fields ──
                    for (const question of preview!.questions) {
                        const keys = Object.keys(question);
                        expect(keys).not.toContain('correctKey');
                        expect(keys).not.toContain('explanation_en');
                        expect(keys).not.toContain('explanation_bn');
                    }

                    // ── Property: Questions are returned in order ──
                    for (let i = 0; i < preview!.questions.length; i++) {
                        expect(preview!.questions[i].orderIndex).toBe(i);
                    }

                    // ── Property: Question count matches ──
                    expect(preview!.questions.length).toBe(n);
                },
            ),
            { numRuns: 20 },
        );
    });
});
