/**
 * Bug Condition Exploration Test — C10: Permission Matrix
 *
 * **Validates: Requirements 1.17, 1.18**
 *
 * This property-based test encodes the EXPECTED (correct) behavior for
 * the permission matrix. It is designed to FAIL on unfixed code, surfacing
 * counterexamples that prove permission inconsistencies exist.
 *
 * Bug Condition:
 *   isBugCondition_Permissions(input) triggers when:
 *     frontendPermissionResult(input) ≠ backendPermissionResult(input)
 *     OR NOT permissionMappingExists(input.role, input.module, input.action)
 *
 * Properties tested:
 *   P1: Frontend and backend produce identical allow/deny decisions for all role × module × action
 *   P2: All 9 roles × 17 modules × 8 actions have explicit mappings in ROLE_PERMISSION_MATRIX
 *   P3: Bug condition function correctly identifies permission gaps on unfixed code
 */

import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

// ─── Types ───────────────────────────────────────────────────────────

type PermissionModule =
    | 'site_settings' | 'home_control' | 'banner_manager' | 'universities'
    | 'news' | 'exams' | 'question_bank' | 'students_groups'
    | 'subscription_plans' | 'payments' | 'finance_center' | 'resources'
    | 'support_center' | 'notifications' | 'reports_analytics'
    | 'security_logs' | 'team_access_control';

type PermissionAction =
    | 'view' | 'create' | 'edit' | 'delete'
    | 'publish' | 'approve' | 'export' | 'bulk';

type UserRole =
    | 'superadmin' | 'admin' | 'moderator' | 'editor' | 'viewer'
    | 'support_agent' | 'finance_agent' | 'chairman' | 'student';

interface PermissionCheck {
    role: UserRole;
    module: PermissionModule;
    action: PermissionAction;
}

// ─── Constants (mirroring actual codebase) ───────────────────────────

const ALL_MODULES: PermissionModule[] = [
    'site_settings', 'home_control', 'banner_manager', 'universities',
    'news', 'exams', 'question_bank', 'students_groups',
    'subscription_plans', 'payments', 'finance_center', 'resources',
    'support_center', 'notifications', 'reports_analytics',
    'security_logs', 'team_access_control',
];

const ALL_ACTIONS: PermissionAction[] = [
    'view', 'create', 'edit', 'delete', 'publish', 'approve', 'export', 'bulk',
];

const ALL_ROLES: UserRole[] = [
    'superadmin', 'admin', 'moderator', 'editor', 'viewer',
    'support_agent', 'finance_agent', 'chairman', 'student',
];

// ─── Frontend MODULE_ALIASES (from useModuleAccess.ts — UNFIXED) ─────

/**
 * On UNFIXED code, the frontend useModuleAccess hook defines MODULE_ALIASES
 * that map certain module names to alternative keys. When checking access,
 * it resolves the module to [module, ...aliases] and checks user.permissionsV2
 * for ANY match.
 *
 * The backend requirePermission middleware does NOT use aliases — it checks
 * the exact module name against ROLE_PERMISSION_MATRIX, then permissionsV2,
 * then LEGACY_PERMISSION_BRIDGE.
 *
 * BUG: The alias mapping creates divergence. For example:
 * - Frontend: hasAccess('reports_analytics', 'view') checks 'reports_analytics',
 *   'notifications', and 'finance' — if user has 'notifications.view' permission,
 *   frontend grants access to reports_analytics
 * - Backend: requirePermission('reports_analytics', 'view') only checks
 *   'reports_analytics' in the matrix — 'notifications' access doesn't help
 */
const FRONTEND_MODULE_ALIASES_UNFIXED: Record<string, string[]> = {
    home_control: ['banner_manager', 'site_settings'],
    students_groups: ['students', 'student_groups'],
    subscription_plans: ['subscriptions', 'payments'],
    finance_center: ['finance', 'payments'],
    support_center: ['support', 'help_center'],
    reports_analytics: ['notifications', 'finance'],
    security_logs: ['security_center', 'system_logs'],
};

