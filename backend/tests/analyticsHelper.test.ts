/**
 * Unit tests for analytics helper — priority logic, null config, Cache-Control.
 *
 * Feature: integration-panel-audit
 * Validates: Requirements 11.4, 12.4, 12.5
 */
import express from 'express';
import request from 'supertest';
import { getPublicAnalyticsConfig } from '../src/services/integrations/analyticsHelper';

// Mock the featureGate module
jest.mock('../src/services/integrations/featureGate', () => ({
    isIntegrationReady: jest.fn(),
    getIntegrationConfig: jest.fn(),
}));

import { isIntegrationReady, getIntegrationConfig } from '../src/services/integrations/featureGate';

const mockIsReady = isIntegrationReady as jest.MockedFunction<typeof isIntegrationReady>;
const mockGetConfig = getIntegrationConfig as jest.MockedFunction<typeof getIntegrationConfig>;

describe('Analytics Helper — getPublicAnalyticsConfig', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('prefers Umami over Plausible when both are enabled', async () => {
        mockIsReady.mockImplementation(async (key) => {
            if (key === 'umami') return true;
            if (key === 'plausible') return true;
            return false;
        });
        mockGetConfig.mockImplementation(async (key) => {
            if (key === 'umami') return { baseUrl: 'https://umami.example.com', websiteId: 'site-123' };
            if (key === 'plausible') return { baseUrl: 'https://plausible.io', domain: 'example.com' };
            return null;
        });

        const result = await getPublicAnalyticsConfig();

        expect(result.provider).toBe('umami');
        expect(result.scriptUrl).toBe('https://umami.example.com/script.js');
        expect(result.siteId).toBe('site-123');
    });

    it('falls back to Plausible when Umami is not ready', async () => {
        mockIsReady.mockImplementation(async (key) => {
            if (key === 'umami') return false;
            if (key === 'plausible') return true;
            return false;
        });
        mockGetConfig.mockImplementation(async (key) => {
            if (key === 'plausible') return { baseUrl: 'https://plausible.io', domain: 'example.com' };
            return null;
        });

        const result = await getPublicAnalyticsConfig();

        expect(result.provider).toBe('plausible');
        expect(result.scriptUrl).toBe('https://plausible.io/js/script.js');
        expect(result.siteId).toBe('example.com');
        expect(result.domain).toBe('example.com');
    });

    it('returns null config when no analytics integration is enabled', async () => {
        mockIsReady.mockResolvedValue(false);

        const result = await getPublicAnalyticsConfig();

        expect(result).toEqual({
            provider: null,
            scriptUrl: null,
            siteId: null,
            domain: null,
        });
    });

    it('returns null config when Umami is ready but has no websiteId', async () => {
        mockIsReady.mockImplementation(async (key) => {
            if (key === 'umami') return true;
            return false;
        });
        mockGetConfig.mockImplementation(async (key) => {
            if (key === 'umami') return { baseUrl: 'https://umami.example.com' };
            return null;
        });

        const result = await getPublicAnalyticsConfig();

        // Falls through Umami (no websiteId), then Plausible (not ready) → null
        expect(result.provider).toBeNull();
    });
});

describe('Public Analytics Config Endpoint — Cache-Control header', () => {
    it('sets Cache-Control: public, max-age=60', async () => {
        // Import the public routes and mount on a test app
        jest.resetModules();
        jest.mock('../src/services/integrations/featureGate', () => ({
            isIntegrationReady: jest.fn().mockResolvedValue(false),
            getIntegrationConfig: jest.fn().mockResolvedValue(null),
        }));

        const publicRouter = require('../src/routes/publicIntegrationsRoutes').default;
        const app = express();
        app.use('/api/integrations', publicRouter);

        const res = await request(app).get('/api/integrations/analytics-config');

        expect(res.status).toBe(200);
        expect(res.headers['cache-control']).toBe('public, max-age=60');
    });
});
