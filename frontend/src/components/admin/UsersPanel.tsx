import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Download, Eye, KeyRound, Plus, RefreshCw, Search, ShieldCheck, Trash2, Upload } from 'lucide-react';
import {
    ApiUser,
    AdminUserStreamEvent,
    adminBulkImportStudents,
    adminBulkUserAction,
    adminConfirmGuardianOtp,
    adminCreateUser,
    adminDeleteUser,
    adminExportStudents,
    adminGetUserById,
    adminGetUsers,
    adminIssueGuardianOtp,
    adminResetUserPassword,
    adminSetUserStatus,
    adminUpdateUser,
    adminUpdateUserRole,
    getAdminUsersStreamUrl,
} from '../../services/api';
import { downloadFile } from '../../utils/download';
import { promptForSensitiveActionProof } from '../../utils/sensitiveAction';
import { showAlertDialog, showConfirmDialog, showPromptDialog } from '../../lib/appDialog';

type Scope = 'all' | 'students' | 'admins';
type PermissionState = {
    canEditExams: boolean;
    canManageStudents: boolean;
    canViewReports: boolean;
    canDeleteData: boolean;
};

type FormState = {
    full_name: string;
    username: string;
    email: string;
    password: string;
    role: string;
    status: string;
    phone_number: string;
    roll_number: string;
    registration_id: string;
    institution_name: string;
    permissions: PermissionState;
};

const emptyPermissions: PermissionState = {
    canEditExams: false,
    canManageStudents: false,
    canViewReports: false,
    canDeleteData: false,
};

const emptyForm = (role = 'student'): FormState => ({
    full_name: '',
    username: '',
    email: '',
    password: '',
    role,
    status: 'active',
    phone_number: '',
    roll_number: '',
    registration_id: '',
    institution_name: '',
    permissions: {
        ...emptyPermissions,
        canManageStudents: role !== 'student',
        canEditExams: role !== 'student',
        canViewReports: role !== 'student',
    },
});

