import { adminUi, ADMIN_DASHBOARD } from '../lib/appRoutes';
import type { ComponentType } from 'react';
import {
    LayoutDashboard, Globe, Home, Image, Megaphone, Settings,
    GraduationCap, SlidersHorizontal, Newspaper, AlertCircle,
    FolderOpen, ScrollText, BookOpen,
    Users, UserCog, ClipboardList, Bell,
    CreditCard, Wallet, LifeBuoy, Mail, Shield, BarChart3,
    User, Rss, Layers, Archive, Sparkles, Copy, Upload, Link2,
    Send, FileText, History, Database,
    UserPlus, Import, Target, MessageSquare, TrendingDown,
    KeyRound,
    Zap,
    HelpCircle,
    CheckCircle,
    ClipboardCheck,
} from 'lucide-react';

export type AdminMenuIcon = ComponentType<{ className?: string }>;
export type AdminAllowedRole =
    | 'superadmin'
    | 'admin'
    | 'moderator'
    | 'editor'
    | 'viewer'
    | 'support_agent'
    | 'finance_agent';
export type AdminLegacyPermission =
    | 'canEditExams'
    | 'canManageStudents'
    | 'canViewReports'
    | 'canDeleteData'
    | 'canManageFinance'
    | 'canManagePlans';

