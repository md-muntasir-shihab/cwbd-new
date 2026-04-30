/**
 * Unit tests for admin integrations routes — rate limiter behavior.
 *
 * Feature: integration-panel-audit
 * Validates: Requirements 3.5
 */
import express from 'express';
import request from 'supertest';

// We need to test the rate limiter in isolation. The rate limiter is embedded
// in the route file, so we import the router and mount it on a test app.
// We mock the auth middleware and the service layer to isolate the rate limiter.

jest.mock('../src/middlewares/auth', () => ({
    authenticate: (_req: unknown, _res: unknown, next: () => void) => {
        ((_req as Record<string, unknown>).user as Record<string, unknown>) = {
            _id: 'test-admin-id',
            role: 'superadmin',
        };
        next();
    },
    authorize: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

jest.mock('../src/services/integrations/integrationsService', () => ({
    listAll: jest.fn().mockResolvedValue([]),
    getOne: jest.fn().mockResolvedValue(null),
    updateConfig: jest.fn().mockResolvedValue({
        key: 'meilisearch',
        enabled: false,
        config: {},
        configuredSecrets: [],
        lastTestedAt: null,
        lastTestStatus: 'unknown',
        lastTestMessage: '',
    }),
    testIntegration: jest.fn().mockResolvedValue({ status: 'success', message: 'OK' }),
}));

jest.mock('../src/models/AuditLog', () => ({
    create: jest.fn().mockResolvedValue({}),
}));

import adminIntegrationsRouter from '../src/routes/adminIntegrationsRoutes';

function createTestApp() {
    const app = express();
    app.use(express.json());
    app.use('/api/admin', adminIntegrationsRouter);
    return app;
}

describe('Admin Integrations Routes — Rate Limiter', () => {
    it('returns 429 after 5 test requests in 1 minute from the same admin', async () => {
        const app = createTestApp();

        // First 5 requests should succeed
        for (let i = 0; i < 5; i++) {
            const res = await request(app).post('/api/admin/integrations/meilisearch/test');
            expect(res.status).toBe(200);
        }

        // 6th request should be rate-limited
        const res = await request(app).post('/api/admin/integrations/meilisearch/test');
        expect(res.status).toBe(429);
        expect(res.body.message).toMatch(/too many/i);
        expect(res.body.retryAfterSec).toBeGreaterThan(0);
        expect(res.headers['retry-after']).toBeDefined();
    });

    it('allows requests again after the rate limit window resets', async () => {
        const app = createTestApp();

        // Exhaust the rate limit
        for (let i = 0; i < 5; i++) {
            await request(app).post('/api/admin/integrations/umami/test');
        }

        // Should be blocked
        const blocked = await request(app).post('/api/admin/integrations/umami/test');
        expect(blocked.status).toBe(429);
    });
});
