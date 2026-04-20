/**
 * Admin Notification Routes
 *
 * Endpoints for the unified notification/campaign platform:
 * - Campaign management (list, create, preview, send, retry)
 * - Template management
 * - Notification settings
 * - Delivery logs
 * - Data hub exports
 */

import { Router, Request, Response } from 'express';
import mongoose from 'mongoose';
import { authenticate, authorize } from '../middlewares/auth';
import { settingsValidator } from '../middlewares/settingsValidator';
import { settingsRbac } from '../middlewares/settingsRbac';
import { settingsCacheService } from '../services/settingsCacheService';
import { log as auditLog, getHistory as getAuditHistory, getVersionSnapshot } from '../services/settingsAuditLoggerService';
import { simulate } from '../services/campaignEngineService';
import {
    executeCampaign,
    previewAndEstimate,
    retryFailedDeliveries,
    triggerAutoSend,
} from '../services/notificationOrchestrationService';
import NotificationJob from '../models/NotificationJob';
import NotificationDeliveryLog from '../models/NotificationDeliveryLog';
import NotificationTemplate from '../models/NotificationTemplate';
import NotificationSettings, { applyMigrationDefaults } from '../models/NotificationSettings';
import NotificationProvider from '../models/NotificationProvider';
import AnnouncementNotice from '../models/AnnouncementNotice';
import {
    exportPhoneList,
    exportEmailList,
    exportGuardianList,
    exportAudienceSegment,
    exportFailedDeliveries,
    exportManualSendList,
    getImportExportHistory,
} from '../services/dataHubService';
import {
    createSubscriptionContactPreset,
    deleteSubscriptionContactPreset,
    exportSubscriptionContactData,
    getSubscriptionContactCenterMembers,
    getSubscriptionContactCenterOverview,
    getSubscriptionContactLogs,
    listSubscriptionContactPresets,
    previewSubscriptionContactCopy,
    updateSubscriptionContactPreset,
    type SubscriptionContactScope,
} from '../services/subscriptionContactCenterService';

// AuthRequest is provided by global Express augmentation (express-user-augmentation.d.ts)
type AuthRequest = Request;

const router = Router();
const adminAuth = [authenticate, authorize('superadmin', 'admin', 'moderator', 'editor', 'viewer', 'support_agent', 'finance_agent')];
const contactCenterViewAuth = [authenticate, authorize('superadmin', 'admin', 'moderator', 'support_agent')];
const contactCenterExportAuth = [authenticate, authorize('superadmin', 'admin', 'moderator')];
const contactCenterGuardianAuth = [authenticate, authorize('superadmin', 'admin')];
const contactCenterPresetAuth = [authenticate, authorize('superadmin', 'admin', 'moderator')];

function hasGuardianScope(scope: unknown): boolean {
    const normalized = String(scope || '').trim().toLowerCase();
    return normalized === 'guardian' || normalized === 'student_guardian';
}

function requiresGuardianAccess(body: Record<string, unknown>): boolean {
    const preset = (body.preset && typeof body.preset === 'object') ? body.preset as Record<string, unknown> : null;
    return hasGuardianScope(body.scope) || Boolean(preset?.includeGuardian);
}

function assertAdminId(req: AuthRequest): string {
    return String(req.user!._id || '');
}

function assertActorRole(req: AuthRequest): string {
    return String(req.user?.role || '');
}

function summarizeAudienceTarget(body: Record<string, unknown>): string {
    const audienceType = String(body.audienceType || 'all').trim().toLowerCase();
    if (audienceType === 'group') {
        return body.audienceGroupId ? `saved-group:${String(body.audienceGroupId)}` : 'saved-group';
    }
    if (audienceType === 'manual') {
        const count = Array.isArray(body.manualStudentIds) ? body.manualStudentIds.length : 0;
        return count > 0 ? `manual:${count}` : 'manual';
    }
    if (audienceType === 'filter') {
        const filterKeys = body.audienceFilters && typeof body.audienceFilters === 'object'
            ? Object.keys(body.audienceFilters as Record<string, unknown>)
            : [];
        return filterKeys.length > 0 ? `filter:${filterKeys.join(',')}` : 'filter';
    }
    return 'all';
}

/* ────────────────────────────────────────────────────────────────
   Campaign management
   ──────────────────────────────────────────────────────────────── */

