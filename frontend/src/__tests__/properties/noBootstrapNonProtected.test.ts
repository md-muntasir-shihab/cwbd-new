/**
 * Property 3: Bootstrap does not attempt on public auth paths
 *
 * Feature: auth-session-persistence, Property 3
 *
 * For any public auth path (login, register, forgot-password, etc.) or the
 * root path, `shouldAttemptAuthBootstrap()` SHALL return false when no
 * Session_Hint is present.
 *
 * After the C1 fix, bootstrap IS attempted on non-public paths (even if they
 * are not explicitly "protected") because the refresh cookie is httpOnly and
 * cannot be read directly. The only paths that skip bootstrap are public auth
 * routes and the root path.
 *
 * **Validates: Requirements 4.6**
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { SESSION_HINT_KEY } from '../../test-utils/authMocks';
import { shouldAttemptAuthBootstrap } from '../../services/api';

// ─── Public Auth Paths (bootstrap should NOT be attempted) ───────────

const PUBLIC_AUTH_PATHS = [
    '/',
    '/login',
    '/student/login',
    '/student/register',
    '/student/forgot-password',
    '/student/reset-password',
    '/chairman/login',
    '/__cw_admin__/login',
    '/admin/login',
    '/otp-verify',
] as const;

// ─── Arbitraries ─────────────────────────────────────────────────────

const publicAuthPathArbitrary = fc.constantFrom(...PUBLIC_AUTH_PATHS);

// ─── Property Tests ──────────────────────────────────────────────────

describe('Feature: auth-session-persistence, Property 3: Bootstrap does not attempt on public auth paths', () => {
    let originalPathname: string;

    beforeEach(() => {
        originalPathname = window.location.pathname;
        window.localStorage.removeItem(SESSION_HINT_KEY);
    });

    afterEach(() => {
        Object.defineProperty(window, 'location', {
            value: { ...window.location, pathname: originalPathname },
            writable: true,
        });
        window.localStorage.removeItem(SESSION_HINT_KEY);
    });

    it('returns false for any public auth path when Session_Hint is absent', () => {
        /**
         * **Validates: Requirements 4.6**
         *
         * Strategy: Generate public auth pathnames (login, register, etc.).
         * Ensure Session_Hint is absent from localStorage.
         * Assert shouldAttemptAuthBootstrap() returns false, confirming no
         * bootstrap attempt on public auth routes.
         */
        fc.assert(
            fc.property(
                publicAuthPathArbitrary,
                (pathname) => {
                    Object.defineProperty(window, 'location', {
                        value: { ...window.location, pathname },
                        writable: true,
                    });
                    window.localStorage.removeItem(SESSION_HINT_KEY);

                    expect(shouldAttemptAuthBootstrap()).toBe(false);
                },
            ),
            { numRuns: 20 },
        );
    });

    it('returns false for root path with no hint', () => {
        /**
         * **Validates: Requirements 4.6**
         *
         * Edge case: The root path "/" should not trigger bootstrap.
         */
        Object.defineProperty(window, 'location', {
            value: { ...window.location, pathname: '/' },
            writable: true,
        });
        window.localStorage.removeItem(SESSION_HINT_KEY);

        expect(shouldAttemptAuthBootstrap()).toBe(false);
    });
});
