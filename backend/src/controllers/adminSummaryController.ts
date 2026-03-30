import { Request, Response } from 'express';
import mongoose from 'mongoose';
import University from '../models/University';
import HomeSettings from '../models/HomeSettings';
import News from '../models/News';
import Exam from '../models/Exam';
import Question from '../models/Question';
import User from '../models/User';
import ManualPayment from '../models/ManualPayment';
import SupportTicket from '../models/SupportTicket';
import ContactMessage from '../models/ContactMessage';
import Resource from '../models/Resource';
import NotificationJob from '../models/NotificationJob';
import UserSubscription from '../models/UserSubscription';
import SubscriptionPlan from '../models/SubscriptionPlan';
import TeamInvite from '../models/TeamInvite';
import TeamRole from '../models/TeamRole';
import SecurityAlertLog from '../models/SecurityAlertLog';

export const adminGetDashboardSummary = async (_req: Request, res: Response): Promise<void> => {
    try {
        const now = new Date();
        const startOfToday = new Date(now);
        startOfToday.setHours(0, 0, 0, 0);
        const endOfToday = new Date(startOfToday);
        endOfToday.setDate(endOfToday.getDate() + 1);
        const renewalDueUntil = new Date(now);
        renewalDueUntil.setDate(renewalDueUntil.getDate() + 7);
        const staffRoles = ['superadmin', 'admin', 'moderator', 'editor', 'viewer', 'support_agent', 'finance_agent'];
        const activePublicResourceFilter = {
            isPublic: true,
            publishDate: { $lte: now },
            $or: [{ expiryDate: { $exists: false } }, { expiryDate: null }, { expiryDate: { $gt: now } }],
        };

        const [
            universityStats,
            homeSettings,
            newsStats,
            examStats,
            totalQuestions,
            studentStats,
            paymentStats,
            supportStats,
            resourceStats,
            campaignStats,
            subscriptionStats,
            teamStats,
            securityStats,
        ] = await Promise.all([
            Promise.all([
                University.countDocuments({}),
                University.countDocuments({ isActive: true, isArchived: { $ne: true } }),
                University.countDocuments({ featured: true }),
            ]).then(([total, active, featured]) => ({ total, active, featured })),
            HomeSettings.findOne().lean(),
            Promise.all([
                News.countDocuments({ status: { $in: ['pending_review', 'draft'] } }),
                News.countDocuments({ isPublished: true, publishDate: { $gte: startOfToday, $lt: endOfToday } }),
            ]).then(([pendingReview, publishedToday]) => ({ pendingReview, publishedToday })),
            Promise.all([
                Exam.countDocuments({ isPublished: true, status: 'scheduled' }),
                Exam.countDocuments({ isPublished: true, status: 'live' }),
            ]).then(([upcoming, live]) => ({ upcoming, live })),
            Question.countDocuments({}),
            Promise.all([
                User.countDocuments({ role: 'student', status: 'active' }),
                User.countDocuments({ role: 'student', status: 'pending' }),
                User.countDocuments({ role: 'student', status: 'suspended' }),
            ]).then(([totalActive, pendingPayment, suspended]) => ({ totalActive, pendingPayment, suspended })),
            Promise.all([
                ManualPayment.countDocuments({ status: 'pending' }),
                ManualPayment.countDocuments({
                    status: 'paid',
                    $or: [
                        { paidAt: { $gte: startOfToday, $lt: endOfToday } },
                        { paidAt: { $exists: false }, date: { $gte: startOfToday, $lt: endOfToday } },
                        { paidAt: null, date: { $gte: startOfToday, $lt: endOfToday } },
                    ],
                }),
            ]).then(([pendingApprovals, paidToday]) => ({ pendingApprovals, paidToday })),
            Promise.all([
                SupportTicket.countDocuments({
                    $or: [
                        { unreadCountForAdmin: { $gt: 0 } },
                        {
                            unreadCountForAdmin: { $exists: false },
                            status: { $in: ['open', 'in_progress'] },
                        },
                    ],
                }),
                ContactMessage.countDocuments({ unreadByAdmin: true }),
            ]).then(([unreadTickets, unreadContactMessages]) => ({
                unreadTickets,
                unreadContactMessages,
                unreadMessages: unreadTickets + unreadContactMessages,
            })),
            Promise.all([
                Resource.countDocuments(activePublicResourceFilter),
                Resource.countDocuments({ ...activePublicResourceFilter, isFeatured: true }),
            ]).then(([publicResources, featuredResources]) => ({ publicResources, featuredResources })),
            Promise.all([
                NotificationJob ? NotificationJob.countDocuments({ isTestSend: { $ne: true } }).catch(() => 0) : Promise.resolve(0),
                NotificationJob ? NotificationJob.countDocuments({ isTestSend: { $ne: true }, status: { $in: ['queued', 'processing'] } }).catch(() => 0) : Promise.resolve(0),
                NotificationJob ? NotificationJob.countDocuments({ isTestSend: { $ne: true }, status: 'failed', updatedAt: { $gte: startOfToday, $lt: endOfToday } }).catch(() => 0) : Promise.resolve(0),
            ]).then(([totalCampaigns, queuedOrProcessing, failedToday]) => ({ totalCampaigns, queuedOrProcessing, failedToday })),
            Promise.all([
                UserSubscription ? UserSubscription.countDocuments({ status: 'active', expiresAtUTC: { $gt: now } }).catch(() => 0) : Promise.resolve(0),
                UserSubscription ? UserSubscription.countDocuments({ status: 'active', expiresAtUTC: { $gt: now, $lte: renewalDueUntil } }).catch(() => 0) : Promise.resolve(0),
                SubscriptionPlan ? SubscriptionPlan.countDocuments({ enabled: true, isArchived: { $ne: true } }).catch(() => 0) : Promise.resolve(0),
            ]).then(([activeSubscribers, renewalDue, activePlans]) => ({ activeSubscribers, renewalDue, activePlans })),
            Promise.all([
                User.countDocuments({ role: { $in: staffRoles }, status: 'active' }).catch(() => 0),
                TeamInvite.countDocuments({ status: { $in: ['pending', 'sent'] } }),
                TeamRole.countDocuments({ isActive: true }),
            ]).then(([activeStaff, pendingInvites, activeRoles]) => ({ activeStaff, pendingInvites, activeRoles })),
            Promise.all([
                SecurityAlertLog ? SecurityAlertLog.countDocuments({ isRead: false }).catch(() => 0) : Promise.resolve(0),
                SecurityAlertLog ? SecurityAlertLog.countDocuments({ isRead: false, severity: 'critical' }).catch(() => 0) : Promise.resolve(0),
            ]).then(([unreadAlerts, criticalAlerts]) => ({ unreadAlerts, criticalAlerts })),
        ]);

        const highlightedCategories = Array.isArray(homeSettings?.highlightedCategories)
            ? homeSettings.highlightedCategories.filter((item: any) => item?.enabled !== false).length
            : 0;
        const featuredHomeUniversities = Array.isArray(homeSettings?.featuredUniversities)
            ? homeSettings.featuredUniversities.filter((item: any) => item?.enabled !== false).length
            : 0;
        const enabledSections = homeSettings?.sectionVisibility
            ? Object.values(homeSettings.sectionVisibility).filter(Boolean).length
            : 0;

        const dbStateMap: Record<number, 'down' | 'connected'> = {
            0: 'down',
            1: 'connected',
            2: 'down',
            3: 'down',
            99: 'down',
        };
        const db = dbStateMap[mongoose.connection.readyState] || 'down';
        res.json({
            universities: {
                total: universityStats.total,
                active: universityStats.active,
                featured: universityStats.featured,
            },
            home: {
                highlightedCategories,
                featuredUniversities: featuredHomeUniversities,
                enabledSections,
            },
            news: {
                pendingReview: newsStats.pendingReview,
                publishedToday: newsStats.publishedToday,
            },
            exams: {
                upcoming: examStats.upcoming,
                live: examStats.live,
            },
            questionBank: {
                totalQuestions,
            },
            students: studentStats,
            payments: paymentStats,
            financeCenter: paymentStats,
            subscriptions: subscriptionStats,
            resources: resourceStats,
            campaigns: campaignStats,
            supportCenter: supportStats,
            teamAccess: teamStats,
            security: { ...securityStats, db },
            systemStatus: {
                db,
                timeUTC: now.toISOString(),
            },
        });
    } catch (error) {
        console.error('adminGetDashboardSummary error:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};

