import { Router } from 'express';
import { authenticate } from '../middlewares/auth';
import {
    getStudentProfile,
    getStudentProfileUpdateRequestStatus,
    updateStudentProfile,
    uploadStudentDocument,
    getStudentApplications,
    createStudentApplication
} from '../controllers/studentController';
import {
    getStudentDashboardAggregateHandler,
    getStudentDashboardProfile,
    getStudentExamHistory,
    getStudentFeaturedUniversities,
    getStudentLiveAlertsHandler,
    getStudentNotificationFeed,
    getStudentUpcomingExams,
    getStudentDashboardStream,
} from '../controllers/studentDashboardController';
import { studentGetNotices } from '../controllers/adminSupportController';
import {
    studentCreateSupportTicket,
    studentGetSupportEligibility,
    studentGetSupportTicketById,
    studentGetSupportTickets,
    studentReplySupportTicket,
} from '../controllers/supportController';
import {
    getStudentMe,
    getStudentMeExamById,
    getStudentMeExams,
    getStudentMeNotifications,
    getStudentMePayments,
    getStudentMeResources,
    getStudentMeResultByExam,
    getStudentMeResults,
    markStudentNotificationsRead,
    getLeaderboard,
    studentSubmitPaymentProof,
} from '../controllers/studentHubController';
import {
    getStudentDashboardFull,
    getStudentDashboardSectionsConfig,
} from '../controllers/studentDashboardFullController';
import {
    getStudentWatchlist,
    toggleWatchlistItem,
    getWatchlistSummary,
    checkWatchlistStatus,
} from '../controllers/studentWatchlistController';
import { getStudentWeakTopics } from '../controllers/weakTopicController';
import {
    requestOtpHandler,
    verifyOtpHandler,
    resendOtpHandler,
} from '../controllers/otpController';

const router = Router();

// Apply auth middleware to all student routes
router.use(authenticate);

// Restrict pending students to read-only access (Requirements: 5.2)
import { restrictPendingStudent } from '../middlewares/restrictPendingStudent';
router.use(restrictPendingStudent);

// Bug 1.16 fix: apply CSRF protection at router level for all state-changing methods
import { csrfProtection } from '../middlewares/csrfGuard';
router.use((req, res, next) => {
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
        return csrfProtection(req, res, next);
    }
    next();
});

import { uploadMiddleware } from '../controllers/mediaController';

// Profile Routes
router.get('/profile', getStudentProfile);
router.get('/profile-update-request', getStudentProfileUpdateRequestStatus);
router.put('/profile', updateStudentProfile);
router.post('/profile/documents', uploadMiddleware.single('file'), uploadStudentDocument);
router.get('/dashboard', getStudentDashboardAggregateHandler);
router.get('/upcoming-exams', getStudentUpcomingExams);
router.get('/featured-universities', getStudentFeaturedUniversities);
router.get('/notifications', getStudentNotificationFeed);
router.get('/live-alerts', getStudentLiveAlertsHandler);
router.get('/exam-history', getStudentExamHistory);
router.get('/dashboard-profile', getStudentDashboardProfile);
router.get('/dashboard/stream', getStudentDashboardStream);
router.get('/notices', studentGetNotices);
router.get('/support/eligibility', studentGetSupportEligibility);
router.post('/support-tickets', studentCreateSupportTicket);
router.get('/support-tickets', studentGetSupportTickets);
router.get('/support-tickets/:id', studentGetSupportTicketById);
router.post('/support-tickets/:id/reply', studentReplySupportTicket);
router.get('/me', getStudentMe);
router.get('/me/exams', getStudentMeExams);
router.get('/me/exams/:examId', getStudentMeExamById);
router.get('/me/results', getStudentMeResults);
router.get('/me/results/:examId', getStudentMeResultByExam);
router.get('/me/payments', getStudentMePayments);
router.post('/me/payments/proof', uploadMiddleware.single('file'), studentSubmitPaymentProof);
router.get('/me/notifications', getStudentMeNotifications);
router.post('/me/notifications/mark-read', markStudentNotificationsRead);
router.get('/me/resources', getStudentMeResources);
router.get('/payments', getStudentMePayments);
router.get('/notifications/feed', getStudentMeNotifications);
router.post('/notifications/mark-read', markStudentNotificationsRead);
router.get('/resources', getStudentMeResources);
router.get('/leaderboard', getLeaderboard);

// Application Routes
router.get('/applications', getStudentApplications);
router.post('/applications', createStudentApplication);

// Dashboard Full (premium aggregated endpoint)
router.get('/dashboard-full', getStudentDashboardFull);
router.get('/dashboard-sections-config', getStudentDashboardSectionsConfig);

// Watchlist Routes
router.get('/watchlist', getStudentWatchlist);
router.post('/watchlist/toggle', toggleWatchlistItem);
router.get('/watchlist/summary', getWatchlistSummary);
router.get('/watchlist/check', checkWatchlistStatus);

// Weak Topics
router.get('/me/weak-topics', getStudentWeakTopics);

// OTP Verification Routes
router.post('/otp/request', requestOtpHandler);
router.post('/otp/verify', verifyOtpHandler);
router.post('/otp/resend', resendOtpHandler);

export default router;
