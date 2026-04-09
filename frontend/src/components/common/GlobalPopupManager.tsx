/**
 * GlobalPopupManager
 * ------------------
 * Fetches active popup-slot banners from the public API and displays them
 * as a beautiful glassmorphism center-screen overlay.
 *
 * Frequency capping is handled entirely client-side via localStorage so it
 * works for logged-in users AND anonymous visitors alike.
 *
 * localStorage key: "cw_popup_log"
 * Shape: { [bannerId]: { count: number; lastSeen: number (epoch ms) }[] }
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { X, ExternalLink } from 'lucide-react';

/* ── Types ── */
interface PopupBanner {
    _id: string;
    title?: string;
    subtitle?: string;
    imageUrl: string;
    linkUrl?: string;
    altText?: string;
    popupConfig?: {
        autoCloseAfterSeconds: number;
        closeButtonDelaySeconds: number;
        maxViewsPerDay: number;
        cooldownHours: number;
    };
}

/* ── Constants ── */
const LS_KEY = 'cw_popup_log';
const API_URL = '/api/v1/public/banners?slot=popup';

/* ── Helpers ── */
type PopupLog = Record<string, { timestamp: number }[]>;

function getLog(): PopupLog {
    try {
        return JSON.parse(localStorage.getItem(LS_KEY) || '{}') as PopupLog;
    } catch {
        return {};
    }
}

function saveLog(log: PopupLog) {
    try {
        localStorage.setItem(LS_KEY, JSON.stringify(log));
    } catch {
        /* storage quota exceeded – ignore */
    }
}

function recordView(bannerId: string, log: PopupLog): PopupLog {
    const views = log[bannerId] || [];
    views.push({ timestamp: Date.now() });
    return { ...log, [bannerId]: views };
}

function shouldShow(banner: PopupBanner, log: PopupLog): boolean {
    const cfg = banner.popupConfig;
    if (!cfg) return true; // no config → always show

    const maxPerDay = cfg.maxViewsPerDay;
    const cooldownMs = (cfg.cooldownHours || 0) * 60 * 60 * 1000;
    const dayMs = 24 * 60 * 60 * 1000;

    const views = log[banner._id] || [];

    // Drop views older than 24 hours for daily count
    const recentViews = views.filter((v) => Date.now() - v.timestamp < dayMs);

    if (maxPerDay > 0 && recentViews.length >= maxPerDay) return false;

    if (cooldownMs > 0 && views.length > 0) {
        const lastSeen = Math.max(...views.map((v) => v.timestamp));
        if (Date.now() - lastSeen < cooldownMs) return false;
    }

    return true;
}

