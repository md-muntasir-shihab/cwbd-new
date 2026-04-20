import { useCallback, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    ArrowRight, Bell, BellOff, BellRing, CheckCheck, ChevronDown,
    CircleDollarSign, FileCheck, GraduationCap, Inbox, LifeBuoy,
    Megaphone, RefreshCw, ShieldCheck, Sparkles, X,
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

const FILTERS: Array<{ key: NotificationFilter; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { key: 'all', label: 'All', icon: Bell },
    { key: 'support', label: 'Support', icon: LifeBuoy },
    { key: 'profile', label: 'Profile', icon: FileCheck },
    { key: 'payment', label: 'Payment', icon: CircleDollarSign },
    { key: 'subscription', label: 'Subscription', icon: CircleDollarSign },
    { key: 'exam', label: 'Exam', icon: GraduationCap },
    { key: 'notice', label: 'Notice', icon: Megaphone },
    { key: 'system', label: 'System', icon: ShieldCheck },
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

const kindIconMap: Record<StudentNotificationKind, React.ComponentType<{ className?: string }>> = {
    support: LifeBuoy, profile: FileCheck, payment: CircleDollarSign,
    subscription: CircleDollarSign, exam: GraduationCap, notice: Megaphone, system: ShieldCheck,
};

function reminderTone(severity: StudentLiveAlertItem['severity']) {
    if (severity === 'danger') return 'border-rose-200 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-500/10';
    if (severity === 'warning') return 'border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10';
    if (severity === 'success') return 'border-emerald-200 bg-emerald-50 dark:border-emerald-500/30 dark:bg-emerald-500/10';
    return 'border-sky-200 bg-sky-50 dark:border-sky-500/30 dark:bg-sky-500/10';
}

function reminderSeverityIcon(severity: StudentLiveAlertItem['severity']) {
    if (severity === 'danger') return 'text-rose-500';
    if (severity === 'warning') return 'text-amber-500';
    if (severity === 'success') return 'text-emerald-500';
    return 'text-sky-500';
}

function formatRelativeTime(value?: string): string {
    if (!value) return 'Just now';
    const ts = new Date(value).getTime();
    if (!Number.isFinite(ts)) return 'Just now';
    const diffMs = Date.now() - ts;
    const mins = Math.max(0, Math.round(diffMs / 60000));
    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.round(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(value).toLocaleDateString();
}

function groupByDate(items: StudentHubNotificationItem[]): Array<{ label: string; items: StudentHubNotificationItem[] }> {
    const groups: Record<string, StudentHubNotificationItem[]> = {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    for (const item of items) {
        const d = new Date(item.publishAt || item.createdAt);
        d.setHours(0, 0, 0, 0);
        let label: string;
        if (d.getTime() === today.getTime()) label = 'Today';
        else if (d.getTime() === yesterday.getTime()) label = 'Yesterday';
        else label = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        if (!groups[label]) groups[label] = [];
        groups[label].push(item);
    }
    return Object.entries(groups).map(([label, items]) => ({ label, items }));
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
    const [showReminders, setShowReminders] = useState(true);
    const [selectedNotification, setSelectedNotification] = useState<StudentHubNotificationItem | null>(null);

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
        onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['student-hub', 'notifications'] }); },
    });
    const markOneMutation = useMutation({
        mutationFn: async (id: string) => (await markStudentMeNotificationsRead([id])).data,
        onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['student-hub', 'notifications'] }); },
    });

    const items = notificationsQuery.data?.items || [];
    const unreadCount = Number(notificationsQuery.data?.unreadCount || 0);
    const highPriorityCount = useMemo(() => items.filter(i => i.priority === 'high' || i.priority === 'urgent').length, [items]);
    const reminders = remindersQuery.data?.items || [];
    const dateGroups = useMemo(() => groupByDate(items), [items]);

    const openItem = useCallback(async (item: StudentHubNotificationItem) => {
        if (!item.isRead) await markOneMutation.mutateAsync(item._id);
        setSelectedNotification(item);
    }, [markOneMutation]);

    const refreshAll = useCallback(async () => {
        await Promise.all([
            queryClient.invalidateQueries({ queryKey: ['student-hub', 'notifications'] }),
            queryClient.invalidateQueries({ queryKey: ['student-hub', 'live-alerts'] }),
        ]);
    }, [queryClient]);

    return (
        <div className="space-y-5 max-w-4xl mx-auto">
            {/* ── Header ── */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-600 text-white shadow-lg shadow-indigo-500/20">
                            <BellRing className="h-5 w-5" />
                        </div>
                        <div>
                            <h1 className="text-xl font-bold text-slate-900 dark:text-white">Notifications</h1>
                            <p className="text-sm text-slate-500 dark:text-slate-400">Stay updated with your exams, payments, and alerts</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button onClick={() => void refreshAll()} className="rounded-xl border border-slate-200 bg-slate-50 p-2.5 text-slate-500 hover:bg-slate-100 transition-colors dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700" title="Refresh">
                            <RefreshCw className={`h-4 w-4 ${notificationsQuery.isFetching ? 'animate-spin' : ''}`} />
                        </button>
                        <button onClick={() => markAllMutation.mutate()} disabled={markAllMutation.isPending || unreadCount === 0}
                            className="inline-flex items-center gap-1.5 rounded-xl bg-indigo-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm">
                            <CheckCheck className="h-4 w-4" /> Mark all read
                        </button>
                    </div>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-3">
                    <div className="rounded-xl bg-slate-50 p-3 text-center dark:bg-slate-800">
                        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Total</p>
                        <p className="text-lg font-bold text-slate-900 dark:text-white">{items.length}</p>
                    </div>
                    <div className={`rounded-xl p-3 text-center ${unreadCount > 0 ? 'bg-indigo-50 dark:bg-indigo-500/10' : 'bg-slate-50 dark:bg-slate-800'}`}>
                        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Unread</p>
                        <p className={`text-lg font-bold ${unreadCount > 0 ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-900 dark:text-white'}`}>{unreadCount}</p>
                    </div>
                    <div className={`rounded-xl p-3 text-center ${highPriorityCount > 0 ? 'bg-rose-50 dark:bg-rose-500/10' : 'bg-slate-50 dark:bg-slate-800'}`}>
                        <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Priority</p>
                        <p className={`text-lg font-bold ${highPriorityCount > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'}`}>{highPriorityCount}</p>
                    </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-1.5">
                    {FILTERS.map((f) => {
                        const Icon = f.icon;
                        return (
                            <button key={f.key} type="button" onClick={() => setFilter(f.key)} aria-pressed={filter === f.key}
                                className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold transition-all ${filter === f.key
                                    ? 'bg-indigo-600 text-white shadow-sm'
                                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'}`}>
                                <Icon className="h-3.5 w-3.5" /> {f.label}
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* ── Reminder Center ── */}
            {reminders.length > 0 && (
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
                    <button type="button" onClick={() => setShowReminders(!showReminders)}
                        className="flex w-full items-center justify-between p-5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                        <div className="flex items-center gap-2">
                            <Sparkles className="h-5 w-5 text-amber-500" />
                            <div>
                                <h2 className="text-base font-bold text-slate-900 dark:text-white">Reminder Center</h2>
                                <p className="text-xs text-slate-500 dark:text-slate-400">{reminders.length} active reminder{reminders.length !== 1 ? 's' : ''}</p>
                            </div>
                        </div>
                        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${showReminders ? 'rotate-180' : ''}`} />
                    </button>
                    {showReminders && (
                        <div className="border-t border-slate-100 dark:border-slate-800 p-5 pt-4">
                            <div className="grid gap-3 md:grid-cols-2">
                                {reminders.map((item) => (
                                    <button key={item.id} type="button" onClick={() => navigate(item.ctaUrl)}
                                        className={`group rounded-xl border p-4 text-left transition-all hover:shadow-md ${reminderTone(item.severity)}`}>
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <Bell className={`h-4 w-4 ${reminderSeverityIcon(item.severity)}`} />
                                                    <p className="font-semibold text-sm text-slate-900 dark:text-white truncate">{item.title}</p>
                                                </div>
                                                <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-300 line-clamp-2">{item.message}</p>
                                            </div>
                                            <ArrowRight className="h-4 w-4 shrink-0 text-slate-400 group-hover:translate-x-0.5 transition-transform" />
                                        </div>
                                        <div className="mt-3 flex items-center justify-between text-[10px] text-slate-500 dark:text-slate-400">
                                            <span>{new Date(item.dateIso).toLocaleString()}</span>
                                            <span className="font-bold uppercase tracking-wider">{item.ctaLabel}</span>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ── Notification Feed ── */}
            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                <div className="border-b border-slate-100 dark:border-slate-800 px-5 py-4">
                    <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <Bell className="h-4 w-4 text-indigo-500" /> Notification Feed
                    </h2>
                </div>
                {notificationsQuery.isLoading ? (
                    <div className="p-5 space-y-3">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <div key={i} className="h-20 rounded-xl bg-slate-100 dark:bg-slate-800 animate-pulse" />
                        ))}
                    </div>
                ) : notificationsQuery.isError ? (
                    <div className="p-8 text-center">
                        <BellOff className="h-8 w-8 mx-auto text-rose-400 mb-2" />
                        <p className="text-sm text-rose-600 dark:text-rose-300">Failed to load notifications.</p>
                        <button onClick={() => void refreshAll()} className="mt-2 text-xs text-indigo-600 hover:underline dark:text-indigo-400">Try again</button>
                    </div>
                ) : items.length === 0 ? (
                    <div className="p-12 text-center">
                        <Inbox className="h-10 w-10 mx-auto text-slate-300 dark:text-slate-600 mb-3" />
                        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">No notifications found</p>
                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                            {filter !== 'all' ? 'Try changing the filter to see more notifications.' : 'You\'re all caught up!'}
                        </p>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {dateGroups.map((group) => (
                            <div key={group.label}>
                                <div className="sticky top-0 z-10 bg-slate-50/95 dark:bg-slate-950/95 backdrop-blur-sm px-5 py-2 border-b border-slate-100 dark:border-slate-800">
                                    <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400">{group.label}</p>
                                </div>
                                {group.items.map((item) => {
                                    const KindIcon = kindIconMap[item.kind] || ShieldCheck;
                                    return (
                                        <button key={item._id} onClick={() => void openItem(item)}
                                            className={`w-full px-5 py-4 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 ${!item.isRead ? 'bg-indigo-50/40 dark:bg-indigo-500/5' : ''}`}>
                                            <div className="flex items-start gap-3">
                                                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${kindTone[item.kind]}`}>
                                                    <KindIcon className="h-4 w-4" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex flex-wrap items-center gap-1.5">
                                                        <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${kindTone[item.kind]}`}>{item.kind}</span>
                                                        {item.priority !== 'normal' && (
                                                            <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${item.priority === 'urgent' ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-200' : 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200'}`}>{item.priority}</span>
                                                        )}
                                                        {!item.isRead && <span className="h-2 w-2 rounded-full bg-indigo-500 shrink-0" />}
                                                    </div>
                                                    <p className={`mt-1.5 text-sm ${!item.isRead ? 'font-bold text-slate-900 dark:text-white' : 'font-medium text-slate-700 dark:text-slate-200'}`}>{item.title}</p>
                                                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">{item.messagePreview || item.body}</p>
                                                </div>
                                                <div className="shrink-0 text-right">
                                                    <p className="text-[10px] font-medium text-slate-400">{formatRelativeTime(item.publishAt)}</p>
                                                </div>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* ── Notification Detail Panel ── */}
            {selectedNotification && (
                <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" onClick={() => setSelectedNotification(null)}>
                    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm" />
                    <div
                        className="relative z-10 w-full max-w-lg mx-auto rounded-t-3xl sm:rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl max-h-[85vh] flex flex-col animate-in slide-in-from-bottom-4 duration-300"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-start justify-between gap-3 p-5 border-b border-slate-100 dark:border-slate-800">
                            <div className="flex items-center gap-3 min-w-0">
                                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${kindTone[selectedNotification.kind]}`}>
                                    {(() => { const Icon = kindIconMap[selectedNotification.kind] || ShieldCheck; return <Icon className="h-5 w-5" />; })()}
                                </div>
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-1.5 mb-1">
                                        <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${kindTone[selectedNotification.kind]}`}>{selectedNotification.kind}</span>
                                        {selectedNotification.priority !== 'normal' && (
                                            <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${selectedNotification.priority === 'urgent' ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-200' : 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200'}`}>{selectedNotification.priority}</span>
                                        )}
                                    </div>
                                    <h3 className="text-base font-bold text-slate-900 dark:text-white truncate">{selectedNotification.title}</h3>
                                    <p className="text-[11px] text-slate-400 mt-0.5">{formatRelativeTime(selectedNotification.publishAt)}</p>
                                </div>
                            </div>
                            <button onClick={() => setSelectedNotification(null)} className="rounded-xl border border-slate-200 bg-slate-50 p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 shrink-0">
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-5 space-y-4">
                            <div className="prose prose-sm dark:prose-invert max-w-none">
                                <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">{selectedNotification.body || selectedNotification.messagePreview || 'No details available.'}</p>
                            </div>
                            {(selectedNotification.linkUrl || selectedNotification.targetRoute) && (
                                <button
                                    onClick={() => {
                                        const target = resolveNotificationTarget(selectedNotification);
                                        if (target && target !== '/notifications') navigate(target);
                                    }}
                                    className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors shadow-sm"
                                >
                                    <ArrowRight className="h-4 w-4" />
                                    View Details
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
