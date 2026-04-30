/**
 * @module adminProviderRoutes
 * @description Notification Provider CRUD — manages per-channel delivery configuration
 * for email, SMS, and push notifications (e.g., SendGrid, Twilio, Firebase FCM).
 *
 * Mounted at: /api/admin/providers and /api/admin/notifications/providers
 *
 * BOUNDARY NOTE: This file is distinct from `adminIntegrationsRoutes.ts`.
 * - This file (adminProviderRoutes) manages **notification providers** — the delivery
 *   channels used by the notification/campaign system to send messages to users.
 * - `adminIntegrationsRoutes.ts` manages **integration configs** — the 10 external
 *   service integrations (Meilisearch, Imgproxy, Listmonk, Mautic, Novu, Umami,
 *   Plausible, B2 Backup, SMTP, Cloudinary) with enable/disable, config fields,
 *   encrypted secrets, and connection testing.
 *
 * The Novu integration in the integrations panel manages Novu API credentials and
 * enable/disable state, while this provider system manages per-channel delivery
 * configuration that Novu (or other systems) use to actually send notifications.
 */
import { Request, Response, Router } from 'express';
import { authenticate, authorize } from '../middlewares/auth';
import { requireSensitiveAction } from '../middlewares/sensitiveAction';
import NotificationProvider from '../models/NotificationProvider';
import AuditLog from '../models/AuditLog';
import { encrypt } from '../services/cryptoService';
import { createSecurityAlert } from '../controllers/securityAlertController';

type AuthRequest = Request;

const router = Router();
const providerAuth = [authenticate, authorize('superadmin', 'admin')];
const LIST_PATHS = ['/notifications/providers', '/providers'];
const ITEM_PATHS = ['/notifications/providers/:id', '/providers/:id'];
const TOGGLE_PATHS = ['/notifications/providers/:id/toggle', '/providers/:id/toggle'];

function sanitizeProvider(doc: Record<string, unknown>): Record<string, unknown> {
    const plain = { ...doc };
    const credentialsConfigured = Boolean(plain.credentialsEncrypted);
    delete plain.credentialsEncrypted;
    return {
        ...plain,
        credentialsConfigured,
    };
}

async function writeProviderAudit(req: AuthRequest, action: string, providerId: string, details?: Record<string, unknown>) {
    if (!req.user?._id) return;
    await AuditLog.create({
        actor_id: req.user._id,
        actor_role: req.user.role,
        action,
        target_id: providerId,
        target_type: 'notification_provider',
        ip_address: req.ip,
        details: details || {},
    });
}