export const ADMIN_PATHS = {
    dashboard: ADMIN_DASHBOARD,
    homeControl: adminUi('settings/home-control'),
    universitySettings: adminUi('settings/university-settings'),
    siteSettings: adminUi('settings/site-settings'),
    bannerManager: adminUi('settings/banner-manager'),
    campaignBanners: adminUi('campaign-banners'),
    universities: adminUi('universities'),
    news: adminUi('news'),
    exams: adminUi('exams'),
    examNew: adminUi('exams/new'),
    examEdit: adminUi('exams/:examId/edit'),
    examPreview: adminUi('exams/:examId/preview'),
    examsExternal: `${adminUi('exams')}?tab=external`,
    examsInternal: `${adminUi('exams')}?tab=internal`,
    examsImports: `${adminUi('exams')}?tab=imports`,
    examsTemplates: `${adminUi('exams')}?tab=templates`,
    examsCenters: `${adminUi('exams')}?tab=centers`,
    examsSyncLogs: `${adminUi('exams')}?tab=sync-logs`,
    examsSettings: `${adminUi('exams')}?tab=settings`,
    questionBank: adminUi('question-bank'),
    questionBankNew: adminUi('question-bank/new'),
    questionBankEdit: adminUi('question-bank/edit'),
    questionBankImport: adminUi('question-bank/import'),
    questionBankExport: adminUi('question-bank/export'),
    questionBankSets: adminUi('question-bank/sets'),
    questionBankAnalytics: adminUi('question-bank/analytics'),
    questionBankArchive: adminUi('question-bank/archive'),
    questionBankSettings: adminUi('question-bank/settings'),
    students: adminUi('students'),
    studentGroups: adminUi('student-groups'),
    studentsV2: adminUi('students-v2'),
    studentGroupsV2: adminUi('student-groups-v2'),
    notificationCenter: adminUi('notification-center'),
    studentSettings: adminUi('settings/student-settings'),
    // Student Management OS console routes
    studentMgmt: adminUi('student-management'),
    studentMgmtList: adminUi('student-management/list'),
    studentMgmtCreate: adminUi('student-management/create'),
    studentMgmtImportExport: adminUi('student-management/import-export'),
    studentMgmtGroups: adminUi('student-management/groups'),
    studentMgmtGroupDetail: adminUi('student-management/groups'),  // /:id suffix added by router
    studentMgmtAudiences: adminUi('student-management/audiences'),
    studentMgmtCrmTimeline: adminUi('student-management/crm-timeline'),
    studentMgmtWeakTopics: adminUi('student-management/weak-topics'),
    studentMgmtProfileRequests: adminUi('student-management/profile-requests'),
    studentMgmtNotifications: adminUi('student-management/notifications'),
    studentMgmtSettings: adminUi('student-management/settings'),
    studentMgmtDetail: adminUi('student-management/students'),  // /:id suffix added by router
    subscriptionsV2: adminUi('subscriptions-v2'),
    subscriptionPlans: adminUi('subscriptions/plans'),
    subscriptionContactCenter: adminUi('subscriptions/contact-center'),
    payments: adminUi('payments'),
    financeCenter: adminUi('finance'),
    financeDashboard: adminUi('finance/dashboard'),
    financeTransactions: adminUi('finance/transactions'),
    financeInvoices: adminUi('finance/invoices'),
    financeBudgets: adminUi('finance/budgets'),
    financeRecurring: adminUi('finance/recurring'),
    financeExpenses: adminUi('finance/expenses'),
    financeVendors: adminUi('finance/vendors'),
    financeRefunds: adminUi('finance/refunds'),
    financeImport: adminUi('finance/import'),
    financeExport: adminUi('finance/export'),
    financeAuditLog: adminUi('finance/audit-log'),
    financeSettings: adminUi('finance/settings'),
    resources: adminUi('resources'),
    resourceSettings: adminUi('settings/resource-settings'),
    supportCenter: adminUi('support-center'),
    helpCenterAdmin: adminUi('help-center'),
    contact: adminUi('contact'),
    notifications: adminUi('settings/notifications'),
    integrations: adminUi('settings/integrations'),
    allSettings: adminUi('settings/all'),
    reports: adminUi('reports'),
    securityCenter: adminUi('settings/security-center'),
    systemLogs: adminUi('settings/system-logs'),
    adminProfile: adminUi('settings/admin-profile'),
    settingsCenter: adminUi('settings'),
    newsSettings: adminUi('settings/news'),
    // Legacy Notification Test Send redirect
    notificationTestSend: adminUi('notifications/test-send'),
    // Notification Triggers
    notificationTriggers: adminUi('notifications/triggers'),
    // Notification Campaign Platform
    campaignsDashboard: adminUi('campaigns'),
    campaignsList: adminUi('campaigns/list'),
    campaignsNew: adminUi('campaigns/new'),
    campaignsAudiences: `${adminUi('subscriptions/contact-center')}?tab=members`,
    campaignsContactCenter: adminUi('campaigns/contact-center'),
    campaignsTemplates: adminUi('campaigns/templates'),
    campaignsProviders: `${adminUi('campaigns')}?view=providers`,
    campaignsTriggers: `${adminUi('campaigns')}?view=triggers`,
    campaignsNotifications: `${adminUi('campaigns')}?view=notifications`,
    campaignsSettings: adminUi('campaigns/settings'),
    campaignsAdvancedSettings: adminUi('campaigns/advanced-settings'),
    campaignsLogs: adminUi('campaigns/logs'),
    // Data Hub
    dataHub: adminUi('data-hub'),
    dataHubHistory: adminUi('data-hub/history'),
    teamMembers: adminUi('team/members'),
    teamMemberDetail: adminUi('team/members'),
    teamRoles: adminUi('team/roles'),
    teamRoleDetail: adminUi('team/roles'),
    teamPermissions: adminUi('team/permissions'),
    teamApprovalRules: adminUi('team/approval-rules'),
    teamActivity: adminUi('team/activity'),
    teamSecurity: adminUi('team/security'),
    teamInvites: adminUi('team/invites'),
    approvals: adminUi('approvals'),
    pendingApprovals: adminUi('pending-approvals'),
    legalPages: adminUi('legal-pages'),
    founderDetails: adminUi('founder-details'),
    testimonials: adminUi('testimonials'),
    // Exam System routes
    examCenterHierarchy: adminUi('exam-center/hierarchy'),
    examCenterQuestionBank: adminUi('exam-center/question-bank'),
    examCenterBuilder: adminUi('exam-center/exam-builder'),
    examCenterBuilderNew: adminUi('exam-center/exam-builder/new'),
    examCenterGrading: adminUi('exam-center/grading'),
    examCenterAntiCheat: adminUi('exam-center/anti-cheat'),
    examCenterNotifications: adminUi('exam-center/notifications'),
    examCenterAnalytics: adminUi('exam-center/analytics'),
} as const;

export type AdminMenuItem = {
    key: string;
    label: string;
    path: string;
    icon?: AdminMenuIcon;
    module?: string;
    allowedRoles?: AdminAllowedRole[];
    requiredLegacyPermission?: AdminLegacyPermission;
    matchPrefixes?: string[];
    children?: { key: string; label: string; path: string; icon?: AdminMenuIcon }[];
};

