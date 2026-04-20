import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { Bell, Link2, Paperclip, Plus, RefreshCw, Trash2, UploadCloud } from 'lucide-react';
import {
    AdminNotificationItem,
    adminCreateNotification,
    adminDeleteNotification,
    adminGetNotifications,
    adminToggleNotification,
    adminUpdateNotification,
    adminUploadMedia,
} from '../../services/api';
import { showConfirmDialog } from '../../lib/appDialog';
import { normalizeExternalUrl } from '../../utils/url';

type NotificationForm = {
    title: string;
    message: string;
    category: 'general' | 'exam' | 'update';
    targetRole: 'student' | 'admin' | 'moderator' | 'all';
    publishAt: string;
    expireAt: string;
    linkUrl: string;
    attachmentUrl: string;
};

const emptyForm: NotificationForm = {
    title: '',
    message: '',
    category: 'general',
    targetRole: 'student',
    publishAt: '',
    expireAt: '',
    linkUrl: '',
    attachmentUrl: '',
};
const ADMIN_ATTACHMENT_ROLES = ['superadmin', 'admin', 'moderator', 'editor', 'viewer', 'support_agent', 'finance_agent', 'chairman'];
function getAttachmentAccessRoles(targetRole: NotificationForm['targetRole']): string[] {
    const roles = [...ADMIN_ATTACHMENT_ROLES];
    if (targetRole === 'student' || targetRole === 'all') roles.push('student');
    if (targetRole === 'moderator') roles.push('moderator');
    return Array.from(new Set(roles));
}

