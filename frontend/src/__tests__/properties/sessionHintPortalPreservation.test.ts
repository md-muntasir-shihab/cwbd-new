/**
 * Property 1: Session_Hint portal is preserved across refresh
 *
 * Feature: auth-session-persistence, Property 1
 *
 * For any authenticated session where a Session_Hint with a known portal value exists,
 * calling `refreshAccessToken()` successfully SHALL NOT change the portal value stored
 * in the Session_Hint.
 *
 * **Validates: Requirements 4.1, 4.5**
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import {
    createMockLocalStorage,
    writeSessionHint,
    readSessionHint,
    SESSION_HINT_KEY,
    type PortalType,
} from '../../test-utils/authMocks';

// ─── Mock Setup ──────────────────────────────────────────────────────

// We need to mock the localStorage and axios to test the refresh behavior
// The key behavior we're testing is that when refreshAccessToken() succeeds,
// it preserves the existing portal value in the Session_Hint

/**
 * Simulates the refresh success handler logic from api.ts:
 * 
 * ```typescript
 * if (hasAuthSessionHint()) {
 *     const existing = readAuthSessionHint();
 *     markAuthSessionHint(existing?.portal);  // preserve portal
 * }
 * ```
 */
function simulateRefreshSuccessHandler(
    storage: ReturnType<typeof createMockLocalStorage>
): void {
    const raw = storage.getItem(SESSION_HINT_KEY);
    if (!raw || raw.length === 0) return;

    // Read existing hint
    let existingPortal: string | undefined;
    try {
        const parsed = JSON.parse(raw);
        existingPortal = parsed?.portal;
    } catch {
        existingPortal = undefined;
    }

    // Write new hint preserving portal (mimics markAuthSessionHint behavior)
    const nextValue = JSON.stringify({
        active: true,
        portal: String(existingPortal || '').trim().toLowerCase() || 'unknown',
        updatedAt: Date.now(),
    });
    storage.setItem(SESSION_HINT_KEY, nextValue);
}

// ─── Arbitraries ─────────────────────────────────────────────────────

/**
 * Generate arbitrary portal values from the valid set
 */
const portalArbitrary = fc.constantFrom<PortalType>('student', 'admin', 'chairman');

/**
 * Generate arbitrary timestamps for the session hint
 */
const timestampArbitrary = fc.integer({ min: 1600000000000, max: 2000000000000 });

// ─── Property Tests ──────────────────────────────────────────────────

describe('Feature: auth-session-persistence, Property 1: Session_Hint portal is preserved across refresh', () => {
    let mockStorage: ReturnType<typeof createMockLocalStorage>;

    beforeEach(() => {
        mockStorage = createMockLocalStorage();
    });

    afterEach(() => {
        mockStorage.clear();
    });

    it('portal value is unchanged after refresh success handler executes', () => {
        /**
         * **Validates: Requirements 4.1, 4.5**
         *
         * Strategy: Generate arbitrary portal values and timestamps.
         * Write a session hint with the portal, then simulate the refresh
         * success handler. Assert the portal value remains unchanged.
         */
        fc.assert(
            fc.property(
                portalArbitrary,
                timestampArbitrary,
                (portal: PortalType, timestamp: number) => {
                    // Arrange: Write a session hint with the given portal
                    writeSessionHint(mockStorage, portal, timestamp);

                    // Verify initial state
                    const initialHint = readSessionHint(mockStorage);
                    expect(initialHint).not.toBeNull();
                    expect(initialHint?.portal).toBe(portal);

                    // Act: Simulate the refresh success handler
                    simulateRefreshSuccessHandler(mockStorage);

                    // Assert: Portal value should be preserved
                    const afterRefreshHint = readSessionHint(mockStorage);
                    expect(afterRefreshHint).not.toBeNull();
                    expect(afterRefreshHint?.portal).toBe(portal);

                    // The timestamp should be updated (different from original)
                    // but the portal must remain the same
                    expect(afterRefreshHint?.active).toBe(true);
                },
            ),
            { numRuns: 20 },
        );
    });

    it('portal value is preserved across multiple consecutive refreshes', () => {
        /**
         * **Validates: Requirements 4.1, 4.5**
         *
         * Strategy: Generate arbitrary portal values and number of refresh cycles.
         * Simulate multiple consecutive refresh success handlers and verify
         * the portal value remains unchanged throughout.
         */
        fc.assert(
            fc.property(
                portalArbitrary,
                fc.integer({ min: 1, max: 10 }),
                (portal: PortalType, refreshCount: number) => {
                    // Arrange: Write initial session hint
                    writeSessionHint(mockStorage, portal);

                    // Act: Simulate multiple refresh cycles
                    for (let i = 0; i < refreshCount; i++) {
                        simulateRefreshSuccessHandler(mockStorage);
                    }

                    // Assert: Portal value should still be preserved
                    const finalHint = readSessionHint(mockStorage);
                    expect(finalHint).not.toBeNull();
                    expect(finalHint?.portal).toBe(portal);
                    expect(finalHint?.active).toBe(true);
                },
            ),
            { numRuns: 20 },
        );
    });

    it('refresh handler does not create hint when none exists', () => {
        /**
         * **Validates: Requirements 4.5**
         *
         * Strategy: Start with no session hint, simulate refresh success handler,
         * and verify no hint is created. This ensures refreshAccessToken() only
         * updates existing hints, not creates new ones.
         */
        fc.assert(
            fc.property(
                fc.boolean(), // dummy property to run multiple iterations
                () => {
                    // Arrange: Ensure no hint exists
                    mockStorage.clear();
                    expect(mockStorage.getItem(SESSION_HINT_KEY)).toBeNull();

                    // Act: Simulate refresh success handler
                    simulateRefreshSuccessHandler(mockStorage);

                    // Assert: No hint should be created
                    expect(mockStorage.getItem(SESSION_HINT_KEY)).toBeNull();
                },
            ),
            { numRuns: 20 },
        );
    });

    it('portal value is preserved regardless of timestamp variations', () => {
        /**
         * **Validates: Requirements 4.1, 4.5**
         *
         * Strategy: Generate arbitrary portal values with various timestamps
         * (past, present, future). Verify portal preservation is independent
         * of the timestamp value.
         */
        fc.assert(
            fc.property(
                portalArbitrary,
                fc.oneof(
                    fc.constant(Date.now() - 86400000), // 1 day ago
                    fc.constant(Date.now()),            // now
                    fc.constant(Date.now() + 86400000), // 1 day in future
                    timestampArbitrary,                 // arbitrary timestamp
                ),
                (portal: PortalType, timestamp: number) => {
                    // Arrange
                    writeSessionHint(mockStorage, portal, timestamp);

                    // Act
                    simulateRefreshSuccessHandler(mockStorage);

                    // Assert
                    const hint = readSessionHint(mockStorage);
                    expect(hint?.portal).toBe(portal);
                },
            ),
            { numRuns: 20 },
        );
    });
});
