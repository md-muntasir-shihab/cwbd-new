// ─── useExamAntiCheat — Backend-Authoritative Anti-Cheat Signal Collector ────
// Requirements: 9.1–9.7, 10.1–10.8
// Frontend captures browser events and POSTs signals to the backend.
// All decisions (warn/lock/force_submit) come from the server.

import { useCallback, useEffect, useRef, useState } from 'react';
import api from '../services/api';

// ─── Types ───────────────────────────────────────────────────────────────────

export type AntiCheatSignalType =
    | 'tab_switch'
    | 'fullscreen_exit'
    | 'copy_attempt'
    | 'resume'
    | 'client_error'
    | 'blur'
    | 'context_menu_blocked';

export interface AntiCheatDecision {
    action: 'logged' | 'warn' | 'lock' | 'force_submit';
    warningMessage?: string;
    remainingViolations?: number;
    sessionState?: 'active' | 'locked' | 'submitted';
}

interface QueuedSignal {
    eventType: AntiCheatSignalType;
    attemptRevision: number;
    metadata?: Record<string, unknown>;
    timestamp: number;
}

export interface UseExamAntiCheatOptions {
    examId: string;
    sessionId: string;
    attemptRevision: number;
    policy: {
        enableBlurTracking?: boolean;
        enableContextMenuBlock?: boolean;
        requireFullscreen?: boolean;
        enableClipboardBlock?: boolean;
        warningCooldownSeconds?: number;
    };
    onWarn: (message: string, remaining: number) => void;
    onLock: () => void;
    onForceSubmit: () => void;
}

export type AntiCheatMode = 'full' | 'degraded';

export interface UseExamAntiCheatReturn {
    isOnline: boolean;
    queuedSignals: number;
    antiCheatMode: AntiCheatMode;
}

const MAX_QUEUE_SIZE = 50;

/**
 * Backend-authoritative anti-cheat signal collector hook.
 *
 * Captures browser events (tab switch, fullscreen exit, clipboard, blur,
 * context menu, client errors), POSTs them to the backend signal endpoint,
 * and reacts to the server's decision (warn / lock / force_submit).
 *
 * Offline signals are queued in-memory (max 50) and flushed on reconnection
 * together with a `resume` signal.
 */
