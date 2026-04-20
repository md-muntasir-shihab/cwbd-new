// Property 11: Tampered JWT Rejection
//
// Feature: campusway-qa-audit, Property 11: Tampered JWT Rejection
//
// For any valid JWT token, if the payload is modified (e.g., changing role,
// userId, or expiry) or the signature is altered, the Backend_API should
// return HTTP 401 when the tampered token is used for authentication.
//
// Validates: Requirements 12.3

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { requestWithHeaders } from '../../../qa/helpers/api-client';

// ─── JWT Tampering Helpers ───────────────────────────────────────────

/**
 * Create a tampered JWT by modifying the payload portion.
 * A JWT has three base64url-encoded parts: header.payload.signature
 * We modify the payload with random data, which invalidates the signature.
 */
function tamperJwtPayload(validToken: string, randomPayload: string): string {
    const parts = validToken.split('.');
    if (parts.length !== 3) return validToken;

    // Encode the random payload as base64url to replace the original payload
    const tamperedPayload = Buffer.from(randomPayload).toString('base64url');
    return `${parts[0]}.${tamperedPayload}.${parts[2]}`;
}

/**
 * Create a tampered JWT by corrupting the signature portion.
 */
function tamperJwtSignature(validToken: string, randomSuffix: string): string {
    const parts = validToken.split('.');
    if (parts.length !== 3) return validToken;

    // Append random chars to the signature to invalidate it
    const safeChars = randomSuffix.replace(/[^a-zA-Z0-9_-]/g, 'x');
    return `${parts[0]}.${parts[1]}.${parts[2]}${safeChars || 'tampered'}`;
}

// ─── Protected endpoint for testing ──────────────────────────────────

const TEST_ENDPOINT = '/api/auth/me';

// ─── Property Tests ──────────────────────────────────────────────────

describe('Feature: campusway-qa-audit, Property 11: Tampered JWT Rejection', () => {
    /**
     * We obtain a real token once, then tamper it in various ways.
     * Using a module-level import to get auth headers for a valid token.
     */
    let validToken: string;

    // Get a valid token before running property tests
    const { getAuthHeaders } = require('../../../qa/helpers/auth-helper');

    beforeAll(async () => {
        const headers = await getAuthHeaders('admin');
        validToken = headers.Authorization.replace('Bearer ', '');
    }, 30_000);

    it('tampered JWT payload → 401 rejection', async () => {
        /**
         * **Validates: Requirements 12.3**
         *
         * Strategy: Use fc.string() to generate random payload modifications,
         * replace the JWT payload section, and verify the backend rejects
         * the tampered token with 401.
         */
        await fc.assert(
            fc.asyncProperty(
                fc.string({ minLength: 1, maxLength: 200 }),
                async (randomPayload: string) => {
                    const tamperedToken = tamperJwtPayload(validToken, randomPayload);

                    const res = await requestWithHeaders(
                        'GET',
                        TEST_ENDPOINT,
                        { Authorization: `Bearer ${tamperedToken}` },
                        undefined,
                        { timeout: 10_000 },
                    );

                    expect(
                        res.status,
                        `Tampered JWT payload should be rejected with 401, got ${res.status}`,
                    ).toBe(401);
                },
            ),
            { numRuns: 20 },
        );
    });

    it('tampered JWT signature → 401 rejection', async () => {
        /**
         * **Validates: Requirements 12.3**
         *
         * Strategy: Use fc.string() to generate random signature modifications,
         * corrupt the JWT signature section, and verify 401 rejection.
         */
        await fc.assert(
            fc.asyncProperty(
                fc.string({ minLength: 1, maxLength: 50 }),
                async (randomSuffix: string) => {
                    const tamperedToken = tamperJwtSignature(validToken, randomSuffix);

                    const res = await requestWithHeaders(
                        'GET',
                        TEST_ENDPOINT,
                        { Authorization: `Bearer ${tamperedToken}` },
                        undefined,
                        { timeout: 10_000 },
                    );

                    expect(
                        res.status,
                        `Tampered JWT signature should be rejected with 401, got ${res.status}`,
                    ).toBe(401);
                },
            ),
            { numRuns: 20 },
        );
    });
});
