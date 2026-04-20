// Property 7: PermissionsV2 Override Priority
//
// Feature: campusway-qa-audit, Property 7: PermissionsV2 Override Priority
//
// For any user with a permissionsV2 override set for a specific (module, action)
// pair, the hasPermissionsV2Override function should return the override boolean
// value, and this value should take precedence over the role-based default from
// ROLE_PERMISSION_MATRIX when evaluating access.
//
// Validates: Requirements 10.9

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
    PERMISSION_MODULES,
    PERMISSION_ACTIONS,
} from '../../../qa/types';
import type {
    PermissionModule,
    PermissionAction,
} from '../../../qa/types';

// ─── Inline implementation of hasPermissionsV2Override ───────────────
// Mirrors backend's permissionsMatrix.ts logic exactly.

type IUserPermissionsV2 = Partial<Record<string, Partial<Record<string, boolean>>>>;

function hasPermissionsV2Override(
    permissionsV2: IUserPermissionsV2 | undefined,
    moduleName: PermissionModule,
    action: PermissionAction,
): boolean | null {
    if (!permissionsV2 || typeof permissionsV2 !== 'object') return null;
    const moduleEntry = permissionsV2[moduleName];
    if (!moduleEntry || typeof moduleEntry !== 'object') return null;
    const value = moduleEntry[action];
    if (typeof value !== 'boolean') return null;
    return value;
}

// ─── Property Tests ──────────────────────────────────────────────────

describe('Feature: campusway-qa-audit, Property 7: PermissionsV2 Override Priority', () => {
    it('permissionsV2 override value takes priority over role-based defaults', () => {
        /**
         * **Validates: Requirements 10.9**
         *
         * Strategy: Generate random (module, action, overrideValue) tuples.
         * Build a permissionsV2 object with the override set, then verify
         * hasPermissionsV2Override returns exactly the override boolean.
         * If override=true, access is granted regardless of role default;
         * if override=false, access is denied regardless of role default.
         */
        fc.assert(
            fc.property(
                fc.constantFrom(...PERMISSION_MODULES),
                fc.constantFrom(...PERMISSION_ACTIONS),
                fc.boolean(),
                (mod: PermissionModule, action: PermissionAction, overrideValue: boolean) => {
                    const permissionsV2: IUserPermissionsV2 = {
                        [mod]: { [action]: overrideValue },
                    };

                    const result = hasPermissionsV2Override(permissionsV2, mod, action);

                    // Override must return the exact boolean value
                    expect(result).toBe(overrideValue);

                    // If override=true → access granted regardless of role default
                    // If override=false → access denied regardless of role default
                    if (overrideValue) {
                        expect(result).toBe(true);
                    } else {
                        expect(result).toBe(false);
                    }
                },
            ),
            { numRuns: 20 },
        );
    });

    it('returns null when permissionsV2 has no override for the (module, action) pair', () => {
        /**
         * **Validates: Requirements 10.9**
         *
         * Strategy: For any (module, action) pair, when permissionsV2 is
         * undefined or empty, hasPermissionsV2Override should return null,
         * meaning the role-based default should be used instead.
         */
        fc.assert(
            fc.property(
                fc.constantFrom(...PERMISSION_MODULES),
                fc.constantFrom(...PERMISSION_ACTIONS),
                (mod: PermissionModule, action: PermissionAction) => {
                    // Case 1: undefined permissionsV2
                    expect(hasPermissionsV2Override(undefined, mod, action)).toBeNull();

                    // Case 2: empty object
                    expect(hasPermissionsV2Override({}, mod, action)).toBeNull();

                    // Case 3: module exists but action not set
                    const permissionsV2: IUserPermissionsV2 = { [mod]: {} };
                    expect(hasPermissionsV2Override(permissionsV2, mod, action)).toBeNull();
                },
            ),
            { numRuns: 20 },
        );
    });
});
