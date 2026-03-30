import { Response } from 'express';
import mongoose from 'mongoose';
import { AuthRequest } from '../middlewares/auth';
import User from '../models/User';
import StudentProfile from '../models/StudentProfile';
import Exam from '../models/Exam';
import ExamResult from '../models/ExamResult';
import ManualPayment from '../models/ManualPayment';
import StudentDueLedger from '../models/StudentDueLedger';
import Notification from '../models/Notification';
import Resource from '../models/Resource';
import StudentNotificationRead from '../models/StudentNotificationRead';
import UserSubscription from '../models/UserSubscription';
import { createAdminAlert } from '../services/adminAlertService';
import {
    getExamHistoryAndProgress,
    getStudentDashboardHeader,
    getUpcomingExamCards,
} from '../services/studentDashboardService';
import { getCanonicalSubscriptionSnapshot } from '../services/subscriptionAccessService';
import { getExternalExamAttemptCount } from '../services/externalExamAttemptService';
import { computeStudentProfileScore } from '../services/studentProfileScoreService';
import { getSecurityConfig } from '../services/securityConfigService';
import { buildSecureUploadUrl, registerSecureUpload } from '../services/secureUploadService';

type StudentPaymentItem = {
    _id: string;
    studentId: string;
    examId: string | null;
    amount: number;
    currency: string;
    method: string;
    status: 'paid' | 'pending' | 'failed' | 'refunded';
    transactionId: string;
    reference: string;
    createdAt: Date;
    paidAt: Date | null;
    notes: string;
};

function ensureStudent(req: AuthRequest, res: Response): string | null {
    if (!req.user) {
        res.status(401).json({ message: 'Authentication required' });
        return null;
    }
    if (req.user.role !== 'student') {
        res.status(403).json({ message: 'Student access only' });
        return null;
    }
    return req.user._id;
}

async function getProfileScoreThreshold(): Promise<number> {
    const security = await getSecurityConfig(true);
    if (security.examProtection.requireProfileScoreForExam) {
        return Number(security.examProtection.profileScoreThreshold || 70);
    }
    return 70;
}

function normalizeObjectIdArray(input: unknown): string[] {
    if (!Array.isArray(input)) return [];
    return input
        .map((item) => String(item || '').trim())
        .filter((value) => mongoose.Types.ObjectId.isValid(value));
}

function hasAnyIntersection(left: string[], right: string[]): boolean {
    if (!left.length || !right.length) return false;
    const rightSet = new Set(right);
    return left.some((item) => rightSet.has(item));
}

type StudentNotificationKind =
    | 'support'
    | 'profile'
    | 'payment'
    | 'subscription'
    | 'exam'
    | 'notice'
    | 'system';

type StudentNotificationFilter = StudentNotificationKind | 'all';

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

function deriveStudentNotificationKind(input: {
    type?: unknown;
    category?: unknown;
    sourceType?: unknown;
    linkUrl?: unknown;
    targetRoute?: unknown;
}): StudentNotificationKind {
    const type = String(input.type || '').trim().toLowerCase();
    const category = String(input.category || '').trim().toLowerCase();
    const sourceType = String(input.sourceType || '').trim().toLowerCase();
    const linkUrl = String(input.linkUrl || '').trim().toLowerCase();
    const targetRoute = String(input.targetRoute || '').trim().toLowerCase();

    if (
        sourceType === 'support_ticket'
        || type === 'support_ticket_new'
        || type === 'support_reply_new'
        || type === 'support_status_changed'
        || linkUrl.startsWith('/support/')
        || targetRoute === '/support'
    ) {
        return 'support';
    }
    if (
        sourceType === 'profile_update_request'
        || type === 'profile_update_request'
        || targetRoute === '/profile'
        || linkUrl === '/profile'
        || linkUrl.startsWith('/profile?')
    ) {
        return 'profile';
    }
    if (
        sourceType === 'manual_payment'
        || sourceType === 'payment'
        || type === 'payment_review'
        || type === 'payment_verified'
        || type === 'payment_rejected'
        || targetRoute === '/payments'
        || linkUrl === '/payments'
        || linkUrl.startsWith('/payments?')
    ) {
        return 'payment';
    }
    if (
        sourceType === 'subscription'
        || sourceType === 'subscription_lifecycle'
        || targetRoute === '/subscription-plans'
        || linkUrl === '/subscription-plans'
        || linkUrl.startsWith('/subscription-plans?')
    ) {
        return 'subscription';
    }
    if (sourceType === 'notice') {
        return 'notice';
    }
    if (category === 'exam' || sourceType.includes('exam')) {
        return 'exam';
    }
    return 'system';
}