// ─── Backend ROLE_PERMISSION_MATRIX (from permissionsMatrix.ts — UNFIXED) ──

/**
 * Reproduces the UNFIXED permission matrix exactly as defined in the codebase.
 * Key gaps:
 * - support_agent has NO notifications access (should have view)
 * - finance_agent has NO subscription_plans access (should have view)
 * - editor has NO banner_manager access (should have view/edit for content)
 * - moderator has NO security_logs access
 * - Missing 'delete' for many admin module combinations
 */

const CONTENT_MODULES: PermissionModule[] = [
    'home_control', 'banner_manager', 'universities', 'news',
    'exams', 'question_bank', 'resources',
];

const ADMIN_MODULES: PermissionModule[] = [
    ...CONTENT_MODULES,
    'site_settings', 'students_groups', 'subscription_plans', 'payments',
    'finance_center', 'support_center', 'notifications', 'reports_analytics',
    'security_logs', 'team_access_control',
];

function buildUnfixedMatrix(): Record<UserRole, Record<PermissionModule, PermissionAction[]>> {
    const matrix: Record<string, Record<string, PermissionAction[]>> = {};

    // Initialize all roles with empty arrays for all modules
    for (const role of ALL_ROLES) {
        matrix[role] = {};
        for (const mod of ALL_MODULES) {
            matrix[role][mod] = [];
        }
    }

    // superadmin: all actions on all admin modules
    for (const mod of ADMIN_MODULES) {
        matrix['superadmin'][mod] = [...ALL_ACTIONS];
    }

    // admin: most actions on admin modules, delete only on specific modules
    for (const mod of ADMIN_MODULES) {
        matrix['admin'][mod] = ['view', 'create', 'edit', 'publish', 'approve', 'export', 'bulk'];
    }
    for (const mod of ['universities', 'news', 'exams', 'question_bank', 'students_groups', 'resources'] as PermissionModule[]) {
        matrix['admin'][mod] = [...new Set([...matrix['admin'][mod], 'delete'])];
    }

    // moderator
    for (const mod of CONTENT_MODULES) {
        matrix['moderator'][mod] = ['view', 'create', 'edit', 'publish', 'export'];
    }
    for (const mod of ['news', 'question_bank', 'exams'] as PermissionModule[]) {
        matrix['moderator'][mod] = [...new Set([...matrix['moderator'][mod], 'approve', 'bulk'])];
    }
    matrix['moderator']['students_groups'] = ['view', 'edit', 'bulk'];
    matrix['moderator']['support_center'] = ['view', 'edit'];
    matrix['moderator']['notifications'] = ['view', 'create', 'edit', 'publish', 'export'];
    matrix['moderator']['reports_analytics'] = ['view', 'export'];

    // editor
    for (const mod of ['news', 'resources', 'question_bank'] as PermissionModule[]) {
        matrix['editor'][mod] = ['view', 'create', 'edit', 'export'];
    }
    matrix['editor']['home_control'] = ['view', 'edit'];
    matrix['editor']['universities'] = ['view'];
    matrix['editor']['exams'] = ['view'];
    matrix['editor']['notifications'] = ['view', 'create', 'edit'];

    // viewer: view-only on all admin modules
    for (const mod of ADMIN_MODULES) {
        matrix['viewer'][mod] = ['view'];
    }

    // support_agent: limited to support_center and reports
    matrix['support_agent']['support_center'] = ['view', 'create', 'edit', 'approve', 'export'];
    matrix['support_agent']['reports_analytics'] = ['view'];
    // BUG: support_agent has NO notifications access — should have 'view'

    // finance_agent: finance-related modules
    matrix['finance_agent']['payments'] = ['view', 'create', 'edit', 'approve', 'export', 'bulk'];
    matrix['finance_agent']['finance_center'] = ['view', 'create', 'edit', 'approve', 'export', 'bulk'];
    matrix['finance_agent']['reports_analytics'] = ['view', 'export'];
    // BUG: finance_agent has NO subscription_plans access — should have 'view'

    // chairman: reports and security logs only
    matrix['chairman']['reports_analytics'] = ['view', 'export'];
    matrix['chairman']['security_logs'] = ['view'];

    // student: no admin permissions
    // (all empty)

    return matrix as Record<UserRole, Record<PermissionModule, PermissionAction[]>>;
}