function exportCsv(filename: string, rows: Record<string, unknown>[]) {
    if (!rows.length) return;
    const headers = Object.keys(rows[0]);
    const lines = [headers.join(',')];
    for (const row of rows) {
        lines.push(headers.map((h) => `"${String(row[h] ?? '').replace(/"/g, '""')}"`).join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}

export default function UsersPanel() {
    const [scope, setScope] = useState<Scope>('admins');
    const [users, setUsers] = useState<ApiUser[]>([]);
    const [summary, setSummary] = useState({ total: 0, active: 0, suspended: 0, students: 0, admins: 0 });
    const [loading, setLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [role, setRole] = useState('');
    const [status, setStatus] = useState('');
    const [page, setPage] = useState(1);
    const [pages, setPages] = useState(1);
    const [selected, setSelected] = useState<string[]>([]);
    const [liveConnected, setLiveConnected] = useState(false);

    const [form, setForm] = useState<FormState>(emptyForm());
    const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
    const [formId, setFormId] = useState<string>('');
    const [formOpen, setFormOpen] = useState(false);

    const [detailsOpen, setDetailsOpen] = useState(false);
    const [details, setDetails] = useState<unknown>(null);

    const fetchUsers = useCallback(async () => {
        setLoading(true);
        try {
            const res = await adminGetUsers({ page, limit: 20, search, role, status, scope });
            setUsers(res.data.users || []);
            setSummary(res.data.summary || { total: 0, active: 0, suspended: 0, students: 0, admins: 0 });
            setPages(Math.max(1, Number(res.data.pages || 1)));
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Failed to load users');
        } finally {
            setLoading(false);
        }
    }, [page, role, scope, search, status]);

    useEffect(() => {
        const t = setTimeout(() => {
            void fetchUsers();
        }, 250);
        return () => clearTimeout(t);
    }, [fetchUsers]);

    useEffect(() => {
        let cancelled = false;
        let eventSource: EventSource | null = null;
        let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
        let backoffMs = 1000;

        const connect = () => {
            if (cancelled) return;
            const streamUrl = getAdminUsersStreamUrl();
            eventSource = new EventSource(streamUrl, { withCredentials: true });

            eventSource.onopen = () => {
                setLiveConnected(true);
                backoffMs = 1000;
            };
            eventSource.addEventListener('user-event', (event) => {
                setLiveConnected(true);
                try {
                    const payload = JSON.parse((event as MessageEvent).data) as AdminUserStreamEvent;
                    if (payload?.type) void fetchUsers();
                } catch {
                    void fetchUsers();
                }
            });
            eventSource.onerror = () => {
                setLiveConnected(false);
                eventSource?.close();
                if (cancelled) return;
                reconnectTimer = setTimeout(connect, backoffMs);
                backoffMs = Math.min(backoffMs * 2, 30000);
            };
        };

        connect();

        return () => {
            cancelled = true;
            eventSource?.close();
            if (reconnectTimer) clearTimeout(reconnectTimer);
            setLiveConnected(false);
        };
    }, [fetchUsers]);

    const openCreate = (nextRole: string) => {
        setFormMode('create');
        setFormId('');
        setForm(emptyForm(nextRole));
        setFormOpen(true);
    };

    const openEdit = (u: ApiUser) => {
        setFormMode('edit');
        setFormId(u._id);
        setForm({
            full_name: u.fullName || '',
            username: u.username || '',
            email: u.email || '',
            password: '',
            role: u.role || 'student',
            status: u.status || 'active',
            phone_number: u.phone_number || '',
            roll_number: u.roll_number || '',
            registration_id: u.registration_id || '',
            institution_name: u.institution_name || '',
            permissions: {
                ...emptyPermissions,
                ...(u.permissions || {}),
            },
        });
        setFormOpen(true);
    };

    const saveUser = async () => {
        try {
            if (formMode === 'create') await adminCreateUser(form);
            else await adminUpdateUser(formId, form);
            setFormOpen(false);
            toast.success('Saved');
            await fetchUsers();
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Save failed');
        }
    };

    const doBulk = async (action: string) => {
        if (!selected.length) return toast.error('Select users first');
        try {
            await adminBulkUserAction({ userIds: selected, action });
            setSelected([]);
            toast.success('Bulk action done');
            await fetchUsers();
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Bulk action failed');
        }
    };

    const importFile = async (file: File) => {
        const formData = new FormData();
        formData.append('file', file);
        try {
            const res = await adminBulkImportStudents(formData);
            toast.success(res.data.message || 'Imported');
            if (Array.isArray(res.data.generatedCredentials) && res.data.generatedCredentials.length > 0) {
                exportCsv('generated-credentials.csv', res.data.generatedCredentials);
            }
            await fetchUsers();
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Import failed');
        }
    };

    const updateUserRole = async (id: string, nextRole: string) => {
        try {
            const proof = await promptForSensitiveActionProof({
                actionLabel: `change user role to ${nextRole}`,
                defaultReason: `Update user role to ${nextRole}`,
                requireOtpHint: true,
            });
            if (!proof) return;
            await adminUpdateUserRole(id, nextRole, proof);
            toast.success('Role updated');
            await fetchUsers();
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Role update failed');
        }
    };

    const resetUserPassword = async (user: ApiUser) => {
        try {
            const proof = await promptForSensitiveActionProof({
                actionLabel: `reset password for ${user.email || user.username || 'user'}`,
                defaultReason: `Reset password for ${user.email || user.username || user._id}`,
                requireOtpHint: true,
            });
            if (!proof) return;
            const response = await adminResetUserPassword(user._id, proof);
            toast.success(
                response.data?.message ||
                (response.data?.inviteSent ? 'Password reset link sent' : 'Password reset prepared'),
            );
            await fetchUsers();
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Password reset failed');
        }
    };

    const updateUserStatus = async (id: string, nextStatus: string) => {
        try {
            await adminSetUserStatus(id, nextStatus);
            toast.success('Status updated');
            await fetchUsers();
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Status update failed');
        }
    };

    const issueGuardianVerificationOtp = async (studentId: string) => {
        try {
            const res = await adminIssueGuardianOtp(studentId);
            const otp = String(res.data?.otp || '');
            const expiresAt = String(res.data?.expiresAt || '');
            if (otp) {
                await showAlertDialog({
                    title: 'Guardian OTP issued',
                    message: `Guardian OTP: ${otp}`,
                    description: expiresAt ? `Expires: ${expiresAt}` : undefined,
                    confirmLabel: 'Close',
                });
            } else {
                toast.success('Guardian OTP issued');
            }
            const refreshed = await adminGetUserById(studentId);
            setDetails(refreshed.data);
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'Failed to issue OTP');
        }
    };

    const confirmGuardianVerificationOtp = async (studentId: string) => {
        const code = await showPromptDialog({
            title: 'Confirm guardian OTP',
            message: 'Enter the guardian OTP code to verify the phone number.',
            inputLabel: 'Guardian OTP code',
            confirmLabel: 'Verify OTP',
            cancelLabel: 'Cancel',
            maxLength: 12,
        });
        if (!code) return;
        try {
            await adminConfirmGuardianOtp(studentId, code.trim());
            toast.success('Guardian phone verified');
            const refreshed = await adminGetUserById(studentId);
            setDetails(refreshed.data);
            await fetchUsers();
        } catch (error: any) {
            toast.error(error.response?.data?.message || 'OTP confirmation failed');
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap gap-2 justify-between">
                <div>
                    <h2 className="text-xl font-bold text-white">Users & Roles</h2>
                    <p className="text-xs text-slate-500 mt-1">Admin / Moderator / Staff accounts only</p>
                    <p className={`text-xs mt-1 ${liveConnected ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {liveConnected ? 'Live sync connected' : 'Live sync reconnecting'}
                    </p>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => openCreate('admin')} className="px-3 py-2 bg-cyan-600 rounded-xl text-white text-sm flex items-center gap-1"><Plus className="w-4 h-4" /> Admin</button>
                    <label className="px-3 py-2 bg-white/5 rounded-xl text-white text-sm flex items-center gap-1 cursor-pointer"><Upload className="w-4 h-4" /> Import
                        <input type="file" className="hidden" accept=".csv,.xlsx,.xls" onChange={(e) => { const f = e.target.files?.[0]; if (f) void importFile(f); e.target.value = ''; }} />
                    </label>
                    <button onClick={async () => { const res = await adminExportStudents({ format: 'csv' }); downloadFile(res, { filename: 'students.csv' }); }} className="px-3 py-2 bg-white/5 rounded-xl text-white text-sm flex items-center gap-1"><Download className="w-4 h-4" /> Export</button>
                    <button onClick={() => void fetchUsers()} className="px-3 py-2 bg-white/5 rounded-xl text-white text-sm"><RefreshCw className="w-4 h-4" /></button>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2 md:grid-cols-5">
                <div className="bg-slate-900/65 p-3 rounded-xl text-white">Total: {summary.total}</div>
                <div className="bg-slate-900/65 p-3 rounded-xl text-emerald-400">Active: {summary.active}</div>
                <div className="bg-slate-900/65 p-3 rounded-xl text-red-400">Suspended: {summary.suspended}</div>
                <div className="bg-slate-900/65 p-3 rounded-xl text-indigo-300">Students: {summary.students}</div>
                <div className="bg-slate-900/65 p-3 rounded-xl text-cyan-300">Admins: {summary.admins}</div>
            </div>

            <div className="bg-slate-900/65 p-3 rounded-2xl space-y-3">
                <div className="flex flex-wrap gap-2">
                    {(['admins'] as Scope[]).map((s) => <button key={s} onClick={() => setScope(s)} className={`px-3 py-1 rounded ${scope === s ? 'bg-indigo-600 text-white' : 'bg-white/5 text-slate-300'}`}>{s}</button>)}
                    {selected.length > 0 && <>
                        <button onClick={() => void doBulk('activate')} className="px-2 py-1 bg-emerald-600 rounded text-white text-xs">Activate</button>
                        <button onClick={() => void doBulk('suspend')} className="px-2 py-1 bg-amber-600 rounded text-white text-xs">Suspend</button>
                        <button onClick={() => void doBulk('delete')} className="px-2 py-1 bg-red-600 rounded text-white text-xs">Delete</button>
                    </>}
                </div>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-4">
                    <div className="md:col-span-2 relative"><Search className="w-4 h-4 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name/email/username" className="w-full pl-8 pr-2 py-2 rounded bg-slate-950/65 border border-indigo-500/20 text-white text-sm min-h-[44px]" /></div>
                    <select value={role} onChange={(e) => setRole(e.target.value)} className="py-2 rounded bg-slate-950/65 border border-indigo-500/20 text-white text-sm min-h-[44px]"><option value="">All roles</option><option value="moderator">Moderator</option><option value="admin">Admin</option><option value="editor">Editor</option><option value="viewer">Viewer</option><option value="superadmin">Super Admin</option></select>
                    <select value={status} onChange={(e) => setStatus(e.target.value)} className="py-2 rounded bg-slate-950/65 border border-indigo-500/20 text-white text-sm min-h-[44px]"><option value="">All status</option><option value="active">Active</option><option value="suspended">Suspended</option><option value="blocked">Blocked</option><option value="pending">Pending</option></select>
                </div>

                <div className="overflow-x-auto -mx-3 px-3 md:mx-0 md:px-0">
                    <table className="w-full text-sm text-slate-300 min-w-[640px]">
                        <thead className="text-xs text-slate-400"><tr><th className="p-2"><input type="checkbox" checked={users.length > 0 && selected.length === users.length} onChange={() => setSelected(selected.length === users.length ? [] : users.map((u) => u._id))} /></th><th className="p-2 text-left">User</th><th className="p-2 text-left">Role</th><th className="p-2 text-left">Status</th><th className="p-2 text-left">Institution/Roll</th><th className="p-2 text-right">Actions</th></tr></thead>
                        <tbody>{loading ? <tr><td colSpan={6} className="p-6 text-center">Loading...</td></tr> : users.map((u) => (
                            <tr key={u._id} className="border-t border-indigo-500/10">
                                <td className="p-2"><input type="checkbox" checked={selected.includes(u._id)} onChange={() => setSelected((prev) => prev.includes(u._id) ? prev.filter((id) => id !== u._id) : [...prev, u._id])} /></td>
                                <td className="p-2"><p className="text-white">{u.fullName || u.username}</p><p className="text-xs text-slate-500">{u.email}</p></td>
                                <td className="p-2"><select value={u.role} onChange={(e) => void updateUserRole(u._id, e.target.value)} className="bg-transparent border border-indigo-500/20 rounded px-2 py-1 text-xs"><option value="moderator">moderator</option><option value="admin">admin</option><option value="editor">editor</option><option value="viewer">viewer</option><option value="superadmin">superadmin</option></select></td>
                                <td className="p-2"><select value={u.status || 'active'} onChange={(e) => void updateUserStatus(u._id, e.target.value)} className="bg-transparent border border-indigo-500/20 rounded px-2 py-1 text-xs"><option value="active">active</option><option value="suspended">suspended</option><option value="blocked">blocked</option><option value="pending">pending</option></select></td>
                                <td className="p-2 text-xs">{u.institution_name || '-'}<br />{u.roll_number || u.registration_id || '-'}</td>
                                <td className="p-2"><div className="flex justify-end gap-1"><button onClick={async () => { const r = await adminGetUserById(u._id); setDetails(r.data); setDetailsOpen(true); }} className="p-2.5 hover:bg-white/10 rounded min-h-[44px] min-w-[44px] inline-flex items-center justify-center"><Eye className="w-4 h-4 text-cyan-300" /></button><button onClick={() => openEdit(u)} className="p-2.5 hover:bg-white/10 rounded min-h-[44px] min-w-[44px] inline-flex items-center justify-center"><Plus className="w-4 h-4 text-indigo-300" /></button><button onClick={() => void resetUserPassword(u)} className="p-2.5 hover:bg-white/10 rounded min-h-[44px] min-w-[44px] inline-flex items-center justify-center" title="Send password reset link"><KeyRound className="w-4 h-4 text-amber-300" /></button><button onClick={async () => { const confirmed = await showConfirmDialog({ title: 'Delete user?', message: 'This user record will be removed from admin management.', confirmLabel: 'Delete user', cancelLabel: 'Keep user', tone: 'danger' }); if (!confirmed) return; await adminDeleteUser(u._id); await fetchUsers(); }} className="p-2.5 hover:bg-red-500/20 rounded min-h-[44px] min-w-[44px] inline-flex items-center justify-center"><Trash2 className="w-4 h-4 text-red-300" /></button></div></td>
                            </tr>
                        ))}</tbody>
                    </table>
                </div>
                <div className="flex justify-between text-xs text-slate-500"><span>Page {page}/{pages}</span><div className="flex gap-2"><button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="px-3 py-2 bg-white/5 rounded disabled:opacity-40 min-h-[44px]">Prev</button><button disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="px-3 py-2 bg-white/5 rounded disabled:opacity-40 min-h-[44px]">Next</button></div></div>
            </div>

            {formOpen && <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setFormOpen(false)}><div className="w-full max-w-2xl bg-slate-900/65 rounded-2xl border border-indigo-500/20 p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
                <h3 className="text-white font-bold">{formMode === 'create' ? 'Add User' : 'Edit User'}</h3>
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    <input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="full name" className="bg-slate-950/65 border border-indigo-500/20 rounded px-3 py-2 text-white min-h-[44px]" />
                    <input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} placeholder="username" className="bg-slate-950/65 border border-indigo-500/20 rounded px-3 py-2 text-white min-h-[44px]" />
                    <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="email" className="bg-slate-950/65 border border-indigo-500/20 rounded px-3 py-2 text-white min-h-[44px]" />
                    <input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="password (optional)" className="bg-slate-950/65 border border-indigo-500/20 rounded px-3 py-2 text-white min-h-[44px]" />
                    <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} className="bg-slate-950/65 border border-indigo-500/20 rounded px-3 py-2 text-white min-h-[44px]">
                        <option value="moderator">moderator</option>
                        <option value="admin">admin</option>
                        <option value="editor">editor</option>
                        <option value="viewer">viewer</option>
                        <option value="superadmin">superadmin</option>
                    </select>
                    <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="bg-slate-950/65 border border-indigo-500/20 rounded px-3 py-2 text-white min-h-[44px]">
                        <option value="active">active</option>
                        <option value="suspended">suspended</option>
                        <option value="blocked">blocked</option>
                        <option value="pending">pending</option>
                    </select>
                    <input value={form.phone_number} onChange={(e) => setForm({ ...form, phone_number: e.target.value })} placeholder="phone number" className="bg-slate-950/65 border border-indigo-500/20 rounded px-3 py-2 text-white min-h-[44px]" />
                    <input value={form.roll_number} onChange={(e) => setForm({ ...form, roll_number: e.target.value })} placeholder="roll number" className="bg-slate-950/65 border border-indigo-500/20 rounded px-3 py-2 text-white min-h-[44px]" />
                    <input value={form.registration_id} onChange={(e) => setForm({ ...form, registration_id: e.target.value })} placeholder="registration id" className="bg-slate-950/65 border border-indigo-500/20 rounded px-3 py-2 text-white min-h-[44px]" />
                    <input value={form.institution_name} onChange={(e) => setForm({ ...form, institution_name: e.target.value })} placeholder="institution name" className="bg-slate-950/65 border border-indigo-500/20 rounded px-3 py-2 text-white min-h-[44px]" />
                </div>
                <div className="rounded-xl border border-indigo-500/20 p-3 bg-slate-950/65">
                    <p className="text-xs text-slate-400 mb-2">Role Permission Toggles</p>
                    <div className="grid grid-cols-1 gap-2 text-sm text-slate-200 md:grid-cols-2">
                        <label className="flex items-center gap-2 min-h-[44px]">
                            <input type="checkbox" checked={form.permissions.canEditExams} onChange={(e) => setForm({ ...form, permissions: { ...form.permissions, canEditExams: e.target.checked } })} />
                            Can Edit Exams
                        </label>
                        <label className="flex items-center gap-2">
                            <input type="checkbox" checked={form.permissions.canManageStudents} onChange={(e) => setForm({ ...form, permissions: { ...form.permissions, canManageStudents: e.target.checked } })} />
                            Can Manage Students
                        </label>
                        <label className="flex items-center gap-2">
                            <input type="checkbox" checked={form.permissions.canViewReports} onChange={(e) => setForm({ ...form, permissions: { ...form.permissions, canViewReports: e.target.checked } })} />
                            Can View Reports
                        </label>
                        <label className="flex items-center gap-2">
                            <input type="checkbox" checked={form.permissions.canDeleteData} onChange={(e) => setForm({ ...form, permissions: { ...form.permissions, canDeleteData: e.target.checked } })} />
                            Can Delete Data
                        </label>
                    </div>
                </div>
                <div className="flex justify-end gap-2"><button onClick={() => setFormOpen(false)} className="px-3 py-2 text-slate-300">Cancel</button><button onClick={() => void saveUser()} className="px-3 py-2 bg-indigo-600 rounded text-white">Save</button></div>
            </div></div>}

            {detailsOpen && <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setDetailsOpen(false)}><div className="w-full max-w-3xl bg-slate-900/65 rounded-2xl border border-indigo-500/20 p-4 space-y-3 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <h3 className="text-white font-bold">User Details</h3>
                {(() => {
                    const data = details as any;
                    const userId = data?.user?._id;
                    const isStudent = data?.user?.role === 'student';
                    const verification = data?.profile?.guardianPhoneVerificationStatus || data?.profile?.guardian_phone_verification_status || 'unverified';
                    const completion = Number(data?.profile?.profile_completion_percentage || 0);
                    return isStudent && userId ? (
                        <div className="rounded-xl border border-indigo-500/20 bg-slate-950/65 p-3">
                            <p className="text-sm text-white font-medium flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-emerald-300" /> Guardian Verification</p>
                            <p className="text-xs text-slate-400 mt-1">Status: <span className="capitalize text-slate-200">{verification}</span></p>
                            <p className="text-xs text-slate-400 mt-1">Profile Completion: <span className={`${completion >= 60 ? 'text-emerald-300' : 'text-amber-300'}`}>{completion}% {completion >= 60 ? '(Exam Eligible)' : '(Gate Locked)'}</span></p>
                            <div className="mt-2 flex gap-2">
                                <button onClick={() => void issueGuardianVerificationOtp(userId)} className="px-3 py-1.5 rounded-lg bg-cyan-500/20 text-cyan-200 text-xs">Issue OTP</button>
                                <button onClick={() => void confirmGuardianVerificationOtp(userId)} className="px-3 py-1.5 rounded-lg bg-emerald-500/20 text-emerald-200 text-xs">Confirm OTP</button>
                            </div>
                        </div>
                    ) : null;
                })()}
                <pre className="text-xs text-slate-300 bg-slate-950/65 rounded-xl p-3 overflow-x-auto">{JSON.stringify(details, null, 2)}</pre>
            </div></div>}
        </div>
    );
}
