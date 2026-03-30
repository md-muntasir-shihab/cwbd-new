import mongoose from 'mongoose';
import ActionApproval, {
    IActionApproval,
    IActionApprovalRequestContext,
    IActionApprovalReviewSummaryItem,
    IActionApprovalTargetSummary,
} from '../models/ActionApproval';
import ActiveSession from '../models/ActiveSession';
import AuditLog from '../models/AuditLog';
import User from '../models/User';
import StudentProfile from '../models/StudentProfile';
import AdminProfile from '../models/AdminProfile';
import LoginActivity from '../models/LoginActivity';
import StudentGroup from '../models/StudentGroup';
import University from '../models/University';
import News from '../models/News';
import Exam from '../models/Exam';
import ManualPayment from '../models/ManualPayment';
import { RiskyActionKey } from '../models/SecuritySettings';
import { getClientIp, getDeviceInfo } from '../utils/requestMeta';
import { SecuritySettingsSnapshot, getSecuritySettingsSnapshot } from './securityCenterService';

type ApprovalActor = {
    userId: string;
    role: string;
};

type RequestApprovalInput = {
    actionKey: RiskyActionKey;
    module: string;
    action: string;
    routePath: string;
    method: string;
    paramsSnapshot: Record<string, unknown>;
    querySnapshot: Record<string, unknown>;
    payloadSnapshot: Record<string, unknown>;
    actor: ApprovalActor;
    requestContext?: IActionApprovalRequestContext;
};

type ExecutionResult = {
    ok: boolean;
    message: string;
    affectedCount?: number;
    details?: Record<string, unknown>;
};

type ApprovalReviewContext = {
    requestContext: IActionApprovalRequestContext;
    targetSummary: IActionApprovalTargetSummary;
    reviewSummary: IActionApprovalReviewSummaryItem[];
    beforeSnapshot?: Record<string, unknown>;
    afterSnapshot?: Record<string, unknown>;
};

function safeString(value: unknown): string {
    return String(value || '').trim();
}

function humanizeActionKey(actionKey: string): string {
    return String(actionKey || '')
        .split('.')
        .map((part) => safeString(part).replace(/[_-]+/g, ' '))
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' / ');
}

function readValidObjectIds(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
        .map((item) => safeString(item))
        .filter((item) => mongoose.Types.ObjectId.isValid(item));
}

function pickRecord<T extends Record<string, unknown>>(source: T, keys: Array<keyof T>) {
    const result: Record<string, unknown> = {};
    for (const key of keys) {
        if (source[key] !== undefined) {
            result[String(key)] = source[key];
        }
    }
    return result;
}

function summarizeList(values: string[], limit = 3): string {
    const normalized = values.map((item) => safeString(item)).filter(Boolean);
    if (normalized.length === 0) return 'N/A';
    if (normalized.length <= limit) return normalized.join(', ');
    return `${normalized.slice(0, limit).join(', ')} +${normalized.length - limit} more`;
}

function detectBrowser(userAgent: string): string {
    if (/chrome/i.test(userAgent) && !/edge/i.test(userAgent)) return 'Chrome';
    if (/firefox/i.test(userAgent)) return 'Firefox';
    if (/safari/i.test(userAgent) && !/chrome/i.test(userAgent)) return 'Safari';
    if (/edge/i.test(userAgent)) return 'Edge';
    return '';
}

function detectPlatform(userAgent: string): string {
    if (/windows/i.test(userAgent)) return 'Windows';
    if (/android/i.test(userAgent)) return 'Android';
    if (/iphone|ipad|ios/i.test(userAgent)) return 'iOS';
    if (/mac os|macintosh/i.test(userAgent)) return 'macOS';
    if (/linux/i.test(userAgent)) return 'Linux';
    return '';
}