// ─── 13-GROUP ADMIN MENU ─────────────────────────────────────────────────────
// Children removed — each section uses in-page tab navigation instead of sidebar dropdowns.
export const ADMIN_MENU_ITEMS: AdminMenuItem[] = [
    // 1. Dashboard
    { key: 'dashboard', label: 'Dashboard', path: ADMIN_PATHS.dashboard, icon: LayoutDashboard, module: 'dashboard' },

    // 2. Website Control
    {
        key: 'websiteControl',
        label: 'Website Control',
        path: ADMIN_PATHS.homeControl,
        icon: Globe,
        module: 'home_control',
        matchPrefixes: [
            adminUi('settings/home-control'),
            adminUi('settings/banner-manager'),
            adminUi('campaign-banners'),
            adminUi('settings/site-settings'),
        ],
    },

    // 3. Universities
    {
        key: 'universities',
        label: 'Universities',
        path: ADMIN_PATHS.universities,
        icon: GraduationCap,
        module: 'universities',
        matchPrefixes: [adminUi('universities'), adminUi('settings/university-settings')],
    },

    // 4. News Management
    {
        key: 'news',
        label: 'News Management',
        path: adminUi('news/dashboard'),
        icon: Newspaper,
        module: 'news',
        matchPrefixes: [adminUi('news'), adminUi('settings/news')],
    },

    // 5. Exams
    {
        key: 'exams',
        label: 'Exams',
        path: ADMIN_PATHS.exams,
        icon: BookOpen,
        module: 'exams',
        allowedRoles: ['superadmin', 'admin', 'moderator', 'editor'],
        matchPrefixes: [adminUi('exams'), adminUi('exams/new')],
    },

    // 6. Question Bank
    {
        key: 'questionBank',
        label: 'Question Bank',
        path: ADMIN_PATHS.questionBank,
        icon: BookOpen,
        module: 'question_bank',
        matchPrefixes: [adminUi('question-bank')],
    },

    // 6b. Exam Center (v2)
    {
        key: 'examCenter',
        label: 'Exam Center',
        path: ADMIN_PATHS.examCenterHierarchy,
        icon: ClipboardCheck,
        module: 'exam_center',
        allowedRoles: ['superadmin', 'admin', 'moderator', 'editor'],
        matchPrefixes: [adminUi('exam-center')],
    },

    // 7. Student Management
    {
        key: 'students',
        label: 'Student Management',
        path: ADMIN_PATHS.studentMgmtList,
        icon: Users,
        module: 'students_groups',
        matchPrefixes: [
            adminUi('student-management'),
            adminUi('students'),
            adminUi('student-groups'),
            adminUi('students-v2'),
            adminUi('student-groups-v2'),
            adminUi('notification-center'),
            adminUi('settings/student-settings'),
            adminUi('pending-approvals'),
        ],
    },

    // 8. Subscription & Payments
    {
        key: 'subscriptions',
        label: 'Subscription & Payments',
        path: ADMIN_PATHS.subscriptionPlans,
        icon: CreditCard,
        module: 'subscription_plans',
        allowedRoles: ['superadmin', 'admin', 'moderator'],
        requiredLegacyPermission: 'canManagePlans',
        matchPrefixes: [
            adminUi('subscriptions/plans'),
            adminUi('subscription-plans'),
            adminUi('subscriptions-v2'),
            ADMIN_PATHS.subscriptionContactCenter,
        ],
    },

    // 9. Resources
    {
        key: 'resources',
        label: 'Resources',
        path: ADMIN_PATHS.resources,
        icon: FolderOpen,
        module: 'resources',
        matchPrefixes: [adminUi('resources'), adminUi('settings/resource-settings')],
    },

    // 10. Support & Communication
    {
        key: 'support',
        label: 'Support & Communication',
        path: ADMIN_PATHS.supportCenter,
        icon: LifeBuoy,
        module: 'support_center',
        matchPrefixes: [adminUi('support-center'), adminUi('help-center'), adminUi('contact'), adminUi('settings/notifications')],
    },

    // 10b. Campaign Platform
    {
        key: 'campaigns',
        label: 'Campaigns Hub',
        path: ADMIN_PATHS.campaignsDashboard,
        icon: Send,
        module: 'notifications',
        matchPrefixes: [adminUi('campaigns'), adminUi('notifications/test-send'), adminUi('notifications/triggers')],
    },

    // 11. Finance Center
    {
        key: 'financeCenter',
        label: 'Finance Center',
        path: ADMIN_PATHS.financeDashboard,
        icon: Wallet,
        module: 'finance_center',
        allowedRoles: ['superadmin', 'admin', 'moderator', 'finance_agent'],
        requiredLegacyPermission: 'canManageFinance',
        matchPrefixes: [adminUi('finance'), adminUi('payments')],
    },

    // 11b. Team & Access Control
    {
        key: 'teamAccessControl',
        label: 'Team & Access Control',
        path: ADMIN_PATHS.teamMembers,
        icon: KeyRound,
        module: 'team_access_control',
        matchPrefixes: [adminUi('team')],
    },

    // 12. Security & Logs
    {
        key: 'security',
        label: 'Security & Logs',
        path: ADMIN_PATHS.securityCenter,
        icon: Shield,
        module: 'security_logs',
        matchPrefixes: [adminUi('settings/security-center'), adminUi('settings/system-logs'), adminUi('reports')],
    },

    // 13. Admin Profile
    { key: 'adminProfile', label: 'Admin Profile', path: ADMIN_PATHS.adminProfile, icon: User, module: 'admin_profile' },

    // 14. Legal Pages — merged into Site Settings → Static Pages

    // 15. Founder Details
    {
        key: 'founderDetails',
        label: 'Founder Details',
        path: ADMIN_PATHS.founderDetails,
        icon: User,
        module: 'founder_details',
        matchPrefixes: [adminUi('founder-details')],
    },
    // 16. Testimonials & Partners
    {
        key: 'testimonials',
        label: 'Testimonials',
        path: ADMIN_PATHS.testimonials,
        icon: MessageSquare,
        module: 'site_settings',
        matchPrefixes: [adminUi('testimonials')],
    },
];

