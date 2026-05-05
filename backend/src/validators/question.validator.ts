import { z } from 'zod';

// ── Question Bank Validation Schemas ────────────────────
// Zod schemas for question CRUD, filtering, bulk actions, and review workflow.
// Requirements: 2.1, 2.2, 2.3, 2.6, 2.13

/** Reusable 24-char hex ObjectId string validator. */
const objectId = z.string().regex(/^[a-fA-F0-9]{24}$/, 'Invalid ObjectId');

/** Question type enum matching the QuestionBankQuestion model. */
const questionTypeEnum = z.enum(['mcq', 'written_cq', 'fill_blank', 'true_false', 'image_mcq']);

/** Difficulty levels. */
const difficultyEnum = z.enum(['easy', 'medium', 'hard']);

/** Question status values. */
const questionStatusEnum = z.enum(['draft', 'published', 'archived', 'flagged']);

/** Review status values. */
const reviewStatusEnum = z.enum(['pending', 'approved', 'rejected']);

/** Option key — supports up to 6 options (A–F). */
const optionKeyEnum = z.enum(['A', 'B', 'C', 'D', 'E', 'F']);

/** Single question option. */
const questionOptionSchema = z.object({
    key: optionKeyEnum,
    text_en: z.string().trim().optional(),
    text_bn: z.string().trim().optional(),
    imageUrl: z.string().trim().optional(),
    isCorrect: z.boolean().optional(),
});

/** Bilingual text for AI explanation. */
const localizedTextOptional = z
    .object({
        en: z.string().trim().optional(),
        bn: z.string().trim().optional(),
    })
    .optional();

// ── Create Question ─────────────────────────────────────

export const createQuestionSchema = z
    .object({
        // Core content
        question_en: z.string().trim().min(1, 'English question text is required').optional(),
        question_bn: z.string().trim().min(1, 'Bengali question text is required').optional(),
        questionImageUrl: z.string().trim().optional(),
        questionFormulaLatex: z.string().trim().optional(),
        question_type: questionTypeEnum.default('mcq'),

        // Options — max 6
        options: z
            .array(questionOptionSchema)
            .max(6, 'Maximum 6 options allowed')
            .default([]),
        correctKey: z.enum(['A', 'B', 'C', 'D']).optional(),

        // Explanations
        explanation_en: z.string().trim().optional(),
        explanation_bn: z.string().trim().optional(),
        explanationImageUrl: z.string().trim().optional(),
        ai_explanation: localizedTextOptional,

        // Images
        images: z.array(z.string().trim()).default([]),

        // Hierarchy references
        group_id: objectId.optional(),
        sub_group_id: objectId.optional(),
        subject_id: objectId.optional(),
        chapter_id: objectId.optional(),
        topic_id: objectId.optional(),

        // Classification
        subject: z.string().trim().optional(),
        moduleCategory: z.string().trim().optional(),
        topic: z.string().trim().optional(),
        subtopic: z.string().trim().optional(),
        difficulty: difficultyEnum.default('medium'),
        languageMode: z.enum(['en', 'bn', 'both']).default('en'),

        // Scoring
        marks: z.number().min(0).default(1),
        negativeMarks: z.number().min(0).default(0),

        // Metadata
        tags: z.array(z.string().trim()).default([]),
        sourceLabel: z.string().trim().optional(),
        chapter: z.string().trim().optional(),
        boardOrPattern: z.string().trim().optional(),
        yearOrSession: z.string().trim().optional(),

        // Status
        status: questionStatusEnum.default('draft'),
    })
    .refine(
        (data) => {
            // At least one of en or bn question text must be provided
            return Boolean(data.question_en) || Boolean(data.question_bn);
        },
        {
            message: 'At least one of question_en or question_bn is required',
            path: ['question_en'],
        },
    )
    .refine(
        (data) => {
            // MCQ and image_mcq types must have at least one correct option
            const mcqTypes: string[] = ['mcq', 'image_mcq'];
            if (!mcqTypes.includes(data.question_type)) return true;
            if (data.options.length === 0) return true; // options may come from correctKey
            return data.options.some((opt) => opt.isCorrect === true);
        },
        {
            message: 'MCQ questions must have at least one option marked as correct',
            path: ['options'],
        },
    );

