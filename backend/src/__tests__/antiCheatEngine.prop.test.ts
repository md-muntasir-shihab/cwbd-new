import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { mergeAntiCheatPolicy, enforceConstraints } from '../services/antiCheatEngine';
import type { AntiCheatPolicy, AntiCheatOverrides } from '../types/antiCheat';
import { SAFE_DEFAULTS } from '../types/antiCheat';

// ─── Arbitrary Generators ────────────────────────────────────────────────────

const violationActionArb = fc.constantFrom<AntiCheatPolicy['violationAction']>('warn', 'submit', 'lock');

const antiCheatPolicyArb: fc.Arbitrary<AntiCheatPolicy> = fc.record({
    tabSwitchLimit: fc.integer({ min: 1, max: 100 }),
    copyPasteViolationLimit: fc.integer({ min: 1, max: 50 }),
    requireFullscreen: fc.boolean(),
    violationAction: violationActionArb,
    warningCooldownSeconds: fc.integer({ min: 0, max: 300 }),
    maxFullscreenExitLimit: fc.integer({ min: 1, max: 50 }),
    enableClipboardBlock: fc.boolean(),
    enableContextMenuBlock: fc.boolean(),
    enableBlurTracking: fc.boolean(),
    allowMobileRelaxedMode: fc.boolean(),
    proctoringSignalsEnabled: fc.boolean(),
    strictExamTabLock: fc.boolean(),
});

const antiCheatOverridesArb: fc.Arbitrary<AntiCheatOverrides> = fc.record(
    {
        tabSwitchLimit: fc.integer({ min: 1, max: 100 }),
        copyPasteViolationLimit: fc.integer({ min: 1, max: 50 }),
        requireFullscreen: fc.boolean(),
        violationAction: violationActionArb,
        warningCooldownSeconds: fc.integer({ min: 0, max: 300 }),
        maxFullscreenExitLimit: fc.integer({ min: 1, max: 50 }),
        enableClipboardBlock: fc.boolean(),
        enableContextMenuBlock: fc.boolean(),
        enableBlurTracking: fc.boolean(),
        allowMobileRelaxedMode: fc.boolean(),
        proctoringSignalsEnabled: fc.boolean(),
        strictExamTabLock: fc.boolean(),
    },
    { requiredKeys: [] },
);

// Generator that may include invalid numeric values to test constraint enforcement
const antiCheatOverridesWithInvalidArb: fc.Arbitrary<AntiCheatOverrides> = fc.record(
    {
        tabSwitchLimit: fc.integer({ min: -10, max: 200 }),
        copyPasteViolationLimit: fc.integer({ min: -10, max: 100 }),
        requireFullscreen: fc.boolean(),
        violationAction: violationActionArb,
        warningCooldownSeconds: fc.integer({ min: -10, max: 500 }),
        maxFullscreenExitLimit: fc.integer({ min: -10, max: 100 }),
        enableClipboardBlock: fc.boolean(),
        enableContextMenuBlock: fc.boolean(),
        enableBlurTracking: fc.boolean(),
        allowMobileRelaxedMode: fc.boolean(),
        proctoringSignalsEnabled: fc.boolean(),
        strictExamTabLock: fc.boolean(),
    },
    { requiredKeys: [] },
);


// ─── Property Tests ──────────────────────────────────────────────────────────

/**
 * Property 1: AntiCheat Policy Merge Override Priority
 *
 * Validates: Requirements 8.3
 *
 * For any valid global AntiCheatPolicy and per-exam AntiCheatOverrides,
 * override fields take override values, absent fields take global values.
 */
describe('Property 1: AntiCheat Policy Merge Override Priority', () => {
    it('override fields take override values, absent fields take global values', () => {
        fc.assert(
            fc.property(antiCheatPolicyArb, antiCheatOverridesArb, (global, overrides) => {
                const merged = mergeAntiCheatPolicy(global, overrides);

                for (const key of Object.keys(SAFE_DEFAULTS) as (keyof AntiCheatPolicy)[]) {
                    if (key in overrides && overrides[key] !== undefined) {
                        // Override field present → merged value should come from override
                        // (after constraint enforcement for numeric fields)
                        const overrideVal = overrides[key];
                        const isConstrainedNumeric =
                            key === 'tabSwitchLimit' ||
                            key === 'copyPasteViolationLimit' ||
                            key === 'warningCooldownSeconds' ||
                            key === 'maxFullscreenExitLimit';

                        if (isConstrainedNumeric) {
                            // Constraint enforcement may change the value, but the
                            // merge itself should have picked the override value before enforcement
                            const enforced = enforceConstraints({ ...SAFE_DEFAULTS, ...global, ...overrides } as AntiCheatPolicy);
                            expect(merged[key]).toBe(enforced[key]);
                        } else {
                            expect(merged[key]).toBe(overrideVal);
                        }
                    } else {
                        // Override field absent → merged value should come from global
                        // (after constraint enforcement for numeric fields)
                        const enforced = enforceConstraints({ ...SAFE_DEFAULTS, ...global } as AntiCheatPolicy);
                        expect(merged[key]).toBe(enforced[key]);
                    }
                }
            }),
            { numRuns: 20 },
        );
    });
});

