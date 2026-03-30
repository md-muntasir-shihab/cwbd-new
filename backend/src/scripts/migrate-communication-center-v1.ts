import dotenv from 'dotenv';
import mongoose from 'mongoose';
import ContactMessage from '../models/ContactMessage';
import Notification from '../models/Notification';
import SupportTicket from '../models/SupportTicket';
import SupportTicketMessage from '../models/SupportTicketMessage';
import { backfillSupportTicketMessages } from '../services/supportCommunicationService';
import { normalizeEmail, normalizePhone } from '../services/communicationCoreService';

dotenv.config();

function deriveLegacyContactStatus(row: Record<string, unknown>): 'new' | 'opened' | 'replied' | 'resolved' | 'archived' {
    if (typeof row.status === 'string' && row.status.trim()) {
        return row.status as 'new' | 'opened' | 'replied' | 'resolved' | 'archived';
    }
    if (row.isReplied === true) {
        return 'replied';
    }
    if (row.isRead === true) {
        return 'opened';
    }
    return 'new';
}

async function createIndexWithWarning(
    label: string,
    operation: Promise<unknown>,
): Promise<string | null> {
    try {
        await operation;
        return null;
    } catch (error: any) {
        const rawMessage = String(error?.message || error || 'Unknown index creation error');
        const normalizedMessage = rawMessage.toLowerCase();
        if (
            normalizedMessage.includes('already exists with a different name')
            || normalizedMessage.includes('equivalent index already exists')
        ) {
            return null;
        }
        const message = `[${label}] ${rawMessage}`;
        console.warn('[migrate-communication-center-v1] index warning', message);
        return message;
    }
}

async function ensureIndexes(): Promise<string[]> {
    const results = await Promise.all([
        createIndexWithWarning('contact_unread_createdAt', ContactMessage.collection.createIndex({ unreadByAdmin: 1, createdAt: -1 }, { name: 'contact_unread_createdAt' })),
        createIndexWithWarning('contact_status_createdAt', ContactMessage.collection.createIndex({ status: 1, createdAt: -1 }, { name: 'contact_status_createdAt' })),
        createIndexWithWarning('contact_linkedUser_createdAt', ContactMessage.collection.createIndex({ linkedUserId: 1, createdAt: -1 }, { name: 'contact_linkedUser_createdAt' })),
        createIndexWithWarning('contact_linkedStudent_createdAt', ContactMessage.collection.createIndex({ linkedStudentId: 1, createdAt: -1 }, { name: 'contact_linkedStudent_createdAt' })),
        createIndexWithWarning('support_student_lastMessageAt', SupportTicket.collection.createIndex({ studentId: 1, lastMessageAt: -1 }, { name: 'support_student_lastMessageAt' })),
        createIndexWithWarning('support_status_lastMessageAt', SupportTicket.collection.createIndex({ status: 1, lastMessageAt: -1 }, { name: 'support_status_lastMessageAt' })),
        createIndexWithWarning('support_unreadAdmin_lastMessageAt', SupportTicket.collection.createIndex({ unreadCountForAdmin: 1, lastMessageAt: -1 }, { name: 'support_unreadAdmin_lastMessageAt' })),
        createIndexWithWarning('support_unreadUser_lastMessageAt', SupportTicket.collection.createIndex({ unreadCountForUser: 1, lastMessageAt: -1 }, { name: 'support_unreadUser_lastMessageAt' })),
        createIndexWithWarning('support_message_ticket_sequence', SupportTicketMessage.collection.createIndex({ ticketId: 1, sequence: 1 }, { name: 'support_message_ticket_sequence', unique: true })),
        createIndexWithWarning('notification_targetRole_createdAt', Notification.collection.createIndex({ targetRole: 1, createdAt: -1 }, { name: 'notification_targetRole_createdAt' })),
        createIndexWithWarning('notification_sourceId_createdAt', Notification.collection.createIndex({ sourceId: 1, createdAt: -1 }, { name: 'notification_sourceId_createdAt' })),
        createIndexWithWarning('notification_targetEntityId_createdAt', Notification.collection.createIndex({ targetEntityId: 1, createdAt: -1 }, { name: 'notification_targetEntityId_createdAt' })),
        createIndexWithWarning('notification_dedupeKey', Notification.collection.createIndex({ dedupeKey: 1 }, { name: 'notification_dedupeKey', unique: true, sparse: true })),
    ]);

    return results.filter((item): item is string => Boolean(item));
}

