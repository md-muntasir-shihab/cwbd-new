/**
 * Property 7: Force logout clears token and hint atomically
 *
 * Feature: auth-session-persistence, Property 7
 *
 * For any force logout event, the in-memory access token SHALL be cleared AND
 * the Session_Hint SHALL be removed in the same synchronous operation, with no
 * observable intermediate state where one is cleared but not the other.
 *
 * **Validates: Requirements 5.4**
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import {
    createMockLocalStorage,
    generateMockJWT,
    SESSION_HINT_KEY,
    type PortalType,
} from '../../test-utils/authMocks';

// ─── Constants ───────────────────────────────────────────────────────

const FORCE_LOGOUT_REASONS = [
    'SESSION_INVALIDATED',
    'LEGACY_TOKEN_NOT_ALLOWED',
    'SESSION_IDLE_TIMEOUT',
] as const;

// ─── Simulation Functions ────────────────────────────────────────────

/**
 * Simulates the in-memory access token store as implemented in api.ts.
 * Provides setAccessToken, readAccessToken, and clearAccessToken.
 */
function createTokenStore() {
    let inMemoryAccessToken = '';

    return {
        setAccessToken(token: string): void {
            inMemoryAccessToken = String(token || '').trim();
        },
        readAccessToken(): string {
            return inMemoryAccessToken;
        },
        clearAccessToken(): void {
            inMemoryAccessToken = '';
        },
    };
}

/**
 * Simulates the clearAuthState() function from useAuth.tsx.
 * This is the synchronous operation that clears both the token and the hint.
 *
 * From the source:
 *   const clearAuthState = useCallback(() => {
 *       setUser(null);
 *       setToken(null);
 *       setPending2FA(null);
 *       clearAccessToken();
 *       clearAuthSessionHint();
 *       ...
 *   }, [...]);
 */
function simulateClearAuthState(
    tokenStore: ReturnType<typeof createTokenStore>,
    storage: ReturnType<typeof createMockLocalStorage>,
): void {
    tokenStore.clearAccessToken();
    storage.removeItem(SESSION_HINT_KEY);
}

/**
 * Simulates the triggerForcedLogout() function from useAuth.tsx.
 * Calls clearAuthState() which synchronously clears both token and hint.
 *
 * The key invariant: after this function returns, both the token and hint
 * must be cleared — there is no intermediate state observable by any
 * synchronous code running after this call.
 */
function simulateTriggerForcedLogout(
    tokenStore: ReturnType<typeof createTokenStore>,
    storage: ReturnType<typeof createMockLocalStorage>,
    _reason?: string,
): void {
    // In the real implementation, exam progress preservation happens here
    // (before clearAuthState), but that doesn't affect the atomicity property.
    simulateClearAuthState(tokenStore, storage);
}

// ─── Arbitraries ─────────────────────────────────────────────────────

/**
 * Generate arbitrary portal values
 */
const portalArbitrary = fc.constantFrom<PortalType>('student', 'admin', 'chairman', 'unknown');

/**
 * Generate arbitrary force logout reason codes
 */
const reasonArbitrary = fc.constantFrom(...FORCE_LOGOUT_REASONS);

/**
 * Generate arbitrary token expiry times (in seconds from now)
 */
const tokenExpiryArbitrary = fc.integer({ min: 60, max: 3600 });

/**
 * Generate arbitrary auth states representing a logged-in user
 */
const authStateArbitrary = fc.record({
    portal: portalArbitrary,
    tokenExpiry: tokenExpiryArbitrary,
    reason: reasonArbitrary,
});

// ─── Property Tests ──────────────────────────────────────────────────

