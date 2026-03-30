import mongoose from 'mongoose';

import Notification, {
    type NotificationCategory,
    type NotificationPriority,
    type NotificationTargetRole,
    type NotificationType,
} from '../models/Notification';
import AdminNotificationRead from '../models/AdminNotificationRead';

type AlertAudienceRole = 'superadmin' | 'admin' | 'moderator' | 'viewer' | 'support_agent' | 'finance_agent';

type CreateAlertInput = {
    title: string;
    message: string;
    type?: NotificationType;
    messagePreview?: string;
    category?: NotificationCategory;
    linkUrl?: string;
    sourceType?: string;
    sourceId?: string;
    targetRoute?: string;
    targetEntityId?: string;
    priority?: NotificationPriority;
    actorUserId?: string | mongoose.Types.ObjectId | null;
    actorNameSnapshot?: string;
    targetRole?: NotificationTargetRole;
    targetUserIds?: Array<string | mongoose.Types.ObjectId>;
    createdBy?: string | mongoose.Types.ObjectId | null;
    dedupeKey?: string;
};

type QueryAlertsInput = {
    userId: string | mongoose.Types.ObjectId;
    role: AlertAudienceRole;
    page?: number;
    limit?: number;
    unread?: boolean;
    type?: string;
    group?: string;
};

type ActionableAlertGroup = 'support' | 'contact' | 'approvals' | 'finance' | 'system';

type ActionableAlertRow = {
    _id: mongoose.Types.ObjectId;
    title: string;
    message: string;
    type?: NotificationType;
    messagePreview?: string;
    category: NotificationCategory;
    linkUrl?: string;
    sourceType?: string;
    sourceId?: string;
    targetRoute?: string;
    targetEntityId?: string;
    priority?: NotificationPriority;
    actorUserId?: mongoose.Types.ObjectId | null;
    actorNameSnapshot?: string;
    publishAt?: Date | null;
    createdAt: Date;
    targetRole: NotificationTargetRole;
};

const ADMIN_LINK_PREFIX = /^\/__cw_admin__(\/|$)/i;

function toObjectId(value: string | mongoose.Types.ObjectId | null | undefined): mongoose.Types.ObjectId | null {
    if (!value) return null;
    if (value instanceof mongoose.Types.ObjectId) return value;
    const raw = String(value || '').trim();
    if (!mongoose.Types.ObjectId.isValid(raw)) return null;
    return new mongoose.Types.ObjectId(raw);
}

function toObjectIdList(values: Array<string | mongoose.Types.ObjectId> = []): mongoose.Types.ObjectId[] {
    const seen = new Set<string>();
    const output: mongoose.Types.ObjectId[] = [];
    for (const value of values) {
        const objectId = toObjectId(value);
        if (!objectId) continue;
        const key = String(objectId);
        if (seen.has(key)) continue;
        seen.add(key);
        output.push(objectId);
    }
    return output;
}

function resolveAllowedRoles(role: AlertAudienceRole): NotificationTargetRole[] {
    if (role === 'moderator') return ['moderator', 'admin', 'all'];
    return ['admin', 'all'];
}

function resolveActionableRoleFilter(role: AlertAudienceRole): Record<string, unknown> {
    const allowed = resolveAllowedRoles(role);
    const baseRoles = allowed.filter((item) => item !== 'all');
    return {
        $or: [
            { targetRole: { $in: baseRoles } },
            { targetRole: 'all', linkUrl: ADMIN_LINK_PREFIX },
        ],
    };
}

function buildDerivedLinkUrl(input: Pick<CreateAlertInput, 'linkUrl' | 'targetRoute' | 'targetEntityId'>): string {
    if (String(input.linkUrl || '').trim()) return String(input.linkUrl || '').trim();
    const targetRoute = String(input.targetRoute || '').trim();
    const targetEntityId = String(input.targetEntityId || '').trim();
    if (!targetRoute) return '';
    if (!targetEntityId) return targetRoute;
    if (targetRoute.includes('/contact')) return `${targetRoute}?focus=${targetEntityId}`;
    if (targetRoute.includes('/support-center')) return `${targetRoute}?ticketId=${targetEntityId}`;
    return `${targetRoute}?id=${targetEntityId}`;
}

function parseTargetMetaFromLink(linkUrl: string): { targetRoute: string; targetEntityId: string } {
    const raw = String(linkUrl || '').trim();
    if (!raw) return { targetRoute: '', targetEntityId: '' };

    const [pathname, query = ''] = raw.split('?');
    const params = new URLSearchParams(query);
    const targetEntityId = String(
        params.get('ticketId')
        || params.get('focus')
        || params.get('id')
        || params.get('requestId')
        || params.get('studentId')
        || params.get('userId')
        || params.get('profileId')
        || params.get('paymentId')
        || params.get('notificationId')
        || params.get('sourceId')
        || ''
    ).trim();
    return {
        targetRoute: pathname || '',
        targetEntityId,
    };
}

