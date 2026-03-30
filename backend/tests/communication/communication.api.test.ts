import crypto from 'crypto';
import express from 'express';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import request from 'supertest';

import ActiveSession from '../../src/models/ActiveSession';
import AdminNotificationRead from '../../src/models/AdminNotificationRead';
import AuditLog from '../../src/models/AuditLog';
import ContactMessage from '../../src/models/ContactMessage';
import Notification from '../../src/models/Notification';
import StudentContactTimeline from '../../src/models/StudentContactTimeline';
import StudentNotificationRead from '../../src/models/StudentNotificationRead';
import StudentProfile from '../../src/models/StudentProfile';
import SubscriptionPlan from '../../src/models/SubscriptionPlan';
import SupportTicket from '../../src/models/SupportTicket';
import SupportTicketMessage from '../../src/models/SupportTicketMessage';
import User from '../../src/models/User';
import UserSubscription from '../../src/models/UserSubscription';
import {
    adminArchiveContactMessage,
    adminGetContactMessageById,
    adminGetContactMessages,
    adminMarkContactMessageRead,
    adminResolveContactMessage,
    submitPublicContactMessage,
} from '../../src/controllers/contactController';
import {
    adminGetActionableAlerts,
    adminGetActionableAlertsUnreadCount,
    adminMarkAllActionableAlertsRead,
    adminMarkActionableAlertsRead,
    adminMarkSingleActionableAlertRead,
} from '../../src/controllers/adminAlertController';
import {
    adminGetSupportTicketById,
    adminGetSupportTickets,
    adminMarkSupportTicketRead,
    adminReplySupportTicket,
    adminUpdateSupportTicketStatus,
    studentCreateSupportTicket,
    studentGetSupportEligibility,
    studentGetSupportTicketById,
    studentGetSupportTickets,
    studentReplySupportTicket,
} from '../../src/controllers/supportController';
import {
    getStudentMeNotifications,
    markStudentNotificationsRead,
} from '../../src/controllers/studentHubController';
import { authenticate, authorize, authorizePermission, optionalAuthenticate } from '../../src/middlewares/auth';
import { runCommunicationCenterMigration } from '../../src/scripts/migrate-communication-center-v1';

type UserRole = 'superadmin' | 'admin' | 'student';

type SeededUser = {
    _id: mongoose.Types.ObjectId;
    full_name: string;
    username: string;
    email: string;
    role: UserRole;
    phone_number?: string;
};

