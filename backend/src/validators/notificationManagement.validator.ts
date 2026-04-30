import { z } from 'zod';

// ── Notification Management Validation Schemas ──────────
// Zod schemas for notification defaults and announcement endpoints.
// Requirements: 6.2, 6.4, 6.5, 7.4, 7.7, 7.8, 9.3, 9.4

/** Reusable 24-char hex ObjectId string validator. */
const objectId = z.string().regex(/^[a-fA-F0-9]{24}$/, 'Invalid ObjectId');

/** Notification event types for channel default configuration. */
const notificationEventType = z.enum([
    'exam_published',
    'exam_starting_soon',
    'result_published',
    'streak_warning',
    'group_membership',
    'battle_challenge',
    'payment_confirmation',
    'routine_reminder',
    'doubt_reply',
]);

/** Single channel default entry — one per event type. */
const channelDefaultEntry = z.object({
    eventType: notificationEventType,
    label: z.string().min(1, 'Label is required'),
    inApp: z.boolean(),
    email: z.boolean(),
    push: z.boolean(),
    sms: z.boolean(),
});

// ── Update Notification Defaults ────────────────────────

export const updateNotificationDefaultsSchema = z.object({
    defaults: z.array(channelDefaultEntry).min(1, 'At least one default entry is required'),
});

// ── Send Announcement ───────────────────────────────────

export const sendAnnouncementSchema = z
    .object({
        title: z.string().trim().min(1, 'Title is required').max(200, 'Title must be 200 characters or less'),
        message: z.string().trim().min(1, 'Message is required').max(2000, 'Message must be 2000 characters or less'),
        type: z.string().default('announcement'),
        targetRole: z.string().optional(),
        targetGroupId: objectId.optional(),
        targetUserIds: z.array(z.string()).optional(),
    })
    .refine(
        (data) => data.targetRole || data.targetGroupId || data.targetUserIds,
        { message: 'At least one targeting field is required (targetRole, targetGroupId, or targetUserIds)' },
    );
