import { Router } from 'express';
import { globalSearch } from '../controllers/globalSearchController';
import { getPublicTestimonials, getPublicPartners, getPublicFeaturedTestimonials, getPublicTestimonialBySlug } from '../controllers/testimonialPartnerController';
import {
    beginTotpSetup,
    confirmTotpSetup,
    login,
    loginAdmin,
    loginChairman,
    getMe,
    changePassword,
    disableTwoFactor,
    register,
    refresh,
    logout,
    verifyEmail,
    forgotPassword,
    getMySecuritySessions,
    logoutAllMySessions,
    regenerateBackupCodes,
    revokeMySecuritySession,
    resetPassword,
    verify2fa,
    resendOtp,
    checkSession,
    sessionStream,
    getOauthProviders,
    startOauth,
    oauthCallback,
} from '../controllers/authController';
import { getUniversities, getUniversityBySlug, getUniversityCategories } from '../controllers/universityController';
import { getFeaturedUniversityClusters, getPublicUniversityClusterMembers } from '../controllers/universityClusterController';
import {
    getPublicResources,
    incrementResourceView,
    incrementResourceDownload,
    getPublicResourceBySlug,
    getPublicResourceSettings,
} from '../controllers/resourceController';
import { getActiveBanners } from '../controllers/bannerController';
import { getHomeConfig } from '../controllers/homeConfigController';
import { getSiteSettings } from '../controllers/cmsController';
import { getPublicServiceConfig } from '../controllers/cmsController';
import { getPublicAlerts, getActiveStudentAlerts, ackStudentAlert } from '../controllers/homeAlertController';
import {
    getHomeStream,
    getSettings,
    getStats
} from '../controllers/homeSystemController';
import { getAggregatedHomeData } from '../controllers/homeAggregateController';
import { getPublicHomeSettings } from '../controllers/homeSettingsAdminController';
import { getUniversityCategories as getUniversityCategoriesWithClusters } from '../controllers/universityCategoriesPublicController';
import { getPublicUniversityBrowseSettings } from '../controllers/universitySettingsController';
import {
    getPublicExamList,
    getExamLanding,
    getStudentExams,
    getStudentExamById,
    getStudentExamDetails,
    startExam,
    autosaveExam,
    submitExam,
    getExamResult,
    getDetailedExamResult,
    getExamAttemptState,
    saveExamAttemptAnswer,
    submitExamAttempt,
    logExamAttemptEvent,
    getStudentExamQuestions,
    streamExamAttempt,
    getExamCertificate,
    verifyExamCertificate,
} from '../controllers/examController';
import { getQbankPicker, incrementQbankUsage } from '../controllers/questionBankController';
import { authenticate, optionalAuthenticate, requireAuthStudent } from '../middlewares/auth';
import { enforceRegistrationPolicy } from '../middlewares/securityGuards';
import { adminLoginRateLimiter, examStartRateLimiter, examSubmitRateLimiter, loginRateLimiter, subscriptionActionRateLimiter, uploadRateLimiter } from '../middlewares/securityRateLimit';
import { getProfile, getProfileDashboard, updateProfile } from '../controllers/profileController';
import { getServices, getServiceDetails } from '../controllers/serviceController';
import { getCategories as getServiceCategories } from '../controllers/serviceCategoryController';
import { studentGetNotices } from '../controllers/adminSupportController';
import {
    studentCreateSupportTicket,
    studentGetSupportEligibility,
    studentGetSupportTicketById,
    studentGetSupportTickets,
    studentReplySupportTicket,
} from '../controllers/supportController';
import { updateStudentProfile } from '../controllers/studentController';
import {
    getMySubscription,
    getHomeSubscriptionPlans,
    getPublicSubscriptionPlanById,
    getPublicSubscriptionPlans,
    requestSubscriptionPayment,
    uploadSubscriptionProof,
} from '../controllers/subscriptionController';
import {
    getPublicNewsV2List,
    getPublicNewsV2BySlug,
    getPublicNewsV2OGMeta,
    getPublicNewsV2Appearance,
    getPublicNewsV2DiagnosticArticle,
    getPublicNewsV2DiagnosticDelivery,
    getPublicNewsV2DiagnosticFeed,
    getPublicNewsV2Widgets,
    getPublicNewsV2Sources,
    getPublicNewsV2Settings,
    trackPublicNewsV2Share,
} from '../controllers/newsV2Controller';
import { getPublicSecurityConfigController } from '../controllers/securityCenterController';
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
} from '../controllers/studentHubController';
import { contactRateLimiter, otpVerificationLimit } from '../middlewares/securityRateLimit';
import { uploadMedia, uploadMiddleware } from '../controllers/mediaController';
import { validateBody } from '../validators/validateBody';
import { loginSchema, registerSchema, passwordResetSchema } from '../validators/authSchemas';
import { examSubmitSchema } from '../validators/examSchemas';
import { submitPublicContactMessage } from '../controllers/contactController';
import {
    getPublicFeaturedNews,
    getPublicNewsCategories,
    getTrendingNews
} from '../controllers/cmsController';
import { getPublicSocialLinks } from '../controllers/socialLinksController';
import { getPublicAnalyticsSettings, trackEvent } from '../controllers/analyticsController';
import {
    getPublicHelpCenter,
    searchPublicHelpArticles,
    getPublicHelpArticle,
    submitHelpArticleFeedback,
} from '../controllers/helpCenterController';
import {
    getPublicContentBlocks,
    trackContentBlockImpression,
    trackContentBlockClick,
} from '../controllers/contentBlockController';
import { getPublicSystemStatus } from '../controllers/securityAlertController';
import { getPublicLegalPage } from '../controllers/legalPageController';
import { getPublicFounder } from '../controllers/founderController';
import { requireAppCheck } from '../middlewares/appCheck';
import { csrfProtection } from '../middlewares/csrfGuard';

