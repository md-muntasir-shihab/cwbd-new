import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import ExcelJS from 'exceljs';
import { authenticate, authorize, authorizePermission, forbidden, requirePermission } from '../middlewares/auth';
import { enforceAdminPanelPolicy, enforceAdminReadOnlyMode } from '../middlewares/securityGuards';
import { subscriptionActionRateLimiter, financeExportRateLimiter, financeImportRateLimiter } from '../middlewares/securityRateLimit';
import { requireSensitiveAction, trackSensitiveExport } from '../middlewares/sensitiveAction';
import { requireTwoPersonApproval } from '../middlewares/twoPersonApproval';
import {
    adminGetExams,
    adminGetExamById,
    adminCreateExam,
    adminUpdateExam,
    adminDeleteExam,
    adminPublishExam,
    adminForceSubmit,
    adminPublishResult,
    adminGetQuestions,
    adminCreateQuestion,
    adminUpdateQuestion,
    adminDeleteQuestion,
    adminReorderQuestions,
    adminImportQuestionsFromExcel,
    adminGetExamAnalytics,
    adminExportExamResults,
    adminGetExamResults,
    adminEvaluateResult,
    adminDailyReport,
    adminUpdateUserSubscription,
    adminResetExamAttempt,
    adminGetStudentReport,
    adminBulkImportUniversities,
    adminGetLiveExamSessions,
    adminLiveStream,
    adminLiveAttemptAction,
    adminExportExamEvents,
    adminStartExamPreview,
    adminCloneExam,
    adminRegenerateExamShareLink,
    adminSignExamBannerUpload,
    adminDownloadExamResultsImportTemplate,
    adminImportExamResults,
    adminImportExternalExamResults,
    adminExportExamReport,
} from '../controllers/adminExamController';
import {
    adminGetAllUniversities,
    adminGetUniversityCategories,
    adminExportUniversities,
    adminGetUniversityById,
    adminCreateUniversity,
    adminUpdateUniversity,
    adminDeleteUniversity,
    adminToggleUniversityStatus,
    adminReorderFeaturedUniversities,
    adminBulkDeleteUniversities,
    adminBulkUpdateUniversities,
} from '../controllers/universityController';
import {
    adminCreateUniversityCluster,
    adminDeleteUniversityCluster,
    adminPermanentDeleteUniversityCluster,
    adminGetUniversityClusterById,
    adminGetUniversityClusters,
    adminResolveUniversityClusterMembers,
    adminSyncUniversityClusterDates,
    adminUpdateUniversityCluster,
} from '../controllers/universityClusterController';
import {
    adminCommitUniversityImport,
    adminDownloadUniversityImportTemplate,
    adminDownloadUniversityImportErrors,
    adminGetUniversityImportJob,
    adminInitUniversityImport,
    adminValidateUniversityImport,
} from '../controllers/universityImportController';
import {
    adminCreateUniversityCategory,
    adminDeleteUniversityCategory,
    adminGetUniversityCategoryMaster,
    adminSyncUniversityCategoryConfig,
    adminToggleUniversityCategory,
    adminUpdateUniversityCategory,
} from '../controllers/universityCategoryController';
import {
    adminGetBanners,
    adminCreateBanner,
    adminUpdateBanner,
    adminDeleteBanner,
    adminPublishBanner,
    adminSignBannerUpload,
} from '../controllers/bannerController';
import { getHomeConfig, updateHomeConfig } from '../controllers/homeConfigController';
import {
    adminGetAlerts,
    adminCreateAlert,
    adminUpdateAlert,
    adminDeleteAlert,
    adminToggleAlert,
    adminPublishAlert,
} from '../controllers/homeAlertController';
import {
    getSettings,
    updateSettings,
    updateHome,
    updateHero,
    updatePromotionalBanner,
    updateAnnouncement,
    updateStats
} from '../controllers/homeSystemController';
import {
    adminGetHomeSettings,
    adminGetHomeSettingsDefaults,
    adminUpdateHomeSettings,
    adminResetHomeSettingsSection,
} from '../controllers/homeSettingsAdminController';
import { adminGetDashboardSummary } from '../controllers/adminSummaryController';
import { uploadMedia, uploadMiddleware } from '../controllers/mediaController';
import {
    adminGetResources, adminCreateResource, adminUpdateResource, adminDeleteResource,
    adminToggleResourcePublish, adminToggleResourceFeatured,
    adminGetResourceSettings, adminUpdateResourceSettings,
    getSiteSettings, updateSiteSettings,
    adminExportNews, adminExportSubscriptionPlans as adminExportSubscriptionPlansLegacy, adminExportUniversities as adminExportUniversitiesLegacy,
    adminGetNewsCategories, adminCreateNewsCategory, adminUpdateNewsCategory,
    adminDeleteNewsCategory, adminToggleNewsCategory,
} from '../controllers/cmsController';
import {
    adminArchiveContactMessage,
    adminDeleteContactMessage,
    adminGetContactMessageById,
    adminGetContactMessages,
    adminMarkContactMessageRead,
    adminResolveContactMessage,
    adminUpdateContactMessage,
} from '../controllers/contactController';
import {
    adminNewsV2Dashboard,
    adminNewsV2FetchNow,
    adminNewsV2GetItems,
    adminNewsV2GetItemById,
    adminNewsV2AiCheckItem,
    adminNewsV2CreateItem,
    adminNewsV2UpdateItem,
    adminNewsV2DeleteItem,
    adminNewsV2SubmitReview,
    adminNewsV2Approve,
    adminNewsV2Reject,
    adminNewsV2PublishNow,
    adminNewsV2ApprovePublish,
    adminNewsV2Schedule,
    adminNewsV2MoveToDraft,
    adminNewsV2PublishAnyway,
    adminNewsV2PublishSend,
    adminNewsV2ConvertToNotice,
    adminNewsV2Archive,
    adminNewsV2RestoreItem,
    adminNewsV2PurgeItem,
    adminNewsV2MergeDuplicate,
    adminNewsV2BulkApprove,
    adminNewsV2BulkReject,
    adminNewsV2GetSources,
    adminNewsV2CreateSource,
    adminNewsV2UpdateSource,
    adminNewsV2DeleteSource,
    adminNewsV2TestSource,
    adminNewsV2ReorderSources,
    adminNewsV2GetAppearanceSettings,
    adminNewsV2UpdateAppearanceSettings,
    adminNewsV2GetAiSettings,
    adminNewsV2UpdateAiSettings,
    adminNewsV2GetShareSettings,
    adminNewsV2UpdateShareSettings,
    adminNewsV2GetAllSettings,
    adminNewsV2UpdateAllSettings,
    adminNewsV2GetMedia,
    adminNewsV2UploadMedia,
    adminNewsV2MediaFromUrl,
    adminNewsV2DeleteMedia,
    adminNewsV2ExportNews,
    adminNewsV2ExportSources,
    adminNewsV2ExportLogs,
    adminNewsV2GetAuditLogs,
} from '../controllers/newsV2Controller';
import {
    adminGetServices, adminCreateService, adminUpdateService, adminDeleteService,
    adminReorderServices, adminToggleServiceStatus, adminToggleServiceFeatured
} from '../controllers/serviceController';
import {
    adminGetCategories, adminCreateCategory, adminUpdateCategory, adminDeleteCategory
} from '../controllers/serviceCategoryController';
import {
    createQuestion,
    getQuestions,
    getQuestionById,
    updateQuestion,
    deleteQuestion,
    bulkImportQuestions,
    getQuestionImportJob,
    approveQuestion,
    lockQuestion,
    searchSimilarQuestions,
    exportQuestions,
    revertQuestionRevision,
    signQuestionMediaUpload,
    createQuestionMedia,
} from '../controllers/questionBankController';
import {
    adminAssignBadge,
    adminConfirmGuardianOtp,
    adminCreateBadge,
    adminCreateNotification,
    adminDeleteBadge,
    adminDeleteNotification,
    adminExportStudentExamHistory,
    adminGetBadges,
    adminGetNotifications,
    adminGetStudentDashboardConfig,
    adminIssueGuardianOtp,
    adminRevokeBadge,
    adminToggleNotification,
    adminUpdateBadge,
    adminUpdateNotification,
    adminUpdateStudentDashboardConfig,
} from '../controllers/adminDashboardController';
import {
    getActiveSessions,
    forceLogoutUser,
    getTwoFactorUsers,
    updateTwoFactorUser,
    resetTwoFactorUser,
    getTwoFactorFailures,
} from '../controllers/authController';
import {
    forceLogoutAllUsers,
    getAdminSecuritySettings,
    lockAdminPanel,
    resetAdminSecuritySettings,
    updateAdminSecuritySettings,
} from '../controllers/securityCenterController';
import {
    getSecurityDashboardMetrics,
    getAuditLogsList,
} from '../controllers/securityDashboardController';
import {
    adminApprovePendingAction,
    adminGetPendingApprovals,
    adminRejectPendingAction,
} from '../controllers/actionApprovalController';
import {
    getRuntimeSettings,
    getAdminUiLayoutSettings,
    updateRuntimeSettingsController,
    updateAdminUiLayoutSettings,
} from '../controllers/runtimeSettingsController';
import {
    getUniversitySettings,
    updateUniversitySettings,
} from '../controllers/universitySettingsController';
import {
    adminGetNotificationAutomationSettings,
    adminUpdateNotificationAutomationSettings,
} from '../controllers/notificationAutomationController';
import {
    adminExportEventLogs,
    adminGetAnalyticsOverview,
    adminGetAnalyticsSettings,
    adminUpdateAnalyticsSettings,
} from '../controllers/analyticsController';
import {
    adminGetSecurityAlerts,
    adminGetSecurityAlertSummary,
    adminMarkAlertRead,
    adminMarkAllAlertsRead,
    adminResolveAlert,
    adminDeleteAlert as adminDeleteSecurityAlert,
    adminGetMaintenanceStatus,
    adminUpdateMaintenanceStatus,
} from '../controllers/securityAlertController';
import {
    adminGetHelpCategories,
    adminCreateHelpCategory,
    adminUpdateHelpCategory,
    adminDeleteHelpCategory,
    adminGetHelpArticles,
    adminGetHelpArticle,
    adminCreateHelpArticle,
    adminUpdateHelpArticle,
    adminDeleteHelpArticle,
    adminPublishHelpArticle,
    adminUnpublishHelpArticle,
} from '../controllers/helpCenterController';
import {
    adminGetContentBlocks,
    adminGetContentBlock,
    adminCreateContentBlock,
    adminUpdateContentBlock,
    adminDeleteContentBlock,
    adminToggleContentBlock,
} from '../controllers/contentBlockController';
import {
    adminGetWeakTopics,
    adminGetStudentWeakTopics,
    adminGetHardestQuestions,
} from '../controllers/weakTopicController';
import {
    adminGetStudentTimeline,
    adminAddTimelineEntry,
    adminDeleteTimelineEntry,
    adminGetTimelineSummary,
} from '../controllers/studentTimelineController';
import {
    adminGetNotificationSummary,
    adminGetProviders,
    adminCreateProvider,
    adminUpdateProvider,
    adminDeleteProvider,
    adminTestProvider,
    adminGetTemplates,
    adminCreateTemplate,
    adminUpdateTemplate,
    adminDeleteTemplate,
    adminGetJobs,
    adminSendNotification,
    adminRetryFailedJob,
    adminGetDeliveryLogs,
} from '../controllers/notificationCenterController';
import {
    adminGetActiveSubscriptions,
    adminGetSubscriptionStats,
    adminExtendSubscription,
    adminExpireSubscription,
    adminReactivateSubscription,
    adminToggleAutoRenew,
    adminGetAutomationLogs,
    adminGetStudentSubscriptionHistory,
} from '../controllers/renewalAutomationController';
import {
    adminExportExamInsights,
    adminExportReportsSummary,
    adminGetExamInsights,
    adminGetReportsSummary,
} from '../controllers/adminReportsController';
import {
    adminCommitExamImport,
    adminCreateExamCenter,
    adminCreateExamImportTemplate,
    adminCreateExamMappingProfile,
    adminDeleteExamCenter,
    adminDeleteExamImportTemplate,
    adminDeleteExamMappingProfile,
    adminGetExamCenterSettings,
    adminGetExamCenters,
    adminGetExamImportLogs,
    adminGetExamImportTemplates,
    adminGetExamMappingProfiles,
    adminGetExamProfileSyncLogs,
    adminPreviewExamImport,
    adminRunExamProfileSync,
    adminUpdateExamCenter,
    adminUpdateExamCenterSettings,
    adminUpdateExamImportTemplate,
    adminUpdateExamMappingProfile,
} from '../controllers/examCenterController';
import {
    adminCreateExpense,
    adminCreatePayment,
    adminCreateStaffPayout,
    adminDispatchReminders,
    adminFinanceStream,
    adminGetDues,
    adminGetExpenses,
    adminGetFinanceCashflow,
    adminGetFinanceExpenseBreakdown,
    adminGetFinanceRevenueSeries,
    adminGetFinanceStudentGrowth,
    adminGetFinancePlanDistribution,
    adminGetFinanceSummary,
    adminGetFinanceTestBoard,
    adminExportPayments,
    adminGetPayments,
    adminGetStaffPayouts,
    adminGetStudentLtv,
    adminGetStudentPayments,
    adminSendDueReminder,
    adminUpdateDue,
    adminUpdateExpense,
    adminUpdatePayment,
    adminApprovePayment,
} from '../controllers/adminFinanceController';
import {
    fcGetDashboard,
    fcGetTransactions, fcGetTransaction, fcCreateTransaction, fcUpdateTransaction, fcDeleteTransaction,
    fcBulkApproveTransactions, fcBulkMarkPaid,
    fcGetInvoices, fcCreateInvoice, fcUpdateInvoice, fcMarkInvoicePaid,
    fcGetBudgets, fcCreateBudget, fcUpdateBudget, fcDeleteBudget,
    fcGetRecurringRules, fcCreateRecurringRule, fcUpdateRecurringRule, fcDeleteRecurringRule, fcRunRecurringRuleNow,
    fcGetChartOfAccounts, fcCreateAccount,
    fcGetVendors, fcCreateVendor,
    fcGetSettings, fcUpdateSettings,
    fcGetAuditLogs, fcGetAuditLogDetail,
    fcExportTransactions, fcImportPreview, fcImportCommit, fcDownloadTemplate,
    fcGetRefunds, fcCreateRefund, fcApproveRefund,
    fcGeneratePLReport,
    fcRestoreTransaction,
} from '../controllers/financeCenterController';
import { validate } from '../middlewares/validate';
import {
    createTransactionSchema, updateTransactionSchema, bulkIdsSchema,
    createInvoiceSchema, updateInvoiceSchema, markInvoicePaidSchema,
    createBudgetSchema, updateBudgetSchema,
    createRecurringRuleSchema, updateRecurringRuleSchema,
    createAccountSchema, createVendorSchema,
    updateSettingsSchema,
    createRefundSchema, processRefundSchema,
    importCommitSchema,
} from '../validators/financeSchemas';
import {
    adminCreateNotice,
    adminGetNotices,
    adminToggleNotice,
} from '../controllers/adminSupportController';
import {
    adminGetActionableAlerts,
    adminGetActionableAlertsUnreadCount,
    adminMarkAllActionableAlertsRead,
    adminMarkActionableAlertsRead,
    adminMarkSingleActionableAlertRead,
} from '../controllers/adminAlertController';
import {
    adminGetSupportTicketById,
    adminGetSupportTickets,
    adminMarkSupportTicketRead,
    adminReplySupportTicket,
    adminUpdateSupportTicketStatus,
} from '../controllers/supportController';
import {
    adminDownloadBackup,
    adminListBackups,
    adminRestoreBackup,
    adminRunBackup,
} from '../controllers/backupController';
import {
    adminGetUsers, adminGetUserById, adminCreateUser, adminUpdateUser,
    adminUpdateUserRole, adminToggleUserStatus, adminGetAuditLogs as adminGetSystemAuditLogs, adminBulkImportStudents,
    adminGetStudentProfile, adminUpdateStudentProfile,
    adminResetUserPassword, adminExportStudents,
    adminDeleteUser, adminSetUserStatus, adminSetUserPermissions,
    adminBulkUserAction, adminGetUserActivity, adminGetAdminProfile, adminUpdateAdminProfile,
    adminUserStream,
    adminGetStudents, adminCreateStudent, adminUpdateStudent,
    adminUpdateStudentSubscription, adminUpdateStudentGroups, adminGetStudentExams,
    adminGetStudentGroups, adminCreateStudentGroup, adminUpdateStudentGroup, adminDeleteStudentGroup,
    adminExportStudentGroups, adminImportStudentGroups, adminBulkStudentAction,
    adminGetProfileUpdateRequests, adminApproveProfileUpdateRequest, adminRejectProfileUpdateRequest,
} from '../controllers/adminUserController';
import {
    adminAssignSubscription,
    adminActivateUserSubscription,
    adminCreateSubscriptionPlan,
    adminDuplicateSubscriptionPlan,
    adminCreateUserSubscription,
    adminDeleteSubscriptionPlan,
    adminExportSubscriptionPlans,
    adminGetSubscriptionPlanById,
    adminExportSubscriptions,
    adminGetSubscriptionPlans,
    adminGetSubscriptionSettings,
    adminGetUserSubscriptions,
    adminExpireUserSubscription,
    adminLegacyAssignStudentSubscription,
    adminReorderSubscriptionPlans,
    adminSuspendSubscription,
    adminSuspendUserSubscriptionById,
    adminToggleSubscriptionPlanFeatured,
    adminToggleSubscriptionPlan,
    adminUpdateSubscriptionSettings,
    adminUpdateSubscriptionPlan,
} from '../controllers/subscriptionController';
import {
    adminCreateSocialLink,
    adminDeleteSocialLink,
    adminGetSocialLinks,
    adminUpdateSocialLink,
} from '../controllers/socialLinksController';
import {
    teamActivateMember,
    teamCreateApprovalRule,
    teamCreateMember,
    teamCreateRole,
    teamDeleteApprovalRule,
    teamDeleteRole,
    teamDuplicateRole,
    teamGetActivity,
    teamGetActivityById,
    teamGetApprovalRules,
    teamGetInvites,
    teamGetMemberById,
    teamGetMembers,
    teamGetPermissions,
    teamGetRoleById,
    teamGetRoles,
    teamGetSecurityOverview,
    teamResendInvite,
    teamResetPassword,
    teamRevokeSessions,
    teamSuspendMember,
    teamUpdateApprovalRule,
    teamUpdateMember,
    teamUpdateMemberOverride,
    teamUpdateRole,
    teamUpdateRolePermissions,
} from '../controllers/teamAccessController';
import {
    adminGetJobHealth,
    adminGetJobRuns,
} from '../controllers/adminJobsController';
import {
    adminInitStudentImport,
    adminValidateStudentImport,
    adminCommitStudentImport,
    adminDownloadStudentTemplate,
    adminGetStudentImportJob,
} from '../controllers/studentImportController';
import {
    permissionMatrixToMarkdown,
    ROLE_PERMISSION_MATRIX,
    type PermissionAction,
    type PermissionModule,
} from '../security/permissionsMatrix';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const canEditExams = authorizePermission('canEditExams');
const canManageStudents = authorizePermission('canManageStudents');
const canViewReports = authorizePermission('canViewReports');
const canDeleteData = authorizePermission('canDeleteData');
const canManageFinance = authorizePermission('canManageFinance');
const canManagePlans = authorizePermission('canManagePlans');
const canManageTickets = authorizePermission('canManageTickets');
const canManageBackups = authorizePermission('canManageBackups');

