// Feature: exam-center-backend-completion, Property 2: Grade Input Validation Accepts Valid and Rejects Invalid
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { gradeWrittenAnswerSchema } from '../validators/examGrading.validator';

/**
 * Property 2: Grade Input Validation Accepts Valid and Rejects Invalid
 *
 * Validates: Requirements 2.2, 1.4
 *
 * For any grade payload, the Zod schema SHALL accept it if and only if:
 * - `marks` is a number in [0, maxMarks]
 * - `maxMarks` is a positive number
 * - `questionId` is a 24-character hex string
 * - `feedback` is a string of at most 2000 characters
 * All other payloads SHALL be rejected.
 */

// ─── Generators ──────────────────────────────────────────────────────────────

/** Generate a valid 24-char hex ObjectId string. */
const validObjectIdArb = fc
    .array(fc.constantFrom(...'0123456789abcdef'.split('')), { minLength: 24, maxLength: 24 })
    .map((chars) => chars.join(''));

/** Generate a feedback string within the 2000-char limit. */
const validFeedbackArb = fc.string({ minLength: 0, maxLength: 2000 });

/** Generate a feedback string that exceeds the 2000-char limit. */
const tooLongFeedbackArb = fc.string({ minLength: 2001, maxLength: 2500 });

/** Generate a valid maxMarks (positive number). */
const validMaxMarksArb = fc.double({ min: 0.01, max: 1000, noNaN: true, noDefaultInfinity: true });

/**
 * Generate a valid marks value in [0, maxMarks].
 * Returns a tuple [marks, maxMarks] where marks <= maxMarks.
 */
const validMarksAndMaxArb = validMaxMarksArb.chain((maxMarks) =>
    fc.double({ min: 0, max: maxMarks, noNaN: true, noDefaultInfinity: true }).map((marks) => ({
        marks,
        maxMarks,
    })),
);

/** Generate an invalid ObjectId (not 24-char hex). */
const invalidObjectIdArb = fc.oneof(
    // Too short
    fc.array(fc.constantFrom(...'0123456789abcdef'.split('')), { minLength: 0, maxLength: 23 }).map((c) => c.join('')),
    // Too long
    fc.array(fc.constantFrom(...'0123456789abcdef'.split('')), { minLength: 25, maxLength: 30 }).map((c) => c.join('')),
    // Correct length but contains non-hex characters
    fc.array(fc.constantFrom(...'0123456789abcdef'.split('')), { minLength: 23, maxLength: 23 })
        .chain((prefix) =>
            fc.constantFrom('g', 'z', 'G', 'Z', '!', '@', ' ').map((bad) => prefix.join('') + bad),
        ),
);

// ─── Property Tests ──────────────────────────────────────────────────────────

describe('Feature: exam-center-backend-completion, Property 2: Grade Input Validation Accepts Valid and Rejects Invalid', () => {
    /**
     * Valid payloads: marks in [0, maxMarks], maxMarks > 0, questionId 24-char hex, feedback ≤ 2000 chars
     * **Validates: Requirements 2.2**
     */
    it('accepts all valid grade payloads', () => {
        fc.assert(
            fc.property(
                validMarksAndMaxArb,
                validObjectIdArb,
                validFeedbackArb,
                ({ marks, maxMarks }, questionId, feedback) => {
                    const payload = { marks, maxMarks, questionId, feedback };
                    const result = gradeWrittenAnswerSchema.safeParse(payload);
                    expect(result.success).toBe(true);
                },
            ),
            { numRuns: 100 },
        );
    });

    /**
     * Rejects when marks > maxMarks
     * **Validates: Requirements 2.2**
     */
    it('rejects when marks exceed maxMarks', () => {
        const marksExceedArb = validMaxMarksArb.chain((maxMarks) =>
            fc.double({ min: maxMarks + 0.01, max: maxMarks + 1000, noNaN: true, noDefaultInfinity: true }).map(
                (marks) => ({ marks, maxMarks }),
            ),
        );

        fc.assert(
            fc.property(marksExceedArb, validObjectIdArb, ({ marks, maxMarks }, questionId) => {
                const payload = { marks, maxMarks, questionId, feedback: '' };
                const result = gradeWrittenAnswerSchema.safeParse(payload);
                expect(result.success).toBe(false);
            }),
            { numRuns: 100 },
        );
    });

    /**
     * Rejects when marks are negative
     * **Validates: Requirements 2.2**
     */
    it('rejects when marks are negative', () => {
        fc.assert(
            fc.property(
                fc.double({ min: -10000, max: -0.01, noNaN: true, noDefaultInfinity: true }),
                validMaxMarksArb,
                validObjectIdArb,
                (negativeMark, maxMarks, questionId) => {
                    const payload = { marks: negativeMark, maxMarks, questionId, feedback: '' };
                    const result = gradeWrittenAnswerSchema.safeParse(payload);
                    expect(result.success).toBe(false);
                },
            ),
            { numRuns: 100 },
        );
    });

    /**
     * Rejects when maxMarks is zero or negative
     * **Validates: Requirements 2.2**
     */
    it('rejects when maxMarks is zero or negative', () => {
        fc.assert(
            fc.property(
                fc.double({ min: -10000, max: 0, noNaN: true, noDefaultInfinity: true }),
                validObjectIdArb,
                (badMaxMarks, questionId) => {
                    const payload = { marks: 0, maxMarks: badMaxMarks, questionId, feedback: '' };
                    const result = gradeWrittenAnswerSchema.safeParse(payload);
                    expect(result.success).toBe(false);
                },
            ),
            { numRuns: 100 },
        );
    });

    /**
     * Rejects when questionId is not a valid 24-char hex string
     * **Validates: Requirements 1.4**
     */
    it('rejects when questionId is not a valid ObjectId', () => {
        fc.assert(
            fc.property(invalidObjectIdArb, (badId) => {
                const payload = { marks: 5, maxMarks: 10, questionId: badId, feedback: '' };
                const result = gradeWrittenAnswerSchema.safeParse(payload);
                expect(result.success).toBe(false);
            }),
            { numRuns: 100 },
        );
    });

    /**
     * Rejects when feedback exceeds 2000 characters
     * **Validates: Requirements 2.2**
     */
    it('rejects when feedback exceeds 2000 characters', () => {
        fc.assert(
            fc.property(tooLongFeedbackArb, validObjectIdArb, (longFeedback, questionId) => {
                const payload = { marks: 5, maxMarks: 10, questionId, feedback: longFeedback };
                const result = gradeWrittenAnswerSchema.safeParse(payload);
                expect(result.success).toBe(false);
            }),
            { numRuns: 100 },
        );
    });

    /**
     * Rejects when required fields are missing
     * **Validates: Requirements 2.2**
     */
    it('rejects when required fields are missing', () => {
        const missingFieldArb = fc.constantFrom('marks', 'maxMarks', 'questionId');

        fc.assert(
            fc.property(missingFieldArb, validObjectIdArb, (fieldToRemove, questionId) => {
                const payload: Record<string, unknown> = {
                    marks: 5,
                    maxMarks: 10,
                    questionId,
                    feedback: 'Good answer',
                };
                delete payload[fieldToRemove];
                const result = gradeWrittenAnswerSchema.safeParse(payload);
                expect(result.success).toBe(false);
            }),
            { numRuns: 100 },
        );
    });
});