const router = Router();
const examAccessMiddlewares = [authenticate, requireAuthStudent] as const;

/* ── Auth ── */
router.post('/auth/register', requireAppCheck, loginRateLimiter, enforceRegistrationPolicy, validateBody(registerSchema), register);
router.post('/auth/login', loginRateLimiter, validateBody(loginSchema), login);
router.post('/auth/admin/login', adminLoginRateLimiter, validateBody(loginSchema), loginAdmin);
router.post('/auth/chairman/login', loginRateLimiter, validateBody(loginSchema), loginChairman);
router.post('/auth/refresh', csrfProtection, refresh);
router.post('/auth/logout', authenticate, csrfProtection, logout);
router.get('/auth/verify', verifyEmail);
router.post('/auth/forgot-password', requireAppCheck, validateBody(passwordResetSchema), forgotPassword);
router.post('/auth/reset-password', validateBody(passwordResetSchema), resetPassword);
router.get('/auth/me', authenticate, getMe);
router.post('/auth/change-password', authenticate, changePassword);
router.post('/auth/verify-2fa', requireAppCheck, otpVerificationLimit, verify2fa);
router.post('/auth/resend-otp', requireAppCheck, otpVerificationLimit, resendOtp);
router.get('/auth/session-check', authenticate, checkSession);
router.get('/auth/session-stream', authenticate, sessionStream);
router.get('/auth/security/sessions', authenticate, getMySecuritySessions);
router.delete('/auth/security/sessions/:sessionId', authenticate, revokeMySecuritySession);
router.post('/auth/security/logout-all', authenticate, logoutAllMySessions);
router.post('/auth/security/2fa/setup', authenticate, beginTotpSetup);
router.post('/auth/security/2fa/confirm', authenticate, confirmTotpSetup);
router.post('/auth/security/2fa/backup-codes', authenticate, regenerateBackupCodes);
router.post('/auth/security/2fa/disable', authenticate, disableTwoFactor);
router.get('/auth/oauth/providers', getOauthProviders);
router.get('/auth/oauth/:provider/start', startOauth);
router.get('/auth/oauth/:provider/callback', oauthCallback);

/* ── Public — Global Search ── */
router.get('/search', globalSearch);

/* ── Public — Universities ── */
router.get('/universities', getUniversities);
router.get('/university-categories', getUniversityCategories);
router.get('/universities/categories', getUniversityCategories);
router.get('/university-categories/with-clusters', getUniversityCategoriesWithClusters);
router.get('/home/clusters/featured', getFeaturedUniversityClusters);
router.get('/home/clusters/:slug/members', getPublicUniversityClusterMembers);

