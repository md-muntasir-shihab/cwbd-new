import { BarChart3, RefreshCw, Hash, BookOpen, Layers, ClipboardList, TrendingUp, Award, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { useQuery } from '@tanstack/react-query';
import { useQBAnalytics, useRefreshAllAnalytics } from '../../../hooks/useQuestionBankV2Queries';
import { listAdminExams } from '../../../api/adminExamApi';
import type { AnalyticsSummary } from '../../../types/questionBank';

/* ── Difficulty color map ── */
const DIFFICULTY_COLORS: Record<string, { bar: string; badge: string; label: string }> = {
    easy: {
        bar: 'bg-emerald-500',
        badge: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400',
        label: 'Easy',
    },
    medium: {
        bar: 'bg-amber-500',
        badge: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400',
        label: 'Medium',
    },
    hard: {
        bar: 'bg-rose-500',
        badge: 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-400',
        label: 'Hard',
    },
};

export default function AnalyticsPanel() {
    const { data, isLoading } = useQBAnalytics();
    const refreshMut = useRefreshAllAnalytics();

    const analytics: AnalyticsSummary | undefined = data;

    function handleRefresh() {
        refreshMut.mutate(undefined, {
            onSuccess: () => toast.success('Analytics refreshed'),
        });
    }

    if (isLoading) {
        return (
            <div className="p-6 text-sm text-slate-500 dark:text-slate-400">Loading analytics…</div>
        );
    }

    if (!analytics) {
        return (
            <div className="p-6 text-sm text-slate-500 dark:text-slate-400">No analytics data available.</div>
        );
    }

    const { summary } = analytics;
    const byDifficulty = summary?.byDifficulty ?? [];
    const bySubject = summary?.bySubject ?? [];
    const totalQuestions = summary?.totalQuestions ?? 0;

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-indigo-400" />
                    Question Bank Analytics
                </h2>
                <button
                    onClick={handleRefresh}
                    disabled={refreshMut.isPending}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-100 border border-slate-200 text-sm text-slate-600 hover:text-slate-900 disabled:opacity-60 dark:bg-slate-800 dark:border-slate-700/60 dark:text-slate-300 dark:hover:text-white transition"
                >
                    <RefreshCw className={`w-4 h-4 ${refreshMut.isPending ? 'animate-spin' : ''}`} />
                    Refresh
                </button>
            </div>

            {/* Total question count */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-700/60 dark:bg-slate-900/40">
                <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-100 dark:bg-indigo-500/15">
                        <Hash className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                    </div>
                    <div>
                        <p className="text-sm text-slate-500 dark:text-slate-400">Total Questions</p>
                        <p className="text-3xl font-bold text-slate-900 dark:text-white">{totalQuestions.toLocaleString()}</p>
                    </div>
                </div>
            </div>

            {/* Difficulty distribution chart */}
            <DifficultyChart items={byDifficulty} total={totalQuestions} />

            {/* Subject breakdown */}
            <SubjectBreakdown items={bySubject} total={totalQuestions} />

            {/* Exam performance summary */}
            <ExamPerformanceSummary />
        </div>
    );
}

/* ── Exam Performance Summary ── */
function ExamPerformanceSummary() {
    const { data: exams, isLoading } = useQuery({
        queryKey: ['adminExams', 'performanceSummary'],
        queryFn: listAdminExams,
        staleTime: 5 * 60 * 1000,
    });

    if (isLoading) {
        return (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700/60 dark:bg-slate-900/40">
                <p className="text-xs text-slate-500 dark:text-slate-400">Loading exam data…</p>
            </div>
        );
    }

    const examList = Array.isArray(exams) ? exams : [];
    const totalExams = examList.length;

    const examsWithScores = examList.filter(
        (e: Record<string, unknown>) => typeof e.avgScore === 'number' && (e.avgScore as number) > 0,
    );
    const avgScore =
        examsWithScores.length > 0
            ? examsWithScores.reduce((sum: number, e: Record<string, unknown>) => sum + (e.avgScore as number), 0) / examsWithScores.length
            : 0;
    const highestScore = examList.reduce(
        (max: number, e: Record<string, unknown>) => Math.max(max, (e.highestScore as number) || 0),
        0,
    );
    const totalParticipation = examList.reduce(
        (sum: number, e: Record<string, unknown>) => sum + ((e.totalParticipants as number) || 0),
        0,
    );

    const stats = [
        { label: 'Total Exams', value: totalExams.toLocaleString(), icon: ClipboardList, color: 'bg-violet-100 dark:bg-violet-500/15', iconColor: 'text-violet-600 dark:text-violet-400' },
        { label: 'Avg Score', value: avgScore > 0 ? `${avgScore.toFixed(1)}%` : '—', icon: TrendingUp, color: 'bg-sky-100 dark:bg-sky-500/15', iconColor: 'text-sky-600 dark:text-sky-400' },
        { label: 'Highest Score', value: highestScore > 0 ? `${highestScore.toFixed(1)}%` : '—', icon: Award, color: 'bg-amber-100 dark:bg-amber-500/15', iconColor: 'text-amber-600 dark:text-amber-400' },
        { label: 'Total Participation', value: totalParticipation.toLocaleString(), icon: Users, color: 'bg-emerald-100 dark:bg-emerald-500/15', iconColor: 'text-emerald-600 dark:text-emerald-400' },
    ];

    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700/60 dark:bg-slate-900/40">
            <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-4 flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-indigo-400" />
                Exam Performance Summary
            </h3>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {stats.map((s) => (
                    <div key={s.label} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/50 p-3 dark:border-slate-700/40 dark:bg-slate-800/40">
                        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${s.color}`}>
                            <s.icon className={`w-5 h-5 ${s.iconColor}`} />
                        </div>
                        <div className="min-w-0">
                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{s.label}</p>
                            <p className="text-lg font-bold text-slate-900 dark:text-white">{s.value}</p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

/* ── Difficulty Bar Chart ── */
function DifficultyChart({ items, total }: { items: { _id: string; count: number }[]; total: number }) {
    const maxCount = Math.max(...items.map((i) => i.count), 1);

    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700/60 dark:bg-slate-900/40">
            <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-4 flex items-center gap-2">
                <Layers className="w-4 h-4 text-indigo-400" />
                Difficulty Distribution
            </h3>

            {items.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">No data</p>
            ) : (
                <div className="space-y-4">
                    {items.map((item) => {
                        const colors = DIFFICULTY_COLORS[item._id] ?? {
                            bar: 'bg-slate-400',
                            badge: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300',
                            label: item._id,
                        };
                        const pct = total > 0 ? ((item.count / total) * 100).toFixed(1) : '0';
                        const barWidth = maxCount > 0 ? (item.count / maxCount) * 100 : 0;

                        return (
                            <div key={item._id}>
                                <div className="flex items-center justify-between mb-1.5">
                                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${colors.badge}`}>
                                        {colors.label}
                                    </span>
                                    <span className="text-sm font-medium text-slate-700 dark:text-slate-200">
                                        {item.count.toLocaleString()}{' '}
                                        <span className="text-slate-400 dark:text-slate-500 text-xs">({pct}%)</span>
                                    </span>
                                </div>
                                <div className="h-3 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                                    <div
                                        className={`h-full rounded-full ${colors.bar} transition-all duration-500`}
                                        style={{ width: `${barWidth}%` }}
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

/* ── Subject Breakdown Table ── */
function SubjectBreakdown({ items, total }: { items: { _id: string; count: number }[]; total: number }) {
    if (items.length === 0) return null;

    return (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-700/60 dark:bg-slate-900/40">
            <h3 className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-3 flex items-center gap-2">
                <BookOpen className="w-4 h-4 text-indigo-400" />
                Questions by Subject
            </h3>
            <div className="overflow-x-auto">
                <table className="w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-800/60">
                        <tr>
                            <th className="p-2 text-left font-medium text-slate-600 dark:text-slate-300">Subject</th>
                            <th className="p-2 text-right font-medium text-slate-600 dark:text-slate-300">Count</th>
                            <th className="p-2 text-right font-medium text-slate-600 dark:text-slate-300">%</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                        {items.map((item) => {
                            const pct = total > 0 ? ((item.count / total) * 100).toFixed(1) : '0';
                            return (
                                <tr key={item._id} className="hover:bg-slate-50 dark:hover:bg-white/[0.02]">
                                    <td className="p-2 text-slate-900 dark:text-white">{item._id || '(none)'}</td>
                                    <td className="p-2 text-right text-slate-600 dark:text-slate-300">{item.count.toLocaleString()}</td>
                                    <td className="p-2 text-right text-slate-400 dark:text-slate-500">{pct}%</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
