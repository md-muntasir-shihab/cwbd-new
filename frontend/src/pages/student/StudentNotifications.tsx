import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    ArrowRight,
    BellRing,
    CheckCheck,
    CircleDollarSign,
    FileCheck,
    GraduationCap,
    LifeBuoy,
    Megaphone,
    ShieldCheck,
    Sparkles,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
    getStudentLiveAlerts,
    getStudentMeNotifications,
    markStudentMeNotificationsRead,
    type StudentHubNotificationItem,
    type StudentLiveAlertItem,
    type StudentNotificationKind,
} from '../../services/api';

type NotificationFilter = StudentNotificationKind | 'all';

const FILTERS: Array<{ key: NotificationFilter; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'support', label: 'Support' },
    { key: 'profile', label: 'Profile' },
    { key: 'payment', label: 'Payment' },
    { key: 'subscription', label: 'Subscription' },
    { key: 'exam', label: 'Exam' },
    { key: 'notice', label: 'Notice' },
    { key: 'system', label: 'System' },
];

const kindTone: Record<StudentNotificationKind, string> = {
    support: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-200',
    profile: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-200',
    payment: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200',
    subscription: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200',
    exam: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-200',
    notice: 'bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-500/15 dark:text-fuchsia-200',
    system: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
};

const priorityTone: Record<'normal' | 'high' | 'urgent', string> = {
    normal: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    high: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200',
    urgent: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-200',
};

function kindIcon(kind: StudentNotificationKind) {
    if (kind === 'support') return <LifeBuoy className="h-4 w-4" />;
    if (kind === 'profile') return <FileCheck className="h-4 w-4" />;
    if (kind === 'payment' || kind === 'subscription') return <CircleDollarSign className="h-4 w-4" />;
    if (kind === 'exam') return <GraduationCap className="h-4 w-4" />;
    if (kind === 'notice') return <Megaphone className="h-4 w-4" />;
    return <ShieldCheck className="h-4 w-4" />;
}

function reminderTone(severity: StudentLiveAlertItem['severity']) {
    if (severity === 'danger') return 'border-rose-200 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-500/10';
    if (severity === 'warning') return 'border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10';
    if (severity === 'success') return 'border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10';
    return 'border-sky-200 bg-sky-50 dark:border-sky-500/30 dark:bg-sky-500/10';
}

