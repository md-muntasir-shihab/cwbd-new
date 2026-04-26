import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Loader2, ShieldCheck, RefreshCw } from 'lucide-react';
import { useRequestOtp, useVerifyOtp, useResendOtp } from '../../hooks/useOtpQueries';
import FocusTrap from '../common/FocusTrap';

interface OtpVerificationModalProps {
    open: boolean;
    contactType: 'phone' | 'email';
    contactValue: string;
    onClose: () => void;
    onVerified: () => void;
}

const OTP_LENGTH = 6;
const OTP_EXPIRY_SECONDS = 300; // 5 minutes
const RESEND_COOLDOWN_SECONDS = 60;

export default function OtpVerificationModal({
    open,
    contactType,
    contactValue,
    onClose,
    onVerified,
}: OtpVerificationModalProps) {
    const [code, setCode] = useState('');
    const [error, setError] = useState('');
    const [expiryCountdown, setExpiryCountdown] = useState(OTP_EXPIRY_SECONDS);
    const [resendCooldown, setResendCooldown] = useState(0);
    const [otpRequested, setOtpRequested] = useState(false);
    const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

    const requestOtp = useRequestOtp();
    const verifyOtp = useVerifyOtp();
    const resendOtp = useResendOtp();

    // Request OTP on mount
    useEffect(() => {
        if (open && !otpRequested) {
            requestOtp.mutate(
                { contactType, contactValue },
                {
                    onSuccess: () => {
                        setOtpRequested(true);
                        setExpiryCountdown(OTP_EXPIRY_SECONDS);
                        setResendCooldown(RESEND_COOLDOWN_SECONDS);
                    },
                    onError: (err: any) => {
                        const msg = err?.response?.data?.message || 'Failed to send OTP';
                        const cooldown = err?.response?.data?.cooldownRemaining;
                        if (cooldown) {
                            setResendCooldown(cooldown);
                        }
                        setError(msg);
                    },
                },
            );
        }
    }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

    // Expiry countdown timer
    useEffect(() => {
        if (!open || !otpRequested) return;
        if (expiryCountdown <= 0) return;
        const timer = setInterval(() => setExpiryCountdown((c) => Math.max(0, c - 1)), 1000);
        return () => clearInterval(timer);
    }, [open, otpRequested, expiryCountdown]);

    // Resend cooldown timer
    useEffect(() => {
        if (resendCooldown <= 0) return;
        const timer = setInterval(() => setResendCooldown((c) => Math.max(0, c - 1)), 1000);
        return () => clearInterval(timer);
    }, [resendCooldown]);

    // Reset state when modal closes
    useEffect(() => {
        if (!open) {
            setCode('');
            setError('');
            setOtpRequested(false);
            setExpiryCountdown(OTP_EXPIRY_SECONDS);
            setResendCooldown(0);
        }
    }, [open]);

    const handleCodeChange = useCallback(
        (index: number, value: string) => {
            if (!/^\d*$/.test(value)) return;
            const digit = value.slice(-1);
            const newCode = code.split('');
            newCode[index] = digit;
            const joined = newCode.join('').slice(0, OTP_LENGTH);
            setCode(joined);
            setError('');

            if (digit && index < OTP_LENGTH - 1) {
                inputRefs.current[index + 1]?.focus();
            }
        },
        [code],
    );

    const handleKeyDown = useCallback(
        (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
            if (e.key === 'Backspace' && !code[index] && index > 0) {
                inputRefs.current[index - 1]?.focus();
            }
        },
        [code],
    );

    const handlePaste = useCallback((e: React.ClipboardEvent) => {
        e.preventDefault();
        const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH);
        if (pasted) {
            setCode(pasted);
            setError('');
            const focusIdx = Math.min(pasted.length, OTP_LENGTH - 1);
            inputRefs.current[focusIdx]?.focus();
        }
    }, []);

    const handleVerify = () => {
        if (code.length !== OTP_LENGTH) {
            setError('Please enter the full 6-digit code');
            return;
        }
        setError('');
        verifyOtp.mutate(
            { contactType, code },
            {
                onSuccess: () => onVerified(),
                onError: (err: any) => {
                    const status = err?.response?.status;
                    const msg = err?.response?.data?.message || 'Verification failed';
                    if (status === 429) {
                        setError('Maximum attempts exceeded. Please request a new code.');
                    } else if (status === 410) {
                        setError('This code has expired. Please request a new one.');
                    } else {
                        setError(msg);
                    }
                },
            },
        );
    };

    const handleResend = () => {
        if (resendCooldown > 0) return;
        setError('');
        setCode('');
        resendOtp.mutate(
            { contactType, contactValue },
            {
                onSuccess: () => {
                    setExpiryCountdown(OTP_EXPIRY_SECONDS);
                    setResendCooldown(RESEND_COOLDOWN_SECONDS);
                },
                onError: (err: any) => {
                    const msg = err?.response?.data?.message || 'Failed to resend OTP';
                    const cooldown = err?.response?.data?.cooldownRemaining;
                    if (cooldown) setResendCooldown(cooldown);
                    setError(msg);
                },
            },
        );
    };

    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    if (!open) return null;

    const isVerifying = verifyOtp.isPending;
    const isResending = resendOtp.isPending;

    return (
        <div
            className="fixed inset-0 z-[110] flex items-center justify-center p-4"
            onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
        >
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
            <FocusTrap active={open}>
                <div
                    className="relative w-full max-w-md bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-2xl animate-in fade-in zoom-in-95 duration-200"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="otp-dialog-title"
                >
                    {/* Header */}
                    <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-700">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-indigo-50 dark:bg-indigo-500/10 rounded-xl">
                                <ShieldCheck className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                            </div>
                            <div>
                                <h3 id="otp-dialog-title" className="text-base font-bold text-slate-900 dark:text-white">Verify {contactType === 'phone' ? 'Phone Number' : 'Email'}</h3>
                                <p className="text-xs text-slate-500 mt-0.5">Code sent to {contactValue}</p>
                            </div>
                        </div>
                        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors" aria-label="Close">
                            <X className="w-4 h-4 text-slate-500" />
                        </button>
                    </div>

                    {/* Body */}
                    <div className="p-5 space-y-5">
                        {/* Expiry countdown */}
                        <div className="text-center">
                            {expiryCountdown > 0 ? (
                                <p className="text-sm text-slate-500">
                                    Code expires in <span className="font-semibold text-slate-700 dark:text-slate-300">{formatTime(expiryCountdown)}</span>
                                </p>
                            ) : (
                                <p className="text-sm text-red-500 font-medium">Code expired. Please request a new one.</p>
                            )}
                        </div>

                        {/* OTP Input */}
                        <div className="flex justify-center gap-2" onPaste={handlePaste}>
                            {Array.from({ length: OTP_LENGTH }).map((_, i) => (
                                <input
                                    key={i}
                                    ref={(el) => { inputRefs.current[i] = el; }}
                                    type="text"
                                    inputMode="numeric"
                                    maxLength={1}
                                    value={code[i] || ''}
                                    onChange={(e) => handleCodeChange(i, e.target.value)}
                                    onKeyDown={(e) => handleKeyDown(i, e)}
                                    aria-label={`Digit ${i + 1}`}
                                    className="w-11 h-12 text-center text-lg font-bold rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 dark:text-white transition-all"
                                />
                            ))}
                        </div>

                        {/* Error */}
                        {error && (
                            <p className="text-sm text-red-500 text-center font-medium">{error}</p>
                        )}

                        {/* Verify Button */}
                        <button
                            onClick={handleVerify}
                            disabled={isVerifying || code.length !== OTP_LENGTH || expiryCountdown === 0}
                            className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isVerifying ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                            Verify Code
                        </button>

                        {/* Resend */}
                        <div className="text-center">
                            {resendCooldown > 0 ? (
                                <p className="text-xs text-slate-400">
                                    Resend available in <span className="font-semibold">{resendCooldown}s</span>
                                </p>
                            ) : (
                                <button
                                    onClick={handleResend}
                                    disabled={isResending}
                                    className="text-sm text-indigo-600 dark:text-indigo-400 hover:underline font-medium inline-flex items-center gap-1.5 disabled:opacity-50"
                                >
                                    {isResending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                                    Resend Code
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </FocusTrap>
        </div>
    );
}
