/**
 * Unit tests for the integrations registry and model enum alignment.
 *
 * Feature: integration-panel-audit
 * Validates: Requirements 1.3, 1.4
 */
import { INTEGRATIONS_REGISTRY, INTEGRATION_KEYS } from '../src/services/integrations/integrationsRegistry';

const EXPECTED_KEYS = [
    'meilisearch',
    'imgproxy',
    'listmonk',
    'mautic',
    'novu',
    'umami',
    'plausible',
    'b2_backup',
    'smtp',
    'cloudinary',
] as const;

describe('Integrations Registry', () => {
    it('has exactly 10 entries', () => {
        expect(INTEGRATIONS_REGISTRY).toHaveLength(10);
    });

    it('contains all expected integration keys', () => {
        const registryKeys = INTEGRATIONS_REGISTRY.map((d) => d.key).sort();
        const expected = [...EXPECTED_KEYS].sort();
        expect(registryKeys).toEqual(expected);
    });

    it('INTEGRATION_KEYS export matches registry entries', () => {
        expect(INTEGRATION_KEYS.sort()).toEqual([...EXPECTED_KEYS].sort());
    });

    it('model IntegrationKey enum matches registry keys', () => {
        // The IntegrationKey type is defined in the model file. We verify by
        // checking that every registry key is a valid IntegrationKey value.
        // Since TypeScript enforces this at compile time, we verify at runtime
        // by importing the schema enum values from the model.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const IntegrationConfig = require('../src/models/IntegrationConfig').default;
        const schema = IntegrationConfig.schema;
        const keyPath = schema.path('key');
        const enumValues: string[] = keyPath.enumValues;

        expect(enumValues.sort()).toEqual([...EXPECTED_KEYS].sort());
    });

    it('each entry has required fields', () => {
        for (const entry of INTEGRATIONS_REGISTRY) {
            expect(entry.key).toBeTruthy();
            expect(entry.displayName).toBeTruthy();
            expect(entry.category).toBeTruthy();
            expect(entry.description).toBeTruthy();
            expect(Array.isArray(entry.configFields)).toBe(true);
            expect(Array.isArray(entry.secretFields)).toBe(true);
        }
    });
});
