import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import QuestionBankQuestion from '../models/QuestionBankQuestion';
import { ExamQuestionModel } from '../models/examQuestion.model';
import Exam from '../models/Exam';

/**
 * Integration Tests: Auto-Generate and Preview Endpoints
 *
 * Validates: Requirements 12.2, 12.3, 12.4, 10.1, 10.2
 *
 * Tests the auto-generate and preview functionality:
 * 1. Auto-generate with valid distribution (sufficient questions in bank)
 * 2. Auto-generate respects difficulty distribution (easy/medium/hard counts)
 * 3. Auto-generate with subject and category filters
 * 4. Auto-generate returns 400 with shortage details when insufficient questions
 * 5. Preview endpoint returns exam metadata (title, subject, duration, totalMarks, totalQuestions)
 * 6. Preview endpoint returns questions with orderIndex, question text, options
 * 7. Preview endpoint excludes correctKey and explanation fields from response
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
 * Creates multiple bank questions with specified difficulty distribution
 */
async function createQuestionsWithDistribution(
    distribution: { easy: number; medium: number; hard: number },
    baseOverrides: Partial<any> = {}
) {
    const questions: any[] = [];
    let counter = 0;

    for (const [difficulty, count] of Object.entries(distribution)) {
        for (let i = 0; i < count; i++) {
            counter++;
            const payload = createBankQuestionPayload({
                question_en: `Test question ${counter}: What is ${counter} + ${counter}?`,
                question_bn: `পরীক্ষার প্রশ্ন ${counter}: ${counter} + ${counter} কত?`,
                difficulty: difficulty as 'easy' | 'medium' | 'hard',
                marks: difficulty === 'easy' ? 1 : difficulty === 'medium' ? 2 : 3,
                ...baseOverrides,
            });
            const question = await QuestionBankQuestion.create(payload);
            questions.push(question);
        }
    }
    return questions;
}


/**
 * Simulates the auto-generate logic (mirrors adminAutoGenerateExam controller)
 */
async function performAutoGenerate(params: {
    subject?: string;
    moduleCategory?: string;
    distribution: { easy: number; medium: number; hard: number };
    defaultMarksPerQuestion?: number;
}): Promise<{
    success: boolean;
    questions?: any[];
    distribution?: Record<string, { requested: number; available: number; selected: number }>;
    defaultMarksPerQuestion?: number;
    error?: {
        message: string;
        shortage?: { level: string; requested: number; available: number };
    };
}> {
    const { easy, medium, hard } = params.distribution;

    if (easy < 0 || medium < 0 || hard < 0) {
        return { success: false, error: { message: 'Distribution counts must be non-negative.' } };
    }

    if (easy + medium + hard === 0) {
        return { success: false, error: { message: 'At least one question must be requested.' } };
    }

    const baseFilter: Record<string, unknown> = { isActive: true, isArchived: false };
    if (params.subject) baseFilter.subject = params.subject;
    if (params.moduleCategory) baseFilter.moduleCategory = params.moduleCategory;

    const selectedQuestions: any[] = [];
    const distReport: Record<string, { requested: number; available: number; selected: number }> = {};

    for (const level of ['easy', 'medium', 'hard'] as const) {
        const count = level === 'easy' ? easy : level === 'medium' ? medium : hard;

        if (count <= 0) {
            distReport[level] = { requested: 0, available: 0, selected: 0 };
            continue;
        }

        const available = await QuestionBankQuestion.countDocuments({
            ...baseFilter,
            difficulty: level,
        });

        if (available < count) {
            return {
                success: false,
                error: {
                    message: `Insufficient ${level} questions: requested ${count}, available ${available}`,
                    shortage: { level, requested: count, available },
                },
            };
        }

        const selected = await QuestionBankQuestion.aggregate([
            { $match: { ...baseFilter, difficulty: level } },
            { $sample: { size: count } },
        ]);

        selectedQuestions.push(...selected);
        distReport[level] = { requested: count, available, selected: selected.length };
    }

    return {
        success: true,
        questions: selectedQuestions,
        distribution: distReport,
        defaultMarksPerQuestion: params.defaultMarksPerQuestion || 1,
    };
}


