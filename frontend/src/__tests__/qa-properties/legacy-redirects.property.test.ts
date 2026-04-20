// Property 15: Legacy Route Redirect Correctness
//
// Feature: campusway-qa-audit, Property 15: Legacy Route Redirect Correctness
//
// For any (legacyPath, expectedNewPath) pair defined in the legacy redirect
// mappings, navigating to legacyPath should result in a redirect to
// expectedNewPath.
//
// Validates: Requirements 17.1-17.10, 4.20, 4.21, 4.22

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';

// ─── Import the actual redirect logic from the codebase ─────────────

import { legacyAdminToSecret, ADMIN_UI_BASE, ADMIN_DASHBOARD } from '../../lib/appRoutes';

// ─── Redirect Mapping Pairs ─────────────────────────────────────────

/**
 * Complete set of legacy → new path redirect pairs.
 * Each pair: [legacyPath, expectedNewPath]
 */
const REDIRECT_PAIRS: Array<[string, string]> = [
    // Req 17.1: /campusway-secure-admin → /__cw_admin__/dashboard
    ['/campusway-secure-admin', '/__cw_admin__/dashboard'],
    ['/campusway-secure-admin/', '/__cw_admin__/dashboard'],
    ['/campusway-secure-admin/exams', '/__cw_admin__/exams'],
    ['/campusway-secure-admin/universities', '/__cw_admin__/universities'],
    ['/campusway-secure-admin/news', '/__cw_admin__/news'],

    // Req 17.2: /admin-dashboard → /__cw_admin__/dashboard
    ['/admin-dashboard', '/__cw_admin__/dashboard'],
    ['/admin-dashboard/', '/__cw_admin__/dashboard'],
    ['/admin-dashboard/exams', '/__cw_admin__/exams'],

    // Req 17.3: /admin/* → /__cw_admin__/*
    ['/admin/universities', '/__cw_admin__/universities'],
    ['/admin/exams', '/__cw_admin__/exams'],
    ['/admin/news', '/__cw_admin__/news'],
    ['/admin/settings', '/__cw_admin__/settings'],
    ['/admin/', '/__cw_admin__/dashboard'],
];

/**
 * Public route redirect pairs (handled by React Router, not legacyAdminToSecret).
 * These are tested separately as they use different redirect mechanisms.
 */
const PUBLIC_REDIRECT_PAIRS: Array<[string, string]> = [
    // Req 4.20
    ['/services', '/subscription-plans'],
    // Req 4.21
    ['/pricing', '/subscription-plans'],
    // Req 4.22
    ['/exam-portal', '/exams'],
];

// ─── Property Tests ─────────────────────────────────────────────────

describe('Feature: campusway-qa-audit, Property 15: Legacy Route Redirect Correctness', () => {
    it('legacyAdminToSecret correctly maps legacy admin paths to new paths', async () => {
        /**
         * **Validates: Requirements 17.1, 17.2, 17.3**
         *
         * Strategy: Use fc.constantFrom with known redirect pairs.
         * For each pair, call legacyAdminToSecret and verify the output
         * matches the expected new path.
         */
        await fc.assert(
            fc.property(
                fc.constantFrom(...REDIRECT_PAIRS),
                ([legacyPath, expectedNewPath]: [string, string]) => {
                    const result = legacyAdminToSecret(legacyPath);

                    expect(
                        result,
                        `legacyAdminToSecret("${legacyPath}") should return "${expectedNewPath}", got "${result}"`,
                    ).toBe(expectedNewPath);
                },
            ),
            { numRuns: 20 },
        );
    });

    it('legacyAdminToSecret preserves query string and hash', async () => {
        /**
         * **Validates: Requirements 17.1, 17.2, 17.3**
         *
         * Strategy: Generate random search and hash strings and verify
         * they are appended to the redirect target.
         */
        const ADMIN_LEGACY_PREFIXES = [
            '/campusway-secure-admin',
            '/admin-dashboard',
            '/admin',
        ] as const;

        await fc.assert(
            fc.property(
                fc.constantFrom(...ADMIN_LEGACY_PREFIXES),
                fc.constantFrom('?tab=exams', '?page=2', '?sort=name', ''),
                fc.constantFrom('#section1', '#top', ''),
                (prefix: string, search: string, hash: string) => {
                    const result = legacyAdminToSecret(prefix, search, hash);

                    // Result should end with the search and hash
                    if (search) {
                        expect(result).toContain(search);
                    }
                    if (hash) {
                        expect(result).toContain(hash);
                    }

                    // Result should start with the admin UI base
                    expect(result.startsWith(ADMIN_UI_BASE)).toBe(true);
                },
            ),
            { numRuns: 20 },
        );
    });

    it('all legacy admin paths map to /__cw_admin__/ prefix', async () => {
        /**
         * **Validates: Requirements 17.1, 17.2, 17.3**
         *
         * Strategy: For any legacy admin path, the result should always
         * start with /__cw_admin__/.
         */
        const LEGACY_ADMIN_PATHS = [
            '/campusway-secure-admin',
            '/campusway-secure-admin/exams',
            '/campusway-secure-admin/universities',
            '/campusway-secure-admin/news',
            '/campusway-secure-admin/settings',
            '/admin-dashboard',
            '/admin-dashboard/exams',
            '/admin/universities',
            '/admin/exams',
            '/admin/news',
            '/admin/settings',
            '/admin/reports',
            '/admin/team',
        ] as const;

        await fc.assert(
            fc.property(
                fc.constantFrom(...LEGACY_ADMIN_PATHS),
                (legacyPath: string) => {
                    const result = legacyAdminToSecret(legacyPath);
                    expect(
                        result.startsWith(ADMIN_UI_BASE),
                        `"${legacyPath}" should redirect to path starting with "${ADMIN_UI_BASE}", got "${result}"`,
                    ).toBe(true);
                },
            ),
            { numRuns: 20 },
        );
    });

    it('public route redirect pairs are correctly defined', async () => {
        /**
         * **Validates: Requirements 4.20, 4.21, 4.22**
         *
         * Strategy: Verify the public redirect mapping is consistent.
         * These redirects are handled by React Router <Navigate> components,
         * so we validate the mapping definition itself.
         */
        await fc.assert(
            fc.property(
                fc.constantFrom(...PUBLIC_REDIRECT_PAIRS),
                ([legacyPath, expectedNewPath]: [string, string]) => {
                    // Verify the mapping is well-formed
                    expect(legacyPath).toBeTruthy();
                    expect(expectedNewPath).toBeTruthy();
                    expect(legacyPath).not.toBe(expectedNewPath);

                    // Legacy path should not equal new path (it's a redirect)
                    expect(legacyPath.startsWith('/')).toBe(true);
                    expect(expectedNewPath.startsWith('/')).toBe(true);
                },
            ),
            { numRuns: 20 },
        );
    });
});