function buildActionableFilter(userId: mongoose.Types.ObjectId, role: AlertAudienceRole, type?: string): Record<string, unknown> {
    const now = new Date();
    const filter: Record<string, unknown> = {
        isActive: true,
        $or: [
            { targetUserIds: { $exists: false } },
            { targetUserIds: { $size: 0 } },
            { targetUserIds: userId },
        ],
        $and: [
            resolveActionableRoleFilter(role),
            { $or: [{ publishAt: { $exists: false } }, { publishAt: null }, { publishAt: { $lte: now } }] },
            { $or: [{ expireAt: { $exists: false } }, { expireAt: null }, { expireAt: { $gte: now } }] },
        ],
    };
    const normalizedType = String(type || '').trim();
    if (normalizedType) {
        filter.type = normalizedType;
    }
    return filter;
}

function deriveActionableAlertGroup(item: Pick<ActionableAlertRow, 'type' | 'sourceType' | 'targetRoute' | 'linkUrl'>): ActionableAlertGroup {
    const type = String(item.type || '').trim().toLowerCase();
    const sourceType = String(item.sourceType || '').trim().toLowerCase();
    const targetRoute = String(item.targetRoute || '').trim().toLowerCase();
    const linkUrl = String(item.linkUrl || '').trim().toLowerCase();

    if (
        type === 'support_ticket_new'
        || type === 'support_reply_new'
        || type === 'support_status_changed'
        || sourceType === 'support_ticket'
        || targetRoute.includes('/support-center')
        || linkUrl.includes('/support-center')
    ) {
        return 'support';
    }
    if (type === 'contact_new' || sourceType === 'contact' || targetRoute.includes('/contact') || linkUrl.includes('/contact')) {
        return 'contact';
    }
    if (
        type === 'profile_update_request'
        || sourceType === 'profile_update_request'
        || targetRoute.includes('/profile-requests')
        || linkUrl.includes('/profile-requests')
    ) {
        return 'approvals';
    }
    if (
        type === 'payment_review'
        || type === 'payment_verified'
        || type === 'payment_rejected'
        || sourceType === 'manual_payment'
        || sourceType === 'payment'
        || targetRoute.includes('/finance')
        || linkUrl.includes('/finance')
    ) {
        return 'finance';
    }
    return 'system';
}

async function createAlertDocument(
    input: CreateAlertInput,
    defaultRole: NotificationTargetRole,
) {
    const targetUserIds = toObjectIdList(input.targetUserIds);
    const createdBy = toObjectId(input.createdBy || null);
    const actorUserId = toObjectId(input.actorUserId || null);
    const payload = {
        title: input.title,
        message: input.message,
        type: input.type || '',
        messagePreview: String(input.messagePreview || '').trim(),
        category: input.category || 'update',
        linkUrl: buildDerivedLinkUrl(input),
        sourceType: String(input.sourceType || '').trim(),
        sourceId: String(input.sourceId || '').trim(),
        targetRoute: String(input.targetRoute || '').trim(),
        targetEntityId: String(input.targetEntityId || '').trim(),
        priority: input.priority || 'normal',
        actorUserId: actorUserId || undefined,
        actorNameSnapshot: String(input.actorNameSnapshot || '').trim(),
        isActive: true,
        targetRole: input.targetRole || defaultRole,
        targetUserIds,
        createdBy: createdBy || undefined,
        updatedBy: createdBy || undefined,
        dedupeKey: String(input.dedupeKey || '').trim() || undefined,
    };

    if (!payload.dedupeKey) {
        return Notification.create(payload);
    }

    try {
        return await Notification.create(payload);
    } catch (error: any) {
        if (error?.code !== 11000) throw error;
        const existing = await Notification.findOne({ dedupeKey: payload.dedupeKey });
        if (existing) return existing;
        throw error;
    }
}

export async function createAdminAlert(input: CreateAlertInput) {
    return createAlertDocument(input, 'admin');
}

export async function createStudentNotification(input: CreateAlertInput) {
    return createAlertDocument(input, 'student');
}

