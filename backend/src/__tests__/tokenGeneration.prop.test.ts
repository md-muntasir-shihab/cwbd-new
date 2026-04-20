import { describe, it } from 'vitest';
import fc from 'fast-check';
import { generateCspNonce } from '../middlewares/cspNonce';
import { generateCsrfToken } from '../middlewares/csrfGuard';

/**
 * Property 8: Cryptographic Token Generation Uniqueness
 *
 * Validates: Requirements 1.1, 3.5
 *
 * For any N (N >= 2) consecutive CSP nonce or CSRF token generation calls,
 * all N tokens must be distinct.
 */
describe('Property 8: Cryptographic Token Generation Uniqueness', () => {
    it('generateCspNonce() produces N distinct nonces for any N >= 2', () => {
        fc.assert(
            fc.property(fc.integer({ min: 2, max: 100 }), (n) => {
                const nonces: string[] = [];
                for (let i = 0; i < n; i++) {
                    nonces.push(generateCspNonce());
                }
                const uniqueNonces = new Set(nonces);
                return uniqueNonces.size === n;
            }),
            { numRuns: 20 },
        );
    });

    it('generateCsrfToken() produces N distinct tokens for any N >= 2', () => {
        fc.assert(
            fc.property(fc.integer({ min: 2, max: 100 }), (n) => {
                const tokens: string[] = [];
                for (let i = 0; i < n; i++) {
                    tokens.push(generateCsrfToken());
                }
                const uniqueTokens = new Set(tokens);
                return uniqueTokens.size === n;
            }),
            { numRuns: 20 },
        );
    });
});
