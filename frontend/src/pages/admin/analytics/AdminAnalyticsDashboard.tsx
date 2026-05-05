import { useState, useEffect, useCallback } from 'react';
import AdminGuardShell from '../../../components/admin/AdminGuardShell';
import {
    LineChart,
    Line,
    BarChart,
    Bar,
    PieChart,
    Pie,
    Cell,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
} from 'recharts';
import {
    BarChart3,
    BookOpen,
    Users,
    FileText,
    ClipboardList,
    UsersRound,
    TrendingUp,
    Download,
    RefreshCw,
    Loader2,
    AlertCircle,
    DollarSign,
    Activity,
    Calendar,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../services/api';

const ADMIN_PATH = String(import.meta.env.VITE_ADMIN_PATH || 'campusway-secure-admin').trim().replace(/^\/+|\/+$/g, '');

// ─── Types ───────────────────────────────────────────────────────────────

interface PlatformMetrics {
    totalQuestions: number;
    totalExams: number;
    totalAttempts: number;
    activeStudents: number;
    totalGroups: number;
    totalRevenue: number;
}

interface TodayMetrics {
    activeExams: number;
    liveExamCount: number;
    recentSignups: number;
    popularExams: Array<{ title: string; attempts: number }>;
}

interface DailyAttempt {
    date: string;
    attempts: number;
}

interface UserGrowthPoint {
    date: string;
    users: number;
}

interface DifficultyDistribution {
    level: string;
    count: number;
    wrongPercentage: number;
}

interface ExamStat {
    examId: string;
    title: string;
    participants: number;
    avgScore: number;
    highestScore: number;
    lowestScore: number;
    completionRate: number;
}

interface SubjectHeatmapEntry {
    subject: string;
    attempts: number;
    avgScore: number;
}

interface RevenueSummary {
    totalPaidExams: number;
    totalPackageSales: number;
    totalRevenue: number;
    recentTransactions: Array<{ date: string; amount: number; type: string }>;
}

interface AdminAnalyticsData {
    platform: PlatformMetrics;
    today: TodayMetrics;
    dailyAttempts: DailyAttempt[];
    userGrowth: UserGrowthPoint[];
    difficultyDistribution: DifficultyDistribution[];
    examStats: ExamStat[];
    subjectHeatmap: SubjectHeatmapEntry[];
    revenue: RevenueSummary;
}

type TimeRange = 'daily' | 'weekly' | 'monthly';

// ─── Constants ───────────────────────────────────────────────────────────

const DIFFICULTY_COLORS: Record<string, string> = {
    easy: '#22c55e',
    medium: '#f59e0b',
    hard: '#ef4444',
    expert: '#8b5cf6',
};

const PIE_COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6'];

const HEATMAP_COLORS = ['#dbeafe', '#93c5fd', '#3b82f6', '#1d4ed8', '#1e3a8a'];

// ─── Helpers ─────────────────────────────────────────────────────────────

function fmt(n: number | undefined | null): string {
    if (n == null || isNaN(n)) return '0';
    return new Intl.NumberFormat('en-BD', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(n);
}

function fmtPct(n: number | undefined | null): string {
    if (n == null || isNaN(n)) return '0%';
    return `${n.toFixed(1)}%`;
}

function heatColor(score: number): string {
    if (score >= 80) return HEATMAP_COLORS[4];
    if (score >= 60) return HEATMAP_COLORS[3];
    if (score >= 40) return HEATMAP_COLORS[2];
    if (score >= 20) return HEATMAP_COLORS[1];
    return HEATMAP_COLORS[0];
}

// ─── Sub-components ──────────────────────────────────────────────────────

function StatCard({
    icon,
    label,
    value,
    sub,
    color = 'indigo',
}: {
    icon: React.ReactNode;
    label: string;
    value: string;
    sub?: string;
    color?: 'indigo' | 'green' | 'amber' | 'red' | 'purple' | 'cyan';
}) {
    const colorMap: Record<string, string> = {
        indigo: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400',
        green: 'bg-green-50 text-green-600 dark:bg-green-950/40 dark:text-green-400',
        amber: 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400',
        red: 'bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400',
        purple: 'bg-purple-50 text-purple-600 dark:bg-purple-950/40 dark:text-purple-400',
        cyan: 'bg-cyan-50 text-cyan-600 dark:bg-cyan-950/40 dark:text-cyan-400',
    };

    return (
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800/80 dark:bg-slate-900/60">
            <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${colorMap[color]}`}>
                    {icon}
                </div>
                <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-slate-500 dark:text-slate-400">{label}</p>
                    <p className="text-xl font-bold text-slate-900 dark:text-white">{value}</p>
                    {sub && <p className="text-xs text-slate-400 dark:text-slate-500">{sub}</p>}
                </div>
            </div>
        </div>
    );
}

function Section({ title, children, actions }: { title: string; children: React.ReactNode; actions?: React.ReactNode }) {
    return (
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800/80 dark:bg-slate-900/60">
            <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">{title}</h3>
                {actions}
            </div>
            {children}
        </div>
    );
}

function DashboardSkeleton() {
    return (
        <div className="min-w-0 space-y-6 animate-pulse">
            <div className="rounded-2xl border border-slate-200/80 bg-white p-6 dark:border-slate-800/80 dark:bg-slate-900/60">
                <div className="h-7 w-64 rounded bg-slate-200 dark:bg-slate-700" />
                <div className="mt-2 h-4 w-48 rounded bg-slate-100 dark:bg-slate-800" />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
                {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-slate-800/80 dark:bg-slate-900/60">
                        <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-xl bg-slate-200 dark:bg-slate-700" />
                            <div className="flex-1 space-y-2">
                                <div className="h-3 w-20 rounded bg-slate-200 dark:bg-slate-700" />
                                <div className="h-5 w-16 rounded bg-slate-200 dark:bg-slate-700" />
                            </div>
                        </div>
                    </div>
                ))}
            </div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-slate-800/80 dark:bg-slate-900/60">
                        <div className="mb-4 h-4 w-40 rounded bg-slate-200 dark:bg-slate-700" />
                        <div className="h-56 rounded bg-slate-100 dark:bg-slate-800" />
                    </div>
                ))}
            </div>
        </div>
    );
}


// ─── Main Component ──────────────────────────────────────────────────────

export default function AdminAnalyticsDashboard() {
    const [data, setData] = useState<AdminAnalyticsData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [timeRange, setTimeRange] = useState<TimeRange>('daily');
    const [exporting, setExporting] = useState<'pdf' | 'excel' | null>(null);

    const fetchAnalytics = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await api.get(`/${ADMIN_PATH}/analytics/dashboard`, {
                params: { range: timeRange },
            });
            const body = res.data as AdminAnalyticsData;
            setData(body);
        } catch (err: unknown) {
            const msg =
                (err as { response?: { data?: { message?: string } } })?.response?.data
                    ?.message || 'Failed to load analytics data';
            setError(msg);
        } finally {
            setLoading(false);
        }
    }, [timeRange]);

    useEffect(() => {
        fetchAnalytics();
    }, [fetchAnalytics]);

    const handleExportPDF = useCallback(async () => {
        setExporting('pdf');
        try {
            const res = await api.get(`/${ADMIN_PATH}/analytics/export`, {
                params: { format: 'pdf', range: timeRange },
                responseType: 'blob',
            });
            const url = window.URL.createObjectURL(new Blob([res.data as BlobPart]));
            const link = document.createElement('a');
            link.href = url;
            link.download = `analytics-report-${timeRange}.pdf`;
            link.click();
            window.URL.revokeObjectURL(url);
            toast.success('PDF exported successfully');
        } catch {
            toast.error('PDF export is not yet available');
        } finally {
            setExporting(null);
        }
    }, [timeRange]);

    const handleExportExcel = useCallback(async () => {
        setExporting('excel');
        try {
            const res = await api.get(`/${ADMIN_PATH}/analytics/export`, {
                params: { format: 'excel', range: timeRange },
                responseType: 'blob',
            });
            const url = window.URL.createObjectURL(new Blob([res.data as BlobPart]));
            const link = document.createElement('a');
            link.href = url;
            link.download = `analytics-report-${timeRange}.xlsx`;
            link.click();
            window.URL.revokeObjectURL(url);
            toast.success('Excel exported successfully');
        } catch {
            toast.error('Excel export is not yet available');
        } finally {
            setExporting(null);
        }
    }, [timeRange]);

    if (loading) return <AdminGuardShell title="Analytics" description="Platform-wide metrics and insights" requiredModule="exam_center"><DashboardSkeleton /></AdminGuardShell>;

    if (error) {
        return (
            <AdminGuardShell title="Analytics" description="Platform-wide metrics and insights" requiredModule="exam_center">
            <div className="flex flex-col items-center justify-center gap-4 py-20">
                <AlertCircle className="h-12 w-12 text-red-400" />
                <p className="text-sm font-medium text-slate-600 dark:text-slate-400">{error}</p>
                <button
                    onClick={fetchAnalytics}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
                >
                    <RefreshCw size={14} /> Retry
                </button>
            </div>
            </AdminGuardShell>
        );
    }

    if (!data) return <AdminGuardShell title="Analytics" description="Platform-wide metrics and insights" requiredModule="exam_center"><div /></AdminGuardShell>;

    const { platform, today, dailyAttempts, userGrowth, difficultyDistribution, examStats, subjectHeatmap, revenue } = data;

    return (
        <AdminGuardShell title="Analytics" description="Platform-wide metrics and insights" requiredModule="exam_center">
        <div className="min-w-0 space-y-6">
            {/* ── Header ── */}
            <div className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200/80 bg-gradient-to-br from-white via-slate-50 to-slate-100/50 p-4 shadow-sm dark:border-slate-800/80 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 sm:p-6 xl:flex-row xl:items-center">
                <div>
                    <h2 className="bg-gradient-to-r from-slate-900 to-slate-600 bg-clip-text text-2xl font-black tracking-tight text-transparent dark:from-white dark:to-slate-300">
                        <BarChart3 className="mr-2 inline-block h-6 w-6 text-indigo-500" />
                        Analytics Dashboard
                    </h2>
                    <p className="mt-1 text-sm font-medium text-slate-500 dark:text-slate-400">
                        Platform-wide metrics, engagement, and revenue insights
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <select
                        value={timeRange}
                        onChange={(e) => setTimeRange(e.target.value as TimeRange)}
                        className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                        aria-label="Select time range"
                    >
                        <option value="daily">Daily (30 days)</option>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                    </select>
                    <button
                        onClick={fetchAnalytics}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                        aria-label="Refresh analytics"
                    >
                        <RefreshCw size={13} /> Refresh
                    </button>
                    <button
                        onClick={handleExportPDF}
                        disabled={exporting !== null}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                        aria-label="Export to PDF"
                    >
                        {exporting === 'pdf' ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                        PDF
                    </button>
                    <button
                        onClick={handleExportExcel}
                        disabled={exporting !== null}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
                        aria-label="Export to Excel"
                    >
                        {exporting === 'excel' ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                        Excel
                    </button>
                </div>
            </div>

            {/* ── Platform Metric Cards (Req 27.1) ── */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
                <StatCard icon={<BookOpen size={18} />} label="Total Questions" value={fmt(platform.totalQuestions)} color="indigo" />
                <StatCard icon={<FileText size={18} />} label="Total Exams" value={fmt(platform.totalExams)} color="green" />
                <StatCard icon={<ClipboardList size={18} />} label="Total Attempts" value={fmt(platform.totalAttempts)} color="amber" />
                <StatCard icon={<Users size={18} />} label="Active Students" value={fmt(platform.activeStudents)} color="cyan" />
                <StatCard icon={<UsersRound size={18} />} label="Total Groups" value={fmt(platform.totalGroups)} color="purple" />
                <StatCard icon={<DollarSign size={18} />} label="Revenue" value={`৳${fmt(platform.totalRevenue)}`} color="green" />
            </div>

            {/* ── Today's Snapshot (Req 27.2) ── */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatCard icon={<Activity size={18} />} label="Active Exams Today" value={fmt(today.activeExams)} color="green" />
                <StatCard icon={<TrendingUp size={18} />} label="Live Exams" value={fmt(today.liveExamCount)} color="red" />
                <StatCard icon={<Users size={18} />} label="Recent Signups" value={fmt(today.recentSignups)} color="cyan" />
                <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800/80 dark:bg-slate-900/60">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400">
                            <Calendar size={18} />
                        </div>
                        <div className="min-w-0 flex-1">
                            <p className="truncate text-xs font-medium text-slate-500 dark:text-slate-400">Popular Exams</p>
                            {today.popularExams?.length > 0 ? (
                                <ul className="mt-0.5 space-y-0.5">
                                    {today.popularExams.slice(0, 3).map((e, i) => (
                                        <li key={i} className="truncate text-xs text-slate-700 dark:text-slate-300">
                                            {e.title} <span className="text-slate-400">({fmt(e.attempts)})</span>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="text-sm font-bold text-slate-900 dark:text-white">—</p>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Time-Series Charts (Req 27.3) ── */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {/* Daily Attempts Line Chart */}
                <Section title="Exam Attempts Over Time">
                    {dailyAttempts.length > 0 ? (
                        <ResponsiveContainer width="100%" height={260}>
                            <LineChart data={dailyAttempts}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v.slice(5)} />
                                <YAxis tick={{ fontSize: 10 }} />
                                <Tooltip />
                                <Legend />
                                <Line type="monotone" dataKey="attempts" stroke="#6366f1" strokeWidth={2} dot={false} name="Attempts" />
                            </LineChart>
                        </ResponsiveContainer>
                    ) : (
                        <p className="py-12 text-center text-sm text-slate-400">No attempt data available</p>
                    )}
                </Section>

                {/* User Growth Line Chart */}
                <Section title="User Growth">
                    {userGrowth.length > 0 ? (
                        <ResponsiveContainer width="100%" height={260}>
                            <LineChart data={userGrowth}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v: string) => v.slice(5)} />
                                <YAxis tick={{ fontSize: 10 }} />
                                <Tooltip />
                                <Legend />
                                <Line type="monotone" dataKey="users" stroke="#22c55e" strokeWidth={2} dot={false} name="New Users" />
                            </LineChart>
                        </ResponsiveContainer>
                    ) : (
                        <p className="py-12 text-center text-sm text-slate-400">No user growth data available</p>
                    )}
                </Section>
            </div>

            {/* ── Question Difficulty Analysis (Req 27.4) + Question Type Distribution ── */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {/* Difficulty Distribution Bar Chart */}
                <Section title="Question Difficulty Analysis">
                    {difficultyDistribution.length > 0 ? (
                        <ResponsiveContainer width="100%" height={280}>
                            <BarChart data={difficultyDistribution}>
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                                <XAxis dataKey="level" tick={{ fontSize: 11 }} />
                                <YAxis tick={{ fontSize: 10 }} />
                                <Tooltip
                                    formatter={((value: number, name: string) =>
                                        name === 'wrongPercentage' ? fmtPct(value) : fmt(value)
                                    ) as never}
                                />
                                <Legend />
                                <Bar dataKey="count" name="Questions" radius={[4, 4, 0, 0]}>
                                    {difficultyDistribution.map((entry) => (
                                        <Cell key={entry.level} fill={DIFFICULTY_COLORS[entry.level] || '#6366f1'} />
                                    ))}
                                </Bar>
                                <Bar dataKey="wrongPercentage" name="Avg Wrong %" fill="#ef4444" opacity={0.3} radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <p className="py-12 text-center text-sm text-slate-400">No difficulty data available</p>
                    )}
                </Section>

                {/* Question Type Distribution Pie Chart */}
                <Section title="Question Type Distribution">
                    {difficultyDistribution.length > 0 ? (
                        <ResponsiveContainer width="100%" height={280}>
                            <PieChart>
                                <Pie
                                    data={difficultyDistribution}
                                    dataKey="count"
                                    nameKey="level"
                                    cx="50%"
                                    cy="50%"
                                    outerRadius={100}
                                    innerRadius={50}
                                    paddingAngle={2}
                                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                                    label={(({ name, percent }: { name: string; percent: number }) =>
                                        `${name} ${(percent * 100).toFixed(0)}%`
                                    ) as any}
                                >
                                    {difficultyDistribution.map((_, i) => (
                                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip formatter={((value: number) => fmt(value)) as never} />
                                <Legend />
                            </PieChart>
                        </ResponsiveContainer>
                    ) : (
                        <p className="py-12 text-center text-sm text-slate-400">No type data available</p>
                    )}
                </Section>
            </div>

            {/* ── Per-Exam Statistics Table (Req 27.5) ── */}
            <Section title="Per-Exam Statistics">
                {examStats.length > 0 ? (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead>
                                <tr className="border-b border-slate-200 dark:border-slate-700">
                                    <th className="pb-2 pr-4 text-xs font-semibold text-slate-500 dark:text-slate-400">Exam</th>
                                    <th className="pb-2 pr-4 text-xs font-semibold text-slate-500 dark:text-slate-400">Participants</th>
                                    <th className="pb-2 pr-4 text-xs font-semibold text-slate-500 dark:text-slate-400">Avg Score</th>
                                    <th className="pb-2 pr-4 text-xs font-semibold text-slate-500 dark:text-slate-400">Highest</th>
                                    <th className="pb-2 pr-4 text-xs font-semibold text-slate-500 dark:text-slate-400">Lowest</th>
                                    <th className="pb-2 text-xs font-semibold text-slate-500 dark:text-slate-400">Completion</th>
                                </tr>
                            </thead>
                            <tbody>
                                {examStats.slice(0, 20).map((exam) => (
                                    <tr key={exam.examId} className="border-b border-slate-100 dark:border-slate-800">
                                        <td className="max-w-[200px] truncate py-2 pr-4 font-medium text-slate-800 dark:text-slate-200">
                                            {exam.title}
                                        </td>
                                        <td className="py-2 pr-4 text-slate-600 dark:text-slate-400">{fmt(exam.participants)}</td>
                                        <td className="py-2 pr-4 text-slate-600 dark:text-slate-400">{fmtPct(exam.avgScore)}</td>
                                        <td className="py-2 pr-4 text-green-600 dark:text-green-400">{fmtPct(exam.highestScore)}</td>
                                        <td className="py-2 pr-4 text-red-600 dark:text-red-400">{fmtPct(exam.lowestScore)}</td>
                                        <td className="py-2 text-slate-600 dark:text-slate-400">{fmtPct(exam.completionRate)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <p className="py-8 text-center text-sm text-slate-400">No exam statistics available</p>
                )}
            </Section>

            {/* ── Subject Heatmap (Req 27.6) ── */}
            <Section title="Subject Performance Heatmap">
                {subjectHeatmap.length > 0 ? (
                    <div className="space-y-4">
                        {/* Bar chart view */}
                        <ResponsiveContainer width="100%" height={Math.max(200, subjectHeatmap.length * 36)}>
                            <BarChart data={subjectHeatmap} layout="vertical">
                                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                                <XAxis type="number" tick={{ fontSize: 10 }} />
                                <YAxis dataKey="subject" type="category" tick={{ fontSize: 10 }} width={120} />
                                <Tooltip
                                    formatter={((value: number, name: string) =>
                                        name === 'avgScore' ? fmtPct(value) : fmt(value)
                                    ) as never}
                                />
                                <Legend />
                                <Bar dataKey="attempts" name="Attempts" fill="#6366f1" radius={[0, 4, 4, 0]} />
                                <Bar dataKey="avgScore" name="Avg Score %" fill="#22c55e" radius={[0, 4, 4, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                        {/* Heatmap grid */}
                        <div className="flex flex-wrap gap-2">
                            {subjectHeatmap.map((entry) => (
                                <div
                                    key={entry.subject}
                                    className="flex flex-col items-center rounded-lg px-3 py-2 text-xs font-medium text-white"
                                    style={{ backgroundColor: heatColor(entry.avgScore) }}
                                    title={`${entry.subject}: ${fmtPct(entry.avgScore)} avg, ${fmt(entry.attempts)} attempts`}
                                >
                                    <span className="truncate max-w-[100px]">{entry.subject}</span>
                                    <span className="text-[10px] opacity-80">{fmtPct(entry.avgScore)}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <p className="py-8 text-center text-sm text-slate-400">No subject data available</p>
                )}
            </Section>

            {/* ── Revenue Reports (Req 27.7) ── */}
            <Section title="Revenue Summary">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
                        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Paid Exam Revenue</p>
                        <p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">৳{fmt(revenue.totalPaidExams)}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
                        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Package Sales</p>
                        <p className="mt-1 text-lg font-bold text-slate-900 dark:text-white">৳{fmt(revenue.totalPackageSales)}</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
                        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Total Revenue</p>
                        <p className="mt-1 text-lg font-bold text-green-600 dark:text-green-400">৳{fmt(revenue.totalRevenue)}</p>
                    </div>
                </div>
                {revenue.recentTransactions?.length > 0 && (
                    <div className="mt-4 overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead>
                                <tr className="border-b border-slate-200 dark:border-slate-700">
                                    <th className="pb-2 pr-4 text-xs font-semibold text-slate-500 dark:text-slate-400">Date</th>
                                    <th className="pb-2 pr-4 text-xs font-semibold text-slate-500 dark:text-slate-400">Type</th>
                                    <th className="pb-2 text-xs font-semibold text-slate-500 dark:text-slate-400">Amount</th>
                                </tr>
                            </thead>
                            <tbody>
                                {revenue.recentTransactions.slice(0, 10).map((tx, i) => (
                                    <tr key={i} className="border-b border-slate-100 dark:border-slate-800">
                                        <td className="py-2 pr-4 text-slate-600 dark:text-slate-400">{tx.date}</td>
                                        <td className="py-2 pr-4 text-slate-600 dark:text-slate-400 capitalize">{tx.type}</td>
                                        <td className="py-2 font-medium text-green-600 dark:text-green-400">৳{fmt(tx.amount)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Section>
        </div>
        </AdminGuardShell>
    );
}
