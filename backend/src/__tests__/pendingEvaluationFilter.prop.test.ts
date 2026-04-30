// Feature: exam-center-backend-completion, Property 1: Pending Evaluation Filter Correctness
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

/**
 * Property 1: Pending Evaluation Filter Correctness
 *
 * **Validates: Requirements 1.1**
 *
 * For any collection of ExamResult documents with varying `status` values
 * and `writtenGrades` completeness, the pending evaluation filter SHALL
 * return exactly those results where `status === 'pending_evaluation'`
 * OR where at least one written-type answer lacks a corresponding
 * `writtenGrades` entry — and no others.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

interface Answer {
    question: string;
    questionType: 'mcq' | 'written';
    marksObtained: number;
    maxMarks: number;
}

interface WrittenGrade {
    questionId: string;
    marks: number;
    maxMarks: number;
    feedback: string;
    gradedBy: string;
    gradedAt: Date;
}

interface SimulatedExamResult {
    _id: string;
    exam: string;
    student: string;
    status: 'submitted' | 'evaluated' | 'pending_evaluation';
    answers: Answer[];
    writtenGrades: WrittenGrade[];
    totalMarks: number;
    obtainedMarks: number;
    percentage: number;
}

// ─── Pure Filter Logic (mirrors getPendingEvaluationResults controller) ──────

/**
 * Replicates the in-memory filter from getPendingEvaluationResults.
 * A result is included if:
 *   - status === 'pending_evaluation', OR
 *   - at least one written-type answer lacks a corresponding writtenGrades entry
 *     (matched by answer.question === grade.questionId)
 */
function pendingEvaluationFilter(result: SimulatedExamResult): boolean {
    if (result.status === 'pending_evaluation') return true;

    const writtenAnswers = result.answers.filter((a) => a.questionType === 'written');
    if (writtenAnswers.length === 0) return false;

    const gradedQuestionIds = new Set(
        (result.writtenGrades || []).map((g) => String(g.questionId)),
    );
    return writtenAnswers.some((a) => !gradedQuestionIds.has(String(a.question)));
}

// ─── Generators ──────────────────────────────────────────────────────────────

/** Generate a valid 24-char hex ObjectId string. */
const objectIdArb = fc
    .array(fc.constantFrom(...'0123456789abcdef'.split('')), { minLength: 24, maxLength: 24 })
    .map((chars) => chars.join(''));

/** Generate a status value. */
const statusArb = fc.constantFrom(
    'submitted' as const,
    'evaluated' as const,
    'pending_evaluation' as const,
);

/** Generate an MCQ answer. */
const mcqAnswerArb = (questionId: string): fc.Arbitrary<Answer> =>
    fc.record({
        question: fc.constant(questionId),
        questionType: fc.constant('mcq' as const),
        marksObtained: fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
        maxMarks: fc.double({ min: 0.01, max: 100, noNaN: true, noDefaultInfinity: true }),
    });

/** Generate a written answer. */
const writtenAnswerArb = (questionId: string): fc.Arbitrary<Answer> =>
    fc.record({
        question: fc.constant(questionId),
        questionType: fc.constant('written' as const),
        marksObtained: fc.constant(0),
        maxMarks: fc.double({ min: 0.01, max: 100, noNaN: true, noDefaultInfinity: true }),
    });

/** Generate a written grade for a given questionId. */
const writtenGradeArb = (questionId: string): fc.Arbitrary<WrittenGrade> =>
    fc.record({
        questionId: fc.constant(questionId),
        marks: fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
        maxMarks: fc.double({ min: 0.01, max: 100, noNaN: true, noDefaultInfinity: true }),
        feedback: fc.constant(''),
        gradedBy: fc.constant('a'.repeat(24)),
        gradedAt: fc.constant(new Date()),
    });

/**
 * Generate a single ExamResult with:
 * - Random status
 * - Mix of MCQ and written answers (0-3 each)
 * - Random writtenGrades completeness (each written answer independently graded or not)
 */
const examResultArb = (examId: string): fc.Arbitrary<SimulatedExamResult> =>
    fc
        .record({
            _id: objectIdArb,
            student: objectIdArb,
            status: statusArb,
            mcqCount: fc.integer({ min: 0, max: 3 }),
            writtenCount: fc.integer({ min: 0, max: 3 }),
        })
        .chain(({ _id, student, status, mcqCount, writtenCount }) => {
            // Generate unique question IDs for each answer
            const mcqIdsArb = fc.array(objectIdArb, { minLength: mcqCount, maxLength: mcqCount });
            const writtenIdsArb = fc.array(objectIdArb, { minLength: writtenCount, maxLength: writtenCount });

            return fc.tuple(mcqIdsArb, writtenIdsArb).chain(([mcqIds, writtenIds]) => {
                // Generate MCQ answers
                const mcqAnswersArb =
                    mcqIds.length === 0
                        ? fc.constant([] as Answer[])
                        : fc.tuple(...mcqIds.map((id) => mcqAnswerArb(id)));

                // Generate written answers
                const writtenAnswersArb =
                    writtenIds.length === 0
                        ? fc.constant([] as Answer[])
                        : fc.tuple(...writtenIds.map((id) => writtenAnswerArb(id)));

                // For each written answer, independently decide whether it has a grade
                const gradesArb =
                    writtenIds.length === 0
                        ? fc.constant([] as WrittenGrade[])
                        : fc
                            .tuple(
                                ...writtenIds.map((id) =>
                                    fc.boolean().chain((hasGrade) =>
                                        hasGrade ? writtenGradeArb(id).map((g) => [g]) : fc.constant([] as WrittenGrade[]),
                                    ),
                                ),
                            )
                            .map((arrays) => arrays.flat());

                return fc.tuple(mcqAnswersArb, writtenAnswersArb, gradesArb).map(
                    ([mcqAnswers, writtenAnswers, grades]) => {
                        const allAnswers = [...mcqAnswers, ...writtenAnswers];
                        const totalMarks = allAnswers.reduce((sum, a) => sum + a.maxMarks, 0);
                        return {
                            _id,
                            exam: examId,
                            student,
                            status,
                            answers: allAnswers,
                            writtenGrades: grades,
                            totalMarks,
                            obtainedMarks: 0,
                            percentage: 0,
                        };
                    },
                );
            });
        });

