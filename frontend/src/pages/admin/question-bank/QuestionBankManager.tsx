import { useState, useCallback, useRef, useMemo } from 'react';
import ExcelJS from 'exceljs';
import AdminGuardShell from '../../../components/admin/AdminGuardShell';
import {
    Search,
    Plus,
    Upload,
    Download,
    BookOpen,
    Loader2,
    AlertCircle,
    RefreshCw,
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
    useQuestions,
    useCreateQuestion,
    useUpdateQuestion,
    useArchiveQuestion,
    useBulkAction,
    useReviewQuestion,
    useImportQuestions,
} from '../../../hooks/useExamSystemQueries';
import * as questionBankApi from '../../../api/questionBankApi';
import type {
    QuestionFilters,
    CreateQuestionDto,
    QuestionType,
    DifficultyLevel,
    QuestionStatus,
    QuestionReviewStatus,
} from '../../../types/exam-system';
import type { CascadingDropdownsValue } from '../../../components/admin/question-bank/CascadingDropdowns';
import FilterBar from './FilterBar';
import QuestionTable, { SortState } from './QuestionTable';
import QuestionFormModal from './QuestionFormModal';

// ─── Constants ───────────────────────────────────────────────────────────

const DEFAULT_FILTERS: QuestionFilters = {
    page: 1,
    limit: 20,
};

export function formatImportToast(successCount: number, failedCount: number, totalCount: number, hierarchyCreated: number): void {
    if (totalCount === 0) {
        toast.error('No rows found. Download the template to see the expected format.', { duration: 8000 });
        return;
    }

    if (failedCount === 0 && totalCount > 0) {
        let msg = `Import complete: ${successCount} questions imported`;
        if (hierarchyCreated > 0) {
            msg += `, ${hierarchyCreated} hierarchy nodes created.`;
        } else {
            msg += `.`;
        }
        toast.success(msg);
        return;
    }

    if (failedCount > 0) {
        let msg = `Import complete: ${successCount} succeeded, ${failedCount} failed out of ${totalCount} rows`;
        if (hierarchyCreated > 0) {
            msg += `. ${hierarchyCreated} hierarchy nodes created.`;
        } else {
            msg += `.`;
        }
        toast.error(msg);
    }
}

export function showImportErrors(errors: unknown[]): void {
    if (!Array.isArray(errors) || errors.length === 0) return;
    const firstErrors = (errors as Array<{ row?: number; error?: string; message?: string }>).slice(0, 3);
    firstErrors.forEach((err) => {
        toast.error(`Row ${err.row ?? '?'}: ${err.error || err.message || 'Unknown error'}`, { duration: 6000 });
    });
}

// ─── Main Component ──────────────────────────────────────────────────────

/**
 * Admin Question Bank Manager page.
 *
 * Provides a full CRUD interface for managing questions: list with filters,
 * search, bulk actions, review workflow, create/edit modal, and import/export.
 *
 * @requirements 2.1, 2.6, 2.7, 2.8, 2.9, 2.11, 2.12, 2.13
 */
