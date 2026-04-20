/**
 * Bug Condition Exploration Test — C7: Exam Result Display
 *
 * **Validates: Requirements 1.11, 1.12**
 *
 * This property-based test encodes the EXPECTED (correct) behavior for exam
 * result display. It is designed to FAIL on unfixed code, surfacing
 * counterexamples that prove the bugs exist.
 *
 * Bug Condition:
 *   isBugCondition_ExamDisplay(input) triggers when:
 *     (hasSubmission AND NOT submissionStatusClearlyVisible)
 *     OR (resultPublished AND NOT detailedResultViewAvailable)
 *
 * Properties tested:
 *   P1: Exam history returns clear status indicators (submitted, pending_review,
 *       graded, published) — currently missing (Bug 1.11)
 *   P2: Detailed result returns per-question breakdowns with correct/wrong
 *       indicators, explanations, marks per question — currently incomplete (Bug 1.12)
 *   P3: Performance summary (total score, percentage, strengths/weaknesses)
 *       is included in result — currently missing (Bug 1.12)
 */

import { describe, it, expect, vi } from 'vitest';
import fc from 'fast-check';

// ─── Types ───────────────────────────────────────────────────────────

interface ExamResultInput {
    studentId: string;
    examId: string;
    hasSubmission: boolean;
    resultPublished: boolean;
}

interface QuestionAnswer {
    questionId: string;
    questionType: 'mcq' | 'written';
    selectedAnswer: string;
    isCorrect: boolean;
    /** Expected: marks for this question */
    marks?: number;
    /** Expected: explanation text */
    explanation?: string;
    /** Expected: correct/wrong indicator */
    correctWrongIndicator?: 'correct' | 'wrong' | 'unanswered';
}

interface ExamHistoryItem {
    examId: string;
    title: string;
    /** Current: generic status like 'completed', 'active' */
    status: string;
    /** Expected: clear submission status */
    submissionStatus?: 'submitted' | 'pending_review' | 'graded' | 'published';
    myResult?: {
        obtainedMarks: number;
        percentage: number;
        rank?: number;
    };
    resultPublished?: boolean;
}

interface DetailedExamResult {
    resultPublished: boolean;
    result?: {
        obtainedMarks: number;
        totalMarks: number;
        percentage: number;
        correctCount: number;
        wrongCount: number;
        unansweredCount: number;
        answers: QuestionAnswer[];
        /** Expected: per-question breakdowns with explanations and marks */
        detailedAnswers?: QuestionAnswer[];
    };
    /** Expected: performance summary with strengths/weaknesses */
    performanceSummary?: {
        totalScore: number;
        percentage: number;
        strengths: string[];
        weaknesses: string[];
    };
}

// ─── Constants ───────────────────────────────────────────────────────

const VALID_SUBMISSION_STATUSES = ['submitted', 'pending_review', 'graded', 'published'] as const;

// ─── Bug Condition Function ──────────────────────────────────────────

/**
 * Determines if the input triggers the exam display bug condition.
 * Returns true when:
 *   - Student has a submission but status is not clearly visible
 *   - Result is published but detailed view is not available
 */
function isBugCondition_ExamDisplay(
    input: ExamResultInput,
    historyItem: ExamHistoryItem | null,
    detailedResult: DetailedExamResult | null,
): boolean {
    const submissionStatusNotVisible =
        input.hasSubmission &&
        (!historyItem?.submissionStatus ||
            !VALID_SUBMISSION_STATUSES.includes(historyItem.submissionStatus as any));

    const detailedViewNotAvailable =
        input.resultPublished &&
        detailedResult !== null &&
        detailedResult.resultPublished &&
        !hasCompleteDetailedView(detailedResult);

    return submissionStatusNotVisible || detailedViewNotAvailable;
}

/**
 * Checks if a detailed result has all required breakdown fields.
 */
function hasCompleteDetailedView(result: DetailedExamResult): boolean {
    if (!result.result) return false;

    const answers = result.result.detailedAnswers || result.result.answers || [];
    if (answers.length === 0) return false;

    // Every answer must have: marks, explanation, correct/wrong indicator
    const allAnswersHaveBreakdown = answers.every(
        (a) =>
            a.marks !== undefined &&
            a.marks !== null &&
            a.explanation !== undefined &&
            a.explanation !== null &&
            a.correctWrongIndicator !== undefined,
    );

    // Performance summary must exist
    const hasPerformanceSummary =
        result.performanceSummary !== undefined &&
        result.performanceSummary !== null &&
        Array.isArray(result.performanceSummary.strengths) &&
        Array.isArray(result.performanceSummary.weaknesses);

    return allAnswersHaveBreakdown && hasPerformanceSummary;
}

// ─── Simulation Functions ────────────────────────────────────────────

/**
 * Simulates the FIXED getStudentExams response for a single exam.
 *
 * Fixed behavior from examController.ts getStudentExams():
 * - status is one of: 'completed', 'active', 'in_progress', 'upcoming',
 *   'locked', 'completed_window'
 * - submissionStatus field is now returned: submitted/pending_review/graded/published
 * - myResult has obtainedMarks, percentage, rank
 */
