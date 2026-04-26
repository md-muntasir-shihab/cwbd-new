import { Response } from 'express';
import mongoose from 'mongoose';
import crypto from 'crypto';
import { AuthRequest } from '../middlewares/auth';
import Exam from '../models/Exam';
import Question from '../models/Question';
import { ExamQuestionModel } from '../models/examQuestion.model';
import ExamResult from '../models/ExamResult';
import ExamSession from '../models/ExamSession';
import User from '../models/User';
import StudentProfile from '../models/StudentProfile';
import StudentDashboardConfig from '../models/StudentDashboardConfig';
import ExamEvent from '../models/ExamEvent';
import ExamCertificate from '../models/ExamCertificate';
import StudentDueLedger from '../models/StudentDueLedger';
import ManualPayment from '../models/ManualPayment';
import SiteSettings from '../models/Settings';
import {
    addExamAttemptStreamClient,
    broadcastExamAttemptEvent,
    broadcastExamAttemptEventByMeta,
} from '../realtime/examAttemptStream';
import { broadcastAdminLiveEvent } from '../realtime/adminLiveStream';
import { getExamCardMetrics } from '../services/examCardMetricsService';
import { getSecurityConfig } from '../services/securityConfigService';
import { finalizeExamSession } from '../services/examFinalizationService';
import SecuritySettings from '../models/SecuritySettings';
import { mergeAntiCheatPolicy } from '../services/antiCheatEngine';
import { getCanonicalSubscriptionSnapshot } from '../services/subscriptionAccessService';
import {
    createExternalExamAttempt,
    getExternalExamAttemptCount,
    getExternalExamAttemptCountsForStudent,
} from '../services/externalExamAttemptService';
import { ResponseBuilder } from '../utils/responseBuilder';

/** Verify user subscription — returns true if user has ANY subscription plan (active or demo) */
type SubscriptionGateResult = {
    allowed: boolean;
    reason?: 'missing' | 'inactive' | 'expired';
    expiryDate?: Date | null;
};

const LEGACY_PLAN_CODE = 'legacy_free';
const LEGACY_PLAN_NAME = 'Legacy Free Access';
const LEGACY_SUBSCRIPTION_DAYS = 3650; // 10 years

function getLegacyExpiryFromNow(): Date {
    return new Date(Date.now() + (LEGACY_SUBSCRIPTION_DAYS * 24 * 60 * 60 * 1000));
}

/**
 * Hybrid gate:
 * 1) strict rule: isActive === true && expiryDate >= now
 * 2) transitional fallback: old students with missing subscription metadata get legacy_free backfill
 */
async function verifySubscription(userId: string): Promise<SubscriptionGateResult> {
    const user = await User.findById(userId).select('role subscription');
    if (!user) return { allowed: false, reason: 'missing' };

    if (['superadmin', 'admin', 'moderator'].includes(user.role)) {
        return { allowed: true };
    }

    if (user.role !== 'student') {
        return { allowed: true };
    }

    const snapshot = await getCanonicalSubscriptionSnapshot(
        userId,
        (user.subscription as Record<string, unknown> | undefined),
    );

    if (!snapshot.hasPlanIdentity) {
        return { allowed: false, reason: 'missing' };
    }

    if (!snapshot.isActive || snapshot.allowsExams === false) {
        return {
            allowed: false,
            reason: snapshot.reason === 'expired' ? 'expired' : 'inactive',
            expiryDate: snapshot.expiresAtUTC,
        };
    }

    return { allowed: true, expiryDate: snapshot.expiresAtUTC };
}

/** Verify the student can access this specific exam */
async function canAccessExam(exam: typeof Exam.prototype, userId: string): Promise<boolean> {
    if (!exam.isPublished) return false;
    if (exam.accessMode === 'specific') {
        return exam.allowedUsers.some((id: mongoose.Types.ObjectId) => id.toString() === userId);
    }
    return true; // 'all' mode — any subscribed user
}

async function broadcastExamMetricsUpdate(examId: string, source: string): Promise<void> {
    try {
        const exam = await Exam.findById(examId)
            .select('_id accessControl allowedUsers allowed_user_ids')
            .lean();
        if (!exam) return;
        const metricsMap = await getExamCardMetrics([exam as unknown as Record<string, unknown>]);
        const metrics = metricsMap.get(String(exam._id)) || {
            examId: String(exam._id),
            totalParticipants: 0,
            attemptedUsers: 0,
            remainingUsers: 0,
            activeUsers: 0,
        };
        broadcastAdminLiveEvent('exam-metrics-updated', {
            source,
            ...metrics,
        });
    } catch {
        // non-blocking
    }
}

/* ─────── GET /api/exams ─────── */
export async function getStudentExams(req: AuthRequest, res: Response): Promise<void> {
    try {
        const studentId = req.user!._id;
        const subscriptionState = await verifySubscription(studentId);
        let hasActiveSubscription = subscriptionState.allowed;

        const now = new Date();
        const exams = await Exam.find({ isPublished: true }).sort({ startDate: 1 }).lean();
        const examIds = exams.map((exam) => String(exam._id || '')).filter(Boolean);
        const [profile, user, dueLedger] = await Promise.all([
            StudentProfile.findOne({ user_id: studentId }).select('groupIds').lean(),
            User.findById(studentId).select('subscription').lean(),
            StudentDueLedger.findOne({ studentId }).select('netDue').lean(),
        ]);
        const subscriptionSnapshot = await getCanonicalSubscriptionSnapshot(
            studentId,
            (user?.subscription as Record<string, unknown> | undefined),
        );
        const pendingDueAmount = Number((dueLedger as { netDue?: number } | null)?.netDue || 0);
        const studentGroupIds = normalizeObjectIdArray(profile?.groupIds || []);
        const studentPlanCode = subscriptionSnapshot.planCode;
        hasActiveSubscription = subscriptionState.allowed && subscriptionSnapshot.allowsExams !== false;

        // Fetch student's completed results (multi-attempt aware)
        const results = await ExamResult.find({ student: studentId }).sort({ submittedAt: -1 }).lean();
        const resultMap = new Map<string, Record<string, unknown>>();
        const attemptCountMap = new Map<string, number>();
        for (const r of results) {
            const examKey = r.exam.toString();
            if (!resultMap.has(examKey)) resultMap.set(examKey, r as unknown as Record<string, unknown>);
            attemptCountMap.set(examKey, (attemptCountMap.get(examKey) || 0) + 1);
        }
        const externalAttemptCountMap = await getExternalExamAttemptCountsForStudent(studentId, examIds);

        // Fetch active session if any
        const activeSessions = await ExamSession.find({
            student: studentId,
            isActive: true,
            status: 'in_progress',
            expiresAt: { $gt: new Date() },
        }).lean();
        const activeSessionMap = new Set(activeSessions.map(s => s.exam.toString()));

        const enriched = exams
            .map(e => {
                const examKey = e._id!.toString();
                const result = resultMap.get(examKey);
                const attempts = Math.max(
                    Number(attemptCountMap.get(examKey) || 0),
                    Number(externalAttemptCountMap.get(examKey) || 0),
                );
                const accessControl = (e.accessControl && typeof e.accessControl === 'object')
                    ? (e.accessControl as Record<string, unknown>)
                    : {};
                const requiredUserIds = normalizeObjectIdArray(accessControl.allowedUserIds);
                const requiredGroupIds = normalizeObjectIdArray(accessControl.allowedGroupIds);
                const requiredPlanCodes = toStringArray(accessControl.allowedPlanCodes).map((code) => code.toLowerCase());
                const subscriptionRequired = Boolean((e as Record<string, unknown>).subscriptionRequired) || Boolean((e as Record<string, unknown>).requiresActiveSubscription) || requiredPlanCodes.length > 0;
                const userDenied = requiredUserIds.length > 0 && !requiredUserIds.includes(studentId);
                const groupDenied = requiredGroupIds.length > 0 && !hasAnyIntersection(requiredGroupIds, studentGroupIds);
                // New visibility mode check (Phase 12)
                const visibilityMode = String((e as Record<string, unknown>).visibilityMode || 'all_students');
                const targetGroupIds = normalizeObjectIdArray((e as Record<string, unknown>).targetGroupIds);
                const visibilityGroupDenied = (visibilityMode === 'group_only' || visibilityMode === 'custom')
                    && targetGroupIds.length > 0
                    && !hasAnyIntersection(targetGroupIds, studentGroupIds);
                const planDenied = requiredPlanCodes.length > 0 && !requiredPlanCodes.includes(studentPlanCode);
                const subscriptionDenied = subscriptionRequired && !hasActiveSubscription;
                const specificModeDenied = (
                    e.accessMode === 'specific' &&
                    !e.allowedUsers.some((uid: mongoose.Types.ObjectId) => uid.toString() === studentId)
                );
                // Keep strict identity/group restrictions hidden from list responses.
                if (specificModeDenied || userDenied || groupDenied || visibilityGroupDenied) {
                    return null;
                }
                const accessDeniedReason = planDenied
                    ? 'access_plan_restricted'
                    : subscriptionDenied
                        ? 'subscription_required'
                        : '';
                const paymentPendingForExam = subscriptionRequired && hasActiveSubscription && pendingDueAmount > 0;
                let status: string;
                if (result) {
                    status = 'completed';
                } else if (paymentPendingForExam || Boolean(accessDeniedReason)) {
                    status = 'locked';
                } else if (now < new Date(e.startDate)) {
                    status = 'upcoming';
                } else if (now > new Date(e.endDate)) {
                    status = 'completed_window';
                } else {
                    status = activeSessionMap.has(e._id!.toString()) ? 'in_progress' : 'active';
                }
                return {
                    ...e,
                    status,
                    submissionStatus: result
                        ? (isExamResultPublished(e as Record<string, unknown>, now)
                            ? 'published'
                            : ((result as Record<string, unknown>).status === 'evaluated' ? 'graded' : 'submitted'))
                        : (activeSessionMap.has(e._id!.toString()) ? 'pending_review' : undefined),
                    attemptsUsed: attempts,
                    attemptsLeft: Math.max(0, e.attemptLimit - attempts),
                    paymentPending: paymentPendingForExam,
                    subscriptionRequired,
                    subscriptionActive: hasActiveSubscription,
                    accessDeniedReason: accessDeniedReason || undefined,
                    canTakeExam: !paymentPendingForExam && !accessDeniedReason,
                    myResult: result ? {
                        obtainedMarks: Number(result.obtainedMarks || 0),
                        percentage: Number(result.percentage || 0),
                        rank: Number(result.rank || 0) || undefined,
                    } : null,
                    resultPublishMode: getResultPublishMode(e as Record<string, unknown>),
                    resultPublished: isExamResultPublished(e as Record<string, unknown>, now),
                };
            })
            .filter((exam) => exam !== null);

        ResponseBuilder.send(res, 200, ResponseBuilder.success({ exams: enriched, subscriptionActive: hasActiveSubscription }));
    } catch (err) {
        console.error('getStudentExams error:', err);
        ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', 'Server error'));
    }
}

type PublicExamLockReason = 'none' | 'login_required' | 'subscription_required' | 'group_restricted' | 'plan_restricted';

type PublicExamListItem = {
    id: string;
    serialNo: number;
    title: string;
    title_bn?: string;
    subject: string;
    examCategory: string;
    bannerImageUrl: string;
    startDate: string;
    endDate: string;
    durationMinutes: number;
    status: 'live' | 'upcoming' | 'ended';
    deliveryMode: 'internal' | 'external_link';
    isLocked: boolean;
    lockReason: PublicExamLockReason;
    canOpenDetails: boolean;
    canStart: boolean;
    joinUrl: string | null;
    contactAdmin: {
        phone: string;
        whatsapp: string;
        messageTemplate: string;
    };
    subscriptionRequired: boolean;
    paymentRequired: boolean;
    attemptLimit: number;
    allowReAttempt: boolean;
    myAttemptStatus?: 'not_started' | 'in_progress' | 'submitted';
};

function getExamTimeStatus(exam: Record<string, unknown>, now = new Date()): 'live' | 'upcoming' | 'ended' {
    const startDate = new Date(String(exam.startDate || ''));
    const endDate = new Date(String(exam.endDate || ''));
    if (!Number.isNaN(startDate.getTime()) && now < startDate) return 'upcoming';
    if (!Number.isNaN(endDate.getTime()) && now > endDate) return 'ended';
    return 'live';
}

function normalizePublicListStatusFilter(value: unknown): '' | 'live' | 'upcoming' | 'ended' {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'live' || normalized === 'upcoming' || normalized === 'ended') return normalized;
    return '';
}

function isAllExamCategoryToken(value: unknown): boolean {
    const normalized = String(value || '').trim().toLowerCase();
    return normalized === 'all' || normalized === 'all exams';
}

function findWhatsappUrl(socialLinks: unknown): string {
    if (!Array.isArray(socialLinks)) return '';
    for (const row of socialLinks) {
        const entry = row as Record<string, unknown>;
        if (entry.enabled === false) continue;
        const platform = String(entry.platform || '').trim().toLowerCase();
        if (platform === 'whatsapp') {
            return String(entry.url || '').trim();
        }
    }
    return '';
}