export async function getStudentMe(req: AuthRequest, res: Response): Promise<void> {
    try {
        const studentId = ensureStudent(req, res);
        if (!studentId) return;

        const [user, profile, dashboardHeader, history, dueLedger, payments] = await Promise.all([
            User.findById(studentId)
                .select('username email full_name profile_photo subscription createdAt lastLogin')
                .lean(),
            StudentProfile.findOne({ user_id: studentId }).lean(),
            getStudentDashboardHeader(studentId),
            getExamHistoryAndProgress(studentId),
            StudentDueLedger.findOne({ studentId }).lean(),
            ManualPayment.find({ studentId }).sort({ date: -1, createdAt: -1 }).limit(5).lean(),
        ]);

        if (!user || !profile) {
            res.status(404).json({ message: 'Student profile not found' });
            return;
        }

        const threshold = await getProfileScoreThreshold();
        const scoreResult = computeStudentProfileScore(
            profile as unknown as Record<string, unknown>,
            user as unknown as Record<string, unknown>,
            threshold
        );
        const totalPaid = payments.reduce((sum, item) => sum + Number((item as { amount?: number }).amount || 0), 0);
        const pendingDue = Number((dueLedger as { netDue?: number } | null)?.netDue || 0);

        res.json({
            student: {
                _id: String(user._id),
                username: user.username,
                email: user.email,
                fullName: String(profile.full_name || user.full_name || user.username),
                userId: String(profile.user_unique_id || ''),
                avatar: String(profile.profile_photo_url || user.profile_photo || ''),
                profileScore: scoreResult.score,
                profileScoreThreshold: scoreResult.threshold,
                profileEligibleForExam: scoreResult.eligible,
                profileScoreBreakdown: scoreResult.breakdown,
                missingProfileFields: scoreResult.missingFields,
                overallRank: dashboardHeader.overallRank,
                groupRank: dashboardHeader.groupRank,
                subscription: dashboardHeader.subscription,
                lastLogin: user.lastLogin || null,
                createdAt: user.createdAt,
            },
            stats: {
                totalExamsAttempted: Number(history.progress.totalExams || 0),
                averageScore: Number(history.progress.avgScore || 0),
                bestScore: Number(history.progress.bestScore || 0),
                leaderboardPoints: history.history.reduce((sum, item) => {
                    const rankBonus = item.rank ? Math.max(0, 100 - Number(item.rank)) : 0;
                    return sum + Number(item.percentage || 0) + rankBonus;
                }, 0),
            },
            payments: {
                totalPaid,
                pendingDue,
                pendingCount: pendingDue > 0 ? 1 : 0,
                lastSuccessfulPayment: payments.length > 0 ? {
                    amount: Number((payments[0] as { amount?: number }).amount || 0),
                    method: String((payments[0] as { method?: string }).method || 'manual'),
                    paidAt: (payments[0] as { date?: Date }).date || null,
                } : null,
            },
            profile: profile,
            lastUpdatedAt: new Date().toISOString(),
        });
    } catch (error) {
        console.error('getStudentMe error:', error);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function getStudentMeExams(req: AuthRequest, res: Response): Promise<void> {
    try {
        const studentId = ensureStudent(req, res);
        if (!studentId) return;

        const [cards, history] = await Promise.all([
            getUpcomingExamCards(studentId),
            getExamHistoryAndProgress(studentId),
        ]);

        const live = cards.filter((item) => item.status === 'live');
        const upcoming = cards.filter((item) => item.status === 'upcoming');
        const missed = cards.filter((item) => item.status === 'completed' && Number(item.attemptsUsed || 0) === 0);
        const completed = history.history;

        res.json({
            live,
            upcoming,
            completed,
            missed,
            all: cards,
            lastUpdatedAt: new Date().toISOString(),
        });
    } catch (error) {
        console.error('getStudentMeExams error:', error);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function getStudentMeExamById(req: AuthRequest, res: Response): Promise<void> {
    try {
        const studentId = ensureStudent(req, res);
        if (!studentId) return;

        const examId = String(req.params.examId || '').trim();
        if (!mongoose.Types.ObjectId.isValid(examId)) {
            res.status(400).json({ message: 'Invalid exam id' });
            return;
        }

        const [exam, user, profile, dueLedger, resultCount, externalAttemptCount, myResult, activeSubscription] = await Promise.all([
            Exam.findById(examId).lean(),
            User.findById(studentId).select('subscription').lean(),
            StudentProfile.findOne({ user_id: studentId }).lean(),
            StudentDueLedger.findOne({ studentId }).lean(),
            ExamResult.countDocuments({ exam: examId, student: studentId }),
            getExternalExamAttemptCount(examId, studentId),
            ExamResult.findOne({ exam: examId, student: studentId }).sort({ submittedAt: -1 }).lean(),
            UserSubscription.findOne({
                userId: studentId,
                status: 'active',
                expiresAtUTC: { $gt: new Date() },
            })
                .populate('planId', 'code')
                .lean(),
        ]);

        if (!exam) {
            res.status(404).json({ message: 'Exam not found' });
            return;
        }

        const threshold = await getProfileScoreThreshold();
        const scoreResult = computeStudentProfileScore(
            profile as unknown as Record<string, unknown>,
            user as unknown as Record<string, unknown>,
            threshold
        );

        const accessControl = (exam.accessControl && typeof exam.accessControl === 'object')
            ? (exam.accessControl as Record<string, unknown>)
            : {};
        const requiredUserIds = normalizeObjectIdArray(accessControl.allowedUserIds);
        const requiredGroupIds = normalizeObjectIdArray(accessControl.allowedGroupIds);
        const visibilityMode = String((exam as Record<string, unknown>).visibilityMode || 'all_students');
        const targetGroupIds = normalizeObjectIdArray((exam as Record<string, unknown>).targetGroupIds || []);
        const requiredPlanCodes = Array.isArray(accessControl.allowedPlanCodes)
            ? (accessControl.allowedPlanCodes as unknown[]).map((item) => String(item || '').toLowerCase()).filter(Boolean)
            : [];
        const persistedSubscription = (user?.subscription as Record<string, unknown> | undefined) || {};
        const activePlan = (activeSubscription?.planId as unknown as Record<string, unknown> | null) || null;
        const studentGroupIds = normalizeObjectIdArray((profile as Record<string, unknown> | null)?.groupIds || []);
        const subscriptionRequired = Boolean((exam as Record<string, unknown>).subscriptionRequired)
            || Boolean((exam as Record<string, unknown>).requiresActiveSubscription)
            || visibilityMode === 'subscription_only'
            || requiredPlanCodes.length > 0;
        const studentPlanCode = String(
            activePlan?.code ||
            persistedSubscription.planCode ||
            persistedSubscription.plan ||
            ''
        ).toLowerCase();
        const subscriptionExpiryRaw = activeSubscription?.expiresAtUTC || persistedSubscription.expiryDate;
        const subscriptionExpiryTime = subscriptionExpiryRaw ? new Date(String(subscriptionExpiryRaw)).getTime() : 0;
        const subscriptionActive = Boolean(
            activeSubscription || (
            persistedSubscription.isActive &&
            Number.isFinite(subscriptionExpiryTime) &&
            subscriptionExpiryTime > Date.now()
            )
        );
        const planEligible = requiredPlanCodes.length === 0 || requiredPlanCodes.includes(studentPlanCode);
        const subscriptionEligible = !subscriptionRequired || subscriptionActive;
        const paymentRequired = subscriptionRequired && subscriptionActive;
        const pendingDue = Number((dueLedger as { netDue?: number } | null)?.netDue || 0);
        const paymentPaid = !paymentRequired || pendingDue <= 0;
        const examWindowOpen = new Date(exam.startDate).getTime() <= Date.now() && Date.now() <= new Date(exam.endDate).getTime();
        const attemptLimit = Number(exam.attemptLimit || 1);
        const attemptsUsed = Math.max(Number(resultCount || 0), Number(externalAttemptCount || 0));
        const attemptsLeft = Math.max(0, attemptLimit - attemptsUsed);
        const userEligible = requiredUserIds.length === 0 || requiredUserIds.includes(studentId);
        const groupEligible = requiredGroupIds.length === 0 || hasAnyIntersection(requiredGroupIds, studentGroupIds);
        const visibilityGroupEligible = !((visibilityMode === 'group_only' || visibilityMode === 'custom')
            && targetGroupIds.length > 0
            && !hasAnyIntersection(targetGroupIds, studentGroupIds));
        const assignedEligible = String(exam.accessMode || 'all') !== 'specific'
            || (Array.isArray(exam.allowedUsers) && exam.allowedUsers.some((id) => String(id) === studentId));

        if (!userEligible || !groupEligible || !visibilityGroupEligible || !assignedEligible) {
            res.status(403).json({
                message: 'You are not assigned to this exam.',
                eligibility: {
                    eligible: false,
                    checks: {
                        access: {
                            userRestricted: requiredUserIds.length > 0,
                            groupRestricted: requiredGroupIds.length > 0 || targetGroupIds.length > 0,
                            passed: false,
                        },
                    },
                },
            });
            return;
        }

        const eligible = Boolean(
            scoreResult.eligible &&
            subscriptionEligible &&
            planEligible &&
            userEligible &&
            groupEligible &&
            visibilityGroupEligible &&
            assignedEligible &&
            paymentPaid &&
            examWindowOpen &&
            attemptsLeft > 0 &&
            exam.isPublished
        );

        res.json({
            exam: {
                ...exam,
                attemptsUsed,
                attemptsLeft,
            },
            eligibility: {
                eligible,
                checks: {
                    profileScore: {
                        required: scoreResult.threshold,
                        current: scoreResult.score,
                        passed: scoreResult.eligible,
                    },
                    payment: {
                        required: paymentRequired,
                        pendingDue,
                        passed: paymentPaid,
                    },
                    subscription: {
                        required: subscriptionRequired,
                        active: subscriptionActive,
                        passed: subscriptionEligible,
                    },
                    plan: {
                        requiredPlanCodes,
                        studentPlanCode,
                        passed: planEligible,
                    },
                    access: {
                        userRestricted: requiredUserIds.length > 0,
                        groupRestricted: requiredGroupIds.length > 0 || targetGroupIds.length > 0,
                        passed: userEligible && groupEligible && visibilityGroupEligible && assignedEligible,
                    },
                    examWindow: {
                        passed: examWindowOpen,
                    },
                },
            },
            latestResult: myResult || null,
            lastUpdatedAt: new Date().toISOString(),
        });
    } catch (error) {
        console.error('getStudentMeExamById error:', error);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function getStudentMeResults(req: AuthRequest, res: Response): Promise<void> {
    try {
        const studentId = ensureStudent(req, res);
        if (!studentId) return;

        const payload = await getExamHistoryAndProgress(studentId);
        const leaderboardPoints = payload.history.reduce((sum, item) => {
            const rankBonus = item.rank ? Math.max(0, 100 - Number(item.rank)) : 0;
            return sum + Number(item.percentage || 0) + rankBonus;
        }, 0);

        res.json({
            items: payload.history,
            progress: payload.progress,
            badges: payload.badges,
            leaderboardPoints,
            lastUpdatedAt: payload.lastUpdatedAt,
        });
    } catch (error) {
        console.error('getStudentMeResults error:', error);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function getStudentMeResultByExam(req: AuthRequest, res: Response): Promise<void> {
    try {
        const studentId = ensureStudent(req, res);
        if (!studentId) return;

        const examId = String(req.params.examId || '').trim();
        if (!mongoose.Types.ObjectId.isValid(examId)) {
            res.status(400).json({ message: 'Invalid exam id' });
            return;
        }

        const result = await ExamResult.findOne({ exam: examId, student: studentId })
            .populate('exam', 'title subject totalMarks totalQuestions reviewSettings resultPublishDate')
            .sort({ submittedAt: -1 })
            .lean();

        if (!result) {
            res.status(404).json({ message: 'Result not found' });
            return;
        }

        const exam = (result.exam as unknown as Record<string, unknown>) || {};
        const totalParticipants = await ExamResult.countDocuments({ exam: examId });
        const rank = Number(result.rank || 0) || null;
        const percentile = rank && totalParticipants > 0
            ? Number((((totalParticipants - rank) / totalParticipants) * 100).toFixed(2))
            : null;
        const answers = Array.isArray(result.answers) ? result.answers : [];
        const correctCount = Number(result.correctCount || answers.filter((item) => Boolean((item as { isCorrect?: boolean }).isCorrect)).length);
        const wrongCount = Number(result.wrongCount || answers.filter((item) => (item as { selectedAnswer?: string; isCorrect?: boolean }).selectedAnswer && !(item as { isCorrect?: boolean }).isCorrect).length);
        const unansweredCount = Math.max(0, Number(exam.totalQuestions || answers.length) - correctCount - wrongCount);

        res.json({
            result: {
                resultId: String(result._id),
                examId: String(exam._id || examId),
                examTitle: String(exam.title || ''),
                subject: String(exam.subject || ''),
                totalMarks: Number(result.totalMarks || exam.totalMarks || 0),
                obtainedMarks: Number(result.obtainedMarks || 0),
                percentage: Number(result.percentage || 0),
                correctCount,
                wrongCount,
                unansweredCount,
                timeTaken: Number(result.timeTaken || 0),
                rank,
                percentile,
                totalParticipants,
                submittedAt: result.submittedAt,
                reviewSettings: (exam.reviewSettings as Record<string, unknown>) || {},
                answers,
            },
            lastUpdatedAt: new Date().toISOString(),
        });
    } catch (error) {
        console.error('getStudentMeResultByExam error:', error);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function getStudentMePayments(req: AuthRequest, res: Response): Promise<void> {
    try {
        const studentId = ensureStudent(req, res);
        if (!studentId) return;

        const [payments, dueLedger] = await Promise.all([
            ManualPayment.find({ studentId }).sort({ date: -1, createdAt: -1 }).lean(),
            StudentDueLedger.findOne({ studentId }).lean(),
        ]);

        const items: StudentPaymentItem[] = payments.map((item) => ({
            _id: String(item._id),
            studentId: String(item.studentId),
            examId: item.examId ? String(item.examId) : null,
            amount: Number(item.amount || 0),
            currency: String((item as any).currency || 'BDT'),
            method: item.method,
            status: ['pending', 'paid', 'failed', 'refunded'].includes(String(item.status || ''))
                ? (String(item.status || 'pending') as 'pending' | 'paid' | 'failed' | 'refunded')
                : 'pending',
            transactionId: String((item as any).transactionId || item.reference || ''),
            reference: String(item.reference || ''),
            createdAt: item.createdAt || new Date(),
            paidAt: String(item.status || '') === 'paid'
                ? (((item as any).paidAt as Date | undefined) || item.date)
                : null,
            notes: String(item.notes || ''),
        }));

        const pendingDue = Number((dueLedger as { netDue?: number } | null)?.netDue || 0);
        if (pendingDue > 0) {
            items.unshift({
                _id: `due-${studentId}`,
                studentId: String(studentId),
                examId: null,
                amount: pendingDue,
                currency: 'BDT',
                method: 'manual',
                status: 'pending',
                transactionId: '',
                reference: '',
                createdAt: dueLedger?.updatedAt || new Date(),
                paidAt: null,
                notes: String((dueLedger as { note?: string } | null)?.note || 'Outstanding due'),
            });
        }

        const totalPaid = payments
            .filter((item) => String(item.status || '') === 'paid')
            .reduce((sum, item) => sum + Number(item.amount || 0), 0);
        const lastPaid = payments.find((item) => String(item.status || '') === 'paid') || null;

        res.json({
            summary: {
                totalPaid,
                pendingAmount: pendingDue,
                pendingCount: pendingDue > 0 ? 1 : 0,
                lastPayment: lastPaid ? {
                    amount: Number(lastPaid.amount || 0),
                    method: lastPaid.method,
                    date: lastPaid.date,
                } : null,
            },
            items,
            lastUpdatedAt: new Date().toISOString(),
        });
    } catch (error) {
        console.error('getStudentMePayments error:', error);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function getStudentMeNotifications(req: AuthRequest, res: Response): Promise<void> {
    try {
        const studentId = ensureStudent(req, res);
        if (!studentId) return;

        const type = String(req.query.type || '').trim().toLowerCase() as StudentNotificationFilter;
        const now = new Date();
        const filter: Record<string, unknown> = {
            isActive: true,
            targetRole: { $in: ['student', 'all'] },
            $or: [
                { targetUserIds: { $exists: false } },
                { targetUserIds: { $size: 0 } },
                { targetUserIds: new mongoose.Types.ObjectId(studentId) },
            ],
            $and: [
                { $or: [{ publishAt: { $exists: false } }, { publishAt: null }, { publishAt: { $lte: now } }] },
                { $or: [{ expireAt: { $exists: false } }, { expireAt: null }, { expireAt: { $gte: now } }] },
            ],
        };

        const rows = await Notification.find(filter).sort({ publishAt: -1, createdAt: -1 }).lean();
        const notificationIds = rows.map((row) => row._id);
        const reads = await StudentNotificationRead.find({
            studentId,
            notificationId: { $in: notificationIds },
        }).lean();
        const readSet = new Set(reads.map((item) => String(item.notificationId)));

        const allItems = rows.map((item) => {
            const fallbackMeta = parseTargetMetaFromLink(String(item.linkUrl || ''));
            const targetRoute = String(item.targetRoute || fallbackMeta.targetRoute || '').trim();
            const targetEntityId = String(item.targetEntityId || fallbackMeta.targetEntityId || '').trim();
            return {
                _id: String(item._id),
                title: item.title,
                body: item.message,
                messagePreview: String(item.messagePreview || item.message || '').trim(),
                kind: deriveStudentNotificationKind({
                    type: item.type,
                    category: item.category,
                    sourceType: item.sourceType,
                    linkUrl: item.linkUrl,
                    targetRoute,
                }),
                type: String(item.type || '').trim(),
                category: String(item.category || '').trim(),
                sourceType: String(item.sourceType || '').trim(),
                sourceId: String(item.sourceId || '').trim(),
                priority: String(item.priority || 'normal').trim(),
                isRead: readSet.has(String(item._id)),
                createdAt: item.createdAt,
                publishAt: item.publishAt || item.createdAt,
                linkUrl: item.linkUrl || '',
                targetRoute,
                targetEntityId,
            };
        });
        const items = allItems.filter((item) => !type || type === 'all' || item.kind === type);
        const unreadCount = allItems.filter((item) => !item.isRead).length;

        res.json({ items, unreadCount, lastUpdatedAt: new Date().toISOString() });
    } catch (error) {
        console.error('getStudentMeNotifications error:', error);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function markStudentNotificationsRead(req: AuthRequest, res: Response): Promise<void> {
    try {
        const studentId = ensureStudent(req, res);
        if (!studentId) return;

        const idsRaw = Array.isArray((req.body as Record<string, unknown>).ids)
            ? ((req.body as Record<string, unknown>).ids as unknown[])
            : [];
        const ids = idsRaw
            .map((id) => String(id || '').trim())
            .filter((id) => mongoose.Types.ObjectId.isValid(id))
            .map((id) => new mongoose.Types.ObjectId(id));

        let targetIds = ids;
        if (targetIds.length === 0) {
            const now = new Date();
            const allRows = await Notification.find({
                isActive: true,
                targetRole: { $in: ['student', 'all'] },
                $or: [
                    { targetUserIds: { $exists: false } },
                    { targetUserIds: { $size: 0 } },
                    { targetUserIds: new mongoose.Types.ObjectId(studentId) },
                ],
                $and: [
                    { $or: [{ publishAt: { $exists: false } }, { publishAt: null }, { publishAt: { $lte: now } }] },
                    { $or: [{ expireAt: { $exists: false } }, { expireAt: null }, { expireAt: { $gte: now } }] },
                ],
            }).select('_id').lean();
            targetIds = allRows.map((row) => row._id);
        }

        if (targetIds.length === 0) {
            res.json({ updated: 0 });
            return;
        }

        const bulkOps = targetIds.map((notificationId) => ({
            updateOne: {
                filter: { studentId: new mongoose.Types.ObjectId(studentId), notificationId },
                update: { $set: { readAt: new Date() } },
                upsert: true,
            },
        }));
        await StudentNotificationRead.bulkWrite(bulkOps);

        res.json({ updated: targetIds.length });
    } catch (error) {
        console.error('markStudentNotificationsRead error:', error);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function getStudentMeResources(req: AuthRequest, res: Response): Promise<void> {
    try {
        const studentId = ensureStudent(req, res);
        if (!studentId) return;

        const category = String(req.query.category || '').trim();
        const q = String(req.query.q || '').trim();
        const subscriptionSnapshot = await getCanonicalSubscriptionSnapshot(studentId);
        const filter: Record<string, unknown> = {};
        if (subscriptionSnapshot.allowsPremiumResources !== true) {
            filter.isPublic = true;
        }
        if (category && category.toLowerCase() !== 'all') filter.category = category;
        if (q) {
            const regex = new RegExp(q, 'i');
            filter.$or = [{ title: regex }, { description: regex }, { category: regex }];
        }

        const rows = await Resource.find(filter)
            .sort({ isFeatured: -1, order: 1, publishDate: -1 })
            .lean();

        const categories = Array.from(new Set(rows.map((row) => String(row.category || 'General'))));
        res.json({
            items: rows,
            categories,
            total: rows.length,
            lastUpdatedAt: new Date().toISOString(),
        });
    } catch (error) {
        console.error('getStudentMeResources error:', error);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function getLeaderboard(req: AuthRequest, res: Response): Promise<void> {
    try {
        const { limit = '50', offset = '0' } = req.query;
        const limitNum = Math.min(100, parseInt(limit as string));
        const offsetNum = Math.max(0, parseInt(offset as string));

        const topStudents = await StudentProfile.find({})
            .sort({ points: -1 })
            .skip(offsetNum)
            .limit(limitNum)
            .select('user_id full_name profile_photo_url points rank')
            .lean();

        const total = await StudentProfile.countDocuments({});

        // Get my rank
        let myRank = null;
        if (req.user) {
            const me = await StudentProfile.findOne({ user_id: req.user._id }).select('rank').lean();
            myRank = me?.rank || null;
        }

        res.json({
            items: topStudents.map((s, idx) => ({
                id: s.user_id,
                name: s.full_name,
                avatar: s.profile_photo_url,
                points: s.points,
                rank: s.rank || (offsetNum + idx + 1)
            })),
            total,
            myRank,
            lastUpdatedAt: new Date().toISOString()
        });
    } catch (error) {
        console.error('getLeaderboard error:', error);
        res.status(500).json({ message: 'Server error' });
    }
}

export async function studentSubmitPaymentProof(req: AuthRequest, res: Response): Promise<void> {
    try {
        const studentId = ensureStudent(req, res);
        if (!studentId) return;

        const { amount, method, reference, notes, proofUrl: rawProofUrl, entryType, subscriptionPlanId } = req.body;
        let proofUrl = String(rawProofUrl || '').trim();
        if (req.file) {
            const secureUpload = await registerSecureUpload({
                file: req.file,
                category: 'payment_proof',
                visibility: 'protected',
                ownerUserId: studentId,
                ownerRole: req.user?.role || 'student',
                uploadedBy: studentId,
                accessRoles: ['student', 'superadmin', 'admin', 'finance_agent'],
            });
            proofUrl = buildSecureUploadUrl(secureUpload.storedName);
        }

        if (!amount || Number(amount) <= 0) {
            res.status(400).json({ message: 'Valid amount is required' });
            return;
        }

        const payment = await ManualPayment.create({
            studentId,
            examId: req.body?.examId || null,
            amount: Number(amount),
            currency: String(req.body?.currency || 'BDT'),
            method: method || 'manual',
            status: 'pending',
            transactionId: String(req.body?.transactionId || '').trim(),
            reference: reference || '',
            proofUrl: proofUrl || '',
            proofFileUrl: proofUrl || '',
            notes: notes || '',
            entryType: entryType || 'subscription',
            subscriptionPlanId: subscriptionPlanId || null,
            date: new Date(),
            recordedBy: studentId, // Initially recorded by student
        });

        const normalizedMethod = String(method || 'manual').trim() || 'manual';
        await createAdminAlert({
            title: 'Payment proof submitted',
            message: `A student submitted a ${normalizedMethod} payment proof for review.`,
            type: 'payment_review',
            messagePreview: `Amount: ${Number(amount).toFixed(2)} BDT`,
            linkUrl: `/__cw_admin__/finance/transactions?paymentId=${String(payment._id)}`,
            category: 'update',
            sourceType: 'manual_payment',
            sourceId: String(payment._id),
            targetRoute: '/__cw_admin__/finance/transactions',
            targetEntityId: String(payment._id),
            priority: 'high',
            actorUserId: studentId,
            actorNameSnapshot: String(req.user?.fullName || req.user?.username || req.user?.email || 'Student').trim(),
            targetRole: 'admin',
            createdBy: studentId,
            dedupeKey: `payment_review:${String(payment._id)}`,
        });

        res.status(201).json({
            message: 'Payment proof submitted. Waiting for admin approval.',
            paymentId: payment._id
        });
    } catch (error) {
        console.error('studentSubmitPaymentProof error:', error);
        res.status(500).json({ message: 'Server error' });
    }
}