function inferModuleFromPath(pathname: string): PermissionModule | null {
    const clean = String(pathname || '').trim().toLowerCase();
    if (!clean || clean === '/health' || clean.startsWith('/openapi')) return null;
    if (clean.startsWith('/settings/site') || clean === '/settings' || clean.startsWith('/social-links')) return 'site_settings';
    if (clean.startsWith('/settings/home') || clean.startsWith('/home-settings') || clean.startsWith('/home')) return 'home_control';
    if (clean.startsWith('/banners')) return 'banner_manager';
    if (clean.startsWith('/universities') || clean.startsWith('/university-categories') || clean.startsWith('/university-clusters')) return 'universities';
    if (clean.startsWith('/news') || clean.startsWith('/news-category')) return 'news';
    if (clean.startsWith('/exams') || clean.startsWith('/live')) return 'exams';
    if (clean.startsWith('/question-bank')) return 'question_bank';
    if (clean.startsWith('/students') || clean.startsWith('/student-groups') || clean.startsWith('/users')) return 'students_groups';
    if (clean.startsWith('/subscription-plans') || clean.startsWith('/subscriptions')) return 'subscription_plans';
    if (clean.startsWith('/payments') || clean.startsWith('/finance') || clean.startsWith('/dues') || clean.startsWith('/staff-payouts')) return 'payments';
    if (clean.startsWith('/resources')) return 'resources';
    if (clean.startsWith('/support-tickets') || clean.startsWith('/notices') || clean.startsWith('/contact-messages')) return 'support_center';
    if (clean.startsWith('/reports')) return 'reports_analytics';
    if (clean.startsWith('/security') || clean.startsWith('/security-settings') || clean.startsWith('/security-alerts') || clean.startsWith('/audit-logs') || clean.startsWith('/backups') || clean.startsWith('/jobs') || clean.startsWith('/approvals') || clean.startsWith('/maintenance')) return 'security_logs';
    if (clean.startsWith('/team')) return 'team_access_control';
    if (clean.startsWith('/help-center')) return 'support_center';
    if (clean.startsWith('/content-blocks')) return 'site_settings';
    if (clean.startsWith('/analytics/weak-topics')) return 'reports_analytics';
    if (clean.startsWith('/notification-center')) return 'site_settings';
    if (clean.startsWith('/renewal')) return 'subscription_plans';
    return null;
}

function inferActionFromRequest(method: string, pathname: string): PermissionAction {
    const cleanPath = String(pathname || '').toLowerCase();
    const upperMethod = String(method || '').toUpperCase();
    if (cleanPath.includes('bulk')) return 'bulk';
    if (cleanPath.includes('/export')) return 'export';
    if (cleanPath.includes('publish')) return 'publish';
    if (cleanPath.includes('approve') || cleanPath.includes('reject')) return 'approve';
    if (upperMethod === 'GET' || upperMethod === 'HEAD' || upperMethod === 'OPTIONS') return 'view';
    if (upperMethod === 'POST') return 'create';
    if (upperMethod === 'DELETE') return 'delete';
    return 'edit';
}

const enforceModulePermissions = (req: Request, res: Response, next: NextFunction) => {
    const moduleName = inferModuleFromPath(req.path);
    if (!moduleName) {
        next();
        return;
    }
    const action = inferActionFromRequest(req.method, req.path);
    return requirePermission(moduleName, action)(req as any, res, next);
};

const requireTwoPersonForStudentBulkDelete = (req: Request, res: Response, next: NextFunction) => {
    const action = String((req.body as Record<string, unknown>)?.action || '').trim().toLowerCase();
    if (action !== 'delete') {
        next();
        return;
    }
    return requireTwoPersonApproval('students.bulk_delete', 'students_groups', 'bulk')(req as any, res, next);
};

const requireTwoPersonForPaymentRefund = (req: Request, res: Response, next: NextFunction) => {
    const status = String((req.body as Record<string, unknown>)?.status || '').trim().toLowerCase();
    if (status !== 'refunded') {
        next();
        return;
    }
    return requireTwoPersonApproval('payments.mark_refunded', 'payments', 'approve')(req as any, res, next);
};

const requireTwoPersonForUniversitiesBulkDelete = (req: Request, res: Response, next: NextFunction) => (
    requireTwoPersonApproval('universities.bulk_delete', 'universities', 'bulk')(req as any, res, next)
);

const requireTwoPersonForExamResultPublish = (req: Request, res: Response, next: NextFunction) => (
    requireTwoPersonApproval('exams.publish_result', 'exams', 'publish')(req as any, res, next)
);

const requireTwoPersonForBreakingNewsPublish = (req: Request, res: Response, next: NextFunction) => (
    requireTwoPersonApproval('news.publish_breaking', 'news', 'publish')(req as any, res, next)
);

const requireTwoPersonForNewsDelete = (req: Request, res: Response, next: NextFunction) => (
    requireTwoPersonApproval('news.bulk_delete', 'news', 'bulk')(req as any, res, next)
);

const requireSensitiveExport = (moduleName: string, actionName: string, enforceExportRolePolicy = false) => (
    requireSensitiveAction({
        actionKey: 'students.export',
        moduleName,
        actionName,
        enforceExportRolePolicy,
    })
);

const requireSecurityStepUp = (moduleName: string, actionName: string) => (
    requireSensitiveAction({
        actionKey: 'security.settings_change',
        moduleName,
        actionName,
    })
);

const requireProviderStepUp = (moduleName: string, actionName: string) => (
    requireSensitiveAction({
        actionKey: 'providers.credentials_change',
        moduleName,
        actionName,
    })
);