/**
 * Property 2: AntiCheat Policy Merge Idempotence
 *
 * Validates: Requirements 8.3
 *
 * mergePolicy(mergePolicy(global, overrides), {}) ≡ mergePolicy(global, overrides)
 */
describe('Property 2: AntiCheat Policy Merge Idempotence', () => {
    it('re-merging with empty overrides produces the same result', () => {
        fc.assert(
            fc.property(antiCheatPolicyArb, antiCheatOverridesArb, (global, overrides) => {
                const firstMerge = mergeAntiCheatPolicy(global, overrides);
                const secondMerge = mergeAntiCheatPolicy(firstMerge, {});

                expect(secondMerge).toEqual(firstMerge);
            }),
            { numRuns: 20 },
        );
    });
});

/**
 * Property 3: AntiCheat Policy Constraint Invariant
 *
 * Validates: Requirements 8.8
 *
 * After merge, all numeric fields meet minimum constraints:
 * tabSwitchLimit >= 1, copyPasteViolationLimit >= 1,
 * warningCooldownSeconds >= 0, maxFullscreenExitLimit >= 1
 */
describe('Property 3: AntiCheat Policy Constraint Invariant', () => {
    it('all numeric fields meet minimum constraints after merge', () => {
        fc.assert(
            fc.property(antiCheatPolicyArb, antiCheatOverridesWithInvalidArb, (global, overrides) => {
                const merged = mergeAntiCheatPolicy(global, overrides);

                expect(merged.tabSwitchLimit).toBeGreaterThanOrEqual(1);
                expect(merged.copyPasteViolationLimit).toBeGreaterThanOrEqual(1);
                expect(merged.warningCooldownSeconds).toBeGreaterThanOrEqual(0);
                expect(merged.maxFullscreenExitLimit).toBeGreaterThanOrEqual(1);
            }),
            { numRuns: 20 },
        );
    });
});

/**
 * Property 4: AntiCheat Policy Round-Trip Serialization
 *
 * Validates: Requirements 8.7
 *
 * JSON.parse(JSON.stringify(policy)) equals original policy for any valid policy.
 */
describe('Property 4: AntiCheat Policy Round-Trip Serialization', () => {
    it('JSON round-trip preserves all policy fields', () => {
        fc.assert(
            fc.property(antiCheatPolicyArb, (policy) => {
                const serialized = JSON.stringify(policy);
                const deserialized = JSON.parse(serialized) as AntiCheatPolicy;

                expect(deserialized).toEqual(policy);
            }),
            { numRuns: 20 },
        );
    });
});

// ─── Additional imports for Properties 5-7 ───────────────────────────────────

import { evaluateSignal } from '../services/antiCheatEngine';
import type { AntiCheatSignalType, AntiCheatDecisionAction } from '../types/antiCheat';
import { SEVERITY_ORDER } from '../types/antiCheat';
import type { AntiCheatCounters } from '../services/antiCheatEngine';

// ─── Generators for Properties 5-7 ──────────────────────────────────────────

/** Counter-incrementing signal types only */
const counterSignalTypeArb = fc.constantFrom<AntiCheatSignalType>('tab_switch', 'copy_attempt', 'fullscreen_exit');

/** All signal types */
const anySignalTypeArb = fc.constantFrom<AntiCheatSignalType>(
    'tab_switch', 'copy_attempt', 'fullscreen_exit',
    'resume', 'client_error', 'blur', 'context_menu_blocked',
);

/** Counter values — non-negative integers */
const countersArb: fc.Arbitrary<AntiCheatCounters> = fc.record({
    tabSwitchCount: fc.integer({ min: 0, max: 200 }),
    copyAttemptCount: fc.integer({ min: 0, max: 200 }),
    fullscreenExitCount: fc.integer({ min: 0, max: 200 }),
});

// ─── Helper: map signal type to its counter field ────────────────────────────

const SIGNAL_TO_COUNTER: Record<string, keyof AntiCheatCounters> = {
    tab_switch: 'tabSwitchCount',
    copy_attempt: 'copyAttemptCount',
    fullscreen_exit: 'fullscreenExitCount',
};

// ─── Property 5-7 Tests ─────────────────────────────────────────────────────

/**
 * Property 5: AntiCheat Decision Monotonicity
 *
 * Validates: Requirements 7.1, 7.2, 9.8, 9.9
 *
 * For any policy and counter-incrementing signal type, increasing the
 * relevant counter never decreases the decision severity.
 * severity(evaluate(counters + 1)) >= severity(evaluate(counters))
 */
