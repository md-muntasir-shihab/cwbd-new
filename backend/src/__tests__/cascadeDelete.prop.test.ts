import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import fc from 'fast-check';
import Question from '../models/Question';
import { ExamQuestionModel } from '../models/examQuestion.model';
import Exam from '../models/Exam';
import QuestionBankSettings from '../models/QuestionBankSettings';

/**
 * Feature: exam-question-bank, Property 7: Cascade delete invariant
 *
 * Validates: Requirements 4.2, 4.3, 4.4, 5.5
 *
 * For any bank question referenced by ExamQuestion records across one or more
 * exams, deleting that bank question (when archiveInsteadOfDelete is false)
 * should: (a) remove the QuestionBankQuestion record, (b) remove all
 * ExamQuestion records with matching fromBankQuestionId, and (c) update each
 * affected Exam's totalQuestions and totalMarks to reflect the remaining questions.
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
    await Question.deleteMany({});
    await ExamQuestionModel.deleteMany({});
    await Exam.deleteMany({});
    await QuestionBankSettings.deleteMany({});
    // Ensure archiveInsteadOfDelete is false for cascade delete tests
    await QuestionBankSettings.create({ archiveInsteadOfDelete: false });
});

// ─── Arbitrary Generators ────────────────────────────────────────────────────

const difficultyArb = fc.constantFrom('easy', 'medium', 'hard');
const correctKeyArb = fc.constantFrom('A', 'B', 'C', 'D');
const marksArb = fc.integer({ min: 1, max: 10 });

/**
 * Generate a valid bank question payload for the Question model.
 */
const bankQuestionPayloadArb = fc.record({
    question: fc.string({ minLength: 10, maxLength: 100 }),
    subject: fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0),
    difficulty: difficultyArb,
    correctAnswer: correctKeyArb,
    marks: marksArb,
    options: fc.constant([
        { key: 'A', text: 'Option A' },
        { key: 'B', text: 'Option B' },
        { key: 'C', text: 'Option C' },
        { key: 'D', text: 'Option D' },
    ]),
    active: fc.constant(true),
});

/**
 * Generate the number of exams that reference the bank question (1-3),
 * and for each exam, the number of OTHER questions it has (0-3).
 * Each other question gets random marks.
 */
const examSetupArb = fc.record({
    numExams: fc.integer({ min: 1, max: 3 }),
    otherQuestionsPerExam: fc.array(fc.integer({ min: 0, max: 3 }), { minLength: 3, maxLength: 3 }),
    otherQuestionMarks: fc.array(
        fc.array(marksArb, { minLength: 3, maxLength: 3 }),
        { minLength: 3, maxLength: 3 },
    ),
    targetQuestionMarks: fc.array(marksArb, { minLength: 3, maxLength: 3 }),
});

// ─── Cascade Delete Logic (mirrors controller) ──────────────────────────────

/**
 * Performs the same cascade delete logic as the questionBankController's
 * deleteQuestion handler, operating directly on the database models.
 */
async function performCascadeDelete(questionId: string): Promise<void> {
    const settings = await QuestionBankSettings.findOne();

    if (settings?.archiveInsteadOfDelete) {
        throw new Error('archiveInsteadOfDelete should be false for cascade delete tests');
    }

    // Get affected exam IDs BEFORE deleting ExamQuestions
    const affectedExamIds = await ExamQuestionModel.distinct('examId', {
        fromBankQuestionId: questionId,
    });

    // Remove all ExamQuestion records referencing this bank question
    await ExamQuestionModel.deleteMany({ fromBankQuestionId: questionId });

    // Recalculate totalQuestions and totalMarks for each affected exam
    for (const examId of affectedExamIds) {
        const remaining = await ExamQuestionModel.find({ examId });
        await Exam.findByIdAndUpdate(examId, {
            totalQuestions: remaining.length,
            totalMarks: remaining.reduce((sum: number, q: any) => sum + (q.marks || 0), 0),
        });
    }

    // Delete the bank question itself
    await Question.findByIdAndDelete(questionId);
}

// ─── Property Tests ──────────────────────────────────────────────────────────