export default function QuestionBankManager() {
    // ── Filter state ─────────────────────────────────────────────────────
    const [filters, setFilters] = useState<QuestionFilters>(DEFAULT_FILTERS);
    const [searchInput, setSearchInput] = useState('');
    const [hierarchyValue, setHierarchyValue] = useState<CascadingDropdownsValue>({});
    const [difficultyFilter, setDifficultyFilter] = useState<DifficultyLevel | ''>('');
    const [typeFilter, setTypeFilter] = useState<QuestionType | ''>('');
    const [statusFilter, setStatusFilter] = useState<QuestionStatus | ''>('');
    const [reviewFilter, setReviewFilter] = useState<QuestionReviewStatus | ''>('');

    // ── Tab & Sort State ─────────────────────────────────────────────────
    const [activeTab, setActiveTab] = useState<'active' | 'recycle_bin'>('active');
    const [sortState, setSortState] = useState<SortState | undefined>(undefined);

    // ── Modal state ──────────────────────────────────────────────────────
    const [formOpen, setFormOpen] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);

    // ── Bulk selection state ─────────────────────────────────────────────
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    // ── Import ref ───────────────────────────────────────────────────────
    const importInputRef = useRef<HTMLInputElement>(null);

    // ── Computed filters ─────────────────────────────────────────────────
    const activeFilters = useMemo<QuestionFilters>(() => {
        const f: QuestionFilters = {
            ...filters,
            q: searchInput || undefined,
            group_id: hierarchyValue.group_id || undefined,
            sub_group_id: hierarchyValue.sub_group_id || undefined,
            subject_id: hierarchyValue.subject_id || undefined,
            chapter_id: hierarchyValue.chapter_id || undefined,
            topic_id: hierarchyValue.topic_id || undefined,
            difficulty: difficultyFilter || undefined,
            question_type: typeFilter || undefined,
            status: statusFilter || undefined,
            review_status: reviewFilter || undefined,
            archivedOnly: activeTab === 'recycle_bin',
            sortField: sortState?.field,
            sortOrder: sortState?.order,
        };
        return f;
    }, [filters, searchInput, hierarchyValue, difficultyFilter, typeFilter, statusFilter, reviewFilter, activeTab, sortState]);

    // ── Queries & mutations ──────────────────────────────────────────────
    const { data: questionsResponse, isLoading, isError, error, refetch } = useQuestions(activeFilters);
    const createQuestion = useCreateQuestion();
    const updateQuestion = useUpdateQuestion();
    const archiveQuestion = useArchiveQuestion();
    const bulkAction = useBulkAction();
    const reviewQuestion = useReviewQuestion();
    const importQuestions = useImportQuestions();

    const questions = (questionsResponse as unknown as { items?: Record<string, unknown>[] })?.items
        ?? (questionsResponse as unknown as { data?: Record<string, unknown>[] })?.data
        ?? [];
    const _resp = questionsResponse as unknown as Record<string, unknown> | undefined;
    const pagination: import('../../../types/exam-system').PaginationMeta | undefined = _resp
        ? {
            page: Number(_resp.page ?? 1),
            limit: Number(_resp.limit ?? 20),
            total: Number(_resp.total ?? 0),
            totalPages: Number(_resp.pages ?? _resp.totalPages ?? 1),
        }
        : undefined;

    // ── Handlers ─────────────────────────────────────────────────────────

    const handleSearch = useCallback((value: string) => {
        setSearchInput(value);
        setFilters((prev) => ({ ...prev, page: 1 }));
    }, []);

    const handleHierarchyChange = useCallback((value: CascadingDropdownsValue) => {
        setHierarchyValue(value);
        setFilters((prev) => ({ ...prev, page: 1 }));
    }, []);

    const handlePageChange = useCallback((page: number) => {
        setFilters((prev) => ({ ...prev, page }));
        setSelectedIds(new Set());
    }, []);

    const handleSort = useCallback((field: string) => {
        setSortState((prev) => {
            if (prev?.field === field) {
                return prev.order === 'asc' ? { field, order: 'desc' } : undefined;
            }
            return { field, order: 'asc' };
        });
        setFilters((prev) => ({ ...prev, page: 1 }));
    }, []);

    const handleTabChange = useCallback((tab: 'active' | 'recycle_bin') => {
        setActiveTab(tab);
        setFilters((prev) => ({ ...prev, page: 1 }));
        setSelectedIds(new Set());
    }, []);

    const handleCreate = useCallback(() => {
        setEditingId(null);
        setFormOpen(true);
    }, []);

    const handleEdit = useCallback((id: string) => {
        setEditingId(id);
        setFormOpen(true);
    }, []);

    const handleFormClose = useCallback(() => {
        setFormOpen(false);
        setEditingId(null);
    }, []);

    const handleFormSubmit = useCallback(
        async (data: CreateQuestionDto) => {
            try {
                if (editingId) {
                    await updateQuestion.mutateAsync({ id: editingId, payload: data });
                    toast.success('Question updated');
                } else {
                    await createQuestion.mutateAsync(data);
                    toast.success('Question created');
                }
                handleFormClose();
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Operation failed';
                toast.error(message);
            }
        },
        [editingId, createQuestion, updateQuestion, handleFormClose],
    );

    const handleArchive = useCallback(
        async (id: string) => {
            try {
                await archiveQuestion.mutateAsync(id);
                toast.success('Question archived');
                setSelectedIds((prev) => {
                    const next = new Set(prev);
                    next.delete(id);
                    return next;
                });
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Failed to archive';
                toast.error(message);
            }
        },
        [archiveQuestion],
    );

    const handleReview = useCallback(
        async (id: string, action: 'approve' | 'reject') => {
            try {
                await reviewQuestion.mutateAsync({ id, payload: { action } });
                toast.success(`Question ${action}d`);
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Review failed';
                toast.error(message);
            }
        },
        [reviewQuestion],
    );

    const handleBulkArchive = useCallback(async () => {
        if (selectedIds.size === 0) return;
        try {
            await bulkAction.mutateAsync({
                action: 'archive',
                ids: Array.from(selectedIds),
            });
            toast.success(`${selectedIds.size} question(s) archived`);
            setSelectedIds(new Set());
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Bulk archive failed';
            toast.error(message);
        }
    }, [selectedIds, bulkAction]);

    const handleBulkStatusChange = useCallback(
        async (status: QuestionStatus) => {
            if (selectedIds.size === 0) return;
            try {
                await bulkAction.mutateAsync({
                    action: 'status_change',
                    ids: Array.from(selectedIds),
                    newStatus: status,
                });
                toast.success(`${selectedIds.size} question(s) updated to ${status}`);
                setSelectedIds(new Set());
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Bulk status change failed';
                toast.error(message);
            }
        },
        [selectedIds, bulkAction],
    );

    const handleBulkApprove = useCallback(async () => {
        if (selectedIds.size === 0) return;
        try {
            await bulkAction.mutateAsync({
                action: 'approve',
                ids: Array.from(selectedIds),
            });
            toast.success(`${selectedIds.size} question(s) approved`);
            setSelectedIds(new Set());
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Bulk approve failed';
            toast.error(message);
        }
    }, [selectedIds, bulkAction]);

    const handleBulkRestore = useCallback(async () => {
        if (selectedIds.size === 0) return;
        try {
            await bulkAction.mutateAsync({
                action: 'restore',
                ids: Array.from(selectedIds),
            });
            toast.success(`${selectedIds.size} question(s) restored`);
            setSelectedIds(new Set());
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Bulk restore failed';
            toast.error(message);
        }
    }, [selectedIds, bulkAction]);

    const handleBulkHardDelete = useCallback(async () => {
        if (selectedIds.size === 0) return;
        if (!window.confirm('Are you sure you want to permanently delete these questions? This action cannot be undone.')) {
            return;
        }
        try {
            await bulkAction.mutateAsync({
                action: 'hard_delete',
                ids: Array.from(selectedIds),
            });
            toast.success(`${selectedIds.size} question(s) permanently deleted`);
            setSelectedIds(new Set());
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Permanent delete failed';
            toast.error(message);
        }
    }, [selectedIds, bulkAction]);

    const handleSingleRestore = useCallback((id: string) => {
        setSelectedIds(new Set([id]));
        // We set state, but we need to execute immediately since state update is async.
        // It's cleaner to just call mutateAsync directly for single items.
        bulkAction.mutateAsync({
            action: 'restore',
            ids: [id],
        }).then(() => {
            toast.success('Question restored');
            setSelectedIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
        }).catch((err) => {
            toast.error(err instanceof Error ? err.message : 'Failed to restore');
        });
    }, [bulkAction]);

    const handleSingleHardDelete = useCallback((id: string) => {
        if (!window.confirm('Are you sure you want to permanently delete this question? This action cannot be undone.')) return;
        bulkAction.mutateAsync({
            action: 'hard_delete',
            ids: [id],
        }).then(() => {
            toast.success('Question permanently deleted');
            setSelectedIds((prev) => { const n = new Set(prev); n.delete(id); return n; });
        }).catch((err) => {
            toast.error(err instanceof Error ? err.message : 'Failed to delete');
        });
    }, [bulkAction]);

    const handleToggleSelect = useCallback((id: string) => {
        setSelectedIds((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    }, []);

    const handleToggleSelectAll = useCallback(() => {
        if (selectedIds.size === questions.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(questions.map((q: Record<string, unknown>) => q._id as string)));
        }
    }, [selectedIds, questions]);

    // ── Import handler ───────────────────────────────────────────────────

    const handleImportClick = useCallback(() => {
        importInputRef.current?.click();
    }, []);

    const handleImportFile = useCallback(
        async (e: React.ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            if (!file) return;
            try {
                const result = await importQuestions.mutateAsync(file);
                // Axios interceptor unwraps { success, data } → data.
                // ImportPipelineService returns { total, success, failed, errors }.
                const data = result as unknown as Record<string, unknown>;
                const successCount = Number(data.successful ?? data.success ?? 0);
                const failedCount = Number(data.failed ?? 0);
                const totalCount = Number(data.totalRows ?? data.total ?? 0);
                const hierarchyCreated = Number(data.hierarchyCreated ?? 0);

                formatImportToast(successCount, failedCount, totalCount, hierarchyCreated);

                if (failedCount > 0 && Array.isArray(data.errors) && data.errors.length > 0) {
                    showImportErrors(data.errors);
                }
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Import failed';
                toast.error(message);
            }
            // Reset input so same file can be re-imported
            if (importInputRef.current) importInputRef.current.value = '';
        },
        [importQuestions],
    );

    const handleDownloadTemplate = useCallback(async () => {
        try {
            const TEMPLATE_HEADERS = [
                'questionType', 'questionText', 'questionTextBn',
                'option1', 'option1Bn', 'option2', 'option2Bn',
                'option3', 'option3Bn', 'option4', 'option4Bn',
                'correctOption', 'difficulty', 'marks', 'negativeMarks',
                'group', 'subGroup', 'subject', 'chapter', 'topic',
                'tags', 'explanation', 'explanationBn', 'imageUrl', 'year', 'source'
            ];

            const wb = new ExcelJS.Workbook();
            const ws = wb.addWorksheet('Questions');
            
            // Row 1: headers
            ws.addRow(TEMPLATE_HEADERS);
            ws.getRow(1).font = { bold: true };
            ws.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];

            // Sample MCQ
            ws.addRow([
                'mcq', 'What is the capital of France?', 'ফ্রান্সের রাজধানী কি?',
                'Berlin', 'বার্লিন', 'Madrid', 'মাদ্রিদ',
                'Paris', 'প্যারিস', 'Rome', 'রোম',
                '3', 'easy', '1', '0.25',
                'Admission', 'Engineering', 'Physics 1st Paper', 'Vector', 'Dot Product',
                'gk, geography', 'Paris is the capital.', 'প্যারিস হল রাজধানী।', '', '2023', 'Wikipedia'
            ]);

            // Sample Written
            ws.addRow([
                'written', 'Write a short essay on global warming.', 'গ্লোবাল ওয়ার্মিং নিয়ে একটি ছোট প্রবন্ধ লিখুন।',
                '', '', '', '',
                '', '', '', '',
                '', 'medium', '10', '0',
                'Admission', 'Engineering', 'Science', 'Environment', 'Climate',
                'essay, science', 'Global warming is...', 'গ্লোবাল ওয়ার্মিং হল...', '', '2023', 'Textbook'
            ]);

            const instructions = wb.addWorksheet('Instructions');
            instructions.addRow(['Column', 'Description (EN)', 'Description (BN)']);
            instructions.getRow(1).font = { bold: true };
            instructions.addRow(['questionText', 'Question text in English', 'ইংরেজিতে প্রশ্ন']);
            // etc., just keeping it minimal for instructions as requested.

            const buffer = await wb.xlsx.writeBuffer();
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'question-import-template.xlsx';
            document.body.appendChild(a); // Required for Firefox
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err) {
            toast.error('Template generation failed. Please try again.');
        }
    }, []);

    // ── Export handler ───────────────────────────────────────────────────

    const handleExport = useCallback(
        async (format: 'xlsx' | 'csv') => {
            try {
                const blob = await questionBankApi.exportQuestions(activeFilters, format);
                const url = URL.createObjectURL(blob as Blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `questions-export.${format}`;
                a.click();
                URL.revokeObjectURL(url);
                toast.success(`Exported as ${format.toUpperCase()}`);
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Export failed';
                toast.error(message);
            }
        },
        [activeFilters],
    );

    // ── Render ───────────────────────────────────────────────────────────

    return (
        <AdminGuardShell title="Question Bank" description="Manage questions, review submissions, and import/export" requiredModule="exam_center">
            <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
                {/* ── Page Header ─────────────────────────────────────────── */}
                <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400">
                            <BookOpen size={20} />
                        </div>
                        <div>
                            <h1 className="text-lg font-semibold text-slate-900 dark:text-white">
                                Question Bank
                            </h1>
                            <p className="text-sm text-slate-500 dark:text-slate-400">
                                Manage questions, review submissions, and import/export
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        {/* Search */}
                        <div className="relative">
                            <Search
                                size={16}
                                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                            />
                            <input
                                type="text"
                                value={searchInput}
                                onChange={(e) => handleSearch(e.target.value)}
                                placeholder="Search questions…"
                                className="w-56 rounded-lg border border-slate-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:focus:border-indigo-400"
                                aria-label="Search questions"
                            />
                        </div>

                        {/* Import */}
                        <input
                            ref={importInputRef}
                            type="file"
                            accept=".xlsx,.csv,.json"
                            onChange={handleImportFile}
                            className="hidden"
                            aria-label="Import questions file"
                        />
                        <button
                            type="button"
                            onClick={handleDownloadTemplate}
                            className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                            title="Show expected import columns"
                        >
                            <Download size={16} />
                            Template
                        </button>
                        <button
                            type="button"
                            onClick={handleImportClick}
                            disabled={importQuestions.isPending}
                            className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700 disabled:opacity-50"
                        >
                            {importQuestions.isPending ? (
                                <Loader2 size={16} className="animate-spin" />
                            ) : (
                                <Upload size={16} />
                            )}
                            Import
                        </button>

                        {/* Export dropdown */}
                        <div className="relative group">
                            <button
                                type="button"
                                className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                            >
                                <Download size={16} />
                                Export
                            </button>
                            <div className="invisible absolute right-0 z-20 mt-1 w-36 rounded-lg border border-slate-200 bg-white py-1 shadow-lg group-hover:visible dark:border-slate-700 dark:bg-slate-800">
                                <button
                                    type="button"
                                    onClick={() => handleExport('xlsx')}
                                    className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
                                >
                                    Excel (.xlsx)
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleExport('csv')}
                                    className="block w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-700"
                                >
                                    CSV (.csv)
                                </button>
                            </div>
                        </div>

                        {/* Refresh */}
                        <button
                            type="button"
                            onClick={() => refetch()}
                            disabled={isLoading}
                            className="rounded-lg border border-slate-300 p-2 text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700 disabled:opacity-50"
                            aria-label="Refresh questions"
                        >
                            <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
                        </button>

                        {/* Create */}
                        <button
                            type="button"
                            onClick={handleCreate}
                            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
                        >
                            <Plus size={16} />
                            New Question
                        </button>
                    </div>
                </div>

                {/* ── Tabs ──────────────────────────────────────────────── */}
                <div className="mb-6 flex border-b border-slate-200 dark:border-slate-700/60">
                    <button
                        type="button"
                        onClick={() => handleTabChange('active')}
                        className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                            activeTab === 'active'
                                ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
                                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300 dark:text-slate-400 dark:hover:text-slate-300 dark:hover:border-slate-600'
                        }`}
                    >
                        Active Questions
                    </button>
                    <button
                        type="button"
                        onClick={() => handleTabChange('recycle_bin')}
                        className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
                            activeTab === 'recycle_bin'
                                ? 'border-red-600 text-red-600 dark:border-red-400 dark:text-red-400'
                                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300 dark:text-slate-400 dark:hover:text-slate-300 dark:hover:border-slate-600'
                        }`}
                    >
                        Recycle Bin
                    </button>
                </div>

                {/* ── Filters ─────────────────────────────────────────────── */}
                <FilterBar
                    hierarchyValue={hierarchyValue}
                    onHierarchyChange={handleHierarchyChange}
                    difficulty={difficultyFilter}
                    onDifficultyChange={(v) => {
                        setDifficultyFilter(v);
                        setFilters((prev) => ({ ...prev, page: 1 }));
                    }}
                    questionType={typeFilter}
                    onQuestionTypeChange={(v) => {
                        setTypeFilter(v);
                        setFilters((prev) => ({ ...prev, page: 1 }));
                    }}
                    status={statusFilter}
                    onStatusChange={(v) => {
                        setStatusFilter(v);
                        setFilters((prev) => ({ ...prev, page: 1 }));
                    }}
                    reviewStatus={reviewFilter}
                    onReviewStatusChange={(v) => {
                        setReviewFilter(v);
                        setFilters((prev) => ({ ...prev, page: 1 }));
                    }}
                />

                {/* ── Bulk Actions Toolbar ────────────────────────────────── */}
                {selectedIds.size > 0 && (
                    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 dark:border-indigo-800 dark:bg-indigo-900/20">
                        <span className="text-sm font-medium text-indigo-700 dark:text-indigo-300">
                            {selectedIds.size} selected
                        </span>
                        <div className="h-4 w-px bg-indigo-300 dark:bg-indigo-700" />
                        
                        {activeTab === 'recycle_bin' ? (
                            /* Recycle Bin Bulk Actions */
                            <>
                                <button
                                    type="button"
                                    onClick={handleBulkRestore}
                                    disabled={bulkAction.isPending}
                                    className="rounded-md bg-emerald-100 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:hover:bg-emerald-900/50 disabled:opacity-50"
                                >
                                    Restore Selected
                                </button>
                                <button
                                    type="button"
                                    onClick={handleBulkHardDelete}
                                    disabled={bulkAction.isPending}
                                    className="rounded-md bg-red-100 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-300 dark:hover:bg-red-900/50 disabled:opacity-50"
                                >
                                    Permanently Delete
                                </button>
                            </>
                        ) : (
                            /* Active View Bulk Actions */
                            <>
                                <button
                                    type="button"
                                    onClick={handleBulkApprove}
                                    disabled={bulkAction.isPending}
                                    className="rounded-md bg-indigo-100 px-3 py-1.5 text-xs font-medium text-indigo-700 hover:bg-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:hover:bg-indigo-900/50 disabled:opacity-50"
                                >
                                    Approve Selected
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleBulkStatusChange('published')}
                                    disabled={bulkAction.isPending}
                                    className="rounded-md bg-emerald-100 px-3 py-1.5 text-xs font-medium text-emerald-700 hover:bg-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:hover:bg-emerald-900/50 disabled:opacity-50"
                                >
                                    Publish
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleBulkStatusChange('draft')}
                                    disabled={bulkAction.isPending}
                                    className="rounded-md bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600 disabled:opacity-50"
                                >
                                    Revert to Draft
                                </button>
                                <div className="h-4 w-px bg-indigo-300 dark:bg-indigo-700" />
                                <button
                                    type="button"
                                    onClick={handleBulkArchive}
                                    disabled={bulkAction.isPending}
                                    className="rounded-md bg-red-100 px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-300 dark:hover:bg-red-900/50 disabled:opacity-50"
                                >
                                    Move to Recycle Bin
                                </button>
                            </>
                        )}
                        {bulkAction.isPending && <Loader2 size={16} className="animate-spin text-indigo-500" />}
                    </div>
                )}

                {/* ── Error State ─────────────────────────────────────────── */}
                {isError && (
                    <div className="mb-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-300">
                        <AlertCircle size={16} />
                        {error instanceof Error ? error.message : 'Failed to load questions'}
                    </div>
                )}

                {/* ── Question Table ───────────────────────────────────────── */}
                <QuestionTable
                    questions={questions}
                    isLoading={isLoading}
                    selectedIds={selectedIds}
                    onToggleSelect={handleToggleSelect}
                    onToggleSelectAll={handleToggleSelectAll}
                    onEdit={handleEdit}
                    onArchive={handleArchive}
                    onReview={handleReview}
                    onRestore={handleSingleRestore}
                    onHardDelete={handleSingleHardDelete}
                    pagination={pagination}
                    onPageChange={handlePageChange}
                    isRecycleBin={activeTab === 'recycle_bin'}
                    sortState={sortState}
                    onSort={handleSort}
                />

                {/* ── Create/Edit Modal ────────────────────────────────────── */}
                {formOpen && (
                    <QuestionFormModal
                        editingId={editingId}
                        onClose={handleFormClose}
                        onSubmit={handleFormSubmit}
                        isSubmitting={createQuestion.isPending || updateQuestion.isPending}
                    />
                )}
            </div>
        </AdminGuardShell>
    );
}
