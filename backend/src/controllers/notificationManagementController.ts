import { Response } from 'express';
import { AuthRequest } from '../middlewares/auth';
import { ResponseBuilder } from '../utils/responseBuilder';
import Notification from '../models/Notification';
import Settings from '../models/Settings';
import GroupMembership from '../models/GroupMembership';

// ── Notification Management Controller ──────────────────────
// Thin handlers for admin notification management endpoints:
// sent list, channel defaults CRUD, and announcement creation.
// Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 5.3, 5.4,
//               6.1, 6.3, 7.1, 7.2, 7.3, 7.5, 7.6, 10.1, 10.2, 10.4

/** All 9 notification event types used for system defaults. */
const NOTIFICATION_EVENT_TYPES = [
    { eventType: 'exam_published', label: 'Exam Published' },
    { eventType: 'exam_starting_soon', label: 'Exam Starting Soon' },
    { eventType: 'result_published', label: 'Result Published' },
    { eventType: 'streak_warning', label: 'Streak Warning' },
    { eventType: 'group_membership', label: 'Group Membership' },
    { eventType: 'battle_challenge', label: 'Battle Challenge' },
    { eventType: 'payment_confirmation', label: 'Payment Confirmation' },
    { eventType: 'routine_reminder', label: 'Routine Reminder' },
    { eventType: 'doubt_reply', label: 'Doubt Reply' },
] as const;

/**
 * Build system defaults: all event types with inApp true, others false.
 */
function buildSystemDefaults() {
    return NOTIFICATION_EVENT_TYPES.map((entry) => ({
        eventType: entry.eventType,
        label: entry.label,
        inApp: true,
        email: false,
        push: false,
        sms: false,
    }));
}

// ─── GET /admin/sent ────────────────────────────────────────

/**
 * GET /admin/sent — List recently sent notifications.
 * Accepts optional `limit` query param (default 50, clamped to [1, 200]).
 */
export async function getSentNotifications(req: AuthRequest, res: Response): Promise<void> {
    try {
        let limit = parseInt(req.query.limit as string, 10);
        if (isNaN(limit)) limit = 50;
        limit = Math.max(1, Math.min(200, limit));

        const items = await Notification.find()
            .sort({ createdAt: -1 })
            .limit(limit)
            .lean();

        ResponseBuilder.send(res, 200, ResponseBuilder.success({ items }));
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Server error';
        ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', message));
    }
}

// ─── GET /admin/defaults ────────────────────────────────────

/**
 * GET /admin/defaults — Fetch notification channel defaults.
 * Returns saved defaults from Settings, or system defaults if none found.
 */
export async function getNotificationDefaults(req: AuthRequest, res: Response): Promise<void> {
    try {
        const settings = await Settings.findOne().lean();
        const saved = (settings as Record<string, unknown> | null)?.notificationChannelDefaults as
            | unknown[]
            | undefined;

        const defaults = saved && Array.isArray(saved) && saved.length > 0
            ? saved
            : buildSystemDefaults();

        ResponseBuilder.send(res, 200, ResponseBuilder.success({ defaults }));
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Server error';
        ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', message));
    }
}

// ─── PUT /admin/defaults ────────────────────────────────────

/**
 * PUT /admin/defaults — Update notification channel defaults.
 * Body already validated by Zod middleware.
 */
export async function updateNotificationDefaults(req: AuthRequest, res: Response): Promise<void> {
    try {
        const { defaults } = req.body;

        await Settings.findOneAndUpdate(
            {},
            { $set: { notificationChannelDefaults: defaults } },
            { upsert: true, new: true },
        );

        ResponseBuilder.send(res, 200, ResponseBuilder.success({ defaults }));
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Server error';
        ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', message));
    }
}

// ─── POST /admin/announce ───────────────────────────────────

/**
 * POST /admin/announce — Send an announcement notification.
 * Body already validated by Zod middleware.
 */
export async function sendAnnouncement(req: AuthRequest, res: Response): Promise<void> {
    try {
        const { title, message, type, targetRole, targetGroupId, targetUserIds } = req.body;

        // Resolve group membership if targetGroupId is provided
        let resolvedUserIds = targetUserIds;
        if (targetGroupId) {
            const memberships = await GroupMembership.find({
                groupId: targetGroupId,
                membershipStatus: 'active',
            }).select('studentId').lean();

            resolvedUserIds = memberships.map((m) => m.studentId);
        }

        const notification = await Notification.create({
            title,
            message,
            type: type || 'announcement',
            category: 'general',
            createdBy: req.user!._id,
            ...(targetRole ? { targetRole } : {}),
            ...(resolvedUserIds ? { targetUserIds: resolvedUserIds } : {}),
        });

        ResponseBuilder.send(res, 201, ResponseBuilder.created(notification));
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Server error';
        ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', message));
    }
}
