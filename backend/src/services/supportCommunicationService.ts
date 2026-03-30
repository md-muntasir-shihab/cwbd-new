import mongoose from 'mongoose';
import Notification from '../models/Notification';
import SupportTicket, {
    type ISupportTicket,
    type SupportTicketPriority,
    type SupportTicketStatus,
    type SupportTicketThreadState,
} from '../models/SupportTicket';
import SupportTicketMessage, {
    type ISupportTicketMessage,
    type SupportTicketMessageSenderType,
} from '../models/SupportTicketMessage';
import User from '../models/User';
import { createAdminAlert, createStudentNotification } from './adminAlertService';
import {
    buildMessagePreview,
    toObjectId,
} from './communicationCoreService';
import {
    type CommunicationProfileSummary,
    buildCommunicationProfileSummary,
} from './communicationProfileService';
import {
    type CanonicalSubscriptionSnapshot,
    canUseSupport as getCanonicalSupportEligibility,
    getCanonicalSubscriptionSnapshot,
} from './subscriptionAccessService';
import { addSystemTimelineEvent } from './studentTimelineService';

type LeanSupportTicket = {
    _id: mongoose.Types.ObjectId;
    ticketNo: string;
    studentId: mongoose.Types.ObjectId;
    subject: string;
    message: string;
    status: SupportTicketStatus;
    priority: SupportTicketPriority;
    assignedTo?: mongoose.Types.ObjectId | null;
    subscriptionSnapshot?: Record<string, unknown>;
    messageCount?: number;
    latestMessagePreview?: string;
    lastMessageAt?: Date | null;
    lastMessageSenderType?: SupportTicketMessageSenderType | null;
    unreadCountForAdmin?: number;
    unreadCountForUser?: number;
    threadState?: SupportTicketThreadState;
    timeline?: Array<{
        actorId: mongoose.Types.ObjectId | null;
        actorRole: string;
        message: string;
        createdAt: Date;
    }>;
    createdAt: Date;
    updatedAt: Date;
};

type LeanSupportMessage = {
    _id: mongoose.Types.ObjectId;
    ticketId: mongoose.Types.ObjectId;
    senderType: SupportTicketMessageSenderType;
    senderId?: mongoose.Types.ObjectId | null;
    message: string;
    attachments?: Array<Record<string, unknown>>;
    readByAdminAt?: Date | null;
    readByUserAt?: Date | null;
    sequence: number;
    createdAt: Date;
    updatedAt: Date;
};

export type SupportTicketApiItem = Omit<LeanSupportTicket, 'message' | 'timeline' | 'studentId' | 'assignedTo'> & {
    messageCount: number;
    latestMessagePreview: string;
    lastMessageAt: Date | null;
    lastMessageSenderType: SupportTicketMessageSenderType | null;
    unreadCountForAdmin: number;
    unreadCountForUser: number;
    threadState: SupportTicketThreadState;
    timeline: Array<{
        actorId: mongoose.Types.ObjectId | null;
        actorRole: string;
        message: string;
        createdAt: Date;
    }>;
    messages: LeanSupportMessage[];
    message: string;
    studentId: mongoose.Types.ObjectId | Record<string, unknown>;
    assignedTo?: mongoose.Types.ObjectId | Record<string, unknown> | null;
    senderProfileSummary: CommunicationProfileSummary | null;
};

function normalizePriority(raw: unknown): SupportTicketPriority {
    const value = String(raw || '').trim().toLowerCase();
    if (value === 'low' || value === 'medium' || value === 'high' || value === 'urgent') {
        return value;
    }
    return 'medium';
}

function normalizeStatus(raw: unknown): SupportTicketStatus {
    const value = String(raw || '').trim().toLowerCase();
    if (value === 'open' || value === 'in_progress' || value === 'resolved' || value === 'closed') {
        return value;
    }
    return 'open';
}

function toRoleLabel(senderType: SupportTicketMessageSenderType, senderRole?: string): string {
    if (senderType === 'student') return 'student';
    if (senderType === 'system') return 'system';
    return String(senderRole || 'admin').trim() || 'admin';
}

