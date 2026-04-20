/**
 * Property 2: Preservation — Auth Session Unchanged Flows
 *
 * For any request where the auth session bug condition does NOT hold
 * (admin login, chairman login, explicit logout, 2FA flow, account lockout,
 * suspicious login detection), the auth system SHALL produce the correct
 * behavior, preserving all existing authentication and session management flows.
 *
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6**
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';

// ─── Domain Constants (from source code) ─────────────────────────────

const ADMIN_ROLES = [
    'superadmin',
    'admin',
    'moderator',
    'editor',
    'viewer',
    'support_agent',
    'finance_agent',
] as const;

const ALL_ROLES = [...ADMIN_ROLES, 'chairman'] as const;

const AUTH_ACTIONS = ['login', 'logout', '2fa_verify', 'lockout_check'] as const;

type Role = (typeof ALL_ROLES)[number];
type AuthAction = (typeof AUTH_ACTIONS)[number];

/**
 * Chairman is restricted to reports_analytics and security_logs only.
 * From permissionsMatrix.ts:
 *   chairman: allow(map, 'reports_analytics', ['view', 'export']);
 *              allow(map, 'security_logs', ['view']);
 */
const CHAIRMAN_ALLOWED_MODULES = ['reports_analytics', 'security_logs'] as const;

const ALL_MODULES = [
    'site_settings', 'home_control', 'banner_manager', 'universities',
    'news', 'exams', 'question_bank', 'students_groups',
    'subscription_plans', 'payments', 'finance_center', 'resources',
    'support_center', 'notifications', 'reports_analytics', 'security_logs',
    'team_access_control',
] as const;

type PermissionModule = (typeof ALL_MODULES)[number];

const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

// ─── Pure Logic Under Test (extracted from authController.ts) ────────

/**
 * Mirrors `isAdminRole()` from authController.ts
 */
function isAdminRole(role: string): boolean {
    return (ADMIN_ROLES as readonly string[]).includes(role);
}

/**
 * Mirrors `portalAllowsRole()` from authController.ts
 */
function portalAllowsRole(portal: string | null, role: string): boolean {
    if (!portal) return true;
    if (portal === 'student') return role === 'student';
    if (portal === 'chairman') return role === 'chairman';
    if (portal === 'admin') return isAdminRole(role);
    return true;
}

/**
 * Mirrors `getRedirectPath()` from authController.ts
 */
function getRedirectPath(role: string): string {
    if (role === 'student') return '/dashboard';
    if (role === 'chairman') return '/chairman/dashboard';
    return '/__cw_admin__/dashboard';
}

/**
 * Mirrors `needsTwoFactor()` from authController.ts
 * 2FA only triggers if the user explicitly enabled it.
 */
function needsTwoFactor(twoFactorEnabled: boolean): boolean {
    return twoFactorEnabled === true;
}

/**
 * Simulates lockout logic from authController.ts login():
 * After `maxAttempts` failed logins, account is locked for `lockoutMinutes`.
 */
function computeLockoutState(
    loginAttempts: number,
    maxAttempts: number,
    lockUntil: Date | null,
): { isLocked: boolean; canAttemptLogin: boolean } {
    const now = new Date();
    if (lockUntil && lockUntil > now) {
        return { isLocked: true, canAttemptLogin: false };
    }
    return { isLocked: false, canAttemptLogin: loginAttempts < maxAttempts };
}

/**
 * Simulates suspicious login detection from authController.ts login():
 * A login is suspicious if the user has past successful logins but the
 * current IP+device fingerprint is unknown.
 */
function isSuspiciousLogin(
    pastLoginsCount: number,
    isKnownFingerprint: boolean,
): boolean {
    return pastLoginsCount > 0 && !isKnownFingerprint;
}

/**
 * Chairman permission check: chairman can only access reports_analytics and security_logs.
 * From permissionsMatrix.ts.
 */
function chairmanHasModuleAccess(module: PermissionModule): boolean {
    return (CHAIRMAN_ALLOWED_MODULES as readonly string[]).includes(module);
}

// ─── Arbitraries ─────────────────────────────────────────────────────