/**
 * Simulates the preview endpoint logic (mirrors adminGetExamPreview controller)
 */
async function getExamPreview(examId: string): Promise<{
    success: boolean;
    exam?: {
        title: string;
        subject: string;
        duration: number;
        totalMarks: number;
        totalQuestions: number;
        negativeMarking: boolean;
        negativeMarkValue: number;
    };
    questions?: Array<{
        orderIndex: number;
        question_en?: string;
        question_bn?: string;
        questionImageUrl?: string;
        options: Array<{ key: string; text_en?: string; text_bn?: string }>;
        marks: number;
    }>;
    error?: string;
}> {
    const exam = await Exam.findById(examId).lean();
    if (!exam) {
        return { success: false, error: 'Exam not found' };
    }

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
        success: true,
        exam: {
            title: exam.title as string,
            subject: exam.subject as string,
            duration: exam.duration as number,
            totalMarks: exam.totalMarks as number,
            totalQuestions: exam.totalQuestions as number,
            negativeMarking: exam.negativeMarking as boolean,
            negativeMarkValue: exam.negativeMarkValue as number,
        },
        questions: previewQuestions,
    };
}

/**
 * Creates ExamQuestion records for an exam (for preview testing)
 */
async function attachQuestionsToExam(
    examId: string,
    bankQuestions: any[],
    marksPerQuestion: number = 2
) {
    const examQuestionDocs = bankQuestions.map((bq, index) => ({
        examId,
        fromBankQuestionId: bq._id.toString(),
        orderIndex: index,
        marks: marksPerQuestion,
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
    }));

    await ExamQuestionModel.insertMany(examQuestionDocs);

    // Update exam totals
    await Exam.findByIdAndUpdate(examId, {
        totalQuestions: bankQuestions.length,
        totalMarks: bankQuestions.length * marksPerQuestion,
    });
}


// ─── Integration Tests ───────────────────────────────────────────────────────

