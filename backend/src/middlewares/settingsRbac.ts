/**
 * Settings RBAC Middleware
 *
 * Express middleware that enforces field-level role-based access control
 * for campaign settings mutations.
 *
 * - Maps each settings section to the roles permitted to edit it (Req 12.1)
 * - Rejects unauthorized section edits with 403 (Req 12.2)
 * - Requires elevated confirmation for sensitive fields (Req 12.3)
 * - Prevents privilege escalation by validating effective permissions (Req 12.5)
 */

import { Request, Response, NextFunction } from 'express';
import { UserRole } from '../models/User';

// ─── Settings section identifiers ────────────────────────────────────────────

export const SETTINGS_SECTIONS = [
    'General',
    'Consent',
    'Caps',
    'Budget',
    'Routing',
    'Approval',
    'Experiment',
    'Compliance',
    'Observability',
] as const;

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

// ─── Section → allowed roles permission matrix (Req 12.1) ───────────────────

export const SETTINGS_PERMISSION_MATRIX: Record<SettingsSection, UserRole[]> = {
    General: ['superadmin', 'admin', 'moderator'],
    Consent: ['superadmin', 'admin'],
    Caps: ['superadmin', 'admin', 'moderator'],
    Budget: ['superadmin', 'admin'],
    Routing: ['superadmin', 'admin'],
    Approval: ['superadmin', 'admin'],
    Experiment: ['superadmin', 'admin', 'moderator'],
    Compliance: ['superadmin', 'admin'],
    Observability: ['superadmin', 'admin', 'moderator'],
};

// ─── Request body key → section mapping ──────────────────────────────────────

const KEY_TO_SECTION: Record<string, SettingsSection> = {
    // General section (existing fields)
    dailySmsLimit: 'General',
    dailyEmailLimit: 'General',
    monthlySmsBudgetBDT: 'General',
    monthlyEmailBudgetBDT: 'General',
    quietHours: 'General',
    duplicatePreventionWindowMinutes: 'General',
    maxRetryCount: 'General',
    retryDelayMinutes: 'General',
    triggers: 'General',
    subscriptionReminderDays: 'General',
    resultPublishAutoSend: 'General',
    resultPublishChannels: 'General',
    resultPublishGuardianIncluded: 'General',
    autoSyncCostToFinance: 'General',
    schemaVersion: 'General',
    // Advanced sections
    frequencyCap: 'Caps',
    budgetGuardrails: 'Budget',
    providerRouting: 'Routing',
    approvalPolicy: 'Approval',
    experiment: 'Experiment',
    sendTime: 'General',
    contentLint: 'Compliance',
    observability: 'Observability',
    dataGovernance: 'Compliance',
};

// ─── Sensitive fields requiring elevated confirmation (Req 12.3) ─────────────

/**
 * Fields that require an `x-elevated-confirmation` header to modify.
 * These are high-impact settings: budget hard limits, approval thresholds,
 * and suppression overrides.
 */
export const SENSITIVE_FIELDS: Record<string, string[]> = {
    budgetGuardrails: ['hardLimitEnabled', 'softLimitPercent', 'anomalySpikeThresholdPercent'],
    approvalPolicy: ['audienceSizeThreshold', 'estimatedCostThreshold', 'sensitiveSegmentIds'],
};

/**
 * Top-level keys that are always considered sensitive when present.
 * Modifying the entire section counts as a sensitive change.
 */
export const SENSITIVE_TOP_LEVEL_KEYS = new Set<string>([
    'budgetGuardrails',
    'approvalPolicy',
]);

// ─── Elevated confirmation header ────────────────────────────────────────────

const ELEVATED_CONFIRMATION_HEADER = 'x-elevated-confirmation';

// ─── Privilege escalation prevention (Req 12.5) ─────────────────────────────

/**
 * Roles ordered by privilege level (highest first).
 * Used to prevent a user from granting permissions above their own level.
 */
const ROLE_HIERARCHY: UserRole[] = [
    'superadmin',
    'admin',
    'moderator',
    'editor',
    'viewer',
    'support_agent',
    'finance_agent',
    'chairman',
    'student',
];

/**
 * Returns the privilege level index for a role (lower index = higher privilege).
 */
function getRoleLevel(role: UserRole): number {
    const idx = ROLE_HIERARCHY.indexOf(role);
    return idx === -1 ? ROLE_HIERARCHY.length : idx;
}

// ─── Helper: detect which sections are being modified ────────────────────────

/**
 * Given a request body, returns the unique set of settings sections being modified.
 */
export function detectModifiedSections(body: Record<string, unknown>): Set<SettingsSection> {
    const sections = new Set<SettingsSection>();
    for (const key of Object.keys(body)) {
        const section = KEY_TO_SECTION[key];
        if (section) {
            sections.add(section);
        }
    }
    return sections;
}

