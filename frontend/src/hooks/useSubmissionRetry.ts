/**
 * useSubmissionRetry — Exam submission retry with exponential backoff.
 *
 * On submission failure, saves payload to localStorage and retries with
 * exponential backoff: 1s, 2s, 4s, 8s, max 30s.
 *
 * Requirements: 2.19
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export interface SubmissionPayload {
    examId: string;
    attemptId: string;
    answers: Record<string, unknown>;
    submittedAtUTC: string;
}

export type SubmissionStatus = 'idle' | 'pending' | 'retrying' | 'success' | 'failed';

const STORAGE_PREFIX = 'exam-submission-';
const MAX_DELAY_MS = 30_000;
const BASE_DELAY_MS = 1_000;
const MAX_RETRIES = 10;

function getBackoffDelay(attempt: number): number {
    return Math.min(BASE_DELAY_MS * Math.pow(2, attempt), MAX_DELAY_MS);
}

function storageKey(attemptId: string): string {
    return `${STORAGE_PREFIX}${attemptId}`;
}

export function useSubmissionRetry(
    submitFn: (payload: SubmissionPayload) => Promise<void>,
) {
    const [status, setStatus] = useState<SubmissionStatus>('idle');
    const [retryCount, setRetryCount] = useState(0);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const cancelledRef = useRef(false);

    const clearTimer = useCallback(() => {
        if (timerRef.current) {
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    }, []);

    const saveToStorage = useCallback((payload: SubmissionPayload) => {
        try {
            localStorage.setItem(storageKey(payload.attemptId), JSON.stringify(payload));
        } catch {
            // Storage full — best effort
        }
    }, []);

    const clearFromStorage = useCallback((attemptId: string) => {
        try {
            localStorage.removeItem(storageKey(attemptId));
        } catch {
            // Ignore
        }
    }, []);

    const retrySubmission = useCallback(
        async (payload: SubmissionPayload, attempt: number) => {
            if (cancelledRef.current || attempt >= MAX_RETRIES) {
                setStatus('failed');
                return;
            }

            setStatus('retrying');
            setRetryCount(attempt);

            try {
                await submitFn(payload);
                clearFromStorage(payload.attemptId);
                setStatus('success');
            } catch {
                const delay = getBackoffDelay(attempt);
                timerRef.current = setTimeout(() => {
                    void retrySubmission(payload, attempt + 1);
                }, delay);
            }
        },
        [submitFn, clearFromStorage],
    );

    const submit = useCallback(
        async (payload: SubmissionPayload) => {
            cancelledRef.current = false;
            setStatus('pending');
            setRetryCount(0);

            try {
                await submitFn(payload);
                clearFromStorage(payload.attemptId);
                setStatus('success');
            } catch {
                saveToStorage(payload);
                setStatus('retrying');
                const delay = getBackoffDelay(0);
                timerRef.current = setTimeout(() => {
                    void retrySubmission(payload, 1);
                }, delay);
            }
        },
        [submitFn, saveToStorage, clearFromStorage, retrySubmission],
    );

    const recoverPending = useCallback(
        (attemptId: string) => {
            try {
                const raw = localStorage.getItem(storageKey(attemptId));
                if (!raw) return;
                const payload = JSON.parse(raw) as SubmissionPayload;
                void retrySubmission(payload, 0);
            } catch {
                // Corrupt data — ignore
            }
        },
        [retrySubmission],
    );

    useEffect(() => {
        return () => {
            cancelledRef.current = true;
            clearTimer();
        };
    }, [clearTimer]);

    return { status, retryCount, submit, recoverPending };
}