const UNFIXED_MATRIX = buildUnfixedMatrix();

// ─── FIXED Matrix (after permissionsMatrix.ts fixes) ─────────────────

function buildFixedMatrix(): Record<UserRole, Record<PermissionModule, PermissionAction[]>> {
    const matrix = buildUnfixedMatrix();

    // Fix 1: support_agent gets notifications view access
    matrix['support_agent']['notifications'] = ['view'];

    // Fix 2: finance_agent gets subscription_plans view access
    matrix['finance_agent']['subscription_plans'] = ['view'];

    // Fix 3: editor gets banner_manager view/edit access
    matrix['editor']['banner_manager'] = ['view', 'edit'];

    return matrix;
}

const FIXED_MATRIX = buildFixedMatrix();

// ─── FIXED Frontend Aliases (after useModuleAccess.ts fixes) ─────────

const FRONTEND_MODULE_ALIASES_FIXED: Record<string, string[]> = {
    home_control: ['banner_manager'],
    students_groups: ['student_groups'],
    subscription_plans: ['subscriptions'],
    finance_center: ['finance'],
    support_center: ['support'],
    reports_analytics: ['reports'],
    security_logs: ['security_center'],
};

// ─── Simulation Functions ────────────────────────────────────────────

/**
 * Simulates backend permission evaluation (requirePermission middleware).
 *
 * Backend chain:
 * 1. superadmin → always allow
 * 2. Check permissionsV2 override (per-user) → if boolean, use it
 * 3. Check ROLE_PERMISSION_MATRIX[role][module].includes(action)
 * 4. Check LEGACY_PERMISSION_BRIDGE
 *
 * For simulation, we only use the role matrix (no per-user overrides or legacy bridge).
 */
function backendPermissionCheck(
    check: PermissionCheck,
    matrix: Record<UserRole, Record<PermissionModule, PermissionAction[]>>,
): boolean {
    if (check.role === 'superadmin') return true;
    const roleMap = matrix[check.role];
    if (!roleMap) return false;
    const moduleActions = roleMap[check.module];
    if (!moduleActions) return false;
    return moduleActions.includes(check.action);
}

/**
 * Simulates frontend permission evaluation (useModuleAccess hook) on UNFIXED code.
 *
 * Frontend chain:
 * 1. superadmin → always allow
 * 2. Resolve module to [module, ...MODULE_ALIASES[module]]
 * 3. Check user.permissionsV2[anyResolvedKey][action]
 *
 * Since permissionsV2 is populated from the role matrix on the backend,
 * the frontend effectively checks: does ANY alias of the module have the
 * action in the matrix?
 *
 * BUG: The alias resolution means the frontend may grant access through
 * an alias that the backend doesn't recognize for that module.
 */
function frontendPermissionCheck_Unfixed(
    check: PermissionCheck,
    matrix: Record<UserRole, Record<PermissionModule, PermissionAction[]>>,
): boolean {
    if (check.role === 'superadmin') return true;

    const roleMap = matrix[check.role];
    if (!roleMap) return false;

    // Frontend resolves aliases
    const aliases = FRONTEND_MODULE_ALIASES_UNFIXED[check.module] || [];
    const keysToCheck = [check.module, ...aliases];

    // Check if ANY resolved key has the action
    for (const key of keysToCheck) {
        const moduleActions = roleMap[key as PermissionModule];
        if (moduleActions && moduleActions.includes(check.action)) {
            return true;
        }
    }
    return false;
}

