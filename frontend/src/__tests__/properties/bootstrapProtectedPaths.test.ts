/**
 * Property 4: Bootstrap attempts on protected path regardless of hint
 *
 * Feature: auth-session-persistence, Property 4
 *
 * For any protected pathname (matching the set defined in Requirement 1.5),
 * `shouldAttemptAuthBootstrap()` SHALL return true regardless of whether a
 * Session_Hint is present.
 *
 * **Validates: Requirements 1.1, 1.5**
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import {
    SESSION_HINT_KEY,
    type PortalType,
} from '../../test-utils/authMocks';
import { shouldAttemptAuthBootstrap } from '../../services/api';

// ─── Protected Path Definitions ──────────────────────────────────────

/**
 * Protected paths from Requirements 1.5:
 * /exam/:examId, /exam/:examId/result, /exam/:examId/solutions, /exams,
 * /dashboard, /results, /payments, /notifications, /support, /profile,
 * /student/*, /profile-center
 */
const PROTECTED_BASE_PATHS = [
    '/exam/',          // prefix for /exam/:examId, /exam/:examId/result, /exam/:examId/solutions
    '/exams',
    '/dashboard',
    '/results',
    '/payments',
    '/notifications',
    '/support',
    '/profile',
    '/student/',       // prefix for /student/*
    '/profile-center',
] as const;

// ─── Arbitraries ─────────────────────────────────────────────────────

/**
 * Generate arbitrary exam IDs (alphanumeric strings simulating MongoDB ObjectIds or UUIDs)
 */
const examIdArbitrary = fc.string({
    minLength: 8,
    maxLength: 24,
    unit: fc.constantFrom(...'abcdef0123456789'.split('')),
});

/**
 * Generate arbitrary path suffixes (sub-paths that can follow a protected prefix)
 */
const pathSuffixArbitrary = fc.oneof(
    fc.constant(''),
    fc.constant('/'),
    fc.constant('/result'),
    fc.constant('/solutions'),
    fc.constant('/settings'),
    fc.constant('/details'),
    fc.string({
        minLength: 1,
        maxLength: 20,
        unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-_'.split('')),
    }).map(s => '/' + s),
);

/**
 * Generate arbitrary query parameters
 */