async function buildRequestContext(input?: IActionApprovalRequestContext): Promise<IActionApprovalRequestContext> {
    const sessionId = safeString(input?.sessionId);
    const fallbackUserAgent = safeString(input?.deviceInfo);
    const fallbackBrowser = safeString(input?.browser) || detectBrowser(fallbackUserAgent);
    const fallbackPlatform = safeString(input?.platform) || detectPlatform(fallbackUserAgent);

    if (!sessionId) {
        return {
            ipAddress: safeString(input?.ipAddress),
            deviceInfo: fallbackUserAgent,
            browser: fallbackBrowser,
            platform: fallbackPlatform,
            locationSummary: safeString(input?.locationSummary),
            sessionId: '',
        };
    }

    const session = await ActiveSession.findOne({ session_id: sessionId }).lean().catch(() => null);
    return {
        ipAddress: safeString(session?.ip_address || input?.ipAddress),
        deviceInfo: safeString(session?.device_name || session?.device_type || input?.deviceInfo),
        browser: safeString(session?.browser || fallbackBrowser),
        platform: safeString(session?.platform || fallbackPlatform),
        locationSummary: safeString(session?.location_summary || input?.locationSummary),
        sessionId,
    };
}

async function buildStudentsBulkDeleteContext(payloadSnapshot: Record<string, unknown>): Promise<ApprovalReviewContext> {
    const studentIds = readValidObjectIds(payloadSnapshot.studentIds);
    const users = studentIds.length > 0
        ? await User.find({ _id: { $in: studentIds }, role: 'student' })
            .select('full_name email username status subscription.planName')
            .lean()
        : [];

    return {
        requestContext: {},
        targetSummary: {
            targetType: 'students',
            targetId: studentIds[0] || '',
            targetLabel: `${studentIds.length} student${studentIds.length === 1 ? '' : 's'}`,
        },
        reviewSummary: [
            { label: 'Action', value: 'Delete selected student accounts and linked records' },
            { label: 'Students selected', value: String(studentIds.length) },
            {
                label: 'Targets',
                value: summarizeList(users.map((item) => safeString(item.full_name || item.email || item.username))),
            },
        ],
        beforeSnapshot: {
            totalStudents: studentIds.length,
            students: users.slice(0, 25).map((item) => pickRecord(item as Record<string, unknown>, ['_id', 'full_name', 'email', 'username', 'status'])),
        },
        afterSnapshot: {
            effect: 'Delete student users, student profiles, admin profiles, login activity, and group memberships.',
            affectedCollections: ['users', 'student_profiles', 'admin_profiles', 'login_activities', 'student_groups'],
        },
    };
}

async function buildUniversitiesBulkDeleteContext(
    paramsSnapshot: Record<string, unknown>,
    payloadSnapshot: Record<string, unknown>,
): Promise<ApprovalReviewContext> {
    const ids = readValidObjectIds(payloadSnapshot.ids);
    const mode = safeString(payloadSnapshot.mode).toLowerCase() === 'hard' ? 'hard' : 'soft';
    const rows = ids.length > 0
        ? await University.find({ _id: { $in: ids } })
            .select('name shortForm category isActive isArchived')
            .lean()
        : [];

    return {
        requestContext: {},
        targetSummary: {
            targetType: 'universities',
            targetId: ids[0] || safeString(paramsSnapshot.id),
            targetLabel: `${ids.length} universit${ids.length === 1 ? 'y' : 'ies'}`,
        },
        reviewSummary: [
            { label: 'Action', value: mode === 'hard' ? 'Permanently delete universities' : 'Archive and deactivate universities' },
            { label: 'Universities selected', value: String(ids.length) },
            {
                label: 'Targets',
                value: summarizeList(rows.map((item) => safeString(item.name || item.shortForm))),
            },
        ],
        beforeSnapshot: {
            mode,
            universities: rows.slice(0, 25).map((item) => pickRecord(item as Record<string, unknown>, ['_id', 'name', 'shortForm', 'category', 'isActive', 'isArchived'])),
        },
        afterSnapshot: mode === 'hard'
            ? {
                effect: 'Selected university records will be permanently removed.',
                mode,
            }
            : {
                effect: 'Selected universities will be archived, deactivated, and hidden from active listings.',
                mode,
                flags: { isArchived: true, isActive: false },
            },
    };
}

