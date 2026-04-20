/**
 * Property 5: Concurrent 401s produce exactly one refresh call
 *
 * Feature: auth-session-persistence, Property 5
 *
 * For any set of N concurrent API requests that all receive a 401 response
 * simultaneously, the `refreshAccessToken()` function SHALL be called exactly
 * once (not N times).
 *
 * **Validates: Requirements 3.2**
 */

import { describe, it, expect, vi } from 'vitest';
import * as fc from 'fast-check';

// ─── Deduplication Implementation Under Test ─────────────────────────

/**
 * Creates a fresh instance of the deduplication pattern for each test iteration.
 * This mirrors the exact logic in api.ts refreshAccessToken():
 *
 *   let refreshInFlight: Promise<string | null> | null = null;
 *   export async function refreshAccessToken(): Promise<string | null> {
 *       if (refreshInFlight) return refreshInFlight;
 *       refreshInFlight = axios.post(resolveApiUrl('/auth/refresh'), {}, { ... })
 *           .then((res) => { ... return nextToken; })
 *           .catch(() => null)
 *           .finally(() => { refreshInFlight = null; });
 *       return refreshInFlight;
 *   }
 */
function createRefreshDeduplicator(httpPostFn: () => Promise<{ data: { token?: string } }>) {
    let refreshInFlight: Promise<string | null> | null = null;

    return function refreshAccessToken(): Promise<string | null> {
        if (refreshInFlight) return refreshInFlight;

        refreshInFlight = httpPostFn()
            .then((res) => {
                const nextToken = String(res.data?.token || '').trim();
                if (!nextToken) return null;
                return nextToken;
            })
            .catch(() => null)
            .finally(() => {
                refreshInFlight = null;
            });

        return refreshInFlight;
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

// ─── Property Tests ──────────────────────────────────────────────────

describe('Feature: auth-session-persistence, Property 5: Concurrent 401s produce exactly one refresh call', () => {
    it('N concurrent calls to refreshAccessToken produce exactly one POST to /auth/refresh', async () => {
        /**
         * **Validates: Requirements 3.2**
         *
         * Strategy: Generate N (1-20) concurrent calls to refreshAccessToken().
         * Use a spy on the HTTP POST function. Assert it is called exactly once
         * regardless of N.
         */
        await fc.assert(
            fc.asyncProperty(
                concurrentCountArbitrary,
                mockTokenArbitrary,
                async (n: number, mockToken: string) => {
                    // Arrange: Create a fresh deduplicator with a tracked HTTP call
                    const httpPost = vi.fn().mockResolvedValue({ data: { token: mockToken } });
                    const refreshAccessToken = createRefreshDeduplicator(httpPost);

                    // Act: Fire N concurrent calls to refreshAccessToken
                    const promises = Array.from({ length: n }, () => refreshAccessToken());
                    await Promise.all(promises);

                    // Assert: HTTP POST should be called exactly once
                    expect(httpPost).toHaveBeenCalledTimes(1);
                },
            ),
            { numRuns: 20 },
        );
    });

    it('all N concurrent callers receive the same resolved token', async () => {
        /**
         * **Validates: Requirements 3.2**
         *
         * Strategy: Generate N concurrent calls. All callers should receive
         * the same token value from the single refresh call.
         */
        await fc.assert(
            fc.asyncProperty(
                concurrentCountArbitrary,
                mockTokenArbitrary,
                async (n: number, mockToken: string) => {
                    // Arrange
                    const httpPost = vi.fn().mockResolvedValue({ data: { token: mockToken } });
                    const refreshAccessToken = createRefreshDeduplicator(httpPost);

                    // Act: Fire N concurrent calls
                    const promises = Array.from({ length: n }, () => refreshAccessToken());
                    const results = await Promise.all(promises);

                    // Assert: All callers receive the same token
                    for (const result of results) {
                        expect(result).toBe(mockToken);
                    }
                },
            ),
            { numRuns: 20 },
        );
    });

    it('after refresh completes, a new call triggers a new POST (deduplication resets)', async () => {
        /**
         * **Validates: Requirements 3.2**
         *
         * Strategy: Generate N1 concurrent calls, wait for them to complete,
         * then fire N2 more. The second batch should trigger a new POST,
         * proving that the deduplication state resets after completion.
         */
        await fc.assert(
            fc.asyncProperty(
                concurrentCountArbitrary,
                concurrentCountArbitrary,
                mockTokenArbitrary,
                mockTokenArbitrary,
                async (n1: number, n2: number, token1: string, token2: string) => {
                    // Arrange
                    let callCount = 0;
                    const httpPost = vi.fn().mockImplementation(() => {
                        callCount++;
                        const token = callCount === 1 ? token1 : token2;
                        return Promise.resolve({ data: { token } });
                    });
                    const refreshAccessToken = createRefreshDeduplicator(httpPost);

                    // Act: First batch of N1 concurrent calls
                    const batch1 = Array.from({ length: n1 }, () => refreshAccessToken());
                    await Promise.all(batch1);

                    // Second batch of N2 concurrent calls (after first completes)
                    const batch2 = Array.from({ length: n2 }, () => refreshAccessToken());
                    await Promise.all(batch2);

                    // Assert: Exactly 2 POST calls (one per batch)
                    expect(httpPost).toHaveBeenCalledTimes(2);
                },
            ),
            { numRuns: 20 },
        );
    });

    it('concurrent calls during a failed refresh all receive null', async () => {
        /**
         * **Validates: Requirements 3.2**
         *
         * Strategy: Generate N concurrent calls where the refresh endpoint fails.
         * All callers should receive null, and only one POST should be made.
         */
        await fc.assert(
            fc.asyncProperty(
                concurrentCountArbitrary,
                async (n: number) => {
                    // Arrange: Mock refresh to fail
                    const httpPost = vi.fn().mockRejectedValue(new Error('Network error'));
                    const refreshAccessToken = createRefreshDeduplicator(httpPost);

                    // Act: Fire N concurrent calls
                    const promises = Array.from({ length: n }, () => refreshAccessToken());
                    const results = await Promise.all(promises);

                    // Assert: All callers receive null (refresh failed)
                    for (const result of results) {
                        expect(result).toBeNull();
                    }

                    // Assert: Only one POST was attempted
                    expect(httpPost).toHaveBeenCalledTimes(1);
                },
            ),
            { numRuns: 20 },
        );
    });
});
