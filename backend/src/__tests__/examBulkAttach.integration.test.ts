import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import QuestionBankQuestion from '../models/QuestionBankQuestion';
import { ExamQuestionModel } from '../models/examQuestion.model';
import Exam from '../models/Exam';

/**
 * Integration Tests: Exam Creation with Bulk-Attach Flow
 *
 * Validates: Requirements 8.1, 8.11
 *
 * Tests the exam creation and bulk-attach workflow:
 * 1. Create an exam with metadata (title, subject, duration, totalMarks)
 * 2. Bulk-attach questions from the question bank to the exam
 * 3. Verify ExamQuestion snapshots are created correctly with proper fromBankQuestionId references
 * 4. Verify Exam totals (totalQuestions, totalMarks) are updated correctly after bulk-attach
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

// ─── Helper Functions ────────────────────────────────────────────────────────

/**
 * Creates a valid bank question payload for testing
 */
function createBankQuestionPayload(overrides: Partial<any> = {}) {
    return {
        subject: 'Mathematics',
        moduleCategory: 'Algebra',
        topic: 'Linear Equations',
        difficulty: 'medium' as const,
        question_en: 'What is the value of x in 2x + 4 = 10?',
        question_bn: 'x এর মান কত যদি 2x + 4 = 10?',
        options: [
            { key: 'A', text_en: '2', text_bn: '২' },
            { key: 'B', text_en: '3', text_bn: '৩' },
            { key: 'C', text_en: '4', text_bn: '৪' },
            { key: 'D', text_en: '5', text_bn: '৫' },
        ],
        correctKey: 'B' as const,
        explanation_en: 'Solving: 2x = 10 - 4 = 6, so x = 3',
        explanation_bn: 'সমাধান: 2x = 10 - 4 = 6, তাই x = 3',
        marks: 2,
        negativeMarks: 0.5,
        isActive: true,
        isArchived: false,
        tags: ['algebra', 'linear-equations'],
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
        subject: 'Mathematics',
        totalQuestions: 0,
        totalMarks: 0,
        duration: 60,
        startDate: now,
        endDate: future,
        resultPublishDate: future,
        share_link: `test-exam-${uniqueId}`,
        slug: `test-exam-${uniqueId}`,
        showAnswersAfterExam: false,
        negativeMarking: false,
        negativeMarkValue: 0.25,
        status: 'draft',
        ...overrides,
    });
}

/**
 * Creates multiple bank questions for testing
 */
async function createMultipleBankQuestions(count: number, baseOverrides: Partial<any> = {}) {
    const questions = [];
    for (let i = 0; i < count; i++) {
        const payload = createBankQuestionPayload({
            question_en: `Test question ${i + 1}: What is ${i + 1} + ${i + 1}?`,
            question_bn: `পরীক্ষার প্রশ্ন ${i + 1}: ${i + 1} + ${i + 1} কত?`,
            marks: i + 1,
            difficulty: ['easy', 'medium', 'hard'][i % 3] as 'easy' | 'medium' | 'hard',
            ...baseOverrides,
        });
        const question = await QuestionBankQuestion.create(payload);
        questions.push(question);
    }
    return questions;
}

/**
 * Performs bulk-attach logic (mirrors adminExamController.adminBulkAttachQuestions)
 */
