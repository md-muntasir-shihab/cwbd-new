/**
 * Property-based tests for the integrations service.
 *
 * Feature: integration-panel-audit
 *
 * Properties tested:
 * - Property 1: Seeding idempotency
 * - Property 12: Secret encryption round-trip
 * - Property 14: Empty string removes secret
 */
import * as fc from 'fast-check';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import IntegrationConfig from '../src/models/IntegrationConfig';
import {
    seedIntegrationConfigs,
    updateConfig,
    getOne,
} from '../src/services/integrations/integrationsService';
import { INTEGRATIONS_REGISTRY, INTEGRATION_KEYS } from '../src/services/integrations/integrationsRegistry';
import { encrypt, decrypt } from '../src/services/cryptoService';

let mongoServer: MongoMemoryServer;

beforeAll(async () => {
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);
});

afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
});

afterEach(async () => {
    await IntegrationConfig.deleteMany({});
});

/**
 * Feature: integration-panel-audit, Property 1: seeding idempotency
 *
 * **Validates: Requirements 1.1, 1.2**
 *
 * For any set of pre-existing IntegrationConfig documents and the current
 * registry, after calling seedIntegrationConfigs(), every registry key should
 * have exactly one document in the collection, and any pre-existing enabled,
 * config, and credentialsEncrypted values should remain unchanged.
 */
describe('Property 1: Seeding idempotency — seed preserves values and ensures one doc per key', () => {
    // Arbitrary for a subset of integration keys to pre-seed with custom values
    const arbPreSeedKeys = fc.subarray([...INTEGRATION_KEYS], { minLength: 0, maxLength: 10 });

    // Arbitrary for config values (at least 1 key to avoid empty-object edge case with Mongoose Mixed type)
    const arbConfig = fc.dictionary(
        fc.constantFrom('baseUrl', 'host', 'port', 'bucket', 'region'),
        fc.oneof(fc.string({ minLength: 1, maxLength: 50 }), fc.nat().map(String)),
        { minKeys: 1, maxKeys: 3 },
    );

    it('seed preserves pre-existing values and ensures one doc per key', async () => {
        await fc.assert(
            fc.asyncProperty(
                arbPreSeedKeys,
                arbConfig,
                fc.boolean(),
                async (preSeedKeys, customConfig, enabledState) => {
                    // Clean slate
                    await IntegrationConfig.deleteMany({});

                    // Pre-seed some documents with custom values
                    for (const key of preSeedKeys) {
                        const desc = INTEGRATIONS_REGISTRY.find((d) => d.key === key)!;
                        await IntegrationConfig.create({
                            key,
                            displayName: desc.displayName,
                            category: desc.category,
                            description: desc.description,
                            enabled: enabledState,
                            config: customConfig,
                            credentialsEncrypted: null,
                            lastTestedAt: null,
                            lastTestStatus: 'unknown',
                            lastTestMessage: '',
                            updatedBy: null,
                        });
                    }

                    // Run seed
                    await seedIntegrationConfigs();

                    // Verify: every registry key has exactly one document
                    for (const key of INTEGRATION_KEYS) {
                        const docs = await IntegrationConfig.find({ key });
                        expect(docs).toHaveLength(1);
                    }

                    // Verify: pre-existing values are preserved
                    for (const key of preSeedKeys) {
                        const doc = await IntegrationConfig.findOne({ key }).lean();
                        expect(doc!.enabled).toBe(enabledState);
                        // Config should match what we pre-seeded.
                        // Mongoose Mixed type preserves non-empty objects faithfully.
                        const storedConfig = doc!.config ?? {};
                        expect(storedConfig).toEqual(customConfig);
                    }

                    // Total count should be exactly 10
                    const total = await IntegrationConfig.countDocuments();
                    expect(total).toBe(10);
                },
            ),
            { numRuns: 100 },
        );
    });
});

/**
 * Feature: integration-panel-audit, Property 12: secret encryption round-trip
 *
 * **Validates: Requirements 10.1**
 *
 * For any non-empty record of secret name-value pairs, encrypting via
 * encodeSecrets() and then decrypting via decodeSecrets() should produce
 * an equivalent record with the same keys and values.
 */
describe('Property 12: Secret encryption round-trip — encode then decode returns equivalent map', () => {
    // Arbitrary for secret field names (realistic names)
    const arbSecretName = fc.constantFrom(
        'apiKey', 'masterKey', 'searchKey', 'signingKey', 'signingSalt',
        'username', 'password', 'applicationKey', 'keyId', 'apiSecret',
    );

    // Arbitrary for secret values (non-empty strings)
    const arbSecretValue = fc.string({ minLength: 1, maxLength: 200 });

    // Arbitrary for a secrets map
    const arbSecretsMap = fc.dictionary(arbSecretName, arbSecretValue, { minKeys: 1, maxKeys: 5 });

    it('encrypt then decrypt returns equivalent secret map', () => {
        fc.assert(
            fc.property(arbSecretsMap, (secrets) => {
                // Encrypt the secrets map as JSON
                const encrypted = encrypt(JSON.stringify(secrets));

                // Encrypted value should be a non-empty string
                expect(typeof encrypted).toBe('string');
                expect(encrypted.length).toBeGreaterThan(0);

                // Decrypt and parse
                const decrypted = decrypt(encrypted);
                const parsed = JSON.parse(decrypted);

                // Should be equivalent to the original
                expect(parsed).toEqual(secrets);
            }),
            { numRuns: 100 },
        );
    });
});

/**
 * Feature: integration-panel-audit, Property 14: empty string removes secret
 *
 * **Validates: Requirements 10.4**
 *
 * For any integration key and any secret field name, calling updateConfig
 * with secrets: { [fieldName]: '' } should result in that field being absent
 * from the decrypted secrets map.
 */
describe('Property 14: Empty string removes secret — updating with empty string removes it', () => {
    // Arbitrary for integration keys that have secret fields
    const keysWithSecrets = INTEGRATION_KEYS.filter((k) => {
        const desc = INTEGRATIONS_REGISTRY.find((d) => d.key === k);
        return desc && desc.secretFields.length > 0;
    });

    const arbKeyWithSecret = fc.constantFrom(...keysWithSecrets);

    it('updating a secret with empty string removes it from the encrypted blob', async () => {
        await fc.assert(
            fc.asyncProperty(
                arbKeyWithSecret,
                fc.string({ minLength: 5, maxLength: 50 }),
                async (key, initialValue) => {
                    // Clean and seed
                    await IntegrationConfig.deleteMany({});
                    await seedIntegrationConfigs();

                    const desc = INTEGRATIONS_REGISTRY.find((d) => d.key === key)!;
                    const secretFieldName = desc.secretFields[0].name;

                    // First, set a secret value
                    await updateConfig(key, {
                        secrets: { [secretFieldName]: initialValue },
                        actorId: '000000000000000000000001',
                    });

                    // Verify it was set
                    const afterSet = await getOne(key);
                    expect(afterSet!.configuredSecrets).toContain(secretFieldName);

                    // Now remove it with empty string
                    await updateConfig(key, {
                        secrets: { [secretFieldName]: '' },
                        actorId: '000000000000000000000001',
                    });

                    // Verify it was removed
                    const afterRemove = await getOne(key);
                    expect(afterRemove!.configuredSecrets).not.toContain(secretFieldName);
                },
            ),
            { numRuns: 100 },
        );
    });
});
