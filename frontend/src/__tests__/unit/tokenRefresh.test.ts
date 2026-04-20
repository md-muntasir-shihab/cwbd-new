/**
 * Unit tests for token refresh flow
 * Tests the refreshAccessToken() function and the 401 interceptor behavior in api.ts
 *
 * Strategy: Since api.ts has module-level state (refreshInFlight) and registers
 * interceptors at import time, we test the exported functions and interceptor
 * behavior by mocking axios at the module level.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ─── Hoisted mocks (vi.mock is hoisted, so references must be created via vi.hoisted) ───

const {
    mockAxiosPost,
    mockApiInstance,
    getResponseInterceptorRejected,
} = vi.hoisted(() => {
    const mockAxiosPost = vi.fn();
    let _responseRejected: ((error: any) => any) | null = null;

    const mockApiInstance: any = vi.fn();
    mockApiInstance.defaults = { headers: { common: {} } };
    mockApiInstance.interceptors = {
        request: { use: vi.fn() },
        response: {
            use: vi.fn((_fulfilled: any, rejected: any) => {
                _responseRejected = rejected;
            }),
        },
    };

    return {
        mockAxiosPost,
        mockApiInstance,
        getResponseInterceptorRejected: () => _responseRejected,
    };
});

vi.mock('axios', () => ({
    default: {
        create: () => mockApiInstance,
        post: (...args: any[]) => mockAxiosPost(...args),
    },
    __esModule: true,
}));

vi.mock('../../lib/firebase', () => ({
    getFirebaseAppCheckToken: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../utils/sensitiveAction', () => ({
    promptForSensitiveActionProof: vi.fn().mockResolvedValue(null),
}));

// ─── Import module under test ────────────────────────────────────────

import {
    refreshAccessToken,
    setAccessToken,
    readAccessToken,
    clearAccessToken,
} from '../../services/api';

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * The refreshAccessToken function uses a module-level `refreshInFlight` variable.
 * Between tests, we need to ensure it's reset. Since it resets in .finally(),
 * we just need to ensure any pending promise resolves/rejects before the next test.
 */
async function drainPendingRefresh() {
    // If there's a pending refresh from a previous test, resolve it
    try {
        await refreshAccessToken();
    } catch {
        // ignore
    }
}

// ─── Test Suite ──────────────────────────────────────────────────────