export async function getPublicExamList(req: AuthRequest, res: Response): Promise<void> {
    try {
        const now = new Date();
        const page = Math.max(1, Number(req.query.page || 1));
        const limit = Math.max(1, Math.min(100, Number(req.query.limit || 24)));
        const skip = (page - 1) * limit;
        const statusFilter = normalizePublicListStatusFilter(req.query.status);
        const paidFilter = String(req.query.paid || '').trim().toLowerCase();
        const categoryFilter = String(req.query.category || '').trim();
        const queryText = String(req.query.q || '').trim();

        const examQuery: Record<string, unknown> = { isPublished: true };
        if (categoryFilter && !isAllExamCategoryToken(categoryFilter)) {
            examQuery.group_category = categoryFilter;
        }
        if (queryText) {
            examQuery.$or = [
                { title: { $regex: queryText, $options: 'i' } },
                { title_bn: { $regex: queryText, $options: 'i' } },
                { subject: { $regex: queryText, $options: 'i' } },
                { subjectBn: { $regex: queryText, $options: 'i' } },
                { group_category: { $regex: queryText, $options: 'i' } },
            ];
        }

        const [exams, siteSettings] = await Promise.all([
            Exam.find(examQuery)
                .sort({ startDate: 1, createdAt: -1 })
                .select('title title_bn subject subjectBn bannerImageUrl startDate endDate duration deliveryMode externalExamUrl group_category accessMode allowedUsers accessControl attemptLimit subscriptionRequired isPublished')
                .lean(),
            SiteSettings.findOne().select('contactPhone socialLinks').lean(),
        ]);

        const examIds = exams.map((exam) => String(exam._id || '')).filter(Boolean);
        const contactPhone = String((siteSettings as Record<string, unknown> | null)?.contactPhone || '').trim();
        const whatsapp = findWhatsappUrl((siteSettings as Record<string, unknown> | null)?.socialLinks);

        let studentId = '';
        let isStudent = false;
        let studentGroupIds: string[] = [];
        let hasActiveSubscription = false;
        let studentPlanCode = '';
        let pendingDueAmount = 0;
        let attemptsMap = new Map<string, number>();
        let activeSessionMap = new Set<string>();

        if (req.user && req.user.role === 'student' && mongoose.Types.ObjectId.isValid(String(req.user._id || ''))) {
            studentId = String(req.user._id);
            isStudent = true;

            const [profile, user, dueLedger, resultRows, activeSessions] = await Promise.all([
                StudentProfile.findOne({ user_id: studentId }).select('groupIds').lean(),
                User.findById(studentId).select('subscription').lean(),
                StudentDueLedger.findOne({ studentId }).select('netDue').lean(),
                ExamResult.find({ student: studentId, exam: { $in: examIds } }).select('exam').lean(),
                ExamSession.find({
                    student: studentId,
                    exam: { $in: examIds },
                    isActive: true,
                    status: 'in_progress',
                    expiresAt: { $gt: now },
                }).select('exam').lean(),
            ]);
            const externalAttemptCountMap = await getExternalExamAttemptCountsForStudent(studentId, examIds);

            studentGroupIds = normalizeObjectIdArray(profile?.groupIds || []);
            pendingDueAmount = Number((dueLedger as { netDue?: number } | null)?.netDue || 0);
            const subscriptionSnapshot = await getCanonicalSubscriptionSnapshot(
                studentId,
                (user?.subscription as Record<string, unknown> | undefined),
            );
            studentPlanCode = subscriptionSnapshot.planCode;
            hasActiveSubscription = subscriptionSnapshot.isActive && subscriptionSnapshot.allowsExams !== false;

            attemptsMap = resultRows.reduce((map, row) => {
                const examId = String(row.exam || '');
                map.set(examId, (map.get(examId) || 0) + 1);
                return map;
            }, new Map<string, number>());
            for (const [examId, count] of externalAttemptCountMap.entries()) {
                attemptsMap.set(examId, Math.max(Number(attemptsMap.get(examId) || 0), Number(count || 0)));
            }

            activeSessionMap = new Set(activeSessions.map((row) => String(row.exam || '')).filter(Boolean));
        }

        const cards = exams
            .map((exam, index) => {
                const examRecord = exam as Record<string, unknown>;
                const examId = String(exam._id || '');
                const timeStatus = getExamTimeStatus(examRecord, now);
                const accessControl = (exam.accessControl && typeof exam.accessControl === 'object')
                    ? (exam.accessControl as Record<string, unknown>)
                    : {};
                const requiredUserIds = normalizeObjectIdArray(accessControl.allowedUserIds);
                const requiredGroupIds = normalizeObjectIdArray(accessControl.allowedGroupIds);
                const requiredPlanCodes = toStringArray(accessControl.allowedPlanCodes).map((code) => code.toLowerCase());
                const visibilityMode = String((exam as Record<string, unknown>).visibilityMode || 'all_students');
                const targetGroupIds = normalizeObjectIdArray((exam as Record<string, unknown>).targetGroupIds);
                const subscriptionRequired = Boolean((exam as Record<string, unknown>).subscriptionRequired)
                    || Boolean((exam as Record<string, unknown>).requiresActiveSubscription)
                    || visibilityMode === 'subscription_only'
                    || requiredPlanCodes.length > 0;
                const paymentRequired = subscriptionRequired;
                const attemptsUsed = Number(attemptsMap.get(examId) || 0);
                const attemptLimit = Math.max(1, Number(exam.attemptLimit || 1));
                const attemptsLeft = Math.max(0, attemptLimit - attemptsUsed);
                const specificModeRestricted = String(exam.accessMode || 'all') === 'specific';
                const specificModeDenied = (
                    specificModeRestricted &&
                    Array.isArray(exam.allowedUsers) &&
                    !exam.allowedUsers.some((id: unknown) => String(id) === studentId)
                );
                const hasGroupScopedVisibility = (visibilityMode === 'group_only' || visibilityMode === 'custom') && targetGroupIds.length > 0;
                const hiddenFromPublic = !isStudent && (
                    specificModeRestricted ||
                    requiredUserIds.length > 0 ||
                    requiredGroupIds.length > 0 ||
                    hasGroupScopedVisibility
                );
                if (hiddenFromPublic) {
                    return null;
                }

                let lockReason: PublicExamLockReason = 'none';
                if (!isStudent) {
                    lockReason = 'login_required';
                } else {
                    const userDenied = requiredUserIds.length > 0 && !requiredUserIds.includes(studentId);
                    const groupDenied = requiredGroupIds.length > 0 && !hasAnyIntersection(requiredGroupIds, studentGroupIds);
                    const visibilityGroupDenied = (visibilityMode === 'group_only' || visibilityMode === 'custom')
                        && targetGroupIds.length > 0
                        && !hasAnyIntersection(targetGroupIds, studentGroupIds);
                    const groupRestricted = userDenied || groupDenied || specificModeDenied || visibilityGroupDenied;
                    if (groupRestricted) {
                        return null;
                    }
                    const planDenied = requiredPlanCodes.length > 0 && !requiredPlanCodes.includes(studentPlanCode);
                    const subscriptionDenied = subscriptionRequired && !hasActiveSubscription && !planDenied;
                    const paymentPending = paymentRequired && hasActiveSubscription && pendingDueAmount > 0;

                    if (planDenied) lockReason = 'plan_restricted';
                    else if (subscriptionDenied || paymentPending) lockReason = 'subscription_required';
                }

                const canOpenDetails = lockReason === 'none';
                const canStart = canOpenDetails && timeStatus === 'live' && attemptsLeft > 0;
                const messageTemplate = `I want to access exam "${String(exam.title || 'Exam')}".`;
                const inProgress = activeSessionMap.has(examId);
                const deliveryMode: PublicExamListItem['deliveryMode'] = String(exam.deliveryMode || 'internal') === 'external_link'
                    ? 'external_link'
                    : 'internal';
                const myAttemptStatus: PublicExamListItem['myAttemptStatus'] = !isStudent
                    ? undefined
                    : attemptsUsed > 0
                        ? 'submitted'
                        : inProgress
                            ? 'in_progress'
                            : 'not_started';

                return {
                    id: examId,
                    serialNo: index + 1,
                    title: String(exam.title || ''),
                    title_bn: String((exam as Record<string, unknown>).title_bn || ''),
                    subject: String(exam.subject || ''),
                    examCategory: String((exam as Record<string, unknown>).group_category || 'General'),
                    bannerImageUrl: String(exam.bannerImageUrl || ''),
                    startDate: new Date(String(exam.startDate || now.toISOString())).toISOString(),
                    endDate: new Date(String(exam.endDate || now.toISOString())).toISOString(),
                    durationMinutes: Number(exam.duration || 0),
                    status: timeStatus,
                    deliveryMode,
                    isLocked: lockReason !== 'none',
                    lockReason,
                    canOpenDetails,
                    canStart,
                    joinUrl: canOpenDetails ? `/exam/${examId}` : null,
                    contactAdmin: {
                        phone: contactPhone,
                        whatsapp,
                        messageTemplate,
                    },
                    subscriptionRequired,
                    paymentRequired,
                    attemptLimit,
                    allowReAttempt: attemptLimit > 1,
                    myAttemptStatus,
                };
            })
            .filter((card) => card !== null) as PublicExamListItem[];
        const filteredCards = cards
            .filter((card) => {
                if (statusFilter && card.status !== statusFilter) return false;
                if (paidFilter === 'paid' && !card.paymentRequired) return false;
                if (paidFilter === 'free' && card.paymentRequired) return false;
                return true;
            });

        const items = filteredCards.slice(skip, skip + limit).map((item, idx) => ({
            ...item,
            serialNo: skip + idx + 1,
        }));

        ResponseBuilder.send(res, 200, ResponseBuilder.success({
            items,
            page,
            limit,
            total: filteredCards.length,
            pages: Math.max(1, Math.ceil(filteredCards.length / limit)),
            serverNow: now.toISOString(),
        }));
    } catch (err) {
        console.error('getPublicExamList error:', err);
        ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', 'Server error'));
    }
}

type ExamLandingCardStatus = 'upcoming' | 'live' | 'past' | 'in_progress' | 'locked';

type ExamLandingCard = {
    _id: string;
    title: string;
    description?: string;
    subject?: string;
    subjectBn?: string;
    universityNameBn?: string;
    duration: number;
    totalQuestions: number;
    totalMarks: number;
    startDate: Date;
    endDate: Date;
    bannerImageUrl?: string;
    logoUrl?: string;
    group_category?: string;
    tags: string[];
    share_link?: string;
    shareUrl?: string;
    groupName?: string;
    statusBadge: 'Upcoming' | 'Live' | 'Completed' | 'Locked' | 'In Progress';
    totalParticipants: number;
    attemptedUsers: number;
    remainingUsers: number;
    activeUsers: number;
    status: ExamLandingCardStatus;
    timeBucket: 'upcoming' | 'live' | 'past';
    attemptsUsed: number;
    attemptsLeft: number;
    attemptLimit: number;
    resultPublished: boolean;
    resultPublishMode: 'immediate' | 'manual' | 'scheduled';
    featured: boolean;
    paymentPending: boolean;
};

function getExamLandingStatusBadge(status: ExamLandingCardStatus, timeBucket: 'upcoming' | 'live' | 'past'): 'Upcoming' | 'Live' | 'Completed' | 'Locked' | 'In Progress' {
    if (status === 'locked') return 'Locked';
    if (status === 'in_progress') return 'In Progress';
    if (timeBucket === 'live') return 'Live';
    if (timeBucket === 'upcoming') return 'Upcoming';
    return 'Completed';
}

function normalizeExamLandingStatus(value: unknown): string {
    const normalized = String(value || '').trim().toLowerCase();
    if (['upcoming', 'live', 'past', 'in_progress', 'locked', 'all'].includes(normalized)) {
        return normalized;
    }
    return '';
}

function getTimeBucket(exam: Record<string, unknown>, now = new Date()): 'upcoming' | 'live' | 'past' {
    const startDate = new Date(String(exam.startDate || ''));
    const endDate = new Date(String(exam.endDate || ''));
    if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return 'past';
    if (now < startDate) return 'upcoming';
    if (now > endDate) return 'past';
    return 'live';
}

