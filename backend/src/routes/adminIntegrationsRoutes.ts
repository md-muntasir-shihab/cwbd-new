import { Request, Response, NextFunction, Router } from 'express';
import AuditLog from '../models/AuditLog';
import {
    INTEGRATIONS_REGISTRY,
    INTEGRATION_KEYS,
    getDescriptor,
} from '../services/integrations/integrationsRegistry';
import {
    listAll,
    getOne,
    updateConfig,
    testIntegration,
} from '../services/integrations/integrationsService';
import { authenticate, authorize } from '../middlewares/auth';
import type { IntegrationKey } from '../models/IntegrationConfig';

/**
 * /api/admin/integrations
 *
 * Admin-only registry for the 10 supported external integrations. Routes are
 * gated by the same `authenticate + authorize(superadmin, admin)` middleware
 * pair used for notification providers (`adminProviderRoutes.ts`). All
 * mutation endpoints write to AuditLog. The /test endpoint is rate-limited to
 * at most 5 requests per minute per admin (per the integration spec).
 */

type AuthRequest = Request & { user?: { _id?: string; role?: string; id?: string } };

const router = Router();

// In-memory token bucket for the per-admin test rate limiter (5 tests/min).
const TEST_RATE_LIMIT_MAX = 5;
const TEST_RATE_LIMIT_WINDOW_MS = 60_000;
const testBuckets = new Map<string, { count: number; resetAt: number }>();

function testRateLimiter(req: AuthRequest, res: Response, next: NextFunction): void {
    const adminId = String(req.user?._id || req.user?.id || req.ip || 'unknown');
    const now = Date.now();
    const existing = testBuckets.get(adminId);
    if (!existing || existing.resetAt <= now) {
        testBuckets.set(adminId, { count: 1, resetAt: now + TEST_RATE_LIMIT_WINDOW_MS });
        next();
        return;
    }
    if (existing.count >= TEST_RATE_LIMIT_MAX) {
        const retryAfterSec = Math.max(1, Math.ceil((existing.resetAt - now) / 1000));
        res.setHeader('Retry-After', String(retryAfterSec));
        res.status(429).json({
            message: 'Too many integration test requests. Limit is 5/minute/admin.',
            retryAfterSec,
        });
        return;
    }
    existing.count += 1;
    testBuckets.set(adminId, existing);
    next();
}

function isIntegrationKey(value: unknown): value is IntegrationKey {
    return typeof value === 'string' && (INTEGRATION_KEYS as string[]).includes(value);
}

async function writeIntegrationAudit(
    req: AuthRequest,
    action: string,
    key: string,
    details: Record<string, unknown> = {},
): Promise<void> {
    if (!req.user?._id) return;
    try {
        await AuditLog.create({
            actor_id: req.user._id,
            actor_role: req.user.role,
            action,
            module: 'integrations',
            target_type: 'integration_config',
            ip_address: req.ip,
            details: { key, ...details },
        });
    } catch {
        // Audit failures must not block the admin response.
    }
}

const adminAuth = [authenticate, authorize('superadmin', 'admin')];

/**
 * GET /integrations
 * Returns the static registry descriptors merged with each integration's
 * current saved state (enabled, public config, configured-secret names,
 * last-test status). Never returns secret values.
 */
router.get('/integrations', ...adminAuth, async (_req: Request, res: Response) => {
    try {
        const saved = await listAll();
        const merged = INTEGRATIONS_REGISTRY.map((desc) => {
            const state =
                saved.find((s) => s.key === desc.key) || {
                    enabled: false,
                    config: {},
                    configuredSecrets: [],
                    lastTestedAt: null,
                    lastTestStatus: 'unknown' as const,
                    lastTestMessage: '',
                    updatedAt: new Date(0),
                };
            return {
                key: desc.key,
                displayName: desc.displayName,
                category: desc.category,
                description: desc.description,
                docsUrl: desc.docsUrl,
                configFields: desc.configFields,
                secretFields: desc.secretFields.map((f) => ({ name: f.name, label: f.label, helpText: f.helpText })),
                state,
            };
        });
        res.json({ integrations: merged });
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to load integrations';
        res.status(500).json({ message });
    }
});