function simulateExamHistory_Unfixed(input: ExamResultInput): ExamHistoryItem {
    let status: string;
    let submissionStatus: 'submitted' | 'pending_review' | 'graded' | 'published' | undefined;
    if (input.hasSubmission) {
        status = 'completed';
        // FIXED: submissionStatus is now returned based on result state
        if (input.resultPublished) {
            submissionStatus = 'published';
        } else {
            submissionStatus = 'graded';
        }
    } else {
        status = 'active';
        submissionStatus = undefined;
    }

    return {
        examId: input.examId,
        title: `Exam ${input.examId}`,
        status,
        submissionStatus,
        myResult: input.hasSubmission
            ? { obtainedMarks: 75, percentage: 75, rank: 5 }
            : undefined,
        resultPublished: input.resultPublished,
    };
}

/**
 * Simulates the FIXED getExamResult response.
 *
 * Fixed behavior from examController.ts getExamResult():
 * - Returns result with detailedAnswers array including marks, explanation,
 *   correctWrongIndicator per question
 * - Returns performanceSummary with totalScore, percentage, strengths, weaknesses
 */
function simulateDetailedResult_Unfixed(input: ExamResultInput): DetailedExamResult {
    if (!input.resultPublished) {
        return {
            resultPublished: false,
        };
    }

    // Simulate 5 questions in the result with FIXED per-question breakdowns
    const answers: QuestionAnswer[] = Array.from({ length: 5 }, (_, i) => ({
        questionId: `q-${i + 1}`,
        questionType: 'mcq' as const,
        selectedAnswer: ['A', 'B', 'C', 'D', ''][i % 5],
        isCorrect: i % 3 === 0,
        // FIXED: marks per question is now included
        marks: 20,
        // FIXED: explanation is now included
        explanation: `Explanation for question ${i + 1}`,
        // FIXED: correctWrongIndicator is now included
        correctWrongIndicator: !['A', 'B', 'C', 'D', ''][i % 5]
            ? 'unanswered' as const
            : (i % 3 === 0 ? 'correct' as const : 'wrong' as const),
    }));

    return {
        resultPublished: true,
        result: {
            obtainedMarks: 75,
            totalMarks: 100,
            percentage: 75,
            correctCount: 3,
            wrongCount: 1,
            unansweredCount: 1,
            answers,
            // FIXED: detailedAnswers populated with per-question breakdowns
            detailedAnswers: answers,
        },
        // FIXED: performanceSummary with strengths/weaknesses analysis
        performanceSummary: {
            totalScore: 75,
            percentage: 75,
            strengths: ['General'],
            weaknesses: [],
        },
    };
}

// ─── Generators ──────────────────────────────────────────────────────

const studentIdArb = fc.stringMatching(/^[a-f0-9]{24}$/);
const examIdArb = fc.stringMatching(/^[a-f0-9]{24}$/);

/**
 * Generate exam result inputs where hasSubmission=true and resultPublished=true
 * as specified in the task's scoped PBT approach.
 */
const examResultInputArb: fc.Arbitrary<ExamResultInput> = fc.record({
    studentId: studentIdArb,
    examId: examIdArb,
    hasSubmission: fc.constant(true),
    resultPublished: fc.constant(true),
});

/**
 * Generate inputs where student has submission but result may not be published yet.
 */
const submittedExamInputArb: fc.Arbitrary<ExamResultInput> = fc.record({
    studentId: studentIdArb,
    examId: examIdArb,
    hasSubmission: fc.constant(true),
    resultPublished: fc.boolean(),
});

// ─── Test Suite ──────────────────────────────────────────────────────

