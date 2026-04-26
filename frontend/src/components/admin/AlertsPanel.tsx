import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { Bell, Plus, Edit, Trash2, RefreshCw, Save, X, ToggleLeft, ToggleRight, AlertCircle } from 'lucide-react';
import {
    adminCreateAlert,
    adminDeleteAlert,
    adminGetAlerts,
    adminPublishAlert,
    adminUpdateAlert,
} from '../../services/api';
import { showConfirmDialog } from '../../lib/appDialog';
import { useEscapeKey } from '../../hooks/useEscapeKey';

interface HomeAlert {
    _id: string;
    title?: string;
    message: string;
    link?: string;
    priority: number;
    isActive: boolean;
    status: 'draft' | 'published';
    requireAck?: boolean;
    target?: {
        type: 'all' | 'groups' | 'users';
        groupIds?: string[];
        userIds?: string[];
    };
    metrics?: {
        impressions?: number;
        acknowledgements?: number;
    };
    startAt?: string;
    endAt?: string;
    createdAt: string;
}

const emptyForm = {
    title: '',
    message: '',
    link: '',
    priority: 0,
    isActive: true,
    requireAck: false,
    targetType: 'all' as 'all' | 'groups' | 'users',
    targetIds: '',
    startAt: '',
    endAt: '',
};