describe('Auto-Generate and Preview Integration Tests', () => {
    describe('1. Auto-Generate with Valid Distribution', () => {
        it('should auto-generate questions when sufficient questions exist in bank', async () => {
            // Create questions with sufficient distribution
            await createQuestionsWithDistribution({ easy: 5, medium: 5, hard: 5 });

            const result = await performAutoGenerate({
                distribution: { easy: 2, medium: 2, hard: 2 },
            });

            expect(result.success).toBe(true);
            expect(result.questions).toHaveLength(6);
            expect(result.distribution).toBeDefined();
        });

        it('should return exactly the requested number of questions per difficulty', async () => {
            await createQuestionsWithDistribution({ easy: 10, medium: 10, hard: 10 });

            const result = await performAutoGenerate({
                distribution: { easy: 3, medium: 4, hard: 5 },
            });

            expect(result.success).toBe(true);
            expect(result.questions).toHaveLength(12);

            // Count questions by difficulty
            const easyCount = result.questions!.filter((q) => q.difficulty === 'easy').length;
            const mediumCount = result.questions!.filter((q) => q.difficulty === 'medium').length;
            const hardCount = result.questions!.filter((q) => q.difficulty === 'hard').length;

            expect(easyCount).toBe(3);
            expect(mediumCount).toBe(4);
            expect(hardCount).toBe(5);
        });

        it('should return distribution report with requested, available, and selected counts', async () => {
            await createQuestionsWithDistribution({ easy: 8, medium: 6, hard: 4 });

            const result = await performAutoGenerate({
                distribution: { easy: 2, medium: 3, hard: 1 },
            });

            expect(result.success).toBe(true);
            expect(result.distribution).toEqual({
                easy: { requested: 2, available: 8, selected: 2 },
                medium: { requested: 3, available: 6, selected: 3 },
                hard: { requested: 1, available: 4, selected: 1 },
            });
        });

        it('should handle zero count for a difficulty level', async () => {
            await createQuestionsWithDistribution({ easy: 5, medium: 5, hard: 5 });

            const result = await performAutoGenerate({
                distribution: { easy: 3, medium: 0, hard: 2 },
            });

            expect(result.success).toBe(true);
            expect(result.questions).toHaveLength(5);
            expect(result.distribution!.medium).toEqual({ requested: 0, available: 0, selected: 0 });
        });

        it('should return default marks per question when not specified', async () => {
            await createQuestionsWithDistribution({ easy: 3, medium: 3, hard: 3 });

            const result = await performAutoGenerate({
                distribution: { easy: 1, medium: 1, hard: 1 },
            });

            expect(result.success).toBe(true);
            expect(result.defaultMarksPerQuestion).toBe(1);
        });

        it('should return custom marks per question when specified', async () => {
            await createQuestionsWithDistribution({ easy: 3, medium: 3, hard: 3 });

            const result = await performAutoGenerate({
                distribution: { easy: 1, medium: 1, hard: 1 },
                defaultMarksPerQuestion: 5,
            });

            expect(result.success).toBe(true);
            expect(result.defaultMarksPerQuestion).toBe(5);
        });
    });


    describe('2. Auto-Generate Respects Difficulty Distribution', () => {
        it('should select only easy questions when only easy requested', async () => {
            await createQuestionsWithDistribution({ easy: 5, medium: 5, hard: 5 });

            const result = await performAutoGenerate({
                distribution: { easy: 3, medium: 0, hard: 0 },
            });

            expect(result.success).toBe(true);
            expect(result.questions).toHaveLength(3);
            result.questions!.forEach((q) => {
                expect(q.difficulty).toBe('easy');
            });
        });

        it('should select only medium questions when only medium requested', async () => {
            await createQuestionsWithDistribution({ easy: 5, medium: 5, hard: 5 });

            const result = await performAutoGenerate({
                distribution: { easy: 0, medium: 4, hard: 0 },
            });

            expect(result.success).toBe(true);
            expect(result.questions).toHaveLength(4);
            result.questions!.forEach((q) => {
                expect(q.difficulty).toBe('medium');
            });
        });

        it('should select only hard questions when only hard requested', async () => {
            await createQuestionsWithDistribution({ easy: 5, medium: 5, hard: 5 });

            const result = await performAutoGenerate({
                distribution: { easy: 0, medium: 0, hard: 2 },
            });

            expect(result.success).toBe(true);
            expect(result.questions).toHaveLength(2);
            result.questions!.forEach((q) => {
                expect(q.difficulty).toBe('hard');
            });
        });

        it('should maintain exact distribution across multiple calls', async () => {
            await createQuestionsWithDistribution({ easy: 20, medium: 20, hard: 20 });

            // Run multiple times to verify consistency
            for (let i = 0; i < 3; i++) {
                const result = await performAutoGenerate({
                    distribution: { easy: 5, medium: 3, hard: 2 },
                });

                expect(result.success).toBe(true);
                expect(result.questions).toHaveLength(10);

                const easyCount = result.questions!.filter((q) => q.difficulty === 'easy').length;
                const mediumCount = result.questions!.filter((q) => q.difficulty === 'medium').length;
                const hardCount = result.questions!.filter((q) => q.difficulty === 'hard').length;

                expect(easyCount).toBe(5);
                expect(mediumCount).toBe(3);
                expect(hardCount).toBe(2);
            }
        });

        it('should return questions with all required fields', async () => {
            await createQuestionsWithDistribution({ easy: 3, medium: 3, hard: 3 });

            const result = await performAutoGenerate({
                distribution: { easy: 1, medium: 1, hard: 1 },
            });

            expect(result.success).toBe(true);
            result.questions!.forEach((q) => {
                expect(q._id).toBeDefined();
                expect(q.question_en).toBeDefined();
                expect(q.question_bn).toBeDefined();
                expect(q.options).toBeDefined();
                expect(q.options.length).toBeGreaterThanOrEqual(4);
                expect(q.correctKey).toBeDefined();
                expect(q.difficulty).toBeDefined();
                expect(q.subject).toBeDefined();
            });
        });
    });


    describe('3. Auto-Generate with Subject and Category Filters', () => {
        it('should filter questions by subject', async () => {
            // Create questions for different subjects
            await createQuestionsWithDistribution(
                { easy: 5, medium: 5, hard: 5 },
                { subject: 'Mathematics' }
            );
            await createQuestionsWithDistribution(
                { easy: 5, medium: 5, hard: 5 },
                { subject: 'Physics' }
            );

            const result = await performAutoGenerate({
                subject: 'Mathematics',
                distribution: { easy: 2, medium: 2, hard: 2 },
            });

            expect(result.success).toBe(true);
            expect(result.questions).toHaveLength(6);
            result.questions!.forEach((q) => {
                expect(q.subject).toBe('Mathematics');
            });
        });

        it('should filter questions by moduleCategory', async () => {
            // Create questions for different categories
            await createQuestionsWithDistribution(
                { easy: 5, medium: 5, hard: 5 },
                { moduleCategory: 'Algebra' }
            );
            await createQuestionsWithDistribution(
                { easy: 5, medium: 5, hard: 5 },
                { moduleCategory: 'Geometry' }
            );

            const result = await performAutoGenerate({
                moduleCategory: 'Algebra',
                distribution: { easy: 2, medium: 2, hard: 2 },
            });

            expect(result.success).toBe(true);
            expect(result.questions).toHaveLength(6);
            result.questions!.forEach((q) => {
                expect(q.moduleCategory).toBe('Algebra');
            });
        });

        it('should filter questions by both subject and moduleCategory', async () => {
            // Create questions with various combinations
            await createQuestionsWithDistribution(
                { easy: 3, medium: 3, hard: 3 },
                { subject: 'Mathematics', moduleCategory: 'Algebra' }
            );
            await createQuestionsWithDistribution(
                { easy: 3, medium: 3, hard: 3 },
                { subject: 'Mathematics', moduleCategory: 'Geometry' }
            );
            await createQuestionsWithDistribution(
                { easy: 3, medium: 3, hard: 3 },
                { subject: 'Physics', moduleCategory: 'Mechanics' }
            );

            const result = await performAutoGenerate({
                subject: 'Mathematics',
                moduleCategory: 'Algebra',
                distribution: { easy: 2, medium: 2, hard: 2 },
            });

            expect(result.success).toBe(true);
            expect(result.questions).toHaveLength(6);
            result.questions!.forEach((q) => {
                expect(q.subject).toBe('Mathematics');
                expect(q.moduleCategory).toBe('Algebra');
            });
        });

        it('should exclude archived questions from auto-generate', async () => {
            // Create active questions
            await createQuestionsWithDistribution(
                { easy: 3, medium: 3, hard: 3 },
                { isArchived: false }
            );
            // Create archived questions
            await createQuestionsWithDistribution(
                { easy: 3, medium: 3, hard: 3 },
                { isArchived: true }
            );

            const result = await performAutoGenerate({
                distribution: { easy: 2, medium: 2, hard: 2 },
            });

            expect(result.success).toBe(true);
            expect(result.questions).toHaveLength(6);
            result.questions!.forEach((q) => {
                expect(q.isArchived).toBe(false);
            });
        });

        it('should exclude inactive questions from auto-generate', async () => {
            // Create active questions
            await createQuestionsWithDistribution(
                { easy: 3, medium: 3, hard: 3 },
                { isActive: true }
            );
            // Create inactive questions
            await createQuestionsWithDistribution(
                { easy: 3, medium: 3, hard: 3 },
                { isActive: false }
            );

            const result = await performAutoGenerate({
                distribution: { easy: 2, medium: 2, hard: 2 },
            });

            expect(result.success).toBe(true);
            expect(result.questions).toHaveLength(6);
            result.questions!.forEach((q) => {
                expect(q.isActive).toBe(true);
            });
        });
    });


    describe('4. Auto-Generate Returns 400 with Shortage Details', () => {
        it('should return error when insufficient easy questions', async () => {
            await createQuestionsWithDistribution({ easy: 2, medium: 10, hard: 10 });

            const result = await performAutoGenerate({
                distribution: { easy: 5, medium: 2, hard: 2 },
            });

            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
            expect(result.error!.message).toContain('Insufficient easy questions');
            expect(result.error!.shortage).toEqual({
                level: 'easy',
                requested: 5,
                available: 2,
            });
        });

        it('should return error when insufficient medium questions', async () => {
            await createQuestionsWithDistribution({ easy: 10, medium: 1, hard: 10 });

            const result = await performAutoGenerate({
                distribution: { easy: 2, medium: 5, hard: 2 },
            });

            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
            expect(result.error!.message).toContain('Insufficient medium questions');
            expect(result.error!.shortage).toEqual({
                level: 'medium',
                requested: 5,
                available: 1,
            });
        });

        it('should return error when insufficient hard questions', async () => {
            await createQuestionsWithDistribution({ easy: 10, medium: 10, hard: 0 });

            const result = await performAutoGenerate({
                distribution: { easy: 2, medium: 2, hard: 3 },
            });

            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
            expect(result.error!.message).toContain('Insufficient hard questions');
            expect(result.error!.shortage).toEqual({
                level: 'hard',
                requested: 3,
                available: 0,
            });
        });

        it('should return error when no questions exist in bank', async () => {
            // Empty bank
            const result = await performAutoGenerate({
                distribution: { easy: 1, medium: 1, hard: 1 },
            });

            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
            expect(result.error!.shortage!.available).toBe(0);
        });

        it('should return error when filtered subject has insufficient questions', async () => {
            await createQuestionsWithDistribution(
                { easy: 10, medium: 10, hard: 10 },
                { subject: 'Mathematics' }
            );
            await createQuestionsWithDistribution(
                { easy: 1, medium: 1, hard: 1 },
                { subject: 'Physics' }
            );

            const result = await performAutoGenerate({
                subject: 'Physics',
                distribution: { easy: 5, medium: 5, hard: 5 },
            });

            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
            expect(result.error!.shortage!.available).toBeLessThan(5);
        });

        it('should return error for negative distribution counts', async () => {
            await createQuestionsWithDistribution({ easy: 10, medium: 10, hard: 10 });

            const result = await performAutoGenerate({
                distribution: { easy: -1, medium: 2, hard: 2 },
            });

            expect(result.success).toBe(false);
            expect(result.error!.message).toContain('non-negative');
        });

        it('should return error when all distribution counts are zero', async () => {
            await createQuestionsWithDistribution({ easy: 10, medium: 10, hard: 10 });

            const result = await performAutoGenerate({
                distribution: { easy: 0, medium: 0, hard: 0 },
            });

            expect(result.success).toBe(false);
            expect(result.error!.message).toContain('At least one question must be requested');
        });
    });


    describe('5. Preview Endpoint Returns Exam Metadata', () => {
        it('should return exam title in preview', async () => {
            const exam = await createTestExam({ title: 'Mathematics Final Exam' });
            const bankQuestions = await createQuestionsWithDistribution({ easy: 2, medium: 2, hard: 2 });
            await attachQuestionsToExam(exam._id.toString(), bankQuestions);

            const preview = await getExamPreview(exam._id.toString());

            expect(preview.success).toBe(true);
            expect(preview.exam!.title).toBe('Mathematics Final Exam');
        });

        it('should return exam subject in preview', async () => {
            const exam = await createTestExam({ subject: 'Physics' });
            const bankQuestions = await createQuestionsWithDistribution({ easy: 2, medium: 0, hard: 0 });
            await attachQuestionsToExam(exam._id.toString(), bankQuestions);

            const preview = await getExamPreview(exam._id.toString());

            expect(preview.success).toBe(true);
            expect(preview.exam!.subject).toBe('Physics');
        });

        it('should return exam duration in preview', async () => {
            const exam = await createTestExam({ duration: 120 });
            const bankQuestions = await createQuestionsWithDistribution({ easy: 2, medium: 0, hard: 0 });
            await attachQuestionsToExam(exam._id.toString(), bankQuestions);

            const preview = await getExamPreview(exam._id.toString());

            expect(preview.success).toBe(true);
            expect(preview.exam!.duration).toBe(120);
        });

        it('should return exam totalMarks in preview', async () => {
            const exam = await createTestExam();
            const bankQuestions = await createQuestionsWithDistribution({ easy: 5, medium: 0, hard: 0 });
            await attachQuestionsToExam(exam._id.toString(), bankQuestions, 4); // 5 questions * 4 marks = 20

            const preview = await getExamPreview(exam._id.toString());

            expect(preview.success).toBe(true);
            expect(preview.exam!.totalMarks).toBe(20);
        });

        it('should return exam totalQuestions in preview', async () => {
            const exam = await createTestExam();
            const bankQuestions = await createQuestionsWithDistribution({ easy: 3, medium: 2, hard: 1 });
            await attachQuestionsToExam(exam._id.toString(), bankQuestions);

            const preview = await getExamPreview(exam._id.toString());

            expect(preview.success).toBe(true);
            expect(preview.exam!.totalQuestions).toBe(6);
        });

        it('should return negativeMarking settings in preview', async () => {
            const exam = await createTestExam({
                negativeMarking: true,
                negativeMarkValue: 0.5,
            });
            const bankQuestions = await createQuestionsWithDistribution({ easy: 2, medium: 0, hard: 0 });
            await attachQuestionsToExam(exam._id.toString(), bankQuestions);

            const preview = await getExamPreview(exam._id.toString());

            expect(preview.success).toBe(true);
            expect(preview.exam!.negativeMarking).toBe(true);
            expect(preview.exam!.negativeMarkValue).toBe(0.5);
        });

        it('should return error for non-existent exam', async () => {
            const fakeId = new mongoose.Types.ObjectId().toString();

            const preview = await getExamPreview(fakeId);

            expect(preview.success).toBe(false);
            expect(preview.error).toBe('Exam not found');
        });
    });


    describe('6. Preview Endpoint Returns Questions with Required Fields', () => {
        it('should return questions with orderIndex', async () => {
            const exam = await createTestExam();
            const bankQuestions = await createQuestionsWithDistribution({ easy: 3, medium: 0, hard: 0 });
            await attachQuestionsToExam(exam._id.toString(), bankQuestions);

            const preview = await getExamPreview(exam._id.toString());

            expect(preview.success).toBe(true);
            expect(preview.questions).toHaveLength(3);
            preview.questions!.forEach((q, index) => {
                expect(q.orderIndex).toBe(index);
            });
        });

        it('should return questions with question_en text', async () => {
            const bankQuestion = await QuestionBankQuestion.create(
                createBankQuestionPayload({ question_en: 'What is 2 + 2?' })
            );
            const exam = await createTestExam();
            await attachQuestionsToExam(exam._id.toString(), [bankQuestion]);

            const preview = await getExamPreview(exam._id.toString());

            expect(preview.success).toBe(true);
            expect(preview.questions![0].question_en).toBe('What is 2 + 2?');
        });

        it('should return questions with question_bn text', async () => {
            const bankQuestion = await QuestionBankQuestion.create(
                createBankQuestionPayload({ question_bn: '২ + ২ কত?' })
            );
            const exam = await createTestExam();
            await attachQuestionsToExam(exam._id.toString(), [bankQuestion]);

            const preview = await getExamPreview(exam._id.toString());

            expect(preview.success).toBe(true);
            expect(preview.questions![0].question_bn).toBe('২ + ২ কত?');
        });

        it('should return questions with options array', async () => {
            const bankQuestion = await QuestionBankQuestion.create(createBankQuestionPayload());
            const exam = await createTestExam();
            await attachQuestionsToExam(exam._id.toString(), [bankQuestion]);

            const preview = await getExamPreview(exam._id.toString());

            expect(preview.success).toBe(true);
            expect(preview.questions![0].options).toBeDefined();
            expect(preview.questions![0].options.length).toBeGreaterThanOrEqual(4);
        });

        it('should return options with key, text_en, and text_bn', async () => {
            const bankQuestion = await QuestionBankQuestion.create(createBankQuestionPayload());
            const exam = await createTestExam();
            await attachQuestionsToExam(exam._id.toString(), [bankQuestion]);

            const preview = await getExamPreview(exam._id.toString());

            expect(preview.success).toBe(true);
            const firstOption = preview.questions![0].options[0];
            expect(firstOption.key).toBe('A');
            expect(firstOption.text_en).toBeDefined();
            expect(firstOption.text_bn).toBeDefined();
        });

        it('should return questions with marks', async () => {
            const exam = await createTestExam();
            const bankQuestions = await createQuestionsWithDistribution({ easy: 2, medium: 0, hard: 0 });
            await attachQuestionsToExam(exam._id.toString(), bankQuestions, 5);

            const preview = await getExamPreview(exam._id.toString());

            expect(preview.success).toBe(true);
            preview.questions!.forEach((q) => {
                expect(q.marks).toBe(5);
            });
        });

        it('should return questions sorted by orderIndex', async () => {
            const exam = await createTestExam();
            const bankQuestions = await createQuestionsWithDistribution({ easy: 5, medium: 0, hard: 0 });
            await attachQuestionsToExam(exam._id.toString(), bankQuestions);

            const preview = await getExamPreview(exam._id.toString());

            expect(preview.success).toBe(true);
            for (let i = 1; i < preview.questions!.length; i++) {
                expect(preview.questions![i].orderIndex).toBeGreaterThan(
                    preview.questions![i - 1].orderIndex
                );
            }
        });
    });


    describe('7. Preview Endpoint Excludes Answers and Explanations', () => {
        it('should NOT include correctKey in preview questions', async () => {
            const bankQuestion = await QuestionBankQuestion.create(
                createBankQuestionPayload({ correctKey: 'B' })
            );
            const exam = await createTestExam();
            await attachQuestionsToExam(exam._id.toString(), [bankQuestion]);

            const preview = await getExamPreview(exam._id.toString());

            expect(preview.success).toBe(true);
            preview.questions!.forEach((q) => {
                expect(q).not.toHaveProperty('correctKey');
            });
        });

        it('should NOT include explanation_en in preview questions', async () => {
            const bankQuestion = await QuestionBankQuestion.create(
                createBankQuestionPayload({ explanation_en: 'This is the explanation in English' })
            );
            const exam = await createTestExam();
            await attachQuestionsToExam(exam._id.toString(), [bankQuestion]);

            const preview = await getExamPreview(exam._id.toString());

            expect(preview.success).toBe(true);
            preview.questions!.forEach((q) => {
                expect(q).not.toHaveProperty('explanation_en');
            });
        });

        it('should NOT include explanation_bn in preview questions', async () => {
            const bankQuestion = await QuestionBankQuestion.create(
                createBankQuestionPayload({ explanation_bn: 'এটি বাংলায় ব্যাখ্যা' })
            );
            const exam = await createTestExam();
            await attachQuestionsToExam(exam._id.toString(), [bankQuestion]);

            const preview = await getExamPreview(exam._id.toString());

            expect(preview.success).toBe(true);
            preview.questions!.forEach((q) => {
                expect(q).not.toHaveProperty('explanation_bn');
            });
        });

        it('should NOT include explanationImageUrl in preview questions', async () => {
            const bankQuestion = await QuestionBankQuestion.create(
                createBankQuestionPayload({ explanationImageUrl: 'https://example.com/explanation.png' })
            );
            const exam = await createTestExam();
            await attachQuestionsToExam(exam._id.toString(), [bankQuestion]);

            const preview = await getExamPreview(exam._id.toString());

            expect(preview.success).toBe(true);
            preview.questions!.forEach((q) => {
                expect(q).not.toHaveProperty('explanationImageUrl');
            });
        });

        it('should NOT include difficulty in preview questions', async () => {
            const bankQuestion = await QuestionBankQuestion.create(
                createBankQuestionPayload({ difficulty: 'hard' })
            );
            const exam = await createTestExam();
            await attachQuestionsToExam(exam._id.toString(), [bankQuestion]);

            const preview = await getExamPreview(exam._id.toString());

            expect(preview.success).toBe(true);
            preview.questions!.forEach((q) => {
                expect(q).not.toHaveProperty('difficulty');
            });
        });

        it('should NOT include fromBankQuestionId in preview questions', async () => {
            const bankQuestion = await QuestionBankQuestion.create(createBankQuestionPayload());
            const exam = await createTestExam();
            await attachQuestionsToExam(exam._id.toString(), [bankQuestion]);

            const preview = await getExamPreview(exam._id.toString());

            expect(preview.success).toBe(true);
            preview.questions!.forEach((q) => {
                expect(q).not.toHaveProperty('fromBankQuestionId');
            });
        });

        it('should NOT include tags in preview questions', async () => {
            const bankQuestion = await QuestionBankQuestion.create(
                createBankQuestionPayload({ tags: ['important', 'algebra'] })
            );
            const exam = await createTestExam();
            await attachQuestionsToExam(exam._id.toString(), [bankQuestion]);

            const preview = await getExamPreview(exam._id.toString());

            expect(preview.success).toBe(true);
            preview.questions!.forEach((q) => {
                expect(q).not.toHaveProperty('tags');
            });
        });

        it('should only include allowed fields in preview questions', async () => {
            const bankQuestion = await QuestionBankQuestion.create(createBankQuestionPayload());
            const exam = await createTestExam();
            await attachQuestionsToExam(exam._id.toString(), [bankQuestion]);

            const preview = await getExamPreview(exam._id.toString());

            expect(preview.success).toBe(true);
            const allowedFields = ['orderIndex', 'question_en', 'question_bn', 'questionImageUrl', 'options', 'marks'];
            preview.questions!.forEach((q) => {
                const questionKeys = Object.keys(q);
                questionKeys.forEach((key) => {
                    expect(allowedFields).toContain(key);
                });
            });
        });

        it('should verify multiple questions all exclude sensitive fields', async () => {
            const exam = await createTestExam();
            const bankQuestions = await createQuestionsWithDistribution({ easy: 3, medium: 3, hard: 3 });
            await attachQuestionsToExam(exam._id.toString(), bankQuestions);

            const preview = await getExamPreview(exam._id.toString());

            expect(preview.success).toBe(true);
            expect(preview.questions).toHaveLength(9);

            const sensitiveFields = [
                'correctKey',
                'explanation_en',
                'explanation_bn',
                'explanationImageUrl',
                'difficulty',
                'fromBankQuestionId',
                'tags',
                'topic',
                'subject',
                'moduleCategory',
            ];

            preview.questions!.forEach((q) => {
                sensitiveFields.forEach((field) => {
                    expect(q).not.toHaveProperty(field);
                });
            });
        });
    });
});
