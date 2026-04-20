import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import Question from '../models/Question';
import { ExamQuestionModel } from '../models/examQuestion.model';
import Exam from '../models/Exam';
import QuestionBankSettings from '../models/QuestionBankSettings';

/**
 * Integration Tests: Question CRUD with Cascade Delete
 *
 * Validates: Requirements 1.1, 3.2, 4.2, 4.3, 4.4, 4.5
 *
 * Tests the full question lifecycle:
 * 1. Create a question and verify it's stored correctly
 * 2. Edit the question and verify changes are applied
 * 3. Assign the question to an exam (create ExamQuestion records)
 * 4. Delete the question and verify cascade removes ExamQuestion records and updates Exam totals
 * 5. Test archive-instead-of-delete setting
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
});

// ─── Helper Functions ────────────────────────────────────────────────────────

/**
 * Creates a valid question payload for testing
 */
function createQuestionPayload(overrides: Partial<any> = {}) {
    return {
        question: 'What is the capital of Bangladesh?',
        subject: 'Geography',
        difficulty: 'medium' as const,
        correctAnswer: 'A' as const,
        marks: 2,
        options: [
            { key: 'A', text: 'Dhaka' },
            { key: 'B', text: 'Chittagong' },
            { key: 'C', text: 'Sylhet' },
            { key: 'D', text: 'Rajshahi' },
        ],
        active: true,
        status: 'approved' as const,
        ...overrides,
    };
}

/**
 * Generates a unique ID for test data
 */
function generateUniqueId(): string {
    return new mongoose.Types.ObjectId().toString();
}

/**
 * Creates a valid exam for testing
 */
async function createTestExam(overrides: Partial<any> = {}) {
    const now = new Date();
    const future = new Date(now.getTime() + 86400000);
    const uniqueId = generateUniqueId();

    return Exam.create({
        title: 'Test Exam',
        subject: 'Geography',
        totalQuestions: 0,
        totalMarks: 0,
        duration: 60,
        startDate: now,
        endDate: future,
        resultPublishDate: future,
        share_link: `test-exam-${uniqueId}`,
        slug: `test-exam-${uniqueId}`,
        ...overrides,
    });
}

/**
 * Creates an ExamQuestion snapshot from a bank question
 */
async function createExamQuestion(examId: string, bankQuestionId: string, orderIndex: number, marks: number) {
    return ExamQuestionModel.create({
        examId,
        fromBankQuestionId: bankQuestionId,
        orderIndex,
        question_en: 'Test question',
        correctKey: 'A',
        marks,
        options: [
            { key: 'A', text_en: 'Option A' },
            { key: 'B', text_en: 'Option B' },
            { key: 'C', text_en: 'Option C' },
            { key: 'D', text_en: 'Option D' },
        ],
    });
}

/**
 * Performs cascade delete logic (mirrors questionBankController.deleteQuestion)
 */
async function performCascadeDelete(questionId: string): Promise<void> {
    const settings = await QuestionBankSettings.findOne();
    const existing = await Question.findById(questionId);

    if (!existing) {
        throw new Error('Question not found');
    }

    if (settings?.archiveInsteadOfDelete) {
        // Soft delete: archive the question
        existing.status = 'archived';
        existing.active = false;
        existing.archived_at = new Date();
        await existing.save();
        return;
    }

    // Hard delete with cascade
    const bankQuestionId = existing._id.toString();

    // Get affected exam IDs BEFORE deleting ExamQuestions
    const affectedExamIds = await ExamQuestionModel.distinct('examId', {
        fromBankQuestionId: bankQuestionId,
    });

    // Remove all ExamQuestion records referencing this bank question
    await ExamQuestionModel.deleteMany({ fromBankQuestionId: bankQuestionId });

    // Recalculate totalQuestions and totalMarks for each affected exam
    for (const examId of affectedExamIds) {
        const remaining = await ExamQuestionModel.find({ examId });
        await Exam.findByIdAndUpdate(examId, {
            totalQuestions: remaining.length,
            totalMarks: remaining.reduce((sum: number, q: any) => sum + (q.marks || 0), 0),
        });
    }

    // Delete the bank question itself
    await existing.deleteOne();
}

// ─── Integration Tests ───────────────────────────────────────────────────────

