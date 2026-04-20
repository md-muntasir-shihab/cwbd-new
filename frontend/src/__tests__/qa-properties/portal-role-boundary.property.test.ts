// Property 4: Portal Role Boundary Enforcement
//
// Feature: campusway-qa-audit, Property 4: Portal Role Boundary Enforcement
//
// For any user whose role is not in the allowed set for a login portal,
// attempting to authenticate through that portal should return HTTP 403.
// Specifically:
// - Student role on admin login endpoint → 403
// - Chairman role on admin login endpoint → 403
// - Non-chairman roles on chairman login endpoint → 403
//
// Validates: Requirements 5.12, 5.13

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { requestWithoutAuth } from '../../../qa/helpers/api-client';
import { type UserRole, getSeedUser } from '../../../qa/types';

// ─── Portal / Role Boundary Definitions ─────────────────────────────

/**
 * Roles that are NOT allowed on the admin login portal.
 * Admin portal accepts: superadmin, admin, moderator, editor, viewer,
 * support_agent, finance_agent.
 * Rejects: student, chairman.
 */
const ROLES_REJECTED_BY_ADMIN_PORTAL: UserRole[] = ['student', 'chairman'];

/**
 * Roles that are NOT allowed on the chairman login portal.
 * Chairman portal accepts only: chairman.
 * Rejects: all other roles.
 */
const ROLES_REJECTED_BY_CHAIRMAN_PORTAL: UserRole[] = [
    'superadmin',
    'admin',
    'moderator',
    'editor',
    'viewer',
    'support_agent',
    'finance_agent',
    'student',
];

interface PortalRolePair {
    endpoint: string;
    portalName: string;
    role: UserRole;
}

/** All unauthorized role/portal combinations */
const UNAUTHORIZED_PAIRS: PortalRolePair[] = [
    ...ROLES_REJECTED_BY_ADMIN_PORTAL.map((role) => ({
        endpoint: '/api/auth/admin/login',
        portalName: 'admin',
        role,
    })),
    ...ROLES_REJECTED_BY_CHAIRMAN_PORTAL.map((role) => ({
        endpoint: '/api/auth/chairman/login',
        portalName: 'chairman',
        role,
    })),
];

// ─── Property Tests ──────────────────────────────────────────────────

describe('Feature: campusway-qa-audit, Property 4: Portal Role Boundary Enforcement', () => {
    it('unauthorized roles receive 403 on portal-specific login endpoints', async () => {
        /**
         * **Validates: Requirements 5.12, 5.13**
         *
         * Strategy: Use fc.constantFrom() to generate unauthorized role/portal
         * combinations, then POST valid credentials to the wrong portal and
         * verify the response is 403.
         */
        await fc.assert(
            fc.asyncProperty(
                fc.constantFrom(...UNAUTHORIZED_PAIRS),
                async (pair: PortalRolePair) => {
                    const seedUser = getSeedUser(pair.role);

                    const res = await requestWithoutAuth('POST', pair.endpoint, {
                        identifier: seedUser.email,
                        password: seedUser.password,
                    });

                    expect(res.status).toBe(403);
                },
            ),
            { numRuns: 20 },
        );
    });
});