/**
 * GET /integrations/:key
 * Detail view for one integration.
 */
router.get('/integrations/:key', ...adminAuth, async (req: Request, res: Response) => {
    const { key } = req.params;
    if (!isIntegrationKey(key)) {
        res.status(400).json({ message: 'Unknown integration key' });
        return;
    }
    const descriptor = getDescriptor(key);
    const state = await getOne(key);
    res.json({ descriptor, state });
});

/**
 * PUT /integrations/:key
 * Body: { enabled?: boolean; config?: Record<string, unknown>; secrets?: Record<string, string> }
 * Empty-string secrets clear that secret. Values are encrypted server-side.
 */
router.put('/integrations/:key', ...adminAuth, async (req: AuthRequest, res: Response) => {
    const { key } = req.params;
    if (!isIntegrationKey(key)) {
        res.status(400).json({ message: 'Unknown integration key' });
        return;
    }
    const body = (req.body ?? {}) as {
        enabled?: unknown;
        config?: unknown;
        secrets?: unknown;
    };
    const input = {
        enabled: typeof body.enabled === 'boolean' ? body.enabled : undefined,
        config:
            body.config && typeof body.config === 'object' && !Array.isArray(body.config)
                ? (body.config as Record<string, unknown>)
                : undefined,
        secrets:
            body.secrets && typeof body.secrets === 'object' && !Array.isArray(body.secrets)
                ? (body.secrets as Record<string, string>)
                : undefined,
        actorId: String(req.user?._id || ''),
    };

    try {
        const updated = await updateConfig(key, input);
        await writeIntegrationAudit(req, 'integration_update', key, {
            enabled: updated.enabled,
            configKeysChanged: input.config ? Object.keys(input.config) : [],
            secretsChanged: input.secrets ? Object.keys(input.secrets) : [],
        });
        res.json({ state: updated });
    } catch (err) {
        const status = (err as { status?: number }).status ?? 400;
        const message = err instanceof Error ? err.message : 'Failed to update integration';
        res.status(status).json({ message });
    }
});

/**
 * POST /integrations/:key/toggle
 * Body: { enabled: boolean }
 * Convenience endpoint for the admin UI's enable/disable switch.
 */
router.post('/integrations/:key/toggle', ...adminAuth, async (req: AuthRequest, res: Response) => {
    const { key } = req.params;
    if (!isIntegrationKey(key)) {
        res.status(400).json({ message: 'Unknown integration key' });
        return;
    }
    const enabled = Boolean((req.body ?? {}).enabled);
    try {
        const updated = await updateConfig(key, { enabled, actorId: String(req.user?._id || '') });
        await writeIntegrationAudit(req, 'integration_toggle', key, { enabled });
        res.json({ state: updated });
    } catch (err) {
        const status = (err as { status?: number }).status ?? 400;
        const message = err instanceof Error ? err.message : 'Failed to toggle integration';
        res.status(status).json({ message });
    }
});

/**
 * POST /integrations/:key/test
 * Rate-limited to 5/min/admin. Performs a read-only HTTP probe and stores the
 * outcome on the IntegrationConfig document.
 */
router.post(
    '/integrations/:key/test',
    ...adminAuth,
    testRateLimiter,
    async (req: AuthRequest, res: Response) => {
        const { key } = req.params;
        if (!isIntegrationKey(key)) {
            res.status(400).json({ message: 'Unknown integration key' });
            return;
        }
        try {
            const result = await testIntegration(key);
            await writeIntegrationAudit(req, 'integration_test', key, {
                status: result.status,
                message: result.message.slice(0, 200),
            });
            res.json({ result });
        } catch (err) {
            const status = (err as { status?: number }).status ?? 500;
            const message = err instanceof Error ? err.message : 'Failed to test integration';
            res.status(status).json({ message });
        }
    },
);

export default router;