async function buildNewsBulkDeleteContext(
    paramsSnapshot: Record<string, unknown>,
    payloadSnapshot: Record<string, unknown>,
): Promise<ApprovalReviewContext> {
    const idsFromPayload = readValidObjectIds(payloadSnapshot.ids);
    const paramId = safeString(paramsSnapshot.id);
    const ids = idsFromPayload.length > 0
        ? idsFromPayload
        : (mongoose.Types.ObjectId.isValid(paramId) ? [paramId] : []);
    const rows = ids.length > 0
        ? await News.find({ _id: { $in: ids } })
            .select('title status category sourceName')
            .lean()
        : [];

    return {
        requestContext: {},
        targetSummary: {
            targetType: 'news',
            targetId: ids[0] || '',
            targetLabel: `${ids.length} news item${ids.length === 1 ? '' : 's'}`,
        },
        reviewSummary: [
            { label: 'Action', value: 'Delete selected news items' },
            { label: 'News selected', value: String(ids.length) },
            { label: 'Targets', value: summarizeList(rows.map((item) => safeString(item.title))) },
        ],
        beforeSnapshot: {
            newsItems: rows.slice(0, 25).map((item) => pickRecord(item as Record<string, unknown>, ['_id', 'title', 'status', 'category', 'sourceName'])),
        },
        afterSnapshot: {
            effect: 'Selected news records will be removed from the CMS and public feeds.',
        },
    };
}

async function buildPublishExamResultContext(paramsSnapshot: Record<string, unknown>): Promise<ApprovalReviewContext> {
    const examId = safeString(paramsSnapshot.id);
    const exam = mongoose.Types.ObjectId.isValid(examId)
        ? await Exam.findById(examId)
            .select('title status resultPublishMode resultPublishDate isPublished')
            .lean()
        : null;

    return {
        requestContext: {},
        targetSummary: {
            targetType: 'exam',
            targetId: examId,
            targetLabel: safeString(exam?.title) || 'Exam result publish',
        },
        reviewSummary: [
            { label: 'Action', value: 'Publish exam result immediately' },
            { label: 'Exam', value: safeString(exam?.title) || 'Unknown exam' },
            { label: 'Current mode', value: safeString(exam?.resultPublishMode) || 'unset' },
        ],
        beforeSnapshot: exam ? pickRecord(exam as Record<string, unknown>, ['_id', 'title', 'status', 'resultPublishMode', 'resultPublishDate', 'isPublished']) : {},
        afterSnapshot: {
            resultPublishMode: 'immediate',
            effect: 'Result publish date will be updated to now.',
        },
    };
}

async function buildPublishBreakingNewsContext(paramsSnapshot: Record<string, unknown>): Promise<ApprovalReviewContext> {
    const newsId = safeString(paramsSnapshot.id);
    const item = mongoose.Types.ObjectId.isValid(newsId)
        ? await News.findById(newsId)
            .select('title status publishDate publishedAt priority isPublished')
            .lean()
        : null;

    return {
        requestContext: {},
        targetSummary: {
            targetType: 'news',
            targetId: newsId,
            targetLabel: safeString(item?.title) || 'Breaking news publish',
        },
        reviewSummary: [
            { label: 'Action', value: 'Publish breaking news immediately' },
            { label: 'News item', value: safeString(item?.title) || 'Unknown news item' },
            { label: 'Current status', value: safeString(item?.status) || 'unset' },
        ],
        beforeSnapshot: item ? pickRecord(item as Record<string, unknown>, ['_id', 'title', 'status', 'publishDate', 'publishedAt', 'priority', 'isPublished']) : {},
        afterSnapshot: {
            status: 'published',
            isPublished: true,
            effect: 'The item will go live immediately and clear any scheduled publish date.',
        },
    };
}