export function isAdminPathActive(pathname: string, item: AdminMenuItem): boolean {
    if (pathname === item.path) return true;
    const prefixes = item.matchPrefixes || [item.path];
    return prefixes.some((prefix) => prefix !== ADMIN_PATHS.dashboard && (pathname === prefix || pathname.startsWith(`${prefix}/`)));
}

export const LEGACY_ADMIN_PATH_REDIRECTS: Record<string, string> = {
    [adminUi('featured')]: ADMIN_PATHS.homeControl,
    [adminUi('live-monitor')]: ADMIN_PATHS.exams,
    [adminUi('alerts')]: ADMIN_PATHS.homeControl,
    [adminUi('file-upload')]: ADMIN_PATHS.students,
    [adminUi('backups')]: ADMIN_PATHS.systemLogs,
    [adminUi('users')]: ADMIN_PATHS.adminProfile,
    [adminUi('exports')]: ADMIN_PATHS.reports,
    [adminUi('payments')]: ADMIN_PATHS.financeTransactions,
    [adminUi('subscription-plans')]: ADMIN_PATHS.subscriptionPlans,
    [adminUi('password')]: ADMIN_PATHS.adminProfile,
    [adminUi('security')]: ADMIN_PATHS.securityCenter,
    [adminUi('audit')]: ADMIN_PATHS.systemLogs,
};

export function routeFromDashboardActionTab(tabId: string): string {
    switch (tabId) {
        case 'universities':
            return ADMIN_PATHS.universities;
        case 'home-control':
            return ADMIN_PATHS.homeControl;
        case 'news':
            return adminUi('news/dashboard');
        case 'exams':
            return ADMIN_PATHS.exams;
        case 'question-bank':
            return ADMIN_PATHS.questionBank;
        case 'student-management':
            return ADMIN_PATHS.studentMgmtList;
        case 'subscriptions':
            return ADMIN_PATHS.subscriptionPlans;
        case 'resources':
            return ADMIN_PATHS.resources;
        case 'campaigns':
            return ADMIN_PATHS.campaignsDashboard;
        case 'finance':
            return ADMIN_PATHS.financeDashboard;
        case 'team-access':
            return ADMIN_PATHS.teamMembers;
        case 'support-tickets':
            return ADMIN_PATHS.supportCenter;
        case 'security':
            return ADMIN_PATHS.securityCenter;
        default:
            return ADMIN_PATHS.dashboard;
    }
}
