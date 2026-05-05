import React, { useState } from 'react';
import { CreditCard, Loader2, QrCode, Shield, ShieldCheck, Smartphone, KeyRound } from 'lucide-react';
import toast from 'react-hot-toast';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '../../hooks/useAuth';
import {
    beginTotpSetup,
    confirmTotpSetup,
    regenerateBackupCodes,
    disableTwoFactor,
} from '../../services/api';
import { showConfirmDialog } from '../../lib/appDialog';

const AdminAuthenticatorSetup: React.FC = () => {
    const { user, refreshUser } = useAuth();
    
    const [setupLoading, setSetupLoading] = useState(false);
    const [verifyingSetup, setVerifyingSetup] = useState(false);
    const [backupLoading, setBackupLoading] = useState(false);
    const [disableLoading, setDisableLoading] = useState(false);
    
    const [twoFactorPassword, setTwoFactorPassword] = useState('');
    const [setupCode, setSetupCode] = useState('');
    const [setupData, setSetupData] = useState<{ secret: string; otpAuthUrl: string; backupCodes: string[] } | null>(null);

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
            toast.success('Two-factor authentication enabled successfully!');
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
            message: 'This will remove authenticator-based login protection from your account.',
            description: 'You can enable it again later, but your account will be less secure until you do.',
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

    return (
        <div className="rounded-3xl border border-indigo-500/10 bg-slate-900/60 shadow-xl shadow-slate-950/10">
            <div className="border-b border-indigo-500/10 px-6 py-5 flex items-center justify-between">
                <div>
                    <h3 className="flex items-center gap-2 text-base font-semibold text-white">
                        <Shield className="h-5 w-5 text-indigo-400" />
                        Personal Security
                    </h3>
                    <p className="mt-1 text-sm text-slate-400">Configure your personal Two-Factor Authentication (2FA).</p>
                </div>
                {user?.twoFactorEnabled ? (
                    <div data-testid="admin-2fa-enabled-badge" className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-400 border border-emerald-500/20">
                        <ShieldCheck className="h-4 w-4" /> Enabled
                    </div>
                ) : (
                    <div data-testid="admin-2fa-disabled-badge" className="flex items-center gap-1.5 rounded-full bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-400 border border-slate-700">
                        Not Enabled
                    </div>
                )}
            </div>

            <div className="p-6">
                <div className="mb-6 rounded-2xl border border-slate-700/50 bg-slate-950/50 p-5">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500/20 text-indigo-300">
                            <Smartphone className="h-5 w-5" />
                        </div>
                        <div>
                            <h4 className="text-sm font-semibold text-slate-200">Authenticator App</h4>
                            <p className="mt-0.5 text-xs text-slate-400">
                                Use a time-based authenticator app (like Google Authenticator or Authy) to generate a verification code.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="space-y-4 max-w-lg">
                    {/* Password input section */}
                    <div>
                        <label className="mb-1.5 block text-xs font-medium text-slate-400">Current Password</label>
                        <div className="relative">
                            <KeyRound className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                            <input 
                                data-testid="admin-2fa-current-password"
                                className="w-full pl-10 rounded-xl border border-indigo-500/10 bg-slate-950/70 py-2.5 pr-4 text-sm text-white outline-none transition focus:border-indigo-400/40 focus:ring-1 focus:ring-indigo-400/40" 
                                type="password" 
                                placeholder="Verify your password to proceed" 
                                value={twoFactorPassword} 
                                onChange={(e) => setTwoFactorPassword(e.target.value)} 
                                disabled={setupLoading || verifyingSetup || disableLoading || backupLoading}
                            />
                        </div>
                    </div>

                    {/* Actions if not enabled */}
                    {!user?.twoFactorEnabled ? (
                        <button 
                            data-testid="admin-2fa-start"
                            onClick={startAuthenticatorSetup} 
                            disabled={setupLoading || !twoFactorPassword} 
                            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-indigo-500/20"
                        >
                            {setupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <QrCode className="h-4 w-4" />}
                            {setupLoading ? 'Preparing...' : 'Set up Authenticator'}
                        </button>
                    ) : (
                        /* Actions if already enabled */
                        <div className="grid gap-3 sm:grid-cols-2">
                            <button 
                                data-testid="admin-2fa-backup-codes"
                                onClick={regenerateCodes} 
                                disabled={backupLoading || !twoFactorPassword} 
                                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {backupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
                                {backupLoading ? 'Refreshing...' : 'Get Backup Codes'}
                            </button>
                            <button 
                                data-testid="admin-2fa-disable"
                                onClick={disableAuthenticator} 
                                disabled={disableLoading || !twoFactorPassword} 
                                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2.5 text-sm font-semibold text-rose-400 transition hover:bg-rose-500/20 focus:border-rose-500/50 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {disableLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Shield className="h-4 w-4" />}
                                {disableLoading ? 'Disabling...' : 'Disable 2FA'}
                            </button>
                        </div>
                    )}
                </div>

                {/* Setup Modal / Content (after clicking Setup or Get Backup Codes) */}
                {setupData && (
                    <div className="mt-8 overflow-hidden rounded-2xl border border-indigo-500/20 bg-slate-950/40">
                        <div className="bg-indigo-500/10 px-4 py-3 border-b border-indigo-500/20">
                            <h4 className="font-semibold text-indigo-300 text-sm">
                                {!user?.twoFactorEnabled ? 'Step 2: Scan QR Code & Verify' : 'Your Backup Codes'}
                            </h4>
                        </div>
                        
                        <div className="p-5 flex flex-col md:flex-row gap-6">
                            {/* QR Code Section only if we are setting it up */
                            !user?.twoFactorEnabled && setupData.otpAuthUrl && (
                                <div className="flex flex-col items-center justify-center space-y-3 p-4 rounded-xl bg-white/5 border border-white/10 shrink-0 md:w-48">
                                    <div className="rounded-xl overflow-hidden p-2.5 bg-white shrink-0">
                                        <QRCodeSVG value={setupData.otpAuthUrl} size={200} level="M" includeMargin />
                                    </div>
                                    <p className="text-[10px] text-slate-400 text-center uppercase tracking-wider font-semibold">Scan with your app</p>
                                </div>
                            )}

                            <div className="flex-1 space-y-5">
                                {!user?.twoFactorEnabled && (
                                    <div>
                                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Manual Setup Secret</p>
                                        <div className="mt-1.5 select-all rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-sm text-indigo-300">
                                            <span data-testid="admin-2fa-manual-secret">{setupData.secret}</span>
                                        </div>
                                        <p className="mt-1 text-[11px] text-slate-500">If scan fails, add this key manually and keep phone time set to automatic.</p>
                                    </div>
                                )}
                                
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Recovery Codes</p>
                                        <span className="text-[10px] text-amber-500/90 font-medium">Keep these safe!</span>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2">
                                        {setupData.backupCodes.map((code) => (
                                            <div key={code} className="select-all rounded-md bg-slate-900/80 px-2.5 py-1.5 font-mono text-[11px] text-slate-300 border border-slate-800 text-center shadow-inner">
                                                {code}
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                {!user?.twoFactorEnabled && (
                                    <div className="pt-2 border-t border-slate-700/50">
                                        <label className="mb-1.5 block text-xs font-medium text-slate-400">Step 3: Verification Code</label>
                                        <div className="flex gap-2">
                                            <input 
                                                data-testid="admin-2fa-verify-code"
                                                className="w-full flex-1 rounded-xl border border-indigo-500/10 bg-slate-950/70 px-4 py-2.5 text-sm text-white outline-none transition focus:border-indigo-400/40 shadow-inner font-mono tracking-widest" 
                                                type="text" 
                                                inputMode="numeric"
                                                placeholder="000000" 
                                                maxLength={6}
                                                value={setupCode} 
                                                onChange={(e) => setSetupCode(e.target.value.replace(/\D/g, ''))} 
                                                disabled={verifyingSetup}
                                            />
                                            <button 
                                                data-testid="admin-2fa-verify-submit"
                                                onClick={completeAuthenticatorSetup} 
                                                disabled={verifyingSetup || setupCode.length < 6} 
                                                className="whitespace-nowrap inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-indigo-500/20"
                                            >
                                                {verifyingSetup && <Loader2 className="h-4 w-4 animate-spin" />}
                                                {verifyingSetup ? 'Verifying...' : 'Verify'}
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default AdminAuthenticatorSetup;