/* ── Main Component ── */
export default function GlobalPopupManager() {
    const [popup, setPopup] = useState<PopupBanner | null>(null);
    const [visible, setVisible] = useState(false);
    const [closeable, setCloseable] = useState(false);
    const [countdown, setCountdown] = useState(0);
    const [autoProgress, setAutoProgress] = useState(100);
    const closeDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const autoCloseRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const dismiss = useCallback(() => {
        setVisible(false);
        // Small delay before unmounting so the fade-out animation completes
        setTimeout(() => setPopup(null), 400);
    }, []);

    useEffect(() => {
        if (!popup) return;

        const cfg = popup.popupConfig;
        const closeDelaySec = cfg?.closeButtonDelaySeconds ?? 0;
        const autoCloseSec = cfg?.autoCloseAfterSeconds ?? 0;

        // Close-button delay
        if (closeDelaySec > 0) {
            setCloseable(false);
            setCountdown(closeDelaySec);

            const tick = setInterval(() => {
                setCountdown((c) => {
                    if (c <= 1) {
                        clearInterval(tick);
                        setCloseable(true);
                        return 0;
                    }
                    return c - 1;
                });
            }, 1000);
            closeDelayRef.current = tick as unknown as ReturnType<typeof setTimeout>;
        } else {
            setCloseable(true);
        }

        // Auto-close
        if (autoCloseSec > 0) {
            setAutoProgress(100);
            const totalMs = autoCloseSec * 1000;
            const step = 100 / autoCloseSec;

            const progressTick = setInterval(() => {
                setAutoProgress((p) => Math.max(0, p - step));
            }, 1000);
            progressRef.current = progressTick;

            autoCloseRef.current = setTimeout(() => {
                clearInterval(progressTick);
                dismiss();
            }, totalMs);
        }

        return () => {
            if (closeDelayRef.current) clearInterval(closeDelayRef.current as unknown as number);
            if (autoCloseRef.current) clearTimeout(autoCloseRef.current);
            if (progressRef.current) clearInterval(progressRef.current);
        };
    }, [popup, dismiss]);

    useEffect(() => {
        let cancelled = false;

        const fetchPopup = async () => {
            // Small delay so page content loads first
            await new Promise((r) => setTimeout(r, 1200));
            if (cancelled) return;

            try {
                const res = await fetch(API_URL);
                if (!res.ok) return;
                const json = (await res.json()) as { banners?: PopupBanner[] };
                const banners = (json.banners || []).filter((b) => b.imageUrl);

                if (!banners.length) return;

                const log = getLog();
                const eligible = banners.find((b) => shouldShow(b, log));

                if (!eligible) return;

                // Record that we showed this popup
                const updated = recordView(eligible._id, log);
                saveLog(updated);

                setPopup(eligible);
                // Next tick – start visible so CSS transition fires
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => setVisible(true));
                });
            } catch {
                /* network error – silent */
            }
        };

        void fetchPopup();
        return () => { cancelled = true; };
    }, []);

    if (!popup) return null;

    const cfg = popup.popupConfig;
    const autoCloseSec = cfg?.autoCloseAfterSeconds ?? 0;

    return (
        /* Backdrop */
        <div
            className={`fixed inset-0 z-[9999] flex items-center justify-center p-4 transition-all duration-400 ${
                visible ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
            style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(6px)' }}
            onClick={(e) => {
                // Click outside card dismisses if closeable
                if (e.target === e.currentTarget && closeable) dismiss();
            }}
        >
            {/* Card */}
            <div
                className={`relative w-full max-w-lg rounded-2xl overflow-hidden shadow-2xl transition-all duration-400 ${
                    visible ? 'scale-100 translate-y-0' : 'scale-95 translate-y-4'
                }`}
                style={{
                    background: 'rgba(15, 15, 30, 0.88)',
                    border: '1px solid rgba(99, 102, 241, 0.25)',
                    backdropFilter: 'blur(20px)',
                    boxShadow: '0 25px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(99,102,241,0.1), inset 0 1px 0 rgba(255,255,255,0.05)',
                }}
            >
                {/* Auto-close progress bar at top */}
                {autoCloseSec > 0 && (
                    <div className="absolute top-0 left-0 right-0 h-0.5 bg-white/10">
                        <div
                            className="h-full bg-gradient-to-r from-[var(--primary)] to-[var(--accent)] transition-all duration-1000 ease-linear"
                            style={{ width: `${autoProgress}%` }}
                        />
                    </div>
                )}

                {/* Close / Countdown button */}
                <div className="absolute top-3 right-3 z-10">
                    {closeable ? (
                        <button
                            onClick={dismiss}
                            aria-label="Close popup"
                            className="flex items-center justify-center w-8 h-8 rounded-full text-white/80 hover:text-white transition-all hover:scale-110 active:scale-95"
                            style={{
                                background: 'rgba(255,255,255,0.12)',
                                backdropFilter: 'blur(6px)',
                                border: '1px solid rgba(255,255,255,0.15)',
                            }}
                        >
                            <X className="w-4 h-4" />
                        </button>
                    ) : (
                        <div
                            className="flex items-center justify-center w-8 h-8 rounded-full text-white/50 text-xs font-bold select-none"
                            title={`Close available in ${countdown}s`}
                            style={{
                                background: 'rgba(255,255,255,0.07)',
                                border: '1px solid rgba(255,255,255,0.08)',
                            }}
                        >
                            {countdown}
                        </div>
                    )}
                </div>

                {/* Banner image */}
                {popup.linkUrl ? (
                    <a href={popup.linkUrl} target="_blank" rel="noopener noreferrer" className="block">
                        <img
                            src={popup.imageUrl}
                            alt={popup.altText || popup.title || 'Promotional offer'}
                            className="w-full object-cover max-h-72 hover:opacity-95 transition-opacity cursor-pointer"
                            draggable={false}
                        />
                    </a>
                ) : (
                    <img
                        src={popup.imageUrl}
                        alt={popup.altText || popup.title || 'Promotional offer'}
                        className="w-full object-cover max-h-72"
                        draggable={false}
                    />
                )}

                {/* Text + CTA (only if title / link are present) */}
                {(popup.title || popup.subtitle || popup.linkUrl) && (
                    <div className="px-5 py-4 space-y-3">
                        {popup.title && (
                            <p className="text-white font-semibold text-base leading-snug">{popup.title}</p>
                        )}
                        {popup.subtitle && (
                            <p className="text-slate-400 text-sm leading-relaxed">{popup.subtitle}</p>
                        )}
                        {popup.linkUrl && (
                            <a
                                href={popup.linkUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white transition-all hover:opacity-90 active:scale-95"
                                style={{
                                    background: 'linear-gradient(135deg, var(--primary), var(--accent))',
                                    boxShadow: '0 4px 16px rgba(99,102,241,0.3)',
                                }}
                            >
                                Learn More <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                        )}
                    </div>
                )}

                {/* Subtle shimmer on edges */}
                <div
                    className="pointer-events-none absolute inset-0 rounded-2xl"
                    style={{
                        background: 'linear-gradient(135deg, rgba(99,102,241,0.06) 0%, transparent 60%, rgba(139,92,246,0.04) 100%)',
                    }}
                />
            </div>
        </div>
    );
}