async function generateTicketNo(): Promise<string> {
    const date = new Date();
    const ymd = `${date.getUTCFullYear()}${`${date.getUTCMonth() + 1}`.padStart(2, '0')}${`${date.getUTCDate()}`.padStart(2, '0')}`;
    const startOfDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0));
    const count = await SupportTicket.countDocuments({
        createdAt: { $gte: startOfDay },
    });
    return `TKT-${ymd}-${String(count + 1).padStart(4, '0')}`;
}

function buildSubscriptionSnapshotPayload(snapshot: CanonicalSubscriptionSnapshot): Record<string, unknown> {
    return {
        source: snapshot.source,
        planCode: snapshot.planCode,
        planSlug: snapshot.planSlug,
        planName: snapshot.planName,
        supportLevel: String((snapshot.plan?.supportLevel as string) || '').trim(),
        isActive: snapshot.isActive,
        expiresAtUTC: snapshot.expiresAtUTC?.toISOString() || null,
        reason: snapshot.reason || '',
    };
}

async function getStudentUser(userId: string) {
    return User.findById(userId)
        .select('full_name username email phone_number profile_photo role status subscription')
        .lean<{
            _id: mongoose.Types.ObjectId;
            full_name?: string;
            username?: string;
            email?: string;
            phone_number?: string;
            profile_photo?: string;
            role?: string;
            status?: string;
            subscription?: Record<string, unknown>;
        } | null>();
}

async function getSupportTicketDocument(ticketId: string): Promise<ISupportTicket> {
    const ticket = await SupportTicket.findById(ticketId);
    if (!ticket) {
        throw new Error('SUPPORT_TICKET_NOT_FOUND');
    }
    return ticket;
}

function deriveThreadState(input: {
    status: SupportTicketStatus;
    messages: LeanSupportMessage[];
    unreadCountForAdmin: number;
    unreadCountForUser: number;
}): SupportTicketThreadState {
    const lastMessage = input.messages[input.messages.length - 1];
    if (input.status === 'closed') {
        return 'closed';
    }
    if (lastMessage?.senderType === 'student' && input.unreadCountForAdmin > 0) {
        return 'pending';
    }
    if (lastMessage?.senderType === 'admin' && input.unreadCountForUser > 0) {
        return 'replied';
    }
    if (input.status === 'resolved') {
        return 'resolved';
    }
    return 'idle';
}

async function ensureCanonicalMessagesForTicket(ticket: LeanSupportTicket | ISupportTicket): Promise<LeanSupportMessage[]> {
    const ticketId = String(ticket._id);
    const existing = await SupportTicketMessage.find({ ticketId })
        .sort({ sequence: 1, createdAt: 1 })
        .lean<LeanSupportMessage[]>();

    if (existing.length > 0) {
        return existing;
    }

    const legacyTimeline = Array.isArray(ticket.timeline) && ticket.timeline.length > 0
        ? ticket.timeline
        : [{
            actorId: ticket.studentId,
            actorRole: 'student',
            message: ticket.message,
            createdAt: ticket.createdAt,
        }];

    const backfillRows = legacyTimeline
        .filter((item) => String(item.message || '').trim())
        .map((item, index) => ({
            ticketId: ticket._id,
            senderType: item.actorRole === 'student'
                ? 'student'
                : item.actorRole === 'system'
                    ? 'system'
                    : 'admin',
            senderId: item.actorId || null,
            message: String(item.message || '').trim(),
            attachments: [],
            readByAdminAt: item.createdAt || ticket.createdAt,
            readByUserAt: item.createdAt || ticket.createdAt,
            sequence: index + 1,
            createdAt: item.createdAt || ticket.createdAt,
            updatedAt: item.createdAt || ticket.createdAt,
        }));

    if (backfillRows.length > 0) {
        await SupportTicketMessage.insertMany(backfillRows, { ordered: false }).catch(() => undefined);
    }

    return SupportTicketMessage.find({ ticketId })
        .sort({ sequence: 1, createdAt: 1 })
        .lean<LeanSupportMessage[]>();
}

