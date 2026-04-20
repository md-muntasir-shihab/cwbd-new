import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
    questionSelectorReducer,
    type SelectorAction,
} from '../QuestionSelectorContext';
import type {
    BankQuestion,
    QuestionSelectorState,
} from '../../../../types/questionBank';

/**
 * Property 13: Selector state invariant
 *
 * Validates: Requirements 8.3, 8.6
 *
 * For any sequence of ADD_QUESTION, REMOVE_QUESTION, and SET_MARKS operations
 * on the QuestionSelector reducer, `totalQuestions` should always equal the
 * length of the selected questions array, and `totalMarks` should always equal
 * the sum of all individual question marks in the selected array.
 */

/* ── Helpers ── */

const initialState: QuestionSelectorState = {
    availableQuestions: [],
    filters: {},
    pagination: { page: 1, total: 0, limit: 20 },
    facets: {
        subjects: [],
        moduleCategories: [],
        topics: [],
        difficulties: [],
        tags: [],
    },
    isLoading: false,
    selectedQuestions: [],
    totalMarks: 0,
    totalQuestions: 0,
};

const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;

function makeBankQuestion(id: string): BankQuestion {
    return {
        _id: id,
        bankQuestionId: id,
        subject: 'Math',
        moduleCategory: 'Algebra',
        topic: 'Equations',
        subtopic: '',
        difficulty: 'easy',
        languageMode: 'en',
        question_en: 'Sample question text for testing',
        question_bn: '',
        questionImageUrl: '',
        options: [
            { key: 'A', text_en: 'Option A', text_bn: '' },
            { key: 'B', text_en: 'Option B', text_bn: '' },
            { key: 'C', text_en: 'Option C', text_bn: '' },
            { key: 'D', text_en: 'Option D', text_bn: '' },
        ],
        correctKey: 'A',
        explanation_en: '',
        explanation_bn: '',
        explanationImageUrl: '',
        marks: 1,
        negativeMarks: 0,
        tags: [],
        sourceLabel: '',
        chapter: '',
        boardOrPattern: '',
        yearOrSession: '',
        isActive: true,
        isArchived: false,
        contentHash: '',
        versionNo: 1,
        parentQuestionId: null,
        createdByAdminId: '',
        updatedByAdminId: '',
        createdAt: '',
        updatedAt: '',
    };
}

/* ── Arbitraries ── */

/** Generate a pool of unique question IDs, then build action sequences from them. */
function selectorActionSequenceArb() {
    // Generate a pool of 1–20 unique question IDs
    const poolArb = fc
        .integer({ min: 1, max: 20 })
        .chain((size) =>
            fc.uniqueArray(fc.uuid(), { minLength: size, maxLength: size }),
        );

    return poolArb.chain((pool) => {
        const addArb = fc
            .record({
                idx: fc.integer({ min: 0, max: pool.length - 1 }),
                marks: fc.integer({ min: 1, max: 100 }),
            })
            .map(
                ({ idx, marks }): SelectorAction => ({
                    type: 'ADD_QUESTION',
                    question: makeBankQuestion(pool[idx]),
                    defaultMarks: marks,
                }),
            );

        const removeArb = fc
            .integer({ min: 0, max: pool.length - 1 })
            .map(
                (idx): SelectorAction => ({
                    type: 'REMOVE_QUESTION',
                    bankQuestionId: pool[idx],
                }),
            );

        const setMarksArb = fc
            .record({
                idx: fc.integer({ min: 0, max: pool.length - 1 }),
                marks: fc.integer({ min: 0, max: 200 }),
            })
            .map(
                ({ idx, marks }): SelectorAction => ({
                    type: 'SET_MARKS',
                    bankQuestionId: pool[idx],
                    marks,
                }),
            );

        return fc.array(fc.oneof(addArb, removeArb, setMarksArb), {
            minLength: 1,
            maxLength: 50,
        });
    });
}

/* ── Tests ── */

describe('Feature: exam-question-bank, Property 13: Selector state invariant', () => {
    it('totalQuestions always equals selectedQuestions.length after any action sequence', () => {
        fc.assert(
            fc.property(selectorActionSequenceArb(), (actions) => {
                const finalState = actions.reduce(
                    (state, action) => questionSelectorReducer(state, action),
                    initialState,
                );

                expect(finalState.totalQuestions).toBe(
                    finalState.selectedQuestions.length,
                );
            }),
            { numRuns: 30 },
        );
    });

    it('totalMarks always equals sum of individual question marks after any action sequence', () => {
        fc.assert(
            fc.property(selectorActionSequenceArb(), (actions) => {
                const finalState = actions.reduce(
                    (state, action) => questionSelectorReducer(state, action),
                    initialState,
                );

                const expectedMarks = finalState.selectedQuestions.reduce(
                    (sum, q) => sum + q.marks,
                    0,
                );
                expect(finalState.totalMarks).toBe(expectedMarks);
            }),
            { numRuns: 30 },
        );
    });

    it('invariant holds at every intermediate step, not just the final state', () => {
        fc.assert(
            fc.property(selectorActionSequenceArb(), (actions) => {
                let state = initialState;

                for (const action of actions) {
                    state = questionSelectorReducer(state, action);

                    // Check invariant after every single action
                    expect(state.totalQuestions).toBe(
                        state.selectedQuestions.length,
                    );
                    const expectedMarks = state.selectedQuestions.reduce(
                        (sum, q) => sum + q.marks,
                        0,
                    );
                    expect(state.totalMarks).toBe(expectedMarks);
                }
            }),
            { numRuns: 30 },
        );
    });
});