function buildApp() {
    const app = express();
    const canManageTickets = authorizePermission('canManageTickets');

    app.use(express.json());

    app.post('/api/contact', optionalAuthenticate, submitPublicContactMessage);

    app.get('/api/support/eligibility', authenticate, studentGetSupportEligibility);
    app.get('/api/support/my-tickets', authenticate, studentGetSupportTickets);
    app.post('/api/support/tickets', authenticate, studentCreateSupportTicket);
    app.get('/api/support/tickets/:id', authenticate, studentGetSupportTicketById);
    app.post('/api/support/tickets/:id/reply', authenticate, studentReplySupportTicket);

    app.get('/api/student/support-tickets', authenticate, studentGetSupportTickets);
    app.get('/api/student/support-tickets/:id', authenticate, studentGetSupportTicketById);
    app.post('/api/student/support-tickets', authenticate, studentCreateSupportTicket);
    app.post('/api/student/support-tickets/:id/reply', authenticate, studentReplySupportTicket);
    app.get('/api/students/me/notifications', authenticate, getStudentMeNotifications);
    app.post('/api/students/me/notifications/mark-read', authenticate, markStudentNotificationsRead);

    app.get('/api/admin/contact-messages', authenticate, authorize('superadmin', 'admin', 'moderator'), adminGetContactMessages);
    app.get('/api/admin/contact-messages/:id', authenticate, authorize('superadmin', 'admin', 'moderator'), adminGetContactMessageById);
    app.post('/api/admin/contact-messages/:id/mark-read', authenticate, authorize('superadmin', 'admin', 'moderator'), adminMarkContactMessageRead);
    app.post('/api/admin/contact-messages/:id/resolve', authenticate, authorize('superadmin', 'admin', 'moderator'), adminResolveContactMessage);
    app.post('/api/admin/contact-messages/:id/archive', authenticate, authorize('superadmin', 'admin', 'moderator'), adminArchiveContactMessage);

    app.get('/api/admin/support-tickets', authenticate, authorize('superadmin', 'admin', 'moderator'), canManageTickets, adminGetSupportTickets);
    app.get('/api/admin/support-tickets/:id', authenticate, authorize('superadmin', 'admin', 'moderator'), canManageTickets, adminGetSupportTicketById);
    app.post('/api/admin/support-tickets/:id/mark-read', authenticate, authorize('superadmin', 'admin', 'moderator'), canManageTickets, adminMarkSupportTicketRead);
    app.post('/api/admin/support-tickets/:id/status', authenticate, authorize('superadmin', 'admin', 'moderator'), canManageTickets, adminUpdateSupportTicketStatus);
    app.post('/api/admin/support-tickets/:id/reply', authenticate, authorize('superadmin', 'admin', 'moderator'), canManageTickets, adminReplySupportTicket);

    app.get('/api/admin/alerts/feed', authenticate, authorize('superadmin', 'admin', 'moderator'), adminGetActionableAlerts);
    app.get('/api/admin/alerts/unread-count', authenticate, authorize('superadmin', 'admin', 'moderator'), adminGetActionableAlertsUnreadCount);
    app.post('/api/admin/alerts/mark-read', authenticate, authorize('superadmin', 'admin', 'moderator'), adminMarkActionableAlertsRead);
    app.post('/api/admin/alerts/:id/read', authenticate, authorize('superadmin', 'admin', 'moderator'), adminMarkSingleActionableAlertRead);
    app.post('/api/admin/alerts/read-all', authenticate, authorize('superadmin', 'admin', 'moderator'), adminMarkAllActionableAlertsRead);
    app.get('/api/admin/notifications/unread-count', authenticate, authorize('superadmin', 'admin', 'moderator'), adminGetActionableAlertsUnreadCount);
    app.post('/api/admin/notifications/:id/read', authenticate, authorize('superadmin', 'admin', 'moderator'), adminMarkSingleActionableAlertRead);
    app.post('/api/admin/notifications/read-all', authenticate, authorize('superadmin', 'admin', 'moderator'), adminMarkAllActionableAlertsRead);

    return app;
}

async function createSessionToken(user: SeededUser): Promise<string> {
    const sessionId = `session-${new mongoose.Types.ObjectId()}`;
    const token = jwt.sign(
        {
            _id: String(user._id),
            id: String(user._id),
            username: user.username,
            email: user.email,
            role: user.role,
            fullName: user.full_name,
            sessionId,
        },
        process.env.JWT_SECRET || 'test-jwt-secret',
    );

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    await ActiveSession.create({
        user_id: user._id,
        session_id: sessionId,
        jwt_token_hash: tokenHash,
        browser_fingerprint: `fp-${user.username}`,
        ip_address: '127.0.0.1',
        device_type: 'test',
        login_time: new Date(),
        last_activity: new Date(),
        status: 'active',
    });

    return token;
}

async function seedUser(input: {
    role: UserRole;
    fullName: string;
    username: string;
    email: string;
    phone?: string;
    permissions?: Record<string, boolean>;
    subscription?: Record<string, unknown>;
}): Promise<SeededUser> {
    const user = await User.create({
        full_name: input.fullName,
        username: input.username,
        email: input.email,
        password: 'hashed-password',
        role: input.role,
        status: 'active',
        phone_number: input.phone || undefined,
        permissions: {
            canEditExams: false,
            canManageStudents: false,
            canViewReports: false,
            canDeleteData: false,
            canManageFinance: false,
            canManagePlans: false,
            canManageTickets: false,
            canManageBackups: false,
            canRevealPasswords: false,
            ...(input.permissions || {}),
        },
        subscription: input.subscription || {},
    });

    return {
        _id: user._id,
        full_name: user.full_name,
        username: user.username,
        email: user.email,
        role: user.role as UserRole,
        phone_number: user.phone_number,
    };
}

