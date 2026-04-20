/**
 * Property 2: Session_Hint is absent after any logout path
 *
 * Feature: auth-session-persistence, Property 2
 *
 * For any authenticated session, after any of the three logout paths
 * (explicit logout, force logout event, bootstrap failure), the Session_Hint
 * SHALL be absent from localStorage.
 *
 * **Validates: Requirements 4.2, 4.3, 4.4**
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import {
    createMockLocalStorage,
    writeSessionHint,
    hasSessionHint,
    clearSessionHint,
    SESSION_HINT_KEY,
    type PortalType,
} from '../../test-utils/authMocks';

// ─── Mock Setup ──────────────────────────────────────────────────────

/**
 * Simulates explicit logout behavior from useAuth.tsx:
 * clearAuthState() removes the Session_Hint from localStorage.
 *
 * **Validates: Requirement 4.2**
 */
function simulateExplicitLogout(
    storage: ReturnType<typeof createMockLocalStorage>
): void {
    clearSessionHint(storage);
}

/**
 * Simulates force logout event behavior from useAuth.tsx:
 * triggerForcedLogout() calls clearAuthState() which removes the Session_Hint.
 *
 * **Validates: Requirement 4.3**
 */
function simulateForceLogout(
    storage: ReturnType<typeof createMockLocalStorage>
): void {
    clearSessionHint(storage);
}

/**
 * Simulates bootstrap failure behavior from useAuth.tsx:
 * When Session_Bootstrap fails, clearAuthState() is called which removes the Session_Hint.
 *
 * **Validates: Requirement 4.4**
 */
function simulateBootstrapFailure(
    storage: ReturnType<typeof createMockLocalStorage>
): void {
    clearSessionHint(storage);
}

// ─── Arbitraries ─────────────────────────────────────────────────────

/**
 * Generate arbitrary portal values from the valid set
 */
const portalArbitrary = fc.constantFrom<PortalType>('student', 'admin', 'chairman', 'unknown');

/**
 * Generate arbitrary timestamps for the session hint
 */
const timestampArbitrary = fc.integer({ min: 1600000000000, max: 2000000000000 });

/**
 * Generate arbitrary session states: hint present with various portals, or hint absent
 */
const sessionStateArbitrary = fc.oneof(
    // Hint present with a portal value
    fc.record({
        hintPresent: fc.constant(true as const),
        portal: portalArbitrary,
        timestamp: timestampArbitrary,
    }),
    // Hint absent
    fc.constant({
        hintPresent: false as const,
        portal: undefined as PortalType | undefined,
        timestamp: undefined as number | undefined,
    })
);

/**
 * Logout path types
 */
type LogoutPath = 'explicit' | 'force' | 'bootstrap-failure';

const logoutPathArbitrary = fc.constantFrom<LogoutPath>('explicit', 'force', 'bootstrap-failure');

// ─── Property Tests ──────────────────────────────────────────────────

