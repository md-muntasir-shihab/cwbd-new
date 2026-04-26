import { useEffect, useState } from 'react';
import { SEO } from '../../components/common/SEO';
import { AlertTriangle, KeyRound, Laptop2, MailCheck, ShieldCheck, Smartphone, Trash2, Copy, CheckCircle2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { QRCodeSVG } from 'qrcode.react';
import {
    beginTotpSetup,
    changePassword,
    confirmTotpSetup,
    disableTwoFactor,
    getMySecuritySessions,
    logoutAllMySessions,
    regenerateBackupCodes,
    revokeMySecuritySession,
    type SecuritySessionItem,
} from '../../services/api';
import { useAuth } from '../../hooks/useAuth';
import { showConfirmDialog } from '../../lib/appDialog';

export default function StudentSecurity() {
    const { user, refreshUser, logout } = useAuth();
    const [sessions, setSessions] = useState<SecuritySessionItem[]>([]);
    const [loadingSessions, setLoadingSessions] = useState(true);
    const [passwordSaving, setPasswordSaving] = useState(false);
    const [setupLoading, setSetupLoading] = useState(false);
    const [verifyingSetup, setVerifyingSetup] = useState(false);
    const [backupLoading, setBackupLoading] = useState(false);
    const [disableLoading, setDisableLoading] = useState(false);
    const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
    const [twoFactorPassword, setTwoFactorPassword] = useState('');
    const [setupCode, setSetupCode] = useState('');
    const [setupData, setSetupData] = useState<{ secret: string; otpAuthUrl: string; backupCodes: string[] } | null>(null);

    const loadSessions = async () => {
        try {
            setLoadingSessions(true);
            const res = await getMySecuritySessions();
            setSessions(res.data.sessions || []);
        } catch (error: any) {
            toast.error(error?.response?.data?.message || 'Failed to load sessions');
        } finally {
            setLoadingSessions(false);
        }
    };

    useEffect(() => {
        void loadSessions();
    }, []);

    const submitPasswordChange = async () => {
        if (!passwordForm.currentPassword || !passwordForm.newPassword) {
            toast.error('Current password and new password are required');
            return;
        }
        if (passwordForm.newPassword !== passwordForm.confirmPassword) {
            toast.error('Passwords do not match');
            return;
        }
        try {
            setPasswordSaving(true);
            await changePassword(passwordForm.currentPassword, passwordForm.newPassword);
            toast.success('Password changed successfully');
            setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
            await logout();
        } catch (error: any) {
            toast.error(error?.response?.data?.message || 'Failed to change password');
        } finally {
            setPasswordSaving(false);
        }
    };

    const startAuthenticatorSetup = async () => {
        if (!twoFactorPassword) {
            toast.error('Enter your current password to start setup');
            return;
        }
        if (setupData && !user?.twoFactorEnabled) {
            const confirmed = await showConfirmDialog({
                title: 'Replace current setup secret?',
                message: 'A setup secret is already generated. Generate a new secret and invalidate the current QR code and manual key?',
                confirmLabel: 'Generate new secret',
                cancelLabel: 'Keep current secret',
                tone: 'danger',
            });
            if (!confirmed) return;
        }
        try {
            setSetupLoading(true);
            const res = await beginTotpSetup(twoFactorPassword);
            setSetupData(res.data);
            toast.success('Authenticator setup started');
        } catch (error: any) {
            toast.error(error?.response?.data?.message || 'Failed to start authenticator setup');
        } finally {
            setSetupLoading(false);
        }
    };

    const completeAuthenticatorSetup = async () => {
        if (setupCode.length !== 6) {
            toast.error('Enter a valid 6-digit code from your authenticator app');
            return;
        }
        try {
            setVerifyingSetup(true);
            await confirmTotpSetup(setupCode);
            await refreshUser();
            setSetupData(null);
            setSetupCode('');
            setTwoFactorPassword('');
            toast.success('Two-factor authentication enabled');
        } catch (error: any) {
            toast.error(error?.response?.data?.message || 'Invalid authenticator code');
        } finally {
            setVerifyingSetup(false);
        }
    };

    const regenerateCodes = async () => {
        if (!twoFactorPassword) {
            toast.error('Enter your current password to regenerate backup codes');
            return;
        }
        try {
            setBackupLoading(true);
            const res = await regenerateBackupCodes(twoFactorPassword);
            setSetupData((current) => ({
                secret: current?.secret || '',
                otpAuthUrl: current?.otpAuthUrl || '',
                backupCodes: res.data.backupCodes || [],
            }));
            toast.success('Backup codes regenerated');
        } catch (error: any) {
            toast.error(error?.response?.data?.message || 'Failed to regenerate backup codes');
        } finally {
            setBackupLoading(false);
        }
    };

    const disableAuthenticator = async () => {
        if (!twoFactorPassword) {
            toast.error('Enter your current password to disable 2FA');
            return;
        }
        const confirmed = await showConfirmDialog({
            title: 'Disable two-factor authentication?',
            message: 'This removes authenticator-based login protection from your student account.',
            description: 'You can turn it on again later, but the account will be less secure until then.',
            confirmLabel: 'Disable 2FA',
            cancelLabel: 'Keep enabled',
            tone: 'danger',
        });
        if (!confirmed) {
            return;
        }
        try {
            setDisableLoading(true);
            await disableTwoFactor(twoFactorPassword);
            await refreshUser();
            setSetupData(null);
            setTwoFactorPassword('');
            toast.success('Two-factor authentication disabled');
        } catch (error: any) {
            toast.error(error?.response?.data?.message || 'Failed to disable 2FA');
        } finally {
            setDisableLoading(false);
        }
    };

    const revokeSession = async (sessionId: string) => {
        try {
            await revokeMySecuritySession(sessionId);
            toast.success('Session revoked');
            await loadSessions();
        } catch (error: any) {
            toast.error(error?.response?.data?.message || 'Failed to revoke session');
        }
    };

    const logoutEverywhere = async () => {
        try {
            await logoutAllMySessions();
            toast.success('Logged out from all devices');
            await logout();
        } catch (error: any) {
            toast.error(error?.response?.data?.message || 'Failed to end all sessions');
        }
    };

    return (
        <div className="space-y-6">
            <SEO title="Security" description="Manage your CampusWay account security. Enable 2FA, review sessions, and change your password." />
            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Security Overview</p>
                        <h1 className="mt-2 text-2xl font-semibold text-slate-900 dark:text-white">Security Center</h1>
                        <p className="mt-1 max-w-2xl text-sm text-slate-600 dark:text-slate-400">
                            Review verification status, manage your sessions, and protect your account with an authenticator app.
                        </p>
                    </div>
                    <div className="grid gap-2 text-xs text-slate-600 dark:text-slate-400 sm:grid-cols-3">
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/40">
                            <div className="flex items-center gap-2 font-medium text-slate-800 dark:text-slate-200"><MailCheck className="h-4 w-4" /> Email</div>
                            <p className="mt-1">{user?.emailVerified ? 'Verified' : 'Verification pending'}</p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/40">
                            <div className="flex items-center gap-2 font-medium text-slate-800 dark:text-slate-200"><ShieldCheck className="h-4 w-4" /> 2FA</div>
                            <p className="mt-1">{user?.twoFactorEnabled ? `Enabled${user?.twoFactorMethod ? ` (${user.twoFactorMethod})` : ''}` : 'Not enabled'}</p>
                        </div>
                        <div className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/40">
                            <div className="flex items-center gap-2 font-medium text-slate-800 dark:text-slate-200"><Laptop2 className="h-4 w-4" /> Sessions</div>
                            <p className="mt-1">{sessions.filter((item) => item.status === 'active').length} active</p>
                        </div>
                    </div>
                </div>
            </section>

            <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                    <div className="flex items-center gap-2">
                        <KeyRound className="h-5 w-5 text-slate-700 dark:text-slate-300" />
                        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Change Password</h2>
                    </div>
                    <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">Update your password and revoke older sessions automatically.</p>
                    <div className="mt-4 grid gap-3">
                        <input className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-900/50 dark:text-white dark:placeholder-slate-500" type="password" placeholder="Current password" value={passwordForm.currentPassword} onChange={(e) => setPasswordForm((current) => ({ ...current, currentPassword: e.target.value }))} />
                        <input className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-900/50 dark:text-white dark:placeholder-slate-500" type="password" placeholder="New password" value={passwordForm.newPassword} onChange={(e) => setPasswordForm((current) => ({ ...current, newPassword: e.target.value }))} />
                        <input className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-900/50 dark:text-white dark:placeholder-slate-500" type="password" placeholder="Confirm new password" value={passwordForm.confirmPassword} onChange={(e) => setPasswordForm((current) => ({ ...current, confirmPassword: e.target.value }))} />
                        <button onClick={submitPasswordChange} disabled={passwordSaving} className="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60">
                            {passwordSaving ? 'Updating...' : 'Update password'}
                        </button>
                    </div>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                    <div className="flex items-center gap-2">
                        <Smartphone className="h-5 w-5 text-slate-700 dark:text-slate-300" />
                        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Authenticator App</h2>
                    </div>
                    <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                        Use a time-based authenticator app and keep the backup codes in a safe offline place.
                    </p>
                    <div className="mt-4 space-y-3">
                        <input className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-900/50 dark:text-white dark:placeholder-slate-500" type="password" placeholder="Current password" value={twoFactorPassword} onChange={(e) => setTwoFactorPassword(e.target.value)} />
                        {!user?.twoFactorEnabled ? (
                            <button onClick={startAuthenticatorSetup} disabled={setupLoading} className="inline-flex w-full items-center justify-center rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60">
                                {setupLoading ? 'Preparing...' : 'Start authenticator setup'}
                            </button>
                        ) : (
                            <div className="grid gap-3 sm:grid-cols-2">
                                <button onClick={regenerateCodes} disabled={backupLoading} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                                    {backupLoading ? 'Refreshing...' : 'Regenerate backup codes'}
                                </button>
                                <button onClick={disableAuthenticator} disabled={disableLoading} className="rounded-2xl border border-rose-200 px-4 py-3 text-sm font-medium text-rose-600 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-60">
                                    {disableLoading ? 'Disabling...' : 'Disable 2FA'}
                                </button>
                            </div>
                        )}
                    </div>

                    {setupData ? (
                        <div className="mt-4 rounded-3xl border border-slate-200 bg-slate-50 p-5 space-y-5 dark:border-slate-700 dark:bg-slate-800/40">
                            {/* QR Code */}
                            <div className="flex flex-col items-center gap-3">
                                <p className="text-sm font-semibold text-slate-900 dark:text-white">Scan with your Authenticator App</p>
                                <div className="rounded-2xl bg-white p-4 shadow-sm border border-slate-100 dark:bg-slate-900 dark:border-slate-700">
                                    <QRCodeSVG
                                        value={setupData.otpAuthUrl}
                                        size={180}
                                        level="M"
                                        includeMargin
                                    />
                                </div>
                                <p className="text-[11px] text-slate-400 text-center max-w-xs">
                                    Open Google Authenticator, Authy, or any TOTP app and scan this code.
                                </p>
                            </div>

                            {/* Manual secret */}
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Manual Entry Key</p>
                                <div className="flex items-center gap-2">
                                    <code className="flex-1 break-all rounded-xl bg-white px-3 py-2 font-mono text-xs text-slate-700 border border-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-700">{setupData.secret}</code>
                                    <button
                                        type="button"
                                        onClick={() => { navigator.clipboard.writeText(setupData.secret); toast.success('Secret copied!'); }}
                                        className="shrink-0 rounded-xl border border-slate-200 bg-white p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-50 transition dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800"
                                        title="Copy secret"
                                    >
                                        <Copy className="w-4 h-4" />
                                    </button>
                                </div>
                                <p className="mt-1 text-[11px] text-slate-400">If scan fails, add this key manually and keep your phone time on automatic sync.</p>
                            </div>

                            {/* Backup codes */}
                            <div>
                                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">Backup Codes</p>
                                <p className="text-[11px] text-slate-400 mb-2">Save these codes in a safe place. Each can be used once if you lose access to your authenticator.</p>
                                <div className="grid gap-1.5 sm:grid-cols-2">
                                    {setupData.backupCodes.map((code) => (
                                        <div key={code} className="rounded-xl bg-white px-3 py-2 font-mono text-xs text-slate-700 border border-slate-200 flex items-center gap-2 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-700">
                                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                                            {code}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Verify code input */}
                            {!user?.twoFactorEnabled ? (
                                <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-700">
                                    <p className="text-sm font-medium text-slate-900 dark:text-white">Verify Setup</p>
                                    <input className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-slate-400 dark:border-slate-700 dark:bg-slate-900/50 dark:text-white dark:placeholder-slate-500 text-center tracking-[0.3em] font-mono" type="text" inputMode="numeric" maxLength={6} placeholder="Enter 6-digit code" value={setupCode} onChange={(e) => setSetupCode(e.target.value.replace(/\D/g, ''))} />
                                    <button onClick={completeAuthenticatorSetup} disabled={verifyingSetup || setupCode.length < 6} className="inline-flex w-full items-center justify-center rounded-2xl bg-slate-900 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60">
                                        {verifyingSetup ? 'Verifying...' : 'Confirm & Enable 2FA'}
                                    </button>
                                </div>
                            ) : null}
                        </div>
                    ) : null}
                </div>
            </section>

            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-700 dark:bg-slate-900">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Sessions & Devices</h2>
                        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Review your active sessions and revoke anything you do not recognize.</p>
                    </div>
                    <button onClick={logoutEverywhere} className="inline-flex items-center justify-center rounded-2xl border border-rose-200 dark:border-rose-800 px-4 py-2.5 text-sm font-medium text-rose-600 dark:text-rose-400 transition hover:bg-rose-50 dark:hover:bg-rose-900/30">
                        Logout all devices
                    </button>
                </div>

                <div className="mt-4 space-y-3">
                    {loadingSessions ? (
                        <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 px-4 py-8 text-center text-sm text-slate-500">Loading sessions...</div>
                    ) : sessions.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 px-4 py-8 text-center text-sm text-slate-500">No active sessions found.</div>
                    ) : sessions.map((session) => (
                        <div key={session.sessionId} className="flex flex-col gap-3 rounded-2xl border border-slate-200 dark:border-slate-700 px-4 py-4 md:flex-row md:items-center md:justify-between">
                            <div className="min-w-0">
                                <div className="flex items-center gap-2 text-sm font-medium text-slate-900 dark:text-white">
                                    <Laptop2 className="h-4 w-4 text-slate-500" />
                                    <span className="truncate">{session.deviceInfo || 'Unknown device'}</span>
                                    {session.current ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-emerald-700">Current</span> : null}
                                </div>
                                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                                    <span>{session.ipAddress || 'Unknown IP'}</span>
                                    <span>{session.locationSummary || 'Location unavailable'}</span>
                                    <span>Last active: {session.lastActiveAt ? new Date(session.lastActiveAt).toLocaleString() : 'Unknown'}</span>
                                </div>
                                {(session.riskScore || 0) > 0 ? (
                                    <div className="mt-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-[11px] font-medium text-amber-700">
                                        <AlertTriangle className="h-3.5 w-3.5" />
                                        Risk score {session.riskScore}
                                    </div>
                                ) : null}
                            </div>
                            {!session.current ? (
                                <button onClick={() => revokeSession(session.sessionId)} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">
                                    <Trash2 className="h-4 w-4" />
                                    Revoke
                                </button>
                            ) : null}
                        </div>
                    ))}
                </div>
            </section>
        </div>
    );
}