async function seedStudentProfile(user: SeededUser, overrides: Partial<Record<string, unknown>> = {}): Promise<void> {
    await StudentProfile.create({
        user_id: user._id,
        user_unique_id: `CW-${String(user._id).slice(-6)}`,
        full_name: user.full_name,
        username: user.username,
        email: user.email,
        phone: user.phone_number,
        phone_number: user.phone_number,
        institution_name: 'CampusWay College',
        hsc_batch: '2025',
        ...overrides,
    });
}

async function seedActiveSubscription(user: SeededUser, overrides: Partial<Record<string, unknown>> = {}) {
    const uniqueSuffix = String(new mongoose.Types.ObjectId()).slice(-6).toLowerCase();
    const code = typeof overrides.code === 'string' ? overrides.code : `premium-monthly-${uniqueSuffix}`;
    const slug = typeof overrides.slug === 'string' ? overrides.slug : code;
    const name = typeof overrides.name === 'string' ? overrides.name : 'Premium Monthly';
    const plan = await SubscriptionPlan.create({
        code,
        slug,
        name,
        durationDays: 30,
        durationValue: 30,
        supportLevel: overrides.supportLevel || 'premium',
        priceBDT: 999,
        price: 999,
        isFree: false,
        isPaid: true,
    });

    const expiresAtUTC = overrides.expiresAtUTC instanceof Date
        ? overrides.expiresAtUTC
        : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const status = typeof overrides.status === 'string' ? overrides.status : 'active';

    await UserSubscription.create({
        userId: user._id,
        planId: plan._id,
        status,
        startAtUTC: new Date(Date.now() - 24 * 60 * 60 * 1000),
        expiresAtUTC,
    });

    await User.updateOne(
        { _id: user._id },
        {
            $set: {
                subscription: {
                    plan: plan.code,
                    planCode: plan.code,
                    planId: plan._id,
                    planSlug: plan.slug,
                    planName: plan.name,
                    isActive: status === 'active' && expiresAtUTC.getTime() > Date.now(),
                    startDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
                    expiryDate: expiresAtUTC,
                },
            },
        },
    );

    return plan;
}

async function createStudentWithSubscription(input: {
    username: string;
    email: string;
    fullName: string;
    phone: string;
    expiresAtUTC?: Date;
    status?: string;
}): Promise<SeededUser> {
    const student = await seedUser({
        role: 'student',
        fullName: input.fullName,
        username: input.username,
        email: input.email,
        phone: input.phone,
    });
    await seedStudentProfile(student);
    await seedActiveSubscription(student, {
        expiresAtUTC: input.expiresAtUTC,
        status: input.status,
    });
    return student;
}

function authHeader(token: string): { Authorization: string } {
    return { Authorization: `Bearer ${token}` };
}