async function performBulkAttach(
    examId: string,
    questions: Array<{ bankQuestionId: string; marks: number; orderIndex: number }>
): Promise<{ attached: number; examQuestions: any[] }> {
    // Look up all bank questions
    const bankQuestionIds = questions.map(q => q.bankQuestionId);
    const bankQuestions = await QuestionBankQuestion.find({ _id: { $in: bankQuestionIds } }).lean();

    if (bankQuestions.length !== bankQuestionIds.length) {
        const foundIds = new Set(bankQuestions.map(bq => String(bq._id)));
        const missing = bankQuestionIds.filter(id => !foundIds.has(id));
        throw new Error(`Bank questions not found: ${missing.join(', ')}`);
    }

    // Build a lookup map
    const bankMap = new Map(bankQuestions.map(bq => [String(bq._id), bq]));

    // Create ExamQuestion snapshots
    const examQuestionDocs = questions.map(q => {
        const bq = bankMap.get(q.bankQuestionId)!;
        return {
            examId,
            fromBankQuestionId: q.bankQuestionId,
            orderIndex: q.orderIndex,
            marks: q.marks,
            question_en: bq.question_en || '',
            question_bn: bq.question_bn || '',
            questionImageUrl: bq.questionImageUrl || '',
            options: (bq.options || []).map((opt: any) => ({
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
    const totalMarks = allExamQuestions.reduce((sum, eq) => sum + (Number(eq.marks) || 0), 0);

    await Exam.findByIdAndUpdate(examId, { totalQuestions, totalMarks });

    return { attached: created.length, examQuestions: created };
}

// ─── Integration Tests ───────────────────────────────────────────────────────

describe('Exam Creation with Bulk-Attach Integration Tests', () => {
    describe('1. Exam Creation with Metadata', () => {
        it('should create an exam with required metadata fields', async () => {
            const exam = await createTestExam({
                title: 'Mathematics Final Exam',
                subject: 'Mathematics',
                duration: 90,
                totalMarks: 100,
            });

            expect(exam).toBeDefined();
            expect(exam._id).toBeDefined();
            expect(exam.title).toBe('Mathematics Final Exam');
            expect(exam.subject).toBe('Mathematics');
            expect(exam.duration).toBe(90);
            expect(exam.totalMarks).toBe(100);
        });

        it('should create an exam with showAnswersAfterExam option', async () => {
            const exam = await createTestExam({
                title: 'Practice Exam',
                showAnswersAfterExam: true,
            });

            expect(exam.showAnswersAfterExam).toBe(true);
        });

        it('should create an exam with negative marking settings', async () => {
            const exam = await createTestExam({
                title: 'Competitive Exam',
                negativeMarking: true,
                negativeMarkValue: 0.25,
            });

            expect(exam.negativeMarking).toBe(true);
            expect(exam.negativeMarkValue).toBe(0.25);
        });

        it('should create an exam with draft status by default', async () => {
            const exam = await createTestExam();

            expect(exam.status).toBe('draft');
            expect(exam.isPublished).toBe(false);
        });

        it('should retrieve the created exam by ID', async () => {
            const created = await createTestExam({ title: 'Retrievable Exam' });

            const retrieved = await Exam.findById(created._id);

            expect(retrieved).not.toBeNull();
            expect(retrieved!._id.toString()).toBe(created._id.toString());
            expect(retrieved!.title).toBe('Retrievable Exam');
        });
    });

    describe('2. Bulk-Attach Questions to Exam', () => {
        it('should bulk-attach questions from the question bank to an exam', async () => {
            const bankQuestions = await createMultipleBankQuestions(3);
            const exam = await createTestExam();

            const attachPayload = bankQuestions.map((bq, index) => ({
                bankQuestionId: bq._id.toString(),
                marks: bq.marks,
                orderIndex: index,
            }));

            const result = await performBulkAttach(exam._id.toString(), attachPayload);

            expect(result.attached).toBe(3);
            expect(result.examQuestions).toHaveLength(3);
        });

        it('should attach questions with custom marks different from bank question marks', async () => {
            const bankQuestions = await createMultipleBankQuestions(2);
            const exam = await createTestExam();

            const attachPayload = [
                { bankQuestionId: bankQuestions[0]._id.toString(), marks: 5, orderIndex: 0 },
                { bankQuestionId: bankQuestions[1]._id.toString(), marks: 10, orderIndex: 1 },
            ];

            const result = await performBulkAttach(exam._id.toString(), attachPayload);

            expect(result.examQuestions[0].marks).toBe(5);
            expect(result.examQuestions[1].marks).toBe(10);
        });

        it('should attach questions with specified order indices', async () => {
            const bankQuestions = await createMultipleBankQuestions(3);
            const exam = await createTestExam();

            // Attach in reverse order
            const attachPayload = [
                { bankQuestionId: bankQuestions[2]._id.toString(), marks: 3, orderIndex: 0 },
                { bankQuestionId: bankQuestions[1]._id.toString(), marks: 2, orderIndex: 1 },
                { bankQuestionId: bankQuestions[0]._id.toString(), marks: 1, orderIndex: 2 },
            ];

            const result = await performBulkAttach(exam._id.toString(), attachPayload);

            expect(result.examQuestions[0].orderIndex).toBe(0);
            expect(result.examQuestions[0].fromBankQuestionId).toBe(bankQuestions[2]._id.toString());
            expect(result.examQuestions[1].orderIndex).toBe(1);
            expect(result.examQuestions[2].orderIndex).toBe(2);
        });

        it('should throw error when attaching non-existent bank questions', async () => {
            const exam = await createTestExam();
            const fakeId = new mongoose.Types.ObjectId().toString();

            const attachPayload = [
                { bankQuestionId: fakeId, marks: 5, orderIndex: 0 },
            ];

            await expect(performBulkAttach(exam._id.toString(), attachPayload))
                .rejects.toThrow(/Bank questions not found/);
        });
    });

    describe('3. ExamQuestion Snapshot Verification', () => {
        it('should create ExamQuestion snapshots with correct fromBankQuestionId references', async () => {
            const bankQuestions = await createMultipleBankQuestions(2);
            const exam = await createTestExam();

            const attachPayload = bankQuestions.map((bq, index) => ({
                bankQuestionId: bq._id.toString(),
                marks: bq.marks,
                orderIndex: index,
            }));

            await performBulkAttach(exam._id.toString(), attachPayload);

            const examQuestions = await ExamQuestionModel.find({ examId: exam._id.toString() });

            expect(examQuestions).toHaveLength(2);
            expect(examQuestions[0].fromBankQuestionId).toBe(bankQuestions[0]._id.toString());
            expect(examQuestions[1].fromBankQuestionId).toBe(bankQuestions[1]._id.toString());
        });

        it('should copy question text (en/bn) to ExamQuestion snapshot', async () => {
            const bankQuestion = await QuestionBankQuestion.create(createBankQuestionPayload({
                question_en: 'English question text',
                question_bn: 'বাংলা প্রশ্ন টেক্সট',
            }));
            const exam = await createTestExam();

            await performBulkAttach(exam._id.toString(), [
                { bankQuestionId: bankQuestion._id.toString(), marks: 2, orderIndex: 0 },
            ]);

            const examQuestion = await ExamQuestionModel.findOne({ examId: exam._id.toString() });

            expect(examQuestion!.question_en).toBe('English question text');
            expect(examQuestion!.question_bn).toBe('বাংলা প্রশ্ন টেক্সট');
        });

        it('should copy options to ExamQuestion snapshot', async () => {
            const bankQuestion = await QuestionBankQuestion.create(createBankQuestionPayload());
            const exam = await createTestExam();

            await performBulkAttach(exam._id.toString(), [
                { bankQuestionId: bankQuestion._id.toString(), marks: 2, orderIndex: 0 },
            ]);

            const examQuestion = await ExamQuestionModel.findOne({ examId: exam._id.toString() });

            expect(examQuestion!.options).toHaveLength(4);
            expect(examQuestion!.options![0].key).toBe('A');
            expect(examQuestion!.options![0].text_en).toBe('2');
            expect(examQuestion!.options![0].text_bn).toBe('২');
        });

        it('should copy correctKey to ExamQuestion snapshot', async () => {
            const bankQuestion = await QuestionBankQuestion.create(createBankQuestionPayload({
                correctKey: 'C',
            }));
            const exam = await createTestExam();

            await performBulkAttach(exam._id.toString(), [
                { bankQuestionId: bankQuestion._id.toString(), marks: 2, orderIndex: 0 },
            ]);

            const examQuestion = await ExamQuestionModel.findOne({ examId: exam._id.toString() });

            expect(examQuestion!.correctKey).toBe('C');
        });

        it('should copy explanation (en/bn) to ExamQuestion snapshot', async () => {
            const bankQuestion = await QuestionBankQuestion.create(createBankQuestionPayload({
                explanation_en: 'English explanation',
                explanation_bn: 'বাংলা ব্যাখ্যা',
            }));
            const exam = await createTestExam();

            await performBulkAttach(exam._id.toString(), [
                { bankQuestionId: bankQuestion._id.toString(), marks: 2, orderIndex: 0 },
            ]);

            const examQuestion = await ExamQuestionModel.findOne({ examId: exam._id.toString() });

            expect(examQuestion!.explanation_en).toBe('English explanation');
            expect(examQuestion!.explanation_bn).toBe('বাংলা ব্যাখ্যা');
        });

        it('should copy difficulty and topic to ExamQuestion snapshot', async () => {
            const bankQuestion = await QuestionBankQuestion.create(createBankQuestionPayload({
                difficulty: 'hard',
                topic: 'Quadratic Equations',
            }));
            const exam = await createTestExam();

            await performBulkAttach(exam._id.toString(), [
                { bankQuestionId: bankQuestion._id.toString(), marks: 2, orderIndex: 0 },
            ]);

            const examQuestion = await ExamQuestionModel.findOne({ examId: exam._id.toString() });

            expect(examQuestion!.difficulty).toBe('hard');
            expect(examQuestion!.topic).toBe('Quadratic Equations');
        });

        it('should copy tags to ExamQuestion snapshot', async () => {
            const bankQuestion = await QuestionBankQuestion.create(createBankQuestionPayload({
                tags: ['math', 'algebra', 'important'],
            }));
            const exam = await createTestExam();

            await performBulkAttach(exam._id.toString(), [
                { bankQuestionId: bankQuestion._id.toString(), marks: 2, orderIndex: 0 },
            ]);

            const examQuestion = await ExamQuestionModel.findOne({ examId: exam._id.toString() });

            expect(examQuestion!.tags).toEqual(['math', 'algebra', 'important']);
        });

        it('should store examId correctly in ExamQuestion snapshot', async () => {
            const bankQuestion = await QuestionBankQuestion.create(createBankQuestionPayload());
            const exam = await createTestExam();

            await performBulkAttach(exam._id.toString(), [
                { bankQuestionId: bankQuestion._id.toString(), marks: 2, orderIndex: 0 },
            ]);

            const examQuestion = await ExamQuestionModel.findOne({ examId: exam._id.toString() });

            expect(examQuestion!.examId).toBe(exam._id.toString());
        });
    });

    describe('4. Exam Totals Update After Bulk-Attach', () => {
        it('should update exam totalQuestions after bulk-attach', async () => {
            const bankQuestions = await createMultipleBankQuestions(5);
            const exam = await createTestExam({ totalQuestions: 0 });

            const attachPayload = bankQuestions.map((bq, index) => ({
                bankQuestionId: bq._id.toString(),
                marks: 2,
                orderIndex: index,
            }));

            await performBulkAttach(exam._id.toString(), attachPayload);

            const updatedExam = await Exam.findById(exam._id);

            expect(updatedExam!.totalQuestions).toBe(5);
        });

        it('should update exam totalMarks after bulk-attach', async () => {
            const bankQuestions = await createMultipleBankQuestions(3);
            const exam = await createTestExam({ totalMarks: 0 });

            const attachPayload = [
                { bankQuestionId: bankQuestions[0]._id.toString(), marks: 5, orderIndex: 0 },
                { bankQuestionId: bankQuestions[1]._id.toString(), marks: 10, orderIndex: 1 },
                { bankQuestionId: bankQuestions[2]._id.toString(), marks: 15, orderIndex: 2 },
            ];

            await performBulkAttach(exam._id.toString(), attachPayload);

            const updatedExam = await Exam.findById(exam._id);

            expect(updatedExam!.totalMarks).toBe(30);
        });

        it('should correctly calculate totals with varying marks per question', async () => {
            const bankQuestions = await createMultipleBankQuestions(4);
            const exam = await createTestExam();

            const attachPayload = [
                { bankQuestionId: bankQuestions[0]._id.toString(), marks: 1, orderIndex: 0 },
                { bankQuestionId: bankQuestions[1]._id.toString(), marks: 2, orderIndex: 1 },
                { bankQuestionId: bankQuestions[2]._id.toString(), marks: 3, orderIndex: 2 },
                { bankQuestionId: bankQuestions[3]._id.toString(), marks: 4, orderIndex: 3 },
            ];

            await performBulkAttach(exam._id.toString(), attachPayload);

            const updatedExam = await Exam.findById(exam._id);

            expect(updatedExam!.totalQuestions).toBe(4);
            expect(updatedExam!.totalMarks).toBe(10); // 1 + 2 + 3 + 4
        });

        it('should accumulate totals when attaching questions in multiple batches', async () => {
            const bankQuestions = await createMultipleBankQuestions(6);
            const exam = await createTestExam();

            // First batch: 3 questions
            const firstBatch = [
                { bankQuestionId: bankQuestions[0]._id.toString(), marks: 2, orderIndex: 0 },
                { bankQuestionId: bankQuestions[1]._id.toString(), marks: 2, orderIndex: 1 },
                { bankQuestionId: bankQuestions[2]._id.toString(), marks: 2, orderIndex: 2 },
            ];
            await performBulkAttach(exam._id.toString(), firstBatch);

            let updatedExam = await Exam.findById(exam._id);
            expect(updatedExam!.totalQuestions).toBe(3);
            expect(updatedExam!.totalMarks).toBe(6);

            // Second batch: 3 more questions
            const secondBatch = [
                { bankQuestionId: bankQuestions[3]._id.toString(), marks: 3, orderIndex: 3 },
                { bankQuestionId: bankQuestions[4]._id.toString(), marks: 3, orderIndex: 4 },
                { bankQuestionId: bankQuestions[5]._id.toString(), marks: 3, orderIndex: 5 },
            ];
            await performBulkAttach(exam._id.toString(), secondBatch);

            updatedExam = await Exam.findById(exam._id);
            expect(updatedExam!.totalQuestions).toBe(6);
            expect(updatedExam!.totalMarks).toBe(15); // 6 + 9
        });

        it('should handle single question attachment correctly', async () => {
            const bankQuestion = await QuestionBankQuestion.create(createBankQuestionPayload());
            const exam = await createTestExam();

            await performBulkAttach(exam._id.toString(), [
                { bankQuestionId: bankQuestion._id.toString(), marks: 5, orderIndex: 0 },
            ]);

            const updatedExam = await Exam.findById(exam._id);

            expect(updatedExam!.totalQuestions).toBe(1);
            expect(updatedExam!.totalMarks).toBe(5);
        });
    });

    describe('5. Full Exam Create → Bulk-Attach Lifecycle', () => {
        it('should complete full exam creation and bulk-attach lifecycle', async () => {
            // Step 1: Create bank questions
            const bankQuestions = await createMultipleBankQuestions(5, {
                subject: 'Physics',
                moduleCategory: 'Mechanics',
            });

            // Step 2: Create exam with metadata
            const exam = await createTestExam({
                title: 'Physics Midterm Exam',
                subject: 'Physics',
                duration: 120,
                totalMarks: 0,
                totalQuestions: 0,
                negativeMarking: true,
                negativeMarkValue: 0.25,
                showAnswersAfterExam: true,
            });

            expect(exam.title).toBe('Physics Midterm Exam');
            expect(exam.duration).toBe(120);
            expect(exam.negativeMarking).toBe(true);
            expect(exam.showAnswersAfterExam).toBe(true);

            // Step 3: Bulk-attach questions
            const attachPayload = bankQuestions.map((bq, index) => ({
                bankQuestionId: bq._id.toString(),
                marks: (index + 1) * 2, // 2, 4, 6, 8, 10
                orderIndex: index,
            }));

            const result = await performBulkAttach(exam._id.toString(), attachPayload);

            expect(result.attached).toBe(5);

            // Step 4: Verify ExamQuestion snapshots
            const examQuestions = await ExamQuestionModel.find({ examId: exam._id.toString() })
                .sort({ orderIndex: 1 });

            expect(examQuestions).toHaveLength(5);

            for (let i = 0; i < 5; i++) {
                expect(examQuestions[i].fromBankQuestionId).toBe(bankQuestions[i]._id.toString());
                expect(examQuestions[i].orderIndex).toBe(i);
                expect(examQuestions[i].marks).toBe((i + 1) * 2);
                expect(examQuestions[i].examId).toBe(exam._id.toString());
            }

            // Step 5: Verify Exam totals
            const updatedExam = await Exam.findById(exam._id);

            expect(updatedExam!.totalQuestions).toBe(5);
            expect(updatedExam!.totalMarks).toBe(30); // 2 + 4 + 6 + 8 + 10
        });

        it('should maintain data integrity when same bank question is attached to multiple exams', async () => {
            const bankQuestion = await QuestionBankQuestion.create(createBankQuestionPayload({
                question_en: 'Shared question across exams',
            }));

            const exam1 = await createTestExam({ title: 'Exam 1' });
            const exam2 = await createTestExam({ title: 'Exam 2' });

            // Attach same question to both exams with different marks
            await performBulkAttach(exam1._id.toString(), [
                { bankQuestionId: bankQuestion._id.toString(), marks: 5, orderIndex: 0 },
            ]);

            await performBulkAttach(exam2._id.toString(), [
                { bankQuestionId: bankQuestion._id.toString(), marks: 10, orderIndex: 0 },
            ]);

            // Verify each exam has its own ExamQuestion snapshot
            const exam1Questions = await ExamQuestionModel.find({ examId: exam1._id.toString() });
            const exam2Questions = await ExamQuestionModel.find({ examId: exam2._id.toString() });

            expect(exam1Questions).toHaveLength(1);
            expect(exam2Questions).toHaveLength(1);

            // Verify marks are independent
            expect(exam1Questions[0].marks).toBe(5);
            expect(exam2Questions[0].marks).toBe(10);

            // Verify both reference the same bank question
            expect(exam1Questions[0].fromBankQuestionId).toBe(bankQuestion._id.toString());
            expect(exam2Questions[0].fromBankQuestionId).toBe(bankQuestion._id.toString());

            // Verify exam totals are independent
            const updatedExam1 = await Exam.findById(exam1._id);
            const updatedExam2 = await Exam.findById(exam2._id);

            expect(updatedExam1!.totalMarks).toBe(5);
            expect(updatedExam2!.totalMarks).toBe(10);
        });

        it('should handle questions with different difficulties in same exam', async () => {
            const easyQuestion = await QuestionBankQuestion.create(createBankQuestionPayload({
                difficulty: 'easy',
                question_en: 'Easy question',
            }));
            const mediumQuestion = await QuestionBankQuestion.create(createBankQuestionPayload({
                difficulty: 'medium',
                question_en: 'Medium question',
            }));
            const hardQuestion = await QuestionBankQuestion.create(createBankQuestionPayload({
                difficulty: 'hard',
                question_en: 'Hard question',
            }));

            const exam = await createTestExam();

            await performBulkAttach(exam._id.toString(), [
                { bankQuestionId: easyQuestion._id.toString(), marks: 1, orderIndex: 0 },
                { bankQuestionId: mediumQuestion._id.toString(), marks: 2, orderIndex: 1 },
                { bankQuestionId: hardQuestion._id.toString(), marks: 3, orderIndex: 2 },
            ]);

            const examQuestions = await ExamQuestionModel.find({ examId: exam._id.toString() })
                .sort({ orderIndex: 1 });

            expect(examQuestions[0].difficulty).toBe('easy');
            expect(examQuestions[1].difficulty).toBe('medium');
            expect(examQuestions[2].difficulty).toBe('hard');

            const updatedExam = await Exam.findById(exam._id);
            expect(updatedExam!.totalQuestions).toBe(3);
            expect(updatedExam!.totalMarks).toBe(6);
        });
    });
});
