/**
 * Property-based tests for integration connectors.
 *
 * Feature: integration-panel-audit, Property 4: connector result validity
 *
 * **Validates: Requirements 3.3, 3.4**
 *
 * For any valid IntegrationKey and any config/secrets input (including missing
 * or malformed values), runConnectionTest should return a { status, message }
 * object with status being one of 'success', 'failed', or 'skipped', and
 * should never throw an unhandled exception.
 */
import * as fc from 'fast-check';
import { runConnectionTest } from '../src/services/integrations/connectors/index';
import { INTEGRATION_KEYS } from '../src/services/integrations/integrationsRegistry';
import type { IntegrationKey } from '../src/models/IntegrationConfig';

// Mock globalThis.fetch to avoid real network calls during property tests
const mockFetch = jest.fn();
(globalThis as unknown as { fetch: typeof fetch }).fetch = mockFetch;

beforeEach(() => {
    mockFetch.mockReset();
    // Default: simulate a network error (connection refused)
    mockFetch.mockRejectedValue(new Error('connect ECONNREFUSED'));
});

const VALID_STATUSES = ['success', 'failed', 'skipped'] as const;

describe('Property 4: Connector result validity — runConnectionTest returns valid result without throwing', () => {
    // Arbitrary for integration keys
    const arbKey = fc.constantFrom(...INTEGRATION_KEYS);

    // Arbitrary for config objects (may have valid or invalid values)
    const arbConfig = fc.dictionary(
        fc.constantFrom('baseUrl', 'host', 'port', 'bucket', 'region', 'endpoint', 'cloudName', 'websiteId', 'domain', 'environmentId', 'indexPrefix', 'defaultListId', 'allowRemote', 'allowedDomains', 'secure', 'fromAddress', 'fromName'),
        fc.oneof(
            fc.string({ minLength: 0, maxLength: 100 }),
            fc.constant('https://example.com'),
            fc.constant(''),
            fc.nat().map(String),
            fc.boolean().map(String),
        ),
        { minKeys: 0, maxKeys: 6 },
    );

    // Arbitrary for secrets objects
    const arbSecrets = fc.dictionary(
        fc.constantFrom('apiKey', 'masterKey', 'searchKey', 'signingKey', 'signingSalt', 'username', 'password', 'keyId', 'applicationKey', 'apiSecret'),
        fc.oneof(
            fc.string({ minLength: 0, maxLength: 100 }),
            fc.constant(''),
        ),
        { minKeys: 0, maxKeys: 4 },
    );

    it('always returns a valid { status, message } object and never throws', async () => {
        await fc.assert(
            fc.asyncProperty(arbKey, arbConfig, arbSecrets, async (key, config, secrets) => {
                // Should never throw
                const result = await runConnectionTest(key as IntegrationKey, config, secrets);

                // Result must be an object with status and message
                expect(result).toBeDefined();
                expect(typeof result).toBe('object');
                expect(result).toHaveProperty('status');
                expect(result).toHaveProperty('message');

                // Status must be one of the valid values
                expect(VALID_STATUSES).toContain(result.status);

                // Message must be a string
                expect(typeof result.message).toBe('string');
                expect(result.message.length).toBeGreaterThan(0);
            }),
            { numRuns: 100 },
        );
    });

    it('returns valid result even with completely empty config and secrets', async () => {
        for (const key of INTEGRATION_KEYS) {
            const result = await runConnectionTest(key, {}, {});
            expect(VALID_STATUSES).toContain(result.status);
            expect(typeof result.message).toBe('string');
            expect(result.message.length).toBeGreaterThan(0);
        }
    });
});