// List campaigns/jobs
router.get('/notifications/campaigns', ...adminAuth, async (req: AuthRequest, res: Response) => {
    try {
        const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10));
        const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '20'), 10)));
        const status = req.query.status as string | undefined;
        const type = req.query.type as string | undefined;
        const originModule = req.query.originModule as string | undefined;
        const originEntityId = req.query.originEntityId as string | undefined;

        const query: Record<string, unknown> = {};
        if (status) query.status = status;
        if (type) query.type = type;
        if (originModule) query.originModule = originModule;
        if (originEntityId) query.originEntityId = originEntityId;

        const [jobs, total] = await Promise.all([
            NotificationJob.find(query)
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .populate('createdByAdminId', 'full_name username')
                .lean(),
            NotificationJob.countDocuments(query),
        ]);

        res.json({ jobs, total, page, limit, totalPages: Math.ceil(total / limit) });
    } catch (err) {
        console.error('GET /notifications/campaigns error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// Get single campaign details
router.get('/notifications/campaigns/:id', ...adminAuth, async (req: AuthRequest, res: Response) => {
    try {
        const job = await NotificationJob.findById(req.params.id)
            .populate('createdByAdminId', 'full_name username')
            .lean();
        if (!job) { res.status(404).json({ message: 'Campaign not found' }); return; }
        res.json(job);
    } catch (err) {
        console.error('GET /notifications/campaigns/:id error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// Preview & estimate campaign
router.post('/notifications/campaigns/preview', ...adminAuth, async (req: AuthRequest, res: Response) => {
    try {
        const estimate = await previewAndEstimate({
            campaignName: req.body.campaignName ?? 'Preview',
            channels: req.body.channels ?? ['sms'],
            templateKey: req.body.templateKey,
            customBody: req.body.customBody,
            customSubject: req.body.customSubject,
            vars: req.body.vars,
            audienceType: req.body.audienceType ?? 'all',
            audienceGroupId: req.body.audienceGroupId,
            audienceFilters: req.body.audienceFilters,
            manualStudentIds: req.body.manualStudentIds,
            includeUserIds: req.body.includeUserIds,
            excludeUserIds: req.body.excludeUserIds,
            guardianTargeted: req.body.guardianTargeted,
            recipientMode: req.body.recipientMode,
            adminId: req.user!._id,
        });
        res.json(estimate);
    } catch (err) {
        console.error('POST /notifications/campaigns/preview error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// Send campaign
router.post('/notifications/campaigns/send', ...adminAuth, async (req: AuthRequest, res: Response) => {
    try {
        const result = await executeCampaign({
            campaignName: req.body.campaignName,
            channels: req.body.channels,
            templateKey: req.body.templateKey,
            customBody: req.body.customBody,
            customSubject: req.body.customSubject,
            vars: req.body.vars,
            audienceType: req.body.audienceType,
            audienceGroupId: req.body.audienceGroupId,
            audienceFilters: req.body.audienceFilters,
            manualStudentIds: req.body.manualStudentIds,
            includeUserIds: req.body.includeUserIds,
            excludeUserIds: req.body.excludeUserIds,
            guardianTargeted: req.body.guardianTargeted ?? false,
            recipientMode: req.body.recipientMode ?? 'student',
            scheduledAtUTC: req.body.scheduledAtUTC ? new Date(req.body.scheduledAtUTC) : undefined,
            adminId: req.user!._id,
            originModule: req.body.originModule,
            originEntityId: req.body.originEntityId,
            originAction: req.body.originAction,
            triggerKey: req.body.triggerKey,
            testSend: req.body.testSend ?? false,
        });

        const originModule = String(req.body.originModule || '').trim().toLowerCase();
        const originEntityId = String(req.body.originEntityId || '').trim();
        if (originModule === 'notice' && originEntityId) {
            const channels = Array.isArray(req.body.channels)
                ? req.body.channels
                    .map((channel: unknown) => String(channel || '').trim().toLowerCase())
                    .filter(Boolean)
                : [];

            await AnnouncementNotice.findByIdAndUpdate(originEntityId, {
                $set: {
                    deliveryMeta: {
                        lastJobId: result.jobId || null,
                        lastChannel: channels.length > 1 ? 'both' : channels[0] === 'sms' ? 'sms' : 'email',
                        lastAudienceSummary: summarizeAudienceTarget(req.body || {}),
                        lastSentAt: new Date(),
                    },
                },
            });
        }

        res.json(result);
    } catch (err) {
        console.error('POST /notifications/campaigns/send error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// Retry failed deliveries
router.post('/notifications/campaigns/:id/retry', ...adminAuth, async (req: AuthRequest, res: Response) => {
    try {
        const result = await retryFailedDeliveries(String(req.params.id), req.user!._id);
        res.json(result);
    } catch (err) {
        console.error('POST /notifications/campaigns/:id/retry error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

/* ────────────────────────────────────────────────────────────────
   Delivery logs
   ──────────────────────────────────────────────────────────────── */

router.get('/notifications/delivery-logs', ...adminAuth, async (req: AuthRequest, res: Response) => {
    try {
        const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10));
        const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '20'), 10)));
        const query: Record<string, unknown> = {};
        if (req.query.jobId) query.jobId = req.query.jobId;
        if (req.query.status) query.status = req.query.status;
        if (req.query.channel) query.channel = req.query.channel;
        if (req.query.originModule) query.originModule = String(req.query.originModule);
        if (req.query.originEntityId) query.originEntityId = String(req.query.originEntityId);

        const [logs, total] = await Promise.all([
            NotificationDeliveryLog.find(query)
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .lean(),
            NotificationDeliveryLog.countDocuments(query),
        ]);

        res.json({ logs, total, page, limit, totalPages: Math.ceil(total / limit) });
    } catch (err) {
        console.error('GET /notifications/delivery-logs error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

/* ────────────────────────────────────────────────────────────────
   Templates
   ──────────────────────────────────────────────────────────────── */

router.get('/notifications/templates', ...adminAuth, async (_req: Request, res: Response) => {
    try {
        const templates = await NotificationTemplate.find().sort({ category: 1, key: 1 }).lean();
        res.json(templates);
    } catch (err) {
        console.error('GET /notifications/templates error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

router.post('/notifications/templates', ...adminAuth, async (req: Request, res: Response) => {
    try {
        const template = await NotificationTemplate.create({
            key: String(req.body.key ?? '').toUpperCase().trim(),
            channel: req.body.channel,
            subject: req.body.subject,
            body: req.body.body,
            htmlBody: req.body.htmlBody ?? '',
            bodyFormat: req.body.bodyFormat ?? 'plain',
            designPreset: req.body.designPreset ?? '',
            placeholdersAllowed: req.body.placeholdersAllowed ?? [],
            isEnabled: req.body.isEnabled ?? true,
            category: req.body.category ?? 'other',
            versionNo: 1,
        });
        res.status(201).json(template);
    } catch (err) {
        console.error('POST /notifications/templates error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

router.put('/notifications/templates/:id', ...adminAuth, async (req: Request, res: Response) => {
    try {
        const template = await NotificationTemplate.findById(req.params.id);
        if (!template) { res.status(404).json({ message: 'Template not found' }); return; }

        if (req.body.key) template.key = String(req.body.key).toUpperCase().trim();
        if (req.body.channel) template.channel = req.body.channel;
        if (req.body.subject !== undefined) template.subject = req.body.subject;
        if (req.body.body) template.body = req.body.body;
        if (req.body.htmlBody !== undefined) template.htmlBody = req.body.htmlBody;
        if (req.body.bodyFormat !== undefined) template.bodyFormat = req.body.bodyFormat;
        if (req.body.designPreset !== undefined) template.designPreset = req.body.designPreset;
        if (req.body.placeholdersAllowed) template.placeholdersAllowed = req.body.placeholdersAllowed;
        if (req.body.isEnabled !== undefined) template.isEnabled = req.body.isEnabled;
        if (req.body.category) template.category = req.body.category;
        template.versionNo = (template.versionNo ?? 0) + 1;
        await template.save();
        res.json(template);
    } catch (err) {
        console.error('PUT /notifications/templates/:id error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

/* ────────────────────────────────────────────────────────────────
   Notification Settings
   ──────────────────────────────────────────────────────────────── */

router.get('/notifications/settings', ...adminAuth, async (_req: Request, res: Response) => {
    try {
        let settings: unknown = await NotificationSettings.findOne().lean();
        if (!settings) {
            const created = await NotificationSettings.create({});
            settings = created.toObject();
        }
        res.json(settings);
    } catch (err) {
        console.error('GET /notifications/settings error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

router.put('/notifications/settings', ...adminAuth, async (req: Request, res: Response) => {
    try {
        const settings = await NotificationSettings.findOneAndUpdate(
            {},
            { $set: req.body },
            { new: true, upsert: true },
        );
        res.json(settings);
    } catch (err) {
        console.error('PUT /notifications/settings error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

/* ────────────────────────────────────────────────────────────────
   Data Hub exports
   ──────────────────────────────────────────────────────────────── */

router.get('/subscription-contact-center/overview', ...contactCenterViewAuth, async (req: AuthRequest, res: Response) => {
    try {
        const data = await getSubscriptionContactCenterOverview(req.query as Record<string, unknown>);
        res.json(data);
    } catch (err) {
        console.error('GET /subscription-contact-center/overview error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

router.get('/notifications/dashboard-summary', ...adminAuth, async (_req: AuthRequest, res: Response) => {
    try {
        const now = new Date();
        const startOfToday = new Date(now);
        startOfToday.setHours(0, 0, 0, 0);
        const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        const [
            totalCampaigns,
            queuedCount,
            processingCount,
            completedCount,
            failedCount,
            scheduledCount,
            sentToday,
            failedToday,
            activeTriggersDoc,
            providers,
            recentLogs,
            upcomingJobs,
            audienceOverview,
        ] = await Promise.all([
            NotificationJob.countDocuments(),
            NotificationJob.countDocuments({ status: 'queued' }),
            NotificationJob.countDocuments({ status: 'processing' }),
            NotificationJob.countDocuments({ status: 'done' }),
            NotificationJob.countDocuments({ status: { $in: ['failed', 'partial'] } }),
            NotificationJob.countDocuments({ scheduledAtUTC: { $gt: now } }),
            NotificationDeliveryLog.countDocuments({ status: 'sent', createdAt: { $gte: startOfToday } }),
            NotificationDeliveryLog.countDocuments({ status: 'failed', createdAt: { $gte: startOfToday } }),
            NotificationSettings.findOne().lean(),
            NotificationProvider.find().select('displayName provider type isEnabled updatedAt').lean(),
            NotificationDeliveryLog.find({ createdAt: { $gte: sevenDaysAgo } })
                .sort({ createdAt: -1 })
                .limit(200)
                .select('providerUsed status createdAt originModule originEntityId')
                .lean(),
            NotificationJob.find({ scheduledAtUTC: { $gt: now } })
                .sort({ scheduledAtUTC: 1, createdAt: 1 })
                .limit(5)
                .select('campaignName channel scheduledAtUTC status totalTargets')
                .lean(),
            getSubscriptionContactCenterOverview({}),
        ]);

        const logsByProvider = new Map<string, { total: number; failed: number; lastSuccessAt: string | null }>();
        for (const log of recentLogs as Array<Record<string, unknown>>) {
            const key = String(log.providerUsed || '').trim();
            if (!key) continue;
            const entry = logsByProvider.get(key) || { total: 0, failed: 0, lastSuccessAt: null };
            entry.total += 1;
            if (String(log.status) === 'failed') {
                entry.failed += 1;
            } else if (String(log.status) === 'sent' && !entry.lastSuccessAt) {
                entry.lastSuccessAt = String(log.createdAt || '');
            }
            logsByProvider.set(key, entry);
        }

        const providerHealth = (providers as Array<Record<string, unknown>>).map((provider) => {
            const key = String(provider.displayName || provider.provider || '');
            const stats = logsByProvider.get(key) || { total: 0, failed: 0, lastSuccessAt: null };
            return {
                id: String(provider._id || ''),
                name: key,
                type: String(provider.type || ''),
                provider: String(provider.provider || ''),
                isEnabled: Boolean(provider.isEnabled),
                totalAttempts: stats.total,
                failedAttempts: stats.failed,
                failureRate: stats.total > 0 ? Number(((stats.failed / stats.total) * 100).toFixed(1)) : 0,
                lastSuccessAt: stats.lastSuccessAt,
                updatedAt: String(provider.updatedAt || ''),
            };
        });

        res.json({
            totals: {
                totalCampaigns,
                queuedCount,
                processingCount,
                completedCount,
                failedCount,
                scheduledCount,
                sentToday,
                failedToday,
                activeTriggers: Array.isArray(activeTriggersDoc?.triggers)
                    ? activeTriggersDoc.triggers.filter((trigger) => trigger.enabled).length
                    : 0,
                activeProviders: providerHealth.filter((provider) => provider.isEnabled).length,
                failedProviders: providerHealth.filter((provider) => provider.isEnabled && provider.failureRate >= 50 && provider.totalAttempts > 0).length,
            },
            audience: audienceOverview.summary,
            upcomingJobs,
            providerHealth,
            recentFailures: (recentLogs as Array<Record<string, unknown>>)
                .filter((log) => String(log.status) === 'failed')
                .slice(0, 8),
        });
    } catch (err) {
        console.error('GET /notifications/dashboard-summary error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

router.get('/subscription-contact-center/members', ...contactCenterViewAuth, async (req: AuthRequest, res: Response) => {
    try {
        const role = assertActorRole(req);
        const canViewGuardian = ['superadmin', 'admin'].includes(role);
        const data = await getSubscriptionContactCenterMembers({
            filters: req.query as Record<string, unknown>,
            page: req.query.page ? parseInt(String(req.query.page), 10) : 1,
            limit: req.query.limit ? parseInt(String(req.query.limit), 10) : 25,
            includeGuardianData: canViewGuardian,
        });
        res.json({
            ...data,
            permissions: {
                canViewGuardian,
                canExport: ['superadmin', 'admin', 'moderator'].includes(role),
                canPersonalOutreach: ['superadmin', 'admin'].includes(role),
            },
        });
    } catch (err) {
        console.error('GET /subscription-contact-center/members error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

router.post('/subscription-contact-center/copy-preview', ...contactCenterExportAuth, async (req: AuthRequest, res: Response) => {
    try {
        const role = assertActorRole(req);
        if (requiresGuardianAccess(req.body) && !['superadmin', 'admin'].includes(role)) {
            res.status(403).json({ message: 'Guardian contact access is restricted' });
            return;
        }
        if (String(req.body.mode || '') === 'personal_outreach' && !['superadmin', 'admin'].includes(role)) {
            res.status(403).json({ message: 'Personal outreach is restricted' });
            return;
        }
        const payload = await previewSubscriptionContactCopy({
            filters: (req.body.filters || {}) as Record<string, unknown>,
            scope: String(req.body.scope || 'phones') as SubscriptionContactScope,
            presetId: typeof req.body.presetId === 'string' ? req.body.presetId : null,
            preset: typeof req.body.preset === 'object' && req.body.preset !== null ? req.body.preset as Record<string, unknown> : null,
            adminId: assertAdminId(req),
            actorRole: role,
            mode: req.body.mode === 'personal_outreach' ? 'personal_outreach' : 'copy_preview',
        });
        res.json(payload);
    } catch (err) {
        console.error('POST /subscription-contact-center/copy-preview error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

router.post('/subscription-contact-center/export', ...contactCenterExportAuth, async (req: AuthRequest, res: Response) => {
    try {
        const role = assertActorRole(req);
        if (requiresGuardianAccess(req.body) && !['superadmin', 'admin'].includes(role)) {
            res.status(403).json({ message: 'Guardian contact access is restricted' });
            return;
        }
        const result = await exportSubscriptionContactData({
            filters: (req.body.filters || {}) as Record<string, unknown>,
            scope: String(req.body.scope || 'phones') as SubscriptionContactScope,
            format: String(req.body.format || 'xlsx') as 'xlsx' | 'csv' | 'txt' | 'json' | 'clipboard',
            presetId: typeof req.body.presetId === 'string' ? req.body.presetId : null,
            preset: typeof req.body.preset === 'object' && req.body.preset !== null ? req.body.preset as Record<string, unknown> : null,
            adminId: assertAdminId(req),
            actorRole: role,
        });

        if (result.text && (req.body.format === 'txt' || req.body.format === 'clipboard')) {
            res.json({ text: result.text, previewText: result.previewText, rowCount: result.rowCount, fileName: result.fileName });
            return;
        }

        if (result.rows && req.body.format === 'json') {
            res.json({ data: result.rows, count: result.rowCount, fileName: result.fileName });
            return;
        }

        res.setHeader('Content-Type', result.mimeType);
        res.setHeader('Content-Disposition', `attachment; filename=\"${result.fileName}\"`);
        res.send(result.buffer);
    } catch (err) {
        console.error('POST /subscription-contact-center/export error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

router.get('/subscription-contact-center/presets', ...contactCenterPresetAuth, async (_req: AuthRequest, res: Response) => {
    try {
        const data = await listSubscriptionContactPresets();
        res.json({ items: data });
    } catch (err) {
        console.error('GET /subscription-contact-center/presets error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

router.post('/subscription-contact-center/presets', ...contactCenterPresetAuth, async (req: AuthRequest, res: Response) => {
    try {
        const item = await createSubscriptionContactPreset({
            payload: req.body,
            adminId: assertAdminId(req),
            actorRole: assertActorRole(req),
        });
        res.status(201).json({ item });
    } catch (err) {
        console.error('POST /subscription-contact-center/presets error:', err);
        res.status(400).json({ message: err instanceof Error ? err.message : 'Server error' });
    }
});

router.patch('/subscription-contact-center/presets/:id', ...contactCenterPresetAuth, async (req: AuthRequest, res: Response) => {
    try {
        const item = await updateSubscriptionContactPreset({
            presetId: String(req.params.id || ''),
            payload: req.body,
            adminId: assertAdminId(req),
            actorRole: assertActorRole(req),
        });
        res.json({ item });
    } catch (err) {
        console.error('PATCH /subscription-contact-center/presets/:id error:', err);
        res.status(400).json({ message: err instanceof Error ? err.message : 'Server error' });
    }
});

router.delete('/subscription-contact-center/presets/:id', ...contactCenterPresetAuth, async (req: AuthRequest, res: Response) => {
    try {
        const result = await deleteSubscriptionContactPreset({
            presetId: String(req.params.id || ''),
            adminId: assertAdminId(req),
            actorRole: assertActorRole(req),
        });
        res.json(result);
    } catch (err) {
        console.error('DELETE /subscription-contact-center/presets/:id error:', err);
        res.status(400).json({ message: err instanceof Error ? err.message : 'Server error' });
    }
});

router.get('/subscription-contact-center/logs', ...contactCenterViewAuth, async (req: AuthRequest, res: Response) => {
    try {
        const data = await getSubscriptionContactLogs({
            page: req.query.page ? parseInt(String(req.query.page), 10) : 1,
            limit: req.query.limit ? parseInt(String(req.query.limit), 10) : 25,
        });
        res.json(data);
    } catch (err) {
        console.error('GET /subscription-contact-center/logs error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

router.post('/data-hub/export', ...adminAuth, async (req: AuthRequest, res: Response) => {
    try {
        const { category, format, filters, selectedFields, groupId, jobId, channel, includeGuardians } = req.body;
        const adminId = req.user!._id;
        const actorRole = assertActorRole(req);
        const baseOpts = { category, format: format ?? 'xlsx', filters, selectedFields, adminId };

        if (['phone_list', 'email_list', 'guardians', 'manual_send_list', 'audience_segment'].includes(String(category || ''))) {
            const legacyFilters: Record<string, unknown> = { ...(filters || {}) };
            if (groupId) legacyFilters.groupIds = [String(groupId)];
            let scope: SubscriptionContactScope = 'phones';
            if (category === 'email_list') scope = 'emails';
            if (category === 'guardians') scope = 'guardian';
            if (category === 'manual_send_list') scope = includeGuardians ? 'student_guardian' : (channel === 'email' ? 'emails' : 'phones');
            if (category === 'audience_segment') scope = 'raw';
            if ((scope === 'guardian' || scope === 'student_guardian') && !['superadmin', 'admin'].includes(actorRole)) {
                res.status(403).json({ message: 'Guardian contact access is restricted' });
                return;
            }

            const result = await exportSubscriptionContactData({
                filters: legacyFilters,
                scope,
                format: String(format || 'xlsx') as 'xlsx' | 'csv' | 'txt' | 'json' | 'clipboard',
                adminId: String(adminId),
                actorRole,
            });

            if (result.text && (format === 'txt' || format === 'clipboard')) {
                res.json({ text: result.text, rowCount: result.rowCount, fileName: result.fileName });
                return;
            }

            if (result.rows && format === 'json') {
                res.json({ data: result.rows, count: result.rowCount, fileName: result.fileName });
                return;
            }

            res.setHeader('Content-Type', result.mimeType);
            res.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`);
            res.send(result.buffer);
            return;
        }

        let result;
        switch (category) {
            case 'phone_list':
                result = await exportPhoneList(baseOpts);
                break;
            case 'email_list':
                result = await exportEmailList(baseOpts);
                break;
            case 'guardians':
                result = await exportGuardianList(baseOpts);
                break;
            case 'audience_segment':
                result = await exportAudienceSegment({ ...baseOpts, groupId });
                break;
            case 'failed_deliveries':
                result = await exportFailedDeliveries({ ...baseOpts, jobId });
                break;
            case 'manual_send_list':
                result = await exportManualSendList({ ...baseOpts, channel: channel ?? 'sms', includeGuardians });
                break;
            default:
                res.status(400).json({ message: `Unknown export category: ${category}` });
                return;
        }

        if (result.text && (format === 'txt' || format === 'clipboard')) {
            res.json({ text: result.text, rowCount: result.rowCount, fileName: result.fileName });
            return;
        }

        if (result.data && format === 'json') {
            res.json({ data: result.data, count: result.rowCount, fileName: result.fileName });
            return;
        }

        res.setHeader('Content-Type', result.mimeType);
        res.setHeader('Content-Disposition', `attachment; filename="${result.fileName}"`);
        res.send(result.buffer);
    } catch (err) {
        console.error('POST /data-hub/export error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

router.get('/data-hub/history', ...adminAuth, async (req: AuthRequest, res: Response) => {
    try {
        const result = await getImportExportHistory({
            direction: req.query.direction as 'import' | 'export' | undefined,
            category: req.query.category as string | undefined,
            page: req.query.page ? parseInt(String(req.query.page), 10) : undefined,
            limit: req.query.limit ? parseInt(String(req.query.limit), 10) : undefined,
        });
        res.json(result);
    } catch (err) {
        console.error('GET /data-hub/history error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

/* ────────────────────────────────────────────────────────────────
   Trigger auto-send (for internal use / cron)
   ──────────────────────────────────────────────────────────────── */

router.post('/notifications/trigger', ...adminAuth, async (req: AuthRequest, res: Response) => {
    try {
        const result = await triggerAutoSend(
            req.body.triggerKey,
            req.body.studentIds,
            req.body.vars ?? {},
            req.user!._id,
        );
        res.json(result);
    } catch (err) {
        console.error('POST /notifications/trigger error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

/* ────────────────────────────────────────────────────────────────
   Trigger configuration management
   ──────────────────────────────────────────────────────────────── */

// Get all configured triggers
router.get('/notifications/triggers', ...adminAuth, async (_req: Request, res: Response) => {
    try {
        const settings = await NotificationSettings.findOne().lean() ??
            (await NotificationSettings.create({})).toObject();
        res.json({
            triggers: settings.triggers ?? [],
            resultPublishAutoSend: settings.resultPublishAutoSend ?? false,
            resultPublishChannels: settings.resultPublishChannels ?? [],
            resultPublishGuardianIncluded: settings.resultPublishGuardianIncluded ?? false,
            subscriptionReminderDays: settings.subscriptionReminderDays ?? [7, 3, 1],
            autoSyncCostToFinance: settings.autoSyncCostToFinance ?? true,
        });
    } catch (err) {
        console.error('GET /notifications/triggers error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// Upsert a single trigger
router.put('/notifications/triggers/:triggerKey', ...adminAuth, async (req: AuthRequest, res: Response) => {
    try {
        const { triggerKey } = req.params;
        const {
            enabled,
            channels,
            guardianIncluded,
            templateKey,
            delayMinutes,
            batchSize,
            retryEnabled,
            quietHoursMode,
            audienceMode,
        } = req.body;
        if (!triggerKey || typeof triggerKey !== 'string') {
            res.status(400).json({ message: 'triggerKey is required' });
            return;
        }
        const allowedChannels = (channels ?? []).filter((c: string) => ['sms', 'email'].includes(c));

        const settings = await NotificationSettings.findOne();
        if (!settings) {
            res.status(500).json({ message: 'Settings not initialized' });
            return;
        }

        const idx = settings.triggers.findIndex((t) => t.triggerKey === triggerKey);
        const triggerData: {
            triggerKey: string;
            enabled: boolean;
            channels: ('sms' | 'email')[];
            guardianIncluded: boolean;
            templateKey: string;
            delayMinutes: number;
            batchSize: number;
            retryEnabled: boolean;
            quietHoursMode: 'respect' | 'bypass';
            audienceMode: 'affected' | 'subscription_active' | 'subscription_renewal_due' | 'custom';
        } = {
            triggerKey,
            enabled: enabled ?? true,
            channels: allowedChannels.length > 0 ? allowedChannels : ['sms'],
            guardianIncluded: guardianIncluded ?? false,
            templateKey: templateKey ? String(templateKey).toUpperCase().trim() : '',
            delayMinutes: Number.isFinite(Number(delayMinutes)) ? Math.max(0, Number(delayMinutes)) : 0,
            batchSize: Number.isFinite(Number(batchSize)) ? Math.max(0, Number(batchSize)) : 0,
            retryEnabled: retryEnabled ?? true,
            quietHoursMode: quietHoursMode === 'bypass' ? 'bypass' : 'respect',
            audienceMode: ['affected', 'subscription_active', 'subscription_renewal_due', 'custom'].includes(String(audienceMode))
                ? (String(audienceMode) as 'affected' | 'subscription_active' | 'subscription_renewal_due' | 'custom')
                : 'affected',
        };

        if (idx >= 0) {
            settings.triggers[idx] = triggerData;
        } else {
            settings.triggers.push(triggerData);
        }
        await settings.save();
        res.json({ trigger: triggerData });
    } catch (err) {
        console.error('PUT /notifications/triggers/:triggerKey error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// Bulk update triggers
router.put('/notifications/triggers', ...adminAuth, async (req: AuthRequest, res: Response) => {
    try {
        const { triggers, resultPublishAutoSend, resultPublishChannels, resultPublishGuardianIncluded, subscriptionReminderDays } = req.body;
        const update: Record<string, unknown> = {};

        if (Array.isArray(triggers)) {
            update.triggers = triggers.map((t: Record<string, unknown>) => ({
                triggerKey: String(t.triggerKey ?? ''),
                enabled: t.enabled ?? true,
                channels: (Array.isArray(t.channels) ? t.channels : ['sms']).filter((c: string) => ['sms', 'email'].includes(c)),
                guardianIncluded: t.guardianIncluded ?? false,
                templateKey: t.templateKey ? String(t.templateKey).toUpperCase().trim() : '',
                delayMinutes: Number.isFinite(Number(t.delayMinutes)) ? Math.max(0, Number(t.delayMinutes)) : 0,
                batchSize: Number.isFinite(Number(t.batchSize)) ? Math.max(0, Number(t.batchSize)) : 0,
                retryEnabled: t.retryEnabled ?? true,
                quietHoursMode: t.quietHoursMode === 'bypass' ? 'bypass' : 'respect',
                audienceMode: ['affected', 'subscription_active', 'subscription_renewal_due', 'custom'].includes(String(t.audienceMode))
                    ? String(t.audienceMode)
                    : 'affected',
            }));
        }
        if (resultPublishAutoSend !== undefined) update.resultPublishAutoSend = !!resultPublishAutoSend;
        if (Array.isArray(resultPublishChannels)) update.resultPublishChannels = resultPublishChannels.filter((c: string) => ['sms', 'email'].includes(c));
        if (resultPublishGuardianIncluded !== undefined) update.resultPublishGuardianIncluded = !!resultPublishGuardianIncluded;
        if (Array.isArray(subscriptionReminderDays)) update.subscriptionReminderDays = subscriptionReminderDays.filter((d: number) => d > 0 && d <= 90);

        const settings = await NotificationSettings.findOneAndUpdate({}, { $set: update }, { new: true, upsert: true });
        res.json({
            triggers: settings.triggers,
            resultPublishAutoSend: settings.resultPublishAutoSend,
            resultPublishChannels: settings.resultPublishChannels,
            resultPublishGuardianIncluded: settings.resultPublishGuardianIncluded,
            subscriptionReminderDays: settings.subscriptionReminderDays,
        });
    } catch (err) {
        console.error('PUT /notifications/triggers error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

/* ────────────────────────────────────────────────────────────────
   Advanced Notification Settings (Req 1.1–1.5, 12.1, 12.4, 15.1, 18.1–18.3, 19.1)
   ──────────────────────────────────────────────────────────────── */

// GET /notification-settings — read settings with migration defaults merge (Req 1.1, 1.2, 18.3)
router.get('/notification-settings', ...adminAuth, async (_req: AuthRequest, res: Response) => {
    try {
        let doc: Record<string, unknown> | null = await NotificationSettings.findOne().lean();
        if (!doc) {
            const created = await NotificationSettings.create({});
            doc = created.toObject() as unknown as Record<string, unknown>;
        }
        const merged = applyMigrationDefaults(doc);
        res.json(merged);
    } catch (err) {
        console.error('GET /notification-settings error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// PUT /notification-settings — update with validation + RBAC + audit + cache invalidation (Req 1.4, 1.5, 12.1, 12.4, 18.1, 19.1)
router.put('/notification-settings', ...adminAuth, settingsValidator, settingsRbac, async (req: AuthRequest, res: Response) => {
    try {
        // Load current settings as the "before" snapshot
        const before = await NotificationSettings.findOne().lean();
        if (!before) {
            res.status(404).json({ message: 'Settings document not found' });
            return;
        }

        const beforeSnapshot = before as Record<string, unknown>;
        const currentVersion = (beforeSnapshot.schemaVersion as number | undefined) ?? 1;

        // Increment schemaVersion (Req 18.1, 1.3)
        const updateBody = { ...req.body, schemaVersion: currentVersion + 1 };

        const updated = await NotificationSettings.findOneAndUpdate(
            {},
            { $set: updateBody },
            { new: true },
        );

        if (!updated) {
            res.status(500).json({ message: 'Failed to update settings' });
            return;
        }

        const afterSnapshot = updated.toObject() as unknown as Record<string, unknown>;

        // Compute diff of changed fields
        const diff: Array<{ field: string; oldValue: unknown; newValue: unknown }> = [];
        for (const key of Object.keys(req.body)) {
            diff.push({
                field: key,
                oldValue: beforeSnapshot[key] ?? null,
                newValue: afterSnapshot[key] ?? null,
            });
        }
        // Always include schemaVersion in diff
        diff.push({
            field: 'schemaVersion',
            oldValue: currentVersion,
            newValue: currentVersion + 1,
        });

        // Audit log (Req 12.4, 18.1) — store previous snapshot
        const adminId = assertAdminId(req);
        const actorRole = assertActorRole(req);
        await auditLog({
            actorId: new mongoose.Types.ObjectId(adminId),
            actorRole,
            timestamp: new Date(),
            ipAddress: String(req.ip || 'unknown'),
            section: 'notification-settings',
            beforeSnapshot,
            afterSnapshot,
            diff,
        });

        // Invalidate settings cache (Req 19.1)
        settingsCacheService.invalidate();

        res.json(updated);
    } catch (err) {
        console.error('PUT /notification-settings error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// POST /notification-settings/simulate — test configuration simulation (Req 15.1)
router.post('/notification-settings/simulate', ...adminAuth, async (req: AuthRequest, res: Response) => {
    try {
        const result = await simulate(req.body);
        res.json(result);
    } catch (err) {
        console.error('POST /notification-settings/simulate error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// GET /notification-settings/versions/:version — read historical version (Req 18.2)
router.get('/notification-settings/versions/:version', ...adminAuth, async (req: AuthRequest, res: Response) => {
    try {
        const version = parseInt(String(req.params.version), 10);
        if (!Number.isFinite(version) || version < 1) {
            res.status(400).json({ message: 'Invalid version number' });
            return;
        }
        const snapshot = await getVersionSnapshot(version);
        if (!snapshot) {
            res.status(404).json({ message: `Version ${version} not found` });
            return;
        }
        res.json(snapshot);
    } catch (err) {
        console.error('GET /notification-settings/versions/:version error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

// GET /notification-settings/audit-trail — query settings audit trail (Req 12.4, 18.1)
router.get('/notification-settings/audit-trail', ...adminAuth, async (req: AuthRequest, res: Response) => {
    try {
        const section = req.query.section as string | undefined;
        const limit = Math.min(100, Math.max(1, parseInt(String(req.query.limit ?? '50'), 10)));
        const offset = Math.max(0, parseInt(String(req.query.offset ?? '0'), 10));
        const entries = await getAuditHistory(section, limit, offset);
        res.json({ entries, limit, offset });
    } catch (err) {
        console.error('GET /notification-settings/audit-trail error:', err);
        res.status(500).json({ message: 'Server error' });
    }
});

/* ────────────────────────────────────────────────────────────────
   Test-Send endpoints
   ──────────────────────────────────────────────────────────────── */

export default router;