describe('Token Refresh Flow', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        clearAccessToken();
        window.localStorage.clear();
        Object.defineProperty(window, 'location', {
            value: { pathname: '/dashboard', href: '' },
            writable: true,
            configurable: true,
        });
    });

    describe('refreshAccessToken() - success updates in-memory token', () => {
        it('should call POST /auth/refresh and return the new token', async () => {
            const newToken = 'new-access-token-abc123';
            mockAxiosPost.mockResolvedValueOnce({ data: { token: newToken } });

            const result = await refreshAccessToken();

            expect(result).toBe(newToken);
            expect(mockAxiosPost).toHaveBeenCalledTimes(1);
            expect(mockAxiosPost).toHaveBeenCalledWith(
                expect.stringContaining('/auth/refresh'),
                {},
                expect.objectContaining({
                    timeout: 10000,
                    withCredentials: true,
                }),
            );
        });

        it('should update the in-memory access token on success', async () => {
            setAccessToken('old-token');
            mockAxiosPost.mockResolvedValueOnce({ data: { token: 'refreshed-token' } });

            await refreshAccessToken();

            expect(readAccessToken()).toBe('refreshed-token');
        });

        it('should return null and not update token when refresh fails', async () => {
            setAccessToken('existing-token');
            mockAxiosPost.mockRejectedValueOnce(new Error('Network error'));

            const result = await refreshAccessToken();

            expect(result).toBeNull();
            // Token should remain unchanged (not cleared by refreshAccessToken itself)
            expect(readAccessToken()).toBe('existing-token');
        });

        it('should return null when response has empty token', async () => {
            mockAxiosPost.mockResolvedValueOnce({ data: { token: '  ' } });

            const result = await refreshAccessToken();

            expect(result).toBeNull();
        });

        it('should return null when response has no token field', async () => {
            mockAxiosPost.mockResolvedValueOnce({ data: {} });

            const result = await refreshAccessToken();

            expect(result).toBeNull();
        });
    });

    describe('refreshAccessToken() - concurrent requests wait for same refresh promise', () => {
        it('should only make one POST call for concurrent invocations', async () => {
            let resolvePost!: (value: any) => void;
            mockAxiosPost.mockImplementation(() => new Promise((resolve) => {
                resolvePost = resolve;
            }));

            // Fire multiple concurrent calls
            const p1 = refreshAccessToken();
            const p2 = refreshAccessToken();
            const p3 = refreshAccessToken();

            // Resolve the single POST
            resolvePost({ data: { token: 'shared-token' } });

            const results = await Promise.all([p1, p2, p3]);

            // All callers get the same token
            expect(results).toEqual(['shared-token', 'shared-token', 'shared-token']);
            // Only one HTTP call was made
            expect(mockAxiosPost).toHaveBeenCalledTimes(1);
        });

        it('should allow a new refresh after the previous one completes', async () => {
            mockAxiosPost
                .mockResolvedValueOnce({ data: { token: 'token-1' } })
                .mockResolvedValueOnce({ data: { token: 'token-2' } });

            const r1 = await refreshAccessToken();
            const r2 = await refreshAccessToken();

            expect(r1).toBe('token-1');
            expect(r2).toBe('token-2');
            expect(mockAxiosPost).toHaveBeenCalledTimes(2);
        });
    });

    describe('refreshAccessToken() - session hint preservation', () => {
        it('should preserve session hint portal on successful refresh', async () => {
            window.localStorage.setItem('campusway-auth-session-hint', JSON.stringify({
                active: true,
                portal: 'student',
                updatedAt: Date.now() - 5000,
            }));

            mockAxiosPost.mockResolvedValueOnce({ data: { token: 'new-token' } });

            await refreshAccessToken();

            const hint = JSON.parse(window.localStorage.getItem('campusway-auth-session-hint')!);
            expect(hint.portal).toBe('student');
            expect(hint.active).toBe(true);
        });

        it('should not create session hint when none exists before refresh', async () => {
            mockAxiosPost.mockResolvedValueOnce({ data: { token: 'new-token' } });

            await refreshAccessToken();

            expect(window.localStorage.getItem('campusway-auth-session-hint')).toBeNull();
        });
    });

    describe('401 Interceptor - single 401 triggers refresh and retries request', () => {
        it('should refresh token and retry the original request on 401', async () => {
            const interceptorRejected = getResponseInterceptorRejected()!;
            expect(interceptorRejected).not.toBeNull();

            const newToken = 'refreshed-token-for-retry';
            mockAxiosPost.mockResolvedValueOnce({ data: { token: newToken } });

            const retryResponse = { data: { result: 'success' }, status: 200 };
            mockApiInstance.mockResolvedValueOnce(retryResponse);

            const error = {
                response: { status: 401, data: {} },
                config: { url: '/api/users/me', headers: {} },
            };

            const result = await interceptorRejected(error);

            // Refresh was called
            expect(mockAxiosPost).toHaveBeenCalledTimes(1);
            // Original request was retried with new token
            expect(mockApiInstance).toHaveBeenCalledTimes(1);
            expect(mockApiInstance).toHaveBeenCalledWith(
                expect.objectContaining({
                    __isRetryRequest: true,
                    headers: expect.objectContaining({
                        Authorization: `Bearer ${newToken}`,
                    }),
                }),
            );
            expect(result).toEqual(retryResponse);
        });

        it('should not retry if request is already a retry', async () => {
            const interceptorRejected = getResponseInterceptorRejected()!;

            const error = {
                response: { status: 401, data: {} },
                config: { url: '/api/data', headers: {}, __isRetryRequest: true },
            };

            await expect(interceptorRejected(error)).rejects.toBe(error);
            expect(mockAxiosPost).not.toHaveBeenCalled();
        });

        it('should not retry refresh calls themselves', async () => {
            const interceptorRejected = getResponseInterceptorRejected()!;

            const error = {
                response: { status: 401, data: {} },
                config: { url: '/api/auth/refresh', headers: {} },
            };

            await expect(interceptorRejected(error)).rejects.toBe(error);
            expect(mockAxiosPost).not.toHaveBeenCalled();
        });

        it('should not retry login calls', async () => {
            const interceptorRejected = getResponseInterceptorRejected()!;

            const error = {
                response: { status: 401, data: {} },
                config: { url: '/api/auth/login', headers: {} },
            };

            await expect(interceptorRejected(error)).rejects.toBe(error);
            expect(mockAxiosPost).not.toHaveBeenCalled();
        });
    });

    describe('401 Interceptor - refresh failure triggers force logout', () => {
        it('should emit force logout on SESSION_INVALIDATED without attempting refresh', async () => {
            const interceptorRejected = getResponseInterceptorRejected()!;
            const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

            const error = {
                response: { status: 401, data: { code: 'SESSION_INVALIDATED' } },
                config: { url: '/api/some-endpoint', headers: {} },
            };

            await expect(interceptorRejected(error)).rejects.toBe(error);

            expect(dispatchSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'campusway:force-logout',
                    detail: { reason: 'SESSION_INVALIDATED' },
                }),
            );
            expect(mockAxiosPost).not.toHaveBeenCalled();
            dispatchSpy.mockRestore();
        });

        it('should emit force logout on LEGACY_TOKEN_NOT_ALLOWED without attempting refresh', async () => {
            const interceptorRejected = getResponseInterceptorRejected()!;
            const dispatchSpy = vi.spyOn(window, 'dispatchEvent');

            const error = {
                response: { status: 401, data: { code: 'LEGACY_TOKEN_NOT_ALLOWED' } },
                config: { url: '/api/some-endpoint', headers: {} },
            };

            await expect(interceptorRejected(error)).rejects.toBe(error);

            expect(dispatchSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'campusway:force-logout',
                    detail: { reason: 'LEGACY_TOKEN_NOT_ALLOWED' },
                }),
            );
            expect(mockAxiosPost).not.toHaveBeenCalled();
            dispatchSpy.mockRestore();
        });

        it('should clear access token when refresh returns null (failure)', async () => {
            const interceptorRejected = getResponseInterceptorRejected()!;

            setAccessToken('my-token');
            mockAxiosPost.mockRejectedValueOnce(new Error('Refresh failed'));

            const error = {
                response: { status: 401, data: {} },
                config: { url: '/api/some-endpoint', headers: {} },
            };

            await expect(interceptorRejected(error)).rejects.toBe(error);

            expect(readAccessToken()).toBe('');
        });
    });

    describe('401 Interceptor - concurrent requests wait for same refresh', () => {
        it('should deduplicate refresh for concurrent 401 errors', async () => {
            const interceptorRejected = getResponseInterceptorRejected()!;

            // Use a delayed resolution to simulate concurrent behavior
            mockAxiosPost.mockImplementation(
                () => Promise.resolve({ data: { token: 'concurrent-token' } }),
            );

            const retryResponse = { data: { ok: true }, status: 200 };
            mockApiInstance.mockResolvedValue(retryResponse);

            const makeError = (url: string) => ({
                response: { status: 401, data: {} },
                config: { url, headers: {} },
            });

            // Fire concurrent 401 errors
            const results = await Promise.all([
                interceptorRejected(makeError('/api/endpoint-1')),
                interceptorRejected(makeError('/api/endpoint-2')),
                interceptorRejected(makeError('/api/endpoint-3')),
            ]);

            // All requests retried
            expect(mockApiInstance).toHaveBeenCalledTimes(3);
            // Only one refresh POST call
            expect(mockAxiosPost).toHaveBeenCalledTimes(1);
        });
    });
});