/* ── Public — Banners & Config ── */
router.get('/banners', getActiveBanners);
router.get('/banners/active', getActiveBanners);
router.get('/home-config', getHomeConfig);
/* ── Public — Resources ── */
router.get('/resources/settings/public', getPublicResourceSettings);
router.get('/resources', getPublicResources);
router.get('/resources/:slug', getPublicResourceBySlug);
router.post('/resources/:id/view', incrementResourceView);
router.post('/resources/:id/download', incrementResourceDownload);
router.get('/universities/:slug', getUniversityBySlug);

/* ── Public — Settings ── */
router.get('/settings/site', getSiteSettings);
router.get('/settings/public', getSettings);
router.get('/settings/analytics', getPublicAnalyticsSettings);
router.get('/security/public-config', getPublicSecurityConfigController);
router.get('/subscription-plans', getPublicSubscriptionPlans);
router.get('/subscription-plans/public', getPublicSubscriptionPlans);
router.get('/subscription-plans/:slug', getPublicSubscriptionPlanById);
router.get('/home/subscription-plans', optionalAuthenticate, getHomeSubscriptionPlans);
router.get('/home-settings/public', getPublicHomeSettings);
router.get('/universities/settings/public', getPublicUniversityBrowseSettings);
router.get('/social-links/public', getPublicSocialLinks);

/* ── Public — Dynamic Home System ── */
router.get('/home', optionalAuthenticate, getAggregatedHomeData);
router.get('/home/stream', getHomeStream);
router.get('/home/alerts', getPublicAlerts);
router.get('/settings', getSettings);
router.get('/stats', getStats);

/* ── Public — News ── */
router.get('/news/diagnostics/rss.xml', getPublicNewsV2DiagnosticFeed);
router.get('/news/diagnostics/article/:slug', getPublicNewsV2DiagnosticArticle);
router.post('/news/diagnostics/delivery/:channel', getPublicNewsV2DiagnosticDelivery);
router.get('/news', getPublicNewsV2List);
router.get('/news/settings', getPublicNewsV2Settings);
router.get('/news/sources', getPublicNewsV2Sources);
router.get('/news/appearance', getPublicNewsV2Appearance);
router.get('/news/widgets', getPublicNewsV2Widgets);
router.get('/news/featured', getPublicFeaturedNews);
router.get('/news/trending', getTrendingNews);
router.get('/news/categories', getPublicNewsCategories);
router.get('/news/:slug', getPublicNewsV2BySlug);
router.get('/news/:slug/og-meta', getPublicNewsV2OGMeta);
router.post('/news/share/track', requireAppCheck, trackPublicNewsV2Share);
router.post('/events/track', requireAppCheck, optionalAuthenticate, trackEvent);

/* ── Public — Help Center ── */
router.get('/help-center', getPublicHelpCenter);
router.get('/help-center/search', searchPublicHelpArticles);
router.get('/help-center/:slug', getPublicHelpArticle);
router.post('/help-center/:slug/feedback', requireAppCheck, submitHelpArticleFeedback);

/* ── Public — Content Blocks ── */
router.get('/content-blocks', getPublicContentBlocks);
router.post('/content-blocks/:id/impression', requireAppCheck, trackContentBlockImpression);
router.post('/content-blocks/:id/click', requireAppCheck, trackContentBlockClick);

/* ── Public — System Status ── */
router.get('/system/status', getPublicSystemStatus as any);

/* ── Public — Legal Pages ── */
router.get('/legal-pages/:slug', getPublicLegalPage);

/* ── Public — Founder ── */
router.get('/founder', getPublicFounder);

/* ── Public — Services ── */
router.get('/services', getServices);
router.get('/services-config', getPublicServiceConfig);
router.get('/service-categories', getServiceCategories);
router.get('/services/:id', getServiceDetails);

/* ── Public — Testimonials & Partners ── */
router.get('/testimonials', getPublicTestimonials);
router.get('/testimonials/featured', getPublicFeaturedTestimonials);
router.get('/testimonials/:slug', getPublicTestimonialBySlug);
router.get('/partners', getPublicPartners);

/* ── Public — Contact Submit ── */
router.post('/contact', requireAppCheck, contactRateLimiter, optionalAuthenticate, submitPublicContactMessage);