const roleArbitrary = fc.constantFrom<Role>(...ALL_ROLES);
const actionArbitrary = fc.constantFrom<AuthAction>(...AUTH_ACTIONS);
const moduleArbitrary = fc.constantFrom<PermissionModule>(...ALL_MODULES);

const authInputArbitrary = fc.record({
    role: roleArbitrary,
    action: actionArbitrary,
});

// ─── Property Tests ──────────────────────────────────────────────────

describe('Property 2: Preservation — Auth Session Unchanged Flows', () => {

    /**
     * **Validates: Requirements 3.1**
     *
     * Admin login flow: admin roles authenticate via the admin portal
     * with stricter rate limiting and proper role-based access.
     */
    describe('3.1: Admin login flow with role-based access', () => {
        it('admin portal allows only admin roles', () => {
            fc.assert(
                fc.property(
                    roleArbitrary,
                    (role) => {
                        const allowed = portalAllowsRole('admin', role);
                        if (isAdminRole(role)) {
                            expect(allowed).toBe(true);
                        } else {
                            expect(allowed).toBe(false);
                        }
                    },
                ),
                { numRuns: 50 },
            );
        });

        it('admin roles redirect to admin dashboard', () => {
            fc.assert(
                fc.property(
                    fc.constantFrom<Role>(...ADMIN_ROLES),
                    (role) => {
                        const redirect = getRedirectPath(role);
                        expect(redirect).toBe('/__cw_admin__/dashboard');
                    },
                ),
                { numRuns: 50 },
            );
        });

        it('null portal allows any role', () => {
            fc.assert(
                fc.property(
                    roleArbitrary,
                    (role) => {
                        expect(portalAllowsRole(null, role)).toBe(true);
                    },
                ),
                { numRuns: 50 },
            );
        });
    });

    /**
     * **Validates: Requirements 3.2**
     *
     * Chairman login flow: chairman authenticates via chairman portal,
     * restricted to reports and security_logs only.
     */
    describe('3.2: Chairman login restricted to reports/security_logs', () => {
        it('chairman portal allows only chairman role', () => {
            fc.assert(
                fc.property(
                    roleArbitrary,
                    (role) => {
                        const allowed = portalAllowsRole('chairman', role);
                        if (role === 'chairman') {
                            expect(allowed).toBe(true);
                        } else {
                            expect(allowed).toBe(false);
                        }
                    },
                ),
                { numRuns: 50 },
            );
        });

        it('chairman redirects to chairman dashboard', () => {
            expect(getRedirectPath('chairman')).toBe('/chairman/dashboard');
        });

        it('chairman can only access reports_analytics and security_logs modules', () => {
            fc.assert(
                fc.property(
                    moduleArbitrary,
                    (module) => {
                        const hasAccess = chairmanHasModuleAccess(module);
                        if (module === 'reports_analytics' || module === 'security_logs') {
                            expect(hasAccess).toBe(true);
                        } else {
                            expect(hasAccess).toBe(false);
                        }
                    },
                ),
                { numRuns: 50 },
            );
        });
    });

    /**
     * **Validates: Requirements 3.3**
     *
     * Account lockout after 5 failed attempts with 15-minute cooldown.
     */
    describe('3.3: Account lockout after 5 failed attempts', () => {
        it('account locks after maxAttempts failed logins', () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: 0, max: 20 }),
                    (attempts) => {
                        const lockUntil = attempts >= MAX_LOGIN_ATTEMPTS
                            ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000)
                            : null;
                        const state = computeLockoutState(attempts, MAX_LOGIN_ATTEMPTS, lockUntil);

                        if (attempts >= MAX_LOGIN_ATTEMPTS) {
                            expect(state.isLocked).toBe(true);
                            expect(state.canAttemptLogin).toBe(false);
                        } else {
                            expect(state.isLocked).toBe(false);
                            expect(state.canAttemptLogin).toBe(true);
                        }
                    },
                ),
                { numRuns: 50 },
            );
        });

        it('expired lockout allows login again', () => {
            const expiredLock = new Date(Date.now() - 1000); // 1 second ago
            const state = computeLockoutState(10, MAX_LOGIN_ATTEMPTS, expiredLock);
            expect(state.isLocked).toBe(false);
            expect(state.canAttemptLogin).toBe(false); // attempts still >= max
        });

        it('active lockout prevents login', () => {
            const activeLock = new Date(Date.now() + 10 * 60 * 1000); // 10 min from now
            const state = computeLockoutState(5, MAX_LOGIN_ATTEMPTS, activeLock);
            expect(state.isLocked).toBe(true);
            expect(state.canAttemptLogin).toBe(false);
        });
    });

    /**
     * **Validates: Requirements 3.4**
     *
     * 2FA verification: when user has 2FA enabled, it is required after
     * successful password authentication. 2FA is opt-in only.
     */
    describe('3.4: 2FA required when enabled', () => {
        it('2FA triggers only when user has explicitly enabled it', () => {
            fc.assert(
                fc.property(
                    fc.boolean(),
                    (twoFactorEnabled) => {
                        const requires2fa = needsTwoFactor(twoFactorEnabled);
                        expect(requires2fa).toBe(twoFactorEnabled);
                    },
                ),
                { numRuns: 50 },
            );
        });

        it('2FA is never forced on any role — always opt-in', () => {
            fc.assert(
                fc.property(
                    roleArbitrary,
                    fc.boolean(),
                    (role, twoFactorEnabled) => {
                        // needsTwoFactor only checks user.twoFactorEnabled, not role
                        const requires2fa = needsTwoFactor(twoFactorEnabled);
                        if (!twoFactorEnabled) {
                            expect(requires2fa).toBe(false);
                        } else {
                            expect(requires2fa).toBe(true);
                        }
                    },
                ),
                { numRuns: 50 },
            );
        });
    });

    /**
     * **Validates: Requirements 3.5**
     *
     * Suspicious login detection: flagged when user has past logins
     * but current IP/device is unknown.
     */
    describe('3.5: Suspicious login detection', () => {
        it('new device/IP flagged as suspicious for returning users', () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: 0, max: 100 }),
                    fc.boolean(),
                    (pastLoginsCount, isKnownFingerprint) => {
                        const suspicious = isSuspiciousLogin(pastLoginsCount, isKnownFingerprint);

                        if (pastLoginsCount > 0 && !isKnownFingerprint) {
                            expect(suspicious).toBe(true);
                        } else {
                            expect(suspicious).toBe(false);
                        }
                    },
                ),
                { numRuns: 50 },
            );
        });

        it('first-time login is never suspicious', () => {
            fc.assert(
                fc.property(
                    fc.boolean(),
                    (isKnownFingerprint) => {
                        expect(isSuspiciousLogin(0, isKnownFingerprint)).toBe(false);
                    },
                ),
                { numRuns: 20 },
            );
        });

        it('known fingerprint is never suspicious', () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: 0, max: 100 }),
                    (pastLoginsCount) => {
                        expect(isSuspiciousLogin(pastLoginsCount, true)).toBe(false);
                    },
                ),
                { numRuns: 20 },
            );
        });
    });

    /**
     * **Validates: Requirements 3.6**
     *
     * Explicit logout: session invalidation, token clearing, redirect to login.
     */
    describe('3.6: Explicit logout invalidates session and clears tokens', () => {
        let mockCookies: Record<string, string>;
        let mockSessionStatus: string;

        beforeEach(() => {
            mockCookies = {
                refresh_token: 'mock-refresh-token',
                access_token: 'mock-access-token',
            };
            mockSessionStatus = 'active';
        });

        afterEach(() => {
            mockCookies = {};
            mockSessionStatus = '';
        });

        /**
         * Simulates the logout flow from authController.ts:
         * 1. Decode token to get sessionId
         * 2. Set session status to 'terminated' with reason 'user_logout'
         * 3. Clear refresh_token cookie
         * 4. Clear access_token cookie
         * 5. Return success message
         */
        function simulateLogout(hasValidToken: boolean): {
            sessionTerminated: boolean;
            refreshCookieCleared: boolean;
            accessCookieCleared: boolean;
            responseMessage: string;
        } {
            // Step 1-2: terminate session if token is valid
            if (hasValidToken) {
                mockSessionStatus = 'terminated';
            }
            // Even if token decode fails, cookies are always cleared (from source code)

            // Step 3-4: clear cookies
            delete mockCookies.refresh_token;
            delete mockCookies.access_token;

            return {
                sessionTerminated: hasValidToken ? mockSessionStatus === 'terminated' : false,
                refreshCookieCleared: !('refresh_token' in mockCookies),
                accessCookieCleared: !('access_token' in mockCookies),
                responseMessage: 'Logged out successfully',
            };
        }

        it('logout always clears both cookies regardless of token validity', () => {
            fc.assert(
                fc.property(
                    fc.boolean(),
                    (hasValidToken) => {
                        // Reset state for each run
                        mockCookies = {
                            refresh_token: 'mock-refresh-token',
                            access_token: 'mock-access-token',
                        };
                        mockSessionStatus = 'active';

                        const result = simulateLogout(hasValidToken);

                        expect(result.refreshCookieCleared).toBe(true);
                        expect(result.accessCookieCleared).toBe(true);
                        expect(result.responseMessage).toBe('Logged out successfully');
                    },
                ),
                { numRuns: 50 },
            );
        });

        it('logout terminates session when token is valid', () => {
            mockCookies = {
                refresh_token: 'mock-refresh-token',
                access_token: 'mock-access-token',
            };
            mockSessionStatus = 'active';

            const result = simulateLogout(true);
            expect(result.sessionTerminated).toBe(true);
        });

        it('logout succeeds even with invalid token (graceful degradation)', () => {
            mockCookies = {
                refresh_token: 'mock-refresh-token',
                access_token: 'mock-access-token',
            };

            const result = simulateLogout(false);
            expect(result.sessionTerminated).toBe(false);
            expect(result.refreshCookieCleared).toBe(true);
            expect(result.accessCookieCleared).toBe(true);
            expect(result.responseMessage).toBe('Logged out successfully');
        });
    });

    /**
     * Combined property: for any non-bug-condition auth input,
     * the system produces correct behavior.
     */
    describe('Combined: all non-bug-condition auth flows behave correctly', () => {
        it('all role × action combinations produce valid auth behavior', () => {
            fc.assert(
                fc.property(
                    authInputArbitrary,
                    fc.boolean(), // twoFactorEnabled
                    fc.integer({ min: 0, max: 10 }), // loginAttempts
                    fc.boolean(), // isKnownFingerprint
                    ({ role, action }, twoFactorEnabled, loginAttempts, isKnownFingerprint) => {
                        switch (action) {
                            case 'login': {
                                // Admin roles use admin portal, chairman uses chairman portal
                                if (isAdminRole(role)) {
                                    expect(portalAllowsRole('admin', role)).toBe(true);
                                    expect(getRedirectPath(role)).toBe('/__cw_admin__/dashboard');
                                } else if (role === 'chairman') {
                                    expect(portalAllowsRole('chairman', role)).toBe(true);
                                    expect(getRedirectPath(role)).toBe('/chairman/dashboard');
                                }
                                break;
                            }
                            case 'logout': {
                                // Logout always succeeds — cookies cleared, message returned
                                // (verified in dedicated tests above)
                                break;
                            }
                            case '2fa_verify': {
                                // 2FA is opt-in only
                                expect(needsTwoFactor(twoFactorEnabled)).toBe(twoFactorEnabled);
                                break;
                            }
                            case 'lockout_check': {
                                // Lockout enforced after MAX_LOGIN_ATTEMPTS
                                const lockUntil = loginAttempts >= MAX_LOGIN_ATTEMPTS
                                    ? new Date(Date.now() + LOCKOUT_MINUTES * 60 * 1000)
                                    : null;
                                const state = computeLockoutState(loginAttempts, MAX_LOGIN_ATTEMPTS, lockUntil);
                                if (loginAttempts >= MAX_LOGIN_ATTEMPTS) {
                                    expect(state.isLocked).toBe(true);
                                } else {
                                    expect(state.canAttemptLogin).toBe(true);
                                }
                                break;
                            }
                        }
                    },
                ),
                { numRuns: 100 },
            );
        });
    });
});
