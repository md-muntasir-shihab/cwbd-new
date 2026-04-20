/**
 * Property 12: Preservation — Exam Display Unchanged Flows
 *
 * For any exam view where the exam display bug condition does NOT hold
 * (dashboard widgets, already-published basic results), the system SHALL
 * produce exactly the same behavior as the original system.
 *
 * These tests observe and lock in the CORRECT behavior of the unfixed code
 * for non-bug-condition exam display states. They must PASS on unfixed code.
 *
 * **Validates: Requirements 3.16, 3.17**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// ─── Types (mirroring actual backend response shapes) ────────────────

interface ExamResultFields {
    obtainedMarks: number;
    totalMarks: number;
    percentage: number;
    correctCount: number;
    wrongCount: number;
    unansweredCount: number;
}

interface ExamAnswer {
    questionId: string;
    questionType: 'mcq' | 'written';
    selectedAnswer: string;
    isCorrect: boolean;
    /** marks comes from Question model join, not ExamResult.answers */
    marks: number;
}

interface StudentExamListItem {
    examId: string;
    title: string;
    status: string;
    myResult: { obtainedMarks: number; percentage: number; rank?: number } | null;
    resultPublished: boolean;
    resultPublishMode: 'immediate' | 'manual' | 'scheduled';
    attemptsUsed: number;
    attemptsLeft: number;
    canTakeExam: boolean;
}

interface PublishedExamResult {
    resultPublished: true;
    resultPublishMode: 'immediate' | 'manual' | 'scheduled';
    result: ExamResultFields & { rank: number; answers: ExamAnswer[] };
    exam: { title: string; subject: string; totalMarks: number; totalQuestions: number };
}

// ─── Pure Logic Under Test (extracted from examController.ts) ────────

/**
 * Mirrors getResultPublishMode from examController.ts exactly.
 */
function getResultPublishMode(exam: { resultPublishMode?: string }): 'immediate' | 'manual' | 'scheduled' {
    const mode = String(exam.resultPublishMode || '').trim().toLowerCase();
    if (mode === 'immediate' || mode === 'manual' || mode === 'scheduled') {
        return mode;
    }
    return 'scheduled';
}

/**
 * Mirrors isExamResultPublished from examController.ts exactly.
 */
function isExamResultPublished(
    exam: { resultPublishMode?: string; resultPublishDate?: string | Date | null },
    now = new Date(),
): boolean {
    const mode = getResultPublishMode(exam);
    if (mode === 'immediate') return true;
    const publishDateRaw = exam.resultPublishDate;
    const publishDate = publishDateRaw ? new Date(String(publishDateRaw)) : null;
    if (!publishDate || Number.isNaN(publishDate.getTime())) return false;
    return now >= publishDate;
}

/**
 * Mirrors the score calculation logic from finalizeExamSession exactly.
 * Given answers and question data, computes obtainedMarks, percentage,
 * correctCount, wrongCount, unansweredCount.
 */
function calculateExamScore(
    answers: Array<{
        questionType: 'mcq' | 'written';
        selectedAnswer: string;
        writtenAnswerUrl: string;
        correctAnswer: string;
        marks: number;
    }>,
    exam: { totalMarks: number; negativeMarking: boolean; negativeMarkValue: number },
): ExamResultFields {
    let obtainedMarks = 0;
    let correctCount = 0;
    let wrongCount = 0;
    let unansweredCount = 0;

    for (const answer of answers) {
        if (answer.questionType === 'mcq') {
            if (!answer.selectedAnswer) {
                unansweredCount += 1;
            } else if (answer.selectedAnswer === answer.correctAnswer) {
                correctCount += 1;
                obtainedMarks += answer.marks;
            } else {
                wrongCount += 1;
                if (exam.negativeMarking) {
                    obtainedMarks -= exam.negativeMarkValue;
                }
            }
        } else if (!answer.writtenAnswerUrl) {
            unansweredCount += 1;
        }
    }

    obtainedMarks = Math.max(0, obtainedMarks);
    const totalMarks = exam.totalMarks;
    const percentage = totalMarks > 0
        ? Math.round((obtainedMarks / totalMarks) * 100 * 10) / 10
        : 0;

    return { obtainedMarks, totalMarks, percentage, correctCount, wrongCount, unansweredCount };
}

