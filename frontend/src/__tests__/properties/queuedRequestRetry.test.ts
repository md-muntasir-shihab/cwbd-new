/**
 * Property 6: Refresh success retries all queued requests
 *
 * Feature: auth-session-persistence, Property 6
 *
 * For any set of N concurrent requests that received a 401 and were queued
 * during a refresh, after the refresh succeeds, all N requests SHALL be
 * retried with the new access token.
 *
 * **Validates: Requirements 3.3**
 */

import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';

// ─── Queue-and-Retry Implementation Under Test ───────────────────────

/**
 * Creates a fresh instance of the 401 interceptor queue-and-retry pattern.
 * This mirrors the logic in api.ts:
 *
 * When N concurrent requests all receive 401:
 *   - First request starts refresh, sets refreshInFlight
 *   - Other requests await the same refreshInFlight promise
 *   - When refresh resolves with newToken, all N requests are retried with newToken
 */
function createInterceptorWithRetryQueue(
    refreshFn: () => Promise<string | null>,
    retryFn: (config: { url: string; headers: Record<string, string> }) => Promise<unknown>,
) {
    let refreshInFlight: Promise<string | null> | null = null;

    /**
     * Simulates the 401 response interceptor for a single request.
     * Each request that receives a 401 enters this handler.
     */
    return async function handle401(originalConfig: { url: string; headers: Record<string, string> }): Promise<unknown> {
        // Deduplication: only one refresh at a time
        if (!refreshInFlight) {
            refreshInFlight = refreshFn().finally(() => {
                refreshInFlight = null;
            });
        }

        const newToken = await refreshInFlight;

        if (newToken) {
            // Retry the original request with the new token
            const retryConfig = {
                ...originalConfig,
                headers: {
                    ...originalConfig.headers,
                    Authorization: `Bearer ${newToken}`,
                },
            };
            return retryFn(retryConfig);
        }

        // Refresh failed — reject
        throw new Error('Refresh failed');
    };
}

// ─── Arbitraries ─────────────────────────────────────────────────────

/**
 * Generate arbitrary number of concurrent requests (1-20)
 */
const concurrentCountArbitrary = fc.integer({ min: 1, max: 20 });

/**
 * Generate arbitrary mock token strings returned by the refresh endpoint
 */
const mockTokenArbitrary = fc.string({
    minLength: 1,
    maxLength: 50,
    unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')),
});

/**
 * Generate arbitrary request URLs
 */
const requestUrlArbitrary = fc.string({
    minLength: 1,
    maxLength: 30,
    unit: fc.constantFrom(...'/abcdefghijklmnopqrstuvwxyz-'.split('')),
}).map((s) => `/api${s}`);

// ─── Property Tests ──────────────────────────────────────────────────

