import { z } from 'zod';

// ── Exam Grading Validation Schemas ─────────────────────
// Zod schemas for written answer grading endpoints.
// Requirements: 2.2, 2.8, 9.3, 9.4

/** Reusable 24-char hex ObjectId string validator. */
const objectId = z.string().regex(/^[a-fA-F0-9]{24}$/, 'Invalid ObjectId');

// ── Grade Written Answer ────────────────────────────────

export const gradeWrittenAnswerSchema = z
    .object({
        questionId: objectId,
        marks: z.number().min(0, 'Marks must be non-negative'),
        maxMarks: z.number().positive('Max marks must be positive'),
        feedback: z.string().max(2000, 'Feedback must be 2000 characters or less').default(''),
    })
    .refine((data) => data.marks <= data.maxMarks, {
        message: 'Marks cannot exceed maxMarks',
        path: ['marks'],
    });