async function buildPaymentRefundContext(paramsSnapshot: Record<string, unknown>): Promise<ApprovalReviewContext> {
    const paymentId = safeString(paramsSnapshot.id);
    const payment = mongoose.Types.ObjectId.isValid(paymentId)
        ? await ManualPayment.findById(paymentId)
            .select('studentId amount currency method status transactionId reference entryType')
            .populate('studentId', 'full_name email')
            .lean()
        : null;

    const studentRecord = payment?.studentId && typeof payment.studentId === 'object'
        ? payment.studentId as { full_name?: string; email?: string }
        : null;

    return {
        requestContext: {},
        targetSummary: {
            targetType: 'payment',
            targetId: paymentId,
            targetLabel: safeString(payment?.reference || payment?.transactionId) || 'Manual payment refund',
        },
        reviewSummary: [
            { label: 'Action', value: 'Mark payment as refunded' },
            { label: 'Amount', value: `${Number(payment?.amount || 0)} ${safeString(payment?.currency) || 'BDT'}` },
            { label: 'Student', value: safeString(studentRecord?.full_name || studentRecord?.email) || 'Unknown student' },
        ],
        beforeSnapshot: payment ? {
            _id: payment._id,
            amount: payment.amount,
            currency: payment.currency,
            method: payment.method,
            status: payment.status,
            transactionId: payment.transactionId,
            reference: payment.reference,
            entryType: payment.entryType,
            student: studentRecord || undefined,
        } : {},
        afterSnapshot: {
            status: 'refunded',
            paidAt: null,
            effect: 'The manual payment will move to refunded status and paidAt will be cleared.',
        },
    };
}

async function buildApprovalReviewContext(
    actionKey: RiskyActionKey,
    paramsSnapshot: Record<string, unknown>,
    payloadSnapshot: Record<string, unknown>,
    requestContextInput?: IActionApprovalRequestContext,
): Promise<ApprovalReviewContext> {
    const requestContext = await buildRequestContext(requestContextInput);

    let computedContext: ApprovalReviewContext;
    switch (actionKey) {
        case 'students.bulk_delete':
            computedContext = await buildStudentsBulkDeleteContext(payloadSnapshot);
            break;
        case 'universities.bulk_delete':
            computedContext = await buildUniversitiesBulkDeleteContext(paramsSnapshot, payloadSnapshot);
            break;
        case 'news.bulk_delete':
            computedContext = await buildNewsBulkDeleteContext(paramsSnapshot, payloadSnapshot);
            break;
        case 'exams.publish_result':
            computedContext = await buildPublishExamResultContext(paramsSnapshot);
            break;
        case 'news.publish_breaking':
            computedContext = await buildPublishBreakingNewsContext(paramsSnapshot);
            break;
        case 'payments.mark_refunded':
            computedContext = await buildPaymentRefundContext(paramsSnapshot);
            break;
        default:
            computedContext = {
                requestContext: {},
                targetSummary: {
                    targetType: 'unknown',
                    targetId: safeString(paramsSnapshot.id),
                    targetLabel: humanizeActionKey(actionKey),
                },
                reviewSummary: [{ label: 'Action', value: humanizeActionKey(actionKey) }],
            };
            break;
    }

    return {
        requestContext,
        targetSummary: computedContext.targetSummary,
        reviewSummary: computedContext.reviewSummary,
        beforeSnapshot: computedContext.beforeSnapshot,
        afterSnapshot: computedContext.afterSnapshot,
    };
}

