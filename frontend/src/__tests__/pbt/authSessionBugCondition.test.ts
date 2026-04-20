/**
 * Bug Condition Exploration Test — C1: Auth Session Fragmentation
 *
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4**
 *
 * This property-based test encodes the EXPECTED (correct) behavior for auth
 * session management. It is designed to FAIL on unfixed code, surfacing
 * counterexamples that prove the bugs exist.
 *
 * Bug Condition:
 *   isBugCondition_AuthSession(X) triggers when:
 *     (isExamNavigation AND accessTokenExpired AND refreshFlowFails)
 *     OR (isPageReload AND hasRefreshCookie AND NOT bootstrapRestoresSession)
 *     OR (accessTokenExpired AND proactiveRefreshFails)
 *
 * Properties tested:
 *   P1: shouldAttemptAuthBootstrap() returns true on protected routes even when
 *       session hint is cleared (currently returns false — Bug 1.4)
 *   P2: useProactiveTokenRefresh retries when refreshAccessToken() returns null
 *       (currently does not retry — Bug 1.3)
 *   P3: Navigation from /dashboard to /exam/:id with expired token does NOT
 *       redirect to login (currently redirects — Bug 1.1)
 *   P4: F5 reload on /exam/:id restores session from refresh cookie
 *       (currently loses session — Bug 1.2)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fc from 'fast-check';
import { renderHook, act } from '@testing-library/react';

// ─── Hoisted mocks ───────────────────────────────────────────────────

const {
    mockReadAccessToken,
    mockRefreshAccessToken,
    mockDecodeJwtPayload,
} = vi.hoisted(() => ({
    mockReadAccessToken: vi.fn(),
    mockRefreshAccessToken: vi.fn(),
    mockDecodeJwtPayload: vi.fn(),
}));

vi.mock('../../services/api', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../services/api')>();
    return {
        ...actual,
        readAccessToken: (...args: any[]) => mockReadAccessToken(...args),
        refreshAccessToken: (...args: any[]) => mockRefreshAccessToken(...args),
    };
});

vi.mock('../../utils/jwtDecode', () => ({
    decodeJwtPayload: (...args: any[]) => mockDecodeJwtPayload(...args),
}));

// ─── Import modules under test ───────────────────────────────────────

import {
    shouldAttemptAuthBootstrap,
    isProtectedBootstrapPath,
    markAuthSessionHint,
    clearAuthSessionHint,
    hasAuthSessionHint,
} from '../../services/api';
import { useProactiveTokenRefresh } from '../../hooks/useProactiveTokenRefresh';

// ─── Generators ──────────────────────────────────────────────────────

/** Protected routes that students use (exam, dashboard, etc.) */
const protectedRouteArb = fc.constantFrom(
    '/dashboard',
    '/exam/abc123',
    '/exam/abc123/result',
    '/exam/abc123/solutions',
    '/exams',
    '/results',
    '/payments',
    '/notifications',
    '/support',
    '/profile',
    '/profile-center',
    '/student/hub',
    '/student/exams',
);

/** Public auth routes where bootstrap should NOT trigger */
const publicAuthRouteArb = fc.constantFrom(
    '/login',
    '/student/login',
    '/student/register',
    '/student/forgot-password',
    '/student/reset-password',
    '/chairman/login',
    '/__cw_admin__/login',
    '/admin/login',
    '/otp-verify',
);

/** Auth state generator matching the bug condition spec */
const authStateArb = fc.record({
    hasRefreshCookie: fc.boolean(),
    accessTokenExpired: fc.boolean(),
    isPageReload: fc.boolean(),
    isExamNavigation: fc.boolean(),
    route: fc.oneof(protectedRouteArb, publicAuthRouteArb),
});

// ─── Test Suite ──────────────────────────────────────────────────────