router.get(LIST_PATHS, ...providerAuth, async (_req: Request, res: Response) => {
    try {
        const providers = await NotificationProvider.find()
            .select('+credentialsEncrypted')
            .sort({ type: 1, createdAt: -1 })
            .lean();
        res.json({ providers: providers.map((provider) => sanitizeProvider(provider as unknown as Record<string, unknown>)) });
    } catch (err) {
        console.error('GET provider list error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

router.get(ITEM_PATHS, ...providerAuth, async (req: Request, res: Response) => {
    try {
        const provider = await NotificationProvider.findById(req.params.id)
            .select('+credentialsEncrypted')
            .lean();
        if (!provider) {
            res.status(404).json({ message: 'Provider not found' });
            return;
        }
        res.json(sanitizeProvider(provider as unknown as Record<string, unknown>));
    } catch (err) {
        console.error('GET provider error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

router.post(LIST_PATHS, ...providerAuth, requireSensitiveAction({ actionKey: 'providers.credentials_change', moduleName: 'notification_center', actionName: 'provider_create' }), async (req: AuthRequest, res: Response) => {
    try {
        const { type, provider, displayName, credentials, senderConfig, rateLimit, isEnabled } = req.body;
        if (!type || !provider || !displayName) {
            res.status(400).json({ message: 'type, provider, and displayName are required' });
            return;
        }

        const doc = await NotificationProvider.create({
            type,
            provider,
            displayName,
            credentialsEncrypted: encrypt(JSON.stringify(credentials || {})),
            senderConfig: senderConfig ?? {},
            rateLimit: rateLimit ?? {},
            isEnabled: isEnabled ?? true,
        });

        await writeProviderAudit(req, 'notification_provider_created', String(doc._id), { type, provider });
        await createSecurityAlert(
            'provider_credentials_changed',
            'warning',
            'Notification provider created',
            `${displayName} credentials were added.`,
            { providerId: String(doc._id), actorUserId: req.user?._id || null },
        );
        res.status(201).json(sanitizeProvider(doc.toObject() as unknown as Record<string, unknown>));
    } catch (err) {
        console.error('POST provider error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

router.put(ITEM_PATHS, ...providerAuth, requireSensitiveAction({ actionKey: 'providers.credentials_change', moduleName: 'notification_center', actionName: 'provider_update' }), async (req: AuthRequest, res: Response) => {
    try {
        const update: Record<string, unknown> = {};
        if (req.body.displayName !== undefined) update.displayName = req.body.displayName;
        if (req.body.isEnabled !== undefined) update.isEnabled = Boolean(req.body.isEnabled);
        if (req.body.senderConfig !== undefined) update.senderConfig = req.body.senderConfig;
        if (req.body.rateLimit !== undefined) update.rateLimit = req.body.rateLimit;
        if (req.body.credentials !== undefined) update.credentialsEncrypted = encrypt(JSON.stringify(req.body.credentials || {}));

        const doc = await NotificationProvider.findByIdAndUpdate(
            req.params.id,
            { $set: update },
            { new: true },
        )
            .select('+credentialsEncrypted')
            .lean();

        if (!doc) {
            res.status(404).json({ message: 'Provider not found' });
            return;
        }

        await writeProviderAudit(req, 'notification_provider_updated', String(req.params.id), {
            credentialsChanged: req.body.credentials !== undefined,
        });
        if (req.body.credentials !== undefined) {
            await createSecurityAlert(
                'provider_credentials_changed',
                'warning',
                'Notification provider credentials changed',
                `${String(doc.displayName || doc.provider || 'Provider')} credentials were updated.`,
                { providerId: String(req.params.id), actorUserId: req.user?._id || null },
            );
        }
        res.json(sanitizeProvider(doc as unknown as Record<string, unknown>));
    } catch (err) {
        console.error('PUT provider error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

router.patch(TOGGLE_PATHS, ...providerAuth, requireSensitiveAction({ actionKey: 'providers.credentials_change', moduleName: 'notification_center', actionName: 'provider_toggle' }), async (req: AuthRequest, res: Response) => {
    try {
        const doc = await NotificationProvider.findById(req.params.id);
        if (!doc) {
            res.status(404).json({ message: 'Provider not found' });
            return;
        }
        doc.isEnabled = !doc.isEnabled;
        await doc.save();
        await writeProviderAudit(req, 'notification_provider_toggled', String(doc._id), { isEnabled: doc.isEnabled });
        res.json({ _id: doc._id, isEnabled: doc.isEnabled });
    } catch (err) {
        console.error('PATCH provider toggle error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

router.delete(ITEM_PATHS, ...providerAuth, requireSensitiveAction({ actionKey: 'providers.credentials_change', moduleName: 'notification_center', actionName: 'provider_delete' }), async (req: AuthRequest, res: Response) => {
    try {
        const doc = await NotificationProvider.findByIdAndDelete(req.params.id).lean();
        if (!doc) {
            res.status(404).json({ message: 'Provider not found' });
            return;
        }

        await writeProviderAudit(req, 'notification_provider_deleted', String(req.params.id));
        await createSecurityAlert(
            'provider_credentials_changed',
            'warning',
            'Notification provider deleted',
            `${String(doc.displayName || doc.provider || 'Provider')} was removed.`,
            { providerId: String(req.params.id), actorUserId: req.user?._id || null },
        );
        res.json({ message: 'Provider deleted' });
    } catch (err) {
        console.error('DELETE provider error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

export default router;