export default function AlertsPanel() {
    const [alerts, setAlerts] = useState<HomeAlert[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState('');
    const [modal, setModal] = useState<null | 'create' | HomeAlert>(null);
    const [form, setForm] = useState(emptyForm);
    const [saving, setSaving] = useState(false);

    // Close modal on Escape key
    const closeModal = useCallback(() => setModal(null), []);
    useEscapeKey(closeModal, modal !== null);

    const fetchAlerts = async () => {
        setLoading(true);
        setLoadError('');
        try {
            const { data } = await adminGetAlerts();
            setAlerts(data.alerts || []);
        } catch {
            setLoadError('Failed to load alerts');
            toast.error('Failed to load alerts');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void fetchAlerts();
    }, []);

    const openCreate = () => {
        setForm(emptyForm);
        setModal('create');
    };

    const openEdit = (alert: HomeAlert) => {
        const targetType = alert.target?.type || 'all';
        const targetIds = targetType === 'groups'
            ? (alert.target?.groupIds || []).join(',')
            : (alert.target?.userIds || []).join(',');
        setForm({
            title: alert.title || '',
            message: alert.message,
            link: alert.link || '',
            priority: alert.priority,
            isActive: alert.isActive,
            requireAck: Boolean(alert.requireAck),
            targetType,
            targetIds,
            startAt: alert.startAt ? new Date(alert.startAt).toISOString().slice(0, 16) : '',
            endAt: alert.endAt ? new Date(alert.endAt).toISOString().slice(0, 16) : '',
        });
        setModal(alert);
    };

    const buildTarget = () => {
        const ids = form.targetIds
            .split(',')
            .map((entry) => entry.trim())
            .filter(Boolean);
        if (form.targetType === 'groups') {
            return { type: 'groups', groupIds: ids, userIds: [] };
        }
        if (form.targetType === 'users') {
            return { type: 'users', groupIds: [], userIds: ids };
        }
        return { type: 'all', groupIds: [], userIds: [] };
    };

    const save = async () => {
        if (!form.message.trim()) {
            toast.error('Message is required');
            return;
        }
        setSaving(true);
        try {
            const payload = {
                title: form.title,
                message: form.message,
                link: form.link,
                priority: Number(form.priority),
                isActive: form.isActive,
                requireAck: form.requireAck,
                target: buildTarget(),
                startAt: form.startAt || undefined,
                endAt: form.endAt || undefined,
            };
            if (modal === 'create') {
                await adminCreateAlert(payload);
                toast.success('Alert created');
            } else if (modal && typeof modal === 'object') {
                await adminUpdateAlert(modal._id, payload);
                toast.success('Alert updated');
            }
            setModal(null);
            void fetchAlerts();
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Failed to save alert');
        } finally {
            setSaving(false);
        }
    };

    const deleteAlert = async (id: string) => {
        const confirmed = await showConfirmDialog({
            title: 'Delete alert',
            message: 'Delete this alert?',
            confirmLabel: 'Delete',
            tone: 'danger',
        });
        if (!confirmed) return;
        try {
            await adminDeleteAlert(id);
            toast.success('Alert deleted');
            void fetchAlerts();
        } catch {
            toast.error('Failed to delete alert');
        }
    };

    const toggleAlert = async (id: string, publish: boolean) => {
        try {
            await adminPublishAlert(id, publish);
            void fetchAlerts();
        } catch {
            toast.error('Failed to change publish state');
        }
    };

    const isActiveNow = (alert: HomeAlert) => {
        if (alert.status !== 'published' || !alert.isActive) return false;
        const now = new Date();
        if (alert.startAt && new Date(alert.startAt) > now) return false;
        if (alert.endAt && new Date(alert.endAt) < now) return false;
        return true;
    };

    return (
        <div className="space-y-4 max-w-6xl">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <div>
                    <h2 className="text-lg font-bold text-white flex items-center gap-2">
                        <Bell className="w-5 h-5 text-amber-400" /> Live Alerts
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">Create targeted alerts, publish schedules, and require acknowledgement.</p>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => void fetchAlerts()} className="p-2 text-slate-400 hover:text-white bg-white/5 rounded-xl transition-colors">
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                    <button onClick={openCreate} className="bg-gradient-to-r from-amber-500 to-orange-500 text-white text-sm px-4 py-2 rounded-xl flex items-center gap-2 hover:opacity-90 shadow-lg shadow-amber-500/20">
                        <Plus className="w-4 h-4" /> New Alert
                    </button>
                </div>
            </div>

            {alerts.filter(isActiveNow).length > 0 ? (
                <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 overflow-hidden">
                    <p className="text-xs text-amber-400 mb-1 font-medium">Live Preview:</p>
                    <div className="overflow-hidden relative">
                        <div className="flex gap-8 animate-marquee whitespace-nowrap">
                            {alerts.filter(isActiveNow).map((alert) => (
                                <span key={alert._id} className="text-sm text-amber-300">• {alert.title || 'Alert'}: {alert.message}</span>
                            ))}
                        </div>
                    </div>
                </div>
            ) : null}

            <div className="bg-slate-900/60 backdrop-blur-sm rounded-2xl border border-indigo-500/10 overflow-hidden">
                {loading ? (
                    <div className="p-12 text-center">
                        <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin mx-auto" />
                    </div>
                ) : loadError ? (
                    <div className="p-8 text-center">
                        <AlertCircle className="w-10 h-10 text-rose-400 mx-auto mb-3" />
                        <p className="text-sm text-rose-300">{loadError}</p>
                        <button
                            type="button"
                            onClick={() => void fetchAlerts()}
                            className="mt-3 inline-flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200 hover:bg-rose-500/20"
                        >
                            <RefreshCw className="w-3.5 h-3.5" />
                            Retry
                        </button>
                    </div>
                ) : alerts.length === 0 ? (
                    <div className="p-12 text-center">
                        <AlertCircle className="w-12 h-12 text-slate-600 mx-auto mb-3" />
                        <p className="text-slate-500">No alerts yet. Create one to broadcast to students.</p>
                    </div>
                ) : (
                    <>
                        <div className="md:hidden space-y-2 p-3">
                            {alerts.map((alert) => {
                                const targetSummary = alert.target?.type === 'groups'
                                    ? `Groups (${(alert.target.groupIds || []).length})`
                                    : alert.target?.type === 'users'
                                        ? `Users (${(alert.target.userIds || []).length})`
                                        : 'All Students';
                                return (
                                    <article key={alert._id} className="rounded-xl border border-indigo-500/15 bg-slate-950/60 p-3">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <p className="text-sm font-semibold text-white break-words">{alert.title || 'Untitled'}</p>
                                                <p className="mt-1 text-xs text-slate-400 break-words">{alert.message}</p>
                                            </div>
                                            <span className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full font-semibold ${isActiveNow(alert) ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-500/20 text-slate-400'}`}>
                                                {isActiveNow(alert) ? 'Live' : alert.status}
                                            </span>
                                        </div>
                                        <p className="mt-2 text-[11px] text-slate-400">Target: {targetSummary}</p>
                                        <p className="text-[11px] text-slate-500 break-words">
                                            {alert.startAt ? new Date(alert.startAt).toLocaleString() : 'Now'}
                                            {alert.endAt ? ` -> ${new Date(alert.endAt).toLocaleString()}` : ' -> Open'}
                                        </p>
                                        <div className="mt-3 flex items-center gap-1">
                                            <button
                                                onClick={() => void toggleAlert(alert._id, alert.status !== 'published')}
                                                className="p-1.5 hover:bg-white/5 rounded-lg"
                                                title={alert.status === 'published' ? 'Unpublish' : 'Publish'}
                                            >
                                                {alert.status === 'published'
                                                    ? <ToggleRight className="w-4 h-4 text-emerald-400" />
                                                    : <ToggleLeft className="w-4 h-4 text-slate-500" />
                                                }
                                            </button>
                                            <button onClick={() => openEdit(alert)} className="p-1.5 hover:bg-amber-500/10 rounded-lg" title="Edit">
                                                <Edit className="w-4 h-4 text-amber-400" />
                                            </button>
                                            <button onClick={() => void deleteAlert(alert._id)} className="p-1.5 hover:bg-red-500/10 rounded-lg" title="Delete">
                                                <Trash2 className="w-4 h-4 text-red-400" />
                                            </button>
                                        </div>
                                    </article>
                                );
                            })}
                        </div>

                        <div className="hidden md:block overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead>
                                    <tr className="border-b border-indigo-500/10">
                                        {['Title', 'Target', 'Ack', 'Metrics', 'Schedule', 'Status', 'Actions'].map((header) => (
                                            <th key={header} className="text-left py-3 px-4 text-xs text-slate-400 uppercase tracking-wider font-medium">{header}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {alerts.map((alert) => {
                                        const targetSummary = alert.target?.type === 'groups'
                                            ? `Groups (${(alert.target.groupIds || []).length})`
                                            : alert.target?.type === 'users'
                                                ? `Users (${(alert.target.userIds || []).length})`
                                                : 'All Students';
                                        return (
                                            <tr key={alert._id} className="border-b border-indigo-500/5 hover:bg-white/[0.02] transition-colors">
                                                <td className="py-3 px-4">
                                                    <p className="text-white font-medium max-w-[320px] break-words">{alert.title || 'Untitled'}</p>
                                                    <p className="text-xs text-slate-500 max-w-[360px] break-words">{alert.message}</p>
                                                </td>
                                                <td className="py-3 px-4 text-xs text-slate-300">{targetSummary}</td>
                                                <td className="py-3 px-4 text-xs text-slate-300">{alert.requireAck ? 'Required' : 'Optional'}</td>
                                                <td className="py-3 px-4 text-xs text-slate-300">
                                                    <div>Impr: {alert.metrics?.impressions || 0}</div>
                                                    <div>Ack: {alert.metrics?.acknowledgements || 0}</div>
                                                </td>
                                                <td className="py-3 px-4 text-xs text-slate-400">
                                                    {alert.startAt ? new Date(alert.startAt).toLocaleString() : 'Now'}
                                                    {alert.endAt ? ` -> ${new Date(alert.endAt).toLocaleString()}` : ' -> Open'}
                                                </td>
                                                <td className="py-3 px-4">
                                                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${isActiveNow(alert) ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-500/20 text-slate-400'}`}>
                                                        {isActiveNow(alert) ? 'Live' : alert.status}
                                                    </span>
                                                </td>
                                                <td className="py-3 px-4">
                                                    <div className="flex items-center gap-1">
                                                        <button
                                                            onClick={() => void toggleAlert(alert._id, alert.status !== 'published')}
                                                            className="p-1.5 hover:bg-white/5 rounded-lg"
                                                            title={alert.status === 'published' ? 'Unpublish' : 'Publish'}
                                                        >
                                                            {alert.status === 'published'
                                                                ? <ToggleRight className="w-4 h-4 text-emerald-400" />
                                                                : <ToggleLeft className="w-4 h-4 text-slate-500" />
                                                            }
                                                        </button>
                                                        <button onClick={() => openEdit(alert)} className="p-1.5 hover:bg-amber-500/10 rounded-lg" title="Edit">
                                                            <Edit className="w-4 h-4 text-amber-400" />
                                                        </button>
                                                        <button onClick={() => void deleteAlert(alert._id)} className="p-1.5 hover:bg-red-500/10 rounded-lg" title="Delete">
                                                            <Trash2 className="w-4 h-4 text-red-400" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </div>

            {modal ? (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setModal(null)}>
                    <div className="bg-slate-900/65 border border-indigo-500/15 rounded-2xl w-full max-w-lg shadow-2xl" onClick={(event) => event.stopPropagation()}>
                        <div className="px-6 py-4 border-b border-indigo-500/10 flex items-center justify-between">
                            <h3 className="font-bold text-white flex items-center gap-2">
                                <Bell className="w-4 h-4 text-amber-400" />
                                {modal === 'create' ? 'New Alert' : 'Edit Alert'}
                            </h3>
                            <button onClick={() => setModal(null)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="text-xs text-slate-400 mb-1 block">Title</label>
                                <input
                                    value={form.title}
                                    onChange={(event) => setForm({ ...form, title: event.target.value })}
                                    placeholder="Alert title"
                                    className="w-full bg-slate-950/65 border border-indigo-500/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:border-indigo-500/30 outline-none"
                                />
                            </div>
                            <div>
                                <label className="text-xs text-slate-400 mb-1 block">Message <span className="text-red-400">*</span></label>
                                <textarea
                                    rows={3}
                                    value={form.message}
                                    onChange={(event) => setForm({ ...form, message: event.target.value })}
                                    placeholder="Alert message text..."
                                    className="w-full bg-slate-950/65 border border-indigo-500/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 focus:border-indigo-500/30 outline-none resize-none"
                                />
                            </div>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <div>
                                    <label className="text-xs text-slate-400 mb-1 block">Priority</label>
                                    <input
                                        type="number"
                                        value={form.priority}
                                        onChange={(event) => setForm({ ...form, priority: Number(event.target.value) })}
                                        className="w-full bg-slate-950/65 border border-indigo-500/10 rounded-xl px-3 py-2.5 text-sm text-white focus:border-indigo-500/30 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-slate-400 mb-1 block">Link</label>
                                    <input
                                        value={form.link}
                                        onChange={(event) => setForm({ ...form, link: event.target.value })}
                                        placeholder="https://..."
                                        className="w-full bg-slate-950/65 border border-indigo-500/10 rounded-xl px-3 py-2.5 text-sm text-white focus:border-indigo-500/30 outline-none"
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <div>
                                    <label className="text-xs text-slate-400 mb-1 block">Target Type</label>
                                    <select
                                        value={form.targetType}
                                        onChange={(event) => setForm({ ...form, targetType: event.target.value as 'all' | 'groups' | 'users' })}
                                        className="w-full bg-slate-950/65 border border-indigo-500/10 rounded-xl px-3 py-2.5 text-sm text-white focus:border-indigo-500/30 outline-none"
                                    >
                                        <option value="all">All Students</option>
                                        <option value="groups">Specific Groups</option>
                                        <option value="users">Specific Users</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs text-slate-400 mb-1 block">Target IDs (comma)</label>
                                    <input
                                        value={form.targetIds}
                                        onChange={(event) => setForm({ ...form, targetIds: event.target.value })}
                                        placeholder="id1,id2"
                                        className="w-full bg-slate-950/65 border border-indigo-500/10 rounded-xl px-3 py-2.5 text-sm text-white focus:border-indigo-500/30 outline-none"
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <div>
                                    <label className="text-xs text-slate-400 mb-1 block">Start At</label>
                                    <input
                                        type="datetime-local"
                                        value={form.startAt}
                                        onChange={(event) => setForm({ ...form, startAt: event.target.value })}
                                        className="w-full bg-slate-950/65 border border-indigo-500/10 rounded-xl px-3 py-2.5 text-sm text-white focus:border-indigo-500/30 outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-slate-400 mb-1 block">End At</label>
                                    <input
                                        type="datetime-local"
                                        value={form.endAt}
                                        onChange={(event) => setForm({ ...form, endAt: event.target.value })}
                                        className="w-full bg-slate-950/65 border border-indigo-500/10 rounded-xl px-3 py-2.5 text-sm text-white focus:border-indigo-500/30 outline-none"
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <label className="flex items-center gap-3 cursor-pointer bg-slate-950/65 p-3 rounded-xl border border-indigo-500/10">
                                    <input
                                        type="checkbox"
                                        checked={form.isActive}
                                        onChange={(event) => setForm({ ...form, isActive: event.target.checked })}
                                        className="rounded border-indigo-500/20 bg-slate-900/70"
                                    />
                                    <span className="text-sm text-slate-300">Enabled</span>
                                </label>
                                <label className="flex items-center gap-3 cursor-pointer bg-slate-950/65 p-3 rounded-xl border border-indigo-500/10">
                                    <input
                                        type="checkbox"
                                        checked={form.requireAck}
                                        onChange={(event) => setForm({ ...form, requireAck: event.target.checked })}
                                        className="rounded border-indigo-500/20 bg-slate-900/70"
                                    />
                                    <span className="text-sm text-slate-300">Require Ack</span>
                                </label>
                            </div>
                        </div>
                        <div className="px-6 py-4 border-t border-indigo-500/10 flex gap-3 justify-end">
                            <button onClick={() => setModal(null)} className="px-4 py-2 text-sm text-slate-400 hover:text-white rounded-xl hover:bg-white/5">Cancel</button>
                            <button onClick={() => void save()} disabled={saving} className="px-6 py-2 text-sm bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl hover:opacity-90 disabled:opacity-50 flex items-center gap-2">
                                {saving ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                                {modal === 'create' ? 'Create' : 'Save'}
                            </button>
                        </div>
                    </div>
                </div>
            ) : null}
        </div>
    );
}
