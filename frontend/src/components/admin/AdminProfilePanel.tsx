import React, { useEffect, useState } from 'react';
import { Activity, Lock, Mail, Save, Shield, User, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../../hooks/useAuth';
import { changePassword, getProfileMe, updateProfile } from '../../services/api';
import AdminImageUploadField from './AdminImageUploadField';

const formatTime = (value?: string | Date) => {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString();
};

const AdminProfilePanel: React.FC = () => {
    const { user, refreshUser } = useAuth();
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [profileData, setProfileData] = useState<any>(null);
    const [loginHistory, setLoginHistory] = useState<any[]>([]);
    const [actionHistory, setActionHistory] = useState<any[]>([]);

    const [passwordData, setPasswordData] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
    });

    useEffect(() => {
        void fetchAdminProfile();
    }, []);

    const fetchAdminProfile = async () => {
        setLoading(true);
        try {
            const res = await getProfileMe();
            setProfileData(res.data.user?.profile || null);
            setLoginHistory(res.data.loginHistory || []);
            setActionHistory(res.data.actionHistory || []);
        } catch {
            toast.error('Failed to load profile');
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        try {
            await updateProfile({
                admin_name: profileData?.admin_name || '',
                profile_photo: profileData?.profile_photo || '',
            });
            toast.success('Profile updated successfully');
            await refreshUser();
            await fetchAdminProfile();
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Failed to update profile');
        } finally {
            setSaving(false);
        }
    };

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();
        if (passwordData.newPassword !== passwordData.confirmPassword) {
            toast.error('Passwords do not match');
            return;
        }
        setSaving(true);
        try {
            await changePassword(passwordData.currentPassword, passwordData.newPassword);
            toast.success('Password changed successfully');
            setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
        } catch (err: any) {
            toast.error(err.response?.data?.message || 'Failed to change password');
        } finally {
            setSaving(false);
        }
    };

    const displayName = profileData?.admin_name || user?.fullName || user?.username || 'Admin';
    const profilePhoto = String(profileData?.profile_photo || user?.profile_photo || '').trim();
    const latestLogin = loginHistory[0]?.createdAt;

    if (loading) {
        return (
            <div className="flex items-center justify-center p-12">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-6xl space-y-6 px-4 py-4 md:px-0">
            <section className="rounded-3xl border border-indigo-500/10 bg-slate-900/60 p-6 shadow-2xl shadow-slate-950/20">
                <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                        <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-3xl border border-indigo-500/15 bg-slate-950/70">
                            {profilePhoto ? (
                                <img src={profilePhoto} alt={displayName} className="h-full w-full object-cover" />
                            ) : (
                                <User className="h-10 w-10 text-indigo-300" />
                            )}
                        </div>
                        <div className="space-y-2">
                            <div>
                                <p className="text-xs uppercase tracking-[0.28em] text-slate-500">Admin Profile</p>
                                <h2 className="text-2xl font-bold text-white">{displayName}</h2>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 text-sm">
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/10 px-3 py-1 text-xs font-semibold uppercase text-indigo-200">
                                    <Shield className="h-3.5 w-3.5" />
                                    {user?.role}
                                </span>
                                <span className="text-slate-400">{user?.email}</span>
                            </div>
                        </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                        <div className="rounded-2xl border border-indigo-500/10 bg-slate-950/55 px-4 py-3">
                            <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Latest Login</p>
                            <p className="mt-2 text-sm font-medium text-white">{formatTime(latestLogin)}</p>
                        </div>
                        <div className="rounded-2xl border border-indigo-500/10 bg-slate-950/55 px-4 py-3">
                            <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Login Events</p>
                            <p className="mt-2 text-sm font-medium text-white">{loginHistory.length}</p>
                        </div>
                        <div className="rounded-2xl border border-indigo-500/10 bg-slate-950/55 px-4 py-3">
                            <p className="text-[11px] uppercase tracking-[0.22em] text-slate-500">Admin Actions</p>
                            <p className="mt-2 text-sm font-medium text-white">{actionHistory.length}</p>
                        </div>
                    </div>
                </div>
            </section>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
                <form onSubmit={handleUpdateProfile} className="rounded-3xl border border-indigo-500/10 bg-slate-900/60 shadow-xl shadow-slate-950/10">
                    <div className="border-b border-indigo-500/10 px-6 py-5">
                        <h3 className="flex items-center gap-2 text-base font-semibold text-white">
                            <User className="h-4 w-4 text-indigo-300" />
                            Basic Information
                        </h3>
                        <p className="mt-1 text-sm text-slate-400">Update your public admin identity without changing the underlying profile keys.</p>
                    </div>
                    <div className="space-y-5 p-6">
                        <div>
                            <label className="mb-1.5 block text-xs font-medium text-slate-400">Full Name</label>
                            <input
                                type="text"
                                value={profileData?.admin_name || ''}
                                onChange={(e) => setProfileData({ ...(profileData || {}), admin_name: e.target.value })}
                                className="w-full rounded-xl border border-indigo-500/10 bg-slate-950/70 px-4 py-2.5 text-sm text-white outline-none transition focus:border-indigo-400/40"
                            />
                        </div>

                        <AdminImageUploadField
                            label="Profile Photo"
                            value={profileData?.profile_photo || ''}
                            onChange={(nextValue) => setProfileData({ ...(profileData || {}), profile_photo: nextValue })}
                            helper="Uploads with the protected admin profile photo category and saves into the existing `profile_photo` value."
                            category="profile_photo"
                            previewAlt={`${displayName} profile photo`}
                            previewClassName="min-h-[190px]"
                            panelClassName="bg-slate-950/55 border-indigo-500/10"
                        />

                        <div>
                            <label className="mb-1.5 block text-xs font-medium text-slate-400">Email Address</label>
                            <div className="flex items-center gap-2 rounded-xl border border-indigo-500/10 bg-slate-950/70 px-4 py-2.5 text-sm text-slate-300">
                                <Mail className="h-4 w-4 text-indigo-300" />
                                {user?.email}
                            </div>
                        </div>

                        <div className="flex justify-end border-t border-indigo-500/10 pt-4">
                            <button
                                type="submit"
                                disabled={saving}
                                className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-indigo-600 to-cyan-600 px-6 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:opacity-95 disabled:opacity-50"
                            >
                                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                                Save Changes
                            </button>
                        </div>
                    </div>
                </form>

                <form onSubmit={handleChangePassword} className="rounded-3xl border border-indigo-500/10 bg-slate-900/60 shadow-xl shadow-slate-950/10">
                    <div className="border-b border-indigo-500/10 px-6 py-5">
                        <h3 className="flex items-center gap-2 text-base font-semibold text-white">
                            <Lock className="h-4 w-4 text-indigo-300" />
                            Security Settings
                        </h3>
                        <p className="mt-1 text-sm text-slate-400">Keep your admin password fresh and aligned with current access policy.</p>
                    </div>
                    <div className="space-y-4 p-6">
                        <div>
                            <label className="mb-1.5 block text-xs font-medium text-slate-400">Current Password</label>
                            <input
                                type="password"
                                value={passwordData.currentPassword}
                                onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                                className="w-full rounded-xl border border-indigo-500/10 bg-slate-950/70 px-4 py-2.5 text-sm text-white outline-none transition focus:border-indigo-400/40"
                            />
                        </div>
                        <div className="grid gap-4 md:grid-cols-2">
                            <div>
                                <label className="mb-1.5 block text-xs font-medium text-slate-400">New Password</label>
                                <input
                                    type="password"
                                    value={passwordData.newPassword}
                                    onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                                    className="w-full rounded-xl border border-indigo-500/10 bg-slate-950/70 px-4 py-2.5 text-sm text-white outline-none transition focus:border-indigo-400/40"
                                />
                            </div>
                            <div>
                                <label className="mb-1.5 block text-xs font-medium text-slate-400">Confirm Password</label>
                                <input
                                    type="password"
                                    value={passwordData.confirmPassword}
                                    onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                                    className="w-full rounded-xl border border-indigo-500/10 bg-slate-950/70 px-4 py-2.5 text-sm text-white outline-none transition focus:border-indigo-400/40"
                                />
                            </div>
                        </div>
                        <div className="rounded-2xl border border-amber-500/10 bg-amber-500/5 px-4 py-3 text-xs text-amber-100/85">
                            Password change applies immediately after successful save and preserves existing role permissions.
                        </div>
                        <div className="flex justify-end border-t border-indigo-500/10 pt-4">
                            <button
                                type="submit"
                                disabled={saving}
                                className="inline-flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-950/75 px-6 py-2.5 text-sm font-semibold text-white transition hover:border-indigo-400/30 hover:bg-slate-950 disabled:opacity-50"
                            >
                                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
                                Update Password
                            </button>
                        </div>
                    </div>
                </form>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
                <section className="overflow-hidden rounded-3xl border border-indigo-500/10 bg-slate-900/60 shadow-xl shadow-slate-950/10">
                    <div className="flex items-center gap-2 border-b border-indigo-500/10 px-6 py-4">
                        <Activity className="h-4 w-4 text-indigo-300" />
                        <h3 className="font-semibold text-white">Login Activity</h3>
                    </div>
                    <div className="max-h-80 space-y-3 overflow-y-auto p-4">
                        {loginHistory.length === 0 ? (
                            <p className="text-sm text-slate-400">No login activity found.</p>
                        ) : (
                            loginHistory.slice(0, 20).map((item, idx) => (
                                <div key={idx} className="rounded-2xl border border-indigo-500/10 bg-slate-950/55 p-4 text-sm">
                                    <p className="font-medium text-white">{item.ip_address || 'Unknown IP'} | {item.device_info || 'Unknown device'}</p>
                                    <p className="mt-1 text-xs text-slate-400">{formatTime(item.createdAt)} | {item.success ? 'success' : 'failed'} {item.suspicious ? '| suspicious' : ''}</p>
                                </div>
                            ))
                        )}
                    </div>
                </section>

                <section className="overflow-hidden rounded-3xl border border-indigo-500/10 bg-slate-900/60 shadow-xl shadow-slate-950/10">
                    <div className="flex items-center gap-2 border-b border-indigo-500/10 px-6 py-4">
                        <Shield className="h-4 w-4 text-indigo-300" />
                        <h3 className="font-semibold text-white">Admin Action History</h3>
                    </div>
                    <div className="max-h-80 space-y-3 overflow-y-auto p-4">
                        {actionHistory.length === 0 ? (
                            <p className="text-sm text-slate-400">No action history found.</p>
                        ) : (
                            actionHistory.slice(0, 20).map((item, idx) => (
                                <div key={idx} className="rounded-2xl border border-indigo-500/10 bg-slate-950/55 p-4 text-sm">
                                    <p className="font-medium text-white">{item.action || 'action'}</p>
                                    <p className="mt-1 text-xs text-slate-400">{formatTime(item.timestamp)} | target: {item.target_type || '-'} {item.target_id || ''}</p>
                                </div>
                            ))
                        )}
                    </div>
                </section>
            </div>
        </div>
    );
};

export default AdminProfilePanel;
