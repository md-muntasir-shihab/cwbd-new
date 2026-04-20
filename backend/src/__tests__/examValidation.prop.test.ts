import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { validateExamPayload } from '../validators/examValidation';

/**
 * Feature: exam-question-bank, Property 14: Exam validation rejects invalid payloads
 *
 * Validates: Requirements 8.7, 8.8, 8.9, 8.10, 13.5, 13.6, 13.7, 13.8, 13.9
 *
 * For any exam payload where at least one of the following holds:
 * (a) title is empty, (b) questions array is empty, (c) duration is <= 0,
 * (d) totalMarks is <= 0, or (e) the sum of individual question marks does
 * not equal the declared totalMarks — the Exam_Service should reject the
 * payload with validation errors.
 */

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build a valid exam question entry */
function makeQuestion(marks: number) {
    return { marks };
}

/** Build a valid base exam payload (all rules satisfied) */
function validExamPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        title: 'Sample Exam Title',
        questions: [makeQuestion(10), makeQuestion(10), makeQuestion(10)],
        duration: 60,
        totalMarks: 30,
        ...overrides,
    };
}

// ─── Property Tests ──────────────────────────────────────────────────────────

describe('Feature: exam-question-bank, Property 14: Exam validation rejects invalid payloads', () => {

    /**
     * Rule (a): title is empty → reject
     * Validates: Requirements 8.7, 13.5
     */
    it('rejects when title is empty or whitespace-only', () => {
        const emptyTitleArb = fc.constantFrom('', ' ', '  ', '\t', '\n', '   \t  ');

        fc.assert(
            fc.property(emptyTitleArb, (emptyTitle) => {
                const payload = validExamPayload({ title: emptyTitle });
                const result = validateExamPayload(payload);
                expect(result.valid).toBe(false);
                expect(result.errors.length).toBeGreaterThan(0);
                expect(result.errors.some((e) => e.toLowerCase().includes('title'))).toBe(true);
            }),
            { numRuns: 20 },
        );
    });

    /**
     * Rule (b): questions array is empty → reject
     * Validates: Requirements 8.8, 13.6
     */
    it('rejects when questions array is empty', () => {
        const emptyQuestionsArb = fc.constantFrom([], undefined, null);

        fc.assert(
            fc.property(emptyQuestionsArb, (questions) => {
                const payload = validExamPayload({ questions, totalMarks: 10 });
                const result = validateExamPayload(payload);
                expect(result.valid).toBe(false);
                expect(result.errors.some((e) => e.toLowerCase().includes('question'))).toBe(true);
            }),
            { numRuns: 20 },
        );
    });

    /**
     * Rule (c): duration is <= 0 → reject
     * Validates: Requirements 8.9, 13.7
     */
    it('rejects when duration is zero or negative', () => {
        const badDurationArb = fc.oneof(
            fc.constant(0),
            fc.integer({ min: -1000, max: -1 }),
            fc.double({ min: -1000, max: 0, noNaN: true }),
        );

        fc.assert(
            fc.property(badDurationArb, (badDuration) => {
                const payload = validExamPayload({ duration: badDuration });
                const result = validateExamPayload(payload);
                expect(result.valid).toBe(false);
                expect(result.errors.some((e) => e.toLowerCase().includes('duration'))).toBe(true);
            }),
            { numRuns: 20 },
        );
    });

    /**
     * Rule (d): totalMarks is <= 0 → reject
     * Validates: Requirements 8.10, 13.8
     */
    it('rejects when totalMarks is zero or negative', () => {
        const badMarksArb = fc.oneof(
            fc.constant(0),
            fc.integer({ min: -1000, max: -1 }),
            fc.double({ min: -1000, max: 0, noNaN: true }),
        );

        fc.assert(
            fc.property(badMarksArb, (badMarks) => {
                const questions = [makeQuestion(5), makeQuestion(5)];
                const payload = validExamPayload({ totalMarks: badMarks, questions });
                const result = validateExamPayload(payload);
                expect(result.valid).toBe(false);
                expect(result.errors.some((e) => e.toLowerCase().includes('total marks'))).toBe(true);
            }),
            { numRuns: 20 },
        );
    });

    /**
     * Rule (e): sum of individual question marks does not equal declared totalMarks → reject
     * Validates: Requirements 13.9
     */
    it('rejects when sum of question marks does not equal totalMarks', () => {
        // Generate questions with positive marks and a totalMarks that differs from their sum
        const mismatchArb = fc
            .array(fc.integer({ min: 1, max: 50 }), { minLength: 1, maxLength: 10 })
            .chain((marksList) => {
                const actualSum = marksList.reduce((a, b) => a + b, 0);
                // Generate a totalMarks that is NOT equal to the actual sum but is > 0
                const wrongTotalArb = fc
                    .integer({ min: 1, max: actualSum + 100 })
                    .filter((t) => t !== actualSum);
                return wrongTotalArb.map((wrongTotal) => ({
                    questions: marksList.map((m) => makeQuestion(m)),
                    totalMarks: wrongTotal,
                }));
            });

        fc.assert(
            fc.property(mismatchArb, ({ questions, totalMarks }) => {
                const payload = validExamPayload({ questions, totalMarks, duration: 60 });
                const result = validateExamPayload(payload);
                expect(result.valid).toBe(false);
                expect(result.errors.some((e) => e.toLowerCase().includes('sum'))).toBe(true);
            }),
            { numRuns: 20 },
        );
    });

    /**
     * Composite: a randomly chosen violation should always be rejected
     * Validates: Requirements 8.7, 8.8, 8.9, 8.10, 13.5, 13.6, 13.7, 13.8, 13.9
     */
    it('rejects any payload with at least one randomly chosen violation', () => {
        const violationArb = fc.integer({ min: 0, max: 4 }).chain((strategy) => {
            switch (strategy) {
                case 0:
                    // Empty title
                    return fc.constantFrom('', ' ', '\t').map((t) =>
                        validExamPayload({ title: t }),
                    );
                case 1:
                    // Empty questions
                    return fc.constant(validExamPayload({ questions: [], totalMarks: 10 }));
                case 2:
                    // Bad duration
                    return fc.integer({ min: -1000, max: 0 }).map((d) =>
                        validExamPayload({ duration: d }),
                    );
                case 3:
                    // Bad totalMarks
                    return fc.integer({ min: -1000, max: 0 }).map((m) =>
                        validExamPayload({ totalMarks: m, questions: [makeQuestion(5)] }),
                    );
                case 4:
                default:
                    // Marks mismatch
                    return fc.integer({ min: 1, max: 100 }).map((offset) => {
                        const questions = [makeQuestion(10), makeQuestion(10)];
                        return validExamPayload({
                            questions,
                            totalMarks: 20 + offset, // always mismatched
                        });
                    });
            }
        });

        fc.assert(
            fc.property(violationArb, (payload) => {
                const result = validateExamPayload(payload);
                expect(result.valid).toBe(false);
                expect(result.errors.length).toBeGreaterThan(0);
            }),
            { numRuns: 20 },
        );
    });
});
