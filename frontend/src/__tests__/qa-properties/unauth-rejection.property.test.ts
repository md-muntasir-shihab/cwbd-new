// Property 10: Unauthenticated Request Rejection
//
// Feature: campusway-qa-audit, Property 10: Unauthenticated Request Rejection
//
// For any protected API endpoint (those requiring authentication), a request
// sent without an Authorization header should return HTTP 401, regardless of
// the endpoint path, HTTP method, or request body.
//
// Validates: Requirements 12.2

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { requestWithoutAuth } from '../../../qa/helpers/api-client';

// ─── Protected endpoints that require authentication ─────────────────

interface ProtectedEndpoint {
    method: string;
    path: string;
}

const PROTECTED_ENDPOINTS: ProtectedEndpoint[] = [
    // Student endpoints
    { method: 'GET', path: '/api/student/profile' },
    { method: 'GET', path: '/api/student/dashboard' },
    { method: 'GET', path: '/api/auth/me' },
    // Admin endpoints
    { method: 'GET', path: '/api/__cw_admin__/settings' },
    { method: 'GET', path: '/api/__cw_admin__/universities' },
    { method: 'GET', path: '/api/__cw_admin__/news' },
    { method: 'GET', path: '/api/__cw_admin__/exams' },
    { method: 'GET', path: '/api/__cw_admin__/reports' },
    { method: 'GET', path: '/api/__cw_admin__/security' },
    { method: 'GET', path: '/api/__cw_admin__/team/members' },
    { method: 'GET', path: '/api/__cw_admin__/payments' },
    { method: 'GET', path: '/api/__cw_admin__/finance' },
    { method: 'GET', path: '/api/__cw_admin__/support-tickets' },
    { method: 'GET', path: '/api/__cw_admin__/notification-center' },
    { method: 'GET', path: '/api/__cw_admin__/resources' },
    { method: 'GET', path: '/api/__cw_admin__/question-bank' },
    { method: 'GET', path: '/api/__cw_admin__/students' },
    // Chairman endpoints
    { method: 'GET', path: '/api/__cw_admin__/reports' },
];

// ─── Property Tests ──────────────────────────────────────────────────

describe('Feature: campusway-qa-audit, Property 10: Unauthenticated Request Rejection', () => {
    it('protected endpoints return 401 without Authorization header', async () => {
        /**
         * **Validates: Requirements 12.2**
         *
         * Strategy: Use fc.constantFrom to pick random protected endpoints,
         * then make requests without any auth headers. Every protected endpoint
         * must respond with 401 Unauthorized.
         */
        await fc.assert(
            fc.asyncProperty(
                fc.constantFrom(...PROTECTED_ENDPOINTS),
                async (endpoint: ProtectedEndpoint) => {
                    const res = await requestWithoutAuth(
                        endpoint.method,
                        endpoint.path,
                        undefined,
                        { timeout: 10_000 },
                    );

                    expect(
                        res.status,
                        `${endpoint.method} ${endpoint.path} without auth should return 401, got ${res.status}`,
                    ).toBe(401);
                },
            ),
            { numRuns: 20 },
        );
    });
});
