import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BellRing, CheckCheck, ExternalLink, ShieldAlert } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
    adminGetActionableAlerts,
    adminMarkActionableAlertsRead,
    type AdminActionableAlertGroup,
} from '../../../services/api';

interface AdminActionAlertsPageProps {
    noShell?: boolean;
}

const FILTERS: Array<{ key: AdminActionableAlertGroup | 'all'; label: string }> = [
    { key: 'all', label: 'All' },
    { key: 'support', label: 'Support' },
    { key: 'contact', label: 'Contact' },
    { key: 'approvals', label: 'Approvals' },
    { key: 'finance', label: 'Finance' },
    { key: 'system', label: 'System' },
];

const tone: Record<AdminActionableAlertGroup, string> = {
    support: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-200',
    contact: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-200',
    approvals: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-200',
    finance: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200',
    system: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200',
};

const priorityTone: Record<'normal' | 'high' | 'urgent', string> = {
    normal: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
    high: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-200',
    urgent: 'bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-200',
};

function humanize(value: string): string {
    return value
        .split('_')
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

export default function AdminActionAlertsPage(_props: AdminActionAlertsPageProps) {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [group, setGroup] = useState<AdminActionableAlertGroup | 'all'>('all');
    const [unreadOnly, setUnreadOnly] = useState(false);

    const alertsQuery = useQuery({
        queryKey: ['admin', 'actionable-alerts', group, unreadOnly],
        queryFn: async () => (await adminGetActionableAlerts({
            page: 1,
            limit: 50,
            group,
            ...(unreadOnly ? { filter: 'unread' } : {}),
        })).data,
    });

    const markAllMutation = useMutation({
        mutationFn: async () => (await adminMarkActionableAlertsRead()).data,
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ['admin', 'actionable-alerts'] });
        },
    });

    const markOneMutation = useMutation({
        mutationFn: async (id: string) => (await adminMarkActionableAlertsRead([id])).data,
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ['admin', 'actionable-alerts'] });
        },
        onError: (error: any) => toast.error(error?.response?.data?.message || 'Failed to update alert'),
    });

    const unreadCount = useMemo(() => Number(alertsQuery.data?.unreadCount || 0), [alertsQuery.data?.unreadCount]);

    const openAlert = async (id: string, linkUrl?: string) => {
        await markOneMutation.mutateAsync(id);
        if (linkUrl) navigate(linkUrl);
    };

    return (
        <div className="space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                        <h2 className="inline-flex items-center gap-2 text-xl font-bold">
                            <BellRing className="h-5 w-5" />
                            Actionable Alerts
                        </h2>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                            Contacts, support, approvals, finance reviews, and urgent system issues that need action.
                        </p>
                    </div>
                    <button
                        onClick={() => markAllMutation.mutate()}
                        disabled={markAllMutation.isPending || unreadCount === 0}
                        className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
                    >
                        <CheckCheck className="h-4 w-4" />
                        Mark all read
                    </button>
                </div>
                <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">Unread alerts: {unreadCount}</p>
                <div className="mt-4 flex flex-wrap items-center gap-2">
                    {FILTERS.map((item) => (
                        <button
                            key={item.key}
                            type="button"
                            onClick={() => setGroup(item.key)}
                            aria-label={`Filter ${item.label} alerts`}
                            aria-pressed={group === item.key}
                            className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${
                                group === item.key
                                    ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-200'
                                    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                            }`}
                        >
                            {item.label}
                        </button>
                    ))}
                    <button
                        type="button"
                        onClick={() => setUnreadOnly((prev) => !prev)}
                        aria-label="Show unread alerts only"
                        aria-pressed={unreadOnly}
                        className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${
                            unreadOnly
                                ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200'
                                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                        }`}
                    >
                        Unread only
                    </button>
                </div>
            </div>

            {alertsQuery.isLoading ? (
                <div className="space-y-3">
                    {Array.from({ length: 4 }).map((_, index) => (
                        <div key={index} className="h-24 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
                    ))}
                </div>
            ) : alertsQuery.isError ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-sm text-rose-700 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-200">
                    Failed to load admin alerts.
                </div>
            ) : (alertsQuery.data?.items || []).length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
                    No actionable alerts right now.
                </div>
            ) : (
                <div className="space-y-3">
                    {(alertsQuery.data?.items || []).map((item) => (
                        <button
                            key={item._id}
                            onClick={() => void openAlert(item._id, item.linkUrl)}
                            className={`w-full rounded-2xl border p-5 text-left transition hover:border-indigo-400 hover:shadow-sm ${
                                item.isRead
                                    ? 'border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900'
                                    : 'border-indigo-300/60 bg-indigo-50/60 dark:border-indigo-500/40 dark:bg-indigo-500/10'
                            }`}
                        >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <p className="font-semibold">{item.title}</p>
                                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${tone[item.group] || tone.system}`}>
                                            {humanize(item.group)}
                                        </span>
                                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${priorityTone[item.priority] || priorityTone.normal}`}>
                                            {humanize(item.priority)}
                                        </span>
                                        {!item.isRead && (
                                            <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[11px] font-semibold text-white">
                                                New
                                            </span>
                                        )}
                                    </div>
                                    <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{item.messagePreview || item.message}</p>
                                    {item.messagePreview && item.messagePreview !== item.message ? (
                                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.message}</p>
                                    ) : null}
                                    <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                                        {item.type ? (
                                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 dark:bg-slate-800">
                                                <ShieldAlert className="h-3 w-3" />
                                                {humanize(item.type)}
                                            </span>
                                        ) : null}
                                        {item.sourceType ? (
                                            <span className="rounded-full bg-slate-100 px-2 py-0.5 dark:bg-slate-800">
                                                Source: {humanize(item.sourceType)}
                                            </span>
                                        ) : null}
                                    </div>
                                </div>
                                <div className="text-right text-xs text-slate-500 dark:text-slate-400">
                                    <p>{new Date(item.publishAt).toLocaleString()}</p>
                                    {item.linkUrl && (
                                        <span className="mt-2 inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-300">
                                            Open
                                            <ExternalLink className="h-3.5 w-3.5" />
                                        </span>
                                    )}
                                </div>
                            </div>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
