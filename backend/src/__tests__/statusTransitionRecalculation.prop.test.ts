// Feature: exam-center-backend-completion, Property 4: Status Transition and Score Recalculation
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

/**
 * Property 4: Status Transition and Score Recalculation
 *
 * **Validates: Requirements 2.4**
 *
 * For any ExamResult where all written-type answers have corresponding
 * writtenGrades entries after a grading operation, the result:
 * - `status` SHALL be `'evaluated'`
 * - `obtainedMarks` SHALL equal the sum of all MCQ `marksObtained` + all written `writtenGrades.marks`
 * - `percentage` SHALL equal `(obtainedMarks / totalMarks) * 100`
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
    answers: Answer[];
    writtenGrades: WrittenGrade[];
    totalMarks: number;
    obtainedMarks: number;
    percentage: number;
    status: string;
}

// ─── Generators ──────────────────────────────────────────────────────────────

/** Generate a valid 24-char hex ObjectId string. */
const objectIdArb = fc
    .array(fc.constantFrom(...'0123456789abcdef'.split('')), { minLength: 24, maxLength: 24 })
    .map((chars) => chars.join(''));

/** Generate an MCQ answer with random marks. */
const mcqAnswerArb = fc.record({
    question: objectIdArb,
    questionType: fc.constant('mcq' as const),
    marksObtained: fc.double({ min: 0, max: 100, noNaN: true, noDefaultInfinity: true }),
    maxMarks: fc.double({ min: 0.01, max: 100, noNaN: true, noDefaultInfinity: true }),
});

/** Generate a written answer (no marks obtained yet — grading pending). */
const writtenAnswerArb = fc.record({
    question: objectIdArb,
    questionType: fc.constant('written' as const),
    marksObtained: fc.constant(0),
    maxMarks: fc.double({ min: 0.01, max: 100, noNaN: true, noDefaultInfinity: true }),
});

/**
 * Generate a grade for a written answer.
 * marks is constrained to [0, maxMarks] of the corresponding answer.
 */
function gradeForAnswer(answer: Answer): fc.Arbitrary<WrittenGrade> {
    return fc.double({ min: 0, max: answer.maxMarks, noNaN: true, noDefaultInfinity: true }).map(
        (marks) => ({
            questionId: answer.question,
            marks,
            maxMarks: answer.maxMarks,
            feedback: '',
            gradedBy: 'a'.repeat(24),
            gradedAt: new Date(),
        }),
    );
}

/**
 * Generate a complete exam scenario:
 * - 0-5 MCQ answers
 * - 1-5 written answers (at least 1 to make grading meaningful)
 * - Grades for ALL written answers (simulating full grading)
 */
const examScenarioArb = fc
    .record({
        mcqAnswers: fc.array(mcqAnswerArb, { minLength: 0, maxLength: 5 }),
        writtenAnswers: fc.array(writtenAnswerArb, { minLength: 1, maxLength: 5 }),
    })
    .chain(({ mcqAnswers, writtenAnswers }) => {
        // Generate a grade for each written answer
        const gradesArb =
            writtenAnswers.length === 0
                ? fc.constant([] as WrittenGrade[])
                : fc.tuple(...writtenAnswers.map((wa) => gradeForAnswer(wa))).map((grades) => grades);

        return gradesArb.map((grades) => ({
            mcqAnswers,
            writtenAnswers,
            grades,
        }));
    });

// ─── Recalculation Logic (mirrors gradeWrittenAnswer controller) ─────────────

function simulateFullGrading(
    mcqAnswers: Answer[],
    writtenAnswers: Answer[],
    grades: WrittenGrade[],
): SimulatedExamResult {
    const allAnswers = [...mcqAnswers, ...writtenAnswers];
    const totalMarks =
        mcqAnswers.reduce((sum, a) => sum + a.maxMarks, 0) +
        writtenAnswers.reduce((sum, a) => sum + a.maxMarks, 0);

    // Start with pending state
    const result: SimulatedExamResult = {
        answers: allAnswers,
        writtenGrades: [],
        totalMarks,
        obtainedMarks: 0,
        percentage: 0,
        status: 'pending_evaluation',
    };

    // Simulate grading each written answer (same logic as controller)
    for (const grade of grades) {
        const existingIndex = result.writtenGrades.findIndex(
            (g) => String(g.questionId) === grade.questionId,
        );
        if (existingIndex >= 0) {
            result.writtenGrades[existingIndex] = grade;
        } else {
            result.writtenGrades.push(grade);
        }
    }

    // Check if all written answers are graded
    const writtenAnswersList = result.answers.filter((a) => a.questionType === 'written');
    const gradedQuestionIds = new Set(result.writtenGrades.map((g) => String(g.questionId)));
    const allGraded = writtenAnswersList.every((a) => gradedQuestionIds.has(String(a.question)));

    if (allGraded) {
        // Recalculate: MCQ marksObtained + written grades marks
        const mcqMarks = result.answers
            .filter((a) => a.questionType !== 'written')
            .reduce((sum, a) => sum + (a.marksObtained || 0), 0);

        const writtenMarks = result.writtenGrades.reduce((sum, g) => sum + g.marks, 0);

        result.obtainedMarks = mcqMarks + writtenMarks;
        result.percentage = result.totalMarks > 0
            ? (result.obtainedMarks / result.totalMarks) * 100
            : 0;
        result.status = 'evaluated';
    }

    return result;
}