const requireDestructiveStepUp = (moduleName: string, actionName: string) => (
    requireSensitiveAction({
        actionKey: 'data.destructive_change',
        moduleName,
        actionName,
    })
);

/* All admin routes require auth + appropriate roles */
router.use(authenticate);
router.use(enforceAdminPanelPolicy);
router.use(enforceAdminReadOnlyMode);
router.use(enforceModulePermissions);

router.get('/permissions/matrix', requirePermission('team_access_control', 'view'), (req: Request, res: Response) => {
    const includeMarkdown = String(req.query.format || '').trim().toLowerCase() === 'markdown';
    const responseBody: Record<string, unknown> = {
        modules: Object.keys(ROLE_PERMISSION_MATRIX.superadmin),
        actions: Object.keys(ROLE_PERMISSION_MATRIX.superadmin.site_settings),
        roles: ROLE_PERMISSION_MATRIX,
    };

    if (includeMarkdown) {
        responseBody.markdown = permissionMatrixToMarkdown();
    }

    res.json(responseBody);
});

/* ── Team & Access Control ── */
router.get('/team/members', requirePermission('team_access_control', 'view'), teamGetMembers);
router.post('/team/members', requirePermission('team_access_control', 'create'), teamCreateMember);
router.get('/team/members/:id', requirePermission('team_access_control', 'view'), teamGetMemberById);
router.put('/team/members/:id', requirePermission('team_access_control', 'edit'), teamUpdateMember);
router.post('/team/members/:id/suspend', requirePermission('team_access_control', 'edit'), teamSuspendMember);
router.post('/team/members/:id/activate', requirePermission('team_access_control', 'edit'), teamActivateMember);
router.post('/team/members/:id/reset-password', requirePermission('team_access_control', 'edit'), requireSecurityStepUp('team_access', 'member_reset_password'), teamResetPassword);
router.post('/team/members/:id/revoke-sessions', requirePermission('team_access_control', 'edit'), requireSecurityStepUp('team_access', 'member_revoke_sessions'), teamRevokeSessions);
router.post('/team/members/:id/resend-invite', requirePermission('team_access_control', 'create'), teamResendInvite);

router.get('/team/roles', requirePermission('team_access_control', 'view'), teamGetRoles);
router.post('/team/roles', requirePermission('team_access_control', 'create'), requireSecurityStepUp('team_access', 'role_create'), teamCreateRole);
router.get('/team/roles/:id', requirePermission('team_access_control', 'view'), teamGetRoleById);
router.put('/team/roles/:id', requirePermission('team_access_control', 'edit'), requireSecurityStepUp('team_access', 'role_update'), teamUpdateRole);
router.post('/team/roles/:id/duplicate', requirePermission('team_access_control', 'create'), requireSecurityStepUp('team_access', 'role_duplicate'), teamDuplicateRole);
router.delete('/team/roles/:id', requirePermission('team_access_control', 'delete'), requireSecurityStepUp('team_access', 'role_delete'), teamDeleteRole);

router.get('/team/permissions', requirePermission('team_access_control', 'view'), teamGetPermissions);
router.put('/team/permissions/roles/:id', requirePermission('team_access_control', 'edit'), requireSecurityStepUp('team_access', 'role_permissions_update'), teamUpdateRolePermissions);
router.put('/team/permissions/members/:id/override', requirePermission('team_access_control', 'edit'), teamUpdateMemberOverride);

router.get('/team/approval-rules', requirePermission('team_access_control', 'view'), teamGetApprovalRules);
router.post('/team/approval-rules', requirePermission('team_access_control', 'create'), teamCreateApprovalRule);
router.put('/team/approval-rules/:id', requirePermission('team_access_control', 'edit'), teamUpdateApprovalRule);
router.delete('/team/approval-rules/:id', requirePermission('team_access_control', 'delete'), requireDestructiveStepUp('team_access', 'approval_rule_delete'), teamDeleteApprovalRule);

router.get('/team/activity', requirePermission('team_access_control', 'view'), teamGetActivity);
router.get('/team/activity/:id', requirePermission('team_access_control', 'view'), teamGetActivityById);

router.get('/team/security', requirePermission('team_access_control', 'view'), teamGetSecurityOverview);
router.get('/team/invites', requirePermission('team_access_control', 'view'), teamGetInvites);

router.get('/approvals/pending', requirePermission('team_access_control', 'view'), adminGetPendingApprovals);
router.post('/approvals/:id/approve', requirePermission('team_access_control', 'approve'), adminApprovePendingAction);
router.post('/approvals/:id/reject', requirePermission('team_access_control', 'approve'), adminRejectPendingAction);
router.get('/jobs/runs', requirePermission('site_settings', 'view'), adminGetJobRuns);
router.get('/jobs/health', requirePermission('site_settings', 'view'), adminGetJobHealth);

/* ── Health ── */
router.get('/health', (_req: Request, res: Response) => {
    res.json({ status: 'OK', message: 'Admin API is running', timestamp: new Date().toISOString() });
});
router.get('/dashboard/summary', requirePermission('site_settings', 'view'), adminGetDashboardSummary);
router.get('/openapi/exam-console.json', requirePermission('exams', 'view'), (_req: Request, res: Response) => {
    const candidatePaths = [
        path.resolve(process.cwd(), '../docs/openapi/exam-console.json'),
        path.resolve(process.cwd(), 'docs/openapi/exam-console.json'),
    ];
    const filePath = candidatePaths.find((candidate) => fs.existsSync(candidate));
    if (!filePath) {
        res.status(404).json({ message: 'OpenAPI artifact not found.' });
        return;
    }
    res.sendFile(filePath);
});
router.get('/openapi/question-bank.json', requirePermission('question_bank', 'view'), (_req: Request, res: Response) => {
    const candidatePaths = [
        path.resolve(process.cwd(), '../docs/openapi/question-bank.json'),
        path.resolve(process.cwd(), 'docs/openapi/question-bank.json'),
    ];
    const filePath = candidatePaths.find((candidate) => fs.existsSync(candidate));
    if (!filePath) {
        res.status(404).json({ message: 'OpenAPI artifact not found.' });
        return;
    }
    res.sendFile(filePath);
});
router.get('/openapi/news-system.json', requirePermission('news', 'view'), (_req: Request, res: Response) => {
    const candidatePaths = [
        path.resolve(process.cwd(), '../docs/openapi/news-system.json'),
        path.resolve(process.cwd(), 'docs/openapi/news-system.json'),
    ];
    const filePath = candidatePaths.find((candidate) => fs.existsSync(candidate));
    if (!filePath) {
        res.status(404).json({ message: 'OpenAPI artifact not found.' });
        return;
    }
    res.sendFile(filePath);
});

/* ─────────────────────────────────────────────────────────────
   ROLE-BASED MIDDLEWARE
   superadmin → full access
   admin → nearly full access
   moderator → content management
   editor → content editing
   viewer → read-only
───────────────────────────────────────────────────────────── */

/* ── Site Settings ── */
router.get('/settings', requirePermission('site_settings', 'view'), getSiteSettings);
router.put('/settings', requirePermission('site_settings', 'edit'), updateSiteSettings);
router.get('/settings/site', requirePermission('site_settings', 'view'), getSettings);
router.put('/settings/site', requirePermission('site_settings', 'edit'), uploadMiddleware.fields([{ name: 'logo', maxCount: 1 }, { name: 'favicon', maxCount: 1 }]), updateSettings);
router.get('/settings/home', requirePermission('home_control', 'view'), adminGetHomeSettings);
router.put('/settings/home', requirePermission('home_control', 'edit'), adminUpdateHomeSettings);
router.get('/social-links', requirePermission('site_settings', 'view'), adminGetSocialLinks);
router.post('/social-links', requirePermission('site_settings', 'create'), adminCreateSocialLink);
router.put('/social-links/:id', requirePermission('site_settings', 'edit'), adminUpdateSocialLink);
router.delete('/social-links/:id', requirePermission('site_settings', 'delete'), requireDestructiveStepUp('site_settings', 'social_link_delete'), adminDeleteSocialLink);
router.get('/settings/runtime', requirePermission('site_settings', 'view'), getRuntimeSettings);
router.put('/settings/runtime', requirePermission('site_settings', 'edit'), updateRuntimeSettingsController);
router.get('/settings/admin-ui', requirePermission('site_settings', 'view'), getAdminUiLayoutSettings);
router.put('/settings/admin-ui', requirePermission('site_settings', 'edit'), updateAdminUiLayoutSettings);
router.get('/settings/notifications', requirePermission('notifications', 'view'), adminGetNotificationAutomationSettings);
router.put('/settings/notifications', requirePermission('notifications', 'edit'), adminUpdateNotificationAutomationSettings);
router.get('/settings/analytics', requirePermission('site_settings', 'view'), adminGetAnalyticsSettings);
router.put('/settings/analytics', requirePermission('site_settings', 'edit'), adminUpdateAnalyticsSettings);
router.get('/settings/university', requirePermission('universities', 'view'), getUniversitySettings);
router.put('/settings/university', requirePermission('universities', 'edit'), updateUniversitySettings);

/* ── Security ── */
router.get('/security-settings', requirePermission('security_logs', 'view'), getAdminSecuritySettings);
router.put('/security-settings', requirePermission('security_logs', 'edit'), requireSensitiveAction({ actionKey: 'security.settings_change', moduleName: 'security_center', actionName: 'settings_update' }), updateAdminSecuritySettings);
router.post('/security-settings/reset-defaults', requirePermission('security_logs', 'edit'), requireSensitiveAction({ actionKey: 'security.settings_change', moduleName: 'security_center', actionName: 'settings_reset' }), resetAdminSecuritySettings);
router.post('/security-settings/force-logout-all', requirePermission('security_logs', 'edit'), requireSensitiveAction({ actionKey: 'security.settings_change', moduleName: 'security_center', actionName: 'force_logout_all' }), forceLogoutAllUsers);
router.post('/security-settings/admin-panel-lock', requirePermission('security_logs', 'edit'), requireSensitiveAction({ actionKey: 'security.settings_change', moduleName: 'security_center', actionName: 'admin_panel_lock' }), lockAdminPanel);
router.get('/security/sessions', requirePermission('security_logs', 'view'), getActiveSessions);
router.post('/security/force-logout', requirePermission('security_logs', 'edit'), requireSensitiveAction({ actionKey: 'security.settings_change', moduleName: 'security_center', actionName: 'force_logout_user' }), forceLogoutUser);
router.get('/security/2fa/users', requirePermission('security_logs', 'view'), getTwoFactorUsers);
router.patch('/security/2fa/users/:id', requirePermission('security_logs', 'edit'), requireSensitiveAction({ actionKey: 'security.settings_change', moduleName: 'security_center', actionName: 'update_user_2fa' }), updateTwoFactorUser);
router.post('/security/2fa/users/:id/reset', requirePermission('security_logs', 'edit'), requireSensitiveAction({ actionKey: 'security.settings_change', moduleName: 'security_center', actionName: 'reset_user_2fa' }), resetTwoFactorUser);
router.get('/security/2fa/failures', requirePermission('security_logs', 'view'), getTwoFactorFailures);
router.get('/security/dashboard', requirePermission('security_logs', 'view'), getSecurityDashboardMetrics);
router.get('/audit-logs', requirePermission('security_logs', 'view'), getAuditLogsList);

/* ── Reports & Analytics ── */
router.get('/reports/summary', requirePermission('reports_analytics', 'view'), adminGetReportsSummary);
router.get('/reports/export', requirePermission('reports_analytics', 'export'), requireSensitiveExport('reports', 'summary_export'), trackSensitiveExport({ moduleName: 'reports', actionName: 'summary_export' }), adminExportReportsSummary);
router.get('/reports/analytics', requirePermission('reports_analytics', 'view'), adminGetAnalyticsOverview);
router.get('/reports/events/export', requirePermission('reports_analytics', 'export'), requireSensitiveExport('reports', 'event_logs_export'), trackSensitiveExport({ moduleName: 'reports', actionName: 'event_logs_export' }), adminExportEventLogs);
router.get('/reports/exams/:examId/insights', requirePermission('reports_analytics', 'view'), adminGetExamInsights);
router.get('/reports/exams/:examId/insights/export', requirePermission('reports_analytics', 'export'), requireSensitiveExport('reports', 'exam_insights_export'), trackSensitiveExport({ moduleName: 'reports', actionName: 'exam_insights_export', targetType: 'exam', targetParam: 'examId' }), adminExportExamInsights);