export default function NotificationsPanel() {
    const [items, setItems] = useState<AdminNotificationItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [uploadingAttachment, setUploadingAttachment] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [form, setForm] = useState<NotificationForm>(emptyForm);

    const sortedItems = useMemo(
        () => [...items].sort((a, b) => new Date(b.publishAt || '').getTime() - new Date(a.publishAt || '').getTime()),
        [items]
    );

    useEffect(() => {
        void loadItems();
    }, []);

    const loadItems = async () => {
        setLoading(true);
        try {
            const res = await adminGetNotifications();
            setItems(res.data.items || []);
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Failed to load notifications');
        } finally {
            setLoading(false);
        }
    };

    const resetForm = () => {
        setEditingId(null);
        setForm(emptyForm);
    };

    const startEdit = (item: AdminNotificationItem) => {
        setEditingId(item._id);
        setForm({
            title: item.title || '',
            message: item.message || '',
            category: item.category || 'general',
            targetRole: item.targetRole || 'student',
            publishAt: item.publishAt ? new Date(item.publishAt).toISOString().slice(0, 16) : '',
            expireAt: item.expireAt ? new Date(item.expireAt).toISOString().slice(0, 16) : '',
            linkUrl: item.linkUrl || '',
            attachmentUrl: item.attachmentUrl || '',
        });
    };

    const handleAttachmentUpload = async (file?: File) => {
        if (!file) return;
        setUploadingAttachment(true);
        const uploadToast = toast.loading('Uploading attachment...');
        try {
            const res = await adminUploadMedia(file, {
                visibility: 'protected',
                category: 'admin_upload',
                accessRoles: getAttachmentAccessRoles(form.targetRole),
            });
            const payload = res.data as { url?: string; absoluteUrl?: string };
            setForm((prev) => ({ ...prev, attachmentUrl: String(payload?.url || payload?.absoluteUrl || '') }));
            toast.success('Protected attachment uploaded', { id: uploadToast });
        } catch (error: unknown) {
            const errMsg = (error as { response?: { data?: { message?: string } }; message?: string })?.response?.data?.message
                || (error as { message?: string })?.message
                || 'Attachment upload failed';
            toast.error(errMsg, { id: uploadToast });
        } finally {
            setUploadingAttachment(false);
        }
    };

    const submit = async () => {
        if (!form.title.trim() || !form.message.trim()) {
            toast.error('Title and message are required');
            return;
        }
        setSaving(true);
        try {
            const payload = {
                title: form.title.trim(),
                message: form.message.trim(),
                category: form.category,
                targetRole: form.targetRole,
                publishAt: form.publishAt ? new Date(form.publishAt).toISOString() : undefined,
                expireAt: form.expireAt ? new Date(form.expireAt).toISOString() : undefined,
                linkUrl: form.linkUrl.trim(),
                attachmentUrl: form.attachmentUrl.trim(),
            };

            if (editingId) {
                await adminUpdateNotification(editingId, payload);
                toast.success('Notification updated');
            } else {
                await adminCreateNotification(payload);
                toast.success('Notification created');
            }
            resetForm();
            await loadItems();
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Failed to save notification');
        } finally {
            setSaving(false);
        }
    };

    const toggleStatus = async (id: string) => {
        try {
            await adminToggleNotification(id);
            await loadItems();
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Toggle failed');
        }
    };

    const remove = async (id: string) => {
        const confirmed = await showConfirmDialog({
            title: 'Delete notification',
            message: 'Delete this notification?',
            confirmLabel: 'Delete',
            tone: 'danger',
        });
        if (!confirmed) return;
        try {
            await adminDeleteNotification(id);
            toast.success('Notification deleted');
            await loadItems();
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Delete failed');
        }
    };

    return (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <section className="rounded-2xl border border-indigo-500/10 bg-slate-900/65 p-5 space-y-3">
                <h3 className="text-white font-bold flex items-center gap-2"><Plus className="w-4 h-4 text-cyan-300" /> {editingId ? 'Edit Notification' : 'Create Notification'}</h3>
                <input
                    value={form.title}
                    onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                    placeholder="Title"
                    className="w-full rounded-xl bg-slate-950/65 border border-indigo-500/15 px-3 py-2.5 text-sm text-white outline-none"
                />
                <textarea
                    value={form.message}
                    onChange={(e) => setForm((prev) => ({ ...prev, message: e.target.value }))}
                    placeholder="Message"
                    rows={4}
                    className="w-full rounded-xl bg-slate-950/65 border border-indigo-500/15 px-3 py-2.5 text-sm text-white outline-none"
                />
                <div className="grid grid-cols-2 gap-2">
                    <select
                        value={form.category}
                        onChange={(e) => setForm((prev) => ({ ...prev, category: e.target.value as 'general' | 'exam' | 'update' }))}
                        className="rounded-xl bg-slate-950/65 border border-indigo-500/15 px-3 py-2.5 text-sm text-white outline-none"
                    >
                        <option value="general">General</option>
                        <option value="exam">Exam</option>
                        <option value="update">Update</option>
                    </select>
                    <select
                        value={form.targetRole}
                        onChange={(e) => setForm((prev) => ({ ...prev, targetRole: e.target.value as 'student' | 'admin' | 'moderator' | 'all' }))}
                        className="rounded-xl bg-slate-950/65 border border-indigo-500/15 px-3 py-2.5 text-sm text-white outline-none"
                    >
                        <option value="student">Student</option>
                        <option value="all">All</option>
                        <option value="admin">Admin</option>
                        <option value="moderator">Moderator</option>
                    </select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <input
                        type="datetime-local"
                        value={form.publishAt}
                        onChange={(e) => setForm((prev) => ({ ...prev, publishAt: e.target.value }))}
                        className="rounded-xl bg-slate-950/65 border border-indigo-500/15 px-3 py-2.5 text-sm text-white outline-none"
                    />
                    <input
                        type="datetime-local"
                        value={form.expireAt}
                        onChange={(e) => setForm((prev) => ({ ...prev, expireAt: e.target.value }))}
                        className="rounded-xl bg-slate-950/65 border border-indigo-500/15 px-3 py-2.5 text-sm text-white outline-none"
                    />
                </div>
                <div className="relative">
                    <Link2 className="w-4 h-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                        value={form.linkUrl}
                        onChange={(e) => setForm((prev) => ({ ...prev, linkUrl: e.target.value }))}
                        placeholder="Link URL (optional)"
                        className="w-full rounded-xl bg-slate-950/65 border border-indigo-500/15 pl-9 pr-3 py-2.5 text-sm text-white outline-none"
                    />
                </div>
                <div className="space-y-2 rounded-xl border border-indigo-500/15 bg-slate-950/65 p-3">
                    <div className="flex items-center justify-between gap-2">
                        <p className="text-xs text-slate-300 flex items-center gap-1"><Paperclip className="w-3.5 h-3.5" /> Attachment</p>
                        <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-indigo-500/20 px-2.5 py-1.5 text-xs text-indigo-100 hover:bg-indigo-500/30">
                            {uploadingAttachment ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <UploadCloud className="w-3.5 h-3.5" />}
                            Upload
                            <input
                                type="file"
                                className="hidden"
                                onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    void handleAttachmentUpload(file);
                                    e.target.value = '';
                                }}
                            />
                        </label>
                    </div>
                    <input
                        value={form.attachmentUrl}
                        onChange={(e) => setForm((prev) => ({ ...prev, attachmentUrl: e.target.value }))}
                        placeholder="Attachment URL (optional)"
                        className="w-full rounded-xl bg-slate-950/75 border border-indigo-500/15 px-3 py-2.5 text-sm text-white outline-none"
                    />
                    {form.attachmentUrl ? (
                        <a href={form.attachmentUrl} target="_blank" rel="noreferrer" className="text-xs text-cyan-300 hover:text-cyan-200 inline-flex items-center gap-1">
                            Preview attachment
                        </a>
                    ) : null}
                </div>
                <div className="flex gap-2">
                    <button
                        type="button"
                        onClick={submit}
                        disabled={saving}
                        className="flex-1 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
                    >
                        {saving ? 'Saving...' : editingId ? 'Update Notification' : 'Create Notification'}
                    </button>
                    {editingId ? (
                        <button type="button" onClick={resetForm} className="rounded-xl bg-white/5 px-4 py-2.5 text-sm text-slate-300">Cancel</button>
                    ) : null}
                </div>
            </section>

            <section className="rounded-2xl border border-indigo-500/10 bg-slate-900/65 p-5 space-y-3">
                <div className="flex items-center justify-between">
                    <h3 className="text-white font-bold flex items-center gap-2"><Bell className="w-4 h-4 text-amber-300" /> Notifications</h3>
                    {loading ? <RefreshCw className="w-4 h-4 animate-spin text-slate-400" /> : null}
                </div>
                <div className="space-y-2 max-h-[520px] overflow-y-auto">
                    {sortedItems.length === 0 ? (
                        <p className="text-sm text-slate-500">No notifications yet.</p>
                    ) : sortedItems.map((item) => (
                        <article key={item._id} className="rounded-xl border border-indigo-500/15 bg-slate-950/65 p-3">
                            <div className="flex items-center justify-between gap-2">
                                <p className="text-sm font-semibold text-white">{item.title}</p>
                                <span className={`text-[10px] px-2 py-0.5 rounded-full ${item.isActive ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'}`}>
                                    {item.isActive ? 'Active' : 'Inactive'}
                                </span>
                            </div>
                            <p className="text-xs text-slate-400 mt-1">{item.message}</p>
                            <p className="text-[11px] text-slate-500 mt-1">{item.category} • target: {item.targetRole || 'student'}</p>
                            {(item.linkUrl || item.attachmentUrl) ? (
                                <div className="mt-2 flex gap-2 text-[11px]">
                                    {normalizeExternalUrl(item.linkUrl) ? <a href={normalizeExternalUrl(item.linkUrl) || undefined} target="_blank" rel="noreferrer" className="text-cyan-300 hover:text-cyan-200">Link</a> : null}
                                    {normalizeExternalUrl(item.attachmentUrl) ? <a href={normalizeExternalUrl(item.attachmentUrl) || undefined} target="_blank" rel="noreferrer" className="text-indigo-300 hover:text-indigo-200">Attachment</a> : null}
                                </div>
                            ) : null}
                            <div className="mt-2 flex items-center gap-2">
                                <button type="button" onClick={() => startEdit(item)} className="rounded-lg bg-cyan-500/15 px-2.5 py-1 text-xs text-cyan-200">Edit</button>
                                <button type="button" onClick={() => toggleStatus(item._id)} className="rounded-lg bg-emerald-500/15 px-2.5 py-1 text-xs text-emerald-200">Toggle</button>
                                <button type="button" onClick={() => remove(item._id)} className="rounded-lg bg-red-500/15 px-2 py-1 text-xs text-red-200 inline-flex items-center gap-1"><Trash2 className="w-3 h-3" /> Delete</button>
                            </div>
                        </article>
                    ))}
                </div>
            </section>
        </div>
    );
}