async function backfillContactMessages(): Promise<number> {
    const rows = await ContactMessage.find({})
        .select('_id email phone status unreadByAdmin adminOpenedAt sourceType linkedUserId linkedStudentId matchedBy normalizedEmail normalizedPhone metadata isRead isReplied createdAt updatedAt')
        .lean<Record<string, unknown>[]>();

    if (rows.length === 0) {
        return 0;
    }

    const ops = rows.map((row) => {
        const status = deriveLegacyContactStatus(row);
        const unreadByAdmin = typeof row.unreadByAdmin === 'boolean'
            ? row.unreadByAdmin
            : status === 'resolved' || status === 'archived'
                ? false
                : row.isRead !== true;
        const adminOpenedAt = row.adminOpenedAt instanceof Date
            ? row.adminOpenedAt
            : (!unreadByAdmin
                ? ((row.updatedAt instanceof Date ? row.updatedAt : row.createdAt instanceof Date ? row.createdAt : new Date()))
                : null);
        return {
            updateOne: {
                filter: { _id: row._id },
                update: {
                    $set: {
                        status,
                        unreadByAdmin,
                        adminOpenedAt,
                        sourceType: typeof row.sourceType === 'string' ? row.sourceType : 'public',
                        matchedBy: typeof row.matchedBy === 'string' ? row.matchedBy : 'none',
                        normalizedEmail: normalizeEmail(row.normalizedEmail || row.email || ''),
                        normalizedPhone: normalizePhone(row.normalizedPhone || row.phone || ''),
                        metadata: row.metadata && typeof row.metadata === 'object' ? row.metadata : {},
                    },
                },
            },
        };
    });

    if (ops.length > 0) {
        await ContactMessage.bulkWrite(ops as any);
    }
    return ops.length;
}

async function backfillSupportTickets(): Promise<number> {
    const tickets = await SupportTicket.find({})
        .select('_id')
        .lean<Array<{ _id: mongoose.Types.ObjectId }>>();

    for (const ticket of tickets) {
        await backfillSupportTicketMessages(String(ticket._id));
    }

    return tickets.length;
}

export async function runCommunicationCenterMigration(): Promise<{
    contactMessagesUpdated: number;
    supportTicketsBackfilled: number;
    indexWarnings: string[];
}> {
    const indexWarnings = await ensureIndexes();
    const [contactMessagesUpdated, supportTicketsBackfilled] = await Promise.all([
        backfillContactMessages(),
        backfillSupportTickets(),
    ]);

    return {
        contactMessagesUpdated,
        supportTicketsBackfilled,
        indexWarnings,
    };
}

async function run(): Promise<void> {
    const mongoUri = String(process.env.MONGODB_URI || process.env.MONGO_URI || '').trim();
    if (!mongoUri) {
        throw new Error('MONGODB_URI (or MONGO_URI) is required');
    }

    await mongoose.connect(mongoUri);
    console.log('[migrate-communication-center-v1] connected');
    const result = await runCommunicationCenterMigration();
    console.log('[migrate-communication-center-v1] completed', result);
    await mongoose.disconnect();
}

if (require.main === module) {
    run().catch(async (error) => {
        console.error('[migrate-communication-center-v1] failed', error);
        try {
            await mongoose.disconnect();
        } catch {
            // ignore disconnect failures
        }
        process.exit(1);
    });
}