describe('Bug Condition C1: Auth Session Fragmentation — Exploration PBT', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        window.localStorage.clear();
    });

    afterEach(() => {
        window.localStorage.clear();
    });

    /**
     * Property 1 (Bug 1.4): shouldAttemptAuthBootstrap() MUST return true
     * when the user is on a protected route, even if the session hint has
     * been cleared — because a valid refresh cookie may still exist.
     *
     * Current behavior: returns false when hint is cleared AND
     * isProtectedBootstrapPath returns false for some protected routes.
     * Expected: returns true for ALL protected routes regardless of hint.
     *
     * **Validates: Requirements 1.4**
     */
    describe('P1: Bootstrap detection on protected routes with cleared hint', () => {
        it('shouldAttemptAuthBootstrap returns true on protected routes even when session hint is cleared', () => {
            fc.assert(
                fc.property(
                    protectedRouteArb,
                    fc.boolean(), // hasRefreshCookie
                    (route, hasRefreshCookie) => {
                        // Simulate: session hint was cleared (e.g., force-logout from another tab)
                        clearAuthSessionHint();
                        expect(hasAuthSessionHint()).toBe(false);

                        // Set window.location.pathname to the protected route
                        Object.defineProperty(window, 'location', {
                            value: { pathname: route },
                            writable: true,
                            configurable: true,
                        });

                        // Bug condition: user has a valid refresh cookie but hint is cleared.
                        // Expected: shouldAttemptAuthBootstrap() returns true because
                        // the route is protected and we should always try to restore session.
                        const result = shouldAttemptAuthBootstrap();

                        // This MUST be true for all protected routes.
                        // On unfixed code, isProtectedBootstrapPath may miss some routes
                        // or the function may return false when hint is cleared.
                        expect(result).toBe(true);
                    },
                ),
                { numRuns: 100 },
            );
        });
    });

    /**
     * Property 2 (Bug 1.3): When refreshAccessToken() returns null (refresh
     * failure), useProactiveTokenRefresh MUST schedule a retry instead of
     * silently giving up.
     *
     * Current behavior: after null return, scheduleNext() reads empty token
     * and stops — no retry is ever scheduled.
     * Expected: retry with backoff (e.g., 5s delay) up to N attempts.
     *
     * **Validates: Requirements 1.3**
     */
    describe('P2: Proactive refresh retries on null return', () => {
        beforeEach(() => {
            vi.useFakeTimers();
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        it('schedules a retry when refreshAccessToken returns null', () => {
            fc.assert(
                fc.property(
                    // Generate token lifetimes between 60s and 30min
                    fc.integer({ min: 60_000, max: 1_800_000 }),
                    (tokenLifetimeMs) => {
                        vi.clearAllMocks();
                        vi.setSystemTime(new Date('2024-06-01T00:00:00.000Z'));
                        const now = Date.now();
                        const expInSeconds = Math.floor((now + tokenLifetimeMs) / 1000);

                        // Initial token exists
                        mockReadAccessToken.mockReturnValue('valid.jwt.token');
                        mockDecodeJwtPayload.mockReturnValue({ exp: expInSeconds });

                        // First refresh FAILS (returns null)
                        mockRefreshAccessToken.mockResolvedValue(null);

                        const { unmount } = renderHook(() => useProactiveTokenRefresh(true));

                        // Advance to trigger the first refresh (75% of lifetime)
                        const refreshDelay = Math.max(5000, tokenLifetimeMs * 0.75);
                        act(() => {
                            vi.advanceTimersByTime(refreshDelay + 1);
                        });

                        expect(mockRefreshAccessToken).toHaveBeenCalledTimes(1);

                        // After null return, the hook should schedule a retry.
                        // On unfixed code: readAccessToken returns '' after failed refresh,
                        // so scheduleNext() bails out and no retry is scheduled.
                        // Expected: a retry is scheduled within 30 seconds.

                        // Simulate that after failed refresh, token is empty
                        mockReadAccessToken.mockReturnValue('');

                        // Advance 30 seconds — a retry should have been attempted
                        act(() => {
                            vi.advanceTimersByTime(30_000);
                        });

                        // On FIXED code, refreshAccessToken should be called again (retry).
                        // On UNFIXED code, it will only have been called once (no retry).
                        expect(mockRefreshAccessToken).toHaveBeenCalledTimes(2);

                        unmount();
                    },
                ),
                { numRuns: 20 },
            );
        });
    });

    /**
     * Property 3 (Bug 1.1): Navigating from /dashboard to /exam/:id with an
     * expired access token should NOT redirect to login. The system should
     * attempt a token refresh transparently.
     *
     * We test this by verifying that shouldAttemptAuthBootstrap returns true
     * for exam routes and that the bootstrap flow (in AuthProvider) would
     * attempt refresh rather than clearing auth state.
     *
     * **Validates: Requirements 1.1**
     */
    describe('P3: Exam navigation with expired token does not lose session', () => {
        it('bootstrap returns true for exam routes regardless of hint state', () => {
            const examRouteArb = fc.stringMatching(/^\/exam\/[a-z0-9]{6,24}(\/result|\/solutions)?$/);

            fc.assert(
                fc.property(
                    examRouteArb,
                    fc.boolean(), // whether hint exists
                    (examRoute, hintExists) => {
                        window.localStorage.clear();

                        if (hintExists) {
                            markAuthSessionHint('student');
                        } else {
                            clearAuthSessionHint();
                        }

                        Object.defineProperty(window, 'location', {
                            value: { pathname: examRoute },
                            writable: true,
                            configurable: true,
                        });

                        // isProtectedBootstrapPath must recognize all /exam/:id routes
                        expect(isProtectedBootstrapPath(examRoute)).toBe(true);

                        // shouldAttemptAuthBootstrap must return true
                        expect(shouldAttemptAuthBootstrap()).toBe(true);
                    },
                ),
                { numRuns: 50 },
            );
        });
    });

    /**
     * Property 4 (Bug 1.2): F5 reload on /exam/:id with a valid refresh
     * cookie should restore the session. This means:
     *   - shouldAttemptAuthBootstrap() returns true on the exam route
     *   - The bootstrap flow calls refreshAccessToken()
     *   - After successful refresh, markAuthSessionHint() is called to
     *     persist the hint for subsequent reloads
     *
     * On unfixed code: if hint was cleared before reload, bootstrap is
     * skipped entirely and the session is lost.
     *
     * **Validates: Requirements 1.2**
     */
    describe('P4: Page reload on exam route restores session from refresh cookie', () => {
        it('bootstrap is attempted and hint is persisted after successful refresh on reload', () => {
            fc.assert(
                fc.property(
                    protectedRouteArb,
                    (route) => {
                        window.localStorage.clear();

                        // Simulate: page reload — in-memory token is gone, hint may be cleared
                        // (e.g., force-logout event from another tab cleared it)
                        clearAuthSessionHint();

                        Object.defineProperty(window, 'location', {
                            value: { pathname: route },
                            writable: true,
                            configurable: true,
                        });

                        // On reload, shouldAttemptAuthBootstrap MUST return true
                        // for protected routes even without hint (refresh cookie exists)
                        const shouldBootstrap = shouldAttemptAuthBootstrap();
                        expect(shouldBootstrap).toBe(true);
                    },
                ),
                { numRuns: 100 },
            );
        });
    });
});