async function writeApprovalAudit(
    actor: ApprovalActor,
    action: string,
    approval: IActionApproval,
    details: Record<string, unknown> = {},
): Promise<void> {
    if (!mongoose.Types.ObjectId.isValid(actor.userId)) return;
    await AuditLog.create({
        actor_id: new mongoose.Types.ObjectId(actor.userId),
        actor_role: actor.role,
        action,
        target_id: approval._id,
        target_type: 'action_approval',
        ip_address: safeString(approval.requestContext?.ipAddress) || '127.0.0.1',
        sessionId: safeString(approval.requestContext?.sessionId) || undefined,
        device: safeString(approval.requestContext?.deviceInfo) || undefined,
        details: {
            actionKey: approval.actionKey,
            status: approval.status,
            targetSummary: approval.targetSummary || {},
            ...details,
        },
    });
}

export async function expireStaleApprovals(now = new Date()): Promise<number> {
    const result = await ActionApproval.updateMany(
        {
            status: 'pending_second_approval',
            expiresAt: { $lt: now },
        },
        { $set: { status: 'expired', decidedAt: now } },
    );
    return Number(result.modifiedCount || 0);
}

export async function requestApproval(input: RequestApprovalInput): Promise<IActionApproval> {
    await expireStaleApprovals();
    const security = await getSecuritySettingsSnapshot(false);
    const expiryMinutes = Math.max(5, Number(security.twoPersonApproval.approvalExpiryMinutes || 120));
    const reviewContext = await buildApprovalReviewContext(
        input.actionKey,
        input.paramsSnapshot,
        input.payloadSnapshot,
        input.requestContext,
    );

    const approval = await ActionApproval.create({
        actionKey: input.actionKey,
        module: input.module,
        action: input.action,
        routePath: input.routePath,
        method: input.method.toUpperCase(),
        paramsSnapshot: input.paramsSnapshot,
        querySnapshot: input.querySnapshot,
        payloadSnapshot: input.payloadSnapshot,
        initiatedBy: new mongoose.Types.ObjectId(input.actor.userId),
        initiatedByRole: input.actor.role,
        requestContext: reviewContext.requestContext,
        targetSummary: reviewContext.targetSummary,
        reviewSummary: reviewContext.reviewSummary,
        beforeSnapshot: reviewContext.beforeSnapshot || {},
        afterSnapshot: reviewContext.afterSnapshot || {},
        initiatedAt: new Date(),
        expiresAt: new Date(Date.now() + expiryMinutes * 60 * 1000),
        status: 'pending_second_approval',
    });

    await writeApprovalAudit(input.actor, 'approval.requested', approval, {
        module: input.module,
        action: input.action,
    });
    return approval;
}

async function executeStudentsBulkDelete(approval: IActionApproval): Promise<ExecutionResult> {
    const studentIds = readValidObjectIds(approval.payloadSnapshot.studentIds);
    if (studentIds.length === 0) {
        return { ok: false, message: 'No valid studentIds provided for execution.' };
    }

    await Promise.all([
        User.deleteMany({ _id: { $in: studentIds }, role: 'student' }),
        StudentProfile.deleteMany({ user_id: { $in: studentIds } }),
        AdminProfile.deleteMany({ user_id: { $in: studentIds } }),
        LoginActivity.deleteMany({ user_id: { $in: studentIds } }),
        StudentGroup.updateMany({}, { $pull: { manualStudents: { $in: studentIds } } }),
    ]);

    return {
        ok: true,
        message: 'Bulk delete students executed',
        affectedCount: studentIds.length,
    };
}

async function executeUniversitiesBulkDelete(approval: IActionApproval): Promise<ExecutionResult> {
    const ids = readValidObjectIds(approval.payloadSnapshot.ids);
    if (ids.length === 0) {
        return { ok: false, message: 'No valid university IDs provided for execution.' };
    }

    const mode = safeString(approval.payloadSnapshot.mode).toLowerCase() === 'hard' ? 'hard' : 'soft';
    let affected = 0;
    if (mode === 'hard') {
        const result = await University.deleteMany({ _id: { $in: ids } });
        affected = Number(result.deletedCount || 0);
    } else {
        const result = await University.updateMany(
            { _id: { $in: ids } },
            {
                $set: {
                    isArchived: true,
                    isActive: false,
                    archivedAt: new Date(),
                },
            },
        );
        affected = Number(result.modifiedCount || 0);
    }

    return {
        ok: true,
        message: 'Bulk delete universities executed',
        affectedCount: affected,
        details: { mode },
    };
}

