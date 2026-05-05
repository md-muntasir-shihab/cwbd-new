import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AdminGuardShell from '../../../components/admin/AdminGuardShell';
import ExamSelectorPanel from '../../../components/admin/exam-center/ExamSelectorPanel';
import {
    ShieldAlert,
    Loader2,
    AlertCircle,
    RefreshCw,
    Eye,
    Monitor,
    Copy,
    Maximize,
    Fingerprint,
    Globe,
    Users,
    AlertTriangle,
    BarChart3,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../services/api';
import type { ViolationType, AntiCheatViolationLog } from '../../../types/exam-system';

// ─── Types ───────────────────────────────────────────────────────────────

interface ViolationSummary {
    totalViolations: number;
    flaggedSessions: number;
    uniqueStudentsFlagged: number;
}

interface ViolationByType {
    type: ViolationType;
    count: number;
}

interface FlaggedSession {
    sessionId: string;
    studentId: string;
    studentName: string;
    studentEmail?: string;
    violationCount: number;
    violationTypes: ViolationType[];
    deviceFingerprint?: string;
    ipAddress?: string;
    submittedAt?: string;
    status?: string;
}

interface AntiCheatReportData {
    summary: ViolationSummary;
    violationsByType: ViolationByType[];
    flaggedSessions: FlaggedSession[];
    violations?: AntiCheatViolationLog[];
}

// ─── Constants ───────────────────────────────────────────────────────────

const BASE = '/v1/exams';

const btnPrimary =
    'inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors';

const btnSecondary =
    'inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors';

const VIOLATION_META: Record<ViolationType, { label: string; icon: typeof Eye; color: string }> = {
    tab_switch: {
        label: 'Tab Switch',
        icon: Eye,
        color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    },
    copy_attempt: {
        label: 'Copy Attempt',
        icon: Copy,
        color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
    },
    fullscreen_exit: {
        label: 'Fullscreen Exit',
        icon: Maximize,
        color: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
    },
    fingerprint_match: {
        label: 'Fingerprint Match',
        icon: Fingerprint,
        color: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
    },
    ip_duplicate: {
        label: 'IP Duplicate',
        icon: Globe,
        color: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
    },
};

// ─── Helpers ─────────────────────────────────────────────────────────────

function fmtDate(iso: string | undefined): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function severityBadge(count: number): string {
    if (count >= 5) return 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300';
    if (count >= 3) return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300';
    return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
}

// ─── Sub-components ──────────────────────────────────────────────────────

function StatCard({
    icon,
    label,
    value,
    color = 'indigo',
}: {
    icon: React.ReactNode;
    label: string;
    value: string | number;
    color?: 'indigo' | 'red' | 'amber' | 'purple';
}) {
    const colorMap: Record<string, string> = {
        indigo: 'bg-indigo-50 text-indigo-600 dark:bg-indigo-950/40 dark:text-indigo-400',
        red: 'bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400',
        amber: 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400',
        purple: 'bg-purple-50 text-purple-600 dark:bg-purple-950/40 dark:text-purple-400',
    };

    return (
        <div className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800/80 dark:bg-slate-900/60">
            <div className="flex items-center gap-3">
                <div
                    className={`flex h-10 w-10 items-center justify-center rounded-xl ${colorMap[color]}`}
                >
                    {icon}
                </div>
                <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-medium text-slate-500 dark:text-slate-400">
                        {label}
                    </p>
                    <p className="text-xl font-bold text-slate-900 dark:text-white">{value}</p>
                </div>
            </div>
        </div>
    );
}

function Section({
    title,
    icon,
    children,
    actions,
}: {
    title: string;
    icon: React.ReactNode;
    children: React.ReactNode;
    actions?: React.ReactNode;
}) {
    return (
        <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm dark:border-slate-800/80 dark:bg-slate-900/60">
            <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                    {icon}
                    <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                        {title}
                    </h3>
                </div>
                {actions}
            </div>
            {children}
        </div>
    );
}

function PageSkeleton() {
    return (
        <div className="min-w-0 space-y-6 animate-pulse">
            <div className="rounded-2xl border border-slate-200/80 bg-white p-6 dark:border-slate-800/80 dark:bg-slate-900/60">
                <div className="h-7 w-64 rounded bg-slate-200 dark:bg-slate-700" />
                <div className="mt-2 h-4 w-48 rounded bg-slate-100 dark:bg-slate-800" />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {Array.from({ length: 3 }).map((_, i) => (
                    <div
                        key={i}
                        className="rounded-2xl border border-slate-200/80 bg-white p-4 dark:border-slate-800/80 dark:bg-slate-900/60"
                    >
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
            {Array.from({ length: 2 }).map((_, i) => (
                <div
                    key={i}
                    className="rounded-2xl border border-slate-200/80 bg-white p-5 dark:border-slate-800/80 dark:bg-slate-900/60"
                >
                    <div className="mb-4 h-4 w-40 rounded bg-slate-200 dark:bg-slate-700" />
                    <div className="h-40 rounded bg-slate-100 dark:bg-slate-800" />
                </div>
            ))}
        </div>
    );
}

// ─── Main Component ──────────────────────────────────────────────────────

export default function AntiCheatReport() {
    const { examId } = useParams<{ examId?: string }>();
    const navigate = useNavigate();

    const [data, setData] = useState<AntiCheatReportData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [expandedSession, setExpandedSession] = useState<string | null>(null);

    // Early return: if no examId, show exam selector
    if (!examId) {
        return (
            <AdminGuardShell title="Anti-Cheat Report" requiredModule="exam_center">
                <ExamSelectorPanel
                    apiUrl="/v1/exams?status=completed"
                    onSelect={(id) => navigate(`/exam-center/anti-cheat/${id}`)}
                    title="Select an Exam"
                    description="Choose a completed exam to view its anti-cheat report"
                    emptyMessage="No completed exams found"
                />
            </AdminGuardShell>
        );
    }

    const fetchReport = useCallback(async () => {

        setLoading(true);
        setError(null);
        try {
            const res = await api.get<AntiCheatReportData>(
                `${BASE}/${examId}/anti-cheat-report`,
            );
            const body = res.data;

            // Normalize: API may return data in different shapes
            const report: AntiCheatReportData = {
                summary: body.summary ?? {
                    totalViolations: 0,
                    flaggedSessions: 0,
                    uniqueStudentsFlagged: 0,
                },
                violationsByType: body.violationsByType ?? [],
                flaggedSessions: body.flaggedSessions ?? [],
                violations: body.violations,
            };

            setData(report);
        } catch (err: unknown) {
            const msg =
                (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
                'Failed to load anti-cheat report';
            setError(msg);
        } finally {
            setLoading(false);
        }
    }, [examId]);

    useEffect(() => {
        fetchReport();
    }, [fetchReport]);

    // Compute max violation count for bar width scaling
    const maxViolationCount = useMemo(() => {
        if (!data?.violationsByType.length) return 1;
        return Math.max(...data.violationsByType.map((v) => v.count), 1);
    }, [data]);

    // ── Render ──
    if (loading) return <AdminGuardShell title="Anti-Cheat Report" requiredModule="exam_center"><PageSkeleton /></AdminGuardShell>;

    if (error) {
        return (
            <AdminGuardShell title="Anti-Cheat Report" requiredModule="exam_center">
                <div className="flex flex-col items-center justify-center gap-4 py-20">
                    <AlertCircle className="h-12 w-12 text-red-400" />
                    <p className="text-sm font-medium text-slate-600 dark:text-slate-400">{error}</p>
                    <button onClick={fetchReport} className={btnPrimary}>
                        <RefreshCw size={14} /> Retry
                    </button>
                </div>
            </AdminGuardShell>
        );
    }

    if (!data) return null;

    const { summary, violationsByType, flaggedSessions } = data;

    return (
        <AdminGuardShell title="Anti-Cheat Report" requiredModule="exam_center">
            <div className="min-w-0 space-y-6">
                {/* ── Header ── */}
                <div className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200/80 bg-gradient-to-br from-white via-slate-50 to-slate-100/50 p-4 shadow-sm dark:border-slate-800/80 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 sm:p-6 xl:flex-row xl:items-center">
                    <div>
                        <h2 className="bg-gradient-to-r from-slate-900 to-slate-600 bg-clip-text text-2xl font-black tracking-tight text-transparent dark:from-white dark:to-slate-300">
                            <ShieldAlert className="mr-2 inline-block h-6 w-6 text-red-500" />
                            Anti-Cheat Report
                        </h2>
                        <p className="mt-1 text-sm font-medium text-slate-500 dark:text-slate-400">
                            Exam ID: <span className="font-mono text-xs">{examId}</span>
                        </p>
                    </div>
                    <button onClick={fetchReport} className={btnSecondary} aria-label="Refresh report">
                        <RefreshCw size={14} /> Refresh
                    </button>
                </div>

                {/* ── Summary Stats ── */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <StatCard
                        icon={<AlertTriangle size={18} />}
                        label="Total Violations"
                        value={summary.totalViolations}
                        color="red"
                    />
                    <StatCard
                        icon={<Monitor size={18} />}
                        label="Flagged Sessions"
                        value={summary.flaggedSessions}
                        color="amber"
                    />
                    <StatCard
                        icon={<Users size={18} />}
                        label="Unique Students Flagged"
                        value={summary.uniqueStudentsFlagged}
                        color="purple"
                    />
                </div>

                {/* ── Violation Breakdown by Type ── */}
                <Section
                    title="Violation Breakdown by Type"
                    icon={<BarChart3 size={16} className="text-indigo-500" />}
                >
                    {violationsByType.length > 0 ? (
                        <div className="space-y-3">
                            {violationsByType.map((v) => {
                                const meta = VIOLATION_META[v.type] ?? {
                                    label: v.type.replace(/_/g, ' '),
                                    icon: AlertTriangle,
                                    color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
                                };
                                const Icon = meta.icon;
                                const pct = Math.round((v.count / maxViolationCount) * 100);

                                return (
                                    <div key={v.type} className="flex items-center gap-3">
                                        <div
                                            className={`flex h-8 w-8 items-center justify-center rounded-lg ${meta.color}`}
                                        >
                                            <Icon size={14} />
                                        </div>
                                        <div className="min-w-[120px] text-sm font-medium text-slate-700 dark:text-slate-300">
                                            {meta.label}
                                        </div>
                                        <div className="flex-1">
                                            <div className="h-3 w-full rounded-full bg-slate-100 dark:bg-slate-800">
                                                <div
                                                    className="h-3 rounded-full bg-indigo-500 transition-all"
                                                    style={{ width: `${pct}%` }}
                                                />
                                            </div>
                                        </div>
                                        <span className="min-w-[40px] text-right text-sm font-bold text-slate-800 dark:text-slate-200">
                                            {v.count}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="flex flex-col items-center gap-2 py-12">
                            <ShieldAlert className="h-10 w-10 text-green-400" />
                            <p className="text-sm text-slate-400 dark:text-slate-500">
                                No violations recorded for this exam
                            </p>
                        </div>
                    )}
                </Section>

                {/* ── Flagged Sessions Table ── */}
                <Section
                    title="Flagged Sessions"
                    icon={<AlertTriangle size={16} className="text-red-500" />}
                    actions={
                        <span className="text-xs text-slate-400 dark:text-slate-500">
                            {flaggedSessions.length} session{flaggedSessions.length !== 1 ? 's' : ''}
                        </span>
                    }
                >
                    {flaggedSessions.length > 0 ? (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead>
                                    <tr className="border-b border-slate-200 dark:border-slate-700">
                                        <th className="pb-2 pr-4 text-xs font-semibold text-slate-500 dark:text-slate-400">
                                            Student
                                        </th>
                                        <th className="pb-2 pr-4 text-xs font-semibold text-slate-500 dark:text-slate-400">
                                            Violations
                                        </th>
                                        <th className="pb-2 pr-4 text-xs font-semibold text-slate-500 dark:text-slate-400">
                                            Types
                                        </th>
                                        <th className="pb-2 pr-4 text-xs font-semibold text-slate-500 dark:text-slate-400">
                                            Device Fingerprint
                                        </th>
                                        <th className="pb-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                                            Submitted
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {flaggedSessions.map((s) => (
                                        <tr
                                            key={s.sessionId}
                                            className="cursor-pointer border-b border-slate-100 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/50"
                                            onClick={() =>
                                                setExpandedSession(
                                                    expandedSession === s.sessionId
                                                        ? null
                                                        : s.sessionId,
                                                )
                                            }
                                        >
                                            <td className="py-2.5 pr-4">
                                                <div className="font-medium text-slate-800 dark:text-slate-200">
                                                    {s.studentName || 'Unknown'}
                                                </div>
                                                {s.studentEmail && (
                                                    <div className="text-xs text-slate-400">
                                                        {s.studentEmail}
                                                    </div>
                                                )}
                                            </td>
                                            <td className="py-2.5 pr-4">
                                                <span
                                                    className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${severityBadge(s.violationCount)}`}
                                                >
                                                    {s.violationCount}
                                                </span>
                                            </td>
                                            <td className="py-2.5 pr-4">
                                                <div className="flex flex-wrap gap-1">
                                                    {s.violationTypes.map((vt) => {
                                                        const meta = VIOLATION_META[vt];
                                                        return (
                                                            <span
                                                                key={vt}
                                                                className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium ${meta?.color ?? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}
                                                            >
                                                                {meta?.label ?? vt.replace(/_/g, ' ')}
                                                            </span>
                                                        );
                                                    })}
                                                </div>
                                            </td>
                                            <td className="py-2.5 pr-4">
                                                {s.deviceFingerprint ? (
                                                    <span
                                                        className="inline-block max-w-[120px] truncate rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                                                        title={s.deviceFingerprint}
                                                    >
                                                        {s.deviceFingerprint}
                                                    </span>
                                                ) : (
                                                    <span className="text-xs text-slate-400">—</span>
                                                )}
                                            </td>
                                            <td className="whitespace-nowrap py-2.5 text-slate-500 dark:text-slate-400">
                                                {fmtDate(s.submittedAt)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center gap-2 py-12">
                            <ShieldAlert className="h-10 w-10 text-green-400" />
                            <p className="text-sm text-slate-400 dark:text-slate-500">
                                No flagged sessions for this exam
                            </p>
                        </div>
                    )}
                </Section>

                {/* ── Suspicious Patterns ── */}
                {flaggedSessions.length > 0 && (
                    <Section
                        title="Suspicious Patterns"
                        icon={<Fingerprint size={16} className="text-purple-500" />}
                    >
                        <SuspiciousPatterns sessions={flaggedSessions} />
                    </Section>
                )}
            </div>
        </AdminGuardShell>
    );
}

// ─── Suspicious Patterns Sub-component ───────────────────────────────────

function SuspiciousPatterns({ sessions }: { sessions: FlaggedSession[] }) {
    // Detect duplicate fingerprints
    const fingerprintGroups = useMemo(() => {
        const map = new Map<string, FlaggedSession[]>();
        for (const s of sessions) {
            if (s.deviceFingerprint) {
                const existing = map.get(s.deviceFingerprint) ?? [];
                existing.push(s);
                map.set(s.deviceFingerprint, existing);
            }
        }
        return Array.from(map.entries()).filter(([, group]) => group.length > 1);
    }, [sessions]);

    // Detect duplicate IPs
    const ipGroups = useMemo(() => {
        const map = new Map<string, FlaggedSession[]>();
        for (const s of sessions) {
            if (s.ipAddress) {
                const existing = map.get(s.ipAddress) ?? [];
                existing.push(s);
                map.set(s.ipAddress, existing);
            }
        }
        return Array.from(map.entries()).filter(([, group]) => group.length > 1);
    }, [sessions]);

    // High violation students (5+)
    const highViolation = useMemo(
        () => sessions.filter((s) => s.violationCount >= 5),
        [sessions],
    );

    if (fingerprintGroups.length === 0 && ipGroups.length === 0 && highViolation.length === 0) {
        return (
            <p className="py-6 text-center text-sm text-slate-400 dark:text-slate-500">
                No suspicious patterns detected
            </p>
        );
    }

    return (
        <div className="space-y-4">
            {/* Duplicate fingerprints */}
            {fingerprintGroups.length > 0 && (
                <div className="rounded-xl border border-purple-200 bg-purple-50/50 p-4 dark:border-purple-800/50 dark:bg-purple-950/20">
                    <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold text-purple-700 dark:text-purple-300">
                        <Fingerprint size={14} />
                        Shared Device Fingerprints ({fingerprintGroups.length} group
                        {fingerprintGroups.length !== 1 ? 's' : ''})
                    </h4>
                    <div className="space-y-2">
                        {fingerprintGroups.map(([fp, group]) => (
                            <div key={fp} className="text-sm">
                                <span className="mr-2 rounded bg-purple-100 px-1.5 py-0.5 font-mono text-[10px] text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
                                    {fp.slice(0, 16)}…
                                </span>
                                <span className="text-slate-600 dark:text-slate-400">
                                    shared by{' '}
                                    {group.map((s) => s.studentName || 'Unknown').join(', ')}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Duplicate IPs */}
            {ipGroups.length > 0 && (
                <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-4 dark:border-rose-800/50 dark:bg-rose-950/20">
                    <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold text-rose-700 dark:text-rose-300">
                        <Globe size={14} />
                        Shared IP Addresses ({ipGroups.length} group
                        {ipGroups.length !== 1 ? 's' : ''})
                    </h4>
                    <div className="space-y-2">
                        {ipGroups.map(([ip, group]) => (
                            <div key={ip} className="text-sm">
                                <span className="mr-2 rounded bg-rose-100 px-1.5 py-0.5 font-mono text-[10px] text-rose-700 dark:bg-rose-900/40 dark:text-rose-300">
                                    {ip}
                                </span>
                                <span className="text-slate-600 dark:text-slate-400">
                                    shared by{' '}
                                    {group.map((s) => s.studentName || 'Unknown').join(', ')}
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* High violation students */}
            {highViolation.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-800/50 dark:bg-amber-950/20">
                    <h4 className="mb-2 flex items-center gap-2 text-xs font-semibold text-amber-700 dark:text-amber-300">
                        <AlertTriangle size={14} />
                        High Violation Count ({highViolation.length} student
                        {highViolation.length !== 1 ? 's' : ''})
                    </h4>
                    <div className="space-y-2">
                        {highViolation.map((s) => (
                            <div key={s.sessionId} className="flex items-center justify-between text-sm">
                                <span className="text-slate-700 dark:text-slate-300">
                                    {s.studentName || 'Unknown'}
                                </span>
                                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">
                                    {s.violationCount} violations
                                </span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