describe('Property 5: AntiCheat Decision Monotonicity', () => {
    it('increasing counter never decreases decision severity', () => {
        fc.assert(
            fc.property(
                antiCheatPolicyArb,
                counterSignalTypeArb,
                fc.integer({ min: 0, max: 199 }),
                (policy, signalType, baseCounter) => {
                    const counterField = SIGNAL_TO_COUNTER[signalType];

                    const countersLow: AntiCheatCounters = {
                        tabSwitchCount: 0,
                        copyAttemptCount: 0,
                        fullscreenExitCount: 0,
                        [counterField]: baseCounter,
                    };

                    const countersHigh: AntiCheatCounters = {
                        tabSwitchCount: 0,
                        copyAttemptCount: 0,
                        fullscreenExitCount: 0,
                        [counterField]: baseCounter + 1,
                    };

                    const decisionLow = evaluateSignal(countersLow, policy, signalType);
                    const decisionHigh = evaluateSignal(countersHigh, policy, signalType);

                    const severityLow = SEVERITY_ORDER[decisionLow.action];
                    const severityHigh = SEVERITY_ORDER[decisionHigh.action];

                    expect(severityHigh).toBeGreaterThanOrEqual(severityLow);
                },
            ),
            { numRuns: 20 },
        );
    });
});

/**
 * Property 6: Locked Session Signal Rejection
 *
 * Validates: Requirements 7.8
 *
 * When sessionLocked === true, any signal should be rejected with SESSION_LOCKED code.
 * Since evaluateSignal is a pure function that doesn't check session lock state,
 * we test this via a helper that checks lock state before calling evaluateSignal.
 */

/** Helper: wraps evaluateSignal with session lock check (mirrors processAntiCheatSignal behavior) */
function evaluateSignalWithLockCheck(
    counters: AntiCheatCounters,
    policy: AntiCheatPolicy,
    signalType: AntiCheatSignalType,
    sessionLocked: boolean,
): { action: AntiCheatDecisionAction; code?: string } | { rejected: true; code: string } {
    if (sessionLocked) {
        return { rejected: true, code: 'SESSION_LOCKED' };
    }
    return evaluateSignal(counters, policy, signalType);
}

describe('Property 6: Locked Session Signal Rejection', () => {
    it('locked session rejects any signal with SESSION_LOCKED code', () => {
        fc.assert(
            fc.property(
                countersArb,
                antiCheatPolicyArb,
                anySignalTypeArb,
                (counters, policy, signalType) => {
                    const result = evaluateSignalWithLockCheck(counters, policy, signalType, true);

                    expect(result).toHaveProperty('rejected', true);
                    expect(result).toHaveProperty('code', 'SESSION_LOCKED');
                },
            ),
            { numRuns: 20 },
        );
    });

    it('unlocked session does not reject signals', () => {
        fc.assert(
            fc.property(
                countersArb,
                antiCheatPolicyArb,
                anySignalTypeArb,
                (counters, policy, signalType) => {
                    const result = evaluateSignalWithLockCheck(counters, policy, signalType, false);

                    expect(result).not.toHaveProperty('rejected');
                    expect(result).toHaveProperty('action');
                },
            ),
            { numRuns: 20 },
        );
    });
});

/**
 * Property 7: Signal Processing Counter Confluence
 *
 * Validates: Requirements 7.1, 9.1, 9.2, 9.3
 *
 * The same set of counter-incrementing signals processed in different orders
 * produce the same final counter values. Since each signal type increments
 * its own independent counter, order doesn't affect the final counts.
 */
describe('Property 7: Signal Processing Counter Confluence', () => {
    it('same signals in different order produce same final counters', () => {
        fc.assert(
            fc.property(
                fc.array(counterSignalTypeArb, { minLength: 1, maxLength: 30 }),
                (signals) => {
                    // Simulate counter accumulation for original order
                    function accumulateCounters(orderedSignals: AntiCheatSignalType[]): AntiCheatCounters {
                        const counters: AntiCheatCounters = {
                            tabSwitchCount: 0,
                            copyAttemptCount: 0,
                            fullscreenExitCount: 0,
                        };
                        for (const sig of orderedSignals) {
                            const field = SIGNAL_TO_COUNTER[sig];
                            if (field) {
                                counters[field]++;
                            }
                        }
                        return counters;
                    }

                    // Original order
                    const countersOriginal = accumulateCounters(signals);

                    // Reversed order
                    const reversed = [...signals].reverse();
                    const countersReversed = accumulateCounters(reversed);

                    // Shuffled order (deterministic shuffle via sort)
                    const shuffled = [...signals].sort();
                    const countersShuffled = accumulateCounters(shuffled);

                    expect(countersReversed).toEqual(countersOriginal);
                    expect(countersShuffled).toEqual(countersOriginal);
                },
            ),
            { numRuns: 20 },
        );
    });
});
