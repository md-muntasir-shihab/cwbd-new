/**
 * Unit tests for useProactiveTokenRefresh hook
 * Tests proactive token refresh scheduling at 75% of token lifetime,
 * cleanup on unmount, rescheduling after refresh, and graceful handling
 * of missing/malformed tokens.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// ─── Hoisted mocks ───────────────────────────────────────────────────

const { mockReadAccessToken, mockRefreshAccessToken, mockDecodeJwtPayload } = vi.hoisted(() => {
    return {
        mockReadAccessToken: vi.fn(),
        mockRefreshAccessToken: vi.fn(),
        mockDecodeJwtPayload: vi.fn(),
    };
});

vi.mock('../../services/api', () => ({
    readAccessToken: (...args: any[]) => mockReadAccessToken(...args),
    refreshAccessToken: (...args: any[]) => mockRefreshAccessToken(...args),
}));

vi.mock('../../utils/jwtDecode', () => ({
    decodeJwtPayload: (...args: any[]) => mockDecodeJwtPayload(...args),
}));

// ─── Import module under test ────────────────────────────────────────

import { useProactiveTokenRefresh } from '../../hooks/useProactiveTokenRefresh';

// ─── Test Suite ──────────────────────────────────────────────────────

describe('useProactiveTokenRefresh', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('schedules refresh at 75% of token lifetime', () => {
        it('should schedule a refresh at 75% of remaining token lifetime', () => {
            // Set a fixed time so Date.now() is consistent
            vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
            const now = Date.now();
            // Token expires in 20 minutes (1200000ms)
            const expInSeconds = Math.floor((now + 1_200_000) / 1000);

            mockReadAccessToken.mockReturnValue('valid.jwt.token');
            mockDecodeJwtPayload.mockReturnValue({ exp: expInSeconds });
            mockRefreshAccessToken.mockResolvedValue('new-token');

            renderHook(() => useProactiveTokenRefresh(true));

            // 75% of 1200000ms = 900000ms
            const expectedDelay = 1_200_000 * 0.75;

            // Advance just before the scheduled time — refresh should NOT have been called
            act(() => {
                vi.advanceTimersByTime(expectedDelay - 100);
            });
            expect(mockRefreshAccessToken).not.toHaveBeenCalled();

            // Advance past the scheduled time — refresh should be called
            act(() => {
                vi.advanceTimersByTime(200);
            });
            expect(mockRefreshAccessToken).toHaveBeenCalledTimes(1);
        });

        it('should use minimum 5000ms delay when token is about to expire', () => {
            vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
            const now = Date.now();
            // Token expires in 2 seconds (very short lifetime)
            const expInSeconds = Math.floor((now + 2000) / 1000);

            mockReadAccessToken.mockReturnValue('valid.jwt.token');
            mockDecodeJwtPayload.mockReturnValue({ exp: expInSeconds });
            mockRefreshAccessToken.mockResolvedValue('new-token');

            renderHook(() => useProactiveTokenRefresh(true));

            // 75% of 2000ms = 1500ms, but minimum is 5000ms
            act(() => {
                vi.advanceTimersByTime(4999);
            });
            expect(mockRefreshAccessToken).not.toHaveBeenCalled();

            act(() => {
                vi.advanceTimersByTime(2);
            });
            expect(mockRefreshAccessToken).toHaveBeenCalledTimes(1);
        });
    });

    describe('does not schedule when enabled is false', () => {
        it('should not schedule any refresh when disabled', () => {
            const now = Date.now();
            const expInSeconds = Math.floor((now + 1_200_000) / 1000);

            mockReadAccessToken.mockReturnValue('valid.jwt.token');
            mockDecodeJwtPayload.mockReturnValue({ exp: expInSeconds });

            renderHook(() => useProactiveTokenRefresh(false));

            // Advance well past any potential schedule time
            act(() => {
                vi.advanceTimersByTime(2_000_000);
            });

            expect(mockRefreshAccessToken).not.toHaveBeenCalled();
            expect(mockReadAccessToken).not.toHaveBeenCalled();
        });
    });

    describe('cleans up timeout on unmount', () => {
        it('should clear the scheduled timeout when the hook unmounts', () => {
            const now = Date.now();
            const expInSeconds = Math.floor((now + 1_200_000) / 1000);

            mockReadAccessToken.mockReturnValue('valid.jwt.token');
            mockDecodeJwtPayload.mockReturnValue({ exp: expInSeconds });
            mockRefreshAccessToken.mockResolvedValue('new-token');

            const { unmount } = renderHook(() => useProactiveTokenRefresh(true));

            // Unmount before the timer fires
            unmount();

            // Advance past the scheduled time
            act(() => {
                vi.advanceTimersByTime(2_000_000);
            });

            // Refresh should never have been called
            expect(mockRefreshAccessToken).not.toHaveBeenCalled();
        });
    });

    describe('reschedules after successful refresh', () => {
        it('should schedule a new refresh after the first one completes', async () => {
            vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
            const now = Date.now();
            // First token: expires in 20 minutes
            const firstExp = Math.floor((now + 1_200_000) / 1000);
            // After refresh, new token: expires in 20 minutes from refresh time
            const secondExp = Math.floor((now + 1_200_000 + 900_000) / 1000);

            mockReadAccessToken.mockReturnValue('valid.jwt.token');
            mockDecodeJwtPayload
                .mockReturnValueOnce({ exp: firstExp })   // initial schedule
                .mockReturnValueOnce({ exp: secondExp }); // after refresh reschedule
            mockRefreshAccessToken.mockResolvedValue('new-token');

            renderHook(() => useProactiveTokenRefresh(true));

            // Advance to trigger first refresh (75% of 1200000 = 900000ms)
            await act(async () => {
                vi.advanceTimersByTime(900_001);
                // Allow the async refreshAccessToken to resolve
                await Promise.resolve();
            });

            expect(mockRefreshAccessToken).toHaveBeenCalledTimes(1);

            // After refresh, scheduleNext is called again — advance to trigger second refresh
            // The second token has a longer lifetime, so 75% of remaining time from that point
            const secondRemainingMs = secondExp * 1000 - (now + 900_001);
            const secondDelay = Math.max(5000, secondRemainingMs * 0.75);

            await act(async () => {
                vi.advanceTimersByTime(secondDelay + 1);
                await Promise.resolve();
            });

            expect(mockRefreshAccessToken).toHaveBeenCalledTimes(2);
        });
    });

    describe('handles missing or malformed token gracefully', () => {
        it('should not schedule when readAccessToken returns empty string', () => {
            mockReadAccessToken.mockReturnValue('');

            renderHook(() => useProactiveTokenRefresh(true));

            act(() => {
                vi.advanceTimersByTime(2_000_000);
            });

            expect(mockRefreshAccessToken).not.toHaveBeenCalled();
            expect(mockDecodeJwtPayload).not.toHaveBeenCalled();
        });

        it('should not schedule when decodeJwtPayload returns null', () => {
            mockReadAccessToken.mockReturnValue('malformed-token');
            mockDecodeJwtPayload.mockReturnValue(null);

            renderHook(() => useProactiveTokenRefresh(true));

            act(() => {
                vi.advanceTimersByTime(2_000_000);
            });

            expect(mockRefreshAccessToken).not.toHaveBeenCalled();
        });

        it('should not schedule when payload has no exp field', () => {
            mockReadAccessToken.mockReturnValue('valid.jwt.token');
            mockDecodeJwtPayload.mockReturnValue({ sub: 'user123' });

            renderHook(() => useProactiveTokenRefresh(true));

            act(() => {
                vi.advanceTimersByTime(2_000_000);
            });

            expect(mockRefreshAccessToken).not.toHaveBeenCalled();
        });
    });

    describe('retries with exponential backoff on refresh failure', () => {
        it('should retry after 5s when refreshAccessToken returns null', async () => {
            vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
            const now = Date.now();
            const expInSeconds = Math.floor((now + 1_200_000) / 1000);

            mockReadAccessToken.mockReturnValue('valid.jwt.token');
            mockDecodeJwtPayload.mockReturnValue({ exp: expInSeconds });
            // First refresh fails, second succeeds
            mockRefreshAccessToken
                .mockResolvedValueOnce(null)
                .mockResolvedValueOnce('new-token');

            renderHook(() => useProactiveTokenRefresh(true));

            // Trigger first refresh at 75% of lifetime (900000ms)
            await act(async () => {
                vi.advanceTimersByTime(900_001);
                await Promise.resolve();
            });

            expect(mockRefreshAccessToken).toHaveBeenCalledTimes(1);

            // Retry should fire after 5000ms (BASE_RETRY_DELAY * 2^0)
            await act(async () => {
                vi.advanceTimersByTime(5000);
                await Promise.resolve();
            });

            expect(mockRefreshAccessToken).toHaveBeenCalledTimes(2);
        });

        it('should use exponential backoff: 5s, 10s, 20s', async () => {
            vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
            const now = Date.now();
            const expInSeconds = Math.floor((now + 1_200_000) / 1000);

            mockReadAccessToken.mockReturnValue('valid.jwt.token');
            mockDecodeJwtPayload.mockReturnValue({ exp: expInSeconds });
            // All refreshes fail
            mockRefreshAccessToken.mockResolvedValue(null);

            renderHook(() => useProactiveTokenRefresh(true));

            // Trigger first refresh
            await act(async () => {
                vi.advanceTimersByTime(900_001);
                await Promise.resolve();
            });
            expect(mockRefreshAccessToken).toHaveBeenCalledTimes(1);

            // Retry 1: 5000ms (5s * 2^0)
            await act(async () => {
                vi.advanceTimersByTime(5000);
                await Promise.resolve();
            });
            expect(mockRefreshAccessToken).toHaveBeenCalledTimes(2);

            // Retry 2: 10000ms (5s * 2^1)
            await act(async () => {
                vi.advanceTimersByTime(10_000);
                await Promise.resolve();
            });
            expect(mockRefreshAccessToken).toHaveBeenCalledTimes(3);

            // Retry 3: 20000ms (5s * 2^2)
            await act(async () => {
                vi.advanceTimersByTime(20_000);
                await Promise.resolve();
            });
            expect(mockRefreshAccessToken).toHaveBeenCalledTimes(4);
        });

        it('should stop retrying after 3 failed attempts', async () => {
            vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
            const now = Date.now();
            const expInSeconds = Math.floor((now + 1_200_000) / 1000);

            mockReadAccessToken.mockReturnValue('valid.jwt.token');
            mockDecodeJwtPayload.mockReturnValue({ exp: expInSeconds });
            mockRefreshAccessToken.mockResolvedValue(null);

            renderHook(() => useProactiveTokenRefresh(true));

            // Trigger initial refresh
            await act(async () => {
                vi.advanceTimersByTime(900_001);
                await Promise.resolve();
            });

            // Exhaust all 3 retries
            await act(async () => {
                vi.advanceTimersByTime(5000);
                await Promise.resolve();
            });
            await act(async () => {
                vi.advanceTimersByTime(10_000);
                await Promise.resolve();
            });
            await act(async () => {
                vi.advanceTimersByTime(20_000);
                await Promise.resolve();
            });

            expect(mockRefreshAccessToken).toHaveBeenCalledTimes(4); // 1 initial + 3 retries

            // No more retries should happen even after a long time
            await act(async () => {
                vi.advanceTimersByTime(100_000);
                await Promise.resolve();
            });

            expect(mockRefreshAccessToken).toHaveBeenCalledTimes(4);
        });

        it('should resume normal scheduling after a successful retry', async () => {
            vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
            const now = Date.now();
            const firstExp = Math.floor((now + 1_200_000) / 1000);
            // After successful retry, new token expires in 20 min from retry time
            const retryTime = now + 900_001 + 5000;
            const secondExp = Math.floor((retryTime + 1_200_000) / 1000);

            // Initial scheduleNext reads token, then after retry success reads again
            mockReadAccessToken.mockReturnValue('valid.jwt.token');
            mockDecodeJwtPayload
                .mockReturnValueOnce({ exp: firstExp })   // initial schedule
                .mockReturnValueOnce({ exp: secondExp }); // after retry reschedule

            // First refresh fails, retry succeeds
            mockRefreshAccessToken
                .mockResolvedValueOnce(null)
                .mockResolvedValueOnce('new-token');

            renderHook(() => useProactiveTokenRefresh(true));

            // Trigger initial refresh (fails)
            await act(async () => {
                vi.advanceTimersByTime(900_001);
                await Promise.resolve();
            });
            expect(mockRefreshAccessToken).toHaveBeenCalledTimes(1);

            // Retry succeeds after 5s
            await act(async () => {
                vi.advanceTimersByTime(5000);
                await Promise.resolve();
            });
            expect(mockRefreshAccessToken).toHaveBeenCalledTimes(2);

            // After successful retry, scheduleNext should have been called
            // readAccessToken should have been called to verify token was set
            // and then again in scheduleNext
            expect(mockReadAccessToken).toHaveBeenCalled();
            expect(mockDecodeJwtPayload).toHaveBeenCalledTimes(2);
        });
    });

    describe('verifies token after refresh before rescheduling', () => {
        it('should re-read token via readAccessToken after successful refresh', async () => {
            vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
            const now = Date.now();
            const expInSeconds = Math.floor((now + 1_200_000) / 1000);

            mockReadAccessToken.mockReturnValue('valid.jwt.token');
            mockDecodeJwtPayload.mockReturnValue({ exp: expInSeconds });
            mockRefreshAccessToken.mockResolvedValue('new-token');

            renderHook(() => useProactiveTokenRefresh(true));

            const callCountBefore = mockReadAccessToken.mock.calls.length;

            // Trigger refresh
            await act(async () => {
                vi.advanceTimersByTime(900_001);
                await Promise.resolve();
            });

            // readAccessToken should have been called again after refresh to verify
            expect(mockReadAccessToken.mock.calls.length).toBeGreaterThan(callCountBefore);
        });

        it('should not reschedule if readAccessToken returns empty after refresh', async () => {
            vi.setSystemTime(new Date('2024-01-01T00:00:00.000Z'));
            const now = Date.now();
            const expInSeconds = Math.floor((now + 1_200_000) / 1000);

            // First call returns token (for initial schedule), after refresh returns empty
            mockReadAccessToken
                .mockReturnValueOnce('valid.jwt.token')  // initial scheduleNext
                .mockReturnValueOnce('')                  // verify after refresh
                .mockReturnValueOnce('');                 // scheduleNext re-read (if called)
            mockDecodeJwtPayload.mockReturnValue({ exp: expInSeconds });
            mockRefreshAccessToken.mockResolvedValue('new-token');

            renderHook(() => useProactiveTokenRefresh(true));

            // Trigger refresh
            await act(async () => {
                vi.advanceTimersByTime(900_001);
                await Promise.resolve();
            });

            expect(mockRefreshAccessToken).toHaveBeenCalledTimes(1);

            // No further refresh should be scheduled since token verification failed
            await act(async () => {
                vi.advanceTimersByTime(2_000_000);
                await Promise.resolve();
            });

            expect(mockRefreshAccessToken).toHaveBeenCalledTimes(1);
        });
    });
});