export function useExamAntiCheat(options: UseExamAntiCheatOptions): UseExamAntiCheatReturn {
    const {
        examId,
        sessionId,
        attemptRevision,
        policy,
        onWarn,
        onLock,
        onForceSubmit,
    } = options;

    const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
    const [queuedSignals, setQueuedSignals] = useState<number>(0);
    const [antiCheatMode, setAntiCheatMode] = useState<AntiCheatMode>('full');

    // Refs to avoid stale closures in event listeners
    const queueRef = useRef<QueuedSignal[]>([]);
    const warningCooldownMapRef = useRef<Map<string, number>>(new Map());
    const onWarnRef = useRef(onWarn);
    const onLockRef = useRef(onLock);
    const onForceSubmitRef = useRef(onForceSubmit);
    const attemptRevisionRef = useRef(attemptRevision);
    const policyRef = useRef(policy);
    const isOnlineRef = useRef(navigator.onLine);
    const flushingRef = useRef(false);

    // Keep refs in sync
    useEffect(() => { onWarnRef.current = onWarn; }, [onWarn]);
    useEffect(() => { onLockRef.current = onLock; }, [onLock]);
    useEffect(() => { onForceSubmitRef.current = onForceSubmit; }, [onForceSubmit]);
    useEffect(() => { attemptRevisionRef.current = attemptRevision; }, [attemptRevision]);
    useEffect(() => { policyRef.current = policy; }, [policy]);

    // ─── Signal POST helper ──────────────────────────────────────────────────

    const postSignal = useCallback(
        async (signal: QueuedSignal): Promise<AntiCheatDecision | null> => {
            try {
                const { data } = await api.post<AntiCheatDecision>(
                    `/exams/${examId}/sessions/${sessionId}/anti-cheat/signal`,
                    {
                        eventType: signal.eventType,
                        attemptRevision: signal.attemptRevision,
                        metadata: signal.metadata,
                        timestamp: signal.timestamp,
                    },
                );
                return data;
            } catch {
                return null;
            }
        },
        [examId, sessionId],
    );

    // ─── Decision handler ────────────────────────────────────────────────────

    const handleDecision = useCallback(
        (decision: AntiCheatDecision, signalType: AntiCheatSignalType) => {
            const cooldownSeconds = policyRef.current.warningCooldownSeconds ?? 30;

            if (decision.action === 'warn') {
                const now = Date.now();
                const lastShown = warningCooldownMapRef.current.get(signalType) ?? 0;
                if (now - lastShown >= cooldownSeconds * 1000) {
                    warningCooldownMapRef.current.set(signalType, now);
                    onWarnRef.current(
                        decision.warningMessage ?? 'Warning: suspicious activity detected.',
                        decision.remainingViolations ?? 0,
                    );
                }
            } else if (decision.action === 'lock') {
                onLockRef.current();
            } else if (decision.action === 'force_submit') {
                onForceSubmitRef.current();
            }
            // 'logged' — no UI action needed
        },
        [],
    );

    // ─── Send or queue a signal ──────────────────────────────────────────────

    const sendSignal = useCallback(
        async (eventType: AntiCheatSignalType, metadata?: Record<string, unknown>) => {
            const signal: QueuedSignal = {
                eventType,
                attemptRevision: attemptRevisionRef.current,
                metadata,
                timestamp: Date.now(),
            };

            if (!isOnlineRef.current) {
                // Queue for later
                if (queueRef.current.length >= MAX_QUEUE_SIZE) {
                    queueRef.current.shift(); // drop oldest
                }
                queueRef.current.push(signal);
                setQueuedSignals(queueRef.current.length);
                return;
            }

            const decision = await postSignal(signal);
            if (decision) {
                handleDecision(decision, eventType);
            } else {
                // Network failure — queue it
                if (queueRef.current.length >= MAX_QUEUE_SIZE) {
                    queueRef.current.shift();
                }
                queueRef.current.push(signal);
                setQueuedSignals(queueRef.current.length);
            }
        },
        [postSignal, handleDecision],
    );

    // ─── Flush offline queue ─────────────────────────────────────────────────

    const flushQueue = useCallback(async () => {
        if (flushingRef.current) return;
        flushingRef.current = true;

        try {
            // Send resume signal first
            await postSignal({
                eventType: 'resume',
                attemptRevision: attemptRevisionRef.current,
                timestamp: Date.now(),
            });

            // Flush queued signals
            const pending = [...queueRef.current];
            queueRef.current = [];
            setQueuedSignals(0);

            for (const signal of pending) {
                const decision = await postSignal(signal);
                if (decision) {
                    handleDecision(decision, signal.eventType);
                }
            }
        } finally {
            flushingRef.current = false;
        }
    }, [postSignal, handleDecision]);

    // ─── Online / Offline tracking ───────────────────────────────────────────

    useEffect(() => {
        const handleOnline = () => {
            isOnlineRef.current = true;
            setIsOnline(true);
            flushQueue();
        };
        const handleOffline = () => {
            isOnlineRef.current = false;
            setIsOnline(false);
        };

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, [flushQueue]);

    // ─── Fullscreen request on mount (if requireFullscreen) ──────────────────

    useEffect(() => {
        if (!policy.requireFullscreen) return;

        // Check if fullscreen API is supported before requesting
        const fullscreenEnabled =
            document.fullscreenEnabled ??
            (document as Document & { webkitFullscreenEnabled?: boolean }).webkitFullscreenEnabled ??
            (document as Document & { mozFullScreenEnabled?: boolean }).mozFullScreenEnabled ??
            false;

        if (!fullscreenEnabled) {
            // Graceful degradation: fullscreen not supported
            setAntiCheatMode('degraded');
            return;
        }

        const el = document.documentElement;
        const requestFs =
            el.requestFullscreen ??
            (el as HTMLElement & { webkitRequestFullscreen?: () => Promise<void> }).webkitRequestFullscreen ??
            (el as HTMLElement & { msRequestFullscreen?: () => Promise<void> }).msRequestFullscreen;

        if (typeof requestFs === 'function') {
            requestFs.call(el).catch(() => {
                // Browser may block fullscreen without user gesture — degrade gracefully
                setAntiCheatMode('degraded');
            });
        } else {
            setAntiCheatMode('degraded');
        }
    }, [policy.requireFullscreen]);

    // ─── Browser event listeners ─────────────────────────────────────────────

    useEffect(() => {
        // --- Tab switch (visibilitychange) ---
        const handleVisibilityChange = () => {
            if (document.hidden) {
                sendSignal('tab_switch', { source: 'visibilitychange' });
            }
        };

        // --- Fullscreen exit ---
        const handleFullscreenChange = () => {
            const activeEl =
                document.fullscreenElement ??
                (document as Document & { webkitFullscreenElement?: Element | null }).webkitFullscreenElement ??
                (document as Document & { msFullscreenElement?: Element | null }).msFullscreenElement;

            if (!activeEl) {
                sendSignal('fullscreen_exit', { source: 'fullscreenchange' });
            }
        };

        // --- Clipboard events (copy/cut/paste) ---
        const handleClipboard = (e: ClipboardEvent) => {
            if (policyRef.current.enableClipboardBlock) {
                e.preventDefault();
            }
            sendSignal('copy_attempt', { source: e.type });
        };

        // --- Blur tracking (policy-gated) ---
        const handleBlur = () => {
            if (policyRef.current.enableBlurTracking) {
                sendSignal('blur', { source: 'window_blur' });
            }
        };

        // --- Context menu block (policy-gated) ---
        const handleContextMenu = (e: MouseEvent) => {
            if (policyRef.current.enableContextMenuBlock) {
                e.preventDefault();
                sendSignal('context_menu_blocked', { source: 'contextmenu' });
            }
        };

        // --- Client error ---
        const handleError = (e: ErrorEvent) => {
            sendSignal('client_error', {
                message: e.message ?? 'unknown_error',
                filename: e.filename,
                lineno: e.lineno,
                colno: e.colno,
            });
        };

        // Attach listeners
        document.addEventListener('visibilitychange', handleVisibilityChange);
        document.addEventListener('fullscreenchange', handleFullscreenChange);
        document.addEventListener('webkitfullscreenchange', handleFullscreenChange as EventListener);
        document.addEventListener('copy', handleClipboard);
        document.addEventListener('cut', handleClipboard);
        document.addEventListener('paste', handleClipboard);
        window.addEventListener('blur', handleBlur);
        document.addEventListener('contextmenu', handleContextMenu);
        window.addEventListener('error', handleError);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            document.removeEventListener('fullscreenchange', handleFullscreenChange);
            document.removeEventListener('webkitfullscreenchange', handleFullscreenChange as EventListener);
            document.removeEventListener('copy', handleClipboard);
            document.removeEventListener('cut', handleClipboard);
            document.removeEventListener('paste', handleClipboard);
            window.removeEventListener('blur', handleBlur);
            document.removeEventListener('contextmenu', handleContextMenu);
            window.removeEventListener('error', handleError);
        };
    }, [sendSignal]);

    return { isOnline, queuedSignals, antiCheatMode };
}