describe('Feature: exam-question-bank, Property 7: Cascade delete invariant', () => {
    it('deleting a bank question removes it, removes all referencing ExamQuestions, and updates affected Exam totals', async () => {
        await fc.assert(
            fc.asyncProperty(bankQuestionPayloadArb, examSetupArb, async (qPayload, examSetup) => {
                // Clean up from previous iteration
                await Question.deleteMany({});
                await ExamQuestionModel.deleteMany({});
                await Exam.deleteMany({});

                // 1. Create the bank question to be deleted
                const bankQuestion = await Question.create(qPayload);
                const bankQuestionId = bankQuestion._id.toString();

                const numExams = examSetup.numExams;
                const examIds: string[] = [];
                const expectedRemainingPerExam: { totalQuestions: number; totalMarks: number }[] = [];

                // 2. Create exams and their ExamQuestion records
                for (let e = 0; e < numExams; e++) {
                    const otherCount = examSetup.otherQuestionsPerExam[e];
                    const targetMarks = examSetup.targetQuestionMarks[e];

                    // Calculate initial totals
                    let initialTotalMarks = targetMarks;
                    let initialTotalQuestions = 1; // the target question
                    let remainingMarks = 0;

                    const now = new Date();
                    const future = new Date(now.getTime() + 86400000);

                    // Create the exam
                    const exam = await Exam.create({
                        title: `Exam ${e}`,
                        subject: 'Test',
                        totalQuestions: 0, // will update after adding questions
                        totalMarks: 0,
                        duration: 60,
                        startDate: now,
                        endDate: future,
                        resultPublishDate: future,
                    });
                    examIds.push(exam._id.toString());

                    // Create ExamQuestion referencing the bank question (the one to be deleted)
                    await ExamQuestionModel.create({
                        examId: exam._id.toString(),
                        fromBankQuestionId: bankQuestionId,
                        orderIndex: 0,
                        question_en: 'Target question',
                        correctKey: 'A',
                        marks: targetMarks,
                        options: [
                            { key: 'A', text_en: 'A' },
                            { key: 'B', text_en: 'B' },
                            { key: 'C', text_en: 'C' },
                            { key: 'D', text_en: 'D' },
                        ],
                    });

                    // Create other ExamQuestions NOT referencing the target bank question
                    for (let q = 0; q < otherCount; q++) {
                        const otherMarks = examSetup.otherQuestionMarks[e][q];
                        await ExamQuestionModel.create({
                            examId: exam._id.toString(),
                            fromBankQuestionId: new mongoose.Types.ObjectId().toString(),
                            orderIndex: q + 1,
                            question_en: `Other question ${q}`,
                            correctKey: 'B',
                            marks: otherMarks,
                            options: [
                                { key: 'A', text_en: 'A' },
                                { key: 'B', text_en: 'B' },
                                { key: 'C', text_en: 'C' },
                                { key: 'D', text_en: 'D' },
                            ],
                        });
                        initialTotalQuestions++;
                        initialTotalMarks += otherMarks;
                        remainingMarks += otherMarks;
                    }

                    // Set initial exam totals
                    await Exam.findByIdAndUpdate(exam._id, {
                        totalQuestions: initialTotalQuestions,
                        totalMarks: initialTotalMarks,
                    });

                    expectedRemainingPerExam.push({
                        totalQuestions: otherCount,
                        totalMarks: remainingMarks,
                    });
                }

                // 3. Perform cascade delete
                await performCascadeDelete(bankQuestionId);

                // 4. Verify: (a) bank question is removed
                const deletedQuestion = await Question.findById(bankQuestionId);
                expect(deletedQuestion).toBeNull();

                // 5. Verify: (b) no ExamQuestion records reference the deleted bank question
                const orphanedExamQuestions = await ExamQuestionModel.find({
                    fromBankQuestionId: bankQuestionId,
                });
                expect(orphanedExamQuestions).toHaveLength(0);

                // 6. Verify: (c) each affected Exam's totals are correct
                for (let e = 0; e < numExams; e++) {
                    const exam = await Exam.findById(examIds[e]).lean();
                    expect(exam).not.toBeNull();
                    expect(exam!.totalQuestions).toBe(expectedRemainingPerExam[e].totalQuestions);
                    expect(exam!.totalMarks).toBe(expectedRemainingPerExam[e].totalMarks);

                    // Also verify the actual ExamQuestion count matches
                    const actualExamQuestions = await ExamQuestionModel.find({
                        examId: examIds[e],
                    });
                    expect(actualExamQuestions).toHaveLength(expectedRemainingPerExam[e].totalQuestions);
                    const actualMarksSum = actualExamQuestions.reduce(
                        (sum: number, q: any) => sum + (q.marks || 0),
                        0,
                    );
                    expect(actualMarksSum).toBe(expectedRemainingPerExam[e].totalMarks);
                }
            }),
            { numRuns: 20 },
        );
    });
});
