import { Request, Response } from 'express';
import { adminGetDashboardSummary } from '../../src/controllers/adminSummaryController';
import University from '../../src/models/University';
import HomeSettings from '../../src/models/HomeSettings';
import News from '../../src/models/News';
import Exam from '../../src/models/Exam';
import Question from '../../src/models/Question';
import User from '../../src/models/User';
import ManualPayment from '../../src/models/ManualPayment';
import SupportTicket from '../../src/models/SupportTicket';
import ContactMessage from '../../src/models/ContactMessage';
import Resource from '../../src/models/Resource';
import NotificationJob from '../../src/models/NotificationJob';
import UserSubscription from '../../src/models/UserSubscription';
import SubscriptionPlan from '../../src/models/SubscriptionPlan';
import TeamInvite from '../../src/models/TeamInvite';
import TeamRole from '../../src/models/TeamRole';
import SecurityAlertLog from '../../src/models/SecurityAlertLog';

function mockResponse() {
    const res = {
        json: jest.fn(),
        status: jest.fn().mockReturnThis(),
    };
    return res as unknown as Response & { json: jest.Mock; status: jest.Mock };
}

describe('adminGetDashboardSummary', () => {
    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('maps named stats into the correct dashboard buckets', async () => {
        jest.spyOn(University, 'countDocuments')
            .mockResolvedValueOnce(12 as never)
            .mockResolvedValueOnce(9 as never)
            .mockResolvedValueOnce(4 as never);

        jest.spyOn(HomeSettings, 'findOne').mockReturnValue({
            lean: jest.fn().mockResolvedValue({
                highlightedCategories: [{ enabled: true }, { enabled: false }, { enabled: true }],
                featuredUniversities: [{ enabled: true }, { enabled: true }],
                sectionVisibility: { hero: true, stats: true, footer: false, newsPreview: true },
            }),
        } as never);

        jest.spyOn(News, 'countDocuments')
            .mockResolvedValueOnce(7 as never)
            .mockResolvedValueOnce(3 as never);

        jest.spyOn(Exam, 'countDocuments')
            .mockResolvedValueOnce(11 as never)
            .mockResolvedValueOnce(2 as never);

        jest.spyOn(Question, 'countDocuments').mockResolvedValue(450 as never);

        jest.spyOn(User, 'countDocuments')
            .mockResolvedValueOnce(41 as never)
            .mockResolvedValueOnce(6 as never)
            .mockResolvedValueOnce(2 as never)
            .mockResolvedValueOnce(13 as never);

        jest.spyOn(ManualPayment, 'countDocuments')
            .mockResolvedValueOnce(5 as never)
            .mockResolvedValueOnce(9 as never);

        jest.spyOn(SupportTicket, 'countDocuments').mockResolvedValue(14 as never);
        jest.spyOn(ContactMessage, 'countDocuments').mockResolvedValue(4 as never);

        jest.spyOn(Resource, 'countDocuments')
            .mockResolvedValueOnce(19 as never)
            .mockResolvedValueOnce(5 as never);

        jest.spyOn(NotificationJob, 'countDocuments')
            .mockResolvedValueOnce(8 as never)
            .mockResolvedValueOnce(6 as never)
            .mockResolvedValueOnce(1 as never);

        jest.spyOn(UserSubscription, 'countDocuments')
            .mockResolvedValueOnce(22 as never)
            .mockResolvedValueOnce(4 as never);

        jest.spyOn(SubscriptionPlan, 'countDocuments').mockResolvedValue(3 as never);
        jest.spyOn(TeamInvite, 'countDocuments').mockResolvedValue(8 as never);
        jest.spyOn(TeamRole, 'countDocuments').mockResolvedValue(5 as never);

        jest.spyOn(SecurityAlertLog, 'countDocuments')
            .mockResolvedValueOnce(12 as never)
            .mockResolvedValueOnce(2 as never);

        const res = mockResponse();
        await adminGetDashboardSummary({} as Request, res);

        expect(res.status).not.toHaveBeenCalled();
        const body = res.json.mock.calls[0][0];

        expect(body.universities).toEqual({ total: 12, active: 9, featured: 4 });
        expect(body.home).toEqual({ highlightedCategories: 2, featuredUniversities: 2, enabledSections: 3 });
        expect(body.news).toEqual({ pendingReview: 7, publishedToday: 3 });
        expect(body.exams).toEqual({ upcoming: 11, live: 2 });
        expect(body.students).toEqual({ totalActive: 41, pendingPayment: 6, suspended: 2 });
        expect(body.financeCenter).toEqual({ pendingApprovals: 5, paidToday: 9 });
        expect(body.campaigns).toEqual({ totalCampaigns: 8, queuedOrProcessing: 6, failedToday: 1 });
        expect(body.resources).toEqual({ publicResources: 19, featuredResources: 5 });
        expect(body.supportCenter).toEqual({ unreadTickets: 14, unreadContactMessages: 4, unreadMessages: 18 });
        expect(body.teamAccess).toEqual({ activeStaff: 13, pendingInvites: 8, activeRoles: 5 });
        expect(body.security).toEqual(expect.objectContaining({ unreadAlerts: 12, criticalAlerts: 2, db: 'connected' }));
    });
});