async function appendMessageWithRetry(input: {
    ticketId: mongoose.Types.ObjectId;
    senderType: SupportTicketMessageSenderType;
    senderId?: mongoose.Types.ObjectId | null;
    message: string;
    readByAdminAt?: Date | null;
    readByUserAt?: Date | null;
}): Promise<ISupportTicketMessage> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
        const lastMessage = await SupportTicketMessage.findOne({ ticketId: input.ticketId })
            .sort({ sequence: -1 })
            .select('sequence')
            .lean<{ sequence?: number } | null>();

        const sequence = Number(lastMessage?.sequence || 0) + 1;
        try {
            return await SupportTicketMessage.create({
                ticketId: input.ticketId,
                senderType: input.senderType,
                senderId: input.senderId || null,
                message: input.message,
                attachments: [],
                readByAdminAt: input.readByAdminAt ?? null,
                readByUserAt: input.readByUserAt ?? null,
                sequence,
            });
        } catch (error: any) {
            if (error?.code === 11000) {
                continue;
            }
            throw error;
        }
    }

    throw new Error('SUPPORT_MESSAGE_SEQUENCE_CONFLICT');
}

async function recalculateSupportTicketState(
    ticketIdInput: string | mongoose.Types.ObjectId,
): Promise<LeanSupportTicket> {
    const ticketId = toObjectId(ticketIdInput);
    if (!ticketId) {
        throw new Error('SUPPORT_TICKET_NOT_FOUND');
    }

    const ticket = await SupportTicket.findById(ticketId);
    if (!ticket) {
        throw new Error('SUPPORT_TICKET_NOT_FOUND');
    }

    const messages = await ensureCanonicalMessagesForTicket(ticket);
    const firstMessage = messages[0];
    const lastMessage = messages[messages.length - 1];
    const unreadCountForAdmin = messages.filter(
        (message) => (message.senderType === 'student' || message.senderType === 'system') && !message.readByAdminAt,
    ).length;
    const unreadCountForUser = messages.filter(
        (message) => (message.senderType === 'admin' || message.senderType === 'system') && !message.readByUserAt,
    ).length;

    ticket.messageCount = messages.length;
    ticket.message = firstMessage?.message || ticket.message;
    ticket.latestMessagePreview = lastMessage?.message ? buildMessagePreview(lastMessage.message) : '';
    ticket.lastMessageAt = lastMessage?.createdAt || ticket.createdAt;
    ticket.lastMessageSenderType = lastMessage?.senderType || null;
    ticket.unreadCountForAdmin = unreadCountForAdmin;
    ticket.unreadCountForUser = unreadCountForUser;
    ticket.threadState = deriveThreadState({
        status: ticket.status,
        messages,
        unreadCountForAdmin,
        unreadCountForUser,
    });
    await ticket.save();

    return ticket.toObject() as LeanSupportTicket;
}

async function buildSupportTicketPayload(
    ticket: LeanSupportTicket,
    options: { studentProfileSummary?: CommunicationProfileSummary | null } = {},
): Promise<SupportTicketApiItem> {
    const messages = await ensureCanonicalMessagesForTicket(ticket);
    const studentId = String(ticket.studentId || '').trim();
    const assignedToId = String(ticket.assignedTo || '').trim();
    const [studentUser, assignedUser, senderProfileSummary] = await Promise.all([
        studentId && mongoose.Types.ObjectId.isValid(studentId)
            ? User.findById(studentId)
                .select('full_name username email phone_number role status')
                .lean<({ _id: mongoose.Types.ObjectId } & Record<string, unknown>) | null>()
            : Promise.resolve(null),
        assignedToId && mongoose.Types.ObjectId.isValid(assignedToId)
            ? User.findById(assignedToId)
                .select('full_name username email phone_number role status')
                .lean<({ _id: mongoose.Types.ObjectId } & Record<string, unknown>) | null>()
            : Promise.resolve(null),
        options.studentProfileSummary !== undefined
            ? Promise.resolve(options.studentProfileSummary)
            : buildCommunicationProfileSummary(studentId),
    ]);

    const unreadCountForAdmin = typeof ticket.unreadCountForAdmin === 'number'
        ? ticket.unreadCountForAdmin
        : messages.filter((message) => (message.senderType === 'student' || message.senderType === 'system') && !message.readByAdminAt).length;
    const unreadCountForUser = typeof ticket.unreadCountForUser === 'number'
        ? ticket.unreadCountForUser
        : messages.filter((message) => (message.senderType === 'admin' || message.senderType === 'system') && !message.readByUserAt).length;
    const threadState = ticket.threadState || deriveThreadState({
        status: ticket.status,
        messages,
        unreadCountForAdmin,
        unreadCountForUser,
    });

    return {
        ...ticket,
        messageCount: typeof ticket.messageCount === 'number' ? ticket.messageCount : messages.length,
        latestMessagePreview: ticket.latestMessagePreview || buildMessagePreview(messages[messages.length - 1]?.message || ''),
        lastMessageAt: ticket.lastMessageAt || messages[messages.length - 1]?.createdAt || null,
        lastMessageSenderType: ticket.lastMessageSenderType || messages[messages.length - 1]?.senderType || null,
        unreadCountForAdmin,
        unreadCountForUser,
        threadState,
        message: messages[0]?.message || ticket.message,
        timeline: messages.map((message) => ({
            actorId: message.senderId || null,
            actorRole: message.senderType === 'student' ? 'student' : message.senderType === 'system' ? 'system' : 'admin',
            message: message.message,
            createdAt: message.createdAt,
        })),
        messages,
        studentId: studentUser ? { ...studentUser, _id: studentUser._id } : ticket.studentId,
        assignedTo: assignedUser ? { ...assignedUser, _id: assignedUser._id } : (ticket.assignedTo || null),
        senderProfileSummary: senderProfileSummary || null,
    };
}