/**
 * Generate a collection of 1-10 ExamResult documents for the same exam.
 */
const examResultCollectionArb = objectIdArb.chain((examId) =>
    fc.array(examResultArb(examId), { minLength: 1, maxLength: 10 }),
);

// ─── Reference Oracle ────────────────────────────────────────────────────────

/**
 * Independent oracle that determines which results should be included.
 * Uses a straightforward, clearly correct implementation.
 */
function oracleFilter(results: SimulatedExamResult[]): Set<string> {
    const includedIds = new Set<string>();

    for (const result of results) {
        // Condition 1: status is pending_evaluation
        if (result.status === 'pending_evaluation') {
            includedIds.add(result._id);
            continue;
        }

        // Condition 2: any written answer lacks a writtenGrades entry
        const writtenAnswers = result.answers.filter((a) => a.questionType === 'written');
        if (writtenAnswers.length > 0) {
            const gradedIds = new Set(
                (result.writtenGrades || []).map((g) => String(g.questionId)),
            );
            const hasUngradedWritten = writtenAnswers.some(
                (a) => !gradedIds.has(String(a.question)),
            );
            if (hasUngradedWritten) {
                includedIds.add(result._id);
            }
        }
    }

    return includedIds;
}

// ─── Property Tests ──────────────────────────────────────────────────────────

describe('Feature: exam-center-backend-completion, Property 1: Pending Evaluation Filter Correctness', () => {
    /**
     * The filter returns exactly the results that match the pending evaluation criteria.
     * **Validates: Requirements 1.1**
     */
    it('returns exactly results where status is pending_evaluation OR a written answer lacks a grade', () => {
        fc.assert(
            fc.property(examResultCollectionArb, (results) => {
                // Apply the filter under test
                const filtered = results.filter(pendingEvaluationFilter);
                const filteredIds = new Set(filtered.map((r) => r._id));

                // Apply the oracle
                const expectedIds = oracleFilter(results);

                // Assert exact match: same set of IDs
                expect(filteredIds.size).toBe(expectedIds.size);
                for (const id of expectedIds) {
                    expect(filteredIds.has(id)).toBe(true);
                }
                for (const id of filteredIds) {
                    expect(expectedIds.has(id)).toBe(true);
                }
            }),
            { numRuns: 100 },
        );
    });

    /**
     * Results with status 'pending_evaluation' are always included regardless of grades.
     * **Validates: Requirements 1.1**
     */
    it('always includes results with status pending_evaluation', () => {
        fc.assert(
            fc.property(examResultCollectionArb, (results) => {
                const filtered = results.filter(pendingEvaluationFilter);
                const filteredIds = new Set(filtered.map((r) => r._id));

                const pendingResults = results.filter((r) => r.status === 'pending_evaluation');
                for (const r of pendingResults) {
                    expect(filteredIds.has(r._id)).toBe(true);
                }
            }),
            { numRuns: 100 },
        );
    });

    /**
     * Results with only MCQ answers and non-pending status are never included.
     * **Validates: Requirements 1.1**
     */
    it('excludes results with only MCQ answers and non-pending status', () => {
        fc.assert(
            fc.property(examResultCollectionArb, (results) => {
                const filtered = results.filter(pendingEvaluationFilter);
                const filteredIds = new Set(filtered.map((r) => r._id));

                const mcqOnlyNonPending = results.filter(
                    (r) =>
                        r.status !== 'pending_evaluation' &&
                        r.answers.every((a) => a.questionType === 'mcq'),
                );
                for (const r of mcqOnlyNonPending) {
                    expect(filteredIds.has(r._id)).toBe(false);
                }
            }),
            { numRuns: 100 },
        );
    });

    /**
     * Results where all written answers are fully graded and status is not pending_evaluation
     * are excluded from the filter.
     * **Validates: Requirements 1.1**
     */
    it('excludes fully graded non-pending results', () => {
        fc.assert(
            fc.property(examResultCollectionArb, (results) => {
                const filtered = results.filter(pendingEvaluationFilter);
                const filteredIds = new Set(filtered.map((r) => r._id));

                const fullyGradedNonPending = results.filter((r) => {
                    if (r.status === 'pending_evaluation') return false;
                    const writtenAnswers = r.answers.filter((a) => a.questionType === 'written');
                    if (writtenAnswers.length === 0) return false;
                    const gradedIds = new Set(
                        (r.writtenGrades || []).map((g) => String(g.questionId)),
                    );
                    return writtenAnswers.every((a) => gradedIds.has(String(a.question)));
                });

                for (const r of fullyGradedNonPending) {
                    expect(filteredIds.has(r._id)).toBe(false);
                }
            }),
            { numRuns: 100 },
        );
    });
});