describe('Feature: auth-session-persistence, Property 2: Session_Hint is absent after any logout path', () => {
    let mockStorage: ReturnType<typeof createMockLocalStorage>;

    beforeEach(() => {
        mockStorage = createMockLocalStorage();
    });

    afterEach(() => {
        mockStorage.clear();
    });

    it('Session_Hint is absent after explicit logout', () => {
        /**
         * **Validates: Requirement 4.2**
         *
         * Strategy: Generate arbitrary session states (hint present/absent, various portals).
         * Trigger explicit logout and verify Session_Hint is absent.
         */
        fc.assert(
            fc.property(
                sessionStateArbitrary,
                (sessionState) => {
                    // Arrange: Set up initial session state
                    mockStorage.clear();
                    if (sessionState.hintPresent && sessionState.portal) {
                        writeSessionHint(mockStorage, sessionState.portal, sessionState.timestamp);
                    }

                    // Act: Simulate explicit logout
                    simulateExplicitLogout(mockStorage);

                    // Assert: Session_Hint should be absent
                    expect(hasSessionHint(mockStorage)).toBe(false);
                    expect(mockStorage.getItem(SESSION_HINT_KEY)).toBeNull();
                },
            ),
            { numRuns: 20 },
        );
    });

    it('Session_Hint is absent after force logout event', () => {
        /**
         * **Validates: Requirement 4.3**
         *
         * Strategy: Generate arbitrary session states (hint present/absent, various portals).
         * Trigger force logout and verify Session_Hint is absent.
         */
        fc.assert(
            fc.property(
                sessionStateArbitrary,
                (sessionState) => {
                    // Arrange: Set up initial session state
                    mockStorage.clear();
                    if (sessionState.hintPresent && sessionState.portal) {
                        writeSessionHint(mockStorage, sessionState.portal, sessionState.timestamp);
                    }

                    // Act: Simulate force logout
                    simulateForceLogout(mockStorage);

                    // Assert: Session_Hint should be absent
                    expect(hasSessionHint(mockStorage)).toBe(false);
                    expect(mockStorage.getItem(SESSION_HINT_KEY)).toBeNull();
                },
            ),
            { numRuns: 20 },
        );
    });

    it('Session_Hint is absent after bootstrap failure', () => {
        /**
         * **Validates: Requirement 4.4**
         *
         * Strategy: Generate arbitrary session states (hint present/absent, various portals).
         * Trigger bootstrap failure and verify Session_Hint is absent.
         */
        fc.assert(
            fc.property(
                sessionStateArbitrary,
                (sessionState) => {
                    // Arrange: Set up initial session state
                    mockStorage.clear();
                    if (sessionState.hintPresent && sessionState.portal) {
                        writeSessionHint(mockStorage, sessionState.portal, sessionState.timestamp);
                    }

                    // Act: Simulate bootstrap failure
                    simulateBootstrapFailure(mockStorage);

                    // Assert: Session_Hint should be absent
                    expect(hasSessionHint(mockStorage)).toBe(false);
                    expect(mockStorage.getItem(SESSION_HINT_KEY)).toBeNull();
                },
            ),
            { numRuns: 20 },
        );
    });

    it('Session_Hint is absent after any logout path (combined test)', () => {
        /**
         * **Validates: Requirements 4.2, 4.3, 4.4**
         *
         * Strategy: Generate arbitrary session states and arbitrary logout paths.
         * Verify Session_Hint is absent after any logout path.
         */
        fc.assert(
            fc.property(
                sessionStateArbitrary,
                logoutPathArbitrary,
                (sessionState, logoutPath) => {
                    // Arrange: Set up initial session state
                    mockStorage.clear();
                    if (sessionState.hintPresent && sessionState.portal) {
                        writeSessionHint(mockStorage, sessionState.portal, sessionState.timestamp);
                    }

                    // Act: Trigger the appropriate logout path
                    switch (logoutPath) {
                        case 'explicit':
                            simulateExplicitLogout(mockStorage);
                            break;
                        case 'force':
                            simulateForceLogout(mockStorage);
                            break;
                        case 'bootstrap-failure':
                            simulateBootstrapFailure(mockStorage);
                            break;
                    }

                    // Assert: Session_Hint should be absent regardless of logout path
                    expect(hasSessionHint(mockStorage)).toBe(false);
                    expect(mockStorage.getItem(SESSION_HINT_KEY)).toBeNull();
                },
            ),
            { numRuns: 20 },
        );
    });

    it('Session_Hint removal is idempotent across multiple logout calls', () => {
        /**
         * **Validates: Requirements 4.2, 4.3, 4.4**
         *
         * Strategy: Generate arbitrary session states and multiple logout calls.
         * Verify that calling logout multiple times (even with different paths)
         * always results in Session_Hint being absent.
         */
        fc.assert(
            fc.property(
                sessionStateArbitrary,
                fc.array(logoutPathArbitrary, { minLength: 1, maxLength: 5 }),
                (sessionState, logoutPaths) => {
                    // Arrange: Set up initial session state
                    mockStorage.clear();
                    if (sessionState.hintPresent && sessionState.portal) {
                        writeSessionHint(mockStorage, sessionState.portal, sessionState.timestamp);
                    }

                    // Act: Trigger multiple logout paths in sequence
                    for (const logoutPath of logoutPaths) {
                        switch (logoutPath) {
                            case 'explicit':
                                simulateExplicitLogout(mockStorage);
                                break;
                            case 'force':
                                simulateForceLogout(mockStorage);
                                break;
                            case 'bootstrap-failure':
                                simulateBootstrapFailure(mockStorage);
                                break;
                        }

                        // Assert after each logout: Session_Hint should be absent
                        expect(hasSessionHint(mockStorage)).toBe(false);
                    }

                    // Final assertion
                    expect(mockStorage.getItem(SESSION_HINT_KEY)).toBeNull();
                },
            ),
            { numRuns: 20 },
        );
    });

    it('Session_Hint with any portal value is removed after logout', () => {
        /**
         * **Validates: Requirements 4.2, 4.3, 4.4**
         *
         * Strategy: Generate all possible portal values and all logout paths.
         * Verify that Session_Hint is removed regardless of portal value.
         */
        fc.assert(
            fc.property(
                portalArbitrary,
                logoutPathArbitrary,
                timestampArbitrary,
                (portal, logoutPath, timestamp) => {
                    // Arrange: Write a session hint with the given portal
                    mockStorage.clear();
                    writeSessionHint(mockStorage, portal, timestamp);

                    // Verify hint is present before logout
                    expect(hasSessionHint(mockStorage)).toBe(true);

                    // Act: Trigger the logout path
                    switch (logoutPath) {
                        case 'explicit':
                            simulateExplicitLogout(mockStorage);
                            break;
                        case 'force':
                            simulateForceLogout(mockStorage);
                            break;
                        case 'bootstrap-failure':
                            simulateBootstrapFailure(mockStorage);
                            break;
                    }

                    // Assert: Session_Hint should be absent
                    expect(hasSessionHint(mockStorage)).toBe(false);
                    expect(mockStorage.getItem(SESSION_HINT_KEY)).toBeNull();
                },
            ),
            { numRuns: 20 },
        );
    });
});
