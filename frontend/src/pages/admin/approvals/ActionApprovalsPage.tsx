import { useEffect, useMemo, useState, useCallback } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    AlertTriangle, Check, Clock, Monitor, RefreshCw, ShieldAlert, Smartphone, UserRound, X,
} from 'lucide-react';
import AdminGuardShell from '../../../components/admin/AdminGuardShell';
import {
    adminApprovePendingAction,
    adminGetPendingApprovals,
    adminRejectPendingAction,
    type AdminActionApproval,
} from '../../../services/api';
import { showConfirmDialog } from '../../../lib/appDialog';
import { useEscapeKey } from '../../../hooks/useEscapeKey';

type Toast = { show: boolean; message: string; type: 'success' | 'error' };

function JsonBlock({ title, value }: { title: string; value?: Record<string, unknown> }) {
    if (!value || Object.keys(value).length === 0) return null;
    return (
        <section className="rounded-2xl border border-white/10 bg-slate-950/60 p-4">
            <h4 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">{title}</h4>
            <pre className="mt-3 max-h-56 overflow-auto rounded-2xl bg-black/60 p-3 text-xs text-emerald-300">
                {JSON.stringify(value, null, 2)}
            </pre>
        </section>
    );
}

function DetailRow({ label, value }: { label: string; value?: string | null }) {
    if (!value) return null;
    return (
        <div className="rounded-2xl border border-white/8 bg-slate-950/40 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
            <p className="mt-1 text-sm text-slate-100">{value}</p>
        </div>
    );
}

function formatActor(item: AdminActionApproval): { id: string; name: string } {
    const initiator = typeof item.initiatedBy === 'object' ? item.initiatedBy : null;
    return {
        id: initiator?._id || (typeof item.initiatedBy === 'string' ? item.initiatedBy : ''),
        name: initiator?.full_name || initiator?.username || initiator?.email || 'Unknown Admin',
    };
}

function ApprovalDetail({
    item,
    isSelf,
    busy,
    onApprove,
    onReject,
    compact,
}: {
    item: AdminActionApproval;
    isSelf: boolean;
    busy: boolean;
    onApprove: (item: AdminActionApproval) => void;
    onReject: (item: AdminActionApproval) => void;
    compact?: boolean;
}) {
    const actor = formatActor(item);
    const requestContext = item.requestContext;
    const summaryRows = item.reviewSummary || [];
    const contextRows = [
        { label: 'IP Address', value: requestContext?.ipAddress || '' },
        { label: 'Device', value: requestContext?.deviceInfo || '' },
        { label: 'Browser', value: requestContext?.browser || '' },
        { label: 'Platform', value: requestContext?.platform || '' },
        { label: 'Location', value: requestContext?.locationSummary || '' },
        { label: 'Session ID', value: requestContext?.sessionId || '' },
    ].filter((row) => row.value);

    return (
        <div className={`flex h-full flex-col rounded-[1.75rem] border border-white/10 bg-slate-900/70 ${compact ? 'p-5' : 'p-6'}`}>
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-white/8 pb-5">
                <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-indigo-300">{item.module.replace(/[_-]+/g, ' ')}</p>
                    <h3 className="mt-2 text-xl font-bold text-white">{item.actionKey.replace(/\./g, ' / ')}</h3>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                        <span className="rounded-full bg-white/6 px-2.5 py-1 font-mono text-slate-200">{item.method.toUpperCase()} {item.routePath}</span>
                        <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {formatDistanceToNow(new Date(item.initiatedAt))} ago</span>
                        <span>Expires {new Date(item.expiresAt).toLocaleString()}</span>
                    </div>
                </div>
                {isSelf ? (
                    <div className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-200">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        Waiting for another admin
                    </div>
                ) : (
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={() => onReject(item)}
                            disabled={busy}
                            className="rounded-2xl border border-white/12 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/5 disabled:opacity-50"
                        >
                            Reject
                        </button>
                        <button
                            type="button"
                            onClick={() => onApprove(item)}
                            disabled={busy}
                            className="rounded-2xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
                        >
                            Approve
                        </button>
                    </div>
                )}
            </div>

            <div className="mt-5 flex-1 space-y-5 overflow-auto pr-1">
                <section className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                    <h4 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Initiator</h4>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <DetailRow label="Requested By" value={actor.name} />
                        <DetailRow label="Role" value={item.initiatedByRole} />
                        <DetailRow label="Started" value={new Date(item.initiatedAt).toLocaleString()} />
                        <DetailRow label="Target" value={item.targetSummary?.targetLabel || item.targetSummary?.targetType || ''} />
                    </div>
                </section>

                {summaryRows.length > 0 ? (
                    <section className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                        <h4 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Review Summary</h4>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                            {summaryRows.map((row) => <DetailRow key={`${row.label}-${row.value}`} label={row.label} value={row.value} />)}
                        </div>
                    </section>
                ) : null}

                {contextRows.length > 0 ? (
                    <section className="rounded-2xl border border-white/10 bg-slate-950/50 p-4">
                        <h4 className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Request Context</h4>
                        <div className="mt-3 grid gap-3 sm:grid-cols-2">
                            {contextRows.map((row) => <DetailRow key={row.label} label={row.label} value={row.value} />)}
                        </div>
                    </section>
                ) : null}

                <JsonBlock title="Before Snapshot" value={item.beforeSnapshot} />
                <JsonBlock title="After Snapshot / Impact" value={item.afterSnapshot} />
                <JsonBlock title="Payload Snapshot" value={item.payloadSnapshot} />
                <JsonBlock title="Query Snapshot" value={item.querySnapshot} />
                <JsonBlock title="Params Snapshot" value={item.paramsSnapshot} />
            </div>
        </div>
    );
}