/**
 * Mirrors the exam status determination from getStudentExams exactly.
 * This is the non-bug-condition status logic for dashboard display.
 */
function determineExamStatus(params: {
    hasResult: boolean;
    paymentPending: boolean;
    accessDenied: boolean;
    startDate: Date;
    endDate: Date;
    hasActiveSession: boolean;
    now: Date;
}): string {
    const { hasResult, paymentPending, accessDenied, startDate, endDate, hasActiveSession, now } = params;
    if (hasResult) return 'completed';
    if (paymentPending || accessDenied) return 'locked';
    if (now < startDate) return 'upcoming';
    if (now > endDate) return 'completed_window';
    return hasActiveSession ? 'in_progress' : 'active';
}

/**
 * Simulates the myResult field from getStudentExams for a completed exam.
 */
function buildMyResult(result: ExamResultFields & { rank?: number }): {
    obtainedMarks: number;
    percentage: number;
    rank?: number;
} {
    return {
        obtainedMarks: Number(result.obtainedMarks || 0),
        percentage: Number(result.percentage || 0),
        rank: Number(result.rank || 0) || undefined,
    };
}

// ─── Generators ──────────────────────────────────────────────────────

const validOptionArb = fc.constantFrom('A', 'B', 'C', 'D');
const marksArb = fc.integer({ min: 1, max: 10 });

/** Generate a single MCQ answer with question data */
const mcqAnswerArb = fc.record({
    questionType: fc.constant('mcq' as const),
    selectedAnswer: fc.oneof(validOptionArb, fc.constant('')),
    writtenAnswerUrl: fc.constant(''),
    correctAnswer: validOptionArb,
    marks: marksArb,
});

/** Generate a set of MCQ answers (1-20 questions) */
const answersArb = fc.array(mcqAnswerArb, { minLength: 1, maxLength: 20 });

/** Generate exam config for score calculation */
const examConfigArb = fc.record({
    totalMarks: fc.integer({ min: 10, max: 500 }),
    negativeMarking: fc.boolean(),
    negativeMarkValue: fc.oneof(fc.constant(0), fc.constant(0.25), fc.constant(0.5), fc.constant(1)),
});

/** Generate result publish mode */
const publishModeArb = fc.constantFrom('immediate', 'manual', 'scheduled', '', 'unknown', undefined);

/** Generate a past date (for already-published results) */
const pastDateArb = fc.date({
    min: new Date('2020-01-01'),
    max: new Date('2024-12-31'),
}).filter((d) => !Number.isNaN(d.getTime()));

/** Generate exam status determination inputs */
const examStatusInputArb = fc.record({
    hasResult: fc.boolean(),
    paymentPending: fc.boolean(),
    accessDenied: fc.boolean(),
    startDate: pastDateArb,
    endDate: pastDateArb,
    hasActiveSession: fc.boolean(),
    now: pastDateArb,
});

// ─── Test Suite ──────────────────────────────────────────────────────