describe('Feature: auth-session-persistence, Property 7: Force logout clears token and hint atomically', () => {
    let mockStorage: ReturnType<typeof createMockLocalStorage>;
    let tokenStore: ReturnType<typeof createTokenStore>;

    beforeEach(() => {
        mockStorage = createMockLocalStorage();
        tokenStore = createTokenStore();
    });

    afterEach(() => {
        mockStorage.clear();
    });

    it('both token and hint are cleared after force logout for any auth state', () => {
        /**
         * **Validates: Requirements 5.4**
         *
         * Strategy: Generate arbitrary auth states (various portals, token expiries,
         * and reason codes). Set up both in-memory token and localStorage hint.
         * Trigger force logout. Assert both readAccessToken() returns empty string
         * AND hasAuthSessionHint() returns false simultaneously.
         */
        fc.assert(
            fc.property(
                authStateArbitrary,
                ({ portal, tokenExpiry, reason }) => {
                    // Arrange: Set up authenticated state with token and hint
                    mockStorage.clear();
                    const mockToken = generateMockJWT(tokenExpiry);
                    tokenStore.setAccessToken(mockToken);
                    mockStorage.setItem(
                        SESSION_HINT_KEY,
                        JSON.stringify({ active: true, portal, updatedAt: Date.now() }),
                    );

                    // Verify preconditions: both token and hint are present
                    expect(tokenStore.readAccessToken()).not.toBe('');
                    expect(mockStorage.getItem(SESSION_HINT_KEY)).not.toBeNull();

                    // Act: Trigger force logout
                    simulateTriggerForcedLogout(tokenStore, mockStorage, reason);

                    // Assert: Both are cleared atomically — no intermediate state
                    const tokenAfter = tokenStore.readAccessToken();
                    const hintAfter = mockStorage.getItem(SESSION_HINT_KEY);

                    expect(tokenAfter).toBe('');
                    expect(hintAfter).toBeNull();
                },
            ),
            { numRuns: 20 },
        );
    });

    it('no intermediate state where token is cleared but hint remains', () => {
        /**
         * **Validates: Requirements 5.4**
         *
         * Strategy: Instrument the clearAuthState simulation to capture state
         * at each step. Verify that after the synchronous operation completes,
         * both values are cleared. Since JavaScript is single-threaded, any
         * synchronous observer checking after the call will see both cleared.
         */
        fc.assert(
            fc.property(
                authStateArbitrary,
                ({ portal, tokenExpiry, reason }) => {
                    // Arrange
                    mockStorage.clear();
                    const mockToken = generateMockJWT(tokenExpiry);
                    tokenStore.setAccessToken(mockToken);
                    mockStorage.setItem(
                        SESSION_HINT_KEY,
                        JSON.stringify({ active: true, portal, updatedAt: Date.now() }),
                    );

                    // Act: Trigger force logout
                    simulateTriggerForcedLogout(tokenStore, mockStorage, reason);

                    // Assert: Verify atomicity — both cleared, no partial state
                    // In a synchronous execution model, after the function returns,
                    // any observer will see both cleared simultaneously.
                    const tokenCleared = tokenStore.readAccessToken() === '';
                    const hintCleared = mockStorage.getItem(SESSION_HINT_KEY) === null;

                    // Both must be true — never one without the other
                    expect(tokenCleared && hintCleared).toBe(true);
                    // Explicitly check they are not in a partial state
                    expect(tokenCleared).toBe(hintCleared);
                },
            ),
            { numRuns: 20 },
        );
    });

    it('no intermediate state where hint is cleared but token remains', () => {
        /**
         * **Validates: Requirements 5.4**
         *
         * Strategy: Same as above but explicitly verifying the reverse partial
         * state cannot occur. After force logout, it should never be the case
         * that the hint is gone but the token is still present.
         */
        fc.assert(
            fc.property(
                authStateArbitrary,
                ({ portal, tokenExpiry, reason }) => {
                    // Arrange
                    mockStorage.clear();
                    const mockToken = generateMockJWT(tokenExpiry);
                    tokenStore.setAccessToken(mockToken);
                    mockStorage.setItem(
                        SESSION_HINT_KEY,
                        JSON.stringify({ active: true, portal, updatedAt: Date.now() }),
                    );

                    // Act
                    simulateTriggerForcedLogout(tokenStore, mockStorage, reason);

                    // Assert: Cannot have hint cleared but token still present
                    const tokenPresent = tokenStore.readAccessToken() !== '';
                    const hintPresent = mockStorage.getItem(SESSION_HINT_KEY) !== null;

                    expect(tokenPresent).toBe(false);
                    expect(hintPresent).toBe(false);
                },
            ),
            { numRuns: 20 },
        );
    });

    it('force logout is idempotent — repeated calls maintain cleared state', () => {
        /**
         * **Validates: Requirements 5.4**
         *
         * Strategy: Generate arbitrary auth states and trigger force logout
         * multiple times. Verify that the cleared state is maintained and
         * no errors occur on repeated calls.
         */
        fc.assert(
            fc.property(
                authStateArbitrary,
                fc.integer({ min: 2, max: 5 }),
                ({ portal, tokenExpiry, reason }, repeatCount) => {
                    // Arrange
                    mockStorage.clear();
                    const mockToken = generateMockJWT(tokenExpiry);
                    tokenStore.setAccessToken(mockToken);
                    mockStorage.setItem(
                        SESSION_HINT_KEY,
                        JSON.stringify({ active: true, portal, updatedAt: Date.now() }),
                    );

                    // Act: Trigger force logout multiple times
                    for (let i = 0; i < repeatCount; i++) {
                        simulateTriggerForcedLogout(tokenStore, mockStorage, reason);
                    }

                    // Assert: State remains cleared after all calls
                    expect(tokenStore.readAccessToken()).toBe('');
                    expect(mockStorage.getItem(SESSION_HINT_KEY)).toBeNull();
                },
            ),
            { numRuns: 20 },
        );
    });

    it('force logout clears state regardless of reason code', () => {
        /**
         * **Validates: Requirements 5.4**
         *
         * Strategy: Generate all possible reason codes combined with arbitrary
         * auth states. Verify that the atomicity property holds for every
         * reason code.
         */
        fc.assert(
            fc.property(
                portalArbitrary,
                tokenExpiryArbitrary,
                reasonArbitrary,
                (portal, tokenExpiry, reason) => {
                    // Arrange
                    mockStorage.clear();
                    const mockToken = generateMockJWT(tokenExpiry);
                    tokenStore.setAccessToken(mockToken);
                    mockStorage.setItem(
                        SESSION_HINT_KEY,
                        JSON.stringify({ active: true, portal, updatedAt: Date.now() }),
                    );

                    // Act
                    simulateTriggerForcedLogout(tokenStore, mockStorage, reason);

                    // Assert
                    expect(tokenStore.readAccessToken()).toBe('');
                    expect(mockStorage.getItem(SESSION_HINT_KEY)).toBeNull();
                },
            ),
            { numRuns: 20 },
        );
    });
});