async function notifyAdminsForTicket(ticket: LeanSupportTicket, type: 'support_ticket_new' | 'support_reply_new', sourceId: string): Promise<void> {
    await createAdminAlert({
        title: type === 'support_ticket_new' ? 'New support ticket' : 'New student reply',
        message: `${ticket.ticketNo}: ${ticket.subject}`,
        type,
        messagePreview: ticket.latestMessagePreview || buildMessagePreview(ticket.message),
        linkUrl: `/__cw_admin__/support-center?ticketId=${String(ticket._id)}`,
        category: 'update',
        targetRole: 'admin',
        sourceType: 'support_ticket',
        sourceId,
        targetRoute: '/__cw_admin__/support-center',
        targetEntityId: String(ticket._id),
        priority: type === 'support_ticket_new' ? 'high' : 'normal',
        dedupeKey: `${type}:${sourceId}`,
    });
}

async function notifyStudentForAdminReply(ticket: LeanSupportTicket): Promise<void> {
    await createStudentNotification({
        title: 'Support reply received',
        message: `${ticket.ticketNo} - ${ticket.subject}`,
        messagePreview: `Admin replied: ${ticket.latestMessagePreview || buildMessagePreview(ticket.message)}`,
        linkUrl: `/support/${String(ticket._id)}`,
        category: 'update',
        targetRole: 'student',
        targetUserIds: [ticket.studentId],
        sourceType: 'support_ticket',
        sourceId: String(ticket._id),
        targetRoute: '/support',
        targetEntityId: String(ticket._id),
        priority: 'normal',
    });
}

async function assertSupportEligibility(userId: string): Promise<CanonicalSubscriptionSnapshot> {
    const eligibility = await getCanonicalSupportEligibility(userId);
    if (!eligibility.allowed) {
        if (eligibility.reason === 'expired_subscription') {
            throw new Error('SUPPORT_EXPIRED_SUBSCRIPTION');
        }
        if (
            eligibility.reason === 'no_active_subscription'
            || eligibility.reason === 'support_not_included_in_plan'
        ) {
            throw new Error('SUPPORT_NO_ACTIVE_SUBSCRIPTION');
        }
        throw new Error('SUPPORT_NOT_ALLOWED');
    }

    const user = await getStudentUser(userId);
    if (!user || user.role !== 'student') {
        throw new Error('SUPPORT_NOT_ALLOWED');
    }

    const snapshot = await getCanonicalSubscriptionSnapshot(userId, user.subscription);
    if (!snapshot.hasPlanIdentity || !snapshot.isActive) {
        throw new Error(snapshot.reason === 'expired' ? 'SUPPORT_EXPIRED_SUBSCRIPTION' : 'SUPPORT_NO_ACTIVE_SUBSCRIPTION');
    }
    return snapshot;
}

