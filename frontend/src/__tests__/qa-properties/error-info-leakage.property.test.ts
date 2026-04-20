// Property 12: Error Response Information Leakage Prevention
//
// Feature: campusway-qa-audit, Property 12: Error Response Information Leakage Prevention
//
// For any API error response (4xx or 5xx status), the response body should not
// contain stack traces, internal file paths, or server implementation details.
// Specifically, the response JSON should not contain strings matching patterns
// like /home/, /usr/, /app/src/, at Object., at Module., or Error:.*\n.*at .
//
// Validates: Requirements 12.5

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { requestWithoutAuth, requestWithHeaders } from '../../../qa/helpers/api-client';

// ─── Endpoints that are likely to produce error responses ────────────

interface ErrorEndpoint {
    method: string;
    path: string;
    description: string;
}

const ERROR_ENDPOINTS: ErrorEndpoint[] = [
    // 401 — unauthenticated access
    { method: 'GET', path: '/api/auth/me', description: 'auth/me without token' },
    { method: 'GET', path: '/api/student/dashboard', description: 'student dashboard without token' },
    { method: 'GET', path: '/api/__cw_admin__/universities', description: 'admin universities without token' },
    { method: 'GET', path: '/api/__cw_admin__/settings', description: 'admin settings without token' },
    // 404 — non-existent resources
    { method: 'GET', path: '/api/exams/000000000000000000000000', description: 'non-existent exam' },
    { method: 'GET', path: '/api/news/non-existent-slug-xyz', description: 'non-existent news' },
    { method: 'GET', path: '/api/universities/non-existent-slug', description: 'non-existent university' },
    { method: 'GET', path: '/api/resources/non-existent-slug', description: 'non-existent resource' },
    { method: 'GET', path: '/api/help-center/non-existent-article', description: 'non-existent help article' },
    // 400 — bad request payloads
    { method: 'POST', path: '/api/auth/login', description: 'login with empty body' },
    { method: 'POST', path: '/api/contact', description: 'contact with empty body' },
    { method: 'POST', path: '/api/auth/register', description: 'register with empty body' },
    // Invalid paths
    { method: 'GET', path: '/api/nonexistent-endpoint', description: 'completely invalid endpoint' },
];

// ─── Patterns that indicate information leakage ─────────────────────

const LEAKAGE_PATTERNS = [
    /\/home\//i,
    /\/usr\//i,
    /\/app\/src\//i,
    /\/node_modules\//i,
    /at Object\./,
    /at Module\./,
    /at Function\./,
    /at process\./,
    /at Layer\.handle/,
    /at Route\.dispatch/,
    /Error:.*\n.*at /,
    /\.ts:\d+:\d+/,
    /\.js:\d+:\d+/,
    /node:internal/,
    /mongoose.*Error/i,
    /MongoServerError/,
    /BSON/,
    /stack.*trace/i,
];


/**
 * Check if a response body string contains any leakage patterns.
 */
function containsLeakage(bodyStr: string): { leaked: boolean; pattern?: string } {
    for (const pattern of LEAKAGE_PATTERNS) {
        if (pattern.test(bodyStr)) {
            return { leaked: true, pattern: pattern.source };
        }
    }
    return { leaked: false };
}

// ─── Property Tests ──────────────────────────────────────────────────

describe('Feature: campusway-qa-audit, Property 12: Error Response Information Leakage Prevention', () => {
    it('error responses do not contain stack traces, file paths, or implementation details', async () => {
        /**
         * **Validates: Requirements 12.5**
         *
         * Strategy: Use fc.constantFrom to pick random error-producing endpoints,
         * make requests without auth (to trigger 401) or with bad data (to trigger
         * 400/404), then inspect the response body for leakage patterns.
         */
        await fc.assert(
            fc.asyncProperty(
                fc.constantFrom(...ERROR_ENDPOINTS),
                async (endpoint: ErrorEndpoint) => {
                    let res;

                    if (endpoint.method === 'GET') {
                        res = await requestWithoutAuth(
                            'GET',
                            endpoint.path,
                            undefined,
                            { timeout: 10_000 },
                        );
                    } else {
                        // POST with empty/minimal body to trigger validation errors
                        res = await requestWithoutAuth(
                            'POST',
                            endpoint.path,
                            {},
                            { timeout: 10_000 },
                        );
                    }

                    // Only check error responses (4xx, 5xx)
                    if (res.status >= 400) {
                        const bodyStr =
                            typeof res.data === 'string'
                                ? res.data
                                : JSON.stringify(res.data);

                        const check = containsLeakage(bodyStr);
                        expect(
                            check.leaked,
                            `${endpoint.method} ${endpoint.path} (${res.status}) leaks info via pattern: ${check.pattern}\nBody: ${bodyStr.substring(0, 500)}`,
                        ).toBe(false);
                    }
                },
            ),
            { numRuns: 20 },
        );
    });

    it('tampered token error responses do not leak server details', async () => {
        /**
         * **Validates: Requirements 12.5**
         *
         * Strategy: Send requests with malformed Authorization headers to
         * trigger auth errors, then verify no leakage in the error response.
         */
        const PROTECTED_PATHS = [
            '/api/auth/me',
            '/api/student/dashboard',
            '/api/__cw_admin__/universities',
        ];

        await fc.assert(
            fc.asyncProperty(
                fc.constantFrom(...PROTECTED_PATHS),
                fc.string({ minLength: 5, maxLength: 100 }),
                async (path: string, junkToken: string) => {
                    const res = await requestWithHeaders(
                        'GET',
                        path,
                        { Authorization: `Bearer ${junkToken}` },
                        undefined,
                        { timeout: 10_000 },
                    );

                    if (res.status >= 400) {
                        const bodyStr =
                            typeof res.data === 'string'
                                ? res.data
                                : JSON.stringify(res.data);

                        const check = containsLeakage(bodyStr);
                        expect(
                            check.leaked,
                            `${path} with junk token leaks info via pattern: ${check.pattern}`,
                        ).toBe(false);
                    }
                },
            ),
            { numRuns: 20 },
        );
    });
});
