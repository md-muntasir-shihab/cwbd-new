import { useState, useEffect } from 'react';
import { Loader2, AlertCircle, RefreshCw, Calendar, Users, CheckCircle2 } from 'lucide-react';
import api from '../../../services/api';

// ─── Types ───────────────────────────────────────────────────────────────

export interface ExamSelectorPanelProps {
    apiUrl: string;
    onSelect: (examId: string) => void;
    title?: string;
    description?: string;
    emptyMessage?: string;
}

export interface ExamListItem {
    _id: string;
    title: string;
    status: string;
    startTime?: string;
    participantCount?: number;
}

// ─── Constants ───────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
    draft: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    scheduled: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
    active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    completed: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
    cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

const btnSecondary =
    'inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors';

// ─── Helper Functions ────────────────────────────────────────────────────

function formatDate(iso: string | undefined): string {
    if (!iso) return '—';
    try {
        return new Date(iso).toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
        });
    } catch {
        return '—';
    }
}

function getStatusColor(status: string): string {
    return STATUS_COLORS[status.toLowerCase()] || STATUS_COLORS.draft;
}

// ─── Skeleton Component ──────────────────────────────────────────────────

function ExamListSkeleton() {
    return (
        <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
                <div
                    key={i}
                    className="animate-pulse rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800"
                >
                    <div className="flex items-center justify-between">
                        <div className="flex-1 space-y-2">
                            <div className="h-5 w-3/4 rounded bg-slate-200 dark:bg-slate-700" />
                            <div className="h-4 w-1/2 rounded bg-slate-100 dark:bg-slate-800" />
                        </div>
                        <div className="h-6 w-20 rounded-full bg-slate-200 dark:bg-slate-700" />
                    </div>
                </div>
            ))}
        </div>
    );
}

// ─── Main Component ──────────────────────────────────────────────────────

export default function ExamSelectorPanel({
    apiUrl,
    onSelect,
    title = 'Select an Exam',
    description = 'Choose an exam from the list below to continue',
    emptyMessage = 'No exams found',
}: ExamSelectorPanelProps) {
    const [exams, setExams] = useState<ExamListItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchExams = async () => {
        setLoading(true);
        setError(null);
        try {
            const response = await api.get<{ items?: ExamListItem[]; data?: ExamListItem[] }>(apiUrl);
            const data = response.data;

            // Handle both paginated response (items) and direct array (data)
            const examList = data.items || data.data || [];
            setExams(Array.isArray(examList) ? examList : []);
        } catch (err: unknown) {
            const message =
                (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
                'Failed to load exams';
            setError(message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchExams();
    }, [apiUrl]);

    // ── Loading State ──
    if (loading) {
        return (
            <div className="mx-auto max-w-4xl px-4 py-6">
                <div className="mb-6">
                    <h1 className="text-xl font-bold text-slate-900 dark:text-white">{title}</h1>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>
                </div>
                <ExamListSkeleton />
            </div>
        );
    }

    // ── Error State ──
    if (error) {
        return (
            <div className="mx-auto max-w-4xl px-4 py-6">
                <div className="mb-6">
                    <h1 className="text-xl font-bold text-slate-900 dark:text-white">{title}</h1>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>
                </div>
                <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-red-200 bg-red-50 py-12 dark:border-red-800 dark:bg-red-900/20">
                    <AlertCircle className="h-10 w-10 text-red-500 dark:text-red-400" />
                    <p className="text-sm font-medium text-red-700 dark:text-red-300">{error}</p>
                    <button onClick={fetchExams} className={btnSecondary}>
                        <RefreshCw size={14} /> Retry
                    </button>
                </div>
            </div>
        );
    }

    // ── Empty State ──
    if (exams.length === 0) {
        return (
            <div className="mx-auto max-w-4xl px-4 py-6">
                <div className="mb-6">
                    <h1 className="text-xl font-bold text-slate-900 dark:text-white">{title}</h1>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>
                </div>
                <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-300 py-16 dark:border-slate-600">
                    <CheckCircle2 className="h-10 w-10 text-slate-400 dark:text-slate-500" />
                    <p className="text-sm font-medium text-slate-600 dark:text-slate-400">
                        {emptyMessage}
                    </p>
                </div>
            </div>
        );
    }

    // ── Exam List ──
    return (
        <div className="mx-auto max-w-4xl px-4 py-6">
            <div className="mb-6">
                <h1 className="text-xl font-bold text-slate-900 dark:text-white">{title}</h1>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>
            </div>

            <div className="space-y-3">
                {exams.map((exam) => (
                    <button
                        key={exam._id}
                        onClick={() => onSelect(exam._id)}
                        className="w-full rounded-xl border border-slate-200 bg-white p-4 text-left transition-all hover:border-indigo-300 hover:shadow-md dark:border-slate-700 dark:bg-slate-800 dark:hover:border-indigo-600"
                    >
                        <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0 flex-1">
                                <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                                    {exam.title}
                                </h3>
                                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
                                    {exam.startTime && (
                                        <span className="flex items-center gap-1">
                                            <Calendar className="h-3.5 w-3.5" />
                                            {formatDate(exam.startTime)}
                                        </span>
                                    )}
                                    {exam.participantCount !== undefined && (
                                        <span className="flex items-center gap-1">
                                            <Users className="h-3.5 w-3.5" />
                                            {exam.participantCount} participant
                                            {exam.participantCount !== 1 ? 's' : ''}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <span
                                className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${getStatusColor(exam.status)}`}
                            >
                                {exam.status}
                            </span>
                        </div>
                    </button>
                ))}
            </div>
        </div>
    );
}