export default function ActionApprovalsPage() {
    const queryClient = useQueryClient();
    const localUserId = localStorage.getItem('cw_user_id') || '';
    const [toast, setToast] = useState<Toast>({ show: false, message: '', type: 'success' });
    const [selectedId, setSelectedId] = useState('');
    const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
    const [rejectModal, setRejectModal] = useState<{ open: boolean; item: AdminActionApproval | null; reason: string }>({
        open: false,
        item: null,
        reason: '',
    });

    // Close modals on Escape key
    const closeRejectModal = useCallback(() => setRejectModal({ open: false, item: null, reason: '' }), []);
    const closeMobileDrawer = useCallback(() => setMobileDrawerOpen(false), []);
    useEscapeKey(closeRejectModal, rejectModal.open);
    useEscapeKey(closeMobileDrawer, mobileDrawerOpen && !rejectModal.open);

    const { data, isLoading, isError } = useQuery({
        queryKey: ['admin-pending-approvals'],
        queryFn: () => adminGetPendingApprovals(),
    });

    const showToast = (message: string, type: Toast['type']) => {
        setToast({ show: true, message, type });
        window.setTimeout(() => setToast((current) => ({ ...current, show: false })), 3000);
    };

    const approveMutation = useMutation({
        mutationFn: adminApprovePendingAction,
        onSuccess: (res) => {
            void queryClient.invalidateQueries({ queryKey: ['admin-pending-approvals'] });
            showToast(res.data?.message || 'Action approved', 'success');
        },
        onError: (err: any) => showToast(err.response?.data?.message || 'Failed to approve', 'error'),
    });

    const rejectMutation = useMutation({
        mutationFn: ({ id, reason }: { id: string; reason: string }) => adminRejectPendingAction(id, reason),
        onSuccess: (res) => {
            void queryClient.invalidateQueries({ queryKey: ['admin-pending-approvals'] });
            setRejectModal({ open: false, item: null, reason: '' });
            showToast(res.data?.message || 'Action rejected', 'success');
        },
        onError: (err: any) => showToast(err.response?.data?.message || 'Failed to reject', 'error'),
    });

    const items = data?.data?.items || [];
    const selectedItem = useMemo(
        () => items.find((item) => item._id === selectedId) || items[0] || null,
        [items, selectedId],
    );

    useEffect(() => {
        if (!items.length) {
            setSelectedId('');
            setMobileDrawerOpen(false);
            return;
        }
        if (!selectedId || !items.some((item) => item._id === selectedId)) {
            setSelectedId(items[0]._id);
        }
    }, [items, selectedId]);

    const openItem = (item: AdminActionApproval) => {
        setSelectedId(item._id);
        setMobileDrawerOpen(true);
    };

    const handleApprove = async (item: AdminActionApproval) => {
        const confirmed = await showConfirmDialog({
            title: 'Approve action',
            message: 'Approve and execute this action?',
            confirmLabel: 'Approve',
        });
        if (!confirmed) return;
        approveMutation.mutate(item._id);
    };

    if (isLoading) {
        return (
            <AdminGuardShell title="Approval Center" description="Review actions requiring second admin approval">
                <div className="space-y-4 p-6">{[1, 2, 3].map((item) => <div key={item} className="h-28 animate-pulse rounded-2xl bg-slate-200 dark:bg-slate-800" />)}</div>
            </AdminGuardShell>
        );
    }

    if (isError) {
        return (
            <AdminGuardShell title="Approval Center" description="Review actions requiring second admin approval">
                <div className="p-6">
                    <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700 dark:border-red-900/50 dark:bg-red-900/20 dark:text-red-400">
                        Failed to load pending approvals.
                    </div>
                </div>
            </AdminGuardShell>
        );
    }

    return (
        <AdminGuardShell title="Approval Center" description="Review action payloads, device context, and impact summaries before approval">
            {toast.show ? (
                <div className={`fixed right-4 top-4 z-50 rounded-2xl px-4 py-3 text-sm font-medium text-white shadow-lg ${toast.type === 'success' ? 'bg-emerald-600' : 'bg-red-600'}`}>
                    {toast.message}
                </div>
            ) : null}

            <div className="space-y-6 p-4 sm:p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h2 className="text-xl font-semibold text-slate-100">Pending Requests ({items.length})</h2>
                        <p className="mt-1 text-sm text-slate-400">Review who triggered the change, from where, and what will be affected.</p>
                    </div>
                    <button
                        type="button"
                        onClick={() => void queryClient.invalidateQueries({ queryKey: ['admin-pending-approvals'] })}
                        className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:bg-white/10"
                    >
                        <RefreshCw className="h-4 w-4" />
                        Refresh
                    </button>
                </div>

                {items.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-[1.75rem] border border-white/10 bg-slate-900/60 py-20 text-center">
                        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-800">
                            <Check className="h-8 w-8 text-emerald-400" />
                        </div>
                        <h3 className="text-base font-semibold text-white">All caught up</h3>
                        <p className="mt-2 max-w-md text-sm text-slate-400">There are no pending requests waiting for second approval right now.</p>
                    </div>
                ) : (
                    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
                        <div className="space-y-4">
                            {items.map((item) => {
                                const actor = formatActor(item);
                                const isSelf = actor.id === localUserId;
                                const hasDevice = Boolean(item.requestContext?.deviceInfo || item.requestContext?.browser || item.requestContext?.platform);
                                return (
                                    <button
                                        key={item._id}
                                        type="button"
                                        onClick={() => openItem(item)}
                                        className={`w-full rounded-[1.5rem] border p-5 text-left transition ${selectedItem?._id === item._id
                                            ? 'border-indigo-400/60 bg-indigo-500/10'
                                            : 'border-white/10 bg-slate-900/55 hover:border-white/20 hover:bg-slate-900/80'
                                            }`}
                                    >
                                        <div className="flex flex-wrap items-start justify-between gap-3">
                                            <div className="flex min-w-0 items-start gap-4">
                                                <div className="mt-1 rounded-2xl bg-amber-500/15 p-2.5 text-amber-300">
                                                    <ShieldAlert className="h-5 w-5" />
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">{item.module.replace(/[_-]+/g, ' ')}</p>
                                                    <h3 className="mt-1 text-lg font-semibold text-white">{item.actionKey.replace(/\./g, ' / ')}</h3>
                                                    <p className="mt-1 text-sm text-slate-300">{item.targetSummary?.targetLabel || item.reviewSummary?.[0]?.value || item.action}</p>
                                                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                                                        <span className="inline-flex items-center gap-1"><UserRound className="h-3.5 w-3.5" /> {actor.name}</span>
                                                        <span>{item.initiatedByRole}</span>
                                                        <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {formatDistanceToNow(new Date(item.initiatedAt))} ago</span>
                                                    </div>
                                                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                                                        <span className="rounded-full bg-white/6 px-2.5 py-1 font-mono text-slate-200">{item.method.toUpperCase()} {item.routePath}</span>
                                                        {hasDevice ? (
                                                            <span className="inline-flex items-center gap-1">
                                                                {item.requestContext?.platform?.toLowerCase().includes('android') || item.requestContext?.platform?.toLowerCase().includes('ios')
                                                                    ? <Smartphone className="h-3.5 w-3.5" />
                                                                    : <Monitor className="h-3.5 w-3.5" />}
                                                                {item.requestContext?.browser || item.requestContext?.deviceInfo || 'Unknown device'}
                                                            </span>
                                                        ) : null}
                                                    </div>
                                                </div>
                                            </div>
                                            {isSelf ? (
                                                <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-200">Waiting for another admin</span>
                                            ) : (
                                                <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-200">Ready to review</span>
                                            )}
                                        </div>
                                    </button>
                                );
                            })}
                        </div>

                        <div className="hidden xl:block">
                            {selectedItem ? (
                                <ApprovalDetail
                                    item={selectedItem}
                                    isSelf={formatActor(selectedItem).id === localUserId}
                                    busy={approveMutation.isPending || rejectMutation.isPending}
                                    onApprove={handleApprove}
                                    onReject={(item) => setRejectModal({ open: true, item, reason: '' })}
                                />
                            ) : null}
                        </div>
                    </div>
                )}
            </div>

            {selectedItem ? (
                <div className={`fixed inset-0 z-50 xl:hidden ${mobileDrawerOpen ? 'pointer-events-auto' : 'pointer-events-none'}`}>
                    <div className={`absolute inset-0 bg-slate-950/60 transition-opacity ${mobileDrawerOpen ? 'opacity-100' : 'opacity-0'}`} onClick={() => setMobileDrawerOpen(false)} />
                    <div className={`absolute inset-x-0 bottom-0 max-h-[92vh] rounded-t-[2rem] border border-white/10 bg-[#0B1120] transition-transform ${mobileDrawerOpen ? 'translate-y-0' : 'translate-y-full'}`}>
                        <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Review Drawer</p>
                                <p className="mt-1 text-base font-semibold text-white">{selectedItem.actionKey.replace(/\./g, ' / ')}</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setMobileDrawerOpen(false)}
                                className="rounded-2xl border border-white/10 p-2 text-slate-200"
                                aria-label="Close approval details"
                            >
                                <X className="h-5 w-5" />
                            </button>
                        </div>
                        <div className="max-h-[calc(92vh-72px)] overflow-auto p-4">
                            <ApprovalDetail
                                item={selectedItem}
                                isSelf={formatActor(selectedItem).id === localUserId}
                                busy={approveMutation.isPending || rejectMutation.isPending}
                                onApprove={handleApprove}
                                onReject={(item) => setRejectModal({ open: true, item, reason: '' })}
                                compact
                            />
                        </div>
                    </div>
                </div>
            ) : null}

            {rejectModal.open ? (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
                    <div className="w-full max-w-md rounded-[1.75rem] border border-white/10 bg-slate-900 p-6">
                        <h3 className="text-lg font-semibold text-white">Reject approval request</h3>
                        <p className="mt-2 text-sm text-slate-400">Add a rejection note so the requesting admin understands what must be changed before resubmitting.</p>
                        <textarea
                            value={rejectModal.reason}
                            onChange={(event) => setRejectModal((current) => ({ ...current, reason: event.target.value }))}
                            rows={4}
                            placeholder="Reason for rejection"
                            className="mt-4 w-full rounded-2xl border border-white/10 bg-slate-950/65 px-4 py-3 text-sm text-white outline-none focus:border-indigo-400/60"
                        />
                        <div className="mt-5 flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => setRejectModal({ open: false, item: null, reason: '' })}
                                className="rounded-2xl border border-white/10 px-4 py-2 text-sm font-semibold text-slate-200"
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={() => rejectModal.item && rejectMutation.mutate({ id: rejectModal.item._id, reason: rejectModal.reason })}
                                disabled={rejectMutation.isPending}
                                className="rounded-2xl bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                            >
                                {rejectMutation.isPending ? 'Rejecting...' : 'Reject Action'}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </AdminGuardShell>
    );
}