/* ── Exams ── */
router.get('/exams', requirePermission('exams', 'view'), adminGetExams);
router.get('/exams/daily-report', requirePermission('exams', 'view'), adminDailyReport);
router.get('/exams/live-sessions', requirePermission('exams', 'view'), adminGetLiveExamSessions);
router.get('/live/attempts', requirePermission('exams', 'view'), adminGetLiveExamSessions);
router.get('/live/stream', requirePermission('exams', 'view'), adminLiveStream);
router.post('/live/attempts/:attemptId/action', requirePermission('exams', 'edit'), adminLiveAttemptAction);
router.get('/exams/:id', requirePermission('exams', 'view'), adminGetExamById);
router.post('/exams', requirePermission('exams', 'create'), adminCreateExam);
router.post('/exams/sign-banner-upload', requirePermission('exams', 'create'), adminSignExamBannerUpload);
router.post('/exams/:id/clone', requirePermission('exams', 'create'), adminCloneExam);
router.post('/exams/:id/share-link/regenerate', requirePermission('exams', 'edit'), adminRegenerateExamShareLink);
router.put('/exams/:id', requirePermission('exams', 'edit'), adminUpdateExam);
router.delete('/exams/:id', requirePermission('exams', 'delete'), requireDestructiveStepUp('exams', 'exam_delete'), adminDeleteExam);
router.patch('/exams/:id/publish', requirePermission('exams', 'publish'), adminPublishExam);
router.patch('/exams/:id/publish-result', requirePermission('exams', 'publish'), requireTwoPersonForExamResultPublish, adminPublishResult);
router.patch('/exams/:examId/force-submit/:studentId', requirePermission('exams', 'edit'), adminForceSubmit);
router.patch('/exams/evaluate/:resultId', requirePermission('exams', 'edit'), adminEvaluateResult);
router.get('/exams/:examId/results', requirePermission('exams', 'view'), adminGetExamResults);
router.get('/exams/:examId/analytics', requirePermission('exams', 'view'), adminGetExamAnalytics);
router.get('/exams/:examId/export', requirePermission('exams', 'export'), requireSensitiveAction({ actionKey: 'students.export', moduleName: 'reports', actionName: 'exam_results_export', enforceExportRolePolicy: true }), adminExportExamResults);
router.get('/exams/:id/results/import-template', requirePermission('exams', 'view'), adminDownloadExamResultsImportTemplate);
router.post('/exams/:id/results/import', requirePermission('exams', 'create'), upload.single('file'), adminImportExamResults);
router.post('/exams/:id/results/import-external', requirePermission('exams', 'create'), upload.single('file'), adminImportExternalExamResults);
router.post('/exams/:id/import/preview', requirePermission('exams', 'create'), upload.single('file'), adminPreviewExamImport);
router.post('/exams/:id/import/commit', requirePermission('exams', 'create'), adminCommitExamImport);
router.get('/exams/:id/import/logs', requirePermission('exams', 'view'), adminGetExamImportLogs);
router.post('/exams/:id/profile-sync/run', requirePermission('exams', 'edit'), adminRunExamProfileSync);
router.get('/exams/:id/profile-sync/logs', requirePermission('exams', 'view'), adminGetExamProfileSyncLogs);
router.get('/exams/:id/reports/export', requirePermission('exams', 'export'), requireSensitiveAction({ actionKey: 'students.export', moduleName: 'reports', actionName: 'exam_report_export', enforceExportRolePolicy: true }), adminExportExamReport);
router.get('/exams/:id/events/export', requirePermission('exams', 'export'), requireSensitiveExport('reports', 'exam_events_export'), trackSensitiveExport({ moduleName: 'reports', actionName: 'exam_events_export', targetType: 'exam', targetParam: 'id' }), adminExportExamEvents);
router.post('/exams/:id/preview/start', requirePermission('exams', 'create'), adminStartExamPreview);
router.patch('/exams/:examId/reset-attempt/:userId', requirePermission('exams', 'edit'), adminResetExamAttempt);
router.get('/exam-import-templates', requirePermission('exams', 'view'), adminGetExamImportTemplates);
router.post('/exam-import-templates', requirePermission('exams', 'create'), adminCreateExamImportTemplate);
router.put('/exam-import-templates/:id', requirePermission('exams', 'edit'), adminUpdateExamImportTemplate);
router.delete('/exam-import-templates/:id', requirePermission('exams', 'delete'), requireDestructiveStepUp('exams', 'exam_import_template_delete'), adminDeleteExamImportTemplate);
router.get('/exam-mapping-profiles', requirePermission('exams', 'view'), adminGetExamMappingProfiles);
router.post('/exam-mapping-profiles', requirePermission('exams', 'create'), adminCreateExamMappingProfile);
router.put('/exam-mapping-profiles/:id', requirePermission('exams', 'edit'), adminUpdateExamMappingProfile);
router.delete('/exam-mapping-profiles/:id', requirePermission('exams', 'delete'), requireDestructiveStepUp('exams', 'exam_mapping_profile_delete'), adminDeleteExamMappingProfile);
router.get('/exam-centers', requirePermission('exams', 'view'), adminGetExamCenters);
router.post('/exam-centers', requirePermission('exams', 'create'), adminCreateExamCenter);
router.put('/exam-centers/:id', requirePermission('exams', 'edit'), adminUpdateExamCenter);
router.delete('/exam-centers/:id', requirePermission('exams', 'delete'), requireDestructiveStepUp('exams', 'exam_center_delete'), adminDeleteExamCenter);
router.get('/exam-center-settings', requirePermission('exams', 'view'), adminGetExamCenterSettings);
router.put('/exam-center-settings', requirePermission('exams', 'edit'), adminUpdateExamCenterSettings);

/* ── Questions (per-exam) ── */
router.get('/exams/:examId/questions', requirePermission('question_bank', 'view'), adminGetQuestions);
router.post('/exams/:examId/questions', requirePermission('question_bank', 'create'), adminCreateQuestion);
router.put('/exams/:examId/questions/reorder', requirePermission('question_bank', 'edit'), adminReorderQuestions);
router.put('/exams/:examId/questions/:questionId', requirePermission('question_bank', 'edit'), adminUpdateQuestion);
router.delete('/exams/:examId/questions/:questionId', requirePermission('question_bank', 'delete'), requireDestructiveStepUp('exams', 'exam_question_delete'), adminDeleteQuestion);
router.post('/exams/:examId/questions/import-excel', requirePermission('question_bank', 'create'), adminImportQuestionsFromExcel);
router.get('/exams/:id/questions/template.xlsx', requirePermission('question_bank', 'view'), async (_req: Request, res: Response) => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Questions');
    ws.columns = [
        { header: 'question_en', key: 'question_en', width: 40 },
        { header: 'question_bn', key: 'question_bn', width: 40 },
        { header: 'optionA_en', key: 'optionA_en', width: 20 },
        { header: 'optionA_bn', key: 'optionA_bn', width: 20 },
        { header: 'optionB_en', key: 'optionB_en', width: 20 },
        { header: 'optionB_bn', key: 'optionB_bn', width: 20 },
        { header: 'optionC_en', key: 'optionC_en', width: 20 },
        { header: 'optionC_bn', key: 'optionC_bn', width: 20 },
        { header: 'optionD_en', key: 'optionD_en', width: 20 },
        { header: 'optionD_bn', key: 'optionD_bn', width: 20 },
        { header: 'correctKey', key: 'correctKey', width: 10 },
        { header: 'marks', key: 'marks', width: 8 },
        { header: 'negativeMarks', key: 'negativeMarks', width: 12 },
        { header: 'explanation_en', key: 'explanation_en', width: 30 },
        { header: 'explanation_bn', key: 'explanation_bn', width: 30 },
    ];
    ws.addRow({ question_en: 'What is 2+2?', optionA_en: '3', optionB_en: '4', optionC_en: '5', optionD_en: '6', correctKey: 'B', marks: 1 });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="questions_template.xlsx"');
    await wb.xlsx.write(res);
    res.end();
});

/* ── Global Question Bank ── */
router.get('/question-bank', requirePermission('question_bank', 'view'), getQuestions);
router.get('/question-bank/:id', requirePermission('question_bank', 'view'), getQuestionById);
router.post('/question-bank', requirePermission('question_bank', 'create'), createQuestion);
router.put('/question-bank/:id', requirePermission('question_bank', 'edit'), updateQuestion);
router.delete('/question-bank/:id', requirePermission('question_bank', 'delete'), requireDestructiveStepUp('question_bank', 'question_delete'), deleteQuestion);
router.post('/question-bank/:id/approve', requirePermission('question_bank', 'approve'), approveQuestion);
router.post('/question-bank/:id/lock', requirePermission('question_bank', 'edit'), lockQuestion);
router.post('/question-bank/:id/revert/:revisionNo', requirePermission('question_bank', 'edit'), revertQuestionRevision);
router.post('/question-bank/search/similar', requirePermission('question_bank', 'view'), searchSimilarQuestions);
router.post('/question-bank/bulk-import', requirePermission('question_bank', 'bulk'), upload.single('file'), bulkImportQuestions);
router.get('/question-bank/import/:jobId', requirePermission('question_bank', 'view'), getQuestionImportJob);
router.post('/question-bank/export', requirePermission('question_bank', 'export'), requireSensitiveExport('question_bank', 'bank_export'), trackSensitiveExport({ moduleName: 'question_bank', actionName: 'bank_export' }), exportQuestions);
router.post('/question-bank/media/sign-upload', requirePermission('question_bank', 'create'), signQuestionMediaUpload);
router.post('/question-bank/media', requirePermission('question_bank', 'create'), createQuestionMedia);
// Consolidated under /question-bank

/* ── Universities (Full CRUD) ── */
router.get('/universities', authorize('superadmin', 'admin', 'moderator', 'editor'), adminGetAllUniversities);
router.get('/universities/categories', authorize('superadmin', 'admin', 'moderator', 'editor'), adminGetUniversityCategories);
router.get('/university-categories', authorize('superadmin', 'admin', 'moderator', 'editor'), adminGetUniversityCategoryMaster);
router.post('/university-categories', authorize('superadmin', 'admin', 'moderator'), adminCreateUniversityCategory);
router.put('/university-categories/:id', authorize('superadmin', 'admin', 'moderator'), adminUpdateUniversityCategory);
router.post('/university-categories/:id/sync-config', authorize('superadmin', 'admin', 'moderator'), adminSyncUniversityCategoryConfig);
router.patch('/university-categories/:id/toggle', authorize('superadmin', 'admin', 'moderator'), adminToggleUniversityCategory);
router.delete('/university-categories/:id', authorize('superadmin', 'admin'), requireDestructiveStepUp('universities', 'category_delete'), adminDeleteUniversityCategory);
router.get('/universities/export', authorize('superadmin', 'admin', 'moderator', 'editor'), requireSensitiveExport('universities', 'export'), trackSensitiveExport({ moduleName: 'universities', actionName: 'export' }), adminExportUniversities);
router.get('/universities/template.xlsx', authorize('superadmin', 'admin', 'moderator', 'editor'), adminDownloadUniversityImportTemplate);
router.put('/universities/reorder-featured', authorize('superadmin', 'admin', 'moderator'), adminReorderFeaturedUniversities);
router.post('/universities/bulk-delete', authorize('superadmin', 'admin'), requireDestructiveStepUp('universities', 'bulk_delete'), requireTwoPersonForUniversitiesBulkDelete, adminBulkDeleteUniversities);
router.patch('/universities/bulk-update', authorize('superadmin', 'admin', 'moderator'), adminBulkUpdateUniversities);
router.get('/universities/import/template', authorize('superadmin', 'admin', 'moderator', 'editor'), adminDownloadUniversityImportTemplate);
router.post('/universities/import', authorize('superadmin', 'admin'), upload.single('file'), adminInitUniversityImport);
router.post('/universities/import/init', authorize('superadmin', 'admin'), upload.single('file'), adminInitUniversityImport);
router.post('/universities/import/:jobId/validate', authorize('superadmin', 'admin', 'moderator'), adminValidateUniversityImport);
router.post('/universities/import/:jobId/commit', authorize('superadmin', 'admin'), adminCommitUniversityImport);
router.get('/universities/import/:jobId/errors.csv', authorize('superadmin', 'admin', 'moderator'), adminDownloadUniversityImportErrors);
router.get('/universities/import/:jobId', authorize('superadmin', 'admin', 'moderator', 'editor'), adminGetUniversityImportJob);
router.get('/universities/:id', authorize('superadmin', 'admin', 'moderator', 'editor'), adminGetUniversityById);
router.post('/universities', authorize('superadmin', 'admin', 'moderator'), adminCreateUniversity);
router.put('/universities/:id', authorize('superadmin', 'admin', 'moderator'), adminUpdateUniversity);
router.delete('/universities/:id', authorize('superadmin', 'admin'), canDeleteData, requireDestructiveStepUp('universities', 'university_delete'), adminDeleteUniversity);
router.patch('/universities/:id/toggle-status', authorize('superadmin', 'admin'), adminToggleUniversityStatus);
router.post('/universities/import-excel', authorize('superadmin', 'admin'), upload.single('file'), adminBulkImportUniversities);

