import {
    useState,
    useRef,
    useEffect,
    useCallback,
    useMemo,
    type ChangeEvent,
    type KeyboardEvent,
} from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Search,
    X,
    GraduationCap,
    ClipboardCheck,
    Newspaper,
    BookOpen,
    Loader2,
    ArrowRight,
    Filter,
    Calendar,
} from 'lucide-react';
import {
    getGlobalSearch,
    type GlobalSearchUniversityResult,
    type GlobalSearchExamResult,
    type GlobalSearchNewsResult,
} from '../../services/api';
import { buildMediaUrl } from '../../utils/mediaUrl';
import {
    SearchEngine,
    type FacetFilter,
    type SearchCollection,
    hasActiveFilters,
} from '../../services/searchEngine';
import FocusTrap from './FocusTrap';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */
type AnyResult = GlobalSearchUniversityResult | GlobalSearchExamResult | GlobalSearchNewsResult;

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */
interface GlobalSearchModalProps {
    open: boolean;
    onClose: () => void;
}

export default function GlobalSearchModal({ open, onClose }: GlobalSearchModalProps) {
    const navigate = useNavigate();
    const inputRef = useRef<HTMLInputElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);

    const [query, setQuery] = useState('');
    const [loading, setLoading] = useState(false);
    const [universities, setUniversities] = useState<GlobalSearchUniversityResult[]>([]);
    const [exams, setExams] = useState<GlobalSearchExamResult[]>([]);
    const [news, setNews] = useState<GlobalSearchNewsResult[]>([]);
    const [highlightIndex, setHighlightIndex] = useState(-1);
    const [showFilters, setShowFilters] = useState(false);
    const [filters, setFilters] = useState<FacetFilter>({});
    const [activeCollection, setActiveCollection] = useState<SearchCollection | 'all'>('all');
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    /* ── Build search engines for client-side filtering ── */
    const uniEngine = useMemo(
        () => new SearchEngine(universities, { keys: ['name', 'shortForm', 'category'], categoryField: 'category' }, 'universities'),
        [universities],
    );
    const examEngine = useMemo(
        () => new SearchEngine(exams, { keys: ['title', 'subject', 'groupCategory'], statusField: 'status', categoryField: 'groupCategory', dateField: 'startDate' }, 'exams'),
        [exams],
    );
    const newsEngine = useMemo(
        () => new SearchEngine(news, { keys: ['title', 'category', 'shortSummary'], categoryField: 'category', dateField: 'publishDate' }, 'news'),
        [news],
    );

    /* ── Filtered results (apply facets client-side) ── */
    const filteredUniversities = useMemo(() => {
        if (!hasActiveFilters(filters) || (activeCollection !== 'all' && activeCollection !== 'universities')) {
            return activeCollection === 'all' || activeCollection === 'universities' ? universities : [];
        }
        return uniEngine.search('', filters).items as unknown as GlobalSearchUniversityResult[];
    }, [universities, filters, activeCollection, uniEngine]);

    const filteredExams = useMemo(() => {
        if (!hasActiveFilters(filters) || (activeCollection !== 'all' && activeCollection !== 'exams')) {
            return activeCollection === 'all' || activeCollection === 'exams' ? exams : [];
        }
        return examEngine.search('', filters).items as unknown as GlobalSearchExamResult[];
    }, [exams, filters, activeCollection, examEngine]);

    const filteredNews = useMemo(() => {
        if (!hasActiveFilters(filters) || (activeCollection !== 'all' && activeCollection !== 'news')) {
            return activeCollection === 'all' || activeCollection === 'news' ? news : [];
        }
        return newsEngine.search('', filters).items as unknown as GlobalSearchNewsResult[];
    }, [news, filters, activeCollection, newsEngine]);

    const flatResults: AnyResult[] = [...filteredUniversities, ...filteredExams, ...filteredNews];
    const hasResults = flatResults.length > 0;

    /* ── Debounced API fetch ── */
    const fetchResults = useCallback((q: string) => {
        if (q.length < 2) {
            setUniversities([]);
            setExams([]);
            setNews([]);
            return;
        }
        setLoading(true);
        getGlobalSearch(q)
            .then((res) => {
                setUniversities(res.data.universities ?? []);
                setExams(res.data.exams ?? []);
                setNews(res.data.news ?? []);
            })
            .catch(() => {
                setUniversities([]);
                setExams([]);
                setNews([]);
            })
            .finally(() => setLoading(false));
    }, []);

    const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        setQuery(val);
        setHighlightIndex(-1);

        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => fetchResults(val.trim()), 300);
    };

    const clearSearch = () => {
        setQuery('');
        setUniversities([]);
        setExams([]);
        setNews([]);
        setFilters({});
        setActiveCollection('all');
        setShowFilters(false);
        inputRef.current?.focus();
    };

    /* ── Navigate on result click ── */
    const goToResult = (item: AnyResult) => {
        onClose();
        if (item.type === 'university') navigate(`/university/${item.slug}`);
        else if (item.type === 'exam') navigate(`/exams/${item.slug || item._id}`);
        else if (item.type === 'news') navigate(`/news/${item.slug}`);
    };

    /* ── Keyboard navigation ── */
    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Escape') {
            onClose();
            return;
        }
        if (!hasResults) return;
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlightIndex((prev) => (prev < flatResults.length - 1 ? prev + 1 : 0));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlightIndex((prev) => (prev > 0 ? prev - 1 : flatResults.length - 1));
        } else if (e.key === 'Enter' && highlightIndex >= 0) {
            e.preventDefault();
            goToResult(flatResults[highlightIndex]);
        }
    };

    /* ── Focus input on open ── */
    useEffect(() => {
        if (open) {
            setTimeout(() => inputRef.current?.focus(), 50);
        } else {
            setQuery('');
            setUniversities([]);
            setExams([]);
            setNews([]);
            setHighlightIndex(-1);
            setFilters({});
            setShowFilters(false);
            setActiveCollection('all');
        }
    }, [open]);

    /* ── Cleanup debounce ── */
    useEffect(() => () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
    }, []);

    /* ── Keyboard shortcut (Ctrl/Cmd+K) ── */
    useEffect(() => {
        const handler = (e: globalThis.KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault();
            }
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, []);

    if (!open) return null;

    /* ── Section helpers ── */
    const sectionIcon = (type: string) => {
        if (type === 'university') return <GraduationCap className="w-4 h-4" />;
        if (type === 'exam') return <ClipboardCheck className="w-4 h-4" />;
        if (type === 'news') return <Newspaper className="w-4 h-4" />;
        return <BookOpen className="w-4 h-4" />;
    };

    const sectionTitle = (type: string) => {
        if (type === 'university') return 'Universities';
        if (type === 'exam') return 'Exams';
        if (type === 'news') return 'News';
        return 'Resources';
    };

    const collectionTabs: { key: SearchCollection | 'all'; label: string }[] = [
        { key: 'all', label: 'All' },
        { key: 'universities', label: 'Universities' },
        { key: 'exams', label: 'Exams' },
        { key: 'news', label: 'News' },
    ];

    let flatIdx = 0;

    return (
        <>
            {/* Backdrop */}
            <div
                className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm"
                onClick={onClose}
                aria-hidden="true"
            />

            {/* Modal panel */}
            <FocusTrap active={open} className="contents">
                <div
                    ref={panelRef}
                    role="dialog"
                    aria-modal="true"
                    aria-label="Global search"
                    className="fixed left-1/2 top-[10vh] z-[101] w-[95vw] max-w-2xl -translate-x-1/2 rounded-2xl border border-gray-200/60 dark:border-gray-700/50 bg-white dark:bg-gray-900 shadow-2xl"
                >
                    {/* Search input */}
                    <div className="flex items-center gap-2 border-b border-gray-200/60 dark:border-gray-700/50 px-4 py-3">
                        <Search className="w-5 h-5 text-gray-400 shrink-0" />
                        <input
                            ref={inputRef}
                            type="text"
                            value={query}
                            onChange={handleChange}
                            onKeyDown={handleKeyDown}
                            placeholder="Search universities, exams, news…"
                            aria-label="Search universities, exams, news and resources"
                            autoComplete="off"
                            className="flex-1 bg-transparent text-sm text-gray-800 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 outline-none"
                        />
                        {loading && <Loader2 className="w-4 h-4 text-[var(--primary)] animate-spin shrink-0" />}
                        {query && !loading && (
                            <button
                                onClick={clearSearch}
                                className="p-1 rounded-full text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                                aria-label="Clear search"
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        )}
                        <button
                            onClick={() => setShowFilters((p) => !p)}
                            className={`p-1.5 rounded-lg transition-colors ${showFilters ? 'bg-[var(--primary)]/10 text-[var(--primary)]' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}`}
                            aria-label="Toggle filters"
                            aria-expanded={showFilters}
                        >
                            <Filter className="w-4 h-4" />
                        </button>
                        <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded-md border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-1.5 py-0.5 text-[10px] text-gray-400">
                            ESC
                        </kbd>
                    </div>

                    {/* Filters panel */}
                    {showFilters && (
                        <div className="border-b border-gray-200/60 dark:border-gray-700/50 px-4 py-3 space-y-3">
                            {/* Collection tabs */}
                            <div className="flex items-center gap-1 flex-wrap">
                                {collectionTabs.map((tab) => (
                                    <button
                                        key={tab.key}
                                        onClick={() => setActiveCollection(tab.key)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${activeCollection === tab.key
                                            ? 'bg-[var(--primary)] text-white'
                                            : 'text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'
                                            }`}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </div>

                            {/* Facet filters */}
                            <div className="flex items-center gap-3 flex-wrap">
                                <div className="flex items-center gap-1.5">
                                    <label htmlFor="gs-category" className="text-xs text-gray-500 dark:text-gray-400">Category:</label>
                                    <input
                                        id="gs-category"
                                        type="text"
                                        value={filters.category ?? ''}
                                        onChange={(e) => setFilters((f) => ({ ...f, category: e.target.value || undefined }))}
                                        placeholder="Any"
                                        className="w-28 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-2 py-1 text-xs text-gray-700 dark:text-gray-300 outline-none focus:border-[var(--primary)]"
                                    />
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <label htmlFor="gs-status" className="text-xs text-gray-500 dark:text-gray-400">Status:</label>
                                    <input
                                        id="gs-status"
                                        type="text"
                                        value={filters.status ?? ''}
                                        onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value || undefined }))}
                                        placeholder="Any"
                                        className="w-24 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-2 py-1 text-xs text-gray-700 dark:text-gray-300 outline-none focus:border-[var(--primary)]"
                                    />
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <Calendar className="w-3.5 h-3.5 text-gray-400" />
                                    <input
                                        type="date"
                                        aria-label="Date from"
                                        value={filters.dateFrom ?? ''}
                                        onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value || undefined }))}
                                        className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-2 py-1 text-xs text-gray-700 dark:text-gray-300 outline-none focus:border-[var(--primary)]"
                                    />
                                    <span className="text-xs text-gray-400">–</span>
                                    <input
                                        type="date"
                                        aria-label="Date to"
                                        value={filters.dateTo ?? ''}
                                        onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value || undefined }))}
                                        className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 px-2 py-1 text-xs text-gray-700 dark:text-gray-300 outline-none focus:border-[var(--primary)]"
                                    />
                                </div>
                                {hasActiveFilters(filters) && (
                                    <button
                                        onClick={() => setFilters({})}
                                        className="text-xs text-[var(--primary)] hover:underline"
                                    >
                                        Clear filters
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Results */}
                    <div className="max-h-[55vh] overflow-y-auto overscroll-contain" role="listbox">
                        {query.trim().length < 2 && !hasActiveFilters(filters) ? (
                            <div className="px-5 py-10 text-center text-sm text-gray-400 dark:text-gray-500">
                                <Search className="w-8 h-8 mx-auto mb-2 opacity-30" />
                                Type at least 2 characters to search
                            </div>
                        ) : !hasResults && !loading ? (
                            <div className="px-5 py-10 text-center text-sm text-gray-400 dark:text-gray-500">
                                <Search className="w-8 h-8 mx-auto mb-2 opacity-30" />
                                No results found
                            </div>
                        ) : (
                            <>
                                {/* Universities */}
                                {filteredUniversities.length > 0 && (() => {
                                    const startIdx = flatIdx;
                                    const section = (
                                        <div key="universities">
                                            <div className="flex items-center gap-2 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 border-b border-gray-100/60 dark:border-gray-800/60 bg-gray-50/40 dark:bg-gray-800/30 sticky top-0">
                                                {sectionIcon('university')}
                                                {sectionTitle('university')}
                                                <span className="ml-auto text-[10px] font-normal normal-case text-gray-400/70">{filteredUniversities.length}</span>
                                            </div>
                                            {filteredUniversities.map((u, i) => {
                                                const idx = startIdx + i;
                                                return (
                                                    <button
                                                        key={u._id}
                                                        role="option"
                                                        aria-selected={highlightIndex === idx}
                                                        onClick={() => goToResult(u)}
                                                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors border-b border-gray-100/40 dark:border-gray-800/30 last:border-b-0 ${highlightIndex === idx ? 'bg-[var(--primary)]/8 dark:bg-[var(--primary)]/12' : 'hover:bg-gray-50/60 dark:hover:bg-gray-800/40'}`}
                                                    >
                                                        {u.logoUrl ? (
                                                            <img src={buildMediaUrl(u.logoUrl)} alt="" className="w-7 h-7 rounded-lg object-cover ring-1 ring-gray-200/60 dark:ring-gray-700/50 shrink-0" />
                                                        ) : (
                                                            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[var(--primary)]/10 to-[var(--primary)]/5 flex items-center justify-center shrink-0">
                                                                <GraduationCap className="w-3.5 h-3.5 text-[var(--primary)]" />
                                                            </div>
                                                        )}
                                                        <div className="min-w-0 flex-1">
                                                            <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{u.name}</p>
                                                            <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{u.shortForm} · {u.category}</p>
                                                        </div>
                                                        <ArrowRight className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 shrink-0" />
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    );
                                    flatIdx += filteredUniversities.length;
                                    return section;
                                })()}

                                {/* Exams */}
                                {filteredExams.length > 0 && (() => {
                                    const startIdx = flatIdx;
                                    const section = (
                                        <div key="exams">
                                            <div className="flex items-center gap-2 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 border-b border-gray-100/60 dark:border-gray-800/60 bg-gray-50/40 dark:bg-gray-800/30 sticky top-0">
                                                {sectionIcon('exam')}
                                                {sectionTitle('exam')}
                                                <span className="ml-auto text-[10px] font-normal normal-case text-gray-400/70">{filteredExams.length}</span>
                                            </div>
                                            {filteredExams.map((e, i) => {
                                                const idx = startIdx + i;
                                                return (
                                                    <button
                                                        key={e._id}
                                                        role="option"
                                                        aria-selected={highlightIndex === idx}
                                                        onClick={() => goToResult(e)}
                                                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors border-b border-gray-100/40 dark:border-gray-800/30 last:border-b-0 ${highlightIndex === idx ? 'bg-[var(--primary)]/8 dark:bg-[var(--primary)]/12' : 'hover:bg-gray-50/60 dark:hover:bg-gray-800/40'}`}
                                                    >
                                                        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-emerald-500/10 to-teal-500/5 flex items-center justify-center shrink-0">
                                                            <ClipboardCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                                                        </div>
                                                        <div className="min-w-0 flex-1">
                                                            <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{e.title}</p>
                                                            <p className="text-xs text-gray-400 dark:text-gray-500 truncate">
                                                                {e.subject}{e.groupCategory ? ` · ${e.groupCategory}` : ''}{e.status ? ` · ${e.status}` : ''}
                                                            </p>
                                                        </div>
                                                        <ArrowRight className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 shrink-0" />
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    );
                                    flatIdx += filteredExams.length;
                                    return section;
                                })()}

                                {/* News */}
                                {filteredNews.length > 0 && (() => {
                                    const startIdx = flatIdx;
                                    const section = (
                                        <div key="news">
                                            <div className="flex items-center gap-2 px-4 py-2 text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 border-b border-gray-100/60 dark:border-gray-800/60 bg-gray-50/40 dark:bg-gray-800/30 sticky top-0">
                                                {sectionIcon('news')}
                                                {sectionTitle('news')}
                                                <span className="ml-auto text-[10px] font-normal normal-case text-gray-400/70">{filteredNews.length}</span>
                                            </div>
                                            {filteredNews.map((n, i) => {
                                                const idx = startIdx + i;
                                                return (
                                                    <button
                                                        key={n._id}
                                                        role="option"
                                                        aria-selected={highlightIndex === idx}
                                                        onClick={() => goToResult(n)}
                                                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors border-b border-gray-100/40 dark:border-gray-800/30 last:border-b-0 ${highlightIndex === idx ? 'bg-[var(--primary)]/8 dark:bg-[var(--primary)]/12' : 'hover:bg-gray-50/60 dark:hover:bg-gray-800/40'}`}
                                                    >
                                                        {n.coverImageUrl ? (
                                                            <img src={n.coverImageUrl} alt="" className="w-7 h-7 rounded-lg object-cover ring-1 ring-gray-200/60 dark:ring-gray-700/50 shrink-0" />
                                                        ) : (
                                                            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-500/10 to-orange-500/5 flex items-center justify-center shrink-0">
                                                                <Newspaper className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                                                            </div>
                                                        )}
                                                        <div className="min-w-0 flex-1">
                                                            <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{n.title}</p>
                                                            <p className="text-xs text-gray-400 dark:text-gray-500 truncate">
                                                                {n.category}
                                                                {n.publishDate ? ` · ${new Date(n.publishDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}
                                                            </p>
                                                        </div>
                                                        <ArrowRight className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600 shrink-0" />
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    );
                                    flatIdx += filteredNews.length;
                                    return section;
                                })()}
                            </>
                        )}
                    </div>

                    {/* Footer hint */}
                    <div className="flex items-center justify-between border-t border-gray-200/60 dark:border-gray-700/50 px-4 py-2">
                        <span className="text-[10px] text-gray-400 dark:text-gray-500">
                            ↑↓ navigate · ↵ select · esc close
                        </span>
                        <span className="text-[10px] text-gray-400 dark:text-gray-500">
                            Powered by fuse.js
                        </span>
                    </div>
                </div>
            </FocusTrap>
        </>
    );
}