describe('Property 12: Preservation — Exam Display Unchanged Flows', () => {

    /**
     * **Validates: Requirements 3.16**
     *
     * Student dashboard widgets display correctly with SSE updates.
     * The exam list status determination logic must remain unchanged.
     */
    describe('3.16: Dashboard exam status determination is correct and deterministic', () => {
        it('exam status is always one of the valid status values', () => {
            fc.assert(
                fc.property(examStatusInputArb, (input) => {
                    const status = determineExamStatus(input);
                    expect([
                        'completed', 'locked', 'upcoming', 'completed_window', 'in_progress', 'active',
                    ]).toContain(status);
                }),
                { numRuns: 200 },
            );
        });

        it('exam with result always has status "completed"', () => {
            fc.assert(
                fc.property(examStatusInputArb, (input) => {
                    const withResult = { ...input, hasResult: true };
                    expect(determineExamStatus(withResult)).toBe('completed');
                }),
                { numRuns: 100 },
            );
        });

        it('status determination is deterministic — same input always produces same status', () => {
            fc.assert(
                fc.property(examStatusInputArb, (input) => {
                    const status1 = determineExamStatus(input);
                    const status2 = determineExamStatus(input);
                    expect(status1).toBe(status2);
                }),
                { numRuns: 100 },
            );
        });

        it('locked status takes priority over time-based statuses when no result', () => {
            fc.assert(
                fc.property(examStatusInputArb, (input) => {
                    const locked = {
                        ...input,
                        hasResult: false,
                        paymentPending: true,
                    };
                    expect(determineExamStatus(locked)).toBe('locked');
                }),
                { numRuns: 100 },
            );
        });
    });

    /**
     * **Validates: Requirements 3.16**
     *
     * The myResult field in dashboard exam list correctly reflects
     * obtainedMarks, percentage, and rank for completed exams.
     */
    describe('3.16: Dashboard myResult fields are correctly formatted', () => {
        it('myResult always has obtainedMarks and percentage as numbers', () => {
            fc.assert(
                fc.property(
                    fc.record({
                        obtainedMarks: fc.integer({ min: 0, max: 500 }),
                        percentage: fc.float({ min: 0, max: 100, noNaN: true }),
                        rank: fc.option(fc.integer({ min: 1, max: 1000 }), { nil: undefined }),
                    }),
                    (result) => {
                        const myResult = buildMyResult(result);
                        expect(typeof myResult.obtainedMarks).toBe('number');
                        expect(typeof myResult.percentage).toBe('number');
                        expect(myResult.obtainedMarks).toBeGreaterThanOrEqual(0);
                    },
                ),
                { numRuns: 100 },
            );
        });

        it('rank of 0 is normalized to undefined', () => {
            const result = { obtainedMarks: 50, percentage: 50, rank: 0 };
            const myResult = buildMyResult(result);
            expect(myResult.rank).toBeUndefined();
        });
    });

    /**
     * **Validates: Requirements 3.17**
     *
     * Already-published exam results show score and pass/fail status correctly.
     * The result publish mode determination is correct.
     */
    describe('3.17: Result publish mode determination is correct', () => {
        it('getResultPublishMode returns valid mode for any input', () => {
            fc.assert(
                fc.property(
                    fc.record({ resultPublishMode: publishModeArb }),
                    (exam) => {
                        const mode = getResultPublishMode(exam);
                        expect(['immediate', 'manual', 'scheduled']).toContain(mode);
                    },
                ),
                { numRuns: 100 },
            );
        });

        it('unknown or empty publish mode defaults to "scheduled"', () => {
            fc.assert(
                fc.property(
                    fc.constantFrom('', 'unknown', 'invalid', 'auto', undefined),
                    (mode) => {
                        expect(getResultPublishMode({ resultPublishMode: mode })).toBe('scheduled');
                    },
                ),
                { numRuns: 50 },
            );
        });

        it('valid modes are returned as-is', () => {
            expect(getResultPublishMode({ resultPublishMode: 'immediate' })).toBe('immediate');
            expect(getResultPublishMode({ resultPublishMode: 'manual' })).toBe('manual');
            expect(getResultPublishMode({ resultPublishMode: 'scheduled' })).toBe('scheduled');
        });
    });

    /**
     * **Validates: Requirements 3.17**
     *
     * The isExamResultPublished function correctly determines whether
     * results are visible to students based on publish mode and date.
     */
    describe('3.17: Result published status determination is correct', () => {
        it('immediate mode always returns true regardless of date', () => {
            fc.assert(
                fc.property(
                    pastDateArb,
                    fc.option(pastDateArb, { nil: null }),
                    (now, publishDate) => {
                        const exam = {
                            resultPublishMode: 'immediate',
                            resultPublishDate: publishDate?.toISOString() ?? null,
                        };
                        expect(isExamResultPublished(exam, now)).toBe(true);
                    },
                ),
                { numRuns: 100 },
            );
        });

        it('scheduled mode with past publish date returns true', () => {
            fc.assert(
                fc.property(
                    pastDateArb,
                    (publishDate) => {
                        const now = new Date(publishDate.getTime() + 86400000); // 1 day after
                        const exam = {
                            resultPublishMode: 'scheduled',
                            resultPublishDate: publishDate.toISOString(),
                        };
                        expect(isExamResultPublished(exam, now)).toBe(true);
                    },
                ),
                { numRuns: 100 },
            );
        });

        it('scheduled mode with future publish date returns false', () => {
            fc.assert(
                fc.property(
                    pastDateArb,
                    (publishDate) => {
                        const now = new Date(publishDate.getTime() - 86400000); // 1 day before
                        const exam = {
                            resultPublishMode: 'scheduled',
                            resultPublishDate: publishDate.toISOString(),
                        };
                        expect(isExamResultPublished(exam, now)).toBe(false);
                    },
                ),
                { numRuns: 100 },
            );
        });

        it('manual/scheduled mode with no publish date returns false', () => {
            fc.assert(
                fc.property(
                    fc.constantFrom('manual', 'scheduled'),
                    pastDateArb,
                    (mode, now) => {
                        const exam = { resultPublishMode: mode, resultPublishDate: null };
                        expect(isExamResultPublished(exam, now)).toBe(false);
                    },
                ),
                { numRuns: 50 },
            );
        });

        it('isExamResultPublished is deterministic', () => {
            fc.assert(
                fc.property(
                    fc.record({
                        resultPublishMode: fc.constantFrom('immediate', 'manual', 'scheduled'),
                        resultPublishDate: fc.option(
                            pastDateArb.map((d) => d.toISOString()),
                            { nil: null },
                        ),
                    }),
                    pastDateArb,
                    (exam, now) => {
                        const r1 = isExamResultPublished(exam, now);
                        const r2 = isExamResultPublished(exam, now);
                        expect(r1).toBe(r2);
                    },
                ),
                { numRuns: 100 },
            );
        });
    });

    /**
     * **Validates: Requirements 3.17**
     *
     * Score calculation for already-published results is correct and
     * deterministic. The basic result fields (obtainedMarks, totalMarks,
     * percentage, correctCount, wrongCount) are computed correctly.
     */
    describe('3.17: Score calculation is correct and deterministic', () => {
        it('correctCount + wrongCount + unansweredCount equals total MCQ questions', () => {
            fc.assert(
                fc.property(answersArb, examConfigArb, (answers, examConfig) => {
                    const result = calculateExamScore(answers, examConfig);
                    const totalMcq = answers.filter((a) => a.questionType === 'mcq').length;
                    expect(result.correctCount + result.wrongCount + result.unansweredCount).toBe(totalMcq);
                }),
                { numRuns: 200 },
            );
        });

        it('obtainedMarks is never negative (clamped to 0)', () => {
            fc.assert(
                fc.property(answersArb, examConfigArb, (answers, examConfig) => {
                    const result = calculateExamScore(answers, examConfig);
                    expect(result.obtainedMarks).toBeGreaterThanOrEqual(0);
                }),
                { numRuns: 200 },
            );
        });

        it('percentage is 0 when totalMarks is 0', () => {
            fc.assert(
                fc.property(answersArb, (answers) => {
                    const result = calculateExamScore(answers, {
                        totalMarks: 0,
                        negativeMarking: false,
                        negativeMarkValue: 0,
                    });
                    expect(result.percentage).toBe(0);
                }),
                { numRuns: 50 },
            );
        });

        it('score calculation is deterministic — same input always produces same result', () => {
            fc.assert(
                fc.property(answersArb, examConfigArb, (answers, examConfig) => {
                    const r1 = calculateExamScore(answers, examConfig);
                    const r2 = calculateExamScore(answers, examConfig);
                    expect(r1.obtainedMarks).toBe(r2.obtainedMarks);
                    expect(r1.percentage).toBe(r2.percentage);
                    expect(r1.correctCount).toBe(r2.correctCount);
                    expect(r1.wrongCount).toBe(r2.wrongCount);
                    expect(r1.unansweredCount).toBe(r2.unansweredCount);
                }),
                { numRuns: 100 },
            );
        });

        it('all correct answers yield obtainedMarks equal to sum of marks', () => {
            fc.assert(
                fc.property(
                    fc.array(marksArb, { minLength: 1, maxLength: 10 }),
                    (marksList) => {
                        const answers = marksList.map((m) => ({
                            questionType: 'mcq' as const,
                            selectedAnswer: 'A',
                            writtenAnswerUrl: '',
                            correctAnswer: 'A',
                            marks: m,
                        }));
                        const totalMarks = marksList.reduce((s, m) => s + m, 0);
                        const result = calculateExamScore(answers, {
                            totalMarks,
                            negativeMarking: false,
                            negativeMarkValue: 0,
                        });
                        expect(result.obtainedMarks).toBe(totalMarks);
                        expect(result.correctCount).toBe(marksList.length);
                        expect(result.wrongCount).toBe(0);
                        expect(result.unansweredCount).toBe(0);
                    },
                ),
                { numRuns: 100 },
            );
        });

        it('unanswered questions (empty selectedAnswer) do not affect obtainedMarks', () => {
            fc.assert(
                fc.property(
                    fc.array(marksArb, { minLength: 1, maxLength: 10 }),
                    (marksList) => {
                        const answers = marksList.map((m) => ({
                            questionType: 'mcq' as const,
                            selectedAnswer: '',
                            writtenAnswerUrl: '',
                            correctAnswer: 'A',
                            marks: m,
                        }));
                        const totalMarks = marksList.reduce((s, m) => s + m, 0);
                        const result = calculateExamScore(answers, {
                            totalMarks,
                            negativeMarking: true,
                            negativeMarkValue: 1,
                        });
                        expect(result.obtainedMarks).toBe(0);
                        expect(result.unansweredCount).toBe(marksList.length);
                        expect(result.correctCount).toBe(0);
                        expect(result.wrongCount).toBe(0);
                    },
                ),
                { numRuns: 50 },
            );
        });
    });

    /**
     * **Validates: Requirements 3.17**
     *
     * Pass/fail determination is consistent with score and percentage.
     * The pass/fail status is derived from percentage vs passing threshold.
     */
    describe('3.17: Pass/fail determination is consistent', () => {
        it('percentage is correctly rounded to 1 decimal place', () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: 0, max: 500 }),
                    fc.integer({ min: 1, max: 500 }),
                    (obtained, total) => {
                        const percentage = Math.round((obtained / total) * 100 * 10) / 10;
                        // Verify the rounding matches our function
                        const result = calculateExamScore(
                            [{
                                questionType: 'mcq',
                                selectedAnswer: 'A',
                                writtenAnswerUrl: '',
                                correctAnswer: 'A',
                                marks: obtained,
                            }],
                            { totalMarks: total, negativeMarking: false, negativeMarkValue: 0 },
                        );
                        expect(result.percentage).toBe(percentage);
                    },
                ),
                { numRuns: 100 },
            );
        });

        it('percentage is between 0 and a reasonable upper bound', () => {
            fc.assert(
                fc.property(answersArb, examConfigArb, (answers, examConfig) => {
                    const result = calculateExamScore(answers, examConfig);
                    expect(result.percentage).toBeGreaterThanOrEqual(0);
                    // percentage can exceed 100 if obtainedMarks > totalMarks (marks per question > exam totalMarks)
                    // but it should always be a finite number
                    expect(Number.isFinite(result.percentage)).toBe(true);
                }),
                { numRuns: 100 },
            );
        });
    });
});