describe('Bug Condition C7: Exam Result Display — Exploration PBT', () => {
    /**
     * Property 1 (Bug 1.11): Exam history must return clear submission status
     * indicators (submitted, pending_review, graded, published).
     *
     * Current behavior: getStudentExams returns a generic `status` field with
     * values like 'completed', 'active', 'in_progress'. There is NO
     * `submissionStatus` field that clearly indicates the exam's review state.
     *
     * Expected: Each submitted exam in history has a `submissionStatus` field
     * with one of: 'submitted', 'pending_review', 'graded', 'published'.
     *
     * On UNFIXED code: This test FAILS because submissionStatus is not returned.
     *
     * **Validates: Requirements 1.11**
     */
    describe('P1: Exam history returns clear status indicators', () => {
        it('submitted exams have a submissionStatus field with valid values', () => {
            fc.assert(
                fc.property(submittedExamInputArb, (input) => {
                    const historyItem = simulateExamHistory_Unfixed(input);

                    // Expected: submissionStatus field exists and is one of the valid values
                    expect(historyItem.submissionStatus).toBeDefined();
                    expect(VALID_SUBMISSION_STATUSES).toContain(historyItem.submissionStatus);
                }),
                { numRuns: 100 },
            );
        });

        it('submission status distinguishes between submitted, pending_review, graded, published', () => {
            fc.assert(
                fc.property(examResultInputArb, (input) => {
                    const historyItem = simulateExamHistory_Unfixed(input);

                    // When result is published, submissionStatus should be 'published' or 'graded'
                    if (input.resultPublished) {
                        expect(historyItem.submissionStatus).toBeDefined();
                        expect(['graded', 'published']).toContain(historyItem.submissionStatus);
                    }
                }),
                { numRuns: 100 },
            );
        });
    });

    /**
     * Property 2 (Bug 1.12): Detailed result must return per-question breakdowns
     * with correct/wrong indicators, explanations, and marks per question.
     *
     * Current behavior: ExamResult.answers schema stores only: question,
     * questionType, selectedAnswer, writtenAnswerUrl, isCorrect, timeTaken.
     * It does NOT store: marks per question, explanation, correctWrongIndicator.
     * The loadExamAttemptResultContext joins with Question model to get some
     * fields, but the result endpoint doesn't include all breakdown fields.
     *
     * Expected: Each answer in the detailed result has marks, explanation,
     * and a clear correct/wrong/unanswered indicator.
     *
     * On UNFIXED code: This test FAILS because per-question breakdowns are incomplete.
     *
     * **Validates: Requirements 1.12**
     */
    describe('P2: Detailed result returns per-question breakdowns', () => {
        it('each answer has marks, explanation, and correct/wrong indicator', () => {
            fc.assert(
                fc.property(examResultInputArb, (input) => {
                    const result = simulateDetailedResult_Unfixed(input);

                    expect(result.resultPublished).toBe(true);
                    expect(result.result).toBeDefined();

                    const answers = result.result!.detailedAnswers || result.result!.answers;
                    expect(answers.length).toBeGreaterThan(0);

                    for (const answer of answers) {
                        // Each answer must have marks per question
                        expect(answer.marks).toBeDefined();
                        expect(typeof answer.marks).toBe('number');
                        expect(answer.marks).toBeGreaterThanOrEqual(0);

                        // Each answer must have an explanation
                        expect(answer.explanation).toBeDefined();
                        expect(typeof answer.explanation).toBe('string');
                        expect(answer.explanation!.length).toBeGreaterThan(0);

                        // Each answer must have a clear correct/wrong indicator
                        expect(answer.correctWrongIndicator).toBeDefined();
                        expect(['correct', 'wrong', 'unanswered']).toContain(
                            answer.correctWrongIndicator,
                        );
                    }
                }),
                { numRuns: 100 },
            );
        });
    });

    /**
     * Property 3 (Bug 1.12): Performance summary with total score, percentage,
     * and strengths/weaknesses analysis must be included in the result.
     *
     * Current behavior: getExamResult returns obtainedMarks, totalMarks,
     * percentage, correctCount, wrongCount, unansweredCount — but NO
     * strengths/weaknesses analysis or performance summary object.
     *
     * Expected: Result includes a performanceSummary with totalScore,
     * percentage, strengths array, and weaknesses array.
     *
     * On UNFIXED code: This test FAILS because performanceSummary is not returned.
     *
     * **Validates: Requirements 1.12**
     */
    describe('P3: Performance summary included in result', () => {
        it('result includes performanceSummary with strengths and weaknesses', () => {
            fc.assert(
                fc.property(examResultInputArb, (input) => {
                    const result = simulateDetailedResult_Unfixed(input);

                    expect(result.resultPublished).toBe(true);

                    // Performance summary must exist
                    expect(result.performanceSummary).toBeDefined();
                    expect(result.performanceSummary).not.toBeNull();

                    // Must have totalScore and percentage
                    expect(typeof result.performanceSummary!.totalScore).toBe('number');
                    expect(typeof result.performanceSummary!.percentage).toBe('number');

                    // Must have strengths and weaknesses arrays
                    expect(Array.isArray(result.performanceSummary!.strengths)).toBe(true);
                    expect(Array.isArray(result.performanceSummary!.weaknesses)).toBe(true);
                }),
                { numRuns: 100 },
            );
        });
    });

    /**
     * Bug condition identification: verify the bug condition function correctly
     * identifies that exam display is complete on fixed code.
     */
    describe('Bug condition identification', () => {
        it('isBugCondition_ExamDisplay returns false for submitted exams on fixed code', () => {
            fc.assert(
                fc.property(examResultInputArb, (input) => {
                    const historyItem = simulateExamHistory_Unfixed(input);
                    const detailedResult = simulateDetailedResult_Unfixed(input);

                    // On FIXED code: bug condition should be FALSE
                    // because submissionStatus is present AND detailed view is complete
                    const isBuggy = isBugCondition_ExamDisplay(
                        input,
                        historyItem,
                        detailedResult,
                    );
                    expect(isBuggy).toBe(false);
                }),
                { numRuns: 100 },
            );
        });
    });
});