/* â”€â”€ University Clusters â”€â”€ */
router.get('/university-clusters', authorize('superadmin', 'admin', 'moderator', 'editor'), adminGetUniversityClusters);
router.post('/university-clusters', authorize('superadmin', 'admin', 'moderator'), adminCreateUniversityCluster);
router.get('/university-clusters/:id', authorize('superadmin', 'admin', 'moderator', 'editor'), adminGetUniversityClusterById);
router.put('/university-clusters/:id', authorize('superadmin', 'admin', 'moderator'), adminUpdateUniversityCluster);
router.post('/university-clusters/:id/members/resolve', authorize('superadmin', 'admin', 'moderator'), adminResolveUniversityClusterMembers);
router.patch('/university-clusters/:id/sync-dates', authorize('superadmin', 'admin', 'moderator'), adminSyncUniversityClusterDates);
router.delete('/university-clusters/:id', authorize('superadmin', 'admin'), requireDestructiveStepUp('universities', 'cluster_delete'), adminDeleteUniversityCluster);
router.delete('/university-clusters/:id/permanent', authorize('superadmin', 'admin'), requireDestructiveStepUp('universities', 'cluster_delete'), adminPermanentDeleteUniversityCluster);

/* ── Legacy News CRUD ── */

/* ── News Hub (spec aliases) ── */
router.get('/news/dashboard', requirePermission('news', 'view'), adminNewsV2Dashboard);
router.post('/news/fetch-now', requirePermission('news', 'create'), adminNewsV2FetchNow);
router.get('/news', requirePermission('news', 'view'), adminNewsV2GetItems);
router.post('/news', requirePermission('news', 'create'), adminNewsV2CreateItem);
router.post('/news/bulk-approve', requirePermission('news', 'bulk'), adminNewsV2BulkApprove);
router.post('/news/bulk-reject', requirePermission('news', 'bulk'), adminNewsV2BulkReject);
router.get('/news/settings', requirePermission('news', 'view'), adminNewsV2GetAllSettings);
router.put('/news/settings', requirePermission('news', 'edit'), adminNewsV2UpdateAllSettings);
router.patch('/news/settings', requirePermission('news', 'edit'), adminNewsV2UpdateAllSettings);
router.get('/news/settings/appearance', requirePermission('news', 'view'), adminNewsV2GetAppearanceSettings);
router.put('/news/settings/appearance', requirePermission('news', 'edit'), adminNewsV2UpdateAppearanceSettings);
router.get('/news/settings/ai', requirePermission('news', 'view'), adminNewsV2GetAiSettings);
router.put('/news/settings/ai', requirePermission('news', 'edit'), adminNewsV2UpdateAiSettings);
router.get('/news/settings/share', requirePermission('news', 'view'), adminNewsV2GetShareSettings);
router.put('/news/settings/share', requirePermission('news', 'edit'), adminNewsV2UpdateShareSettings);
router.get('/news/notices', requirePermission('support_center', 'view'), adminGetNotices);
router.post('/news/notices', requirePermission('support_center', 'create'), adminCreateNotice);
router.patch('/news/notices/:id/toggle', requirePermission('support_center', 'edit'), adminToggleNotice);
router.get('/news/media', requirePermission('news', 'view'), adminNewsV2GetMedia);
router.post('/news/media/upload', requirePermission('news', 'create'), uploadMiddleware.single('file'), adminNewsV2UploadMedia);
router.post('/news/media/from-url', requirePermission('news', 'create'), adminNewsV2MediaFromUrl);
router.delete('/news/media/:id', requirePermission('news', 'delete'), requireDestructiveStepUp('news', 'news_media_delete'), adminNewsV2DeleteMedia);
router.get('/news/export', requirePermission('news', 'export'), requireSensitiveExport('news', 'news_export'), trackSensitiveExport({ moduleName: 'news', actionName: 'news_export' }), adminNewsV2ExportNews);
router.get('/news/exports/sources', requirePermission('news', 'export'), requireSensitiveExport('news', 'rss_sources_export'), trackSensitiveExport({ moduleName: 'news', actionName: 'rss_sources_export' }), adminNewsV2ExportSources);
router.get('/news/exports/logs', requirePermission('news', 'export'), requireSensitiveExport('news', 'news_logs_export'), trackSensitiveExport({ moduleName: 'news', actionName: 'news_logs_export' }), adminNewsV2ExportLogs);
router.get('/news/audit-logs', requirePermission('news', 'view'), adminNewsV2GetAuditLogs);
router.get('/news/sources', requirePermission('news', 'view'), adminNewsV2GetSources);
router.post('/news/sources', requirePermission('news', 'create'), adminNewsV2CreateSource);
router.put('/news/sources/:id', requirePermission('news', 'edit'), adminNewsV2UpdateSource);
router.delete('/news/sources/:id', requirePermission('news', 'delete'), requireDestructiveStepUp('news', 'source_delete'), adminNewsV2DeleteSource);
router.post('/news/sources/:id/test', requirePermission('news', 'view'), adminNewsV2TestSource);
router.post('/news/sources/reorder', requirePermission('news', 'edit'), adminNewsV2ReorderSources);
router.post('/news/:id/ai-check', requirePermission('news', 'view'), adminNewsV2AiCheckItem);
router.post('/news/:id/approve', requirePermission('news', 'approve'), adminNewsV2Approve);
router.post('/news/:id/approve-publish', requirePermission('news', 'approve'), adminNewsV2ApprovePublish);
router.post('/news/:id/reject', requirePermission('news', 'approve'), adminNewsV2Reject);
router.post('/news/:id/schedule', requirePermission('news', 'publish'), adminNewsV2Schedule);
router.post('/news/:id/publish-now', requirePermission('news', 'publish'), adminNewsV2PublishNow);
router.post('/news/:id/publish-send', requirePermission('news', 'publish'), requireSensitiveAction({ actionKey: 'news.publish_breaking', moduleName: 'news', actionName: 'publish_send' }), adminNewsV2PublishSend);
router.post('/news/:id/move-to-draft', requirePermission('news', 'edit'), adminNewsV2MoveToDraft);
router.post('/news/:id/archive', requirePermission('news', 'edit'), adminNewsV2Archive);
router.post('/news/:id/restore', requirePermission('news', 'edit'), adminNewsV2RestoreItem);
router.post('/news/:id/convert-to-notice', requirePermission('support_center', 'create'), adminNewsV2ConvertToNotice);
router.post('/news/:id/publish-anyway', requirePermission('news', 'publish'), adminNewsV2PublishAnyway);
router.post('/news/:id/merge', requirePermission('news', 'edit'), adminNewsV2MergeDuplicate);
router.post('/news/:id/submit-review', requirePermission('news', 'edit'), adminNewsV2SubmitReview);
router.get('/news/:id', requirePermission('news', 'view'), adminNewsV2GetItemById);
router.put('/news/:id', requirePermission('news', 'edit'), adminNewsV2UpdateItem);
router.delete('/news/:id', requirePermission('news', 'delete'), requireDestructiveStepUp('news', 'news_delete'), requireTwoPersonForNewsDelete, adminNewsV2DeleteItem);
router.delete('/news/:id/purge', requirePermission('news', 'delete'), requireDestructiveStepUp('news', 'news_delete'), requireTwoPersonForNewsDelete, adminNewsV2PurgeItem);

/* ── News Categories ── */
router.get('/news-category', requirePermission('news', 'view'), adminGetNewsCategories);
router.post('/news-category', requirePermission('news', 'create'), adminCreateNewsCategory);
router.put('/news-category/:id', requirePermission('news', 'edit'), adminUpdateNewsCategory);
router.delete('/news-category/:id', requirePermission('news', 'delete'), requireDestructiveStepUp('news', 'category_delete'), adminDeleteNewsCategory);
router.patch('/news-category/:id/toggle', requirePermission('news', 'edit'), adminToggleNewsCategory);

/* ── News V2 ── */


/* ── Service Categories ── */
router.get('/service-categories', requirePermission('resources', 'view'), adminGetCategories);
router.post('/service-categories', requirePermission('resources', 'create'), adminCreateCategory);
router.put('/service-categories/:id', requirePermission('resources', 'edit'), adminUpdateCategory);
router.delete('/service-categories/:id', requirePermission('resources', 'delete'), requireDestructiveStepUp('services', 'service_category_delete'), adminDeleteCategory);

/* ── Services CRUD ── */
router.get('/services', requirePermission('resources', 'view'), adminGetServices);
router.post('/services', requirePermission('resources', 'create'), adminCreateService);
router.put('/services/:id', requirePermission('resources', 'edit'), adminUpdateService);
router.delete('/services/:id', requirePermission('resources', 'delete'), requireDestructiveStepUp('services', 'service_delete'), adminDeleteService);
router.post('/services/reorder', requirePermission('resources', 'edit'), adminReorderServices);
router.patch('/services/:id/toggle-status', requirePermission('resources', 'edit'), adminToggleServiceStatus);
router.patch('/services/:id/toggle-featured', requirePermission('resources', 'edit'), adminToggleServiceFeatured);

/* ── Resources CRUD ── */
router.get('/resources', requirePermission('resources', 'view'), adminGetResources);
router.post('/resources', requirePermission('resources', 'create'), adminCreateResource);
router.put('/resources/:id', requirePermission('resources', 'edit'), adminUpdateResource);
router.delete('/resources/:id', requirePermission('resources', 'delete'), requireDestructiveStepUp('resources', 'resource_delete'), adminDeleteResource);
router.patch('/resources/:id/toggle-publish', requirePermission('resources', 'publish'), adminToggleResourcePublish);
router.patch('/resources/:id/toggle-featured', requirePermission('resources', 'edit'), adminToggleResourceFeatured);
router.get('/resource-settings', requirePermission('resources', 'view'), adminGetResourceSettings);
router.put('/resource-settings', requirePermission('resources', 'edit'), adminUpdateResourceSettings);

/* ── Contact Messages ── */
router.get('/contact-messages', requirePermission('support_center', 'view'), adminGetContactMessages);
router.get('/contact-messages/:id', requirePermission('support_center', 'view'), adminGetContactMessageById);
router.patch('/contact-messages/:id', requirePermission('support_center', 'edit'), adminUpdateContactMessage);
router.post('/contact-messages/:id/mark-read', requirePermission('support_center', 'edit'), adminMarkContactMessageRead);
router.post('/contact-messages/:id/resolve', requirePermission('support_center', 'approve'), adminResolveContactMessage);
router.post('/contact-messages/:id/archive', requirePermission('support_center', 'delete'), requireDestructiveStepUp('contact_messages', 'contact_message_archive'), adminArchiveContactMessage);
router.delete('/contact-messages/:id', requirePermission('support_center', 'delete'), requireDestructiveStepUp('contact_messages', 'contact_message_delete'), adminDeleteContactMessage);

/* ── Banners & Config ── */
router.get('/banners', requirePermission('banner_manager', 'view'), adminGetBanners);
router.get('/banners/active', requirePermission('banner_manager', 'view'), adminGetBanners);
router.post('/banners/sign-upload', requirePermission('banner_manager', 'create'), adminSignBannerUpload);
router.post('/banners', requirePermission('banner_manager', 'create'), adminCreateBanner);
router.put('/banners/:id', requirePermission('banner_manager', 'edit'), adminUpdateBanner);
router.delete('/banners/:id', requirePermission('banner_manager', 'delete'), requireDestructiveStepUp('site_settings', 'banner_delete'), adminDeleteBanner);
router.put('/banners/:id/publish', requirePermission('banner_manager', 'publish'), adminPublishBanner);

