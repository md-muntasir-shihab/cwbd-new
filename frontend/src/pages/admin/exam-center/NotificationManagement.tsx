import { useState, useEffect, useCallback } from 'react';
import AdminGuardShell from '../../../components/admin/AdminGuardShell';
import {
    Bell,
    Send,
    Loader2,
    AlertCircle,
    RefreshCw,
    Plus,
    X,
    Mail,
    Users,
    Clock,
    Settings,
    CheckCircle2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../services/api';
import type { ExamNotificationType } from '../../../types/exam-system';

// ─── Types ───────────────────────────────────────────────────────────────

interface SentNotification {
    _id: string;
    type: string;
    title?: string;
    message: string;
    targetRole?: string;
    targetUserIds?: string[];
    targetGroupId?: string;
    targetGroupName?: string;
    category?: string;
    priority?: string;
    createdAt: string;
    readCount?: number;
    totalRecipients?: number;
}

interface NotificationDefault {
    eventType: ExamNotificationType;
    label: string;
    inApp: boolean;
    email: boolean;
    push: boolean;
    sms: boolean;
}

type TargetType = 'all_students' | 'group' | 'role';

interface GroupOption {
    _id: string;
    name: string;
}

// ─── Constants ───────────────────────────────────────────────────────────

const BASE = '/v1/notifications';

const inputCls =
    'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:focus:border-indigo-400';

const btnPrimary =
    'inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors';

const btnSecondary =
    'inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800 transition-colors';

const DEFAULT_EVENT_LABELS: Record<ExamNotificationType, string> = {
    exam_published: 'Exam Published',
    exam_starting_soon: 'Exam Starting Soon',
    result_published: 'Result Published',
    streak_warning: 'Streak Warning',
    group_membership: 'Group Membership',
    battle_challenge: 'Battle Challenge',
    payment_confirmation: 'Payment Confirmation',
    routine_reminder: 'Routine Reminder',
    doubt_reply: 'Doubt Reply',
};

// ─── Helpers ─────────────────────────────────────────────────────────────

function fmtDate(iso: string): string {
    if (!iso) return '—';
    return new Date(iso).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

function typeBadgeColor(type: string): string {
    const map: Record<string, string> = {
        exam_published: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
        exam_starting_soon: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
        result_published: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
        streak_warning: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
        announcement: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
        battle_challenge: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
        payment_confirmation: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    };
    return map[type] || 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
}

// ─── Sub-components ──────────────────────────────────────────────────────

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
                    <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300">{title}</h3>
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
            {Array.from({ length: 3 }).map((_, i) => (
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

export default function NotificationManagement() {
    // ── State ──
    const [sentNotifications, setSentNotifications] = useState<SentNotification[]>([]);
    const [defaults, setDefaults] = useState<NotificationDefault[]>([]);
    const [groups, setGroups] = useState<GroupOption[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Announcement form
    const [showForm, setShowForm] = useState(false);
    const [formTitle, setFormTitle] = useState('');
    const [formMessage, setFormMessage] = useState('');
    const [formTarget, setFormTarget] = useState<TargetType>('all_students');
    const [formGroupId, setFormGroupId] = useState('');
    const [formRole, setFormRole] = useState('student');
    const [sending, setSending] = useState(false);

    // Defaults saving
    const [savingDefaults, setSavingDefaults] = useState(false);

    // ── Data fetching ──
    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const [sentRes, defaultsRes, groupsRes] = await Promise.allSettled([
                api.get<{ items?: SentNotification[]; notifications?: SentNotification[] }>(
                    `${BASE}/admin/sent`,
                    { params: { limit: 50 } },
                ),
                api.get<{ defaults?: NotificationDefault[] }>(`${BASE}/admin/defaults`),
                api.get<{ items?: GroupOption[]; groups?: GroupOption[] }>('/v1/student-groups', {
                    params: { limit: 100, isActive: true },
                }),
            ]);

            if (sentRes.status === 'fulfilled') {
                const d = sentRes.value.data;
                const list =
                    (d as { items?: SentNotification[] }).items ??
                    (d as { notifications?: SentNotification[] }).notifications ??
                    (Array.isArray(d) ? d : []);
                setSentNotifications(list as SentNotification[]);
            }

            if (defaultsRes.status === 'fulfilled') {
                const d = defaultsRes.value.data;
                const list = (d as { defaults?: NotificationDefault[] }).defaults;
                if (Array.isArray(list) && list.length > 0) {
                    setDefaults(list);
                } else {
                    // Build defaults from known event types
                    setDefaults(
                        (Object.keys(DEFAULT_EVENT_LABELS) as ExamNotificationType[]).map(
                            (eventType) => ({
                                eventType,
                                label: DEFAULT_EVENT_LABELS[eventType],
                                inApp: true,
                                email: false,
                                push: false,
                                sms: false,
                            }),
                        ),
                    );
                }
            }

            if (groupsRes.status === 'fulfilled') {
                const d = groupsRes.value.data;
                const list =
                    (d as { items?: GroupOption[] }).items ??
                    (d as { groups?: GroupOption[] }).groups ??
                    (Array.isArray(d) ? d : []);
                setGroups(list as GroupOption[]);
            }
        } catch (err: unknown) {
            const msg =
                (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
                'Failed to load notification data';
            setError(msg);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // ── Create announcement ──
    const handleSendAnnouncement = useCallback(async () => {
        if (!formTitle.trim() || !formMessage.trim()) {
            toast.error('Title and message are required');
            return;
        }

        setSending(true);
        try {
            const payload: Record<string, unknown> = {
                title: formTitle.trim(),
                message: formMessage.trim(),
                type: 'announcement',
            };

            if (formTarget === 'all_students') {
                payload.targetRole = 'student';
            } else if (formTarget === 'group') {
                if (!formGroupId) {
                    toast.error('Please select a target group');
                    setSending(false);
                    return;
                }
                payload.targetGroupId = formGroupId;
            } else if (formTarget === 'role') {
                payload.targetRole = formRole;
            }

            await api.post(`${BASE}/admin/announce`, payload);
            toast.success('Announcement sent successfully');
            setShowForm(false);
            setFormTitle('');
            setFormMessage('');
            setFormTarget('all_students');
            setFormGroupId('');
            fetchData();
        } catch (err: unknown) {
            const msg =
                (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
                'Failed to send announcement';
            toast.error(msg);
        } finally {
            setSending(false);
        }
    }, [formTitle, formMessage, formTarget, formGroupId, formRole, fetchData]);

    // ── Save defaults ──
    const handleSaveDefaults = useCallback(async () => {
        setSavingDefaults(true);
        try {
            await api.put(`${BASE}/admin/defaults`, { defaults });
            toast.success('Notification defaults saved');
        } catch (err: unknown) {
            const msg =
                (err as { response?: { data?: { message?: string } } })?.response?.data?.message ||
                'Failed to save defaults';
            toast.error(msg);
        } finally {
            setSavingDefaults(false);
        }
    }, [defaults]);

    const toggleDefault = useCallback(
        (idx: number, channel: 'inApp' | 'email' | 'push' | 'sms') => {
            setDefaults((prev) =>
                prev.map((d, i) => (i === idx ? { ...d, [channel]: !d[channel] } : d)),
            );
        },
        [],
    );

    // ── Render ──
    if (loading) return <AdminGuardShell title="Notification Management" requiredModule="exam_center"><PageSkeleton /></AdminGuardShell>;

    if (error) {
        return (
            <AdminGuardShell title="Notification Management" requiredModule="exam_center">
                <div className="flex flex-col items-center justify-center gap-4 py-20">
                    <AlertCircle className="h-12 w-12 text-red-400" />
                    <p className="text-sm font-medium text-slate-600 dark:text-slate-400">{error}</p>
                    <button onClick={fetchData} className={btnPrimary}>
                        <RefreshCw size={14} /> Retry
                    </button>
                </div>
            </AdminGuardShell>
        );
    }

    return (
        <AdminGuardShell title="Notification Management" requiredModule="exam_center">
            <div className="min-w-0 space-y-6">
                {/* ── Header ── */}
                <div className="flex flex-col justify-between gap-4 rounded-2xl border border-slate-200/80 bg-gradient-to-br from-white via-slate-50 to-slate-100/50 p-4 shadow-sm dark:border-slate-800/80 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 sm:p-6 xl:flex-row xl:items-center">
                    <div>
                        <h2 className="bg-gradient-to-r from-slate-900 to-slate-600 bg-clip-text text-2xl font-black tracking-tight text-transparent dark:from-white dark:to-slate-300">
                            <Bell className="mr-2 inline-block h-6 w-6 text-indigo-500" />
                            Notification Management
                        </h2>
                        <p className="mt-1 text-sm font-medium text-slate-500 dark:text-slate-400">
                            View sent notifications, create announcements, and configure defaults
                        </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        <button onClick={fetchData} className={btnSecondary} aria-label="Refresh notifications">
                            <RefreshCw size={14} /> Refresh
                        </button>
                        <button
                            onClick={() => setShowForm((v) => !v)}
                            className={btnPrimary}
                            aria-label="Create announcement"
                        >
                            {showForm ? <X size={14} /> : <Plus size={14} />}
                            {showForm ? 'Cancel' : 'Create Announcement'}
                        </button>
                    </div>
                </div>

                {/* ── Create Announcement Form ── */}
                {showForm && (
                    <Section
                        title="Create Announcement"
                        icon={<Send size={16} className="text-indigo-500" />}
                    >
                        <div className="space-y-4">
                            {/* Title */}
                            <div>
                                <label
                                    htmlFor="announce-title"
                                    className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400"
                                >
                                    Title
                                </label>
                                <input
                                    id="announce-title"
                                    type="text"
                                    value={formTitle}
                                    onChange={(e) => setFormTitle(e.target.value)}
                                    placeholder="Announcement title"
                                    className={inputCls}
                                    maxLength={200}
                                />
                            </div>

                            {/* Message */}
                            <div>
                                <label
                                    htmlFor="announce-message"
                                    className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400"
                                >
                                    Message
                                </label>
                                <textarea
                                    id="announce-message"
                                    value={formMessage}
                                    onChange={(e) => setFormMessage(e.target.value)}
                                    placeholder="Write your announcement message..."
                                    rows={4}
                                    className={inputCls}
                                    maxLength={2000}
                                />
                            </div>

                            {/* Target */}
                            <div>
                                <label
                                    htmlFor="announce-target"
                                    className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400"
                                >
                                    Target Audience
                                </label>
                                <select
                                    id="announce-target"
                                    value={formTarget}
                                    onChange={(e) => setFormTarget(e.target.value as TargetType)}
                                    className={inputCls}
                                >
                                    <option value="all_students">All Students</option>
                                    <option value="group">Specific Group</option>
                                    <option value="role">By Role</option>
                                </select>
                            </div>

                            {/* Group selector */}
                            {formTarget === 'group' && (
                                <div>
                                    <label
                                        htmlFor="announce-group"
                                        className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400"
                                    >
                                        Select Group
                                    </label>
                                    <select
                                        id="announce-group"
                                        value={formGroupId}
                                        onChange={(e) => setFormGroupId(e.target.value)}
                                        className={inputCls}
                                    >
                                        <option value="">— Select a group —</option>
                                        {groups.map((g) => (
                                            <option key={g._id} value={g._id}>
                                                {g.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {/* Role selector */}
                            {formTarget === 'role' && (
                                <div>
                                    <label
                                        htmlFor="announce-role"
                                        className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400"
                                    >
                                        Select Role
                                    </label>
                                    <select
                                        id="announce-role"
                                        value={formRole}
                                        onChange={(e) => setFormRole(e.target.value)}
                                        className={inputCls}
                                    >
                                        <option value="student">Student</option>
                                        <option value="examiner">Examiner</option>
                                        <option value="moderator">Moderator</option>
                                        <option value="admin">Admin</option>
                                    </select>
                                </div>
                            )}

                            {/* Send button */}
                            <div className="flex justify-end">
                                <button
                                    onClick={handleSendAnnouncement}
                                    disabled={sending || !formTitle.trim() || !formMessage.trim()}
                                    className={btnPrimary}
                                >
                                    {sending ? (
                                        <Loader2 size={14} className="animate-spin" />
                                    ) : (
                                        <Send size={14} />
                                    )}
                                    Send Announcement
                                </button>
                            </div>
                        </div>
                    </Section>
                )}

                {/* ── Sent Notifications Table ── */}
                <Section
                    title="Recent Sent Notifications"
                    icon={<Mail size={16} className="text-indigo-500" />}
                    actions={
                        <span className="text-xs text-slate-400 dark:text-slate-500">
                            {sentNotifications.length} notification{sentNotifications.length !== 1 ? 's' : ''}
                        </span>
                    }
                >
                    {sentNotifications.length > 0 ? (
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                                <thead>
                                    <tr className="border-b border-slate-200 dark:border-slate-700">
                                        <th className="pb-2 pr-4 text-xs font-semibold text-slate-500 dark:text-slate-400">
                                            Type
                                        </th>
                                        <th className="pb-2 pr-4 text-xs font-semibold text-slate-500 dark:text-slate-400">
                                            Message
                                        </th>
                                        <th className="pb-2 pr-4 text-xs font-semibold text-slate-500 dark:text-slate-400">
                                            Target
                                        </th>
                                        <th className="pb-2 pr-4 text-xs font-semibold text-slate-500 dark:text-slate-400">
                                            Date
                                        </th>
                                        <th className="pb-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                                            Reach
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sentNotifications.map((n) => (
                                        <tr
                                            key={n._id}
                                            className="border-b border-slate-100 dark:border-slate-800"
                                        >
                                            <td className="py-2.5 pr-4">
                                                <span
                                                    className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${typeBadgeColor(n.type)}`}
                                                >
                                                    {n.type.replace(/_/g, ' ')}
                                                </span>
                                            </td>
                                            <td className="max-w-[280px] truncate py-2.5 pr-4 text-slate-800 dark:text-slate-200">
                                                {n.title ? (
                                                    <span className="font-medium">{n.title}: </span>
                                                ) : null}
                                                {n.message}
                                            </td>
                                            <td className="py-2.5 pr-4 text-slate-600 dark:text-slate-400">
                                                {n.targetGroupName ||
                                                    n.targetRole ||
                                                    (n.targetUserIds?.length
                                                        ? `${n.targetUserIds.length} user(s)`
                                                        : 'All')}
                                            </td>
                                            <td className="whitespace-nowrap py-2.5 pr-4 text-slate-500 dark:text-slate-400">
                                                {fmtDate(n.createdAt)}
                                            </td>
                                            <td className="py-2.5 text-slate-600 dark:text-slate-400">
                                                {n.readCount != null && n.totalRecipients != null
                                                    ? `${n.readCount}/${n.totalRecipients}`
                                                    : '—'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center gap-2 py-12">
                            <Mail className="h-10 w-10 text-slate-300 dark:text-slate-600" />
                            <p className="text-sm text-slate-400 dark:text-slate-500">
                                No sent notifications yet
                            </p>
                        </div>
                    )}
                </Section>

                {/* ── Notification Defaults Configuration ── */}
                <Section
                    title="Default Notification Preferences"
                    icon={<Settings size={16} className="text-indigo-500" />}
                    actions={
                        <button
                            onClick={handleSaveDefaults}
                            disabled={savingDefaults}
                            className={btnPrimary}
                        >
                            {savingDefaults ? (
                                <Loader2 size={14} className="animate-spin" />
                            ) : (
                                <CheckCircle2 size={14} />
                            )}
                            Save Defaults
                        </button>
                    }
                >
                    <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
                        Configure which channels are enabled by default for each notification event type.
                        Students can override these in their personal preferences.
                    </p>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead>
                                <tr className="border-b border-slate-200 dark:border-slate-700">
                                    <th className="pb-2 pr-6 text-xs font-semibold text-slate-500 dark:text-slate-400">
                                        Event Type
                                    </th>
                                    <th className="pb-2 pr-6 text-center text-xs font-semibold text-slate-500 dark:text-slate-400">
                                        In-App
                                    </th>
                                    <th className="pb-2 pr-6 text-center text-xs font-semibold text-slate-500 dark:text-slate-400">
                                        Email
                                    </th>
                                    <th className="pb-2 pr-6 text-center text-xs font-semibold text-slate-500 dark:text-slate-400">
                                        Push
                                    </th>
                                    <th className="pb-2 text-center text-xs font-semibold text-slate-500 dark:text-slate-400">
                                        SMS
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {defaults.map((d, idx) => (
                                    <tr
                                        key={d.eventType}
                                        className="border-b border-slate-100 dark:border-slate-800"
                                    >
                                        <td className="py-2.5 pr-6 font-medium text-slate-700 dark:text-slate-300">
                                            <div className="flex items-center gap-2">
                                                <Clock size={14} className="text-slate-400" />
                                                {d.label}
                                            </div>
                                        </td>
                                        {(['inApp', 'email', 'push', 'sms'] as const).map((ch) => (
                                            <td key={ch} className="py-2.5 pr-6 text-center">
                                                <button
                                                    type="button"
                                                    onClick={() => toggleDefault(idx, ch)}
                                                    className={`inline-flex h-6 w-10 items-center rounded-full transition-colors ${d[ch] ? 'bg-indigo-600' : 'bg-slate-200 dark:bg-slate-700'}`}
                                                    role="switch"
                                                    aria-checked={d[ch]}
                                                    aria-label={`${d.label} ${ch}`}
                                                >
                                                    <span
                                                        className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${d[ch] ? 'translate-x-5' : 'translate-x-1'}`}
                                                    />
                                                </button>
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Section>
            </div>
        </AdminGuardShell>
    );
}