// ── Update Question ─────────────────────────────────────

export const updateQuestionSchema = z
    .object({
        question_en: z.string().trim().min(1).optional(),
        question_bn: z.string().trim().min(1).optional(),
        questionImageUrl: z.string().trim().optional(),
        questionFormulaLatex: z.string().trim().optional(),
        question_type: questionTypeEnum.optional(),

        options: z
            .array(questionOptionSchema)
            .max(6, 'Maximum 6 options allowed')
            .optional(),
        correctKey: z.enum(['A', 'B', 'C', 'D']).optional(),

        explanation_en: z.string().trim().optional(),
        explanation_bn: z.string().trim().optional(),
        explanationImageUrl: z.string().trim().optional(),
        ai_explanation: localizedTextOptional,

        images: z.array(z.string().trim()).optional(),

        group_id: objectId.optional(),
        sub_group_id: objectId.optional(),
        subject_id: objectId.optional(),
        chapter_id: objectId.optional(),
        topic_id: objectId.optional(),

        subject: z.string().trim().optional(),
        moduleCategory: z.string().trim().optional(),
        topic: z.string().trim().optional(),
        subtopic: z.string().trim().optional(),
        difficulty: difficultyEnum.optional(),
        languageMode: z.enum(['en', 'bn', 'both']).optional(),

        marks: z.number().min(0).optional(),
        negativeMarks: z.number().min(0).optional(),

        tags: z.array(z.string().trim()).optional(),
        sourceLabel: z.string().trim().optional(),
        chapter: z.string().trim().optional(),
        boardOrPattern: z.string().trim().optional(),
        yearOrSession: z.string().trim().optional(),

        status: questionStatusEnum.optional(),
    })
    .refine(
        (data) => {
            // If options are provided for MCQ types, at least one must be correct
            const mcqTypes: string[] = ['mcq', 'image_mcq'];
            if (!data.question_type || !mcqTypes.includes(data.question_type)) return true;
            if (!data.options || data.options.length === 0) return true;
            return data.options.some((opt) => opt.isCorrect === true);
        },
        {
            message: 'MCQ questions must have at least one option marked as correct',
            path: ['options'],
        },
    );

// ── Question Filters (list/search) ─────────────────────

export const questionFiltersSchema = z.object({
    // Hierarchy filters
    group: objectId.optional(),
    subGroup: objectId.optional(),
    subject: objectId.optional(),
    chapter: objectId.optional(),
    topic: objectId.optional(),

    // Classification filters
    difficulty: difficultyEnum.optional(),
    tags: z.union([z.string().trim(), z.array(z.string().trim())]).optional(),
    year: z.string().trim().optional(),
    source: z.string().trim().optional(),
    question_type: questionTypeEnum.optional(),
    status: questionStatusEnum.optional(),
    review_status: reviewStatusEnum.optional(),

    // Full-text search
    search: z.string().trim().optional(),

    // Recycle Bin flag
    archivedOnly: z.coerce.boolean().optional(),

    // Sorting
    sortField: z.string().trim().optional(),
    sortOrder: z.enum(['asc', 'desc']).optional(),

    // Pagination
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ── Bulk Action ─────────────────────────────────────────

export const bulkActionSchema = z.object({
    action: z.enum(['archive', 'status_change', 'category_reassign', 'approve', 'restore', 'hard_delete']),
    ids: z.array(objectId).min(1, 'At least one question ID is required'),
    newStatus: questionStatusEnum.optional(),
    newCategory: objectId.optional(),
});

// ── Review Action ───────────────────────────────────────

export const reviewActionSchema = z.object({
    action: z.enum(['approve', 'reject']),
    reason: z.string().trim().optional(),
});