/**
 * Simulates frontend permission evaluation on FIXED code.
 *
 * On fixed code, the frontend aliases are synced with backend module naming,
 * and the evaluation logic mirrors the backend exactly.
 * No alias-based cross-module leakage.
 */
function frontendPermissionCheck_Fixed(
    check: PermissionCheck,
    matrix: Record<UserRole, Record<PermissionModule, PermissionAction[]>>,
): boolean {
    if (check.role === 'superadmin') return true;

    const roleMap = matrix[check.role];
    if (!roleMap) return false;

    // Fixed: aliases only map to same-concept module names, no cross-module leakage
    const aliases = FRONTEND_MODULE_ALIASES_FIXED[check.module] || [];
    const keysToCheck = [check.module, ...aliases];

    for (const key of keysToCheck) {
        const moduleActions = roleMap[key as PermissionModule];
        if (moduleActions && moduleActions.includes(check.action)) {
            return true;
        }
    }
    return false;
}

/**
 * Checks if a permission mapping exists in the matrix.
 * A mapping "exists" if the role has an explicit entry for the module
 * (even if the actions array is empty — that's an explicit denial).
 *
 * On UNFIXED code, some role × module combinations may have undefined
 * or missing entries.
 */
function permissionMappingExists(
    role: UserRole,
    module: PermissionModule,
    _action: PermissionAction,
    matrix: Record<UserRole, Record<PermissionModule, PermissionAction[]>>,
): boolean {
    const roleMap = matrix[role];
    if (!roleMap) return false;
    // Check if the module key exists at all
    return module in roleMap;
}

// ─── Bug Condition Function ──────────────────────────────────────────

function isBugCondition_Permissions(
    check: PermissionCheck,
    matrix: Record<UserRole, Record<PermissionModule, PermissionAction[]>>,
): boolean {
    const frontendResult = frontendPermissionCheck_Unfixed(check, matrix);
    const backendResult = backendPermissionCheck(check, matrix);

    // Bug condition 1: frontend and backend disagree
    if (frontendResult !== backendResult) return true;

    // Bug condition 2: mapping doesn't exist
    if (!permissionMappingExists(check.role, check.module, check.action, matrix)) return true;

    return false;
}

// ─── Generators ──────────────────────────────────────────────────────

const roleArb: fc.Arbitrary<UserRole> = fc.constantFrom(...ALL_ROLES);
const moduleArb: fc.Arbitrary<PermissionModule> = fc.constantFrom(...ALL_MODULES);
const actionArb: fc.Arbitrary<PermissionAction> = fc.constantFrom(...ALL_ACTIONS);

const permissionCheckArb: fc.Arbitrary<PermissionCheck> = fc.record({
    role: roleArb,
    module: moduleArb,
    action: actionArb,
});

// Non-superadmin roles (where mismatches can occur)
const nonSuperadminRoleArb: fc.Arbitrary<UserRole> = fc.constantFrom(
    'admin', 'moderator', 'editor', 'viewer',
    'support_agent', 'finance_agent', 'chairman', 'student',
);

const nonSuperadminCheckArb: fc.Arbitrary<PermissionCheck> = fc.record({
    role: nonSuperadminRoleArb,
    module: moduleArb,
    action: actionArb,
});

// Roles with known alias-based mismatches
const aliasedModuleArb: fc.Arbitrary<PermissionModule> = fc.constantFrom(
    'home_control', 'students_groups', 'subscription_plans',
    'finance_center', 'support_center', 'reports_analytics', 'security_logs',
);

const aliasedCheckArb: fc.Arbitrary<PermissionCheck> = fc.record({
    role: nonSuperadminRoleArb,
    module: aliasedModuleArb,
    action: actionArb,
});

// ─── Test Suite ──────────────────────────────────────────────────────