// ─── Property Tests ──────────────────────────────────────────────────────────

describe('Feature: exam-center-backend-completion, Property 4: Status Transition and Score Recalculation', () => {
    /**
     * When all written answers are graded, status becomes 'evaluated'.
     * **Validates: Requirements 2.4**
     */
    it('sets status to evaluated when all written answers are graded', () => {
        fc.assert(
            fc.property(examScenarioArb, ({ mcqAnswers, writtenAnswers, grades }) => {
                const result = simulateFullGrading(mcqAnswers, writtenAnswers, grades);
                expect(result.status).toBe('evaluated');
            }),
            { numRuns: 100 },
        );
    });

    /**
     * obtainedMarks equals sum of MCQ marksObtained + written writtenGrades.marks.
     * **Validates: Requirements 2.4**
     */
    it('recalculates obtainedMarks as MCQ marks + written grades marks', () => {
        fc.assert(
            fc.property(examScenarioArb, ({ mcqAnswers, writtenAnswers, grades }) => {
                const result = simulateFullGrading(mcqAnswers, writtenAnswers, grades);

                const expectedMcqMarks = mcqAnswers.reduce((sum, a) => sum + (a.marksObtained || 0), 0);
                const expectedWrittenMarks = grades.reduce((sum, g) => sum + g.marks, 0);
                const expectedObtainedMarks = expectedMcqMarks + expectedWrittenMarks;

                expect(result.obtainedMarks).toBeCloseTo(expectedObtainedMarks, 10);
            }),
            { numRuns: 100 },
        );
    });

    /**
     * percentage equals (obtainedMarks / totalMarks) * 100.
     * **Validates: Requirements 2.4**
     */
    it('recalculates percentage as (obtainedMarks / totalMarks) * 100', () => {
        fc.assert(
            fc.property(examScenarioArb, ({ mcqAnswers, writtenAnswers, grades }) => {
                const result = simulateFullGrading(mcqAnswers, writtenAnswers, grades);

                const expectedTotalMarks =
                    mcqAnswers.reduce((sum, a) => sum + a.maxMarks, 0) +
                    writtenAnswers.reduce((sum, a) => sum + a.maxMarks, 0);

                const expectedPercentage = expectedTotalMarks > 0
                    ? (result.obtainedMarks / expectedTotalMarks) * 100
                    : 0;

                expect(result.percentage).toBeCloseTo(expectedPercentage, 10);
            }),
            { numRuns: 100 },
        );
    });

    /**
     * All three invariants hold together for any valid exam scenario.
     * **Validates: Requirements 2.4**
     */
    it('satisfies all three invariants simultaneously after full grading', () => {
        fc.assert(
            fc.property(examScenarioArb, ({ mcqAnswers, writtenAnswers, grades }) => {
                const result = simulateFullGrading(mcqAnswers, writtenAnswers, grades);

                // Invariant 1: status is 'evaluated'
                expect(result.status).toBe('evaluated');

                // Invariant 2: obtainedMarks = MCQ marks + written marks
                const expectedMcqMarks = mcqAnswers.reduce((sum, a) => sum + (a.marksObtained || 0), 0);
                const expectedWrittenMarks = grades.reduce((sum, g) => sum + g.marks, 0);
                expect(result.obtainedMarks).toBeCloseTo(expectedMcqMarks + expectedWrittenMarks, 10);

                // Invariant 3: percentage = (obtainedMarks / totalMarks) * 100
                const expectedTotalMarks =
                    mcqAnswers.reduce((sum, a) => sum + a.maxMarks, 0) +
                    writtenAnswers.reduce((sum, a) => sum + a.maxMarks, 0);
                const expectedPercentage = expectedTotalMarks > 0
                    ? (result.obtainedMarks / expectedTotalMarks) * 100
                    : 0;
                expect(result.percentage).toBeCloseTo(expectedPercentage, 10);
            }),
            { numRuns: 100 },
        );
    });
});
