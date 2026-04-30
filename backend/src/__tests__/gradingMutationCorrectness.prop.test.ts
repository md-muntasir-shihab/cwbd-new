// Feature: exam-center-backend-completion, Property 3: Grading Mutation Correctness
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

/**
 * Property 3: Grading Mutation Correctness
 *
 * **Validates: Requirements 2.1, 2.3**
 *
 * For any valid ExamResult with written answers and any valid grade input,
 * after grading, the `writtenGrades` array SHALL contain an entry for the
 * graded question with the submitted `marks`, `maxMarks`, and `feedback`
 * values, and `gradedBy` SHALL equal the authenticated admin's user ID.
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
}

interface GradeInput {
    questionId: string;
    marks: number;
    maxMarks: number;
    feedback: string;
}

// ─── Generators ──────────────────────────────────────────────────────────────

/** Generate a valid 24-char hex ObjectId string. */
const objectIdArb = fc
    .array(fc.constantFrom(...'0123456789abcdef'.split('')), { minLength: 24, maxLength: 24 })
    .map((chars) => chars.join(''));

/** Generate a written answer with a given questionId. */
function writtenAnswerArb(questionId: string): fc.Arbitrary<Answer> {
    return fc
        .double({ min: 1, max: 100, noNaN: true, noDefaultInfinity: true })
        .map((maxMarks) => ({
            question: questionId,
            questionType: 'written' as const,
            marksObtained: 0,
            maxMarks,
        }));
}

/** Generate a feedback string (0 to 200 chars). */
const feedbackArb = fc.string({ minLength: 0, maxLength: 200 });

/** Generate an admin user ID (valid ObjectId). */
const adminIdArb = objectIdArb;

// ─── Grading Mutation Logic (mirrors gradeWrittenAnswer controller) ──────────

/**
 * Simulates the upsert logic from the gradeWrittenAnswer controller.
 * This is the exact same mutation logic extracted for pure testing.
 */
function applyGradingMutation(
    result: SimulatedExamResult,
    gradeInput: GradeInput,
    adminUserId: string,
): SimulatedExamResult {
    const gradeEntry: WrittenGrade = {
        questionId: gradeInput.questionId,
        marks: gradeInput.marks,
        maxMarks: gradeInput.maxMarks,
        feedback: gradeInput.feedback || '',
        gradedBy: adminUserId,
        gradedAt: new Date(),
    };

    const writtenGrades = [...(result.writtenGrades || [])];

    const existingIndex = writtenGrades.findIndex(
        (g) => String(g.questionId) === gradeInput.questionId,
    );

    if (existingIndex >= 0) {
        writtenGrades[existingIndex] = gradeEntry;
    } else {
        writtenGrades.push(gradeEntry);
    }

    return {
        ...result,
        writtenGrades,
    };
}

// ─── Property Tests ──────────────────────────────────────────────────────────