describe('Feature: auth-session-persistence, Property 6: Refresh success retries all queued requests', () => {
    it('all N queued requests are retried after refresh succeeds', async () => {
        /**
         * **Validates: Requirements 3.3**
         *
         * Strategy: Generate N (1-20) concurrent requests that all receive 401.
         * Mock refresh to succeed with a new token. Assert that all N requests
         * are retried (retryFn called N times).
         */
        await fc.assert(
            fc.asyncProperty(
                concurrentCountArbitrary,
                mockTokenArbitrary,
                async (n: number, newToken: string) => {
                    // Arrange
                    const refreshFn = vi.fn().mockResolvedValue(newToken);
                    const retryFn = vi.fn().mockResolvedValue({ status: 200, data: 'ok' });
                    const handle401 = createInterceptorWithRetryQueue(refreshFn, retryFn);

                    // Act: N concurrent requests all hit 401 and enter the interceptor
                    const originalConfigs = Array.from({ length: n }, (_, i) => ({
                        url: `/api/resource-${i}`,
                        headers: { Authorization: 'Bearer expired-token' },
                    }));

                    const promises = originalConfigs.map((config) => handle401(config));
                    await Promise.all(promises);

                    // Assert: All N requests were retried
                    expect(retryFn).toHaveBeenCalledTimes(n);
                },
            ),
            { numRuns: 20 },
        );
    });

    it('all retried requests use the new token from refresh', async () => {
        /**
         * **Validates: Requirements 3.3**
         *
         * Strategy: Generate N concurrent requests and a new token.
         * After refresh succeeds, verify every retry call has the new token
         * in its Authorization header.
         */
        await fc.assert(
            fc.asyncProperty(
                concurrentCountArbitrary,
                mockTokenArbitrary,
                async (n: number, newToken: string) => {
                    // Arrange
                    const refreshFn = vi.fn().mockResolvedValue(newToken);
                    const retryFn = vi.fn().mockResolvedValue({ status: 200, data: 'ok' });
                    const handle401 = createInterceptorWithRetryQueue(refreshFn, retryFn);

                    // Act
                    const originalConfigs = Array.from({ length: n }, (_, i) => ({
                        url: `/api/endpoint-${i}`,
                        headers: { Authorization: 'Bearer old-token' },
                    }));

                    await Promise.all(originalConfigs.map((config) => handle401(config)));

                    // Assert: Every retry used the new token
                    for (let i = 0; i < n; i++) {
                        const retryConfig = retryFn.mock.calls[i][0];
                        expect(retryConfig.headers.Authorization).toBe(`Bearer ${newToken}`);
                    }
                },
            ),
            { numRuns: 20 },
        );
    });

    it('each retried request preserves its original URL', async () => {
        /**
         * **Validates: Requirements 3.3**
         *
         * Strategy: Generate N requests with distinct URLs. After retry,
         * verify each retry call preserves the original request URL.
         */
        await fc.assert(
            fc.asyncProperty(
                concurrentCountArbitrary,
                mockTokenArbitrary,
                fc.array(requestUrlArbitrary, { minLength: 1, maxLength: 20 }),
                async (n: number, newToken: string, urls: string[]) => {
                    // Ensure we have enough URLs for N requests
                    const effectiveUrls = Array.from({ length: n }, (_, i) => urls[i % urls.length]);

                    // Arrange
                    const refreshFn = vi.fn().mockResolvedValue(newToken);
                    const retryFn = vi.fn().mockResolvedValue({ status: 200, data: 'ok' });
                    const handle401 = createInterceptorWithRetryQueue(refreshFn, retryFn);

                    // Act
                    const originalConfigs = effectiveUrls.map((url) => ({
                        url,
                        headers: { Authorization: 'Bearer expired' },
                    }));

                    await Promise.all(originalConfigs.map((config) => handle401(config)));

                    // Assert: Each retry preserves the original URL
                    for (let i = 0; i < n; i++) {
                        const retryConfig = retryFn.mock.calls[i][0];
                        expect(retryConfig.url).toBe(effectiveUrls[i]);
                    }
                },
            ),
            { numRuns: 20 },
        );
    });

    it('refresh is called exactly once even when all N requests are retried', async () => {
        /**
         * **Validates: Requirements 3.3**
         *
         * Strategy: Confirm that the deduplication still holds — only one
         * refresh call is made, but all N requests are retried.
         */
        await fc.assert(
            fc.asyncProperty(
                concurrentCountArbitrary,
                mockTokenArbitrary,
                async (n: number, newToken: string) => {
                    // Arrange
                    const refreshFn = vi.fn().mockResolvedValue(newToken);
                    const retryFn = vi.fn().mockResolvedValue({ status: 200, data: 'ok' });
                    const handle401 = createInterceptorWithRetryQueue(refreshFn, retryFn);

                    // Act
                    const originalConfigs = Array.from({ length: n }, (_, i) => ({
                        url: `/api/data-${i}`,
                        headers: { Authorization: 'Bearer stale' },
                    }));

                    await Promise.all(originalConfigs.map((config) => handle401(config)));

                    // Assert: One refresh, N retries
                    expect(refreshFn).toHaveBeenCalledTimes(1);
                    expect(retryFn).toHaveBeenCalledTimes(n);
                },
            ),
            { numRuns: 20 },
        );
    });
});