const queryParamArbitrary = fc.oneof(
    fc.constant(''),
    fc.constant('?page=1'),
    fc.constant('?tab=overview'),
    fc.tuple(
        fc.string({ minLength: 1, maxLength: 10, unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')) }),
        fc.string({ minLength: 1, maxLength: 10, unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split('')) }),
    ).map(([key, value]) => `?${key}=${value}`),
);

/**
 * Generate arbitrary protected pathnames from the defined set.
 * Includes random suffixes to test that sub-paths are also protected.
 */
const protectedPathnameArbitrary = fc.oneof(
    // /exam/:examId paths
    examIdArbitrary.chain(examId =>
        pathSuffixArbitrary.map(suffix => `/exam/${examId}${suffix}`)
    ),
    // /exam/:examId/result
    examIdArbitrary.map(examId => `/exam/${examId}/result`),
    // /exam/:examId/solutions
    examIdArbitrary.map(examId => `/exam/${examId}/solutions`),
    // /exams (exact and with suffixes)
    pathSuffixArbitrary.map(suffix => `/exams${suffix}`),
    // /dashboard
    pathSuffixArbitrary.map(suffix => `/dashboard${suffix}`),
    // /results
    pathSuffixArbitrary.map(suffix => `/results${suffix}`),
    // /payments
    pathSuffixArbitrary.map(suffix => `/payments${suffix}`),
    // /notifications
    pathSuffixArbitrary.map(suffix => `/notifications${suffix}`),
    // /support
    pathSuffixArbitrary.map(suffix => `/support${suffix}`),
    // /profile
    pathSuffixArbitrary.map(suffix => `/profile${suffix}`),
    // /student/* paths
    fc.string({ minLength: 1, maxLength: 15, unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789-_'.split('')) })
        .map(segment => `/student/${segment}`),
    // /profile-center
    pathSuffixArbitrary.map(suffix => `/profile-center${suffix}`),
);

/**
 * Generate arbitrary hint presence states (present with various portals, or absent)
 */
const hintPresenceArbitrary = fc.oneof(
    fc.constant(null), // hint absent
    fc.constantFrom<PortalType>('student', 'admin', 'chairman').map(portal => ({
        active: true,
        portal,
        updatedAt: Date.now(),
    })),
);

// ─── Property Tests ──────────────────────────────────────────────────

describe('Feature: auth-session-persistence, Property 4: Bootstrap attempts on protected path regardless of hint', () => {
    let originalPathname: string;

    beforeEach(() => {
        originalPathname = window.location.pathname;
        // Clear any session hint
        window.localStorage.removeItem(SESSION_HINT_KEY);
    });

    afterEach(() => {
        // Restore original pathname
        Object.defineProperty(window, 'location', {
            value: { ...window.location, pathname: originalPathname },
            writable: true,
        });
        window.localStorage.removeItem(SESSION_HINT_KEY);
    });

    it('returns true for any protected path when Session_Hint is absent', () => {
        /**
         * **Validates: Requirements 1.1, 1.5**
         *
         * Strategy: Generate arbitrary protected pathnames from the defined set.
         * Ensure Session_Hint is absent. Assert shouldAttemptAuthBootstrap() returns true.
         * This validates that protected paths alone trigger bootstrap.
         */
        fc.assert(
            fc.property(
                protectedPathnameArbitrary,
                (pathname) => {
                    // Arrange: Set window.location.pathname and ensure no hint
                    Object.defineProperty(window, 'location', {
                        value: { ...window.location, pathname },
                        writable: true,
                    });
                    window.localStorage.removeItem(SESSION_HINT_KEY);

                    // Act & Assert
                    expect(shouldAttemptAuthBootstrap()).toBe(true);
                },
            ),
            { numRuns: 20 },
        );
    });

    it('returns true for any protected path when Session_Hint is present', () => {
        /**
         * **Validates: Requirements 1.1, 1.5**
         *
         * Strategy: Generate arbitrary protected pathnames and arbitrary hint states.
         * When hint is present, shouldAttemptAuthBootstrap() returns true (due to hint).
         * When hint is absent, shouldAttemptAuthBootstrap() returns true (due to protected path).
         * Either way, the result is true for protected paths.
         */
        fc.assert(
            fc.property(
                protectedPathnameArbitrary,
                fc.constantFrom<PortalType>('student', 'admin', 'chairman'),
                (pathname, portal) => {
                    // Arrange: Set window.location.pathname and write a hint
                    Object.defineProperty(window, 'location', {
                        value: { ...window.location, pathname },
                        writable: true,
                    });
                    const hint = JSON.stringify({ active: true, portal, updatedAt: Date.now() });
                    window.localStorage.setItem(SESSION_HINT_KEY, hint);

                    // Act & Assert
                    expect(shouldAttemptAuthBootstrap()).toBe(true);
                },
            ),
            { numRuns: 20 },
        );
    });

    it('returns true for protected paths regardless of hint presence (combined)', () => {
        /**
         * **Validates: Requirements 1.1, 1.5**
         *
         * Strategy: Generate arbitrary protected pathnames and arbitrary hint states
         * (present or absent). Assert shouldAttemptAuthBootstrap() returns true in all cases.
         */
        fc.assert(
            fc.property(
                protectedPathnameArbitrary,
                hintPresenceArbitrary,
                queryParamArbitrary,
                (pathname, hintState, _queryParam) => {
                    // Arrange: Set window.location.pathname
                    Object.defineProperty(window, 'location', {
                        value: { ...window.location, pathname },
                        writable: true,
                    });

                    // Set or clear hint based on generated state
                    if (hintState === null) {
                        window.localStorage.removeItem(SESSION_HINT_KEY);
                    } else {
                        window.localStorage.setItem(SESSION_HINT_KEY, JSON.stringify(hintState));
                    }

                    // Act & Assert: shouldAttemptAuthBootstrap must return true
                    expect(shouldAttemptAuthBootstrap()).toBe(true);
                },
            ),
            { numRuns: 20 },
        );
    });
});