export async function createStudentSupportTicket(input: {
    userId: string;
    subject: string;
    message: string;
    priority?: SupportTicketPriority | string;
}): Promise<SupportTicketApiItem> {
    const studentId = toObjectId(input.userId);
    if (!studentId) {
        throw new Error('SUPPORT_NOT_ALLOWED');
    }

    const subscriptionSnapshot = await assertSupportEligibility(input.userId);
    const ticketNo = await generateTicketNo();
    const ticket = await SupportTicket.create({
        ticketNo,
        studentId,
        subject: String(input.subject || '').trim(),
        message: String(input.message || '').trim(),
        status: 'open',
        priority: normalizePriority(input.priority),
        assignedTo: null,
        subscriptionSnapshot: buildSubscriptionSnapshotPayload(subscriptionSnapshot),
        messageCount: 0,
        latestMessagePreview: '',
        lastMessageAt: null,
        lastMessageSenderType: null,
        unreadCountForAdmin: 0,
        unreadCountForUser: 0,
        threadState: 'pending',
        timeline: [],
    });

    await appendMessageWithRetry({
        ticketId: ticket._id,
        senderType: 'student',
        senderId: studentId,
        message: String(input.message || '').trim(),
        readByAdminAt: null,
        readByUserAt: new Date(),
    });

    const hydrated = await recalculateSupportTicketState(ticket._id);
    await notifyAdminsForTicket(hydrated, 'support_ticket_new', String(hydrated._id));
    await addSystemTimelineEvent(
        studentId,
        'support_ticket_link',
        `Created support ticket ${hydrated.ticketNo}: ${hydrated.subject}`,
        {
            ticketId: String(hydrated._id),
            status: hydrated.status,
        },
        hydrated._id
    );

    return buildSupportTicketPayload(hydrated);
}

export async function listStudentSupportTickets(userId: string): Promise<SupportTicketApiItem[]> {
    await assertSupportEligibility(userId);
    const studentId = toObjectId(userId);
    if (!studentId) {
        throw new Error('SUPPORT_NOT_ALLOWED');
    }

    const rows = await SupportTicket.find({ studentId })
        .sort({ lastMessageAt: -1, updatedAt: -1, createdAt: -1 })
        .lean<LeanSupportTicket[]>();

    const hydratedRows = await Promise.all(rows.map((row) => recalculateSupportTicketState(row._id)));
    return Promise.all(hydratedRows.map((row) => buildSupportTicketPayload(row)));
}

export async function getStudentSupportTicketDetail(
    userId: string,
    ticketId: string,
    options: { markRead?: boolean } = {},
): Promise<SupportTicketApiItem> {
    await assertSupportEligibility(userId);
    const studentId = toObjectId(userId);
    const ticketObjectId = toObjectId(ticketId);
    if (!studentId || !ticketObjectId) {
        throw new Error('SUPPORT_TICKET_NOT_FOUND');
    }

    const ticket = await SupportTicket.findOne({ _id: ticketObjectId, studentId });
    if (!ticket) {
        throw new Error('SUPPORT_TICKET_NOT_FOUND');
    }

    await ensureCanonicalMessagesForTicket(ticket);
    if (options.markRead) {
        await SupportTicketMessage.updateMany(
            {
                ticketId: ticket._id,
                senderType: { $in: ['admin', 'system'] },
                readByUserAt: null,
            },
            { $set: { readByUserAt: new Date() } },
        );
    }

    const hydrated = await recalculateSupportTicketState(ticket._id);
    return buildSupportTicketPayload(hydrated);
}

