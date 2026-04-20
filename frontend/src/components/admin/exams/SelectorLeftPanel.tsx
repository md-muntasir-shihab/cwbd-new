import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, Plus, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { listBankQuestions } from '../../../api/adminQuestionBankApi';
import { useQuestionSelector } from './QuestionSelectorContext';
import type { BankQuestionFilters } from '../../../types/questionBank';

/* ── Difficulty badge helper ── */

const difficultyBadge = (d: string) => {
    const cls =
        d === 'hard'
            ? 'bg-rose-500/10 text-rose-300'
            : d === 'medium'
                ? 'bg-amber-500/10 text-amber-300'
                : 'bg-emerald-500/10 text-emerald-300';
    return (
        <span className={`px-2 py-0.5 rounded-md text-xs font-semibold ${cls}`}>
            {d}
        </span>
    );
};

/* ── Component ── */

export default function SelectorLeftPanel() {
    const { state, dispatch } = useQuestionSelector();
    const { availableQuestions, pagination, facets, selectedQuestions } = state;

    /* Local filter state (debounced before dispatching) */
    const [search, setSearch] = useState('');
    const [subject, setSubject] = useState('');
    const [moduleCategory, setModuleCategory] = useState('');
    const [difficulty, setDifficulty] = useState('');
    const [page, setPage] = useState(1);
    const [isLoading, setIsLoading] = useState(false);

    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    /* Build filters object from local state */
    const buildFilters = useCallback(
        (p: number): BankQuestionFilters => ({
            q: search || undefined,
            subject: subject || undefined,
            moduleCategory: moduleCategory || undefined,
            difficulty: difficulty || undefined,
            status: 'active',
            page: p,
            limit: 20,
        }),
        [search, subject, moduleCategory, difficulty],
    );

    /* Fetch questions from API */
    const fetchQuestions = useCallback(
        async (p: number) => {
            setIsLoading(true);
            try {
                const filters = buildFilters(p);
                dispatch({ type: 'SET_FILTERS', filters });
                const data = await listBankQuestions(filters);
                dispatch({ type: 'SET_AVAILABLE', data });
            } catch {
                // silently handle — could add toast here
            } finally {
                setIsLoading(false);
            }
        },
        [buildFilters, dispatch],
    );

    /* Debounce filter/search changes by 300ms */
    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            setPage(1);
            fetchQuestions(1);
        }, 300);
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, [search, subject, moduleCategory, difficulty]); // eslint-disable-line react-hooks/exhaustive-deps

    /* Fetch on page change (immediate, no debounce) */
    const handlePageChange = (newPage: number) => {
        setPage(newPage);
        fetchQuestions(newPage);
    };

    /* Initial load */
    useEffect(() => {
        fetchQuestions(1);
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    /* Check if a question is already selected */
    const isSelected = (id: string) =>
        selectedQuestions.some((q) => q.bankQuestionId === id);

    const totalPages = Math.max(
        1,
        Math.ceil(pagination.total / pagination.limit),
    );

    return (
        <div className="flex flex-col h-full">
            {/* ── Filters ── */}
            <div className="space-y-3 p-4 border-b border-slate-200 dark:border-slate-700/60">
                {/* Search */}
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
                    <input
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search questions..."
                        aria-label="Search questions"
                        className="w-full pl-10 pr-4 py-2 rounded-xl bg-white border border-slate-200 text-slate-900 dark:bg-slate-900/80 dark:border-slate-700/60 dark:text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-indigo-500/50"
                    />
                </div>

                {/* Dropdowns */}
                <div className="flex flex-wrap gap-2">
                    <select
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        aria-label="Filter by subject"
                        className="flex-1 min-w-[120px] px-3 py-2 rounded-xl bg-white border border-slate-200 text-sm text-slate-600 dark:bg-slate-900/80 dark:border-slate-700/60 dark:text-slate-300 focus:outline-none"
                    >
                        <option value="">All Subjects</option>
                        {facets.subjects.map((s) => (
                            <option key={s} value={s}>
                                {s}
                            </option>
                        ))}
                    </select>

                    <select
                        value={moduleCategory}
                        onChange={(e) => setModuleCategory(e.target.value)}
                        aria-label="Filter by category"
                        className="flex-1 min-w-[120px] px-3 py-2 rounded-xl bg-white border border-slate-200 text-sm text-slate-600 dark:bg-slate-900/80 dark:border-slate-700/60 dark:text-slate-300 focus:outline-none"
                    >
                        <option value="">All Categories</option>
                        {facets.moduleCategories.map((c) => (
                            <option key={c} value={c}>
                                {c}
                            </option>
                        ))}
                    </select>

                    <select
                        value={difficulty}
                        onChange={(e) => setDifficulty(e.target.value)}
                        aria-label="Filter by difficulty"
                        className="flex-1 min-w-[120px] px-3 py-2 rounded-xl bg-white border border-slate-200 text-sm text-slate-600 dark:bg-slate-900/80 dark:border-slate-700/60 dark:text-slate-300 focus:outline-none"
                    >
                        <option value="">All Difficulties</option>
                        {facets.difficulties.map((d) => (
                            <option key={d} value={d}>
                                {d}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* ── Question list ── */}
            <div className="flex-1 overflow-y-auto">
                {isLoading ? (
                    <div className="flex items-center justify-center py-12 text-slate-400 dark:text-slate-500">
                        <Loader2 className="w-5 h-5 animate-spin mr-2" />
                        Loading…
                    </div>
                ) : availableQuestions.length === 0 ? (
                    <div className="text-center py-12 text-slate-400 dark:text-slate-500 text-sm">
                        No questions found
                    </div>
                ) : (
                    <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                        {availableQuestions.map((q) => {
                            const id = q.bankQuestionId ?? q._id;
                            const alreadyAdded = isSelected(id);
                            return (
                                <li
                                    key={id}
                                    className="flex items-start gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                                >
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm text-slate-800 dark:text-slate-200 line-clamp-2">
                                            {q.question_en || q.question_bn}
                                        </p>
                                        <div className="flex items-center gap-2 mt-1.5">
                                            <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-indigo-500/10 text-indigo-400">
                                                {q.subject}
                                            </span>
                                            {difficultyBadge(q.difficulty)}
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        disabled={alreadyAdded}
                                        onClick={() =>
                                            dispatch({
                                                type: 'ADD_QUESTION',
                                                question: q,
                                                defaultMarks: q.marks || 1,
                                            })
                                        }
                                        aria-label={
                                            alreadyAdded
                                                ? 'Already added'
                                                : `Add question`
                                        }
                                        className={`mt-1 shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${alreadyAdded
                                            ? 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-600 cursor-not-allowed'
                                            : 'bg-indigo-600 text-white hover:bg-indigo-700 dark:bg-indigo-500 dark:hover:bg-indigo-600'
                                            }`}
                                    >
                                        <Plus className="w-3.5 h-3.5" />
                                        {alreadyAdded ? 'Added' : 'Add'}
                                    </button>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>

            {/* ── Pagination ── */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 dark:border-slate-700/60 text-sm text-slate-500 dark:text-slate-400">
                <span>
                    Page {page} of {totalPages} ({pagination.total} total)
                </span>
                <div className="flex items-center gap-1">
                    <button
                        type="button"
                        disabled={page <= 1}
                        onClick={() => handlePageChange(page - 1)}
                        aria-label="Previous page"
                        className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        <ChevronLeft className="w-4 h-4" />
                    </button>
                    <button
                        type="button"
                        disabled={page >= totalPages}
                        onClick={() => handlePageChange(page + 1)}
                        aria-label="Next page"
                        className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                        <ChevronRight className="w-4 h-4" />
                    </button>
                </div>
            </div>
        </div>
    );
}
