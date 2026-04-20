// Property 5: Suspended/Blocked User Login Rejection
//
// Feature: campusway-qa-audit, Property 5: Suspended/Blocked User Login Rejection
//
// For any user with status "suspended" or "blocked", attempting to login
// through any portal (student, admin, chairman) should return HTTP 403
// with an appropriate rejection message, regardless of whether the
// credentials are correct.
//
// Validates: Requirements 5.14
//
// NOTE: This test requires suspended/blocked test users to exist in the
// database. The seed data generator creates users with status "active".
// To fully exercise this property, you need to either:
//   1. Seed dedicated suspended/blocked users, or
//   2. Temporarily update existing seed users' status before running.
// The test uses pragmatic suspended/blocked user credentials that mirror
// the seed user pattern but with status-specific usernames/emails.

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { requestWithoutAuth } from '../../../qa/helpers/api-client';
import type { UserStatus } from '../../../qa/types';

// ─── Types ───────────────────────────────────────────────────────────

type RejectedStatus = Extract<UserStatus, 'suspended' | 'blocked'>;

interface PortalConfig {
    endpoint: string;
    portalName: string;
}

interface SuspendedLoginCase {
    status: RejectedStatus;
    portal: PortalConfig;
}

// ─── Portal Definitions ─────────────────────────────────────────────

const PORTALS: PortalConfig[] = [
    { endpoint: '/api/auth/login', portalName: 'student' },
    { endpoint: '/api/auth/admin/login', portalName: 'admin' },
    { endpoint: '/api/auth/chairman/login', portalName: 'chairman' },
];

const REJECTED_STATUSES: RejectedStatus[] = ['suspended', 'blocked'];

/**
 * Build all (status × portal) combinations for property generation.
 * Total: 2 statuses × 3 portals = 6 unique cases.
 */
const ALL_CASES: SuspendedLoginCase[] = REJECTED_STATUSES.flatMap((status) =>
    PORTALS.map((portal) => ({ status, portal })),
);

// ─── Credentials for suspended/blocked test users ────────────────────
//
// These follow the seed user naming convention but with status prefix.
// The backend checks user.status BEFORE portal-role validation, so the
// 403 should fire regardless of role mismatch.

function getTestCredentials(status: RejectedStatus): {
    identifier: string;
    password: string;
} {
    // Use seed-pattern credentials for suspended/blocked users.
    // These users must be pre-seeded with the corresponding status.
    if (status === 'suspended') {
        return {
            identifier: 'qa-suspended@campusway.test',
            password: 'QaSusp@123',
        };
    }
    return {
        identifier: 'qa-blocked@campusway.test',
        password: 'QaBlock@123',
    };
}

// ─── Property Test ───────────────────────────────────────────────────

describe('Feature: campusway-qa-audit, Property 5: Suspended/Blocked User Login Rejection', () => {
    it('suspended/blocked users receive 403 on all login portals', async () => {
        /**
         * **Validates: Requirements 5.14**
         *
         * Strategy: Use fc.constantFrom() to generate all combinations of
         * (status: suspended|blocked) × (portal: student|admin|chairman),
         * then POST credentials to each portal and verify 403 response.
         *
         * The backend login handler checks user.status early in the flow:
         *   if (status === 'suspended' || status === 'blocked') → 403
         * with message: "Account is suspended or blocked. Contact support."
         */
        await fc.assert(
            fc.asyncProperty(
                fc.constantFrom(...ALL_CASES),
                async (testCase: SuspendedLoginCase) => {
                    const creds = getTestCredentials(testCase.status);

                    const res = await requestWithoutAuth(
                        'POST',
                        testCase.portal.endpoint,
                        {
                            identifier: creds.identifier,
                            password: creds.password,
                        },
                    );

                    // Suspended/blocked users should get 403.
                    // If the user doesn't exist in DB, we may get 401 instead.
                    // We accept 403 as the expected property outcome.
                    // A 401 means the test user isn't seeded — the test documents
                    // this requirement rather than silently passing.
                    expect(
                        res.status,
                        `Expected 403 for ${testCase.status} user on ${testCase.portal.portalName} portal, got ${res.status}`,
                    ).toBe(403);
                },
            ),
            { numRuns: 20 },
        );
    });
});