async function executeNewsBulkDelete(approval: IActionApproval): Promise<ExecutionResult> {
    const idsFromPayload = readValidObjectIds(approval.payloadSnapshot.ids);
    const paramId = safeString(approval.paramsSnapshot.id);
    const ids = idsFromPayload.length > 0
        ? idsFromPayload
        : (mongoose.Types.ObjectId.isValid(paramId) ? [paramId] : []);
    if (ids.length === 0) {
        return { ok: false, message: 'No valid news IDs provided for execution.' };
    }

    const result = await News.deleteMany({ _id: { $in: ids } });
    return {
        ok: true,
        message: 'Bulk delete news executed',
        affectedCount: Number(result.deletedCount || 0),
    };
}

async function executePublishExamResult(approval: IActionApproval): Promise<ExecutionResult> {
    const examId = safeString(approval.paramsSnapshot.id);
    if (!mongoose.Types.ObjectId.isValid(examId)) {
        return { ok: false, message: 'Invalid exam id for publish result.' };
    }
    const updated = await Exam.findByIdAndUpdate(
        examId,
        {
            $set: {
                resultPublishMode: 'immediate',
                resultPublishDate: new Date(),
            },
        },
        { new: true },
    );
    if (!updated) {
        return { ok: false, message: 'Exam not found.' };
    }
    return {
        ok: true,
        message: 'Exam result published',
        affectedCount: 1,
    };
}

async function executePublishBreakingNews(approval: IActionApproval): Promise<ExecutionResult> {
    const newsId = safeString(approval.paramsSnapshot.id);
    if (!mongoose.Types.ObjectId.isValid(newsId)) {
        return { ok: false, message: 'Invalid news id for publish now.' };
    }
    const now = new Date();
    const updated = await News.findByIdAndUpdate(
        newsId,
        {
            $set: {
                status: 'published',
                isPublished: true,
                publishDate: now,
                publishedAt: now,
                scheduleAt: null,
                scheduledAt: null,
            },
        },
        { new: true },
    );
    if (!updated) {
        return { ok: false, message: 'News item not found.' };
    }
    return {
        ok: true,
        message: 'Breaking news published',
        affectedCount: 1,
    };
}

async function executeMarkPaymentRefunded(approval: IActionApproval): Promise<ExecutionResult> {
    const paymentId = safeString(approval.paramsSnapshot.id);
    if (!mongoose.Types.ObjectId.isValid(paymentId)) {
        return { ok: false, message: 'Invalid payment id for refund.' };
    }
    const updated = await ManualPayment.findByIdAndUpdate(
        paymentId,
        {
            $set: {
                status: 'refunded',
                paidAt: null,
            },
        },
        { new: true },
    );
    if (!updated) {
        return { ok: false, message: 'Payment entry not found.' };
    }
    return {
        ok: true,
        message: 'Payment marked as refunded',
        affectedCount: 1,
    };
}

async function executeApprovalAction(approval: IActionApproval): Promise<ExecutionResult> {
    switch (approval.actionKey) {
        case 'students.bulk_delete':
            return executeStudentsBulkDelete(approval);
        case 'universities.bulk_delete':
            return executeUniversitiesBulkDelete(approval);
        case 'news.bulk_delete':
            return executeNewsBulkDelete(approval);
        case 'exams.publish_result':
            return executePublishExamResult(approval);
        case 'news.publish_breaking':
            return executePublishBreakingNews(approval);
        case 'payments.mark_refunded':
            return executeMarkPaymentRefunded(approval);
        default:
            return { ok: false, message: `No executor registered for ${approval.actionKey}` };
    }
}