/* ── Home Alerts (Live Ticker) ── */
router.get('/home-alerts', requirePermission('home_control', 'view'), adminGetAlerts);
router.post('/home-alerts', requirePermission('home_control', 'create'), adminCreateAlert);
router.put('/home-alerts/:id', requirePermission('home_control', 'edit'), adminUpdateAlert);
router.delete('/home-alerts/:id', requirePermission('home_control', 'delete'), requireDestructiveStepUp('site_settings', 'home_alert_delete'), adminDeleteAlert);
router.patch('/home-alerts/:id/toggle', requirePermission('home_control', 'edit'), adminToggleAlert);
router.put('/home-alerts/:id/publish', requirePermission('home_control', 'publish'), adminPublishAlert);
// Consolidated under /home-alerts
// Deprecated aliases kept temporarily for legacy callers.
router.get('/alerts', requirePermission('home_control', 'view'), adminGetAlerts);
router.post('/alerts', requirePermission('home_control', 'create'), adminCreateAlert);
router.put('/alerts/:id', requirePermission('home_control', 'edit'), adminUpdateAlert);
router.delete('/alerts/:id', requirePermission('home_control', 'delete'), requireDestructiveStepUp('site_settings', 'alert_delete'), adminDeleteAlert);
router.patch('/alerts/:id/toggle', requirePermission('home_control', 'edit'), adminToggleAlert);
router.put('/alerts/:id/publish', requirePermission('home_control', 'publish'), adminPublishAlert);

router.get('/home-config', requirePermission('home_control', 'view'), getHomeConfig);
router.put('/home-config', requirePermission('home_control', 'edit'), updateHomeConfig);

/* ── Dynamic Home System ── */
router.get('/home-settings', requirePermission('home_control', 'view'), adminGetHomeSettings);
router.put('/home-settings', requirePermission('home_control', 'edit'), adminUpdateHomeSettings);
router.get('/home-settings/defaults', requirePermission('home_control', 'view'), adminGetHomeSettingsDefaults);
router.post('/home-settings/reset-section', requirePermission('home_control', 'edit'), adminResetHomeSettingsSection);
router.put('/home/settings', requirePermission('site_settings', 'edit'), uploadMiddleware.fields([{ name: 'logo', maxCount: 1 }, { name: 'favicon', maxCount: 1 }]), updateSettings);
router.put('/home', requirePermission('home_control', 'edit'), updateHome);
router.put('/home/hero', requirePermission('home_control', 'edit'), uploadMiddleware.single('file'), updateHero);
router.put('/home/banner', requirePermission('banner_manager', 'edit'), uploadMiddleware.single('image'), updatePromotionalBanner);
router.put('/home/announcement', requirePermission('home_control', 'edit'), updateAnnouncement);
router.put('/home/stats', requirePermission('site_settings', 'edit'), updateStats);

/* ── Media ── */
router.post('/upload', requirePermission('site_settings', 'create'), uploadMiddleware.single('file'), uploadMedia);

/* ── Student & User Management ── */
router.get('/users/admin/profile', requirePermission('team_access_control', 'view'), adminGetAdminProfile);
router.put('/users/admin/profile', requirePermission('team_access_control', 'edit'), adminUpdateAdminProfile);

router.get('/users', requirePermission('team_access_control', 'view'), adminGetUsers);
router.get('/users/activity', requirePermission('team_access_control', 'view'), adminGetUserActivity);
router.get('/users/stream', requirePermission('team_access_control', 'view'), adminUserStream);
router.get('/users/:id', requirePermission('team_access_control', 'view'), adminGetUserById);
router.post('/users', requirePermission('team_access_control', 'create'), adminCreateUser);
router.put('/users/:id', requirePermission('team_access_control', 'edit'), adminUpdateUser);
router.put('/users/:id/role', requirePermission('team_access_control', 'edit'), requireSecurityStepUp('users', 'role_update'), adminUpdateUserRole);
router.patch('/users/:id/toggle-status', requirePermission('team_access_control', 'edit'), adminToggleUserStatus);
router.delete('/users/:id', requirePermission('team_access_control', 'delete'), requireDestructiveStepUp('users', 'user_delete'), adminDeleteUser);
router.patch('/users/:id/set-status', requirePermission('team_access_control', 'edit'), adminSetUserStatus);
router.patch('/users/:id/permissions', requirePermission('team_access_control', 'edit'), adminSetUserPermissions);
router.post('/users/bulk-action', requirePermission('team_access_control', 'bulk'), adminBulkUserAction);
router.get('/audit-logs', requirePermission('security_logs', 'view'), (req: Request, res: Response) => {
    const scope = String(req.query.scope || '').trim().toLowerCase();
    const moduleScope = String(req.query.module || '').trim().toLowerCase();
    if (scope === 'news' || moduleScope === 'news') {
        void adminNewsV2GetAuditLogs(req as any, res);
        return;
    }

    const role = String((req as any)?.user?.role || '').toLowerCase();
    if (role !== 'superadmin') {
        forbidden(res, { message: 'Only super admin can access system audit logs.' });
        return;
    }

    void adminGetSystemAuditLogs(req as any, res);
});

/* ── Extended Student Management ── */
router.get('/students', requirePermission('students_groups', 'view'), adminGetStudents);
router.post('/students', requirePermission('students_groups', 'create'), adminCreateStudent);
router.put('/students/:id', requirePermission('students_groups', 'edit'), adminUpdateStudent);
router.post('/students/bulk-action', requirePermission('students_groups', 'bulk'), requireTwoPersonForStudentBulkDelete, adminBulkStudentAction);
router.post('/students/bulk-import', requirePermission('students_groups', 'create'), upload.single('file'), adminBulkImportStudents);
router.put('/students/:id/subscription', requirePermission('students_groups', 'edit'), subscriptionActionRateLimiter, adminLegacyAssignStudentSubscription);
/* ── Extracted Admin Features ── */
router.post('/users/:id/reset-password', requirePermission('team_access_control', 'edit'), requireSecurityStepUp('users', 'password_reset'), adminResetUserPassword);
router.post('/students/:id/reset-password', requirePermission('students_groups', 'edit'), requireSecurityStepUp('students_groups', 'password_reset'), adminResetUserPassword);
router.get('/students/profile-requests', requirePermission('students_groups', 'view'), adminGetProfileUpdateRequests);
router.post('/students/profile-requests/:id/approve', requirePermission('students_groups', 'approve'), adminApproveProfileUpdateRequest);
router.post('/students/profile-requests/:id/reject', requirePermission('students_groups', 'approve'), adminRejectProfileUpdateRequest);

/* ── Student Import/Export ── */
router.get('/students/import/template', requirePermission('students_groups', 'view'), adminDownloadStudentTemplate);
router.post('/students/import/init', requirePermission('students_groups', 'create'), upload.single('file'), adminInitStudentImport);
router.get('/students/import/:id', requirePermission('students_groups', 'view'), adminGetStudentImportJob);
router.post('/students/import/:id/validate', requirePermission('students_groups', 'edit'), adminValidateStudentImport);
router.post('/students/import/:id/commit', requirePermission('students_groups', 'create'), adminCommitStudentImport);

router.get('/user-stream', requirePermission('team_access_control', 'view'), adminUserStream);
router.get('/student-groups', requirePermission('students_groups', 'view'), adminGetStudentGroups);
router.get('/student-groups/export', requirePermission('students_groups', 'export'), requireSensitiveExport('students_groups', 'student_groups_export', true), trackSensitiveExport({ moduleName: 'students_groups', actionName: 'student_groups_export' }), adminExportStudentGroups);
router.post('/student-groups/import', requirePermission('students_groups', 'create'), upload.single('file'), adminImportStudentGroups);
router.post('/student-groups', requirePermission('students_groups', 'create'), adminCreateStudentGroup);
router.put('/student-groups/:id', requirePermission('students_groups', 'edit'), adminUpdateStudentGroup);
router.delete('/student-groups/:id', requirePermission('students_groups', 'delete'), requireDestructiveStepUp('students_groups', 'student_group_delete'), adminDeleteStudentGroup);

/* ── Subscription Plans ── */
router.get('/subscription-plans', requirePermission('subscription_plans', 'view'), adminGetSubscriptionPlans);
router.get('/subscription-plans/export', requirePermission('subscription_plans', 'export'), requireSensitiveExport('subscription_plans', 'plans_export'), trackSensitiveExport({ moduleName: 'subscription_plans', actionName: 'plans_export' }), adminExportSubscriptionPlans);
router.post('/subscription-plans/:id/duplicate', requirePermission('subscription_plans', 'create'), adminDuplicateSubscriptionPlan);
router.get('/subscription-plans/:id', requirePermission('subscription_plans', 'view'), adminGetSubscriptionPlanById);
router.post('/subscription-plans', requirePermission('subscription_plans', 'create'), adminCreateSubscriptionPlan);
router.put('/subscription-plans/reorder', requirePermission('subscription_plans', 'edit'), adminReorderSubscriptionPlans);
router.put('/subscription-plans/:id', requirePermission('subscription_plans', 'edit'), adminUpdateSubscriptionPlan);
router.delete('/subscription-plans/:id', requirePermission('subscription_plans', 'delete'), requireDestructiveStepUp('subscription_plans', 'plan_delete'), adminDeleteSubscriptionPlan);
router.put('/subscription-plans/:id/toggle', requirePermission('subscription_plans', 'edit'), adminToggleSubscriptionPlan);
router.patch('/subscription-plans/:id/toggle', requirePermission('subscription_plans', 'edit'), adminToggleSubscriptionPlan);
router.put('/subscription-plans/:id/toggle-featured', requirePermission('subscription_plans', 'edit'), adminToggleSubscriptionPlanFeatured);
router.get('/subscription-settings', requirePermission('subscription_plans', 'view'), adminGetSubscriptionSettings);
router.put('/subscription-settings', requirePermission('subscription_plans', 'edit'), adminUpdateSubscriptionSettings);

router.get('/user-subscriptions', requirePermission('subscription_plans', 'view'), adminGetUserSubscriptions);
router.post('/user-subscriptions/create', requirePermission('subscription_plans', 'create'), adminCreateUserSubscription);
router.put('/user-subscriptions/:id/activate', requirePermission('subscription_plans', 'approve'), adminActivateUserSubscription);
router.put('/user-subscriptions/:id/suspend', requirePermission('subscription_plans', 'approve'), adminSuspendUserSubscriptionById);
router.put('/user-subscriptions/:id/expire', requirePermission('subscription_plans', 'approve'), adminExpireUserSubscription);
router.get('/user-subscriptions/export', requirePermission('subscription_plans', 'export'), requireSensitiveExport('subscription_plans', 'user_subscriptions_export', true), trackSensitiveExport({ moduleName: 'subscription_plans', actionName: 'user_subscriptions_export' }), adminExportSubscriptions);
router.post('/subscriptions/assign', requirePermission('subscription_plans', 'create'), subscriptionActionRateLimiter, adminAssignSubscription);
router.post('/subscriptions/suspend', requirePermission('subscription_plans', 'approve'), subscriptionActionRateLimiter, adminSuspendSubscription);
router.get('/subscriptions/export', requirePermission('subscription_plans', 'export'), requireSensitiveExport('subscription_plans', 'subscriptions_export', true), trackSensitiveExport({ moduleName: 'subscription_plans', actionName: 'subscriptions_export' }), adminExportSubscriptions);

/* ── Student LTV ── */
router.get('/students/:id/ltv', requirePermission('finance_center', 'view'), adminGetStudentLtv);

/* ── Manual Payments ── */
router.get('/payments', requirePermission('payments', 'view'), adminGetPayments);
router.get('/payments/export', requirePermission('payments', 'export'), requireSensitiveExport('payments', 'payments_export', true), trackSensitiveExport({ moduleName: 'payments', actionName: 'payments_export' }), adminExportPayments);
router.post('/payments', requirePermission('payments', 'create'), adminCreatePayment);
router.put('/payments/:id', requirePermission('payments', 'approve'), requireTwoPersonForPaymentRefund, adminUpdatePayment);
router.get('/students/:id/payments', requirePermission('payments', 'view'), adminGetStudentPayments);

/* ── Expenses ── */
router.get('/finance/payments/:id/history', requirePermission('finance_center', 'view'), adminGetPayments); // Placeholder
router.post('/finance/payments/:id/approve', requirePermission('finance_center', 'approve'), adminApprovePayment);
router.get('/expenses', requirePermission('finance_center', 'view'), adminGetExpenses);
router.post('/expenses', requirePermission('finance_center', 'create'), adminCreateExpense);
router.put('/expenses/:id', requirePermission('finance_center', 'edit'), adminUpdateExpense);

/* ── Staff Payouts ── */
router.get('/staff-payouts', requirePermission('finance_center', 'view'), adminGetStaffPayouts);
router.post('/staff-payouts', requirePermission('finance_center', 'create'), adminCreateStaffPayout);

