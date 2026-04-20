// Property 8: Legacy Permission Bridge Correctness
//
// Feature: campusway-qa-audit, Property 8: Legacy Permission Bridge Correctness
//
// For any (module, action) pair that has an entry in LEGACY_PERMISSION_BRIDGE,
// the hasLegacyPermissionBridge function should return the boolean value of the
// mapped legacy IUserPermissions field. For pairs without a bridge mapping,
// it should return null.
//
// Validates: Requirements 10.10

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import type {
    PermissionModule,
    PermissionAction,
} from '../../../qa/types';

// ─── Legacy IUserPermissions interface (mirrors backend User model) ──

interface IUserPermissions {
    canEditExams: boolean;
    canManageStudents: boolean;
    canViewReports: boolean;
    canDeleteData: boolean;
    canManageFinance: boolean;
    canManagePlans: boolean;
    canManageTickets: boolean;
    canManageBackups: boolean;
    canRevealPasswords: boolean;
}

// ─── LEGACY_PERMISSION_BRIDGE (mirrors backend permissionsMatrix.ts) ─

const LEGACY_PERMISSION_BRIDGE: Partial<
    Record<PermissionModule, Partial<Record<PermissionAction, keyof IUserPermissions>>>
> = {
    exams: {
        view: 'canEditExams',
        create: 'canEditExams',
        edit: 'canEditExams',
        publish: 'canEditExams',
        approve: 'canEditExams',
        bulk: 'canEditExams',
        delete: 'canDeleteData',
    },
    question_bank: {
        view: 'canEditExams',
        create: 'canEditExams',
        edit: 'canEditExams',
        approve: 'canEditExams',
        bulk: 'canEditExams',
        export: 'canEditExams',
        delete: 'canDeleteData',
    },
    students_groups: {
        view: 'canManageStudents',
        create: 'canManageStudents',
        edit: 'canManageStudents',
        delete: 'canManageStudents',
        bulk: 'canManageStudents',
        export: 'canManageStudents',
        approve: 'canManageStudents',
    },
    payments: {
        view: 'canManageFinance',
        create: 'canManageFinance',
        edit: 'canManageFinance',
        delete: 'canManageFinance',
        approve: 'canManageFinance',
        export: 'canManageFinance',
        bulk: 'canManageFinance',
    },
    finance_center: {
        view: 'canManageFinance',
        create: 'canManageFinance',
        edit: 'canManageFinance',
        delete: 'canManageFinance',
        approve: 'canManageFinance',
        export: 'canManageFinance',
        bulk: 'canManageFinance',
    },
    subscription_plans: {
        view: 'canManagePlans',
        create: 'canManagePlans',
        edit: 'canManagePlans',
        delete: 'canManagePlans',
        approve: 'canManagePlans',
        export: 'canManagePlans',
        bulk: 'canManagePlans',
    },
    support_center: {
        view: 'canManageTickets',
        create: 'canManageTickets',
        edit: 'canManageTickets',
        approve: 'canManageTickets',
        export: 'canManageTickets',
        bulk: 'canManageTickets',
        delete: 'canManageTickets',
    },
    reports_analytics: {
        view: 'canViewReports',
        export: 'canViewReports',
    },
    security_logs: {
        view: 'canViewReports',
    },
    site_settings: { delete: 'canDeleteData' },
    home_control: { delete: 'canDeleteData' },
    banner_manager: { delete: 'canDeleteData' },
    universities: { delete: 'canDeleteData' },
    news: { delete: 'canDeleteData' },
    resources: { delete: 'canDeleteData' },
};

// ─── hasLegacyPermissionBridge (mirrors backend logic) ───────────────

function hasLegacyPermissionBridge(
    permissions: Partial<IUserPermissions> | undefined,
    moduleName: PermissionModule,
    action: PermissionAction,
): boolean | null {
    const moduleBridge = LEGACY_PERMISSION_BRIDGE[moduleName];
    if (!moduleBridge) return null;
    const bridgeKey = moduleBridge[action];
    if (!bridgeKey) return null;
    return Boolean(permissions?.[bridgeKey]);
}

// ─── Known bridge mappings for fc.constantFrom ───────────────────────

interface BridgeEntry {
    module: PermissionModule;
    action: PermissionAction;
    legacyField: keyof IUserPermissions;
}

const KNOWN_BRIDGE_ENTRIES: BridgeEntry[] = [];
for (const [mod, actionMap] of Object.entries(LEGACY_PERMISSION_BRIDGE)) {
    if (!actionMap) continue;
    for (const [action, field] of Object.entries(actionMap)) {
        if (!field) continue;
        KNOWN_BRIDGE_ENTRIES.push({
            module: mod as PermissionModule,
            action: action as PermissionAction,
            legacyField: field,
        });
    }
}

// Pairs that have NO bridge mapping (modules with no entry at all)
const MODULES_WITHOUT_BRIDGE: PermissionModule[] = ['notifications', 'team_access_control'];

// ─── Property Tests ──────────────────────────────────────────────────

describe('Feature: campusway-qa-audit, Property 8: Legacy Permission Bridge Correctness', () => {
    it('bridge function returns correct legacy field value for known mappings', () => {
        /**
         * **Validates: Requirements 10.10**
         *
         * Strategy: Use fc.constantFrom with known bridge entries and
         * fc.boolean() for the legacy field value. Build an IUserPermissions
         * object with the field set, then verify hasLegacyPermissionBridge
         * returns the correct boolean.
         */
        fc.assert(
            fc.property(
                fc.constantFrom(...KNOWN_BRIDGE_ENTRIES),
                fc.boolean(),
                (entry: BridgeEntry, fieldValue: boolean) => {
                    const permissions: Partial<IUserPermissions> = {
                        [entry.legacyField]: fieldValue,
                    };

                    const result = hasLegacyPermissionBridge(
                        permissions,
                        entry.module,
                        entry.action,
                    );

                    expect(result).toBe(fieldValue);
                },
            ),
            { numRuns: 20 },
        );
    });

    it('bridge function returns null for (module, action) pairs without a mapping', () => {
        /**
         * **Validates: Requirements 10.10**
         *
         * Strategy: Use modules that have no bridge entry at all.
         * For any action on these modules, the bridge should return null.
         */
        fc.assert(
            fc.property(
                fc.constantFrom(...MODULES_WITHOUT_BRIDGE),
                fc.constantFrom(
                    'view' as PermissionAction,
                    'create' as PermissionAction,
                    'edit' as PermissionAction,
                    'delete' as PermissionAction,
                    'publish' as PermissionAction,
                    'approve' as PermissionAction,
                    'export' as PermissionAction,
                    'bulk' as PermissionAction,
                ),
                (mod: PermissionModule, action: PermissionAction) => {
                    const permissions: Partial<IUserPermissions> = {
                        canEditExams: true,
                        canManageStudents: true,
                        canViewReports: true,
                        canDeleteData: true,
                        canManageFinance: true,
                        canManagePlans: true,
                        canManageTickets: true,
                    };

                    const result = hasLegacyPermissionBridge(permissions, mod, action);
                    expect(result).toBeNull();
                },
            ),
            { numRuns: 20 },
        );
    });
});