/* ── Protected — Student Exam Portal ── */
router.get('/exams/public-list', optionalAuthenticate, getPublicExamList);
router.get('/exams', ...examAccessMiddlewares, getStudentExams);
router.get('/exams/my-visible', ...examAccessMiddlewares, getStudentExams);
router.get('/exams/landing', ...examAccessMiddlewares, getExamLanding);
router.get('/exams/:id', ...examAccessMiddlewares, getStudentExamById);
router.get('/exams/:id/details', ...examAccessMiddlewares, getStudentExamDetails);
router.post('/exams/:id/start', ...examAccessMiddlewares, examStartRateLimiter, startExam);
router.put('/exams/:id/autosave', ...examAccessMiddlewares, autosaveExam);
router.post('/exams/:id/submit', ...examAccessMiddlewares, examSubmitRateLimiter, validateBody(examSubmitSchema), submitExam);
router.get('/exams/:id/result', ...examAccessMiddlewares, getExamResult);
router.get('/exams/:id/detailed-result', ...examAccessMiddlewares, getDetailedExamResult);
router.get('/exams/:examId/questions', ...examAccessMiddlewares, getStudentExamQuestions);
router.get('/exams/:examId/attempt/:attemptId', ...examAccessMiddlewares, getExamAttemptState);
router.get('/exams/:examId/attempt/:attemptId/stream', ...examAccessMiddlewares, streamExamAttempt);
router.post('/exams/:examId/attempt/:attemptId/answer', ...examAccessMiddlewares, saveExamAttemptAnswer);
router.post('/exams/:examId/attempt/:attemptId/event', ...examAccessMiddlewares, logExamAttemptEvent);
router.post('/exams/:examId/attempt/:attemptId/submit', ...examAccessMiddlewares, examSubmitRateLimiter, validateBody(examSubmitSchema), submitExamAttempt);
router.get('/exams/:id/certificate', ...examAccessMiddlewares, getExamCertificate);
router.get('/certificates/:certificateId/verify', verifyExamCertificate);
router.post('/exams/upload-written-answer', ...examAccessMiddlewares, uploadRateLimiter, uploadMiddleware.single('file'), uploadMedia);
router.get('/alerts/active', authenticate, getActiveStudentAlerts);
router.post('/alerts/:alertId/ack', authenticate, ackStudentAlert);
router.get('/qbank/picker', authenticate, getQbankPicker);
router.post('/qbank/usage/increment', authenticate, incrementQbankUsage);
router.get('/student/notices', authenticate, studentGetNotices);
router.get('/support/eligibility', authenticate, studentGetSupportEligibility);
router.get('/support/my-tickets', authenticate, studentGetSupportTickets);
router.post('/support/tickets', authenticate, studentCreateSupportTicket);
router.get('/support/tickets/:id', authenticate, studentGetSupportTicketById);
router.post('/support/tickets/:id/reply', authenticate, studentReplySupportTicket);
router.post('/student/support-tickets', authenticate, studentCreateSupportTicket);
router.get('/student/support-tickets', authenticate, studentGetSupportTickets);
router.get('/student/support-tickets/:id', authenticate, studentGetSupportTicketById);
router.post('/student/support-tickets/:id/reply', authenticate, studentReplySupportTicket);
router.get('/subscriptions/me', authenticate, getMySubscription);
router.post('/subscriptions/:planId/request-payment', authenticate, subscriptionActionRateLimiter, requestSubscriptionPayment);
router.post('/subscriptions/:planId/upload-proof', authenticate, subscriptionActionRateLimiter, uploadMiddleware.single('file'), uploadSubscriptionProof);
router.get('/users/me', authenticate, getStudentMe);
router.put('/users/me', authenticate, updateStudentProfile);
router.get('/students/me/exams', authenticate, getStudentMeExams);
router.get('/students/me/exams/:examId', authenticate, getStudentMeExamById);
router.get('/students/me/results', authenticate, getStudentMeResults);
router.get('/students/me/results/:examId', authenticate, getStudentMeResultByExam);
router.get('/students/me/payments', authenticate, getStudentMePayments);
router.get('/students/me/notifications', authenticate, getStudentMeNotifications);
router.post('/students/me/notifications/mark-read', authenticate, markStudentNotificationsRead);
router.get('/students/me/resources', authenticate, getStudentMeResources);

/* ── Protected — Password Change ── */
router.post('/auth/change-password', authenticate, changePassword);

/* ── Protected — Student Profile & Dashboard ── */
router.get('/profile/me', authenticate, getProfile);
router.get('/profile/dashboard', authenticate, getProfileDashboard);
router.put('/profile/update', authenticate, updateProfile);

export default router;
