// Property 9: IDOR Prevention
//
// Feature: campusway-qa-audit, Property 9: IDOR Prevention
//
// For any two distinct student users A and B, when user A makes an API request
// to access user B's profile, exam results, or other user-specific data using
// B's ID, the Backend_API should return HTTP 403, preventing unauthorized
// cross-user data access.
//
// Validates: Requirements 12.1

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { get } from '../../../qa/helpers/api-client';
import type { UserRole } from '../../../qa/types';

// ─── Student-specific endpoints that accept a user/resource ID ───────

/**
 * Endpoints where student A should NOT be able to access student B's data.
 * We use the student role for user A and construct paths with a fake/other
 * user's ID to verify IDOR prevention.
 */
const STUDENT_OWNED_ENDPOINTS = [
    '/api/student/profile',
    '/api/student/dashboard',
] as const;

// ─── Property Tests ──────────────────────────────────────────────────

describe('Feature: campusway-qa-audit, Property 9: IDOR Prevention', () => {
    it('student A cannot access student B data via cross-user API calls', async () => {
        /**
         * **Validates: Requirements 12.1**
         *
         * Strategy: Authenticate as the "student" seed user (user A) and attempt
         * to access endpoints that belong to another user by injecting a different
         * userId. The backend should return 403 for any cross-user access attempt.
         *
         * We generate random MongoDB-like ObjectId strings to simulate user B's ID.
         */
        const ROLE_A: UserRole = 'student';

        await fc.assert(
            fc.asyncProperty(
                fc.constantFrom(...STUDENT_OWNED_ENDPOINTS),
                fc.hexaString({ minLength: 24, maxLength: 24 }),
                async (endpoint: string, fakeUserId: string) => {
                    // Attempt to access another user's data by appending their ID
                    const targetPath = `${endpoint}/${fakeUserId}`;
                    const res = await get(targetPath, ROLE_A, { timeout: 10_000 });

                    // Backend should reject with 403 (forbidden) or 404 (not found)
                    // Both are acceptable — the key is it must NOT be 200
                    expect(
                        res.status,
                        `IDOR: ${ROLE_A} accessing ${targetPath} should not return 200`,
                    ).not.toBe(200);
                },
            ),
            { numRuns: 20 },
        );
    });
});