export async function approveApproval(id: string, actor: ApprovalActor): Promise<IActionApproval> {
    await expireStaleApprovals();
    const approval = await ActionApproval.findById(id);
    if (!approval) {
        throw new Error('APPROVAL_NOT_FOUND');
    }
    if (approval.status !== 'pending_second_approval') {
        throw new Error('APPROVAL_NOT_PENDING');
    }
    if (approval.expiresAt.getTime() <= Date.now()) {
        approval.status = 'expired';
        approval.decidedAt = new Date();
        await approval.save();
        throw new Error('APPROVAL_EXPIRED');
    }
    if (String(approval.initiatedBy) === actor.userId) {
        throw new Error('SELF_APPROVAL_FORBIDDEN');
    }

    approval.status = 'approved';
    approval.secondApprover = new mongoose.Types.ObjectId(actor.userId);
    approval.secondApproverRole = actor.role;
    approval.decidedAt = new Date();
    await approval.save();
    await writeApprovalAudit(actor, 'approval.approved', approval);

    const execution = await executeApprovalAction(approval);
    if (execution.ok) {
        approval.status = 'executed';
        approval.executedAt = new Date();
    } else {
        approval.status = 'rejected';
        approval.decisionReason = execution.message;
    }
    approval.executionMeta = {
        ...(approval.executionMeta || {}),
        execution,
    };
    await approval.save();
    await writeApprovalAudit(actor, 'approval.executed', approval, execution.details || {});
    return approval;
}

export async function rejectApproval(id: string, actor: ApprovalActor, reason?: string): Promise<IActionApproval> {
    await expireStaleApprovals();
    const approval = await ActionApproval.findById(id);
    if (!approval) throw new Error('APPROVAL_NOT_FOUND');
    if (approval.status !== 'pending_second_approval') throw new Error('APPROVAL_NOT_PENDING');
    if (String(approval.initiatedBy) === actor.userId) throw new Error('SELF_APPROVAL_FORBIDDEN');

    approval.status = 'rejected';
    approval.secondApprover = new mongoose.Types.ObjectId(actor.userId);
    approval.secondApproverRole = actor.role;
    approval.decisionReason = safeString(reason);
    approval.decidedAt = new Date();
    await approval.save();
    await writeApprovalAudit(actor, 'approval.rejected', approval, { reason: approval.decisionReason || '' });
    return approval;
}

export async function getPendingApprovals(limit = 100): Promise<IActionApproval[]> {
    await expireStaleApprovals();
    return ActionApproval.find({ status: 'pending_second_approval' })
        .sort({ createdAt: -1 })
        .limit(Math.max(1, Math.min(limit, 500)))
        .populate('initiatedBy', 'username email full_name role')
        .populate('secondApprover', 'username email full_name role');
}

export async function shouldRequireTwoPersonApproval(actionKey: RiskyActionKey): Promise<boolean> {
    const security: SecuritySettingsSnapshot = await getSecuritySettingsSnapshot(false);
    return (
        Boolean(security.twoPersonApproval.enabled) &&
        security.twoPersonApproval.riskyActions.includes(actionKey)
    );
}

export function buildApprovalRequestContextFromRequest(reqLike: {
    headers?: Record<string, unknown>;
    ip?: string;
    socket?: { remoteAddress?: string };
    user?: { sessionId?: string };
}): IActionApprovalRequestContext {
    const request = reqLike as unknown as {
        headers: Record<string, unknown>;
        ip?: string;
        socket?: { remoteAddress?: string };
    };
    const deviceInfo = getDeviceInfo(request as never);
    return {
        ipAddress: getClientIp(request as never),
        deviceInfo,
        browser: detectBrowser(deviceInfo),
        platform: detectPlatform(deviceInfo),
        sessionId: safeString(reqLike.user?.sessionId),
    };
}