export async function replyStudentSupportTicket(input: {
    userId: string;
    ticketId: string;
    message: string;
}): Promise<SupportTicketApiItem> {
    await assertSupportEligibility(input.userId);
    const studentId = toObjectId(input.userId);
    const ticket = await SupportTicket.findOne({ _id: input.ticketId, studentId });
    if (!ticket || !studentId) {
        throw new Error('SUPPORT_TICKET_NOT_FOUND');
    }
    if (ticket.status === 'closed') {
        throw new Error('SUPPORT_TICKET_CLOSED');
    }

    await ensureCanonicalMessagesForTicket(ticket);
    await appendMessageWithRetry({
        ticketId: ticket._id,
        senderType: 'student',
        senderId: studentId,
        message: String(input.message || '').trim(),
        readByAdminAt: null,
        readByUserAt: new Date(),
    });

    if (ticket.status === 'resolved') {
        ticket.status = 'in_progress';
        await ticket.save();
    }

    const hydrated = await recalculateSupportTicketState(ticket._id);
    const latestMessage = await SupportTicketMessage.findOne({ ticketId: ticket._id })
        .sort({ sequence: -1 })
        .select('_id')
        .lean<{ _id: mongoose.Types.ObjectId } | null>();

    await notifyAdminsForTicket(hydrated, 'support_reply_new', String(latestMessage?._id || ticket._id));
    await addSystemTimelineEvent(
        studentId,
        'message',
        `Replied to support ticket ${hydrated.ticketNo}`,
        {
            ticketId: String(hydrated._id),
        },
        hydrated._id
    );

    return buildSupportTicketPayload(hydrated);
}

export async function listAdminSupportTickets(input: {
    page?: number;
    limit?: number;
    status?: string;
    threadState?: string;
    unread?: string | boolean;
    assigned?: string;
    planCode?: string;
    priority?: string;
    search?: string;
}): Promise<{
    items: SupportTicketApiItem[];
    total: number;
    page: number;
    pages: number;
}> {
    const page = Math.max(1, Number(input.page || 1));
    const limit = Math.max(1, Math.min(100, Number(input.limit || 20)));
    const skip = (page - 1) * limit;
    const filter: Record<string, unknown> = {};

    if (input.status) {
        filter.status = normalizeStatus(input.status);
    }
    if (input.threadState) {
        filter.threadState = String(input.threadState || '').trim();
    }
    if (String(input.unread || '') === 'true') {
        filter.unreadCountForAdmin = { $gt: 0 };
    }
    if (input.assigned === 'assigned') {
        filter.assignedTo = { $ne: null };
    } else if (input.assigned === 'unassigned') {
        filter.assignedTo = null;
    }
    if (input.planCode) {
        filter['subscriptionSnapshot.planCode'] = String(input.planCode || '').trim().toLowerCase();
    }
    if (input.priority) {
        filter.priority = normalizePriority(input.priority);
    }

    const search = String(input.search || '').trim();
    if (search) {
        const regex = new RegExp(search, 'i');
        filter.$or = [
            { ticketNo: regex },
            { subject: regex },
            { message: regex },
            { latestMessagePreview: regex },
        ];
    }

    const [rows, total] = await Promise.all([
        SupportTicket.find(filter)
            .sort({ unreadCountForAdmin: -1, lastMessageAt: -1, updatedAt: -1, createdAt: -1 })
            .skip(skip)
            .limit(limit)
            .lean<LeanSupportTicket[]>(),
        SupportTicket.countDocuments(filter),
    ]);

    const hydratedRows = await Promise.all(rows.map((row) => recalculateSupportTicketState(row._id)));
    const items = await Promise.all(hydratedRows.map((row) => buildSupportTicketPayload(row)));

    return {
        items,
        total,
        page,
        pages: Math.max(1, Math.ceil(total / limit)),
    };
}

export async function getAdminSupportTicketDetail(
    ticketId: string,
    options: { markRead?: boolean } = {},
): Promise<SupportTicketApiItem> {
    const ticket = await getSupportTicketDocument(ticketId);
    await ensureCanonicalMessagesForTicket(ticket);

    if (options.markRead) {
        await SupportTicketMessage.updateMany(
            {
                ticketId: ticket._id,
                senderType: { $in: ['student', 'system'] },
                readByAdminAt: null,
            },
            { $set: { readByAdminAt: new Date() } },
        );
    }

    const hydrated = await recalculateSupportTicketState(ticket._id);
    return buildSupportTicketPayload(hydrated);
}

export async function markAdminSupportTicketRead(ticketId: string): Promise<SupportTicketApiItem> {
    return getAdminSupportTicketDetail(ticketId, { markRead: true });
}