/* ── Finance Analytics ── */
router.get('/finance/summary', requirePermission('finance_center', 'view'), adminGetFinanceSummary);
router.get('/finance/revenue-series', requirePermission('finance_center', 'view'), adminGetFinanceRevenueSeries);
router.get('/finance/student-growth', requirePermission('finance_center', 'view'), adminGetFinanceStudentGrowth);
router.get('/finance/plan-distribution', requirePermission('finance_center', 'view'), adminGetFinancePlanDistribution);
router.get('/finance/expense-breakdown', requirePermission('finance_center', 'view'), adminGetFinanceExpenseBreakdown);
router.get('/finance/cashflow', requirePermission('finance_center', 'view'), adminGetFinanceCashflow);
router.get('/finance/test-board', requirePermission('finance_center', 'view'), adminGetFinanceTestBoard);
router.get('/finance/stream', requirePermission('finance_center', 'view'), adminFinanceStream);

/* ── Dues & Reminders ── */
router.get('/dues', requirePermission('finance_center', 'view'), adminGetDues);
router.patch('/dues/:studentId', requirePermission('finance_center', 'edit'), adminUpdateDue);
router.post('/dues/:studentId/remind', requirePermission('finance_center', 'create'), adminSendDueReminder);
router.post('/reminders/dispatch', requirePermission('finance_center', 'approve'), adminDispatchReminders);

/* ── Notices ── */
router.get('/notices', requirePermission('support_center', 'view'), adminGetNotices);
router.post('/notices', requirePermission('support_center', 'create'), adminCreateNotice);
router.patch('/notices/:id/toggle', requirePermission('support_center', 'edit'), adminToggleNotice);

/* ── Support Tickets ── */
router.get('/support-tickets', requirePermission('support_center', 'view'), adminGetSupportTickets);
router.get('/support-tickets/:id', requirePermission('support_center', 'view'), adminGetSupportTicketById);
router.patch('/support-tickets/:id/status', requirePermission('support_center', 'edit'), adminUpdateSupportTicketStatus);
router.post('/support-tickets/:id/status', requirePermission('support_center', 'edit'), adminUpdateSupportTicketStatus);
router.post('/support-tickets/:id/reply', requirePermission('support_center', 'edit'), adminReplySupportTicket);
router.post('/support-tickets/:id/mark-read', requirePermission('support_center', 'edit'), adminMarkSupportTicketRead);

router.get('/alerts/feed', requirePermission('notifications', 'view'), adminGetActionableAlerts);
router.post('/alerts/mark-read', requirePermission('notifications', 'edit'), adminMarkActionableAlertsRead);
router.get('/alerts/unread-count', requirePermission('notifications', 'view'), adminGetActionableAlertsUnreadCount);
router.post('/alerts/:id/read', requirePermission('notifications', 'edit'), adminMarkSingleActionableAlertRead);
router.post('/alerts/read-all', requirePermission('notifications', 'edit'), adminMarkAllActionableAlertsRead);
router.get('/notifications/unread-count', requirePermission('notifications', 'view'), adminGetActionableAlertsUnreadCount);
router.post('/notifications/:id/read', requirePermission('notifications', 'edit'), adminMarkSingleActionableAlertRead);
router.post('/notifications/read-all', requirePermission('notifications', 'edit'), adminMarkAllActionableAlertsRead);

/* ── Backups ── */
router.post('/backups/run', requirePermission('security_logs', 'create'), adminRunBackup);
router.get('/backups', requirePermission('security_logs', 'view'), adminListBackups);
router.post('/backups/:id/restore', requirePermission('security_logs', 'edit'), requireSensitiveAction({ actionKey: 'backups.restore', moduleName: 'backups', actionName: 'restore' }), adminRestoreBackup);
router.get('/backups/:id/download', requirePermission('security_logs', 'view'), adminDownloadBackup);
/* ── Badges ── */
router.get('/badges', requirePermission('students_groups', 'view'), adminGetBadges);
router.post('/badges', requirePermission('students_groups', 'create'), adminCreateBadge);
router.put('/badges/:id', requirePermission('students_groups', 'edit'), adminUpdateBadge);
router.delete('/badges/:id', requirePermission('students_groups', 'delete'), requireDestructiveStepUp('students', 'badge_delete'), adminDeleteBadge);
router.post('/students/:studentId/badges/:badgeId', requirePermission('students_groups', 'create'), adminAssignBadge);
router.delete('/students/:studentId/badges/:badgeId', requirePermission('students_groups', 'delete'), requireDestructiveStepUp('students', 'badge_revoke'), adminRevokeBadge);

/* ── Student Dashboard Configurations ── */
router.get('/dashboard-config', requirePermission('site_settings', 'view'), adminGetStudentDashboardConfig);
router.put('/dashboard-config', requirePermission('site_settings', 'edit'), adminUpdateStudentDashboardConfig);
// Consolidated under /dashboard-config

/* ── Notifications ── */
router.get('/notifications', requirePermission('notifications', 'view'), adminGetNotifications);
router.post('/notifications', requirePermission('notifications', 'create'), adminCreateNotification);
router.put('/notifications/:id([0-9a-fA-F]{24})', requirePermission('notifications', 'edit'), adminUpdateNotification);
router.patch('/notifications/:id([0-9a-fA-F]{24})/toggle', requirePermission('notifications', 'edit'), adminToggleNotification);
router.delete('/notifications/:id([0-9a-fA-F]{24})', requirePermission('notifications', 'delete'), requireDestructiveStepUp('notification_center', 'notification_delete'), adminDeleteNotification);

/* ── Parent / Guardian Link ── */
router.post('/students/:studentId/otp', requirePermission('students_groups', 'create'), adminIssueGuardianOtp);
router.post('/students/:studentId/confirm-otp', requirePermission('students_groups', 'edit'), adminConfirmGuardianOtp);

/* ── Admin Dashboard Overrides ── */

/* ── Exports ── */
router.get('/export-news', requirePermission('news', 'export'), requireSensitiveExport('news', 'legacy_news_export'), trackSensitiveExport({ moduleName: 'news', actionName: 'legacy_news_export' }), adminExportNews);
router.get('/export-subscription-plans', requirePermission('subscription_plans', 'export'), requireSensitiveExport('subscription_plans', 'legacy_plans_export'), trackSensitiveExport({ moduleName: 'subscription_plans', actionName: 'legacy_plans_export' }), adminExportSubscriptionPlans);
router.get('/export-subscription-plans/legacy', requirePermission('subscription_plans', 'export'), requireSensitiveExport('subscription_plans', 'legacy_plans_json_export'), trackSensitiveExport({ moduleName: 'subscription_plans', actionName: 'legacy_plans_json_export' }), adminExportSubscriptionPlansLegacy);
router.get('/export-universities', requirePermission('universities', 'export'), requireSensitiveExport('universities', 'legacy_universities_export'), trackSensitiveExport({ moduleName: 'universities', 'actionName': 'legacy_universities_export' }), adminExportUniversitiesLegacy);
router.get('/export-students', requirePermission('students_groups', 'export'), requireSensitiveExport('students_groups', 'students_export', true), trackSensitiveExport({ moduleName: 'students_groups', actionName: 'students_export' }), adminExportStudents);

/* ═══════════════════════════════════════════════════════════
   FINANCE CENTER (unified ledger)
   ═══════════════════════════════════════════════════════════ */
router.get('/fc/dashboard', requirePermission('finance_center', 'view'), fcGetDashboard);

// Transactions
router.get('/fc/transactions', requirePermission('finance_center', 'view'), fcGetTransactions);
router.get(
    '/fc/expenses',
    requirePermission('finance_center', 'view'),
    (req: Request, _res: Response, next: NextFunction) => {
        req.query.direction = 'expense';
        next();
    },
    fcGetTransactions,
);
router.get('/fc/transactions/:id', requirePermission('finance_center', 'view'), fcGetTransaction);
router.post('/fc/transactions', requirePermission('finance_center', 'create'), validate(createTransactionSchema), fcCreateTransaction);
router.put('/fc/transactions/:id', requirePermission('finance_center', 'edit'), validate(updateTransactionSchema), fcUpdateTransaction);
router.delete('/fc/transactions/:id', requirePermission('finance_center', 'delete'), requireDestructiveStepUp('finance_center', 'transaction_delete'), fcDeleteTransaction);
router.post('/fc/transactions/:id/restore', requirePermission('finance_center', 'edit'), requireDestructiveStepUp('finance_center', 'transaction_restore'), fcRestoreTransaction);
router.post('/fc/transactions/bulk-approve', requirePermission('finance_center', 'bulk'), validate(bulkIdsSchema), fcBulkApproveTransactions);
router.post('/fc/transactions/bulk-mark-paid', requirePermission('finance_center', 'bulk'), validate(bulkIdsSchema), fcBulkMarkPaid);

// Invoices
router.get('/fc/invoices', requirePermission('finance_center', 'view'), fcGetInvoices);
router.post('/fc/invoices', requirePermission('finance_center', 'create'), validate(createInvoiceSchema), fcCreateInvoice);
router.put('/fc/invoices/:id', requirePermission('finance_center', 'edit'), validate(updateInvoiceSchema), fcUpdateInvoice);
router.post('/fc/invoices/:id/mark-paid', requirePermission('finance_center', 'edit'), validate(markInvoicePaidSchema), fcMarkInvoicePaid);

// Budgets
router.get('/fc/budgets', requirePermission('finance_center', 'view'), fcGetBudgets);
router.post('/fc/budgets', requirePermission('finance_center', 'create'), validate(createBudgetSchema), fcCreateBudget);
router.put('/fc/budgets/:id', requirePermission('finance_center', 'edit'), validate(updateBudgetSchema), fcUpdateBudget);
router.delete('/fc/budgets/:id', requirePermission('finance_center', 'delete'), requireDestructiveStepUp('finance_center', 'budget_delete'), fcDeleteBudget);

// Recurring Rules
router.get('/fc/recurring-rules', requirePermission('finance_center', 'view'), fcGetRecurringRules);
router.post('/fc/recurring-rules', requirePermission('finance_center', 'create'), validate(createRecurringRuleSchema), fcCreateRecurringRule);
router.put('/fc/recurring-rules/:id', requirePermission('finance_center', 'edit'), validate(updateRecurringRuleSchema), fcUpdateRecurringRule);
router.delete('/fc/recurring-rules/:id', requirePermission('finance_center', 'delete'), requireDestructiveStepUp('finance_center', 'recurring_rule_delete'), fcDeleteRecurringRule);
router.post('/fc/recurring-rules/:id/run-now', requirePermission('finance_center', 'edit'), fcRunRecurringRuleNow);

// Chart of Accounts
router.get('/fc/chart-of-accounts', requirePermission('finance_center', 'view'), fcGetChartOfAccounts);
router.post('/fc/chart-of-accounts', requirePermission('finance_center', 'create'), validate(createAccountSchema), fcCreateAccount);

// Vendors
router.get('/fc/vendors', requirePermission('finance_center', 'view'), fcGetVendors);
router.post('/fc/vendors', requirePermission('finance_center', 'create'), validate(createVendorSchema), fcCreateVendor);

// Settings
router.get('/fc/settings', requirePermission('finance_center', 'view'), fcGetSettings);
router.put('/fc/settings', requirePermission('finance_center', 'edit'), validate(updateSettingsSchema), fcUpdateSettings);

// Audit Logs
router.get('/fc/audit-logs', requirePermission('finance_center', 'view'), fcGetAuditLogs);
router.get('/fc/audit-logs/:id', requirePermission('finance_center', 'view'), fcGetAuditLogDetail);

// Export / Import
router.get('/fc/export', requirePermission('finance_center', 'export'), financeExportRateLimiter, requireSensitiveExport('finance_center', 'transactions_export', true), trackSensitiveExport({ moduleName: 'finance_center', actionName: 'transactions_export' }), fcExportTransactions);
router.get('/fc/import-template', requirePermission('finance_center', 'view'), fcDownloadTemplate);
router.post('/fc/import-preview', requirePermission('finance_center', 'create'), financeImportRateLimiter, upload.single('file'), fcImportPreview);
router.post('/fc/import-commit', requirePermission('finance_center', 'create'), financeImportRateLimiter, validate(importCommitSchema), fcImportCommit);

// Refunds
router.get('/fc/refunds', requirePermission('finance_center', 'view'), fcGetRefunds);
router.post('/fc/refunds', requirePermission('finance_center', 'create'), validate(createRefundSchema), fcCreateRefund);
router.post('/fc/refunds/:id/process', requirePermission('finance_center', 'approve'), validate(processRefundSchema), fcApproveRefund);

// P&L Report PDF
router.get('/fc/report.pdf', requirePermission('finance_center', 'export'), financeExportRateLimiter, requireSensitiveExport('finance_center', 'profit_loss_report_export', true), trackSensitiveExport({ moduleName: 'finance_center', actionName: 'profit_loss_report_export' }), fcGeneratePLReport);

/* ── Question Bank v2 (Advanced) ── */
import * as qbv2 from '../controllers/questionBankAdvancedController';