export async function queryAdminAlerts(input: QueryAlertsInput) {
    const userId = toObjectId(input.userId);
    if (!userId) {
        return { items: [], total: 0, unreadCount: 0, page: 1, pages: 1 };
    }

    const page = Math.max(1, Number(input.page || 1));
    const limit = Math.max(1, Math.min(100, Number(input.limit || 20)));
    const skip = (page - 1) * limit;
    const filter = buildActionableFilter(userId, input.role, input.type);

    const allRows = await Notification.find(filter)
        .sort({ publishAt: -1, createdAt: -1 })
        .lean<ActionableAlertRow[]>();
    const allIds = allRows.map((row) => row._id);
    const readRows = allIds.length > 0
        ? await AdminNotificationRead.find({
            adminUserId: userId,
            notificationId: { $in: allIds },
        }).lean<Array<{ notificationId: mongoose.Types.ObjectId }>>()
        : [];
    const readSet = new Set(readRows.map((row) => String(row.notificationId)));
    const normalizedGroup = String(input.group || '').trim().toLowerCase();
    const groupFilteredRows = normalizedGroup && normalizedGroup !== 'all'
        ? allRows.filter((row) => deriveActionableAlertGroup(row) === normalizedGroup)
        : allRows;
    const unreadRows = groupFilteredRows.filter((row) => !readSet.has(String(row._id)));
    const selectedRows = input.unread ? unreadRows : groupFilteredRows;
    const pagedRows = selectedRows.slice(skip, skip + limit);

    const items = pagedRows.map((item) => {
        const fallbackMeta = parseTargetMetaFromLink(String(item.linkUrl || ''));
        return {
            _id: String(item._id),
            title: item.title,
            message: item.message,
            type: item.type || '',
            messagePreview: item.messagePreview || item.message,
            category: item.category,
            linkUrl: item.linkUrl || '',
            sourceType: item.sourceType || '',
            sourceId: item.sourceId || '',
            targetRoute: item.targetRoute || fallbackMeta.targetRoute,
            targetEntityId: item.targetEntityId || fallbackMeta.targetEntityId,
            priority: item.priority || 'normal',
            actorUserId: item.actorUserId ? String(item.actorUserId) : '',
            actorNameSnapshot: item.actorNameSnapshot || '',
            publishAt: item.publishAt || item.createdAt,
            createdAt: item.createdAt,
            isRead: readSet.has(String(item._id)),
            targetRole: item.targetRole,
            group: deriveActionableAlertGroup(item),
        };
    });

    return {
        items,
        total: selectedRows.length,
        unreadCount: unreadRows.length,
        page,
        pages: Math.max(1, Math.ceil(selectedRows.length / limit)),
    };
}

export async function countAdminUnreadAlerts(
    userId: string | mongoose.Types.ObjectId,
    role: AlertAudienceRole,
    type?: string,
) {
    const result = await queryAdminAlerts({
        userId,
        role,
        page: 1,
        limit: 1,
        type,
    });
    return { unreadCount: result.unreadCount };
}

export async function markAdminAlertsRead(
    userIdInput: string | mongoose.Types.ObjectId,
    ids: string[] = [],
    role: AlertAudienceRole = 'admin',
) {
    const userId = toObjectId(userIdInput);
    if (!userId) return { updated: 0 };

    const filter = buildActionableFilter(userId, role);
    if (ids.length > 0) {
        filter._id = {
            $in: ids
                .map((id) => String(id || '').trim())
                .filter((id) => mongoose.Types.ObjectId.isValid(id))
                .map((id) => new mongoose.Types.ObjectId(id)),
        };
    }

    const targetIds = (await Notification.find(filter).select('_id').lean<Array<{ _id: mongoose.Types.ObjectId }>>())
        .map((item) => item._id);

    if (targetIds.length === 0) return { updated: 0 };

    const existingReads = await AdminNotificationRead.find({
        adminUserId: userId,
        notificationId: { $in: targetIds },
    }).select('notificationId').lean<Array<{ notificationId: mongoose.Types.ObjectId }>>();
    const alreadyReadSet = new Set(existingReads.map((item) => String(item.notificationId)));
    const unreadTargetIds = targetIds.filter((notificationId) => !alreadyReadSet.has(String(notificationId)));

    if (unreadTargetIds.length === 0) return { updated: 0 };

    await AdminNotificationRead.bulkWrite(
        unreadTargetIds.map((notificationId) => ({
            updateOne: {
                filter: { adminUserId: userId, notificationId },
                update: { $set: { readAt: new Date() } },
                upsert: true,
            },
        })),
    );

    return { updated: unreadTargetIds.length };
}

export async function markAdminAlertRead(
    userIdInput: string | mongoose.Types.ObjectId,
    id: string,
    role: AlertAudienceRole = 'admin',
) {
    return markAdminAlertsRead(userIdInput, [id], role);
}

export async function markAllAdminAlertsRead(
    userIdInput: string | mongoose.Types.ObjectId,
    role: AlertAudienceRole = 'admin',
) {
    return markAdminAlertsRead(userIdInput, [], role);
}