describe('Feature: exam-center-backend-completion, Property 3: Grading Mutation Correctness', () => {
    /**
     * After grading, the writtenGrades entry has correct marks, maxMarks,
     * feedback, and gradedBy for randomly generated valid grade inputs.
     * **Validates: Requirements 2.1, 2.3**
     */
    it('inserts a grade entry with correct marks, maxMarks, feedback, and gradedBy', () => {
        const scenarioArb = objectIdArb.chain((questionId) =>
            fc.tuple(
                writtenAnswerArb(questionId),
                fc.double({ min: 0.01, max: 100, noNaN: true, noDefaultInfinity: true }).chain(
                    (maxMarks) =>
                        fc.tuple(
                            fc.constant(maxMarks),
                            fc.double({ min: 0, max: maxMarks, noNaN: true, noDefaultInfinity: true }),
                        ),
                ),
                feedbackArb,
                adminIdArb,
            ),
        );

        fc.assert(
            fc.property(scenarioArb, ([answer, [maxMarks, marks], feedback, adminId]) => {
                const result: SimulatedExamResult = {
                    answers: [answer],
                    writtenGrades: [],
                };

                const gradeInput: GradeInput = {
                    questionId: answer.question,
                    marks,
                    maxMarks,
                    feedback,
                };

                const updated = applyGradingMutation(result, gradeInput, adminId);

                const gradeEntry = updated.writtenGrades.find(
                    (g) => g.questionId === answer.question,
                );

                expect(gradeEntry).toBeDefined();
                expect(gradeEntry!.marks).toBe(marks);
                expect(gradeEntry!.maxMarks).toBe(maxMarks);
                expect(gradeEntry!.feedback).toBe(feedback);
                expect(gradeEntry!.gradedBy).toBe(adminId);
            }),
            { numRuns: 100 },
        );
    });

    /**
     * Upsert: grading the same question twice updates the existing entry
     * rather than creating a duplicate, and the final values match the
     * second grading input.
     * **Validates: Requirements 2.1, 2.3**
     */
    it('updates existing grade entry on re-grade (upsert) with correct values', () => {
        const scenarioArb = fc.tuple(
            objectIdArb, // questionId
            fc.double({ min: 0.01, max: 100, noNaN: true, noDefaultInfinity: true }), // maxMarks
            adminIdArb, // first admin
            adminIdArb, // second admin
            feedbackArb, // first feedback
            feedbackArb, // second feedback
        );

        fc.assert(
            fc.property(
                scenarioArb,
                ([questionId, maxMarks, adminId1, adminId2, feedback1, feedback2]) => {
                    const answer: Answer = {
                        question: questionId,
                        questionType: 'written',
                        marksObtained: 0,
                        maxMarks,
                    };

                    const result: SimulatedExamResult = {
                        answers: [answer],
                        writtenGrades: [],
                    };

                    const marks1 = maxMarks * 0.3;
                    const marks2 = maxMarks * 0.8;

                    // First grading
                    const afterFirst = applyGradingMutation(
                        result,
                        { questionId, marks: marks1, maxMarks, feedback: feedback1 },
                        adminId1,
                    );

                    expect(afterFirst.writtenGrades).toHaveLength(1);
                    expect(afterFirst.writtenGrades[0].marks).toBe(marks1);
                    expect(afterFirst.writtenGrades[0].gradedBy).toBe(adminId1);

                    // Second grading (upsert — should update, not duplicate)
                    const afterSecond = applyGradingMutation(
                        afterFirst,
                        { questionId, marks: marks2, maxMarks, feedback: feedback2 },
                        adminId2,
                    );

                    // Still only one entry for this question
                    const entriesForQuestion = afterSecond.writtenGrades.filter(
                        (g) => g.questionId === questionId,
                    );
                    expect(entriesForQuestion).toHaveLength(1);

                    // Values match the second grading
                    const gradeEntry = entriesForQuestion[0];
                    expect(gradeEntry.marks).toBe(marks2);
                    expect(gradeEntry.maxMarks).toBe(maxMarks);
                    expect(gradeEntry.feedback).toBe(feedback2);
                    expect(gradeEntry.gradedBy).toBe(adminId2);
                },
            ),
            { numRuns: 100 },
        );
    });

    /**
     * Grading one question does not affect grades for other questions.
     * **Validates: Requirements 2.1, 2.3**
     */
    it('grading one question preserves existing grades for other questions', () => {
        const scenarioArb = fc.tuple(
            objectIdArb, // questionId1
            objectIdArb, // questionId2
            fc.double({ min: 0.01, max: 100, noNaN: true, noDefaultInfinity: true }), // maxMarks
            adminIdArb,
            feedbackArb,
            feedbackArb,
        ).filter(([q1, q2]) => q1 !== q2); // ensure distinct questions

        fc.assert(
            fc.property(
                scenarioArb,
                ([questionId1, questionId2, maxMarks, adminId, feedback1, feedback2]) => {
                    const answers: Answer[] = [
                        { question: questionId1, questionType: 'written', marksObtained: 0, maxMarks },
                        { question: questionId2, questionType: 'written', marksObtained: 0, maxMarks },
                    ];

                    const result: SimulatedExamResult = {
                        answers,
                        writtenGrades: [],
                    };

                    const marks1 = maxMarks * 0.5;
                    const marks2 = maxMarks * 0.7;

                    // Grade first question
                    const afterFirst = applyGradingMutation(
                        result,
                        { questionId: questionId1, marks: marks1, maxMarks, feedback: feedback1 },
                        adminId,
                    );

                    // Grade second question
                    const afterSecond = applyGradingMutation(
                        afterFirst,
                        { questionId: questionId2, marks: marks2, maxMarks, feedback: feedback2 },
                        adminId,
                    );

                    // Both grades exist
                    expect(afterSecond.writtenGrades).toHaveLength(2);

                    // First grade is unchanged
                    const grade1 = afterSecond.writtenGrades.find(
                        (g) => g.questionId === questionId1,
                    );
                    expect(grade1).toBeDefined();
                    expect(grade1!.marks).toBe(marks1);
                    expect(grade1!.feedback).toBe(feedback1);
                    expect(grade1!.gradedBy).toBe(adminId);

                    // Second grade is correct
                    const grade2 = afterSecond.writtenGrades.find(
                        (g) => g.questionId === questionId2,
                    );
                    expect(grade2).toBeDefined();
                    expect(grade2!.marks).toBe(marks2);
                    expect(grade2!.feedback).toBe(feedback2);
                    expect(grade2!.gradedBy).toBe(adminId);
                },
            ),
            { numRuns: 100 },
        );
    });

    /**
     * Grading multiple written answers across an ExamResult with 1-5 written
     * answers produces correct writtenGrades entries for each graded question.
     * **Validates: Requirements 2.1, 2.3**
     */
    it('grading all written answers produces correct entries for each question', () => {
        // Generate 1-5 unique question IDs, then build answers and grade inputs
        const scenarioArb = fc
            .integer({ min: 1, max: 5 })
            .chain((count) =>
                fc.tuple(
                    fc.uniqueArray(objectIdArb, { minLength: count, maxLength: count }),
                    adminIdArb,
                ),
            )
            .filter(([ids]) => ids.length >= 1)
            .chain(([questionIds, adminId]) => {
                const gradeInputsArb = fc.tuple(
                    ...questionIds.map((qid) =>
                        fc
                            .double({ min: 0.01, max: 100, noNaN: true, noDefaultInfinity: true })
                            .chain((maxMarks) =>
                                fc.tuple(
                                    fc.constant(qid),
                                    fc.constant(maxMarks),
                                    fc.double({ min: 0, max: maxMarks, noNaN: true, noDefaultInfinity: true }),
                                    feedbackArb,
                                ),
                            ),
                    ),
                );
                return fc.tuple(fc.constant(questionIds), fc.constant(adminId), gradeInputsArb);
            });

        fc.assert(
            fc.property(scenarioArb, ([questionIds, adminId, gradeInputs]) => {
                const answers: Answer[] = questionIds.map((qid) => ({
                    question: qid,
                    questionType: 'written' as const,
                    marksObtained: 0,
                    maxMarks: 10, // placeholder, actual maxMarks come from gradeInputs
                }));

                let result: SimulatedExamResult = {
                    answers,
                    writtenGrades: [],
                };

                // Apply each grading
                const expectedGrades: Array<{ questionId: string; marks: number; maxMarks: number; feedback: string }> = [];
                for (const [qid, maxMarks, marks, feedback] of gradeInputs) {
                    result = applyGradingMutation(
                        result,
                        { questionId: qid, marks, maxMarks, feedback },
                        adminId,
                    );
                    expectedGrades.push({ questionId: qid, marks, maxMarks, feedback });
                }

                // Verify each grade entry
                expect(result.writtenGrades).toHaveLength(questionIds.length);

                for (const expected of expectedGrades) {
                    const entry = result.writtenGrades.find(
                        (g) => g.questionId === expected.questionId,
                    );
                    expect(entry).toBeDefined();
                    expect(entry!.marks).toBe(expected.marks);
                    expect(entry!.maxMarks).toBe(expected.maxMarks);
                    expect(entry!.feedback).toBe(expected.feedback);
                    expect(entry!.gradedBy).toBe(adminId);
                }
            }),
            { numRuns: 100 },
        );
    });
});