// Settings
router.get('/question-bank/v2/settings', requirePermission('question_bank', 'view'), qbv2.getSettings);
router.put('/question-bank/v2/settings', requirePermission('question_bank', 'edit'), qbv2.updateSettings);
// CRUD
router.get('/question-bank/v2/questions', requirePermission('question_bank', 'view'), qbv2.listBankQuestions);
router.get('/question-bank/v2/questions/:id', requirePermission('question_bank', 'view'), qbv2.getBankQuestion);
router.post('/question-bank/v2/questions', requirePermission('question_bank', 'create'), qbv2.createBankQuestion);
router.put('/question-bank/v2/questions/:id', requirePermission('question_bank', 'edit'), qbv2.updateBankQuestion);
router.delete('/question-bank/v2/questions/:id', requirePermission('question_bank', 'delete'), requireDestructiveStepUp('question_bank', 'bank_question_delete'), qbv2.deleteBankQuestion);
router.post('/question-bank/v2/questions/:id/archive', requirePermission('question_bank', 'delete'), requireDestructiveStepUp('question_bank', 'bank_question_archive'), qbv2.archiveBankQuestion);
router.post('/question-bank/v2/questions/:id/restore', requirePermission('question_bank', 'edit'), requireDestructiveStepUp('question_bank', 'bank_question_restore'), qbv2.restoreBankQuestion);
router.post('/question-bank/v2/questions/:id/duplicate', requirePermission('question_bank', 'create'), qbv2.duplicateBankQuestion);
// Bulk
router.post('/question-bank/v2/bulk/archive', requirePermission('question_bank', 'bulk'), requireDestructiveStepUp('question_bank', 'bulk_archive'), qbv2.bulkArchive);
router.post('/question-bank/v2/bulk/activate', requirePermission('question_bank', 'bulk'), qbv2.bulkActivate);
router.post('/question-bank/v2/bulk/tags', requirePermission('question_bank', 'bulk'), qbv2.bulkUpdateTags);
router.post('/question-bank/v2/bulk/delete', requirePermission('question_bank', 'delete'), qbv2.bulkDelete);
// Import / Export
router.get('/question-bank/v2/import/template', requirePermission('question_bank', 'view'), qbv2.downloadImportTemplate);
router.post('/question-bank/v2/import/preview', requirePermission('question_bank', 'create'), upload.single('file'), qbv2.importPreview);
router.post('/question-bank/v2/import/commit', requirePermission('question_bank', 'create'), upload.single('file'), qbv2.importCommit);
router.get('/question-bank/v2/export', requirePermission('question_bank', 'export'), requireSensitiveExport('question_bank', 'bank_v2_export'), trackSensitiveExport({ moduleName: 'question_bank', actionName: 'bank_v2_export' }), qbv2.exportQuestions);
// Sets
router.get('/question-bank/v2/sets', requirePermission('question_bank', 'view'), qbv2.listSets);
router.get('/question-bank/v2/sets/:id', requirePermission('question_bank', 'view'), qbv2.getSet);
router.post('/question-bank/v2/sets', requirePermission('question_bank', 'create'), qbv2.createSet);
router.put('/question-bank/v2/sets/:id', requirePermission('question_bank', 'edit'), qbv2.updateSet);
router.delete('/question-bank/v2/sets/:id', requirePermission('question_bank', 'delete'), requireDestructiveStepUp('question_bank', 'question_set_delete'), qbv2.deleteSet);
router.get('/question-bank/v2/sets/:id/resolve', requirePermission('question_bank', 'view'), qbv2.resolveSetQuestions);
// Exam integration
router.get('/question-bank/v2/exam/:examId/search', requirePermission('question_bank', 'view'), qbv2.searchBankQuestionsForExam);
router.post('/question-bank/v2/exam/:examId/attach', requirePermission('question_bank', 'create'), qbv2.attachBankQuestionsToExam);
router.delete('/question-bank/v2/exam/:examId/questions/:questionId', requirePermission('question_bank', 'delete'), requireDestructiveStepUp('question_bank', 'question_remove_from_exam'), qbv2.removeBankQuestionFromExam);
router.put('/question-bank/v2/exam/:examId/reorder', requirePermission('question_bank', 'edit'), qbv2.reorderExamQuestions);
router.post('/question-bank/v2/exam/:examId/finalize', requirePermission('question_bank', 'edit'), qbv2.finalizeExamSnapshot);
// Analytics
router.get('/question-bank/v2/analytics', requirePermission('question_bank', 'view'), qbv2.getAnalytics);
router.post('/question-bank/v2/analytics/:id/refresh', requirePermission('question_bank', 'edit'), qbv2.refreshAnalyticsForQuestion);
router.post('/question-bank/v2/analytics/refresh-all', requirePermission('question_bank', 'edit'), qbv2.refreshAllAnalytics);

/* ═══════════════════════════════════════════════════════════
   SECURITY ALERTS & MAINTENANCE
   ═══════════════════════════════════════════════════════════ */
router.get('/security-alerts', requirePermission('security_logs', 'view'), adminGetSecurityAlerts);
router.get('/security-alerts/summary', requirePermission('security_logs', 'view'), adminGetSecurityAlertSummary);
router.post('/security-alerts/:id/read', requirePermission('security_logs', 'edit'), adminMarkAlertRead);
router.post('/security-alerts/mark-all-read', requirePermission('security_logs', 'edit'), adminMarkAllAlertsRead);
router.post('/security-alerts/:id/resolve', requirePermission('security_logs', 'approve'), adminResolveAlert);
router.delete('/security-alerts/:id', requirePermission('security_logs', 'delete'), requireDestructiveStepUp('security_center', 'security_alert_delete'), adminDeleteSecurityAlert);
router.get('/maintenance/status', requirePermission('site_settings', 'view'), adminGetMaintenanceStatus);
router.put('/maintenance/status', requirePermission('site_settings', 'edit'), adminUpdateMaintenanceStatus);

/* ═══════════════════════════════════════════════════════════
   HELP CENTER (Knowledge Base)
   ═══════════════════════════════════════════════════════════ */
router.get('/help-center/categories', requirePermission('support_center', 'view'), adminGetHelpCategories);
router.post('/help-center/categories', requirePermission('support_center', 'create'), adminCreateHelpCategory);
router.put('/help-center/categories/:id', requirePermission('support_center', 'edit'), adminUpdateHelpCategory);
router.delete('/help-center/categories/:id', requirePermission('support_center', 'delete'), requireDestructiveStepUp('help_center', 'category_delete'), adminDeleteHelpCategory);
router.get('/help-center/articles', requirePermission('support_center', 'view'), adminGetHelpArticles);
router.get('/help-center/articles/:id', requirePermission('support_center', 'view'), adminGetHelpArticle);
router.post('/help-center/articles', requirePermission('support_center', 'create'), adminCreateHelpArticle);
router.put('/help-center/articles/:id', requirePermission('support_center', 'edit'), adminUpdateHelpArticle);
router.delete('/help-center/articles/:id', requirePermission('support_center', 'delete'), requireDestructiveStepUp('help_center', 'article_delete'), adminDeleteHelpArticle);
router.post('/help-center/articles/:id/publish', requirePermission('support_center', 'publish'), adminPublishHelpArticle);
router.post('/help-center/articles/:id/unpublish', requirePermission('support_center', 'publish'), adminUnpublishHelpArticle);

/* ═══════════════════════════════════════════════════════════
   CONTENT BLOCKS (Global Promotions / Banners)
   ═══════════════════════════════════════════════════════════ */
router.get('/content-blocks', requirePermission('home_control', 'view'), adminGetContentBlocks);
router.get('/content-blocks/:id', requirePermission('home_control', 'view'), adminGetContentBlock);
router.post('/content-blocks', requirePermission('home_control', 'create'), adminCreateContentBlock);
router.put('/content-blocks/:id', requirePermission('home_control', 'edit'), adminUpdateContentBlock);
router.delete('/content-blocks/:id', requirePermission('home_control', 'delete'), requireDestructiveStepUp('content_blocks', 'content_block_delete'), adminDeleteContentBlock);
router.patch('/content-blocks/:id/toggle', requirePermission('home_control', 'edit'), adminToggleContentBlock);

/* ═══════════════════════════════════════════════════════════
   WEAK TOPIC DETECTION (Analytics)
   ═══════════════════════════════════════════════════════════ */
router.get('/analytics/weak-topics', requirePermission('reports_analytics', 'view'), adminGetWeakTopics);
router.get('/analytics/weak-topics/by-student/:studentId', requirePermission('reports_analytics', 'view'), adminGetStudentWeakTopics);
router.get('/analytics/weak-topics/question-difficulty', requirePermission('reports_analytics', 'view'), adminGetHardestQuestions);

/* ═══════════════════════════════════════════════════════════
   STUDENT CRM TIMELINE
   ═══════════════════════════════════════════════════════════ */
router.get('/students/:id/timeline', requirePermission('students_groups', 'view'), adminGetStudentTimeline);
router.post('/students/:id/timeline', requirePermission('students_groups', 'create'), adminAddTimelineEntry);
router.delete('/students/:id/timeline/:entryId', requirePermission('students_groups', 'delete'), requireDestructiveStepUp('students_groups', 'timeline_entry_delete'), adminDeleteTimelineEntry);
router.get('/students/:id/timeline/summary', requirePermission('students_groups', 'view'), adminGetTimelineSummary);

/* ═══════════════════════════════════════════════════════════
   NOTIFICATION CENTER (Providers / Templates / Jobs / Logs)
   ═══════════════════════════════════════════════════════════ */
router.get('/notification-center/summary', requirePermission('notifications', 'view'), adminGetNotificationSummary);
router.get('/notification-center/providers', requirePermission('notifications', 'view'), adminGetProviders);
router.post('/notification-center/providers', requirePermission('notifications', 'create'), requireSensitiveAction({ actionKey: 'providers.credentials_change', moduleName: 'notification_center', actionName: 'provider_create' }), adminCreateProvider);
router.put('/notification-center/providers/:id', requirePermission('notifications', 'edit'), requireSensitiveAction({ actionKey: 'providers.credentials_change', moduleName: 'notification_center', actionName: 'provider_update' }), adminUpdateProvider);
router.delete('/notification-center/providers/:id', requirePermission('notifications', 'delete'), requireSensitiveAction({ actionKey: 'providers.credentials_change', moduleName: 'notification_center', actionName: 'provider_delete' }), adminDeleteProvider);
router.post('/notification-center/providers/:id/test', requirePermission('notifications', 'edit'), requireProviderStepUp('notification_center', 'provider_test'), adminTestProvider);
router.get('/notification-center/templates', requirePermission('notifications', 'view'), adminGetTemplates);
router.post('/notification-center/templates', requirePermission('notifications', 'create'), adminCreateTemplate);
router.put('/notification-center/templates/:id', requirePermission('notifications', 'edit'), adminUpdateTemplate);
router.delete('/notification-center/templates/:id', requirePermission('notifications', 'delete'), requireDestructiveStepUp('notification_center', 'template_delete'), adminDeleteTemplate);
router.get('/notification-center/jobs', requirePermission('notifications', 'view'), adminGetJobs);
router.post('/notification-center/send', requirePermission('notifications', 'create'), adminSendNotification);
router.post('/notification-center/jobs/:id/retry', requirePermission('notifications', 'edit'), adminRetryFailedJob);
router.get('/notification-center/delivery-logs', requirePermission('notifications', 'view'), adminGetDeliveryLogs);

/* ═══════════════════════════════════════════════════════════
   RENEWAL AUTOMATION
   ═══════════════════════════════════════════════════════════ */
router.get('/renewal/subscriptions', requirePermission('subscription_plans', 'view'), adminGetActiveSubscriptions);
router.get('/renewal/stats', requirePermission('subscription_plans', 'view'), adminGetSubscriptionStats);
router.post('/renewal/subscriptions/:id/extend', requirePermission('subscription_plans', 'edit'), adminExtendSubscription);
router.post('/renewal/subscriptions/:id/expire', requirePermission('subscription_plans', 'edit'), adminExpireSubscription);
router.post('/renewal/subscriptions/:id/reactivate', requirePermission('subscription_plans', 'edit'), adminReactivateSubscription);
router.patch('/renewal/subscriptions/:id/auto-renew', requirePermission('subscription_plans', 'edit'), adminToggleAutoRenew);
router.get('/renewal/logs', requirePermission('subscription_plans', 'view'), adminGetAutomationLogs);
router.get('/renewal/students/:studentId/history', requirePermission('subscription_plans', 'view'), adminGetStudentSubscriptionHistory);

export default router;