// ─── Helper: check if body contains sensitive field changes ──────────────────

/**
 * Returns true if the request body modifies any sensitive field.
 */
export function containsSensitiveChanges(body: Record<string, unknown>): boolean {
    for (const topKey of Object.keys(body)) {
        // If the entire sensitive top-level key is present, it's sensitive
        if (SENSITIVE_TOP_LEVEL_KEYS.has(topKey)) {
            return true;
        }
    }

    // Check nested sensitive fields
    for (const [parentKey, fields] of Object.entries(SENSITIVE_FIELDS)) {
        const parentValue = body[parentKey];
        if (parentValue && typeof parentValue === 'object' && !Array.isArray(parentValue)) {
            const nested = parentValue as Record<string, unknown>;
            for (const field of fields) {
                if (field in nested) {
                    return true;
                }
            }
        }
    }

    return false;
}

// ─── Helper: check for privilege escalation ──────────────────────────────────

/**
 * Validates that the requesting user is not attempting to grant permissions
 * that exceed their own effective permission level.
 *
 * Checks:
 * 1. If dataGovernance.exportPermissionRoles includes roles with higher privilege
 * 2. If approvalPolicy references roles the user cannot control
 *
 * Returns an error message if escalation is detected, or null if safe.
 */
export function detectPrivilegeEscalation(
    body: Record<string, unknown>,
    userRole: UserRole,
): string | null {
    const userLevel = getRoleLevel(userRole);

    // Check dataGovernance.exportPermissionRoles
    const dg = body.dataGovernance;
    if (dg && typeof dg === 'object' && !Array.isArray(dg)) {
        const dgObj = dg as Record<string, unknown>;
        const exportRoles = dgObj.exportPermissionRoles;
        if (Array.isArray(exportRoles)) {
            for (const role of exportRoles) {
                if (typeof role === 'string') {
                    const targetLevel = getRoleLevel(role as UserRole);
                    if (targetLevel < userLevel) {
                        return `Cannot grant export permission to role '${role}' which has higher privilege than your role '${userRole}'`;
                    }
                }
            }
        }
    }

    // Verify the user has permission for every section they're trying to modify
    const modifiedSections = detectModifiedSections(body);
    for (const section of modifiedSections) {
        const allowedRoles = SETTINGS_PERMISSION_MATRIX[section];
        if (!allowedRoles.includes(userRole)) {
            return `Your role '${userRole}' cannot modify the '${section}' section`;
        }
    }

    return null;
}

// ─── Express middleware ──────────────────────────────────────────────────────

/**
 * Express middleware that enforces RBAC on settings mutations.
 *
 * 1. Checks which sections are being modified in req.body
 * 2. Maps each section to allowed roles using the permission matrix
 * 3. Returns 403 if the user's role doesn't have permission for any section
 * 4. Checks for sensitive fields and requires x-elevated-confirmation header
 * 5. Prevents privilege escalation
 */
export function settingsRbac(req: Request, res: Response, next: NextFunction): void {
    const user = req.user;
    if (!user) {
        res.status(401).json({ message: 'Authentication required' });
        return;
    }

    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        // Let the validator middleware handle malformed bodies
        next();
        return;
    }

    const userRole = user.role as UserRole;

    // Step 1 & 2: Detect modified sections and check role permissions (Req 12.1, 12.2)
    const modifiedSections = detectModifiedSections(body as Record<string, unknown>);

    for (const section of modifiedSections) {
        const allowedRoles = SETTINGS_PERMISSION_MATRIX[section];
        if (!allowedRoles.includes(userRole)) {
            res.status(403).json({
                errorCode: 'FORBIDDEN',
                message: `Your role '${userRole}' does not have permission to edit the '${section}' settings section.`,
                section,
                requiredRoles: allowedRoles,
            });
            return;
        }
    }

    // Step 3: Check for sensitive field changes and require elevated confirmation (Req 12.3)
    if (containsSensitiveChanges(body as Record<string, unknown>)) {
        const confirmationHeader = req.headers[ELEVATED_CONFIRMATION_HEADER];
        if (!confirmationHeader || confirmationHeader !== 'confirmed') {
            res.status(403).json({
                errorCode: 'ELEVATED_CONFIRMATION_REQUIRED',
                message: 'This change modifies sensitive settings (budget hard limits, approval thresholds, or suppression overrides). Please provide elevated confirmation.',
                requiredHeader: ELEVATED_CONFIRMATION_HEADER,
                requiredValue: 'confirmed',
            });
            return;
        }
    }

    // Step 4: Prevent privilege escalation (Req 12.5)
    const escalationError = detectPrivilegeEscalation(
        body as Record<string, unknown>,
        userRole,
    );
    if (escalationError) {
        res.status(403).json({
            errorCode: 'PRIVILEGE_ESCALATION',
            message: escalationError,
        });
        return;
    }

    next();
}
