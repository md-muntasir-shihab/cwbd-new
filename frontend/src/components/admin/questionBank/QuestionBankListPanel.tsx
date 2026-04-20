import { useState, useMemo, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { Search, RefreshCw, Trash2, Archive, Download, Edit, Eye, Copy, RotateCcw } from 'lucide-react';
import {
    useBankQuestionList,
    useBankQuestionFacets,
    useBulkArchive,
    useBulkDelete,
    useBulkCopy,
    useArchiveBankQuestion,
    useRestoreBankQuestion,
    useDeleteBankQuestion,
    useDuplicateBankQuestion,
} from '../../../hooks/useQuestionBankV2Queries';
import { exportQuestions } from '../../../api/adminQuestionBankApi';
import type { BankQuestionFilters, BankQuestion } from '../../../types/questionBank';
import { showConfirmDialog } from '../../../lib/appDialog';
import { downloadFile } from '../../../utils/download';

interface Props {
    onEdit: (id: string) => void;
    archiveMode?: boolean;
}



export default function QuestionBankListPanel({ onEdit, archiveMode }: Props) {
    const [page, setPage] = useState(1);
    const [search, setSearch] = useState('');
    const [subject, setSubject] = useState('');
    const [moduleCategory, setModuleCategory] = useState('');
    const [difficulty, setDifficulty] = useState('');
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [detailQuestion, setDetailQuestion] = useState<BankQuestion | null>(null);

    /* ── Debounced filter values (300ms) ── */
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [debouncedSubject, setDebouncedSubject] = useState('');
    const [debouncedCategory, setDebouncedCategory] = useState('');
    const [debouncedDifficulty, setDebouncedDifficulty] = useState('');
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            setDebouncedSearch(search);
            setDebouncedSubject(subject);
            setDebouncedCategory(moduleCategory);
            setDebouncedDifficulty(difficulty);
        }, 300);
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, [search, subject, moduleCategory, difficulty]);

    const filters: BankQuestionFilters = useMemo(() => ({
        q: debouncedSearch || undefined,
        subject: debouncedSubject || undefined,
        moduleCategory: debouncedCategory || undefined,
        difficulty: debouncedDifficulty || undefined,
        status: archiveMode ? 'archived' : 'active',
        page,
        limit: 25,
    }), [debouncedSearch, debouncedSubject, debouncedCategory, debouncedDifficulty, page, archiveMode]);

    const { data, isLoading, refetch } = useBankQuestionList(filters);
    const { data: cachedFacets } = useBankQuestionFacets();
    const bulkArchiveMut = useBulkArchive();
    const bulkDeleteMut = useBulkDelete();
    const bulkCopyMut = useBulkCopy();
    const archiveMut = useArchiveBankQuestion();
    const restoreMut = useRestoreBankQuestion();
    const deleteMut = useDeleteBankQuestion();
    const duplicateMut = useDuplicateBankQuestion();

    const questions = data?.questions || [];
    const totalPages = data?.totalPages || 1;
    const facets = cachedFacets || data?.facets;

    function toggleSelect(id: string) {
        setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
    }
    function toggleAll() {
        if (selectedIds.length === questions.length) setSelectedIds([]);
        else setSelectedIds(questions.map((q) => q._id));
    }

    async function handleBulkArchive() {
        if (selectedIds.length === 0) return;
        try {
            await bulkArchiveMut.mutateAsync(selectedIds);
            toast.success(`${selectedIds.length} questions archived`);
            setSelectedIds([]);
        } catch { toast.error('Bulk archive failed'); }
    }
    async function handleBulkDelete() {
        if (selectedIds.length === 0) return;
        const confirmed = await showConfirmDialog({
            title: 'Delete questions',
            message: `Delete ${selectedIds.length} questions?`,
            confirmLabel: 'Delete',
            tone: 'danger',
        });
        if (!confirmed) return;
        try {
            await bulkDeleteMut.mutateAsync(selectedIds);
            toast.success(`${selectedIds.length} questions deleted`);
            setSelectedIds([]);
        } catch { toast.error('Bulk delete failed'); }
    }
    async function handleBulkCopy() {
        if (selectedIds.length === 0) return;
        try {
            const result = await bulkCopyMut.mutateAsync(selectedIds);
            toast.success(`${result.copied} questions copied`);
            setSelectedIds([]);
        } catch { toast.error('Bulk copy failed'); }
    }
    async function handleExport() {
        try {
            const blob = await exportQuestions(filters, 'xlsx');
            downloadFile(blob, { filename: 'question_bank.xlsx' });
            toast.success('Export downloaded');
        } catch { toast.error('Export failed'); }
    }

    const difficultyBadge = (d: string) => {
        const cls = d === 'hard' ? 'bg-rose-500/10 text-rose-300' : d === 'medium' ? 'bg-amber-500/10 text-amber-300' : 'bg-emerald-500/10 text-emerald-300';
        return <span className={`px-2 py-0.5 rounded-md text-xs font-semibold ${cls}`}>{d}</span>;
    };

    return (
        <div className="space-y-3 md:space-y-4">
            {/* Toolbar */}
            <div className="flex flex-col gap-2 sm:gap-3 lg:flex-row lg:flex-wrap lg:items-center">
                <div className="relative flex-1 min-w-0 lg:min-w-[240px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
                    <input
                        value={search}
                        onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                        placeholder="Search questions by text or tags..."
                        className="w-full pl-10 pr-4 py-2 md:py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 dark:bg-slate-900/80 dark:border-slate-700/60 dark:text-white text-sm placeholder:text-slate-500 focus:outline-none focus:border-indigo-500/50"
                    />
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:flex lg:flex-wrap lg:gap-3">
                    <select value={subject} onChange={(e) => { setSubject(e.target.value); setPage(1); }} className="px-3 py-2 md:py-2.5 rounded-xl bg-white border border-slate-200 text-sm text-slate-600 dark:bg-slate-900/80 dark:border-slate-700/60 dark:text-slate-300 focus:outline-none truncate">
                        <option value="">All Subjects</option>
                        {facets?.subjects.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                    <select value={moduleCategory} onChange={(e) => { setModuleCategory(e.target.value); setPage(1); }} className="px-3 py-2 md:py-2.5 rounded-xl bg-white border border-slate-200 text-sm text-slate-600 dark:bg-slate-900/80 dark:border-slate-700/60 dark:text-slate-300 focus:outline-none truncate">
                        <option value="">All Categories</option>
                        {facets?.moduleCategories.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <select value={difficulty} onChange={(e) => { setDifficulty(e.target.value); setPage(1); }} className="px-3 py-2 md:py-2.5 rounded-xl bg-white border border-slate-200 text-sm text-slate-600 dark:bg-slate-900/80 dark:border-slate-700/60 dark:text-slate-300 focus:outline-none truncate">
                        <option value="">All Difficulty</option>
                        {(facets?.difficulties || ['easy', 'medium', 'hard']).map((d) => <option key={d} value={d}>{d.charAt(0).toUpperCase() + d.slice(1)}</option>)}
                    </select>
                    <div className="flex gap-2">
                        <button onClick={() => refetch()} className="p-2 md:p-2.5 rounded-xl bg-slate-100 border border-slate-200 text-slate-600 hover:text-slate-900 dark:bg-slate-800 dark:border-slate-700/60 dark:text-slate-300 dark:hover:text-white transition">
                            <RefreshCw className="w-4 h-4" />
                        </button>
                        <button onClick={handleExport} className="px-3 md:px-4 py-2 md:py-2.5 rounded-xl bg-slate-100 border border-slate-200 text-sm text-slate-600 hover:text-slate-900 dark:bg-slate-800 dark:border-slate-700/60 dark:text-slate-300 dark:hover:text-white transition flex items-center gap-1.5 md:gap-2">
                            <Download className="w-4 h-4" /> <span className="hidden sm:inline">Export</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Bulk actions */}
            {selectedIds.length > 0 && (
                <div className="flex flex-wrap items-center gap-3 p-3 bg-indigo-50 border border-indigo-200 dark:bg-indigo-900/30 dark:border-indigo-500/20 rounded-xl text-sm text-indigo-600 dark:text-indigo-300">
                    <span className="w-full sm:w-auto">{selectedIds.length} selected</span>
                    {!archiveMode && (
                        <div className="flex items-center gap-1">
                            <button onClick={handleBulkArchive} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-600/20 text-amber-300 hover:bg-amber-600/30 transition">
                                <Archive className="w-3.5 h-3.5" /> Archive
                            </button>
                        </div>
                    )}
                    <div className="flex items-center gap-1">
                        <button onClick={handleBulkDelete} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-600/20 text-rose-300 hover:bg-rose-600/30 transition">
                            <Trash2 className="w-3.5 h-3.5" /> Delete
                        </button>
                    </div>
                    <div className="flex items-center gap-1">
                        <button onClick={handleBulkCopy} className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-indigo-600/20 text-indigo-300 hover:bg-indigo-600/30 transition">
                            <Copy className="w-3.5 h-3.5" /> Copy
                        </button>
                    </div>
                    <div className="ml-auto flex items-center gap-1">
                        <button onClick={() => setSelectedIds([])} className="text-xs text-slate-400 hover:text-white">Clear</button>
                    </div>
                </div>
            )}

            {/* Table */}
            {isLoading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4">
                    <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin" />
                    <p className="text-slate-500 dark:text-slate-400 text-sm">Loading questions...</p>
                </div>
            ) : questions.length === 0 ? (
                <div className="p-12 text-center text-slate-500 text-sm italic">No questions found.</div>
            ) : (
                <>
                    {/* ── Desktop/Tablet: Table view (768px+) ── */}
                    <div className="hidden md:block rounded-2xl border border-slate-200 bg-white dark:border-slate-700/60 dark:bg-slate-900/50 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-slate-50 text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
                                    <tr>
                                        <th className="p-3 w-10">
                                            <input type="checkbox" checked={selectedIds.length === questions.length && questions.length > 0} onChange={toggleAll} className="rounded" />
                                        </th>
                                        <th className="p-3 font-medium">Question</th>
                                        <th className="p-3 font-medium">Subject</th>
                                        <th className="p-3 font-medium hidden lg:table-cell">Topic</th>
                                        <th className="p-3 font-medium">Difficulty</th>
                                        <th className="p-3 font-medium hidden lg:table-cell">Marks</th>
                                        <th className="p-3 font-medium hidden lg:table-cell">Used</th>
                                        <th className="p-3 font-medium hidden lg:table-cell">Accuracy</th>
                                        <th className="p-3 font-medium">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                                    {questions.map((q) => (
                                        <tr key={q._id} className="hover:bg-slate-50 dark:hover:bg-white/[0.02] transition">
                                            <td className="p-3">
                                                <input type="checkbox" checked={selectedIds.includes(q._id)} onChange={() => toggleSelect(q._id)} className="rounded" />
                                            </td>
                                            <td className="p-3 max-w-[300px]">
                                                <p className="text-slate-900 dark:text-white truncate">{q.question_en || q.question_bn || '—'}</p>
                                                {q.question_bn && q.question_en && <p className="text-slate-400 dark:text-slate-500 text-xs truncate mt-0.5">{q.question_bn}</p>}
                                            </td>
                                            <td className="p-3"><span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-indigo-500/10 text-indigo-300">{q.subject}</span></td>
                                            <td className="p-3 text-slate-500 dark:text-slate-400 hidden lg:table-cell">{q.topic || '—'}</td>
                                            <td className="p-3">{difficultyBadge(q.difficulty)}</td>
                                            <td className="p-3 text-slate-600 dark:text-slate-300 hidden lg:table-cell">{q.marks}{q.negativeMarks > 0 && <span className="text-rose-500 dark:text-rose-400 text-xs ml-1">-{q.negativeMarks}</span>}</td>
                                            <td className="p-3 text-slate-500 dark:text-slate-400 hidden lg:table-cell">{q.usageCount ?? 0}</td>
                                            <td className="p-3 text-slate-500 dark:text-slate-400 hidden lg:table-cell">{q.analytics?.accuracyPercent != null ? `${q.analytics.accuracyPercent}%` : '—'}</td>
                                            <td className="p-3">
                                                <div className="flex gap-1">
                                                    <div className="flex items-center gap-1">
                                                        <button onClick={() => setDetailQuestion(q)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 text-slate-400 hover:text-cyan-500 dark:hover:text-cyan-400 transition" title="View">
                                                            <Eye className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        <button onClick={() => onEdit(q._id)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 text-slate-400 hover:text-indigo-500 dark:hover:text-indigo-400 transition" title="Edit">
                                                            <Edit className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                    <div className="flex items-center gap-1">
                                                        <button onClick={async () => { await duplicateMut.mutateAsync(q._id); toast.success('Duplicated'); }} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 text-slate-400 hover:text-emerald-500 dark:hover:text-emerald-400 transition" title="Duplicate">
                                                            <Copy className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                    {archiveMode ? (
                                                        <div className="flex items-center gap-1">
                                                            <button onClick={async () => { await restoreMut.mutateAsync(q._id); toast.success('Restored'); }} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 text-slate-400 hover:text-emerald-500 dark:hover:text-emerald-400 transition" title="Restore">
                                                                <RotateCcw className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center gap-1">
                                                            <button onClick={async () => { await archiveMut.mutateAsync(q._id); toast.success('Archived'); }} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 text-slate-400 hover:text-amber-500 dark:hover:text-amber-400 transition" title="Archive">
                                                                <Archive className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                    )}
                                                    <div className="flex items-center gap-1">
                                                        <button onClick={async () => {
                                                            const confirmed = await showConfirmDialog({
                                                                title: 'Delete question',
                                                                message: 'Delete this question?',
                                                                confirmLabel: 'Delete',
                                                                tone: 'danger',
                                                            });
                                                            if (!confirmed) return;
                                                            await deleteMut.mutateAsync(q._id);
                                                            toast.success('Deleted');
                                                        }} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 transition" title="Delete">
                                                            <Trash2 className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* ── Mobile: Card view (<768px) ── */}
                    <div className="md:hidden space-y-2">
                        {/* Select all row */}
                        <div className="flex items-center gap-2 px-1">
                            <input type="checkbox" checked={selectedIds.length === questions.length && questions.length > 0} onChange={toggleAll} className="rounded" />
                            <span className="text-xs text-slate-500 dark:text-slate-400">Select all</span>
                        </div>
                        {questions.map((q) => (
                            <div key={q._id} className="rounded-xl border border-slate-200 bg-white dark:border-slate-700/60 dark:bg-slate-900/50 p-3 space-y-2">
                                {/* Top row: checkbox + question text */}
                                <div className="flex items-start gap-2">
                                    <input type="checkbox" checked={selectedIds.includes(q._id)} onChange={() => toggleSelect(q._id)} className="rounded mt-1 shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm text-slate-900 dark:text-white line-clamp-2">{q.question_en || q.question_bn || '—'}</p>
                                        {q.question_bn && q.question_en && <p className="text-slate-400 dark:text-slate-500 text-xs truncate mt-0.5">{q.question_bn}</p>}
                                    </div>
                                </div>
                                {/* Badges row */}
                                <div className="flex flex-wrap items-center gap-1.5 pl-6">
                                    <span className="px-2 py-0.5 rounded-md text-xs font-semibold bg-indigo-500/10 text-indigo-300">{q.subject}</span>
                                    {difficultyBadge(q.difficulty)}
                                    <span className="text-xs text-slate-500 dark:text-slate-400">{q.marks} marks</span>
                                </div>
                                {/* Actions row */}
                                <div className="flex items-center gap-1 pl-6 pt-1 border-t border-slate-100 dark:border-slate-800">
                                    <button onClick={() => setDetailQuestion(q)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 text-slate-400 hover:text-cyan-500 dark:hover:text-cyan-400 transition" title="View">
                                        <Eye className="w-4 h-4" />
                                    </button>
                                    <button onClick={() => onEdit(q._id)} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 text-slate-400 hover:text-indigo-500 dark:hover:text-indigo-400 transition" title="Edit">
                                        <Edit className="w-4 h-4" />
                                    </button>
                                    <button onClick={async () => { await duplicateMut.mutateAsync(q._id); toast.success('Duplicated'); }} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 text-slate-400 hover:text-emerald-500 dark:hover:text-emerald-400 transition" title="Duplicate">
                                        <Copy className="w-4 h-4" />
                                    </button>
                                    {archiveMode ? (
                                        <button onClick={async () => { await restoreMut.mutateAsync(q._id); toast.success('Restored'); }} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 text-slate-400 hover:text-emerald-500 dark:hover:text-emerald-400 transition" title="Restore">
                                            <RotateCcw className="w-4 h-4" />
                                        </button>
                                    ) : (
                                        <button onClick={async () => { await archiveMut.mutateAsync(q._id); toast.success('Archived'); }} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 text-slate-400 hover:text-amber-500 dark:hover:text-amber-400 transition" title="Archive">
                                            <Archive className="w-4 h-4" />
                                        </button>
                                    )}
                                    <button onClick={async () => {
                                        const confirmed = await showConfirmDialog({
                                            title: 'Delete question',
                                            message: 'Delete this question?',
                                            confirmLabel: 'Delete',
                                            tone: 'danger',
                                        });
                                        if (!confirmed) return;
                                        await deleteMut.mutateAsync(q._id);
                                        toast.success('Deleted');
                                    }} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-white/5 text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 transition" title="Delete">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="flex justify-center gap-1.5 md:gap-2 pt-2 flex-wrap">
                            {Array.from({ length: Math.min(totalPages, 10) }).map((_, i) => (
                                <button
                                    key={i + 1}
                                    onClick={() => setPage(i + 1)}
                                    className={`w-7 h-7 md:w-8 md:h-8 rounded-lg text-xs md:text-sm ${page === i + 1 ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 border border-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-700'}`}
                                >
                                    {i + 1}
                                </button>
                            ))}
                        </div>
                    )}
                </>
            )}

            {/* Detail modal */}
            {detailQuestion && (
                <QuestionDetailModal question={detailQuestion} onClose={() => setDetailQuestion(null)} />
            )}
        </div>
    );
}

function QuestionDetailModal({ question: q, onClose }: { question: BankQuestion; onClose: () => void }) {
    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white border border-slate-200 dark:bg-slate-900 dark:border-slate-700 rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-2xl max-h-[90vh] sm:max-h-[85vh] overflow-y-auto p-4 md:p-6 sm:m-4" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-bold text-slate-900 dark:text-white">Question Detail</h2>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-900 dark:hover:text-white transition">&times;</button>
                </div>
                <div className="space-y-4 text-sm">
                    <div>
                        <p className="text-slate-500 dark:text-slate-400 text-xs mb-1">Question (EN)</p>
                        <p className="text-slate-900 dark:text-white">{q.question_en || '—'}</p>
                    </div>
                    {q.question_bn && (
                        <div>
                            <p className="text-slate-500 dark:text-slate-400 text-xs mb-1">Question (BN)</p>
                            <p className="text-slate-900 dark:text-white">{q.question_bn}</p>
                        </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 md:gap-3">
                        {q.options.map((o) => (
                            <div key={o.key} className={`p-3 rounded-xl border ${o.key === q.correctKey ? 'border-emerald-500/40 bg-emerald-50 dark:bg-emerald-900/20' : 'border-slate-200 bg-slate-50 dark:border-slate-700/60 dark:bg-slate-800/40'}`}>
                                <span className="font-bold text-slate-600 dark:text-slate-300 mr-2">{o.key}.</span>
                                <span className="text-slate-900 dark:text-white">{o.text_en || o.text_bn || '—'}</span>
                                {o.text_bn && o.text_en && <p className="text-slate-400 dark:text-slate-500 text-xs mt-1">{o.text_bn}</p>}
                            </div>
                        ))}
                    </div>
                    {(q.explanation_en || q.explanation_bn) && (
                        <div className="p-3 bg-cyan-50 border border-cyan-200 dark:bg-cyan-900/20 dark:border-cyan-500/20 rounded-xl">
                            <p className="text-cyan-600 dark:text-cyan-400 text-xs font-semibold mb-1">Explanation</p>
                            <p className="text-slate-700 dark:text-slate-200">{q.explanation_en || q.explanation_bn}</p>
                        </div>
                    )}
                    <div className="flex flex-wrap gap-3 text-xs text-slate-500 dark:text-slate-400">
                        <span>Subject: <b className="text-slate-700 dark:text-slate-200">{q.subject}</b></span>
                        <span>Category: <b className="text-slate-700 dark:text-slate-200">{q.moduleCategory}</b></span>
                        <span>Topic: <b className="text-slate-700 dark:text-slate-200">{q.topic || '—'}</b></span>
                        <span>Marks: <b className="text-slate-700 dark:text-slate-200">{q.marks}</b></span>
                        {q.negativeMarks > 0 && <span>Neg: <b className="text-rose-500 dark:text-rose-300">-{q.negativeMarks}</b></span>}
                        <span>Version: <b className="text-slate-700 dark:text-slate-200">{q.versionNo}</b></span>
                    </div>
                    {q.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                            {q.tags.map((t) => <span key={t} className="px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-300 text-xs">{t}</span>)}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