function formatRelativeTime(value?: string): string {
    if (!value) return 'Just now';
    const timestamp = new Date(value).getTime();
    if (!Number.isFinite(timestamp)) return 'Just now';
    const diffMs = Date.now() - timestamp;
    const diffMinutes = Math.max(0, Math.round(diffMs / 60000));
    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    const diffHours = Math.round(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.round(diffHours / 24);
    if (diffDays < 7) return `${diffDays}d ago`;
    return new Date(value).toLocaleDateString();
}

function resolveNotificationTarget(item: Pick<StudentHubNotificationItem, 'linkUrl' | 'targetRoute' | 'targetEntityId' | 'sourceType'>): string {
    const direct = String(item.linkUrl || '').trim();
    if (direct) return direct;

    const targetRoute = String(item.targetRoute || '').trim();
    const targetEntityId = String(item.targetEntityId || '').trim();
    if (!targetRoute) return '/notifications';
    if (targetRoute === '/support' && targetEntityId) return `/support/${targetEntityId}`;
    if (!targetEntityId) return targetRoute;
    return `${targetRoute}?id=${targetEntityId}`;
}

export default function StudentNotifications() {
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const [filter, setFilter] = useState<NotificationFilter>('all');

    const notificationsQuery = useQuery({
        queryKey: ['student-hub', 'notifications', filter],
        queryFn: async () => (await getStudentMeNotifications(filter)).data,
    });
    const remindersQuery = useQuery({
        queryKey: ['student-hub', 'live-alerts'],
        queryFn: async () => (await getStudentLiveAlerts()).data,
    });

    const markAllMutation = useMutation({
        mutationFn: async () => (await markStudentMeNotificationsRead()).data,
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ['student-hub', 'notifications'] });
        },
    });
    const markOneMutation = useMutation({
        mutationFn: async (id: string) => (await markStudentMeNotificationsRead([id])).data,
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ['student-hub', 'notifications'] });
        },
    });

    const unreadCount = useMemo(
        () => Number(notificationsQuery.data?.unreadCount || 0),
        [notificationsQuery.data?.unreadCount]
    );

    const openItem = async (item: StudentHubNotificationItem) => {
        const target = resolveNotificationTarget(item);
        await markOneMutation.mutateAsync(item._id);
        if (target) navigate(target);
    };

    return (
        <div className="space-y-5">
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h1 className="text-2xl font-bold inline-flex items-center gap-2">
                            <BellRing className="w-6 h-6" />
                            Notifications
                        </h1>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                            Unread inbox items: {unreadCount}
                        </p>
                    </div>
                    <button
                        onClick={() => markAllMutation.mutate()}
                        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60"
                        disabled={markAllMutation.isPending}
                    >
                        <CheckCheck className="w-4 h-4" />
                        Mark all as read
                    </button>
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                    {FILTERS.map((item) => (
                        <button
                            key={item.key}
                            type="button"
                            onClick={() => setFilter(item.key)}
                            aria-label={`Filter ${item.label} notifications`}
                            aria-pressed={filter === item.key}
                            className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${filter === item.key
                                ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200'
                                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                                }`}
                        >
                            {item.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
                <div className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-amber-500" />
                    <div>
                        <h2 className="text-lg font-semibold">Reminder Center</h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            Upcoming exams, results, payment dues, and deadline reminders stay visible here.
                        </p>
                    </div>
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                    {remindersQuery.isLoading ? (
                        Array.from({ length: 4 }).map((_, idx) => (
                            <div key={idx} className="h-28 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
                        ))
                    ) : (remindersQuery.data?.items || []).length === 0 ? (
                        <p className="text-sm text-slate-500 dark:text-slate-400 md:col-span-2">No active reminders right now.</p>
                    ) : (
                        (remindersQuery.data?.items || []).map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                onClick={() => navigate(item.ctaUrl)}
                                className={`rounded-xl border p-4 text-left transition hover:shadow-sm ${reminderTone(item.severity)}`}
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div>
                                        <p className="font-semibold text-slate-900 dark:text-white">{item.title}</p>
                                        <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{item.message}</p>
                                    </div>
                                    <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
                                </div>
                                <div className="mt-3 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                                    <span>{new Date(item.dateIso).toLocaleString()}</span>
                                    <span className="font-semibold">{item.ctaLabel}</span>
                                </div>
                            </button>
                        ))
                    )}
                </div>
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
                {notificationsQuery.isLoading ? (
                    <div className="space-y-2">
                        {Array.from({ length: 5 }).map((_, idx) => (
                            <div key={idx} className="h-16 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
                        ))}
                    </div>
                ) : notificationsQuery.isError ? (
                    <p className="text-sm text-rose-600 dark:text-rose-300">Failed to load notifications.</p>
                ) : (
                    <div className="space-y-3">
                        {(notificationsQuery.data?.items || []).length === 0 ? (
                            <p className="text-sm text-slate-500">No notifications found.</p>
                        ) : (
                            (notificationsQuery.data?.items || []).map((item) => (
                                <button
                                    key={item._id}
                                    onClick={() => void openItem(item)}
                                    className={`w-full rounded-xl border p-4 text-left ${item.isRead
                                    ? 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900'
                                    : 'border-indigo-300/50 dark:border-indigo-500/40 bg-indigo-50/60 dark:bg-indigo-500/10'
                                    }`}>
                                    <div className="flex flex-wrap items-start justify-between gap-3">
                                        <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${kindTone[item.kind]}`}>
                                                    {kindIcon(item.kind)}
                                                    {item.kind}
                                                </span>
                                                {item.priority !== 'normal' && (
                                                    <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${priorityTone[item.priority]}`}>
                                                        {item.priority}
                                                    </span>
                                                )}
                                                {!item.isRead && (
                                                    <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[11px] font-semibold text-white">
                                                        New
                                                    </span>
                                                )}
                                            </div>
                                            <p className="mt-3 font-semibold text-slate-900 dark:text-white">{item.title}</p>
                                            <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">{item.messagePreview || item.body}</p>
                                            {(item.messagePreview || '').trim() && item.messagePreview !== item.body && (
                                                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">{item.body}</p>
                                            )}
                                        </div>
                                        <div className="text-right text-xs text-slate-500 dark:text-slate-400">
                                            <p>{formatRelativeTime(item.publishAt)}</p>
                                            <p className="mt-1">{new Date(item.publishAt).toLocaleString()}</p>
                                        </div>
                                    </div>
                                </button>
                            ))
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
