import { z } from 'zod';

// ── Exam Builder Wizard Validation Schemas ──────────────
// Zod schemas for the 5-step exam creation wizard.
// Requirements: 4.1, 4.2, 4.3, 4.4, 4.5

/** Reusable 24-char hex ObjectId string validator. */
const objectId = z.string().regex(/^[a-fA-F0-9]{24}$/, 'Invalid ObjectId');

/** Exam type enum matching the Exam Builder Wizard step 1. */
const examTypeEnum = z.enum(['Practice', 'Mock', 'Scheduled', 'Live', 'Custom']);

/** Visibility options for exam access control. */
const visibilityEnum = z.enum(['public', 'group_only', 'private', 'invite_only']);

/** Result display mode after exam submission. */
const showResultModeEnum = z.enum(['immediately', 'after_deadline', 'manual']);

/** Exam schedule type for step 4. */
const examScheduleTypeEnum = z.enum(['live', 'practice', 'scheduled', 'upcoming']);

// ── Step 1: Exam Info ───────────────────────────────────

export const examInfoSchema = z.object({
    title: z.string().trim().min(1, 'Title is required'),
    title_bn: z.string().trim().optional(),
    description: z.string().trim().optional(),
    exam_type: examTypeEnum.optional(),
    group_id: objectId.optional(),
    sub_group_id: objectId.optional(),
    subject_id: objectId.optional(),
    duration: z.number().int().positive('Duration must be a positive integer (minutes)').optional(),
    durationMinutes: z.number().int().positive('Duration must be a positive integer (minutes)').optional(),
});

// ── Step 2: Question Selection (manual) ─────────────────

export const questionSelectionSchema = z.object({
    questionIds: z.array(objectId).min(1, 'At least one question is required'),
});

// ── Step 2: Auto-Pick Configuration ─────────────────────

export const autoPickSchema = z.object({
    count: z.number().int().positive('Count must be a positive integer'),
    difficultyDistribution: z
        .object({
            easy: z.number().min(0).max(100),
            medium: z.number().min(0).max(100),
            hard: z.number().min(0).max(100),
        })
        .refine((d) => d.easy + d.medium + d.hard === 100, {
            message: 'Difficulty distribution must sum to 100%',
        }),
});


// ── Step 3: Exam Settings ───────────────────────────────

export const examSettingsSchema = z.object({
    marksPerQuestion: z.number().min(0, 'Marks per question must be non-negative'),
    negativeMarking: z.number().min(0, 'Negative marking value must be non-negative'),
    passPercentage: z.number().min(0).max(100, 'Pass percentage must be between 0 and 100'),
    shuffleQuestions: z.boolean().default(false),
    shuffleOptions: z.boolean().default(false),
    showResultMode: showResultModeEnum.default('immediately'),
    maxAttempts: z.number().int().positive('Max attempts must be a positive integer').default(1),
    assignedGroups: z.array(objectId).default([]),
    visibility: visibilityEnum.default('public'),
    antiCheat: z
        .object({
            tab_switch_detect: z.boolean().default(true),
            fullscreen_mode: z.boolean().default(false),
            copy_paste_disabled: z.boolean().default(true),
        })
        .default({ tab_switch_detect: true, fullscreen_mode: false, copy_paste_disabled: true }),
});

// ── Step 4: Scheduling & Pricing ────────────────────────

export const examSchedulingSchema = z.object({
    exam_schedule_type: examScheduleTypeEnum,
    startTime: z.coerce.date().optional(),
    endTime: z.coerce.date().optional(),
    resultPublishTime: z.coerce.date().optional(),
    pricing: z
        .object({
            isFree: z.boolean().default(true),
            amountBDT: z.number().min(0, 'Amount must be non-negative').default(0),
            couponCodes: z.array(z.string().trim()).default([]),
        })
        .default({ isFree: true, amountBDT: 0, couponCodes: [] }),
});

// ── Step 5: Publish ─────────────────────────────────────

export const publishSchema = z.object({
    examId: objectId,
});