export async function getExamLanding(req: AuthRequest, res: Response): Promise<void> {
    try {
        const studentId = req.user!._id;
        const groupFilter = String(req.query.group || '').trim();
        const tagFilter = String(req.query.tag || '').trim().toLowerCase();
        const search = String(req.query.search || '').trim();
        const statusFilter = normalizeExamLandingStatus(req.query.status);
        const page = Math.max(1, Number(req.query.page || 1));
        const limit = Math.max(1, Math.min(100, Number(req.query.limit || 20)));
        const skip = (page - 1) * limit;

        const examFilter: Record<string, unknown> = { isPublished: true };
        if (groupFilter) {
            examFilter.group_category = { $regex: `^${groupFilter}$`, $options: 'i' };
        }
        if (search) {
            examFilter.$or = [
                { title: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
                { subject: { $regex: search, $options: 'i' } },
                { subjectBn: { $regex: search, $options: 'i' } },
            ];
        }

        const now = new Date();
        const exams = await Exam.find(examFilter).sort({ startDate: 1 }).lean();
        const examIds = exams.map((exam) => String(exam._id || '')).filter(Boolean);

        const [profile, user, results, activeSessions, metricsMap, dueLedger] = await Promise.all([
            StudentProfile.findOne({ user_id: studentId }).select('groupIds').lean(),
            User.findById(studentId).select('subscription').lean(),
            ExamResult.find({ student: studentId, exam: { $in: examIds } })
                .sort({ submittedAt: -1 })
                .lean(),
            ExamSession.find({ student: studentId, isActive: true, exam: { $in: examIds } })
                .select('exam')
                .lean(),
            getExamCardMetrics(exams as unknown as Record<string, unknown>[]),
            StudentDueLedger.findOne({ studentId }).select('netDue').lean(),
        ]);
        const externalAttemptCountMap = await getExternalExamAttemptCountsForStudent(studentId, examIds);
        const pendingDueAmount = Number((dueLedger as { netDue?: number } | null)?.netDue || 0);
        const subscriptionSnapshot = await getCanonicalSubscriptionSnapshot(
            studentId,
            (user?.subscription as Record<string, unknown> | undefined),
        );

        const studentGroupIds = normalizeObjectIdArray(profile?.groupIds || []);
        const studentPlanCode = subscriptionSnapshot.planCode;

        const attemptCountByExam = new Map<string, number>();
        for (const result of results) {
            const examKey = String(result.exam || '');
            attemptCountByExam.set(examKey, (attemptCountByExam.get(examKey) || 0) + 1);
        }
        for (const [examId, count] of externalAttemptCountMap.entries()) {
            attemptCountByExam.set(examId, Math.max(Number(attemptCountByExam.get(examId) || 0), Number(count || 0)));
        }

        const activeSessionExamIds = new Set(
            activeSessions.map((session) => String(session.exam || '')).filter(Boolean),
        );

        const cards: ExamLandingCard[] = exams
            .map((exam) => {
                const examRecord = exam as unknown as Record<string, unknown>;
                const examId = String(exam._id || '');
                const accessControl = (exam.accessControl && typeof exam.accessControl === 'object')
                    ? (exam.accessControl as Record<string, unknown>)
                    : {};
                const requiredUserIds = normalizeObjectIdArray(accessControl.allowedUserIds);
                const requiredGroupIds = normalizeObjectIdArray(accessControl.allowedGroupIds);
                const requiredPlanCodes = toStringArray(accessControl.allowedPlanCodes).map((code) => code.toLowerCase());
                const userAllowed = requiredUserIds.length === 0 || requiredUserIds.includes(studentId);
                const groupAllowed = requiredGroupIds.length === 0 || hasAnyIntersection(requiredGroupIds, studentGroupIds);
                const planAllowed = requiredPlanCodes.length === 0 || requiredPlanCodes.includes(studentPlanCode);
                const isPaymentPending = requiredPlanCodes.length > 0 && pendingDueAmount > 0;
                const assignedAllowed = canAccessExamSync(examRecord, studentId);

                // Visibility-mode group restriction (new model)
                const visibilityMode = String(examRecord.visibilityMode || 'all_students');
                const targetGroupIds = normalizeObjectIdArray(examRecord.targetGroupIds || []);
                const visibilityGroupDenied = (visibilityMode === 'group_only' || visibilityMode === 'custom')
                    && targetGroupIds.length > 0
                    && !hasAnyIntersection(targetGroupIds, studentGroupIds);

                const strictAccessDenied = !userAllowed || !groupAllowed || !planAllowed || !assignedAllowed || visibilityGroupDenied;
                if (strictAccessDenied) {
                    return null;
                }
                const accessDenied = isPaymentPending;

                const attemptsUsed = Number(attemptCountByExam.get(examId) || 0);
                const attemptLimit = Number(exam.attemptLimit || 1);
                const attemptsLeft = Math.max(0, attemptLimit - attemptsUsed);
                const timeBucket = getTimeBucket(examRecord, now);
                const inProgress = activeSessionExamIds.has(examId);
                const locked = accessDenied || attemptsLeft <= 0;

                let status: ExamLandingCardStatus;
                if (locked) status = 'locked';
                else if (inProgress) status = 'in_progress';
                else if (timeBucket === 'live') status = 'live';
                else if (timeBucket === 'upcoming') status = 'upcoming';
                else status = 'past';
                const metrics = metricsMap.get(examId) || {
                    examId,
                    totalParticipants: 0,
                    attemptedUsers: 0,
                    remainingUsers: 0,
                    activeUsers: 0,
                };
                const groupName = String((exam as Record<string, unknown>).group_category || 'Custom');

                const tags = [
                    ...toStringArray((exam as Record<string, unknown>).subjects),
                    ...toStringArray((exam as Record<string, unknown>).chapters),
                ]
                    .map((tag) => tag.toLowerCase())
                    .filter(Boolean);

                return {
                    _id: examId,
                    title: String(exam.title || ''),
                    description: String(exam.description || ''),
                    subject: String(exam.subject || ''),
                    subjectBn: String(exam.subjectBn || ''),
                    universityNameBn: String(exam.universityNameBn || ''),
                    duration: Number(exam.duration || 0),
                    totalQuestions: Number(exam.totalQuestions || 0),
                    totalMarks: Number(exam.totalMarks || 0),
                    startDate: new Date(String(exam.startDate || now.toISOString())),
                    endDate: new Date(String(exam.endDate || now.toISOString())),
                    bannerImageUrl: String(exam.bannerImageUrl || ''),
                    logoUrl: String(exam.logoUrl || ''),
                    group_category: groupName,
                    groupName,
                    tags,
                    share_link: String((exam as Record<string, unknown>).share_link || ''),
                    shareUrl: (exam as Record<string, unknown>).share_link ? `/exam/take/${String((exam as Record<string, unknown>).share_link)}` : '',
                    statusBadge: getExamLandingStatusBadge(status, timeBucket),
                    totalParticipants: Number(metrics.totalParticipants || 0),
                    attemptedUsers: Number(metrics.attemptedUsers || 0),
                    remainingUsers: Number(metrics.remainingUsers || 0),
                    activeUsers: Number(metrics.activeUsers || 0),
                    status,
                    timeBucket,
                    attemptsUsed,
                    attemptsLeft,
                    attemptLimit,
                    resultPublished: isExamResultPublished(examRecord, now),
                    resultPublishMode: getResultPublishMode(examRecord),
                    featured: Boolean((exam as Record<string, unknown>).isFeatured),
                    paymentPending: isPaymentPending,
                } as ExamLandingCard;
            })
            .filter((card): card is ExamLandingCard => card !== null);

        const filteredCards = cards.filter((card) => {
            if (tagFilter && !card.tags.some((tag) => tag.includes(tagFilter))) return false;
            if (!statusFilter || statusFilter === 'all') return true;
            if (statusFilter === 'upcoming' || statusFilter === 'live' || statusFilter === 'past') {
                return card.timeBucket === statusFilter;
            }
            return card.status === statusFilter;
        });

        const cardsToUse = filteredCards;

        const groupedByTime = {
            upcoming: cardsToUse.filter((card) => card.timeBucket === 'upcoming'),
            live: cardsToUse.filter((card) => card.timeBucket === 'live'),
            past: cardsToUse.filter((card) => card.timeBucket === 'past'),
        };

        const groupedByCategory = cardsToUse.reduce<Record<string, ExamLandingCard[]>>((acc, card) => {
            const key = card.group_category || 'Custom';
            if (!acc[key]) acc[key] = [];
            acc[key].push(card);
            return acc;
        }, {});

        const items = cardsToUse.slice(skip, skip + limit);
        const featured = cardsToUse.filter((card) => card.featured).slice(0, 10);

        ResponseBuilder.send(res, 200, ResponseBuilder.success({
            items,
            exams: items,
            total: cardsToUse.length,
            page,
            limit,
            pages: Math.ceil(cardsToUse.length / limit),
            featured,
            grouped: {
                byTime: groupedByTime,
                byCategory: groupedByCategory,
            },
            serverNow: now.toISOString(),
        }));
    } catch (err) {
        console.error('getExamLanding error:', err);
        ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', 'Server error'));
    }
}

function canAccessExamSync(exam: Record<string, unknown>, userId: string): boolean {
    if (exam.accessMode === 'specific') {
        const allowedUsers = exam.allowedUsers as mongoose.Types.ObjectId[];
        return allowedUsers.some(id => id.toString() === userId);
    }
    return true;
}

type EligibilitySummary = {
    eligible: boolean;
    reasons: string[];
    profileComplete: boolean;
    requiredProfileCompletion: number;
    currentProfileCompletion: number;
    subscriptionRequired: boolean;
    subscriptionActive: boolean;
    paymentRequired: boolean;
    paymentCleared: boolean;
    pendingDueAmount: number;
    attemptsUsed: number;
    attemptsLeft: number;
    windowOpen: boolean;
    accessAllowed: boolean;
    accessDeniedReason?: string;
};

async function ensurePendingExamPaymentRecord(examId: string, studentId: string, pendingDueAmount: number): Promise<void> {
    if (!mongoose.Types.ObjectId.isValid(examId) || !mongoose.Types.ObjectId.isValid(studentId)) return;
    const existing = await ManualPayment.findOne({
        studentId,
        examId,
        entryType: 'exam_fee',
        status: { $in: ['pending', 'paid'] },
    }).lean();
    if (existing) return;

    await ManualPayment.create({
        studentId,
        examId,
        amount: Math.max(0, Number(pendingDueAmount || 0)),
        currency: 'BDT',
        method: 'manual',
        status: 'pending',
        transactionId: '',
        reference: '',
        proofFileUrl: '',
        proofUrl: '',
        notes: 'Auto-created pending exam payment record',
        entryType: 'exam_fee',
        date: new Date(),
        recordedBy: new mongoose.Types.ObjectId(studentId),
    });
}

export async function getEligibilitySummary(exam: Record<string, unknown>, studentId: string): Promise<EligibilitySummary> {
    const examId = String(exam._id || '');
    const [subscriptionState, profile, threshold, resultAttemptsUsed, externalAttemptsUsed, user, dueLedger, examPayment] = await Promise.all([
        verifySubscription(studentId),
        StudentProfile.findOne({ user_id: studentId }).select('profile_completion_percentage groupIds').lean(),
        getProfileCompletionThreshold(),
        ExamResult.countDocuments({ exam: examId, student: studentId }),
        getExternalExamAttemptCount(examId, studentId),
        User.findById(studentId).select('subscription').lean(),
        StudentDueLedger.findOne({ studentId }).select('netDue').lean(),
        mongoose.Types.ObjectId.isValid(examId)
            ? ManualPayment.findOne({ studentId, examId, entryType: 'exam_fee' }).sort({ createdAt: -1 }).lean()
            : Promise.resolve(null),
    ]);
    const attemptsUsed = Math.max(Number(resultAttemptsUsed || 0), Number(externalAttemptsUsed || 0));

    const reasons: string[] = [];
    const currentProfileCompletion = Number(profile?.profile_completion_percentage || 0);
    const profileComplete = currentProfileCompletion >= threshold;
    if (!profileComplete) {
        reasons.push('profile_incomplete');
    }

    const attemptLimit = Number(exam.attemptLimit || 1);
    const attemptsLeft = Math.max(0, attemptLimit - attemptsUsed);
    if (attemptsLeft <= 0) {
        reasons.push('attempt_limit_reached');
    }

    const examStart = new Date(String(exam.startDate || ''));
    const examEnd = new Date(String(exam.endDate || ''));
    const windowOpen = !Number.isNaN(examStart.getTime()) &&
        !Number.isNaN(examEnd.getTime()) &&
        Date.now() >= examStart.getTime() &&
        Date.now() <= examEnd.getTime();
    if (!windowOpen) {
        reasons.push('outside_exam_window');
    }

    let accessAllowed = true;
    if (!canAccessExamSync(exam, studentId)) {
        accessAllowed = false;
        reasons.push('not_assigned');
    }

    const accessControl = (exam.accessControl && typeof exam.accessControl === 'object'
        ? (exam.accessControl as Record<string, unknown>)
        : {}) as Record<string, unknown>;
    const requiredUserIds = normalizeObjectIdArray(accessControl.allowedUserIds);
    const requiredGroupIds = normalizeObjectIdArray(accessControl.allowedGroupIds);
    const requiredPlanCodes = toStringArray(accessControl.allowedPlanCodes).map((code) => code.toLowerCase());
    const subscriptionRequired = Boolean(exam.subscriptionRequired) || requiredPlanCodes.length > 0;
    const studentGroupIds = normalizeObjectIdArray(profile?.groupIds || []);
    const subscriptionSnapshot = await getCanonicalSubscriptionSnapshot(
        studentId,
        (user?.subscription as Record<string, unknown> | undefined),
    );
    const studentPlanCode = subscriptionSnapshot.planCode;

    let accessDeniedReason = '';
    if (requiredUserIds.length > 0 && !requiredUserIds.includes(studentId)) {
        accessAllowed = false;
        reasons.push('access_user_restricted');
        accessDeniedReason = 'access_user_restricted';
    }
    if (requiredGroupIds.length > 0 && !hasAnyIntersection(requiredGroupIds, studentGroupIds)) {
        accessAllowed = false;
        reasons.push('access_group_restricted');
        if (!accessDeniedReason) accessDeniedReason = 'access_group_restricted';
    }
    if (requiredPlanCodes.length > 0 && !requiredPlanCodes.includes(studentPlanCode)) {
        accessAllowed = false;
        reasons.push('access_plan_restricted');
        if (!accessDeniedReason) accessDeniedReason = 'access_plan_restricted';
    } else if (subscriptionRequired && !subscriptionState.allowed) {
        accessAllowed = false;
        reasons.push(`subscription_${subscriptionState.reason || 'inactive'}`);
        if (!accessDeniedReason) accessDeniedReason = 'subscription_required';
    }

    // Visibility-mode group restriction (new model)
    const visibilityMode = String(exam.visibilityMode || 'all_students');
    if (visibilityMode === 'group_only' || visibilityMode === 'custom') {
        const targetGroupIds = normalizeObjectIdArray(exam.targetGroupIds || []);
        if (targetGroupIds.length > 0 && !hasAnyIntersection(targetGroupIds, studentGroupIds)) {
            accessAllowed = false;
            reasons.push('visibility_group_restricted');
            if (!accessDeniedReason) accessDeniedReason = 'visibility_group_restricted';
        }
    }

    // Visibility-mode subscription restriction
    if ((visibilityMode === 'subscription_only' || exam.requiresActiveSubscription) && !subscriptionState.allowed) {
        if (!reasons.includes(`subscription_${subscriptionState.reason || 'inactive'}`)) {
            accessAllowed = false;
            reasons.push(`subscription_${subscriptionState.reason || 'inactive'}`);
            if (!accessDeniedReason) accessDeniedReason = 'subscription_required';
        }
    }

    const paymentRequired = subscriptionRequired && subscriptionState.allowed;
    const pendingDueAmount = Number((dueLedger as { netDue?: number } | null)?.netDue || 0);
    const examPaymentStatus = String((examPayment as { status?: string } | null)?.status || '').trim().toLowerCase();
    const paymentCleared = !paymentRequired || examPaymentStatus === 'paid' || pendingDueAmount <= 0;
    if (paymentRequired && !paymentCleared) {
        await ensurePendingExamPaymentRecord(examId, studentId, pendingDueAmount);
    }
    if (!paymentCleared) {
        reasons.push('payment_pending');
    }

    const eligible = reasons.length === 0;
    return {
        eligible,
        reasons,
        profileComplete,
        requiredProfileCompletion: threshold,
        currentProfileCompletion,
        subscriptionRequired,
        subscriptionActive: subscriptionState.allowed,
        paymentRequired,
        paymentCleared,
        pendingDueAmount,
        attemptsUsed,
        attemptsLeft,
        windowOpen,
        accessAllowed,
        accessDeniedReason: accessDeniedReason || undefined,
    };
}

async function getProfileCompletionThreshold(): Promise<number> {
    const security = await getSecurityConfig(true);
    if (security.examProtection.requireProfileScoreForExam) {
        return Number(security.examProtection.profileScoreThreshold || 70);
    }
    const config = await StudentDashboardConfig.findOne().select('profileCompletionThreshold').lean();
    return Number(config?.profileCompletionThreshold || 70);
}

function getDeviceFingerprint(userAgent: string, ipAddress: string): string {
    return crypto.createHash('sha256').update(`${userAgent}::${ipAddress}`).digest('hex');
}

function makeSeededRng(seed: number): () => number {
    let value = seed >>> 0;
    return () => {
        value += 0x6D2B79F5;
        let t = value;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function seededShuffle<T>(items: T[], seedText: string): T[] {
    const seed = Array.from(seedText).reduce((acc, ch) => acc + ch.charCodeAt(0), 0) || 1;
    const rng = makeSeededRng(seed);
    const arr = [...items];
    for (let i = arr.length - 1; i > 0; i -= 1) {
        const j = Math.floor(rng() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

type NormalizedIncomingAnswer = {
    questionId: string;
    selectedAnswer?: string;
    writtenAnswerUrl?: string;
    updatedAtUTC?: Date;
};

type NormalizedCheatFlag = {
    reason: string;
    timestamp: Date;
};

type AnswerConstraintViolation = {
    reason: string;
    questionId: string;
    limit: number;
    attempted: number;
};

type AttemptEventType = 'save' | 'tab_switch' | 'fullscreen_exit' | 'copy_attempt' | 'submit' | 'error' | 'resume';
const ATTEMPT_EVENT_TYPES = new Set<AttemptEventType>([
    'save',
    'tab_switch',
    'fullscreen_exit',
    'copy_attempt',
    'submit',
    'error',
    'resume',
]);

type ViolationAction = 'warn' | 'submit' | 'lock';

function parseAttemptRevision(input: unknown): number | null {
    if (input === undefined || input === null || input === '') return null;
    const parsed = Number(input);
    if (!Number.isFinite(parsed) || parsed < 0) return null;
    return Math.floor(parsed);
}

function resolveSubmissionType(input: unknown, isAutoSubmit: boolean): 'manual' | 'auto_timeout' | 'auto_expired' | 'forced' {
    const value = String(input || '').trim().toLowerCase();
    if (value === 'manual' || value === 'auto_timeout' || value === 'auto_expired' || value === 'forced') {
        return value;
    }
    return isAutoSubmit ? 'auto_timeout' : 'manual';
}

function resolveViolationAction(
    policiesInput: Record<string, unknown> | null | undefined,
): ViolationAction {
    const policies = policiesInput || {};
    const actionRaw = String(policies.violation_action || '').trim().toLowerCase();
    if (actionRaw === 'warn' || actionRaw === 'submit' || actionRaw === 'lock') {
        return actionRaw;
    }
    if (Boolean(policies.auto_submit_on_violation)) {
        return 'submit';
    }
    return 'warn';
}

function getResultPublishMode(exam: Record<string, unknown>): 'immediate' | 'manual' | 'scheduled' {
    const mode = String(exam.resultPublishMode || '').trim().toLowerCase();
    if (mode === 'immediate' || mode === 'manual' || mode === 'scheduled') {
        return mode;
    }
    return 'scheduled';
}

function isExamResultPublished(exam: Record<string, unknown>, now = new Date()): boolean {
    const mode = getResultPublishMode(exam);
    if (mode === 'immediate') return true;
    const publishDateRaw = exam.resultPublishDate;
    const publishDate = publishDateRaw ? new Date(String(publishDateRaw)) : null;
    if (!publishDate || Number.isNaN(publishDate.getTime())) return false;
    return now >= publishDate;
}

function toStringArray(input: unknown): string[] {
    if (!Array.isArray(input)) return [];
    return input
        .map((value) => String(value || '').trim())
        .filter(Boolean);
}

function normalizeObjectIdArray(input: unknown): string[] {
    if (!Array.isArray(input)) return [];
    return input
        .map((value) => {
            if (!value) return '';
            if (typeof value === 'string') return value;
            if (typeof value === 'object' && '_id' in (value as Record<string, unknown>)) {
                return String((value as Record<string, unknown>)._id || '');
            }
            return String(value);
        })
        .map((value) => value.trim())
        .filter(Boolean);
}

function normalizeObjectIdParam(value: unknown): string {
    const normalized = String(value || '').trim();
    if (!normalized || normalized === 'null' || normalized === 'undefined') return '';
    return mongoose.Types.ObjectId.isValid(normalized) ? normalized : '';
}

function hasAnyIntersection(left: string[], right: string[]): boolean {
    if (left.length === 0 || right.length === 0) return false;
    const rightSet = new Set(right);
    return left.some((entry) => rightSet.has(entry));
}

function getRequestUserAgent(req: AuthRequest): string {
    return String(req.headers['user-agent'] || '');
}

function getRequestIp(req: AuthRequest): string {
    const headers = req.headers || {};
    const fwd = headers['x-forwarded-for'];
    const fromForwarded = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0];
    const fromSocket = req.socket?.remoteAddress || (req as any).connection?.remoteAddress || '';
    return fromForwarded || fromSocket || '';
}

function mapExamSessionForClient(session: any, examId: string, studentId: string): Record<string, unknown> {
    return {
        sessionId: String(session._id),
        examId: String(session.exam || examId),
        userId: String(session.student || studentId),
        startedAt: session.startedAt,
        startedAtUTC: session.startedAt,
        expiresAt: session.expiresAt,
        expiresAtUTC: session.expiresAt,
        status: session.status,
        savedAnswers: session.answers || [],
        answers: (session.answers || []).map((answer: any) => ({
            questionId: String(answer.questionId || ''),
            selectedKey: String(answer.selectedAnswer || ''),
            selectedAnswer: String(answer.selectedAnswer || ''),
            updatedAtUTC: answer.savedAt || null,
            changeCount: Number(answer.changeCount || 0),
            writtenAnswerUrl: String(answer.writtenAnswerUrl || ''),
        })),
        attemptNo: Number(session.attemptNo || 1),
        attemptRevision: Number(session.attemptRevision || 0),
        sessionLocked: Boolean(session.sessionLocked),
        lockReason: String(session.lockReason || ''),
        violationsCount: Number(session.violationsCount || 0),
        tabSwitchCount: Number(session.tabSwitchCount || 0),
        deviceInfo: String(session.deviceInfo || ''),
        ip: String(session.ipAddress || ''),
        userAgent: String(session.userAgent || ''),
        serverNow: new Date().toISOString(),
    };
}

function normalizeIncomingAnswers(input: unknown): NormalizedIncomingAnswer[] {
    if (Array.isArray(input)) {
        return input
            .map((item) => {
                const row = item as Record<string, unknown>;
                const updatedAtRaw = String(row.updatedAtUTC || row.savedAt || '').trim();
                const updatedAt = updatedAtRaw ? new Date(updatedAtRaw) : undefined;
                return {
                    questionId: String(row.questionId || '').trim(),
                    selectedAnswer:
                        row.selectedAnswer !== undefined
                            ? String(row.selectedAnswer || '')
                            : row.selectedKey !== undefined
                                ? String(row.selectedKey || '')
                                : row.selectedOption !== undefined
                                    ? String(row.selectedOption || '')
                                    : undefined,
                    writtenAnswerUrl: row.writtenAnswerUrl !== undefined ? String(row.writtenAnswerUrl || '') : undefined,
                    updatedAtUTC: updatedAt && !Number.isNaN(updatedAt.getTime()) ? updatedAt : undefined,
                };
            })
            .filter((row) => row.questionId);
    }

    if (input && typeof input === 'object') {
        const answerObject = input as Record<string, unknown>;
        return Object.entries(answerObject)
            .map(([questionId, value]) => {
                if (typeof value === 'string') {
                    return { questionId, selectedAnswer: value };
                }
                const item = (value || {}) as Record<string, unknown>;
                const updatedAtRaw = String(item.updatedAtUTC || item.savedAt || '').trim();
                const updatedAt = updatedAtRaw ? new Date(updatedAtRaw) : undefined;
                return {
                    questionId,
                    selectedAnswer:
                        item.selectedAnswer !== undefined
                            ? String(item.selectedAnswer || '')
                            : item.selectedKey !== undefined
                                ? String(item.selectedKey || '')
                                : item.selectedOption !== undefined
                                    ? String(item.selectedOption || '')
                                    : undefined,
                    writtenAnswerUrl: item.writtenAnswerUrl !== undefined ? String(item.writtenAnswerUrl || '') : undefined,
                    updatedAtUTC: updatedAt && !Number.isNaN(updatedAt.getTime()) ? updatedAt : undefined,
                };
            })
            .filter((row) => row.questionId);
    }

    return [];
}

function normalizeCheatFlags(input: unknown): NormalizedCheatFlag[] {
    if (!Array.isArray(input)) return [];
    const now = new Date();
    return input
        .map((entry) => {
            if (!entry || typeof entry !== 'object') return null;
            const row = entry as Record<string, unknown>;
            const rawReason = String(row.reason || row.eventType || '').trim();
            if (!rawReason) return null;

            let reason = rawReason;
            if (rawReason === 'blur' || rawReason === 'tab_switch') {
                reason = 'background_focus_anomaly';
            }
            return {
                reason,
                timestamp: row.timestamp ? new Date(String(row.timestamp)) : now,
            };
        })
        .filter(Boolean) as NormalizedCheatFlag[];
}

function collectSelectionCount(answer: Record<string, unknown>): number {
    const history = Array.isArray(answer.answerHistory)
        ? answer.answerHistory.filter((h) => String((h as Record<string, unknown>).value || '').trim() !== '').length
        : 0;
    if (history > 0) return history;
    return String(answer.selectedAnswer || '').trim() ? 1 : 0;
}

function mergeAnswersWithConstraints({
    existingAnswers,
    incomingAnswers,
    answerEditLimitPerQuestion,
    maxAttemptSelectByQuestion,
    now,
}: {
    existingAnswers: Array<Record<string, unknown>>;
    incomingAnswers: NormalizedIncomingAnswer[];
    answerEditLimitPerQuestion?: number;
    maxAttemptSelectByQuestion: Map<string, number>;
    now: Date;
}): {
    mergedAnswers: Array<Record<string, unknown>>;
    violations: AnswerConstraintViolation[];
} {
    const answerMap = new Map<string, Record<string, unknown>>();
    for (const row of existingAnswers) {
        const questionId = String(row.questionId || '').trim();
        if (!questionId) continue;
        answerMap.set(questionId, {
            questionId,
            selectedAnswer: String(row.selectedAnswer || ''),
            writtenAnswerUrl: String(row.writtenAnswerUrl || ''),
            savedAt: row.savedAt ? new Date(String(row.savedAt)) : now,
            answerHistory: Array.isArray(row.answerHistory) ? row.answerHistory : [],
            changeCount: Number(row.changeCount || 0),
        });
    }

    const violations: AnswerConstraintViolation[] = [];
    const editLimit = Number(answerEditLimitPerQuestion);
    const enforceEditLimit = Number.isFinite(editLimit) && editLimit >= 0;

    for (const incoming of incomingAnswers) {
        const questionId = String(incoming.questionId || '').trim();
        if (!questionId) continue;

        const current = answerMap.get(questionId) || {
            questionId,
            selectedAnswer: '',
            writtenAnswerUrl: '',
            savedAt: now,
            answerHistory: [],
            changeCount: 0,
        };
        const incomingUpdatedAt = incoming.updatedAtUTC && !Number.isNaN(incoming.updatedAtUTC.getTime())
            ? incoming.updatedAtUTC
            : now;
        const currentSavedAt = current.savedAt ? new Date(String(current.savedAt)) : now;
        if (incomingUpdatedAt.getTime() < currentSavedAt.getTime()) {
            continue;
        }

        const prevSelected = String(current.selectedAnswer || '');
        const nextSelected = incoming.selectedAnswer !== undefined ? String(incoming.selectedAnswer || '') : prevSelected;
        const nextWritten = incoming.writtenAnswerUrl !== undefined
            ? String(incoming.writtenAnswerUrl || '')
            : String(current.writtenAnswerUrl || '');

        const selectedChanged = nextSelected !== prevSelected;
        const nextChangeCount = Number(current.changeCount || 0) + (selectedChanged && prevSelected !== '' ? 1 : 0);
        const selectionCount = collectSelectionCount(current);
        const nextSelectionCount = selectedChanged && nextSelected.trim()
            ? selectionCount + 1
            : selectionCount;

        if (enforceEditLimit && nextChangeCount > editLimit) {
            violations.push({
                reason: 'answer_edit_limit_exceeded',
                questionId,
                limit: editLimit,
                attempted: nextChangeCount,
            });
            continue;
        }

        const maxAttemptSelect = Number(maxAttemptSelectByQuestion.get(questionId) || 0);
        if (maxAttemptSelect > 0 && nextSelectionCount > maxAttemptSelect) {
            violations.push({
                reason: 'max_attempt_select_exceeded',
                questionId,
                limit: maxAttemptSelect,
                attempted: nextSelectionCount,
            });
            continue;
        }

        const nextHistory = selectedChanged
            ? [...(Array.isArray(current.answerHistory) ? current.answerHistory : []), { value: nextSelected, timestamp: incomingUpdatedAt }]
            : (Array.isArray(current.answerHistory) ? current.answerHistory : []);

        answerMap.set(questionId, {
            ...current,
            questionId,
            selectedAnswer: nextSelected,
            writtenAnswerUrl: nextWritten,
            savedAt: incomingUpdatedAt,
            answerHistory: nextHistory,
            changeCount: nextChangeCount,
        });
    }

    return {
        mergedAnswers: Array.from(answerMap.values()),
        violations,
    };
}

/* ── Schedule window helper ── */
function isWithinScheduleWindows(exam: typeof Exam.prototype): boolean {
    const now = new Date();
    // Legacy date range check
    if (now < exam.startDate || now > exam.endDate) return false;
    // If no advanced schedule windows, legacy check is sufficient
    if (!exam.scheduleWindows || exam.scheduleWindows.length === 0) return true;
    // Check at least one window matches
    const dayOfWeek = now.getUTCDay();
    return exam.scheduleWindows.some((w: { startDateTimeUTC: Date; endDateTimeUTC: Date; allowedDaysOfWeek?: number[] }) => {
        if (now < new Date(w.startDateTimeUTC) || now > new Date(w.endDateTimeUTC)) return false;
        if (w.allowedDaysOfWeek && w.allowedDaysOfWeek.length > 0 && !w.allowedDaysOfWeek.includes(dayOfWeek)) return false;
        return true;
    });
}

/* ─────── GET /api/exams/:id/details ─────── */
export async function getStudentExamDetails(req: AuthRequest, res: Response): Promise<void> {
    try {
        const studentId = req.user!._id;
        const examRef = String(req.params.id || '');
        const exam = mongoose.Types.ObjectId.isValid(examRef)
            ? await Exam.findById(examRef).lean()
            : await Exam.findOne({ share_link: examRef }).lean();
        if (!exam || !exam.isPublished) {
            ResponseBuilder.send(res, 404, ResponseBuilder.error('NOT_FOUND', 'Exam not found or unavailable'));
            return;
        }
        const examId = String(exam._id || '');

        const [eligibility, activeSession] = await Promise.all([
            getEligibilitySummary(exam as unknown as Record<string, unknown>, studentId),
            ExamSession.findOne({
                exam: examId,
                student: studentId,
                isActive: true,
                status: 'in_progress',
                expiresAt: { $gt: new Date() },
            }).lean(),
        ]);

        const detailLockedForAudience = !eligibility.accessAllowed
            || (eligibility.paymentRequired && !eligibility.paymentCleared);
        if (detailLockedForAudience) {
            ResponseBuilder.send(res, 403, ResponseBuilder.error('AUTHORIZATION_ERROR', 'You are not allowed to view this exam.',
                eligibility,));
            return;
        }

        ResponseBuilder.send(res, 200, ResponseBuilder.success({
            exam: {
                ...sanitizeExamForStudent(exam as unknown as typeof Exam.prototype),
                attemptLimit: Number(exam.attemptLimit || 1),
                autosave_interval_sec: Number((exam as any).autosave_interval_sec || 5),
                resultPublishMode: getResultPublishMode(exam as unknown as Record<string, unknown>),
                resultPublishDate: exam.resultPublishDate,
                reviewSettings: (exam as any).reviewSettings || {
                    showQuestion: true,
                    showSelectedAnswer: true,
                    showCorrectAnswer: true,
                    showExplanation: true,
                    showSolutionImage: true,
                },
                certificateSettings: (exam as any).certificateSettings || {
                    enabled: false,
                    minPercentage: 40,
                    passOnly: true,
                    templateVersion: 'v1',
                },
                require_instructions_agreement: Boolean((exam as any).require_instructions_agreement),
            },
            eligibility,
            hasActiveSession: !!activeSession,
            activeAttemptId: activeSession ? String(activeSession._id) : null,
            serverNow: new Date().toISOString(),
        }));
    } catch (err) {
        console.error('getStudentExamDetails error:', err);
        ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', 'Server error'));
    }
}

export async function getStudentExamById(req: AuthRequest, res: Response): Promise<void> {
    await getStudentExamDetails(req, res);
}

/* ─────── POST /api/exams/:id/start ─────── */
export async function startExam(req: AuthRequest, res: Response): Promise<void> {
    try {
        if (!req.user?._id) {
            ResponseBuilder.send(res, 401, ResponseBuilder.error('AUTHENTICATION_ERROR', 'Authentication required.'));
            return;
        }
        if (req.user.role !== 'student') {
            ResponseBuilder.send(res, 403, ResponseBuilder.error('AUTHORIZATION_ERROR', 'Student access only.'));
            return;
        }

        const studentId = req.user._id;
        const examRef = String(req.params.id || '');

        const user = await User.findById(studentId).lean();
        if (!user) { ResponseBuilder.send(res, 404, ResponseBuilder.error('NOT_FOUND', 'User not found.')); return; }

        const security = await getSecurityConfig(false);
        if (user.role === 'student' && security.panic.disableExamStarts) {
            ResponseBuilder.send(res, 423, ResponseBuilder.error('EXAM_STARTS_DISABLED', 'Exam starts are temporarily disabled by administrator policy.'));
            return;
        }

        if (user.role === 'student') {
            const [profile, threshold] = await Promise.all([
                StudentProfile.findOne({ user_id: studentId }).select('profile_completion_percentage').lean(),
                getProfileCompletionThreshold(),
            ]);
            const completion = Number(profile?.profile_completion_percentage || 0);
            if (completion < threshold) {
                ResponseBuilder.send(res, 403, ResponseBuilder.error('VALIDATION_ERROR', `Please complete at least ${threshold}% of your profile before accessing exams.`, {
                    profileIncomplete: true,
                    requiredCompletion: threshold,
                    currentCompletion: completion,
                }));
                return;
            }
        }

        const exam = mongoose.Types.ObjectId.isValid(examRef)
            ? await Exam.findById(examRef)
            : await Exam.findOne({ share_link: examRef });
        if (!exam || !exam.isPublished) {
            ResponseBuilder.send(res, 404, ResponseBuilder.error('NOT_FOUND', 'Exam not found.'));
            return;
        }
        const examId = String(exam._id || '');

        const eligibility = await getEligibilitySummary(exam.toObject() as unknown as Record<string, unknown>, studentId);
        if (!eligibility.eligible) {
            if (eligibility.accessDeniedReason === 'subscription_required') {
                const subscriptionState = await verifySubscription(studentId);
                const expiryLabel = subscriptionState.expiryDate ? new Date(subscriptionState.expiryDate).toISOString() : null;
                ResponseBuilder.send(res, 403, ResponseBuilder.error('AUTHORIZATION_ERROR', subscriptionState.reason === 'expired'
                    ? `Your subscription has expired${expiryLabel ? ` on ${expiryLabel}` : ''}.`
                    : 'Subscription required.', {
                    subscriptionRequired: true,
                    reason: subscriptionState.reason || 'inactive',
                    expiryDate: expiryLabel,
                    eligibility,
                }));
                return;
            }

            if (eligibility.reasons.includes('outside_exam_window')) {
                ResponseBuilder.send(res, 400, ResponseBuilder.error('VALIDATION_ERROR', 'This exam is currently unavailable.', { eligibility }));
                return;
            }
        }
        if (!eligibility.accessAllowed) {
            ResponseBuilder.send(res, 403, ResponseBuilder.error('AUTHORIZATION_ERROR', 'You are not allowed to take this exam.',
                eligibility,));
            return;
        }
        if (eligibility.attemptsLeft <= 0) {
            ResponseBuilder.send(res, 400, ResponseBuilder.error('VALIDATION_ERROR', `Maximum attempt limit (${exam.attemptLimit}) reached.`));
            return;
        }

        if (!eligibility.paymentCleared) {
            ResponseBuilder.send(res, 402, ResponseBuilder.error('VALIDATION_ERROR', 'Payment pending. Please complete your payment to start this exam.', {
                paymentPending: true,
                pendingDueAmount: eligibility.pendingDueAmount,
                eligibility,
            }));
            return;
        }

        /* ── External exam redirect ── */
        if (exam.externalExamUrl) {
            try {
                const profileSnapshot = await StudentProfile.findOne({ user_id: studentId })
                    .select('registration_id user_unique_id groupIds phone phone_number full_name')
                    .lean();
                const sourcePanel = String((req.body as Record<string, unknown> | undefined)?.sourcePanel || req.query?.source || 'exam_start').trim() || 'exam_start';
                const externalAttempt = await createExternalExamAttempt({
                    examId: exam._id,
                    studentId,
                    attemptNo: eligibility.attemptsUsed + 1,
                    sourcePanel,
                    registrationIdSnapshot: String((profileSnapshot as { registration_id?: unknown } | null)?.registration_id || ''),
                    userUniqueIdSnapshot: String((profileSnapshot as { user_unique_id?: unknown } | null)?.user_unique_id || ''),
                    usernameSnapshot: String(user.username || ''),
                    emailSnapshot: String(user.email || ''),
                    phoneNumberSnapshot: String((profileSnapshot as { phone_number?: unknown; phone?: unknown } | null)?.phone_number || (profileSnapshot as { phone?: unknown } | null)?.phone || ''),
                    fullNameSnapshot: String((profileSnapshot as { full_name?: unknown } | null)?.full_name || user.full_name || user.username || ''),
                    groupIdsSnapshot: normalizeObjectIdArray((profileSnapshot as { groupIds?: unknown } | null)?.groupIds || []),
                    ip: getRequestIp(req),
                    userAgent: getRequestUserAgent(req),
                    externalExamUrl: String(exam.externalExamUrl || ''),
                });
                ResponseBuilder.send(res, 200, ResponseBuilder.success({
                    redirect: true,
                    externalExamUrl: externalAttempt.redirectUrl,
                    externalAttemptRef: externalAttempt.attemptRef,
                    exam: sanitizeExamForStudent(exam),
                    serverNow: new Date().toISOString(),
                    serverOffsetMs: 0,
                }));
                return;
            } catch (logErr) {
                console.warn('[startExam external join log]', logErr);
            }

            ResponseBuilder.send(res, 200, ResponseBuilder.success({
                redirect: true,
                externalExamUrl: exam.externalExamUrl,
                exam: sanitizeExamForStudent(exam),
                serverNow: new Date().toISOString(),
                serverOffsetMs: 0,
            }));
            return;
        }

        const isDev = process.env.NODE_ENV === 'development';
        /* ── Enforce schedule windows ── */
        if (!isDev && !isWithinScheduleWindows(exam)) {
            ResponseBuilder.send(res, 400, ResponseBuilder.error('VALIDATION_ERROR', 'Exam window is not open.'));
            return;
        }

        if (!(await canAccessExam(exam, studentId))) {
            ResponseBuilder.send(res, 403, ResponseBuilder.error('AUTHORIZATION_ERROR', 'You are not allowed to take this exam.'));
            return;
        }

        // Check attempt limit
        const attemptCount = eligibility.attemptsUsed;
        if (attemptCount >= exam.attemptLimit) {
            ResponseBuilder.send(res, 400, ResponseBuilder.error('VALIDATION_ERROR', 'Maximum attempt limit (${exam.attemptLimit}) reached.'));
            return;
        }
        const attemptNo = attemptCount + 1;

        const userAgent = req.headers['user-agent'] || '';
        const fwd = req.headers['x-forwarded-for'];
        const ipAddress = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0] || req.socket.remoteAddress || '';
        const deviceFingerprint = getDeviceFingerprint(userAgent, ipAddress);

        // Check existing active session (resume lock-safe)
        let session = await ExamSession.findOne({ exam: examId, student: studentId, isActive: true }).sort({ attemptNo: -1 });
        if (session && session.isActive) {
            if (new Date() > new Date(session.expiresAt)) {
                session.status = 'expired';
                await session.save();
                const autoSubmit = await finalizeExamSession({
                    examId,
                    studentId,
                    attemptId: String(session._id),
                    submissionType: 'auto_expired',
                    isAutoSubmit: true,
                    requestMeta: {
                        ipAddress,
                        userAgent: String(userAgent),
                    },
                });

                ResponseBuilder.send(res, 409, ResponseBuilder.error('SESSION_EXPIRED', 'Session expired. Auto-submission has been triggered.', {
                    sessionExpired: true,
                    autoSubmitted: autoSubmit.ok,
                    resultReady: autoSubmit.ok,
                }));
                return;
            }
            if (session.sessionLocked) {
                ResponseBuilder.send(res, 423, ResponseBuilder.error('LOCKED', 'Exam session is locked due to device mismatch. Contact admin.'));
                return;
            }
            if (session.deviceFingerprint && session.deviceFingerprint !== deviceFingerprint) {
                session.sessionLocked = true;
                session.lockReason = 'device_mismatch';
                session.cheat_flags = [
                    ...(session.cheat_flags || []),
                    { reason: 'device_mismatch', timestamp: new Date() },
                ];
                await session.save();
                broadcastExamAttemptEvent(String(session._id), 'attempt-locked', {
                    reason: session.lockReason,
                    source: 'start_exam',
                });
                ResponseBuilder.send(res, 423, ResponseBuilder.error('LOCKED', 'Device mismatch detected. Session locked.'));
                return;
            }
            // Resume existing session
            const assignedQuestionIds = session.answers.map(a => a.questionId);
            const questions = await getQuestionsByIdsAndFormat(assignedQuestionIds, exam);
            // Audit: Resume event
            await ExamEvent.create({
                attempt: session._id,
                student: studentId,
                exam: examId,
                eventType: 'resume',
                metadata: { action: 'resume_exam' },
                ip: ipAddress,
                userAgent
            });

            ResponseBuilder.send(res, 200, ResponseBuilder.success({
                session: mapExamSessionForClient(session, examId, studentId),
                exam: sanitizeExamForStudent(exam),
                questions,
                serverNow: new Date().toISOString(),
                serverOffsetMs: 0,
                resultPublishMode: getResultPublishMode(exam.toObject() as unknown as Record<string, unknown>),
                autosaveIntervalSec: Number((exam as any).autosave_interval_sec || 5),
            }));
            void broadcastExamMetricsUpdate(examId, 'resume_attempt');
            return;
        }

        // Create new session
        const now = new Date();
        const expiresAt = new Date(now.getTime() + exam.duration * 60 * 1000);
        const questions = await generateQuestionsForExam(exam, `${studentId}:${examId}:${attemptNo}`);
        const initialAnswers = questions.map((q: any) => ({
            questionId: q._id.toString(),
            selectedAnswer: '',
            changeCount: 0
        }));

        session = await ExamSession.create({
            exam: examId,
            student: studentId,
            attemptNo,
            attemptRevision: 0,
            startedAt: now,
            expiresAt,
            ipAddress,
            userAgent,
            deviceInfo: detectDevice(userAgent),
            browserInfo: detectBrowser(userAgent),
            deviceFingerprint,
            sessionLocked: false,
            isActive: true,
            answers: initialAnswers
        });

        // Audit: Start event
        await ExamEvent.create({
            attempt: session._id,
            student: studentId,
            exam: examId,
            eventType: 'save',
            metadata: { action: 'start_new_session' },
            ip: ipAddress,
            userAgent
        });

        ResponseBuilder.send(res, 200, ResponseBuilder.success({
            session: mapExamSessionForClient(session, examId, studentId),
            exam: sanitizeExamForStudent(exam),
            questions,
            serverNow: new Date().toISOString(),
            serverOffsetMs: 0,
            resultPublishMode: getResultPublishMode(exam.toObject() as unknown as Record<string, unknown>),
            autosaveIntervalSec: Number((exam as any).autosave_interval_sec || 5),
        }));
        void broadcastExamMetricsUpdate(examId, 'attempt_started');
    } catch (err) {
        console.error('startExam error:', err);
        ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', 'Server error'));
    }
}

/* ─────── PUT /api/exams/:id/autosave ─────── */
export async function autosaveExam(req: AuthRequest, res: Response): Promise<void> {
    try {
        const studentId = req.user!._id;
        const examId = String(req.params.id || '');
        const { answers, tabSwitchCount, cheat_flags, attemptId, currentQuestionId } = req.body || {};
        const expectedRevision = parseAttemptRevision((req.body || {}).attemptRevision);

        const sessionQuery: Record<string, unknown> = { exam: examId, student: studentId, isActive: true };
        if (attemptId) {
            sessionQuery._id = attemptId;
        }
        const session = await ExamSession.findOne(sessionQuery);
        if (!session) {
            ResponseBuilder.send(res, 404, ResponseBuilder.error('NOT_FOUND', 'No active session found.'));
            return;
        }
        if (session.sessionLocked) {
            ResponseBuilder.send(res, 423, ResponseBuilder.error('LOCKED', 'Session is locked due to security policy violation.', {
                action: 'locked',
                lockReason: String((session as any).lockReason || ''),
            }));
            return;
        }
        if (expectedRevision !== null && Number((session as any).attemptRevision || 0) !== expectedRevision) {
            ResponseBuilder.send(res, 409, ResponseBuilder.error('STALE_STATE', 'Attempt state is stale. Please refresh exam state.', {
                latestRevision: Number((session as any).attemptRevision || 0),
            }));
            return;
        }

        const now = new Date();
        const exam = await Exam.findById(examId).select('security_policies answerEditLimitPerQuestion').lean();
        const tabLimit = Number((exam as any)?.security_policies?.tab_switch_limit || 3);
        const answerEditLimitPerQuestion = Number((exam as any)?.answerEditLimitPerQuestion);
        const hasAnswerEditLimit = Number.isFinite(answerEditLimitPerQuestion) && answerEditLimitPerQuestion >= 0;

        // Check session hasn't expired
        if (now > session.expiresAt) {
            session.status = 'expired';
            await session.save();
            void finalizeExamSession({
                examId,
                studentId,
                attemptId: String(session._id),
                submissionType: 'auto_expired',
                isAutoSubmit: true,
                requestMeta: {
                    ipAddress: getRequestIp(req),
                    userAgent: getRequestUserAgent(req),
                },
            }).catch((error) => {
                console.error('autosaveExam auto-expired finalize error:', error);
            });
            ResponseBuilder.send(res, 409, ResponseBuilder.error('CONFLICT', 'Session expired. Auto-submission triggered.'));
            return;
        }

        if (answers) {
            const allowedQuestionIds = new Set(session.answers.map((answer) => String(answer.questionId)));
            const incomingAnswers = normalizeIncomingAnswers(answers).filter((answer) => allowedQuestionIds.has(answer.questionId));
            const incomingQuestionIds = incomingAnswers.map((item) => item.questionId);
            const questionLimits = await Question.find({ _id: { $in: incomingQuestionIds } })
                .select('_id max_attempt_select')
                .lean();
            const maxAttemptSelectByQuestion = new Map<string, number>();
            for (const row of questionLimits) {
                maxAttemptSelectByQuestion.set(String(row._id), Number((row as Record<string, unknown>).max_attempt_select || 0));
            }

            const merge = mergeAnswersWithConstraints({
                existingAnswers: session.answers.map((answer) => ({
                    questionId: answer.questionId,
                    selectedAnswer: answer.selectedAnswer,
                    writtenAnswerUrl: answer.writtenAnswerUrl,
                    answerHistory: answer.answerHistory,
                    changeCount: answer.changeCount,
                    savedAt: answer.savedAt,
                })),
                incomingAnswers,
                answerEditLimitPerQuestion: hasAnswerEditLimit ? answerEditLimitPerQuestion : undefined,
                maxAttemptSelectByQuestion,
                now,
            });

            if (merge.violations.length > 0) {
                session.cheat_flags = [
                    ...(session.cheat_flags || []),
                    ...merge.violations.map((violation) => ({
                        reason: `${violation.reason}:${violation.questionId}:${violation.attempted}/${violation.limit}`,
                        timestamp: now,
                    })),
                ];
                await session.save();
                ResponseBuilder.send(res, 400, ResponseBuilder.error('VALIDATION_ERROR', 'Answer constraints violated. Please review your last changes.', { violations: merge.violations }));
                return;
            }

            session.answers = merge.mergedAnswers as any;

            const totalChanges = merge.mergedAnswers.reduce((sum, a) => sum + Number(a.changeCount || 0), 0);
            if (totalChanges > 150) {
                session.cheat_flags = [
                    ...(session.cheat_flags || []),
                    { reason: `rapid_answer_flipping:${totalChanges}`, timestamp: now },
                ];
            }
        }
        if (cheat_flags) {
            session.cheat_flags = [...(session.cheat_flags || []), ...normalizeCheatFlags(cheat_flags)];
        }

        session.lastSavedAt = now;
        session.autoSaves += 1;
        if (currentQuestionId !== undefined) {
            session.currentQuestionId = String(currentQuestionId || '');
        }
        session.attemptRevision = Number((session as any).attemptRevision || 0) + 1;
        if (tabSwitchCount !== undefined) {
            session.tabSwitchCount = tabSwitchCount;
            session.tabSwitchEvents.push({ timestamp: now, count: tabSwitchCount });
            if (tabSwitchCount > tabLimit) {
                session.cheat_flags = [
                    ...(session.cheat_flags || []),
                    { reason: `tab_switch_excess:${tabSwitchCount}`, timestamp: now },
                ];
            }
        }

        const currentFingerprint = getDeviceFingerprint(
            String(req.headers['user-agent'] || ''),
            (Array.isArray(req.headers['x-forwarded-for']) ? req.headers['x-forwarded-for'][0] : req.headers['x-forwarded-for'])?.split(',')[0] || req.socket.remoteAddress || ''
        );
        if (session.deviceFingerprint && session.deviceFingerprint !== currentFingerprint) {
            session.sessionLocked = true;
            session.lockReason = 'device_mismatch';
            session.cheat_flags = [
                ...(session.cheat_flags || []),
                { reason: 'device_mismatch', timestamp: new Date() },
            ];
            await session.save();
            broadcastExamAttemptEvent(String(session._id), 'attempt-locked', {
                reason: session.lockReason,
                source: 'autosave',
            });
            broadcastAdminLiveEvent('attempt-locked', {
                attemptId: String(session._id),
                examId: String(session.exam || examId),
                studentId: String(session.student || studentId),
                reason: session.lockReason,
                source: 'autosave',
            });
            void broadcastExamMetricsUpdate(String(session.exam || examId), 'autosave_locked');
            ResponseBuilder.send(res, 423, ResponseBuilder.error('LOCKED', 'Device mismatch detected. Session locked.'));
            return;
        }
        await session.save();

        broadcastExamAttemptEvent(String(session._id), 'revision-update', {
            revision: Number((session as any).attemptRevision || 0),
            savedAt: session.lastSavedAt,
        });
        broadcastAdminLiveEvent('autosave', {
            attemptId: String(session._id),
            examId: String(session.exam || examId),
            studentId: String(session.student || studentId),
            savedAt: session.lastSavedAt,
            attemptRevision: Number((session as any).attemptRevision || 0),
            currentQuestionId: String((session as any).currentQuestionId || ''),
            tabSwitchCount: Number(session.tabSwitchCount || 0),
            violationsCount: Number((session as any).violationsCount || 0),
        });

        // Audit: Autosave event
        await ExamEvent.create({
            attempt: session._id,
            student: studentId,
            exam: examId,
            eventType: 'save',
            metadata: { action: 'autosave' },
            ip: getRequestIp(req),
            userAgent: getRequestUserAgent(req),
        });

        ResponseBuilder.send(res, 200, ResponseBuilder.success({
            saved: true,
            savedAt: session.lastSavedAt,
            attemptRevision: Number((session as any).attemptRevision || 0),
        }));
        void broadcastExamMetricsUpdate(String(session.exam || examId), 'autosave');
    } catch (err) {
        console.error('autosaveExam error:', err);
        ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', 'Server error'));
    }
}

/* ─────── POST /api/exams/:id/submit ─────── */
export async function submitExam(req: AuthRequest, res: Response): Promise<void> {
    try {
        const studentId = req.user!._id;
        const examId = String(req.params.id);
        const { answers, tabSwitchCount, isAutoSubmit, cheat_flags, attemptId, submissionType } = req.body || {};
        const expectedRevision = parseAttemptRevision((req.body || {}).attemptRevision);
        const resolvedSubmissionType = resolveSubmissionType(submissionType, Boolean(isAutoSubmit));
        const exam = await Exam.findById(examId);
        if (!exam) {
            ResponseBuilder.send(res, 404, ResponseBuilder.error('NOT_FOUND', 'Exam not found.'));
            return;
        }

        const sessionQuery: Record<string, unknown> = { exam: examId, student: studentId, isActive: true };
        if (attemptId) sessionQuery._id = attemptId;
        const activeSession = await ExamSession.findOne(sessionQuery).sort({ attemptNo: -1 });
        if (!activeSession) {
            const latestResult = await ExamResult.findOne({ exam: examId, student: studentId })
                .sort({ submittedAt: -1, attemptNo: -1 })
                .lean();
            if (latestResult) {
                ResponseBuilder.send(res, 200, ResponseBuilder.success({
                    resultId: latestResult._id,
                    submitted: true,
                    alreadySubmitted: true,
                    obtainedMarks: Number((latestResult as any).obtainedMarks || 0),
                    totalMarks: Number((latestResult as any).totalMarks || exam.totalMarks),
                    percentage: Number((latestResult as any).percentage || 0),
                    correctCount: Number((latestResult as any).correctCount || 0),
                    wrongCount: Number((latestResult as any).wrongCount || 0),
                    unansweredCount: Number((latestResult as any).unansweredCount || 0),
                    resultPublishDate: exam.resultPublishDate,
                    resultPublishMode: getResultPublishMode(exam.toObject() as unknown as Record<string, unknown>),
                    resultPublished: isExamResultPublished(exam.toObject() as unknown as Record<string, unknown>),
                    attemptRevision: null
                }, 'Attempt already submitted.'));
                return;
            }
            ResponseBuilder.send(res, 404, ResponseBuilder.error('NOT_FOUND', 'No session found to submit.'));
            return;
        }

        const fwd = req.headers['x-forwarded-for'];
        const ipAddress = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0] || req.socket.remoteAddress || '';
        const userAgent = String(req.headers['user-agent'] || '');
        const submitFingerprint = getDeviceFingerprint(String(userAgent), String(ipAddress));
        if (activeSession.deviceFingerprint && submitFingerprint !== activeSession.deviceFingerprint) {
            activeSession.sessionLocked = true;
            activeSession.lockReason = 'device_mismatch_submit';
            activeSession.cheat_flags = [
                ...(activeSession.cheat_flags || []),
                { reason: 'device_mismatch_submit', timestamp: new Date() },
            ];
            await activeSession.save();
            broadcastExamAttemptEvent(String(activeSession._id), 'attempt-locked', {
                reason: activeSession.lockReason,
                source: 'submit',
            });
            void broadcastExamMetricsUpdate(examId, 'submit_locked_device_mismatch');
            ResponseBuilder.send(res, 423, ResponseBuilder.error('LOCKED', 'Device mismatch detected during submit. Session locked.'));
            return;
        }

        const finalized = await finalizeExamSession({
            examId,
            studentId,
            attemptId: String(activeSession._id),
            expectedRevision,
            submissionType: resolvedSubmissionType,
            isAutoSubmit: Boolean(isAutoSubmit),
            incomingAnswers: answers,
            tabSwitchCount,
            cheatFlags: cheat_flags,
            requestMeta: {
                ipAddress,
                userAgent,
            },
            forcedSubmittedBy: resolvedSubmissionType === 'forced' ? String(req.user?._id || '') : undefined,
        });

        if (!finalized.ok) {
            ResponseBuilder.send(res, finalized.statusCode, ResponseBuilder.error('SUBMISSION_ERROR', finalized.message, {
                latestRevision: finalized.latestRevision,
                lockReason: finalized.lockReason,
                violations: finalized.violations,
            }));
            return;
        }

        const sessionObj = finalized.session as Record<string, unknown>;
        const resultObj = finalized.result as Record<string, unknown>;

        broadcastExamAttemptEvent(String(sessionObj._id || activeSession._id), 'revision-update', {
            revision: Number(sessionObj.attemptRevision || 0),
            submitted: true,
            submissionType: resolvedSubmissionType,
        });
        broadcastAdminLiveEvent('attempt-updated', {
            attemptId: String(sessionObj._id || activeSession._id),
            examId,
            studentId,
            submitted: true,
            submissionType: resolvedSubmissionType,
            attemptRevision: Number(sessionObj.attemptRevision || 0),
            obtainedMarks: finalized.obtainedMarks,
            percentage: finalized.percentage,
        });

        if (resolvedSubmissionType === 'forced') {
            broadcastExamAttemptEvent(String(sessionObj._id || activeSession._id), 'forced-submit', {
                reason: 'forced_submission',
                resultId: String(resultObj._id || ''),
            });
            broadcastAdminLiveEvent('forced-submit', {
                attemptId: String(sessionObj._id || activeSession._id),
                examId,
                studentId,
                resultId: String(resultObj._id || ''),
            });
        }

        await ExamEvent.create({
            attempt: String(sessionObj._id || activeSession._id),
            student: studentId,
            exam: examId,
            eventType: 'submit',
            metadata: {
                action: finalized.alreadySubmitted ? 'duplicate_submit' : (resolvedSubmissionType === 'manual' ? 'manual_submit' : resolvedSubmissionType),
                score: finalized.obtainedMarks,
                percentage: finalized.percentage,
            },
            ip: ipAddress,
            userAgent,
        });

        ResponseBuilder.send(res, 200, ResponseBuilder.success({
            message: finalized.alreadySubmitted ? 'Attempt already submitted.' : 'Exam submitted successfully.',
            resultId: resultObj._id,
            submitted: true,
            alreadySubmitted: finalized.alreadySubmitted,
            obtainedMarks: finalized.obtainedMarks,
            totalMarks: Number(resultObj.totalMarks || exam.totalMarks),
            percentage: finalized.percentage,
            correctCount: finalized.correctCount,
            wrongCount: finalized.wrongCount,
            unansweredCount: finalized.unansweredCount,
            resultPublishDate: exam.resultPublishDate,
            resultPublishMode: getResultPublishMode(exam.toObject() as unknown as Record<string, unknown>),
            resultPublished: isExamResultPublished(exam.toObject() as unknown as Record<string, unknown>),
            attemptRevision: Number(sessionObj.attemptRevision || 0),
        }));
        void broadcastExamMetricsUpdate(examId, resolvedSubmissionType === 'forced' ? 'force_submitted' : 'submitted');
    } catch (err) {
        console.error('submitExam error:', err);
        ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', 'Server error'));
    }
}

/* ─────── GET /api/exams/:id/result ─────── */
type SystemSubmitInput = {
    examId: string;
    studentId: string;
    attemptId?: string;
    sourceReq?: AuthRequest;
    reason?: string;
    submissionType?: 'manual' | 'auto_timeout' | 'auto_expired' | 'forced';
};

export async function submitExamAsSystem(input: SystemSubmitInput): Promise<{ statusCode: number; body: unknown }> {
    const {
        examId,
        studentId,
        attemptId,
        sourceReq,
        reason,
        submissionType = 'forced',
    } = input;

    const result = await finalizeExamSession({
        examId,
        studentId,
        attemptId,
        submissionType,
        isAutoSubmit: true,
        cheatFlags: reason ? [{ reason, timestamp: new Date().toISOString() }] : [],
        requestMeta: {
            ipAddress: sourceReq ? getRequestIp(sourceReq) : '',
            userAgent: sourceReq ? getRequestUserAgent(sourceReq) : 'CampusWay-System',
        },
    });

    if (!result.ok) {
        return {
            statusCode: result.statusCode,
            body: {
                message: result.message,
                latestRevision: result.latestRevision,
                lockReason: result.lockReason,
            },
        };
    }

    const resultObj = result.result as Record<string, unknown>;
    const sessionObj = result.session as Record<string, unknown>;
    return {
        statusCode: 200,
        body: {
            message: result.alreadySubmitted ? 'Attempt already submitted.' : 'Exam submitted successfully.',
            resultId: resultObj._id,
            submitted: true,
            alreadySubmitted: result.alreadySubmitted,
            obtainedMarks: result.obtainedMarks,
            percentage: result.percentage,
            correctCount: result.correctCount,
            wrongCount: result.wrongCount,
            unansweredCount: result.unansweredCount,
            attemptRevision: Number(sessionObj.attemptRevision || 0),
        },
    };
}

export async function getExamAttemptState(req: AuthRequest, res: Response): Promise<void> {
    try {
        const studentId = req.user!._id;
        const examId = String(req.params.examId || req.params.id || '');
        const attemptId = normalizeObjectIdParam(req.params.attemptId);

        if (!attemptId) {
            ResponseBuilder.send(res, 400, ResponseBuilder.error('VALIDATION_ERROR', 'Valid attemptId is required.'));
            return;
        }

        const [exam, session] = await Promise.all([
            Exam.findById(examId),
            ExamSession.findOne({ _id: attemptId, exam: examId, student: studentId }),
        ]);

        if (!exam) {
            ResponseBuilder.send(res, 404, ResponseBuilder.error('NOT_FOUND', 'Exam not found.'));
            return;
        }
        if (!session) {
            ResponseBuilder.send(res, 404, ResponseBuilder.error('NOT_FOUND', 'Attempt not found.'));
            return;
        }

        const assignedQuestionIds = session.answers.map((answer) => String(answer.questionId)).filter(Boolean);
        const questions = await getQuestionsByIdsAndFormat(assignedQuestionIds, exam);

        // ── Merge anti-cheat policy (global + per-exam overrides) ────────────
        let mergedAntiCheatPolicy;
        try {
            const secSettings = await SecuritySettings.findOne({ key: 'global' }).lean();
            const globalPolicy = secSettings?.antiCheatPolicy ?? {};
            const examOverrides = (exam as any).antiCheatOverrides ?? undefined;
            mergedAntiCheatPolicy = mergeAntiCheatPolicy(globalPolicy, examOverrides);
        } catch {
            // Fallback to safe defaults on error
            const { SAFE_DEFAULTS } = await import('../types/antiCheat');
            mergedAntiCheatPolicy = { ...SAFE_DEFAULTS };
        }

        ResponseBuilder.send(res, 200, ResponseBuilder.success({
            session: {
                ...mapExamSessionForClient(session, examId, studentId),
                isActive: session.isActive,
                submittedAt: session.submittedAt,
            },
            exam: sanitizeExamForStudent(exam),
            questions,
            antiCheatPolicy: mergedAntiCheatPolicy,
            serverNow: new Date().toISOString(),
        }));
    } catch (err) {
        console.error('getExamAttemptState error:', err);
        ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', 'Server error'));
    }
}

export async function saveExamAttemptAnswer(req: AuthRequest, res: Response): Promise<void> {
    const proxiedReq = Object.create(req) as AuthRequest;
    proxiedReq.params = {
        ...req.params,
        id: String(req.params.examId || req.params.id || ''),
    };
    proxiedReq.body = {
        ...(req.body || {}),
        attemptId: String(req.params.attemptId || ''),
    };

    await autosaveExam(proxiedReq, res);
}

export async function submitExamAttempt(req: AuthRequest, res: Response): Promise<void> {
    const proxiedReq = Object.create(req) as AuthRequest;
    proxiedReq.params = {
        ...req.params,
        id: String(req.params.examId || req.params.id || ''),
    };
    proxiedReq.body = {
        ...(req.body || {}),
        attemptId: String(req.params.attemptId || ''),
    };

    await submitExam(proxiedReq, res);
}

export async function logExamAttemptEvent(req: AuthRequest, res: Response): Promise<void> {
    try {
        const studentId = req.user!._id;
        const examId = String(req.params.examId || req.params.id || '');
        const attemptId = normalizeObjectIdParam(req.params.attemptId);
        const body = (req.body || {}) as Record<string, unknown>;
        const eventType = String(body.eventType || '').trim() as AttemptEventType;
        const metadata = (body.metadata && typeof body.metadata === 'object'
            ? (body.metadata as Record<string, unknown>)
            : {}) as Record<string, unknown>;
        const expectedRevision = parseAttemptRevision(body.attemptRevision);

        if (!attemptId) {
            ResponseBuilder.send(res, 400, ResponseBuilder.error('VALIDATION_ERROR', 'Valid attemptId is required.'));
            return;
        }
        if (!ATTEMPT_EVENT_TYPES.has(eventType)) {
            ResponseBuilder.send(res, 400, ResponseBuilder.error('VALIDATION_ERROR', 'Invalid eventType.'));
            return;
        }

        const [exam, session] = await Promise.all([
            Exam.findById(examId).select('security_policies'),
            ExamSession.findOne({ _id: attemptId, exam: examId, student: studentId }),
        ]);

        if (!exam) {
            ResponseBuilder.send(res, 404, ResponseBuilder.error('NOT_FOUND', 'Exam not found.'));
            return;
        }
        if (!session) {
            ResponseBuilder.send(res, 404, ResponseBuilder.error('NOT_FOUND', 'Attempt not found.'));
            return;
        }
        if (!session.isActive || String(session.status || '').toLowerCase() === 'submitted') {
            ResponseBuilder.send(res, 200, ResponseBuilder.success({
                logged: false,
                ignored: true,
                reason: 'attempt_not_active',
                attemptRevision: Number((session as any).attemptRevision || 0),
            }));
            return;
        }
        if (session.sessionLocked) {
            ResponseBuilder.send(res, 423, ResponseBuilder.error('LOCKED', 'Session is locked due to security policy violation.', {
                action: 'locked',
                lockReason: String((session as any).lockReason || ''),
                attemptRevision: Number((session as any).attemptRevision || 0),
            }));
            return;
        }
        if (expectedRevision !== null && Number((session as any).attemptRevision || 0) !== expectedRevision) {
            ResponseBuilder.send(res, 409, ResponseBuilder.error('STALE_STATE', 'Attempt state is stale. Please refresh exam state.', {
                latestRevision: Number((session as any).attemptRevision || 0),
            }));
            return;
        }

        const requestedAt = body.timestamp ? new Date(String(body.timestamp)) : new Date();
        const eventTime = Number.isNaN(requestedAt.getTime()) ? new Date() : requestedAt;
        const policies = ((exam as any)?.security_policies || {}) as Record<string, unknown>;
        const tabLimit = Number(policies.tab_switch_limit || 3);
        const copyLimit = Number(policies.copy_paste_violations || 3);
        const requireFullscreen = Boolean(policies.require_fullscreen);
        const violationAction = resolveViolationAction(policies);

        let action: 'logged' | 'warning' | 'auto_submitted' | 'locked' = 'logged';
        let shouldAutoSubmit = false;
        let shouldLock = false;
        let shouldWarn = false;

        const applyViolationPolicy = (trigger: boolean) => {
            if (!trigger) return;
            if (violationAction === 'submit') {
                shouldAutoSubmit = true;
                action = 'warning';
                shouldWarn = true;
                return;
            }
            if (violationAction === 'lock') {
                shouldLock = true;
                action = 'locked';
                return;
            }
            action = 'warning';
            shouldWarn = true;
        };

        if (eventType === 'tab_switch') {
            const incrementRaw = Number(metadata.increment || 1);
            const increment = Number.isFinite(incrementRaw) && incrementRaw > 0 ? Math.floor(incrementRaw) : 1;
            session.tabSwitchCount = Number(session.tabSwitchCount || 0) + increment;
            session.violationsCount = Number((session as any).violationsCount || 0) + increment;
            session.tabSwitchEvents.push({ timestamp: eventTime, count: session.tabSwitchCount });

            if (session.tabSwitchCount > tabLimit) {
                session.cheat_flags = [
                    ...(session.cheat_flags || []),
                    { reason: `tab_switch_excess:${session.tabSwitchCount}`, timestamp: eventTime },
                ];
                applyViolationPolicy(true);
            }
        }

        if (eventType === 'fullscreen_exit') {
            session.fullscreenExitCount = Number((session as any).fullscreenExitCount || 0) + 1;
            session.violationsCount = Number((session as any).violationsCount || 0) + 1;
            session.cheat_flags = [
                ...(session.cheat_flags || []),
                { reason: 'fullscreen_exit', timestamp: eventTime },
            ];
            applyViolationPolicy(requireFullscreen);
        }

        if (eventType === 'copy_attempt') {
            session.copyAttemptCount = Number((session as any).copyAttemptCount || 0) + 1;
            session.violationsCount = Number((session as any).violationsCount || 0) + 1;
            const nextCount = Number((session as any).copyAttemptCount || 0);
            session.cheat_flags = [
                ...(session.cheat_flags || []),
                { reason: `copy_attempt:${nextCount}`, timestamp: eventTime },
            ];
            if (nextCount > copyLimit) {
                applyViolationPolicy(true);
            }
        }

        if (eventType === 'error') {
            session.cheat_flags = [
                ...(session.cheat_flags || []),
                { reason: 'client_error', timestamp: eventTime },
            ];
        }

        if (shouldLock) {
            session.sessionLocked = true;
            session.lockReason = `policy_lock:${eventType}`;
        }

        session.lastSavedAt = eventTime;
        session.attemptRevision = Number((session as any).attemptRevision || 0) + 1;
        await session.save();
        void broadcastExamMetricsUpdate(examId, `event_${eventType}`);

        broadcastExamAttemptEvent(String(session._id), 'revision-update', {
            revision: Number((session as any).attemptRevision || 0),
            source: 'event_log',
            eventType,
        });
        broadcastAdminLiveEvent('violation', {
            attemptId: String(session._id),
            examId,
            studentId,
            eventType,
            tabSwitchCount: Number(session.tabSwitchCount || 0),
            copyAttemptCount: Number((session as any).copyAttemptCount || 0),
            fullscreenExitCount: Number((session as any).fullscreenExitCount || 0),
            violationsCount: Number((session as any).violationsCount || 0),
            action,
            violationAction,
            attemptRevision: Number((session as any).attemptRevision || 0),
        });

        await ExamEvent.create({
            attempt: session._id,
            student: studentId,
            exam: examId,
            eventType,
            metadata,
            ip: getRequestIp(req),
            userAgent: getRequestUserAgent(req),
        });

        if (shouldWarn) {
            broadcastExamAttemptEvent(String(session._id), 'policy-warning', {
                eventType,
                tabSwitchCount: Number(session.tabSwitchCount || 0),
                copyAttemptCount: Number((session as any).copyAttemptCount || 0),
                fullscreenExitCount: Number((session as any).fullscreenExitCount || 0),
                violationAction,
            });
            broadcastAdminLiveEvent('warn-sent', {
                attemptId: String(session._id),
                examId,
                studentId,
                eventType,
                tabSwitchCount: Number(session.tabSwitchCount || 0),
                copyAttemptCount: Number((session as any).copyAttemptCount || 0),
                fullscreenExitCount: Number((session as any).fullscreenExitCount || 0),
                violationAction,
            });
        }

        if (shouldLock) {
            broadcastExamAttemptEvent(String(session._id), 'attempt-locked', {
                eventType,
                reason: String((session as any).lockReason || ''),
                violationAction,
            });
            broadcastAdminLiveEvent('attempt-locked', {
                attemptId: String(session._id),
                examId,
                studentId,
                eventType,
                reason: String((session as any).lockReason || ''),
                violationAction,
            });
            ResponseBuilder.send(res, 423, ResponseBuilder.error('LOCKED', 'Session locked.', {
                logged: true,
                action: 'locked',
                lockReason: String((session as any).lockReason || ''),
                attemptRevision: Number((session as any).attemptRevision || 0),
                tabSwitchCount: Number(session.tabSwitchCount || 0),
            }));
            void broadcastExamMetricsUpdate(examId, `event_locked_${eventType}`);
            return;
        }

        if (shouldAutoSubmit) {
            const submitResult = await submitExamAsSystem({
                examId,
                studentId,
                attemptId,
                sourceReq: req,
                reason: `policy_auto_submit:${eventType}`,
                submissionType: 'forced',
            });

            if (submitResult.statusCode >= 400) {
                ResponseBuilder.send(res, submitResult.statusCode, ResponseBuilder.error('SERVER_ERROR', 'Auto-submit failed', submitResult.body));
                return;
            }

            ResponseBuilder.send(res, 200, ResponseBuilder.success({
                logged: true,
                action: 'auto_submitted',
                attemptRevision: Number((session as any).attemptRevision || 0),
                violationAction,
                submit: submitResult.body,
            }));
            void broadcastExamMetricsUpdate(examId, `event_auto_submitted_${eventType}`);
            return;
        }

        ResponseBuilder.send(res, 200, ResponseBuilder.success({
            logged: true,
            action,
            attemptRevision: Number((session as any).attemptRevision || 0),
            tabSwitchCount: Number(session.tabSwitchCount || 0),
            violationAction,
        }));
    } catch (err) {
        console.error('logExamAttemptEvent error:', err);
        ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', 'Server error'));
    }
}

type ExamReviewSettings = {
    showQuestion?: boolean;
    showSelectedAnswer?: boolean;
    showCorrectAnswer?: boolean;
    showExplanation?: boolean;
    showSolutionImage?: boolean;
};

type ExamAttemptResultContext =
    | {
        ok: false;
        statusCode: number;
        message: string;
    }
    | {
        ok: true;
        exam: Record<string, any>;
        result: Record<string, any>;
        resultPublished: boolean;
        resultPublishMode: 'immediate' | 'manual' | 'scheduled';
        reviewSettings: ExamReviewSettings;
        answers: Array<Record<string, unknown>>;
        rank: number;
    };

function normalizeOptionKey(value: unknown): 'A' | 'B' | 'C' | 'D' | null {
    const normalized = String(value || '').trim().toUpperCase();
    if (normalized === 'A' || normalized === 'B' || normalized === 'C' || normalized === 'D') {
        return normalized;
    }
    return null;
}

async function loadExamAttemptResultContext(params: {
    studentId: string;
    examId: string;
    attemptId?: string;
}): Promise<ExamAttemptResultContext> {
    const { studentId, examId, attemptId } = params;

    const exam = await Exam.findById(examId).lean();
    if (!exam) {
        return { ok: false, statusCode: 404, message: 'Exam not found.' };
    }

    let attemptNo: number | null = null;
    if (attemptId) {
        if (!mongoose.Types.ObjectId.isValid(attemptId)) {
            return { ok: false, statusCode: 400, message: 'Invalid exam session.' };
        }
        const session = await ExamSession.findOne({
            _id: attemptId,
            exam: examId,
            student: studentId,
        }).lean();
        if (!session) {
            return { ok: false, statusCode: 404, message: 'Exam session not found.' };
        }
        attemptNo = Number((session as any).attemptNo || 1);
    }

    const resultQuery: Record<string, unknown> = { exam: examId, student: studentId };
    if (attemptNo !== null) {
        resultQuery.attemptNo = attemptNo;
    }

    const result = await ExamResult.findOne(resultQuery).sort({ attemptNo: -1, submittedAt: -1 }).lean();
    if (!result) {
        return {
            ok: false,
            statusCode: 404,
            message: 'No result found. You have not submitted this exam.',
        };
    }

    const now = new Date();
    const resultPublished = isExamResultPublished(exam as unknown as Record<string, unknown>, now);
    const resultPublishMode = getResultPublishMode(exam as unknown as Record<string, unknown>);
    const reviewSettings = ((exam as any).reviewSettings || {
        showQuestion: true,
        showSelectedAnswer: true,
        showCorrectAnswer: true,
        showExplanation: true,
        showSolutionImage: true,
    }) as ExamReviewSettings;

    const questionIds = Array.isArray((result as any).answers)
        ? (result as any).answers.map((answer: { question: mongoose.Types.ObjectId }) => answer.question)
        : [];
    const questions = await Question.find({ _id: { $in: questionIds } }).lean();
    const qMap = new Map(questions.map((question) => [question._id!.toString(), question]));

    const rawAnswers = (Array.isArray((result as any).answers) ? (result as any).answers : []).map((answer: {
        question: mongoose.Types.ObjectId;
        selectedAnswer: string;
        isCorrect: boolean;
    }) => {
        const question = qMap.get(String(answer.question || ''));
        return {
            questionId: answer.question,
            question: question?.question,
            questionImage: question?.questionImage,
            optionA: question?.optionA,
            optionB: question?.optionB,
            optionC: question?.optionC,
            optionD: question?.optionD,
            correctAnswer: question?.correctAnswer,
            correctOption: question?.correctAnswer,
            selectedAnswer: answer.selectedAnswer,
            selectedOption: answer.selectedAnswer,
            isCorrect: answer.isCorrect,
            explanation: question?.explanation,
            solutionImage: question?.solutionImage,
            solution: (question as Record<string, unknown>)?.solution || null,
            section: question?.section,
            marks: question?.marks,
        };
    });

    const answers = !Boolean(reviewSettings.showQuestion)
        ? []
        : rawAnswers.map((answer: Record<string, unknown>) => {
            const next = { ...answer } as Record<string, unknown>;
            if (!Boolean(reviewSettings.showSelectedAnswer)) {
                delete next.selectedAnswer;
                delete next.selectedOption;
            }
            if (!Boolean(reviewSettings.showCorrectAnswer)) {
                delete next.correctAnswer;
                delete next.correctOption;
                delete next.optionA;
                delete next.optionB;
                delete next.optionC;
                delete next.optionD;
            }
            if (!Boolean(reviewSettings.showExplanation)) {
                delete next.explanation;
                delete next.solution;
            }
            if (!Boolean(reviewSettings.showSolutionImage)) {
                delete next.solutionImage;
            }
            return next;
        });

    const rank = await ExamResult.countDocuments({
        exam: examId,
        obtainedMarks: { $gt: Number((result as any).obtainedMarks || 0) },
    }) + 1;

    return {
        ok: true,
        exam: exam as unknown as Record<string, any>,
        result: result as unknown as Record<string, any>,
        resultPublished,
        resultPublishMode,
        reviewSettings,
        answers,
        rank,
    };
}

export async function getExamResult(req: AuthRequest, res: Response): Promise<void> {
    try {
        const studentId = req.user!._id;
        const examId = String(req.params.id || req.params.examId || '');
        const context = await loadExamAttemptResultContext({ studentId, examId });

        if (!context.ok) {
            ResponseBuilder.send(res, context.statusCode, ResponseBuilder.error('NOT_FOUND', context.message));
            return;
        }

        if (!context.resultPublished) {
            ResponseBuilder.send(res, 200, ResponseBuilder.success({
                resultPublished: false,
                publishDate: context.exam.resultPublishDate,
                resultPublishMode: context.resultPublishMode,
                exam: {
                    title: context.exam.title,
                    subject: context.exam.subject,
                    totalMarks: context.exam.totalMarks,
                    totalQuestions: context.exam.totalQuestions,
                },
            }, 'Result not published yet'));
            return;
        }

        ResponseBuilder.send(res, 200, ResponseBuilder.success({
            resultPublished: true,
            resultPublishMode: context.resultPublishMode,
            reviewSettings: context.reviewSettings,
            result: {
                ...context.result,
                rank: context.rank,
                answers: context.answers,
                detailedAnswers: context.answers.map((a: Record<string, unknown>) => ({
                    ...a,
                    marks: a.marks !== undefined ? Number(a.marks) : 0,
                    marksObtained: a.isCorrect ? Number(a.marks || 0) : 0,
                    correctWrongIndicator: !a.selectedAnswer && !a.selectedOption
                        ? 'unanswered'
                        : a.isCorrect ? 'correct' : 'wrong',
                    explanation: String(a.explanation || ''),
                })),
            },
            performanceSummary: (context.result as Record<string, unknown>).performanceSummary || {
                totalScore: Number(context.result.obtainedMarks || 0),
                percentage: Number(context.result.percentage || 0),
                strengths: [],
                weaknesses: [],
            },
            exam: {
                title: context.exam.title,
                subject: context.exam.subject,
                totalMarks: context.exam.totalMarks,
                totalQuestions: context.exam.totalQuestions,
                negativeMarking: context.exam.negativeMarking,
                negativeMarkValue: context.exam.negativeMarkValue,
            },
        }));
    } catch (err) {
        console.error('getExamResult error:', err);
        ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', 'Server error'));
    }
}

export async function getDetailedExamResult(req: AuthRequest, res: Response): Promise<void> {
    try {
        const studentId = req.user!._id;
        const examId = String(req.params.id || req.params.examId || '');
        const context = await loadExamAttemptResultContext({ studentId, examId });

        if (!context.ok) {
            ResponseBuilder.send(res, context.statusCode, ResponseBuilder.error('NOT_FOUND', context.message));
            return;
        }

        if (!context.resultPublished) {
            ResponseBuilder.send(res, 200, ResponseBuilder.success({ resultPublished: false }, 'Result not published yet'));
            return;
        }

        const detailedAnswers = context.answers.map((a: Record<string, unknown>) => ({
            questionId: a.questionId,
            question: a.question,
            questionImage: a.questionImage,
            selectedAnswer: a.selectedAnswer || a.selectedOption,
            correctAnswer: a.correctAnswer || a.correctOption,
            isCorrect: Boolean(a.isCorrect),
            marks: a.marks !== undefined ? Number(a.marks) : 0,
            marksObtained: a.isCorrect ? Number(a.marks || 0) : 0,
            explanation: String(a.explanation || ''),
            solutionImage: a.solutionImage || null,
            correctWrongIndicator: !a.selectedAnswer && !a.selectedOption
                ? 'unanswered'
                : a.isCorrect ? 'correct' : 'wrong',
            section: a.section || null,
        }));

        const performanceSummary = (context.result as Record<string, unknown>).performanceSummary || {
            totalScore: Number(context.result.obtainedMarks || 0),
            percentage: Number(context.result.percentage || 0),
            strengths: [],
            weaknesses: [],
        };

        ResponseBuilder.send(res, 200, ResponseBuilder.success({
            resultPublished: true,
            result: {
                obtainedMarks: Number(context.result.obtainedMarks || 0),
                totalMarks: Number(context.result.totalMarks || context.exam.totalMarks || 0),
                percentage: Number(context.result.percentage || 0),
                correctCount: Number(context.result.correctCount || 0),
                wrongCount: Number(context.result.wrongCount || 0),
                unansweredCount: Number(context.result.unansweredCount || 0),
                rank: context.rank,
                detailedAnswers,
            },
            performanceSummary,
            exam: {
                title: context.exam.title,
                subject: context.exam.subject,
                totalMarks: context.exam.totalMarks,
                totalQuestions: context.exam.totalQuestions,
            },
        }));
    } catch (err) {
        console.error('getDetailedExamResult error:', err);
        ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', 'Server error'));
    }
}

export async function getExamAttemptResult(req: AuthRequest, res: Response): Promise<void> {
    try {
        const studentId = req.user!._id;
        const examId = String(req.params.examId || req.params.id || '');
        const attemptId = String(req.params.attemptId || req.params.sessionId || '').trim();
        const context = await loadExamAttemptResultContext({ studentId, examId, attemptId });

        if (!context.ok) {
            ResponseBuilder.send(res, context.statusCode, ResponseBuilder.error('NOT_FOUND', context.message));
            return;
        }

        const nowIso = new Date().toISOString();
        if (!context.resultPublished) {
            ResponseBuilder.send(res, 200, ResponseBuilder.success({
                status: 'locked',
                publishAtUTC: context.exam.resultPublishDate || nowIso,
                serverNowUTC: nowIso,
            }));
            return;
        }

        ResponseBuilder.send(res, 200, ResponseBuilder.success({
            status: 'published',
            obtainedMarks: Number(context.result.obtainedMarks || 0),
            totalMarks: Number(context.result.totalMarks || context.exam.totalMarks || 0),
            correctCount: Number(context.result.correctCount || 0),
            wrongCount: Number(context.result.wrongCount || 0),
            skippedCount: Number(context.result.unansweredCount || 0),
            percentage: Number(context.result.percentage || 0),
            rank: context.rank,
            timeTakenSeconds: Number(context.result.timeTaken || 0),
        }));
    } catch (err) {
        console.error('getExamAttemptResult error:', err);
        ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', 'Server error'));
    }
}

export async function getExamAttemptSolutions(req: AuthRequest, res: Response): Promise<void> {
    try {
        const studentId = req.user!._id;
        const examId = String(req.params.examId || req.params.id || '');
        const attemptId = String(req.params.attemptId || req.params.sessionId || '').trim();
        const context = await loadExamAttemptResultContext({ studentId, examId, attemptId });

        if (!context.ok) {
            ResponseBuilder.send(res, context.statusCode, ResponseBuilder.error('NOT_FOUND', context.message));
            return;
        }

        const nowIso = new Date().toISOString();
        if (!context.resultPublished) {
            ResponseBuilder.send(res, 200, ResponseBuilder.success({
                status: 'locked',
                publishAtUTC: context.exam.resultPublishDate || nowIso,
                serverNowUTC: nowIso,
                reason: 'Result not published yet',
            }));
            return;
        }

        ResponseBuilder.send(res, 200, ResponseBuilder.success({
            status: 'available',
            items: context.answers.map((answer, index) => ({
                questionId: String(answer.questionId || answer.question || `q-${index + 1}`),
                questionText: String(answer.question || answer.questionText || `Question ${index + 1}`),
                selectedKey: normalizeOptionKey(answer.selectedAnswer || answer.selectedOption),
                correctKey: normalizeOptionKey(answer.correctAnswer || answer.correctOption) || 'A',
                explanationText: String(answer.explanation || answer.solution || '').trim() || undefined,
                questionImageUrl: String(answer.questionImage || answer.questionImageUrl || '').trim() || undefined,
                explanationImageUrl: String(answer.solutionImage || answer.explanationImageUrl || '').trim() || undefined,
            })),
        }));
    } catch (err) {
        console.error('getExamAttemptSolutions error:', err);
        ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', 'Server error'));
    }
}

/* ─────── Helpers ─────── */
export async function getStudentExamQuestions(req: AuthRequest, res: Response): Promise<void> {
    try {
        const studentId = req.user!._id;
        const examId = String(req.params.examId || req.params.id || '');
        const random = String(req.query.random || '').toLowerCase() === 'true';
        const limitRaw = Number(req.query.limit || 0);
        const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.floor(limitRaw) : 0;

        const exam = await Exam.findById(examId);
        if (!exam || !exam.isPublished) {
            ResponseBuilder.send(res, 404, ResponseBuilder.error('NOT_FOUND', 'Exam not found.'));
            return;
        }
        if (!(await canAccessExam(exam, studentId))) {
            ResponseBuilder.send(res, 403, ResponseBuilder.error('AUTHORIZATION_ERROR', 'You are not allowed to access this exam.'));
            return;
        }

        const session = await ExamSession.findOne({ exam: examId, student: studentId, isActive: true }).lean();
        let questions: Array<Record<string, unknown>> = [];
        if (session && Array.isArray(session.answers) && session.answers.length > 0) {
            const assignedQuestionIds = session.answers.map((entry) => String(entry.questionId || '')).filter(Boolean);
            questions = await getQuestionsByIdsAndFormat(assignedQuestionIds, exam) as Array<Record<string, unknown>>;
        } else {
            questions = await generateQuestionsForExam(exam, `${studentId}:${examId}:question_list`) as Array<Record<string, unknown>>;
        }

        if (random) {
            questions = seededShuffle(questions, `${studentId}:${examId}:random_query`);
        }
        if (limit > 0) {
            questions = questions.slice(0, limit);
        }

        ResponseBuilder.send(res, 200, ResponseBuilder.success({
            questions,
            total: questions.length,
            serverNow: new Date().toISOString(),
        }));
    } catch (err) {
        console.error('getStudentExamQuestions error:', err);
        ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', 'Server error'));
    }
}

export async function streamExamAttempt(req: AuthRequest, res: Response): Promise<void> {
    try {
        const userId = req.user!._id;
        const userRole = String(req.user?.role || 'student');
        const examId = String(req.params.examId || req.params.id || '');
        const attemptId = normalizeObjectIdParam(req.params.attemptId);

        if (!attemptId) {
            ResponseBuilder.send(res, 400, ResponseBuilder.error('VALIDATION_ERROR', 'Valid attemptId is required.'));
            return;
        }

        const session = await ExamSession.findOne({ _id: attemptId, exam: examId });
        if (!session) {
            ResponseBuilder.send(res, 404, ResponseBuilder.error('NOT_FOUND', 'Attempt not found.'));
            return;
        }

        if (userRole === 'student' && String(session.student) !== userId) {
            ResponseBuilder.send(res, 403, ResponseBuilder.error('AUTHORIZATION_ERROR', 'You are not allowed to stream this attempt.'));
            return;
        }

        addExamAttemptStreamClient({
            res,
            attemptId,
            studentId: String(session.student),
            examId,
        });

        broadcastExamAttemptEvent(attemptId, 'timer-sync', {
            serverNow: new Date().toISOString(),
            expiresAt: session.expiresAt,
            attemptRevision: Number((session as any).attemptRevision || 0),
        });

        if (session.sessionLocked) {
            broadcastExamAttemptEvent(attemptId, 'attempt-locked', {
                reason: String((session as any).lockReason || ''),
                source: 'stream_connect',
            });
        }
    } catch (err) {
        console.error('streamExamAttempt error:', err);
        if (!res.headersSent) {
            ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', 'Server error'));
        }
    }
}

function generateCertificateId(examId: string, studentId: string, attemptNo: number): string {
    const examChunk = examId.slice(-4).toUpperCase();
    const studentChunk = studentId.slice(-4).toUpperCase();
    const nonce = Date.now().toString(36).toUpperCase().slice(-5);
    return `CW-${examChunk}-${studentChunk}-A${attemptNo}-${nonce}`;
}

function certificateEligibility(exam: Record<string, unknown>, result: Record<string, unknown>, resultPublished: boolean): {
    eligible: boolean;
    reasons: string[];
    minPercentage: number;
    passThreshold: number;
} {
    const settings = ((exam.certificateSettings as Record<string, unknown> | undefined) || {});
    const enabled = Boolean(settings.enabled);
    const minPercentageRaw = Number(settings.minPercentage ?? 40);
    const minPercentage = Number.isFinite(minPercentageRaw) ? minPercentageRaw : 40;
    const passOnly = settings.passOnly === undefined ? true : Boolean(settings.passOnly);
    const passThresholdRaw = Number((exam.passMarks as number | undefined) ?? (exam.pass_marks as number | undefined) ?? minPercentage);
    const passThreshold = Number.isFinite(passThresholdRaw) ? passThresholdRaw : minPercentage;
    const percentage = Number(result.percentage || 0);

    const reasons: string[] = [];
    if (!enabled) reasons.push('certificate_disabled');
    if (!resultPublished) reasons.push('result_not_published');
    if (percentage < minPercentage) reasons.push('minimum_percentage_not_met');
    if (passOnly && percentage < passThreshold) reasons.push('pass_criteria_not_met');

    return {
        eligible: reasons.length === 0,
        reasons,
        minPercentage,
        passThreshold,
    };
}

export async function getExamCertificate(req: AuthRequest, res: Response): Promise<void> {
    try {
        const studentId = req.user!._id;
        const examId = String(req.params.id || req.params.examId || '');
        const exam = await Exam.findById(examId).lean();
        if (!exam) {
            ResponseBuilder.send(res, 404, ResponseBuilder.error('NOT_FOUND', 'Exam not found.'));
            return;
        }

        const result = await ExamResult.findOne({ exam: examId, student: studentId }).sort({ attemptNo: -1, submittedAt: -1 }).lean();
        if (!result) {
            ResponseBuilder.send(res, 404, ResponseBuilder.error('NOT_FOUND', 'No submitted result found for this exam.'));
            return;
        }

        const published = isExamResultPublished(exam as unknown as Record<string, unknown>);
        const eligibility = certificateEligibility(exam as unknown as Record<string, unknown>, result as unknown as Record<string, unknown>, published);
        if (!eligibility.eligible) {
            ResponseBuilder.send(res, 403, ResponseBuilder.error('AUTHORIZATION_ERROR', 'Certificate is not available for this attempt.', {
                eligible: false,
                reasons: eligibility.reasons,
            }));
            return;
        }

        const attemptNo = Number((result as any).attemptNo || 1);
        let certificate = await ExamCertificate.findOne({
            examId: exam._id,
            studentId: studentId,
            attemptNo,
            status: 'active',
        });

        if (!certificate) {
            let certificateId = generateCertificateId(String(exam._id), studentId, attemptNo);
            let exists = await ExamCertificate.findOne({ certificateId }).lean();
            while (exists) {
                certificateId = generateCertificateId(String(exam._id), studentId, attemptNo);
                exists = await ExamCertificate.findOne({ certificateId }).lean();
            }

            certificate = await ExamCertificate.create({
                certificateId,
                verifyToken: crypto.randomBytes(16).toString('hex'),
                examId: exam._id,
                studentId,
                attemptNo,
                resultId: result._id,
                issuedAt: new Date(),
                status: 'active',
                meta: {
                    percentage: result.percentage,
                    obtainedMarks: result.obtainedMarks,
                    totalMarks: result.totalMarks,
                },
            });
        }

        const verifyToken = encodeURIComponent(certificate.verifyToken);
        const verifyApiUrl = `/api/certificates/${certificate.certificateId}/verify?token=${verifyToken}`;
        const verifyUrl = `/certificate/verify/${certificate.certificateId}?token=${verifyToken}`;
        const downloadUrl = `/api/exams/${examId}/certificate?download=1`;

        if (String(req.query.download || '') === '1') {
            const payload = [
                'CampusWay Exam Certificate',
                `Certificate ID: ${certificate.certificateId}`,
                `Exam: ${exam.title}`,
                `Student ID: ${studentId}`,
                `Attempt: ${attemptNo}`,
                `Score: ${result.obtainedMarks}/${result.totalMarks} (${result.percentage}%)`,
                `Issued At: ${new Date(certificate.issuedAt).toISOString()}`,
                `Verify: ${verifyApiUrl}`,
            ].join('\n');
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename=\"${certificate.certificateId}.txt\"`);
            res.send(payload);
            return;
        }

        ResponseBuilder.send(res, 200, ResponseBuilder.success({
            eligible: true,
            certificate: {
                certificateId: certificate.certificateId,
                issuedAt: certificate.issuedAt,
                status: certificate.status,
                verifyUrl,
                verifyApiUrl,
                downloadUrl,
                templateVersion: String(((exam as any).certificateSettings || {}).templateVersion || 'v1'),
            },
        }));
    } catch (err) {
        console.error('getExamCertificate error:', err);
        ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', 'Server error'));
    }
}

export async function verifyExamCertificate(req: AuthRequest, res: Response): Promise<void> {
    try {
        const certificateId = String(req.params.certificateId || '').trim();
        const token = String(req.query.token || '').trim();
        if (!certificateId) {
            ResponseBuilder.send(res, 400, ResponseBuilder.error('VALIDATION_ERROR', 'certificateId is required.', { valid: false }));
            return;
        }

        const certificate = await ExamCertificate.findOne({ certificateId, status: 'active' })
            .populate('examId', 'title subject')
            .populate('studentId', 'full_name username email')
            .populate('resultId', 'percentage obtainedMarks totalMarks submittedAt')
            .lean();

        if (!certificate) {
            ResponseBuilder.send(res, 404, ResponseBuilder.error('NOT_FOUND', 'Certificate not found.'));
            return;
        }
        if (token && token !== String(certificate.verifyToken || '')) {
            ResponseBuilder.send(res, 401, ResponseBuilder.error('AUTHENTICATION_ERROR', 'Invalid certificate token.'));
            return;
        }

        const examData = (certificate.examId || {}) as unknown as Record<string, unknown>;
        const studentData = (certificate.studentId || {}) as unknown as Record<string, unknown>;
        const resultData = (certificate.resultId || {}) as unknown as Record<string, unknown>;

        ResponseBuilder.send(res, 200, ResponseBuilder.success({
            valid: true,
            certificate: {
                certificateId: certificate.certificateId,
                status: certificate.status,
                issuedAt: certificate.issuedAt,
                attemptNo: certificate.attemptNo,
            },
            exam: {
                id: String(examData._id || ''),
                title: String(examData.title || ''),
                subject: String(examData.subject || ''),
            },
            student: {
                id: String(studentData._id || ''),
                name: String(studentData.full_name || studentData.username || ''),
                email: String(studentData.email || ''),
            },
            result: {
                percentage: Number(resultData.percentage || 0),
                obtainedMarks: Number(resultData.obtainedMarks || 0),
                totalMarks: Number(resultData.totalMarks || 0),
                submittedAt: resultData.submittedAt || null,
            },
        }));
    } catch (err) {
        console.error('verifyExamCertificate error:', err);
        ResponseBuilder.send(res, 500, ResponseBuilder.error('SERVER_ERROR', 'Server error'));
    }
}

async function generateQuestionsForExam(exam: typeof Exam.prototype, seedText = '') {
    let questions: any[] = [];

    const rules = (exam.question_selection_rules as any[]) || [];
    if (rules.length > 0) {
        // Phase 8: Dynamic Question Pool Assignment
        for (const rule of rules) {
            const query: any = { active: { $ne: false } };
            if (rule.subject) query.subject = rule.subject;
            if (rule.class) query.class = rule.class;
            if (rule.chapter) query.chapter = rule.chapter;
            if (rule.difficulty && rule.difficulty !== 'any') query.difficulty = rule.difficulty;
            if (rule.category) query.category = rule.category;

            let pool = await Question.find(query).lean();
            pool = seededShuffle(pool, `${seedText}:${rule.subject || 'all'}:${rule.chapter || 'all'}`);
            questions.push(...pool.slice(0, rule.count || 1));
        }
    } else {
        // Legacy fallback: try exam._id first
        questions = await Question.find({ exam: exam._id, active: { $ne: false } })
            .sort({ section: 1, order: 1 })
            .lean();

        // Also include QB-attached questions from exam_questions collection
        const bankQuestions = await ExamQuestionModel.find({ examId: String(exam._id) }).sort({ orderIndex: 1 }).lean();
        if (bankQuestions.length > 0) {
            const normalizedBank = bankQuestions.map((bq: any) => ({
                ...bq,
                exam: exam._id,
                question: bq.question_en,
                optionA: bq.options?.[0]?.text_en ?? '',
                optionB: bq.options?.[1]?.text_en ?? '',
                optionC: bq.options?.[2]?.text_en ?? '',
                optionD: bq.options?.[3]?.text_en ?? '',
                correctAnswer: bq.correctKey,
                order: bq.orderIndex ?? 999,
                explanation: bq.explanation_en ?? '',
                active: true,
                fromBank: true,
            }));
            questions.push(...normalizedBank);
        }

        // If still empty, fall back to subject-based search
        if (questions.length === 0 && exam.subject) {
            const subjectQuery: any = { active: { $ne: false } };
            subjectQuery.$or = [
                { subject: { $regex: exam.subject, $options: 'i' } },
                { exam: exam._id },
            ];
            questions = await Question.find(subjectQuery).sort({ order: 1 }).limit(Number(exam.totalQuestions) || 50).lean();
        }
    }

    if (questions.length === 0) {
        console.warn(`[generateQuestionsForExam] No questions found for exam ${exam._id}. Pool rules:`, rules);
    }

    if (exam.randomizeQuestions) {
        questions = seededShuffle(questions, `${seedText}:question_order`);
    }
    if (exam.randomizeOptions) {
        questions = questions.map(q => {
            const opts = seededShuffle([
                { key: 'A', val: q.optionA },
                { key: 'B', val: q.optionB },
                { key: 'C', val: q.optionC },
                { key: 'D', val: q.optionD },
            ], `${seedText}:options:${q._id}`);
            return { ...q, optionA: opts[0].val, optionB: opts[1].val, optionC: opts[2].val, optionD: opts[3].val };
        });
    }

    // Hide answers from payload
    return questions.map(q => {
        const { correctAnswer, explanation, solutionImage, solution, explanation_text, explanation_image_url, explanation_formula, negativeMarks, ...safeQ } = q as any;
        safeQ.questionType = String(safeQ.questionType || '').trim().toLowerCase() === 'written' ? 'written' : 'mcq';
        return safeQ;
    });
}

async function getQuestionsByIdsAndFormat(questionIds: string[], exam: typeof Exam.prototype) {
    const rawQs = await Question.find({ _id: { $in: questionIds } }).lean();
    const qMap = new Map(rawQs.map(q => [q._id!.toString(), q]));

    // Also check ExamQuestionModel for QB-attached questions not found in legacy collection
    const missingIds = questionIds.filter(id => !qMap.has(id));
    if (missingIds.length > 0) {
        const bankQs = await ExamQuestionModel.find({ _id: { $in: missingIds } }).lean();
        for (const bq of bankQs) {
            const opts = (bq as any).options || [];
            qMap.set(bq._id!.toString(), {
                _id: bq._id,
                question: (bq as any).question_en || '',
                optionA: opts[0]?.text || '',
                optionB: opts[1]?.text || '',
                optionC: opts[2]?.text || '',
                optionD: opts[3]?.text || '',
                correctAnswer: (bq as any).correctKey || '',
                order: (bq as any).orderIndex ?? 0,
                marks: (bq as any).marks ?? 1,
                questionType: 'mcq',
            } as any);
        }
    }

    // Maintain generated order
    const orderedQs = questionIds.map(id => qMap.get(id)).filter(Boolean) as any[];

    return orderedQs.filter(q => q && q._id).map(q => {
        const { correctAnswer, explanation, solutionImage, solution, explanation_text, explanation_image_url, explanation_formula, negativeMarks, ...safeQ } = q;
        (safeQ as Record<string, unknown>).questionType =
            String((safeQ as Record<string, unknown>).questionType || '').trim().toLowerCase() === 'written'
                ? 'written'
                : 'mcq';
        return safeQ;
    });
}

function sanitizeExamForStudent(exam: typeof Exam.prototype) {
    const examCenterSnapshot = ((exam as unknown as Record<string, unknown>).examCenterSnapshot || {}) as Record<string, unknown>;
    return {
        _id: exam._id,
        title: exam.title,
        subject: exam.subject,
        subjectBn: (exam as any).subjectBn || '',
        universityNameBn: (exam as any).universityNameBn || '',
        examType: (exam as any).examType || 'mcq_only',
        description: exam.description,
        totalQuestions: exam.totalQuestions,
        totalMarks: exam.totalMarks,
        duration: exam.duration,
        deliveryMode: (exam as any).deliveryMode || 'internal',
        examMode: String((exam as any).deliveryMode || 'internal') === 'external_link' ? 'external_link' : 'internal_system',
        negativeMarking: exam.negativeMarking,
        negativeMarkValue: exam.negativeMarkValue,
        allowBackNavigation: exam.allowBackNavigation,
        showQuestionPalette: exam.showQuestionPalette,
        showRemainingTime: exam.showRemainingTime,
        autoSubmitOnTimeout: exam.autoSubmitOnTimeout,
        answerEditLimitPerQuestion: exam.answerEditLimitPerQuestion,
        bannerImageUrl: exam.bannerImageUrl,
        logoUrl: (exam as any).logoUrl || '',
        examCenterName: String(examCenterSnapshot.name || ''),
        examCenterCode: String(examCenterSnapshot.code || ''),
        examCenterAddress: String(examCenterSnapshot.address || ''),
        startDate: exam.startDate,
        endDate: exam.endDate,
        resultPublishDate: exam.resultPublishDate,
        resultPublishMode: getResultPublishMode((exam as unknown as Record<string, unknown>)),
        autosave_interval_sec: Number((exam as any).autosave_interval_sec || 5),
        autosaveIntervalSec: Number((exam as any).autosave_interval_sec || 5),
        instructions: exam.instructions || '',
        requireInstructionsAgreement: Boolean((exam as any).require_instructions_agreement),
        require_instructions_agreement: Boolean((exam as any).require_instructions_agreement),
        security_policies: (exam as any).security_policies || {},
        reviewSettings: (exam as any).reviewSettings || {
            showQuestion: true,
            showSelectedAnswer: true,
            showCorrectAnswer: true,
            showExplanation: true,
            showSolutionImage: true,
        },
        certificateSettings: (exam as any).certificateSettings || {
            enabled: false,
            minPercentage: 40,
            passOnly: true,
            templateVersion: 'v1',
        },
    };
}

async function updateExamAnalytics(examId: string): Promise<void> {
    const results = await ExamResult.find({ exam: examId }).lean();
    if (results.length === 0) return;
    const marks = results.map(r => r.obtainedMarks);
    const avg = marks.reduce((s, m) => s + m, 0) / marks.length;
    await Exam.findByIdAndUpdate(examId, {
        totalParticipants: results.length,
        avgScore: Math.round(avg * 10) / 10,
        highestScore: Math.max(...marks),
        lowestScore: Math.min(...marks),
    });

    // Rank all students
    const sorted = results.sort((a, b) => {
        if (b.obtainedMarks !== a.obtainedMarks) {
            return b.obtainedMarks - a.obtainedMarks;
        }
        if (Number(a.timeTaken || 0) !== Number(b.timeTaken || 0)) {
            return Number(a.timeTaken || 0) - Number(b.timeTaken || 0);
        }
        return new Date(String(a.submittedAt || 0)).getTime() - new Date(String(b.submittedAt || 0)).getTime();
    });
    const updates = sorted.map((r, idx) =>
        ExamResult.findByIdAndUpdate(r._id, { rank: idx + 1 })
    );
    await Promise.all(updates);

    // Sync student profile points for all participants
    const studentIds = Array.from(new Set(results.map(r => String(r.student))));
    studentIds.map(sid => updateStudentPoints(sid).catch(console.error));
}

async function updateStudentPoints(studentId: string): Promise<void> {
    const results = await ExamResult.find({ student: studentId }).lean();
    const totalPoints = results.reduce((sum, item) => {
        const rankBonus = item.rank ? Math.max(0, 100 - Number(item.rank)) : 0;
        return sum + Number(item.percentage || 0) + rankBonus;
    }, 0);

    // Also get overall rank across all students
    const allStudents = await StudentProfile.find({}).sort({ points: -1 }).select('user_id points').lean();
    const myIdx = allStudents.findIndex(s => String(s.user_id) === studentId);

    await StudentProfile.findOneAndUpdate(
        { user_id: studentId },
        {
            points: Math.round(totalPoints),
            rank: myIdx !== -1 ? myIdx + 1 : undefined
        },
        { upsert: true }
    );
}

function detectDevice(ua: string): string {
    if (/mobile/i.test(ua)) return 'Mobile';
    if (/tablet|ipad/i.test(ua)) return 'Tablet';
    return 'Desktop';
}

function detectBrowser(ua: string): string {
    if (/chrome/i.test(ua) && !/edge/i.test(ua)) return 'Chrome';
    if (/firefox/i.test(ua)) return 'Firefox';
    if (/safari/i.test(ua) && !/chrome/i.test(ua)) return 'Safari';
    if (/edge/i.test(ua)) return 'Edge';
    return 'Unknown';
}
