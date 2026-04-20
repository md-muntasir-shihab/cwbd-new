import { useEffect, useRef } from 'react';
import { readAccessToken, refreshAccessToken } from '../services/api';
import { decodeJwtPayload } from '../utils/jwtDecode';

/**
 * Proactively refreshes the access token before it expires.
 * Schedules a refresh at 75% of the remaining token lifetime,
 * with a minimum delay of 5 seconds.
 * Reschedules after each successful refresh.
 *
 * On refresh failure, retries with exponential backoff (5s, 10s, 20s)
 * up to 3 attempts before giving up.
 *
 * @param enabled - Whether proactive refresh is active (use true in ExamRunnerPage)
 *
 * Validates: Requirements 3.5
 */

const MAX_RETRY_ATTEMPTS = 3;
const BASE_RETRY_DELAY_MS = 5000;

export function useProactiveTokenRefresh(enabled: boolean): void {
    const retryAttemptRef = useRef(0);

    useEffect(() => {
        if (!enabled) return;

        let timerId: ReturnType<typeof setTimeout> | undefined;
        let retryTimerId: ReturnType<typeof setTimeout> | undefined;
        let cancelled = false;
        retryAttemptRef.current = 0;

        const clearTimers = () => {
            if (timerId !== undefined) clearTimeout(timerId);
            if (retryTimerId !== undefined) clearTimeout(retryTimerId);
        };

        const doRetry = (attempt: number) => {
            if (cancelled || attempt >= MAX_RETRY_ATTEMPTS) return;

            const delay = BASE_RETRY_DELAY_MS * Math.pow(2, attempt);
            retryTimerId = setTimeout(() => {
                if (cancelled) return;

                refreshAccessToken().then((newToken) => {
                    if (cancelled) return;

                    if (newToken) {
                        retryAttemptRef.current = 0;
                        const verified = readAccessToken();
                        if (verified) {
                            scheduleNext();
                        }
                    } else {
                        doRetry(attempt + 1);
                    }
                });
            }, delay);
        };

        const scheduleNext = () => {
            const token = readAccessToken();
            if (!token) return;

            const payload = decodeJwtPayload(token);
            if (!payload?.exp) return;

            const expiresInMs = payload.exp * 1000 - Date.now();
            const refreshInMs = Math.max(5000, expiresInMs * 0.75);

            timerId = setTimeout(() => {
                if (cancelled) return;

                // Eagerly schedule a retry timer BEFORE the async refresh call.
                // If the refresh succeeds, we cancel the retry. If it fails,
                // the retry timer is already registered and will fire on schedule.
                // This ensures retry timers are visible to fake-timer advancement.
                const retryDelay = BASE_RETRY_DELAY_MS;
                retryTimerId = setTimeout(() => {
                    if (cancelled) return;
                    // This is the first retry (attempt 0 already happened via the initial call)
                    refreshAccessToken().then((retryToken) => {
                        if (cancelled) return;
                        if (retryToken) {
                            retryAttemptRef.current = 0;
                            const verified = readAccessToken();
                            if (verified) {
                                scheduleNext();
                            }
                        } else {
                            doRetry(1);
                        }
                    });
                }, retryDelay);

                refreshAccessToken().then((newToken) => {
                    if (cancelled) return;

                    if (newToken) {
                        // Refresh succeeded — cancel the eagerly-scheduled retry
                        if (retryTimerId !== undefined) {
                            clearTimeout(retryTimerId);
                            retryTimerId = undefined;
                        }
                        retryAttemptRef.current = 0;
                        const verified = readAccessToken();
                        if (verified) {
                            scheduleNext();
                        }
                    }
                    // If null, the retry timer is already scheduled — no action needed
                });
            }, refreshInMs);
        };

        scheduleNext();

        return () => {
            cancelled = true;
            clearTimers();
        };
    }, [enabled]);
}