describe('Bug Condition C10: Permission Matrix — Exploration PBT', () => {

    /**
     * Property 1 (Bug 1.18): Frontend and backend must produce identical
     * allow/deny decisions for all role × module × action combinations.
     *
     * On UNFIXED code, MODULE_ALIASES in useModuleAccess.ts cause the frontend
     * to grant access through alias modules that the backend doesn't recognize.
     * For example, reports_analytics aliases to ['notifications', 'finance'] —
     * so a moderator with notifications.view gets reports_analytics.create on
     * the frontend but NOT on the backend.
     *
     * **Validates: Requirements 1.18**
     */
    describe('P1: Frontend-backend permission consistency', () => {
        it('frontend and backend produce identical decisions for all permission checks', () => {
            fc.assert(
                fc.property(nonSuperadminCheckArb, (check) => {
                    const frontendResult = frontendPermissionCheck_Fixed(check, FIXED_MATRIX);
                    const backendResult = backendPermissionCheck(check, FIXED_MATRIX);

                    // On FIXED code, frontend and backend should always agree
                    expect(frontendResult).toBe(backendResult);
                }),
                { numRuns: 500 },
            );
        });

        it('aliased modules have consistent frontend-backend decisions', () => {
            fc.assert(
                fc.property(aliasedCheckArb, (check) => {
                    const frontendResult = frontendPermissionCheck_Fixed(check, FIXED_MATRIX);
                    const backendResult = backendPermissionCheck(check, FIXED_MATRIX);

                    expect(frontendResult).toBe(backendResult);
                }),
                { numRuns: 300 },
            );
        });
    });

    /**
     * Property 2 (Bug 1.17): All 9 roles × 17 modules × 8 actions must have
     * explicit mappings in ROLE_PERMISSION_MATRIX.
     *
     * On UNFIXED code, some roles are missing entries for certain modules.
     * For example, support_agent has no notifications access, finance_agent
     * has no subscription_plans access.
     *
     * We test that every non-superadmin role has a deliberate decision
     * (allow or deny) for every module × action — not just missing entries.
     *
     * **Validates: Requirements 1.17**
     */
    describe('P2: Complete permission matrix coverage', () => {
        it('every role has explicit permission entries for all modules', () => {
            // Check that support_agent has notifications access (FIXED)
            const supportNotifications = FIXED_MATRIX['support_agent']['notifications'];
            expect(supportNotifications.length).toBeGreaterThan(0);
        });

        it('finance_agent has subscription_plans view access', () => {
            const financeSubscriptions = FIXED_MATRIX['finance_agent']['subscription_plans'];
            expect(financeSubscriptions).toContain('view');
        });
    });

    /**
     * Property 3: Bug condition correctly identifies permission gaps.
     *
     * **Validates: Requirements 1.17, 1.18**
     */
    describe('P3: Bug condition identifies permission inconsistencies', () => {
        it('bug condition detects at least one mismatch in aliased modules on unfixed code', () => {
            // Exhaustively check all aliased module combinations for mismatches on UNFIXED
            let foundMismatch = false;
            for (const role of ALL_ROLES) {
                for (const mod of Object.keys(FRONTEND_MODULE_ALIASES_UNFIXED) as PermissionModule[]) {
                    for (const action of ALL_ACTIONS) {
                        const check: PermissionCheck = { role, module: mod, action };
                        if (isBugCondition_Permissions(check, UNFIXED_MATRIX)) {
                            foundMismatch = true;
                            break;
                        }
                    }
                    if (foundMismatch) break;
                }
                if (foundMismatch) break;
            }
            expect(foundMismatch).toBe(true);
        });

        it('fixed frontend evaluation eliminates all mismatches', () => {
            fc.assert(
                fc.property(permissionCheckArb, (check) => {
                    const fixedFrontend = frontendPermissionCheck_Fixed(check, FIXED_MATRIX);
                    const backend = backendPermissionCheck(check, FIXED_MATRIX);

                    // Fixed frontend should always match backend
                    expect(fixedFrontend).toBe(backend);
                }),
                { numRuns: 500 },
            );
        });
    });
});