describe('Unified communication backend', () => {
    let consoleErrorSpy: jest.SpyInstance;
    let consoleWarnSpy: jest.SpyInstance;

    beforeEach(() => {
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
        consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
        consoleErrorSpy.mockRestore();
        consoleWarnSpy.mockRestore();
    });

    test('stores contact messages canonically, links sender profiles, and supports admin status lifecycle', async () => {
        const app = buildApp();
        const admin = await seedUser({
            role: 'superadmin',
            fullName: 'Root Admin',
            username: 'root-admin',
            email: 'root-admin@example.com',
        });
        const student = await createStudentWithSubscription({
            username: 'matched-student',
            email: 'matched-student@example.com',
            fullName: 'Matched Student',
            phone: '01711111111',
        });

        const adminToken = await createSessionToken(admin);

        await request(app)
            .post('/api/contact')
            .send({
                name: 'Matched Student',
                email: student.email,
                phone: '01711111111',
                subject: 'Need admission guidance',
                message: 'Please help me understand the next steps.',
            })
            .expect(201);

        const contact = await ContactMessage.findOne({ subject: 'Need admission guidance' }).lean();
        expect(contact).toBeTruthy();
        expect(contact?.status).toBe('new');
        expect(contact?.unreadByAdmin).toBe(true);
        expect(String(contact?.linkedUserId || '')).toBe(String(student._id));
        expect(String(contact?.linkedStudentId || '')).toBe(String(student._id));
        expect(contact?.matchedBy).toBe('email');

        const notification = await Notification.findOne({ type: 'contact_new', sourceId: String(contact?._id) }).lean();
        expect(notification).toBeTruthy();
        expect(notification?.targetRoute).toBe('/__cw_admin__/contact');
        expect(notification?.targetEntityId).toBe(String(contact?._id));

        const listResponse = await request(app)
            .get('/api/admin/contact-messages')
            .set(authHeader(adminToken))
            .query({ filter: 'matched' })
            .expect(200);
        expect(listResponse.body.messages).toHaveLength(1);
        expect(listResponse.body.messages[0].senderProfileSummary.fullName).toBe('Matched Student');
        expect(listResponse.body.unreadCount).toBe(1);

        const detailResponse = await request(app)
            .get(`/api/admin/contact-messages/${String(contact?._id)}`)
            .set(authHeader(adminToken))
            .expect(200);
        expect(detailResponse.body.item.status).toBe('opened');
        expect(detailResponse.body.item.unreadByAdmin).toBe(false);
        expect(detailResponse.body.item.isRead).toBe(true);

        await request(app)
            .post(`/api/admin/contact-messages/${String(contact?._id)}/mark-read`)
            .set(authHeader(adminToken))
            .expect(200);

        const resolveResponse = await request(app)
            .post(`/api/admin/contact-messages/${String(contact?._id)}/resolve`)
            .set(authHeader(adminToken))
            .expect(200);
        expect(resolveResponse.body.item.status).toBe('resolved');

        const archiveResponse = await request(app)
            .post(`/api/admin/contact-messages/${String(contact?._id)}/archive`)
            .set(authHeader(adminToken))
            .expect(200);
        expect(archiveResponse.body.item.status).toBe('archived');

        const matchedFilter = await request(app)
            .get('/api/admin/contact-messages')
            .set(authHeader(adminToken))
            .query({ filter: 'matched' })
            .expect(200);
        expect(matchedFilter.body.messages[0].matchedBy).toBe('email');

        const unmatchedFilter = await request(app)
            .get('/api/admin/contact-messages')
            .set(authHeader(adminToken))
            .query({ filter: 'unmatched' })
            .expect(200);
        expect(unmatchedFilter.body.messages).toHaveLength(0);

        const timelineEntry = await StudentContactTimeline.findOne({ studentId: student._id }).lean();
        expect(timelineEntry?.type).toBe('message');
    });

    test('matches contact senders by authenticated userId first and by unique phone when unauthenticated', async () => {
        const app = buildApp();
        const admin = await seedUser({
            role: 'superadmin',
            fullName: 'Contact Admin',
            username: 'contact-admin',
            email: 'contact-admin@example.com',
        });
        const authenticatedStudent = await createStudentWithSubscription({
            username: 'auth-contact-student',
            email: 'auth-contact-student@example.com',
            fullName: 'Authenticated Contact Student',
            phone: '01766666666',
        });
        const phoneMatchedStudent = await createStudentWithSubscription({
            username: 'phone-contact-student',
            email: 'phone-contact-student@example.com',
            fullName: 'Phone Contact Student',
            phone: '01777777777',
        });

        const adminToken = await createSessionToken(admin);
        const authenticatedStudentToken = await createSessionToken(authenticatedStudent);

        await request(app)
            .post('/api/contact')
            .set(authHeader(authenticatedStudentToken))
            .send({
                name: 'Authenticated Contact Student',
                email: 'outside-address@example.com',
                phone: '00000000000',
                subject: 'Authenticated contact',
                message: 'This should still link by userId.',
            })
            .expect(201);

        await request(app)
            .post('/api/contact')
            .send({
                name: 'Phone Contact Student',
                email: 'no-match@example.com',
                phone: '01777777777',
                subject: 'Phone matched contact',
                message: 'This should link by phone.',
            })
            .expect(201);

        const authenticatedContact = await ContactMessage.findOne({ subject: 'Authenticated contact' }).lean();
        const phoneMatchedContact = await ContactMessage.findOne({ subject: 'Phone matched contact' }).lean();

        expect(authenticatedContact?.matchedBy).toBe('userId');
        expect(String(authenticatedContact?.linkedUserId || '')).toBe(String(authenticatedStudent._id));
        expect(String(authenticatedContact?.linkedStudentId || '')).toBe(String(authenticatedStudent._id));

        expect(phoneMatchedContact?.matchedBy).toBe('phone');
        expect(String(phoneMatchedContact?.linkedUserId || '')).toBe(String(phoneMatchedStudent._id));
        expect(String(phoneMatchedContact?.linkedStudentId || '')).toBe(String(phoneMatchedStudent._id));

        const matchedList = await request(app)
            .get('/api/admin/contact-messages')
            .set(authHeader(adminToken))
            .query({ filter: 'matched' })
            .expect(200);
        expect(matchedList.body.messages).toHaveLength(2);
        expect(matchedList.body.messages.map((item: { matchedBy?: string }) => item.matchedBy).sort()).toEqual(['phone', 'userId']);
    });

    test('runs support ticket chat flow with subscription gating, unread counters, compatibility payloads, and student/admin notifications', async () => {
        const app = buildApp();
        const admin = await seedUser({
            role: 'superadmin',
            fullName: 'Support Admin',
            username: 'support-admin',
            email: 'support-admin@example.com',
        });
        const student = await createStudentWithSubscription({
            username: 'support-student',
            email: 'support-student@example.com',
            fullName: 'Support Student',
            phone: '01722222222',
        });

        const adminToken = await createSessionToken(admin);
        const studentToken = await createSessionToken(student);

        const eligibilityResponse = await request(app)
            .get('/api/support/eligibility')
            .set(authHeader(studentToken))
            .expect(200);
        expect(eligibilityResponse.body.allowed).toBe(true);
        expect(String(eligibilityResponse.body.planCode || '')).toMatch(/^premium-monthly-/);

        const createResponse = await request(app)
            .post('/api/support/tickets')
            .set(authHeader(studentToken))
            .send({
                subject: 'Issue with premium dashboard',
                message: 'The premium dashboard is not loading for me.',
            })
            .expect(201);

        const createdTicket = createResponse.body.item;
        expect(createdTicket.ticketNo).toMatch(/^TKT-/);
        expect(createdTicket.message).toBe('The premium dashboard is not loading for me.');
        expect(createdTicket.timeline).toHaveLength(1);
        expect(createdTicket.messages).toHaveLength(1);
        expect(createdTicket.unreadCountForAdmin).toBe(1);
        expect(createdTicket.unreadCountForUser).toBe(0);
        expect(createdTicket.threadState).toBe('pending');
        expect(createdTicket.senderProfileSummary.subscriptionPlanName).toBe('Premium Monthly');

        const newTicketAlert = await Notification.findOne({
            type: 'support_ticket_new',
            targetRole: 'admin',
            sourceId: String(createdTicket._id),
        }).lean();
        expect(newTicketAlert).toBeTruthy();

        const adminListResponse = await request(app)
            .get('/api/admin/support-tickets')
            .set(authHeader(adminToken))
            .query({ unread: 'true' })
            .expect(200);
        expect(adminListResponse.body.items).toHaveLength(1);
        expect(adminListResponse.body.items[0].ticketNo).toBe(createdTicket.ticketNo);

        const adminDetailResponse = await request(app)
            .get(`/api/admin/support-tickets/${createdTicket._id}`)
            .set(authHeader(adminToken))
            .expect(200);
        expect(adminDetailResponse.body.item.unreadCountForAdmin).toBe(0);
        expect(adminDetailResponse.body.item.threadState).toBe('idle');

        const adminReplyResponse = await request(app)
            .post(`/api/admin/support-tickets/${createdTicket._id}/reply`)
            .set(authHeader(adminToken))
            .send({ message: 'We checked this and enabled the dashboard on your account.' })
            .expect(200);
        expect(adminReplyResponse.body.item.messages).toHaveLength(2);
        expect(adminReplyResponse.body.item.timeline).toHaveLength(2);
        expect(adminReplyResponse.body.item.unreadCountForUser).toBe(1);
        expect(adminReplyResponse.body.item.lastMessageSenderType).toBe('admin');
        expect(adminReplyResponse.body.item.status).toBe('in_progress');
        expect(adminReplyResponse.body.item.threadState).toBe('replied');

        const studentNotification = await Notification.findOne({
            targetRole: 'student',
            sourceId: String(createdTicket._id),
            sourceType: 'support_ticket',
        }).lean();
        expect(studentNotification).toBeTruthy();
        expect(studentNotification?.targetEntityId).toBe(String(createdTicket._id));

        const studentSupportFeed = await request(app)
            .get('/api/students/me/notifications')
            .set(authHeader(studentToken))
            .query({ type: 'support' })
            .expect(200);
        expect(studentSupportFeed.body.items.length).toBeGreaterThanOrEqual(1);
        expect(studentSupportFeed.body.items[0].kind).toBe('support');
        expect(studentSupportFeed.body.items[0].sourceType).toBe('support_ticket');
        expect(studentSupportFeed.body.items[0].targetRoute).toBe('/support');

        const studentDetailResponse = await request(app)
            .get(`/api/support/tickets/${createdTicket._id}`)
            .set(authHeader(studentToken))
            .expect(200);
        expect(studentDetailResponse.body.item.unreadCountForUser).toBe(0);
        expect(studentDetailResponse.body.item.timeline).toHaveLength(2);
        expect(studentDetailResponse.body.item.message).toBe('The premium dashboard is not loading for me.');

        const studentReplyResponse = await request(app)
            .post(`/api/support/tickets/${createdTicket._id}/reply`)
            .set(authHeader(studentToken))
            .send({ message: 'Thanks, it is working now and I have one follow-up question.' })
            .expect(200);
        expect(studentReplyResponse.body.item.messages).toHaveLength(3);
        expect(studentReplyResponse.body.item.unreadCountForAdmin).toBe(1);
        expect(studentReplyResponse.body.item.threadState).toBe('pending');

        const statusUpdateResponse = await request(app)
            .post(`/api/admin/support-tickets/${createdTicket._id}/status`)
            .set(authHeader(adminToken))
            .send({ status: 'resolved' })
            .expect(200);
        expect(statusUpdateResponse.body.item.status).toBe('resolved');

        const afterStatusFeed = await request(app)
            .get('/api/students/me/notifications')
            .set(authHeader(studentToken))
            .query({ type: 'support' })
            .expect(200);
        const statusAlert = afterStatusFeed.body.items.find((item: { type?: string }) => item.type === 'support_status_changed');
        expect(statusAlert).toBeTruthy();
        expect(statusAlert.kind).toBe('support');

        const supportReplyAlert = await Notification.findOne({
            type: 'support_reply_new',
            targetRole: 'admin',
        }).lean();
        expect(supportReplyAlert).toBeTruthy();
        expect(supportReplyAlert?.sourceType).toBe('support_ticket');

        const legacyAliasResponse = await request(app)
            .get(`/api/student/support-tickets/${createdTicket._id}`)
            .set(authHeader(studentToken))
            .expect(200);
        expect(legacyAliasResponse.body.item.ticketNo).toBe(createdTicket.ticketNo);
        expect(legacyAliasResponse.body.item.timeline).toHaveLength(3);
        expect(legacyAliasResponse.body.item.message).toBe('The premium dashboard is not loading for me.');

        const timelineCount = await StudentContactTimeline.countDocuments({ studentId: student._id });
        const auditCount = await AuditLog.countDocuments({ target_type: 'communication' });
        expect(timelineCount).toBeGreaterThanOrEqual(3);
        expect(auditCount).toBeGreaterThanOrEqual(3);
    });

    test('tracks admin actionable alerts with per-admin unread state and read aliases', async () => {
        const app = buildApp();
        const superadmin = await seedUser({
            role: 'superadmin',
            fullName: 'Alert Superadmin',
            username: 'alert-superadmin',
            email: 'alert-superadmin@example.com',
        });
        const secondAdmin = await seedUser({
            role: 'admin',
            fullName: 'Alert Admin',
            username: 'alert-admin',
            email: 'alert-admin@example.com',
        });
        const student = await createStudentWithSubscription({
            username: 'alert-student',
            email: 'alert-student@example.com',
            fullName: 'Alert Student',
            phone: '01733333333',
        });

        const superadminToken = await createSessionToken(superadmin);
        const secondAdminToken = await createSessionToken(secondAdmin);
        const studentToken = await createSessionToken(student);

        await request(app)
            .post('/api/contact')
            .send({
                name: 'Alert Student',
                email: 'alert-student@example.com',
                phone: '01733333333',
                subject: 'Need support call',
                message: 'Please call me back today.',
            })
            .expect(201);

        await request(app)
            .post('/api/support/tickets')
            .set(authHeader(studentToken))
            .send({
                subject: 'Payment receipt issue',
                message: 'My payment receipt is not visible.',
            })
            .expect(201);

        const legacyRequestId = new mongoose.Types.ObjectId();
        await Notification.create({
            title: 'Profile update waiting approval',
            message: 'A student profile update request needs review.',
            category: 'update',
            type: 'profile_update_request',
            targetRole: 'admin',
            isActive: true,
            linkUrl: `/__cw_admin__/student-management/profile-requests?requestId=${String(legacyRequestId)}`,
        });

        const feedResponse = await request(app)
            .get('/api/admin/alerts/feed')
            .set(authHeader(superadminToken))
            .expect(200);
        expect(feedResponse.body.items).toHaveLength(3);
        expect(feedResponse.body.unreadCount).toBe(3);
        expect(feedResponse.body.items[0]).toHaveProperty('targetRoute');
        expect(feedResponse.body.items[0]).toHaveProperty('targetEntityId');
        expect(feedResponse.body.items[0]).toHaveProperty('group');
        const profileApprovalItem = feedResponse.body.items.find(
            (item: { type?: string }) => item.type === 'profile_update_request',
        );
        expect(profileApprovalItem?.targetRoute).toBe('/__cw_admin__/student-management/profile-requests');
        expect(profileApprovalItem?.targetEntityId).toBe(String(legacyRequestId));
        expect(profileApprovalItem?.group).toBe('approvals');

        const supportOnlyFeed = await request(app)
            .get('/api/admin/alerts/feed')
            .set(authHeader(superadminToken))
            .query({ group: 'support' })
            .expect(200);
        expect(supportOnlyFeed.body.items).toHaveLength(1);
        expect(supportOnlyFeed.body.items[0].group).toBe('support');

        const contactOnlyFeed = await request(app)
            .get('/api/admin/alerts/feed')
            .set(authHeader(superadminToken))
            .query({ group: 'contact' })
            .expect(200);
        expect(contactOnlyFeed.body.items).toHaveLength(1);
        expect(contactOnlyFeed.body.items[0].group).toBe('contact');

        const unreadCountResponse = await request(app)
            .get('/api/admin/notifications/unread-count')
            .set(authHeader(superadminToken))
            .expect(200);
        expect(unreadCountResponse.body.unreadCount).toBe(3);

        const firstAlertId = String(feedResponse.body.items[0]._id);
        const secondAlertId = String(feedResponse.body.items[1]._id);
        const singleReadResponse = await request(app)
            .post(`/api/admin/alerts/${firstAlertId}/read`)
            .set(authHeader(superadminToken))
            .expect(200);
        expect(singleReadResponse.body.updated).toBe(1);

        const afterSingleRead = await request(app)
            .get('/api/admin/notifications/unread-count')
            .set(authHeader(superadminToken))
            .expect(200);
        expect(afterSingleRead.body.unreadCount).toBe(2);

        const secondAdminUnread = await request(app)
            .get('/api/admin/notifications/unread-count')
            .set(authHeader(secondAdminToken))
            .expect(200);
        expect(secondAdminUnread.body.unreadCount).toBe(3);

        const bulkReadResponse = await request(app)
            .post('/api/admin/alerts/mark-read')
            .set(authHeader(superadminToken))
            .send({ ids: [secondAlertId] })
            .expect(200);
        expect(bulkReadResponse.body.updated).toBe(1);

        const readAllResponse = await request(app)
            .post('/api/admin/alerts/read-all')
            .set(authHeader(superadminToken))
            .expect(200);
        expect(readAllResponse.body.updated).toBe(1);

        const unreadFeed = await request(app)
            .get('/api/admin/alerts/feed')
            .set(authHeader(superadminToken))
            .query({ filter: 'unread' })
            .expect(200);
        expect(unreadFeed.body.items).toHaveLength(0);

        const readRows = await AdminNotificationRead.find({ adminUserId: superadmin._id }).lean();
        expect(readRows).toHaveLength(3);
    });

    test('blocks support access cleanly for expired subscriptions', async () => {
        const app = buildApp();
        const expiredStudent = await createStudentWithSubscription({
            username: 'expired-student',
            email: 'expired-student@example.com',
            fullName: 'Expired Student',
            phone: '01744444444',
            expiresAtUTC: new Date(Date.now() - 24 * 60 * 60 * 1000),
            status: 'active',
        });
        const expiredToken = await createSessionToken(expiredStudent);

        const eligibilityResponse = await request(app)
            .get('/api/support/eligibility')
            .set(authHeader(expiredToken))
            .expect(200);
        expect(eligibilityResponse.body.allowed).toBe(false);
        expect(eligibilityResponse.body.reason).toBe('expired_subscription');

        const createResponse = await request(app)
            .post('/api/support/tickets')
            .set(authHeader(expiredToken))
            .send({
                subject: 'Please help',
                message: 'I cannot open premium support.',
            })
            .expect(403);
        expect(createResponse.body.subscriptionRequired).toBe(true);
        expect(createResponse.body.reason).toBe('expired_subscription');
    });

    test('runs migration idempotently for legacy contact and support data', async () => {
        const student = await createStudentWithSubscription({
            username: 'legacy-student',
            email: 'legacy-student@example.com',
            fullName: 'Legacy Student',
            phone: '01755555555',
        });
        const admin = await seedUser({
            role: 'superadmin',
            fullName: 'Legacy Admin',
            username: 'legacy-admin',
            email: 'legacy-admin@example.com',
        });

        const contactId = new mongoose.Types.ObjectId();
        const ticketId = new mongoose.Types.ObjectId();
        const createdAt = new Date('2026-03-10T09:00:00.000Z');
        const replyAt = new Date('2026-03-10T10:00:00.000Z');

        await ContactMessage.collection.insertOne({
            _id: contactId,
            name: 'Legacy Contact',
            email: 'Legacy-Contact@Example.com',
            phone: '+8801712345678',
            subject: 'Legacy subject',
            message: 'Legacy message body',
            isRead: true,
            isReplied: false,
            createdAt,
            updatedAt: replyAt,
        });

        await SupportTicket.collection.insertOne({
            _id: ticketId,
            ticketNo: 'TKT-20260310-0001',
            studentId: student._id,
            subject: 'Legacy support issue',
            message: 'Original legacy message',
            status: 'open',
            priority: 'medium',
            assignedTo: admin._id,
            timeline: [
                {
                    actorId: student._id,
                    actorRole: 'student',
                    message: 'Original legacy message',
                    createdAt,
                },
                {
                    actorId: admin._id,
                    actorRole: 'admin',
                    message: 'Legacy admin reply',
                    createdAt: replyAt,
                },
            ],
            createdAt,
            updatedAt: replyAt,
        });

        const firstRun = await runCommunicationCenterMigration();
        const messagesAfterFirstRun = await SupportTicketMessage.find({ ticketId }).sort({ sequence: 1 }).lean();
        const migratedContact = await ContactMessage.findById(contactId).lean();
        const migratedTicket = await SupportTicket.findById(ticketId).lean();

        expect(firstRun.contactMessagesUpdated).toBeGreaterThanOrEqual(1);
        expect(firstRun.supportTicketsBackfilled).toBeGreaterThanOrEqual(1);
        expect(messagesAfterFirstRun).toHaveLength(2);
        expect(messagesAfterFirstRun.map((item) => item.sequence)).toEqual([1, 2]);
        expect(messagesAfterFirstRun.every((item) => Boolean(item.readByAdminAt) && Boolean(item.readByUserAt))).toBe(true);
        expect(migratedContact?.status).toBe('opened');
        expect(migratedContact?.unreadByAdmin).toBe(false);
        expect(migratedContact?.normalizedEmail).toBe('legacy-contact@example.com');
        expect(migratedContact?.normalizedPhone).toBe('8801712345678');
        expect(migratedTicket?.messageCount).toBe(2);
        expect(migratedTicket?.latestMessagePreview).toContain('Legacy admin reply');

        const secondRun = await runCommunicationCenterMigration();
        const messagesAfterSecondRun = await SupportTicketMessage.find({ ticketId }).sort({ sequence: 1 }).lean();
        expect(secondRun.supportTicketsBackfilled).toBeGreaterThanOrEqual(1);
        expect(messagesAfterSecondRun).toHaveLength(2);
    });
});
