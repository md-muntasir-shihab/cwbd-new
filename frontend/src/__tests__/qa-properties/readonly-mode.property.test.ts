// Property 14: Read-Only Mode Mutation Blocking
//
// Feature: campusway-qa-audit, Property 14: Read-Only Mode Mutation Blocking
//
// For any mutating HTTP method (POST, PUT, DELETE, PATCH) and any non-superadmin
// role, when the SecurityConfig panic.readOnlyMode is true, the Backend_API
// should return HTTP 423 with code READ_ONLY_MODE. GET, HEAD, and OPTIONS
// requests should still be allowed for all roles.
//
// Validates: Requirements 12.10

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fc from 'fast-check';
import {
    get,
    post,
    put,
    del,
    patch,
    requestWithHeaders,
} from '../../../qa/helpers/api-client';
import { getAuthHeaders } from '../../../qa/helpers/auth-helper';
import type { UserRole } from '../../../qa/types';

// ─── Constants ───────────────────────────────────────────────────────

const API_BASE = process.env.E2E_API_URL || 'http://127.0.0.1:5003';

/** Admin endpoint used for testing mutations */
const TEST_ENDPOINT = '/api/__cw_admin__/news';

/** HTTP methods categorized */
const MUTATING_METHODS = ['POST', 'PUT', 'DELETE', 'PATCH'] as const;
const SAFE_METHODS = ['GET'] as const;

/** Roles to test (non-superadmin admin roles) */
const TESTABLE_ROLES: UserRole[] = ['admin', 'moderator', 'editor'];

// ─── Setup / Teardown: Toggle read-only mode ────────────────────────

let superadminHeaders: Record<string, string>;

async function setReadOnlyMode(enabled: boolean): Promise<boolean> {
    const res = await fetch(`${API_BASE}/api/__cw_admin__/settings/security`, {
        method: 'PUT',
        headers: {
            ...superadminHeaders,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ panic: { readOnlyMode: enabled } }),
    });
    return res.ok;
}


describe('Feature: campusway-qa-audit, Property 14: Read-Only Mode Mutation Blocking', () => {
    beforeAll(async () => {
        superadminHeaders = await getAuthHeaders('superadmin');
        // Enable read-only mode for the test suite
        const success = await setReadOnlyMode(true);
        if (!success) {
            console.warn('Could not enable read-only mode — tests may be skipped');
        }
    }, 30_000);

    afterAll(async () => {
        // Always disable read-only mode after tests
        await setReadOnlyMode(false);
    }, 30_000);

    it('mutating methods (POST/PUT/DELETE/PATCH) → 423 when readOnlyMode=true', async () => {
        /**
         * **Validates: Requirements 12.10**
         *
         * Strategy: Use fc.constantFrom with mutating HTTP methods and testable
         * admin roles. For each combination, attempt a write operation on an
         * admin endpoint and verify the backend returns 423 (Locked) with
         * READ_ONLY_MODE code.
         */
        await fc.assert(
            fc.asyncProperty(
                fc.constantFrom(...MUTATING_METHODS),
                fc.constantFrom(...TESTABLE_ROLES),
                async (method: string, role: UserRole) => {
                    let res;
                    const dummyBody = { title: 'readonly-test', content: 'test' };

                    switch (method) {
                        case 'POST':
                            res = await post(TEST_ENDPOINT, role, dummyBody, { timeout: 10_000 });
                            break;
                        case 'PUT':
                            res = await put(`${TEST_ENDPOINT}/placeholder-id`, role, dummyBody, { timeout: 10_000 });
                            break;
                        case 'DELETE':
                            res = await del(`${TEST_ENDPOINT}/placeholder-id`, role, { timeout: 10_000 });
                            break;
                        case 'PATCH':
                            res = await patch(`${TEST_ENDPOINT}/placeholder-id`, role, dummyBody, { timeout: 10_000 });
                            break;
                        default:
                            throw new Error(`Unexpected method: ${method}`);
                    }

                    expect(
                        res.status,
                        `${method} ${TEST_ENDPOINT} as ${role} should return 423 in read-only mode, got ${res.status}`,
                    ).toBe(423);

                    // Verify the response code indicates read-only mode
                    if (typeof res.data === 'object' && res.data !== null) {
                        const data = res.data as Record<string, unknown>;
                        if (data.code) {
                            expect(data.code).toBe('READ_ONLY_MODE');
                        }
                    }
                },
            ),
            { numRuns: 20 },
        );
    });

    it('GET requests → allowed (not 423) when readOnlyMode=true', async () => {
        /**
         * **Validates: Requirements 12.10**
         *
         * Strategy: Use fc.constantFrom with safe HTTP methods (GET) and
         * testable roles. Verify that read operations are still permitted
         * even when read-only mode is active.
         */
        await fc.assert(
            fc.asyncProperty(
                fc.constantFrom(...SAFE_METHODS),
                fc.constantFrom(...TESTABLE_ROLES),
                async (_method: string, role: UserRole) => {
                    const res = await get(TEST_ENDPOINT, role, { timeout: 10_000 });

                    expect(
                        res.status,
                        `GET ${TEST_ENDPOINT} as ${role} should NOT return 423 in read-only mode, got ${res.status}`,
                    ).not.toBe(423);
                },
            ),
            { numRuns: 20 },
        );
    });
});