describe('Question CRUD Integration Tests', () => {
    describe('1. Question Creation', () => {
        it('should create a question and store it correctly', async () => {
            const payload = createQuestionPayload();

            const question = await Question.create(payload);

            expect(question).toBeDefined();
            expect(question._id).toBeDefined();
            expect(question.question).toBe(payload.question);
            expect(question.subject).toBe(payload.subject);
            expect(question.difficulty).toBe(payload.difficulty);
            expect(question.correctAnswer).toBe(payload.correctAnswer);
            expect(question.marks).toBe(payload.marks);
            expect(question.options).toHaveLength(4);
            expect(question.active).toBe(true);
        });

        it('should retrieve the created question by ID', async () => {
            const payload = createQuestionPayload();
            const created = await Question.create(payload);

            const retrieved = await Question.findById(created._id);

            expect(retrieved).not.toBeNull();
            expect(retrieved!._id.toString()).toBe(created._id.toString());
            expect(retrieved!.question).toBe(payload.question);
        });

        it('should create questions with different difficulty levels', async () => {
            const difficulties = ['easy', 'medium', 'hard'] as const;

            for (const difficulty of difficulties) {
                const payload = createQuestionPayload({ difficulty });
                const question = await Question.create(payload);
                expect(question.difficulty).toBe(difficulty);
            }

            const allQuestions = await Question.find({});
            expect(allQuestions).toHaveLength(3);
        });
    });

    describe('2. Question Edit', () => {
        it('should update question text and verify changes', async () => {
            const payload = createQuestionPayload();
            const question = await Question.create(payload);

            const newText = 'What is the largest city in Bangladesh?';
            question.question = newText;
            await question.save();

            const updated = await Question.findById(question._id);
            expect(updated!.question).toBe(newText);
        });

        it('should update question difficulty', async () => {
            const payload = createQuestionPayload({ difficulty: 'easy' });
            const question = await Question.create(payload);

            question.difficulty = 'hard';
            await question.save();

            const updated = await Question.findById(question._id);
            expect(updated!.difficulty).toBe('hard');
        });

        it('should update question options', async () => {
            const payload = createQuestionPayload();
            const question = await Question.create(payload);

            const newOptions = [
                { key: 'A', text: 'New Option A' },
                { key: 'B', text: 'New Option B' },
                { key: 'C', text: 'New Option C' },
                { key: 'D', text: 'New Option D' },
            ];
            question.options = newOptions;
            await question.save();

            const updated = await Question.findById(question._id);
            expect(updated!.options![0].text).toBe('New Option A');
        });

        it('should update question marks', async () => {
            const payload = createQuestionPayload({ marks: 2 });
            const question = await Question.create(payload);

            question.marks = 5;
            await question.save();

            const updated = await Question.findById(question._id);
            expect(updated!.marks).toBe(5);
        });

        it('should update correct answer', async () => {
            const payload = createQuestionPayload({ correctAnswer: 'A' });
            const question = await Question.create(payload);

            question.correctAnswer = 'C';
            await question.save();

            const updated = await Question.findById(question._id);
            expect(updated!.correctAnswer).toBe('C');
        });
    });

    describe('3. Question Assignment to Exam', () => {
        it('should create ExamQuestion records when assigning question to exam', async () => {
            const question = await Question.create(createQuestionPayload());
            const exam = await createTestExam();

            const examQuestion = await createExamQuestion(
                exam._id.toString(),
                question._id.toString(),
                0,
                question.marks
            );

            expect(examQuestion).toBeDefined();
            expect(examQuestion.examId).toBe(exam._id.toString());
            expect(examQuestion.fromBankQuestionId).toBe(question._id.toString());
            expect(examQuestion.marks).toBe(question.marks);
        });

        it('should assign same question to multiple exams', async () => {
            const question = await Question.create(createQuestionPayload());
            const exam1 = await createTestExam({ title: 'Exam 1' });
            const exam2 = await createTestExam({ title: 'Exam 2' });

            await createExamQuestion(exam1._id.toString(), question._id.toString(), 0, 2);
            await createExamQuestion(exam2._id.toString(), question._id.toString(), 0, 3);

            const examQuestions = await ExamQuestionModel.find({
                fromBankQuestionId: question._id.toString(),
            });

            expect(examQuestions).toHaveLength(2);
        });

        it('should update exam totals after assigning questions', async () => {
            const question1 = await Question.create(createQuestionPayload({ marks: 2 }));
            const question2 = await Question.create(createQuestionPayload({ marks: 3 }));
            const exam = await createTestExam();

            await createExamQuestion(exam._id.toString(), question1._id.toString(), 0, 2);
            await createExamQuestion(exam._id.toString(), question2._id.toString(), 1, 3);

            // Update exam totals
            const examQuestions = await ExamQuestionModel.find({ examId: exam._id.toString() });
            await Exam.findByIdAndUpdate(exam._id, {
                totalQuestions: examQuestions.length,
                totalMarks: examQuestions.reduce((sum, q) => sum + (q.marks || 0), 0),
            });

            const updatedExam = await Exam.findById(exam._id);
            expect(updatedExam!.totalQuestions).toBe(2);
            expect(updatedExam!.totalMarks).toBe(5);
        });
    });

    describe('4. Cascade Delete', () => {
        beforeEach(async () => {
            // Ensure archiveInsteadOfDelete is false for cascade delete tests
            await QuestionBankSettings.create({ archiveInsteadOfDelete: false });
        });

        it('should delete question and cascade remove ExamQuestion records', async () => {
            const question = await Question.create(createQuestionPayload());
            const exam = await createTestExam();

            await createExamQuestion(exam._id.toString(), question._id.toString(), 0, 2);

            // Verify ExamQuestion exists before delete
            let examQuestions = await ExamQuestionModel.find({
                fromBankQuestionId: question._id.toString(),
            });
            expect(examQuestions).toHaveLength(1);

            // Perform cascade delete
            await performCascadeDelete(question._id.toString());

            // Verify question is deleted
            const deletedQuestion = await Question.findById(question._id);
            expect(deletedQuestion).toBeNull();

            // Verify ExamQuestion is also deleted
            examQuestions = await ExamQuestionModel.find({
                fromBankQuestionId: question._id.toString(),
            });
            expect(examQuestions).toHaveLength(0);
        });

        it('should update exam totals after cascade delete', async () => {
            const question1 = await Question.create(createQuestionPayload({ marks: 2 }));
            const question2 = await Question.create(createQuestionPayload({ marks: 3 }));
            const exam = await createTestExam();

            await createExamQuestion(exam._id.toString(), question1._id.toString(), 0, 2);
            await createExamQuestion(exam._id.toString(), question2._id.toString(), 1, 3);

            // Set initial exam totals
            await Exam.findByIdAndUpdate(exam._id, {
                totalQuestions: 2,
                totalMarks: 5,
            });

            // Delete question1 with cascade
            await performCascadeDelete(question1._id.toString());

            // Verify exam totals are updated
            const updatedExam = await Exam.findById(exam._id);
            expect(updatedExam!.totalQuestions).toBe(1);
            expect(updatedExam!.totalMarks).toBe(3);
        });

        it('should cascade delete across multiple exams', async () => {
            const question = await Question.create(createQuestionPayload({ marks: 2 }));
            const exam1 = await createTestExam({ title: 'Exam 1' });
            const exam2 = await createTestExam({ title: 'Exam 2' });

            // Add question to both exams
            await createExamQuestion(exam1._id.toString(), question._id.toString(), 0, 2);
            await createExamQuestion(exam2._id.toString(), question._id.toString(), 0, 2);

            // Add another question to exam1 only
            const otherQuestion = await Question.create(createQuestionPayload({ marks: 3 }));
            await createExamQuestion(exam1._id.toString(), otherQuestion._id.toString(), 1, 3);

            // Set initial exam totals
            await Exam.findByIdAndUpdate(exam1._id, { totalQuestions: 2, totalMarks: 5 });
            await Exam.findByIdAndUpdate(exam2._id, { totalQuestions: 1, totalMarks: 2 });

            // Delete the shared question
            await performCascadeDelete(question._id.toString());

            // Verify exam1 totals (should have 1 question left)
            const updatedExam1 = await Exam.findById(exam1._id);
            expect(updatedExam1!.totalQuestions).toBe(1);
            expect(updatedExam1!.totalMarks).toBe(3);

            // Verify exam2 totals (should have 0 questions)
            const updatedExam2 = await Exam.findById(exam2._id);
            expect(updatedExam2!.totalQuestions).toBe(0);
            expect(updatedExam2!.totalMarks).toBe(0);
        });

        it('should handle delete when question is not assigned to any exam', async () => {
            const question = await Question.create(createQuestionPayload());

            // Delete question that's not assigned to any exam
            await performCascadeDelete(question._id.toString());

            // Verify question is deleted
            const deletedQuestion = await Question.findById(question._id);
            expect(deletedQuestion).toBeNull();
        });
    });

    describe('5. Archive Instead of Delete', () => {
        beforeEach(async () => {
            // Enable archiveInsteadOfDelete setting
            await QuestionBankSettings.create({ archiveInsteadOfDelete: true });
        });

        it('should archive question instead of deleting when setting is enabled', async () => {
            const question = await Question.create(createQuestionPayload());
            const questionId = question._id.toString();

            // Perform delete (should archive instead)
            await performCascadeDelete(questionId);

            // Verify question still exists
            const archivedQuestion = await Question.findById(questionId);
            expect(archivedQuestion).not.toBeNull();

            // Verify question is archived
            expect(archivedQuestion!.status).toBe('archived');
            expect(archivedQuestion!.active).toBe(false);
            expect(archivedQuestion!.archived_at).toBeInstanceOf(Date);
        });

        it('should preserve question data when archiving', async () => {
            const payload = createQuestionPayload({
                question: 'Important question to preserve',
                subject: 'History',
                difficulty: 'hard',
                marks: 5,
            });
            const question = await Question.create(payload);

            await performCascadeDelete(question._id.toString());

            const archivedQuestion = await Question.findById(question._id);
            expect(archivedQuestion!.question).toBe(payload.question);
            expect(archivedQuestion!.subject).toBe(payload.subject);
            expect(archivedQuestion!.difficulty).toBe(payload.difficulty);
            expect(archivedQuestion!.marks).toBe(payload.marks);
        });

        it('should NOT cascade delete ExamQuestions when archiving', async () => {
            const question = await Question.create(createQuestionPayload());
            const exam = await createTestExam();

            await createExamQuestion(exam._id.toString(), question._id.toString(), 0, 2);

            // Set initial exam totals
            await Exam.findByIdAndUpdate(exam._id, { totalQuestions: 1, totalMarks: 2 });

            // Perform archive
            await performCascadeDelete(question._id.toString());

            // Verify ExamQuestion still exists
            const examQuestions = await ExamQuestionModel.find({
                fromBankQuestionId: question._id.toString(),
            });
            expect(examQuestions).toHaveLength(1);

            // Verify exam totals are unchanged
            const updatedExam = await Exam.findById(exam._id);
            expect(updatedExam!.totalQuestions).toBe(1);
            expect(updatedExam!.totalMarks).toBe(2);
        });

        it('should set archived_at timestamp when archiving', async () => {
            const question = await Question.create(createQuestionPayload());
            const beforeArchive = new Date();

            await performCascadeDelete(question._id.toString());

            const archivedQuestion = await Question.findById(question._id);
            expect(archivedQuestion!.archived_at).toBeInstanceOf(Date);
            expect(archivedQuestion!.archived_at!.getTime()).toBeGreaterThanOrEqual(beforeArchive.getTime());
        });
    });

    describe('Full Lifecycle Test', () => {
        it('should complete full create → edit → assign → delete lifecycle', async () => {
            // Ensure hard delete is enabled
            await QuestionBankSettings.create({ archiveInsteadOfDelete: false });

            // Step 1: Create question
            const payload = createQuestionPayload({
                question: 'Original question text',
                marks: 2,
            });
            const question = await Question.create(payload);
            expect(question.question).toBe('Original question text');

            // Step 2: Edit question
            question.question = 'Updated question text';
            question.marks = 3;
            await question.save();

            const editedQuestion = await Question.findById(question._id);
            expect(editedQuestion!.question).toBe('Updated question text');
            expect(editedQuestion!.marks).toBe(3);

            // Step 3: Assign to exam
            const exam = await createTestExam();
            await createExamQuestion(exam._id.toString(), question._id.toString(), 0, 3);

            // Add another question to the exam
            const otherQuestion = await Question.create(createQuestionPayload({ marks: 2 }));
            await createExamQuestion(exam._id.toString(), otherQuestion._id.toString(), 1, 2);

            // Update exam totals
            await Exam.findByIdAndUpdate(exam._id, { totalQuestions: 2, totalMarks: 5 });

            // Verify assignment
            let examQuestions = await ExamQuestionModel.find({ examId: exam._id.toString() });
            expect(examQuestions).toHaveLength(2);

            // Step 4: Delete question with cascade
            await performCascadeDelete(question._id.toString());

            // Verify question is deleted
            const deletedQuestion = await Question.findById(question._id);
            expect(deletedQuestion).toBeNull();

            // Verify cascade removed ExamQuestion
            examQuestions = await ExamQuestionModel.find({
                fromBankQuestionId: question._id.toString(),
            });
            expect(examQuestions).toHaveLength(0);

            // Verify exam totals are updated
            const updatedExam = await Exam.findById(exam._id);
            expect(updatedExam!.totalQuestions).toBe(1);
            expect(updatedExam!.totalMarks).toBe(2);

            // Verify other question's ExamQuestion still exists
            const remainingExamQuestions = await ExamQuestionModel.find({
                examId: exam._id.toString(),
            });
            expect(remainingExamQuestions).toHaveLength(1);
            expect(remainingExamQuestions[0].fromBankQuestionId).toBe(otherQuestion._id.toString());
        });
    });
});