export async function updateAdminSupportTicketStatus(input: {
    ticketId: string;
    status?: string;
    assignedTo?: string | null;
}): Promise<SupportTicketApiItem> {
    const ticket = await getSupportTicketDocument(input.ticketId);
    if (input.status !== undefined) {
        ticket.status = normalizeStatus(input.status);
    }

    if (input.assignedTo !== undefined) {
        const assignedToId = String(input.assignedTo || '').trim();
        if (!assignedToId) {
            ticket.assignedTo = null;
        } else {
            const assignedToObjectId = toObjectId(assignedToId);
            if (!assignedToObjectId) {
                throw new Error('SUPPORT_INVALID_ADMIN');
            }

            const assignedUser = await User.findById(assignedToObjectId)
                .select('role status')
                .lean<{ role?: string; status?: string } | null>();
            const allowedSupportRoles = ['superadmin', 'admin', 'moderator', 'support_agent'];
            const assignedRole = String(assignedUser?.role || '').trim().toLowerCase();
            const assignedStatus = String(assignedUser?.status || 'active').trim().toLowerCase();

            if (
                !assignedUser ||
                !allowedSupportRoles.includes(assignedRole) ||
                ['inactive', 'suspended', 'blocked'].includes(assignedStatus)
            ) {
                throw new Error('SUPPORT_INVALID_ADMIN');
            }

            ticket.assignedTo = assignedToObjectId;
        }
    }

    await ticket.save();
    const hydrated = await recalculateSupportTicketState(ticket._id);
    return buildSupportTicketPayload(hydrated);
}

export async function replyAdminSupportTicket(input: {
    ticketId: string;
    adminUserId: string;
    adminRole: string;
    message: string;
}): Promise<SupportTicketApiItem> {
    const ticket = await getSupportTicketDocument(input.ticketId);
    const adminUserId = toObjectId(input.adminUserId);
    if (!adminUserId) {
        throw new Error('SUPPORT_INVALID_ADMIN');
    }
    if (ticket.status === 'closed') {
        throw new Error('SUPPORT_TICKET_CLOSED');
    }

    await ensureCanonicalMessagesForTicket(ticket);
    await appendMessageWithRetry({
        ticketId: ticket._id,
        senderType: 'admin',
        senderId: adminUserId,
        message: String(input.message || '').trim(),
        readByAdminAt: new Date(),
        readByUserAt: null,
    });

    ticket.status = 'in_progress';
    await ticket.save();

    const hydrated = await recalculateSupportTicketState(ticket._id);
    await notifyStudentForAdminReply(hydrated);
    await addSystemTimelineEvent(
        hydrated.studentId as mongoose.Types.ObjectId,
        'message',
        `CampusWay support replied to ticket ${hydrated.ticketNo}`,
        {
            ticketId: String(hydrated._id),
            actorRole: input.adminRole,
        },
        hydrated._id
    );

    return buildSupportTicketPayload(hydrated);
}

export async function getAdminSupportUnreadCount(): Promise<number> {
    return SupportTicket.countDocuments({ unreadCountForAdmin: { $gt: 0 } });
}

export async function backfillSupportTicketMessages(ticketId: string): Promise<void> {
    const ticket = await getSupportTicketDocument(ticketId);
    await ensureCanonicalMessagesForTicket(ticket);
    await recalculateSupportTicketState(ticket._id);
}

export async function parseActionableAlertTarget(notificationId: string): Promise<{
    targetRoute: string;
    targetEntityId: string;
}> {
    const notification = await Notification.findById(notificationId)
        .select('targetRoute targetEntityId linkUrl')
        .lean<{ targetRoute?: string; targetEntityId?: string; linkUrl?: string } | null>();

    const targetRoute = String(notification?.targetRoute || '').trim();
    const targetEntityId = String(notification?.targetEntityId || '').trim();
    if (targetRoute || targetEntityId) {
        return {
            targetRoute,
            targetEntityId,
        };
    }

    const rawLink = String(notification?.linkUrl || '').trim();
    if (!rawLink) {
        return { targetRoute: '', targetEntityId: '' };
    }

    const [pathname, queryString = ''] = rawLink.split('?');
    const params = new URLSearchParams(queryString);
    return {
        targetRoute: pathname,
        targetEntityId: params.get('ticketId') || params.get('focus') || '',
    };
}
