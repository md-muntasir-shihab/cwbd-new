import {
    createContext,
    useContext,
    useReducer,
    type Dispatch,
    type ReactNode,
} from 'react';
import type {
    BankQuestion,
    BankQuestionFilters,
    BankQuestionListResponse,
    QuestionSelectorState,
    SelectedQuestion,
} from '../../../types/questionBank';

/* ── Action types ── */

export type SelectorAction =
    | { type: 'ADD_QUESTION'; question: BankQuestion; defaultMarks: number }
    | { type: 'REMOVE_QUESTION'; bankQuestionId: string }
    | { type: 'REORDER'; fromIndex: number; toIndex: number }
    | { type: 'SET_MARKS'; bankQuestionId: string; marks: number }
    | { type: 'SET_FILTERS'; filters: Partial<BankQuestionFilters> }
    | { type: 'SET_AVAILABLE'; data: BankQuestionListResponse }
    | { type: 'BULK_ADD'; questions: BankQuestion[]; defaultMarks: number };

/* ── Initial state ── */

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

/* ── Helpers ── */

function bankToSelected(
    q: BankQuestion,
    marks: number,
    orderIndex: number,
): SelectedQuestion {
    return {
        bankQuestionId: q.bankQuestionId ?? q._id,
        question_en: q.question_en,
        question_bn: q.question_bn,
        subject: q.subject,
        difficulty: q.difficulty,
        options: q.options,
        correctKey: q.correctKey,
        marks,
        orderIndex,
    };
}

function recalcTotals(
    selected: SelectedQuestion[],
): Pick<QuestionSelectorState, 'totalQuestions' | 'totalMarks'> {
    return {
        totalQuestions: selected.length,
        totalMarks: selected.reduce((sum, q) => sum + q.marks, 0),
    };
}

/* ── Reducer ── */

export function questionSelectorReducer(
    state: QuestionSelectorState,
    action: SelectorAction,
): QuestionSelectorState {
    switch (action.type) {
        case 'ADD_QUESTION': {
            const id = action.question.bankQuestionId ?? action.question._id;
            if (state.selectedQuestions.some((q) => q.bankQuestionId === id)) {
                return state; // already selected — no-op
            }
            const next = [
                ...state.selectedQuestions,
                bankToSelected(
                    action.question,
                    action.defaultMarks,
                    state.selectedQuestions.length,
                ),
            ];
            return { ...state, selectedQuestions: next, ...recalcTotals(next) };
        }

        case 'REMOVE_QUESTION': {
            const next = state.selectedQuestions
                .filter((q) => q.bankQuestionId !== action.bankQuestionId)
                .map((q, i) => ({ ...q, orderIndex: i }));
            return { ...state, selectedQuestions: next, ...recalcTotals(next) };
        }

        case 'REORDER': {
            const list = [...state.selectedQuestions];
            const { fromIndex, toIndex } = action;
            if (
                fromIndex < 0 ||
                fromIndex >= list.length ||
                toIndex < 0 ||
                toIndex >= list.length
            ) {
                return state;
            }
            const [moved] = list.splice(fromIndex, 1);
            list.splice(toIndex, 0, moved);
            const next = list.map((q, i) => ({ ...q, orderIndex: i }));
            return { ...state, selectedQuestions: next, ...recalcTotals(next) };
        }

        case 'SET_MARKS': {
            const next = state.selectedQuestions.map((q) =>
                q.bankQuestionId === action.bankQuestionId
                    ? { ...q, marks: action.marks }
                    : q,
            );
            return { ...state, selectedQuestions: next, ...recalcTotals(next) };
        }

        case 'SET_FILTERS': {
            return {
                ...state,
                filters: { ...state.filters, ...action.filters },
            };
        }

        case 'SET_AVAILABLE': {
            const { questions, total, page, limit, facets } = action.data;
            return {
                ...state,
                availableQuestions: questions,
                pagination: { page, total, limit },
                facets,
            };
        }

        case 'BULK_ADD': {
            let list = [...state.selectedQuestions];
            for (const q of action.questions) {
                const id = q.bankQuestionId ?? q._id;
                if (!list.some((s) => s.bankQuestionId === id)) {
                    list.push(bankToSelected(q, action.defaultMarks, list.length));
                }
            }
            list = list.map((q, i) => ({ ...q, orderIndex: i }));
            return { ...state, selectedQuestions: list, ...recalcTotals(list) };
        }

        default:
            return state;
    }
}

/* ── Context ── */

interface QuestionSelectorContextValue {
    state: QuestionSelectorState;
    dispatch: Dispatch<SelectorAction>;
}

const QuestionSelectorContext =
    createContext<QuestionSelectorContextValue | null>(null);

/* ── Provider ── */

export function QuestionSelectorProvider({
    children,
}: {
    children: ReactNode;
}) {
    const [state, dispatch] = useReducer(questionSelectorReducer, initialState);

    return (
        <QuestionSelectorContext.Provider value={{ state, dispatch }}>
            {children}
        </QuestionSelectorContext.Provider>
    );
}

/* ── Hook ── */

export function useQuestionSelector(): QuestionSelectorContextValue {
    const ctx = useContext(QuestionSelectorContext);
    if (!ctx) {
        throw new Error(
            'useQuestionSelector must be used within a <QuestionSelectorProvider>',
        );
    }
    return ctx;
}
