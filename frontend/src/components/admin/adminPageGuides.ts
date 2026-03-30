import { ADMIN_PATHS } from '../../routes/adminPaths';
import { adminUi } from '../../lib/appRoutes';
import type { AdminGuideButtonProps } from './AdminGuideButton';

type AdminPageGuide = Omit<AdminGuideButtonProps, 'variant' | 'tone'>;

type AdminPageGuideEntry = {
    prefixes: string[];
    guide: AdminPageGuide;
    quickGuides?: AdminPageGuide[];
};

const HOME_CONTROL_QUICK_GUIDES: AdminPageGuide[] = [
    { title: 'Show Search Box', content: 'Explains the hero search toggle and when visitors should see it.' },
    { title: 'Show Next Deadline Card', content: 'Explains the quick deadline highlight card in the hero area.' },
    { title: 'Section Visibility', content: 'Explains how each major home section can be enabled or hidden.' },
    { title: 'Hero', content: 'Explains the top-of-page hero copy, CTAs, and supporting visuals.' },
    { title: 'Subscription Banner', content: 'Explains the home upsell banner for plans and premium access.' },
    { title: 'Stats Strip', content: 'Explains the metric strip shown near the top of the public home page.' },
    { title: "What's Happening Now", content: 'Explains timeline and urgency widgets for current deadlines and activity.' },
    { title: 'University Dashboard', content: 'Explains the quick-browse university dashboard controls.' },
    { title: 'Closing + Week Widget', content: 'Explains the compact closing-soon and exams-this-week widgets.' },
    { title: 'Live/Upcoming Exams', content: 'Explains how exam previews appear on the public home page.' },
    { title: 'News Preview', content: 'Explains the home news teaser block and its item limits.' },
    { title: 'Resources Preview', content: 'Explains the home study-resource teaser block and CTA behavior.' },
    { title: 'Social Strip', content: 'Explains the community or social CTA strip near the lower home area.' },
    { title: 'Scrollable Ads', content: 'Explains the rotating or scrollable ad slot on the home page.' },
    { title: 'Footer', content: 'Explains the global footer visibility and shared footer content.' },
];

const SITE_SETTINGS_QUICK_GUIDES: AdminPageGuide[] = [
    { title: 'Allow System Mode', content: 'Explains whether visitors can let CampusWay follow their device theme.' },
    { title: 'Website Name', content: 'Explains the shared brand label used in public and student-facing UI.' },
    { title: 'Contact Email', content: 'Explains the public support email shown across shared contact surfaces.' },
    { title: 'Contact Phone', content: 'Explains the main phone or WhatsApp support line used publicly.' },
    { title: 'Theme Defaults', content: 'Explains the default theme selection for new visitors and students.' },
    { title: 'Switch Variant', content: 'Explains the visual style used by the shared theme switch.' },
    { title: 'Animation Level', content: 'Explains how much motion the shared public UI should use.' },
    { title: 'Social Links', content: 'Explains the shared social platform links and ordering.' },
    { title: 'Pricing Display', content: 'Explains currency format and plan-price presentation rules.' },
    { title: 'Subscription Page', content: 'Explains subscription page headline, subtitle, and guest CTA behavior.' },
    { title: 'Static Pages', content: 'Explains the shared About, Terms, and Privacy content controls.' },
];

const QUESTION_BANK_IMPORT_QUICK_GUIDES: AdminPageGuide[] = [
    { title: 'Download Template', content: 'Explains the supported file shape for bulk question import.' },
    { title: 'Upload Import File', content: 'Explains where to upload the question spreadsheet for validation.' },
    { title: 'Preview Import', content: 'Explains the validation preview before questions are committed.' },
    { title: 'Mapping Review', content: 'Explains how uploaded columns map into canonical question fields.' },
    { title: 'Import Mode', content: 'Explains whether rows create new questions or update matching ones.' },
    { title: 'Commit Import', content: 'Explains the final action that writes validated rows into the bank.' },
    { title: 'Cancel Import', content: 'Explains how to stop the current import session without saving.' },
    { title: 'Validation Notes', content: 'Explains where row-level issues are shown before commit.' },
];

const FINANCE_DASHBOARD_QUICK_GUIDES: AdminPageGuide[] = [
    { title: 'Reporting Month', content: 'Explains how the dashboard month filter changes finance summaries.' },
    { title: 'P&L Report', content: 'Explains the profit-and-loss snapshot and how to read it.' },
    { title: 'Cash Position', content: 'Explains the current available balance and ledger health.' },
    { title: 'Pending Approvals', content: 'Explains which finance actions are still waiting for approval.' },
];

const SECURITY_CENTER_QUICK_GUIDES: AdminPageGuide[] = [
    { title: 'Security Alerts', content: 'Explains the unread and critical alert counters for security review.' },
    { title: 'Access Monitoring', content: 'Explains how recent sign-in and privilege posture is surfaced.' },
    { title: 'Audit Logs', content: 'Explains the security-focused audit trail used for investigation.' },
    { title: 'Session Health', content: 'Explains how live session posture and protection signals are reviewed.' },
    { title: 'Authentication Settings', content: 'Explains the live login, admin route, and sign-in protection controls.' },
    { title: 'Password Policies', content: 'Explains minimum password rules, reset posture, and password hardening.' },
    { title: 'Two-Factor Policy', content: 'Explains when 2FA is optional, required, or enforced for elevated roles.' },
    { title: 'Sessions & Devices', content: 'Explains how active sessions, revocation, and suspicious-device review work.' },
    { title: 'Access Control', content: 'Explains role-sensitive protections, high-risk actions, and approval gates.' },
    { title: 'API & Route Protection', content: 'Explains how protected routes and backend APIs are checked and denied.' },
    { title: 'Verification Rules', content: 'Explains approval or proof requirements before sensitive settings can change.' },
    { title: 'Upload Safeguards', content: 'Explains file validation, media constraints, and public asset safety checks.' },
    { title: 'Alert Thresholds', content: 'Explains what creates a security alert and when escalation should happen.' },
    { title: 'Backup Recovery', content: 'Explains backup-code or fallback recovery flows for locked-out privileged users.' },
    { title: 'Approval Queue', content: 'Explains how pending security-sensitive actions are reviewed and resolved.' },
    { title: 'Audit Evidence', content: 'Explains which changes should leave an auditable trail for later investigation.' },
];

const CONTACT_MESSAGES_QUICK_GUIDES: AdminPageGuide[] = [
    { title: 'Refresh Contact Messages', content: 'Explains how to reload the latest public contact submissions.' },
    { title: 'Search Inbox', content: 'Explains keyword filtering across contact submissions.' },
    { title: 'Status Filter', content: 'Explains how to isolate unread, read, or replied contact items.' },
    { title: 'Mark Read', content: 'Explains how to move a message out of the unread queue.' },
    { title: 'Mark Replied', content: 'Explains how to mark a message after follow-up is completed.' },
    { title: 'Delete Message', content: 'Explains how to remove a contact submission from the admin queue.' },
    { title: 'Open Message', content: 'Explains how to inspect the full contact message details safely.' },
    { title: 'Contact Source', content: 'Explains where public contact submissions originate and how they link back.' },
];

const PAGE_GUIDES: AdminPageGuideEntry[] = [
    {
        prefixes: [ADMIN_PATHS.dashboard],
        guide: {
            title: 'Admin Dashboard',
            content: 'This page is the control-plane summary for the whole product. It highlights where attention is needed before you open a deeper module.',
            actions: [
                { label: 'Open module cards', description: 'Jump into the affected module with the current status context still visible.' },
                { label: 'Review alerts', description: 'Open actionable alerts to resolve unread or high-priority items without scanning every panel.' },
            ],
            affected: 'Admins, moderators, support, finance, and the public/student flows linked from dashboard widgets.',
            bestPractice: 'Use the dashboard to spot anomalies, then make the actual changes inside the linked module page.',
        },
    },
    {
        prefixes: [ADMIN_PATHS.questionBankNew],
        guide: {
            title: 'Add Question',
            content: 'This screen creates a new reusable question that can be assembled into future exams or sets.',
            actions: [
                { label: 'Save question', description: 'Persist the new bilingual question, answers, marks, and metadata into the active bank.' },
            ],
            affected: 'Exam creators, review staff, and any assessments that reuse this bank content.',
        },
    },
    {
        prefixes: [ADMIN_PATHS.questionBankImport],
        guide: {
            title: 'Import Questions',
            content: 'This screen imports bulk question rows from spreadsheet files into the canonical question bank.',
            actions: [
                { label: 'Upload file', description: 'Send a CSV or spreadsheet to the importer so the bank can validate and ingest the rows.' },
                { label: 'Download template', description: 'Use the template shape to avoid column mismatch and failed imports.' },
            ],
            affected: 'Question-bank operators and all exam flows that rely on imported content.',
        },
        quickGuides: QUESTION_BANK_IMPORT_QUICK_GUIDES,
    },
    {
        prefixes: [ADMIN_PATHS.questionBankSets],
        guide: {
            title: 'Question Sets',
            content: 'This screen groups bank questions into reusable sets for exam building, review, and publishing workflows.',
            actions: [
                { label: 'Create set', description: 'Assemble a reusable bundle of questions for a future exam or authoring pass.' },
            ],
            affected: 'Exam assembly, review workflows, and content planning teams.',
        },
    },
    {
        prefixes: [ADMIN_PATHS.questionBankAnalytics],
        guide: {
            title: 'Question Analytics',
            content: 'This screen shows usage, accuracy, and performance signals for stored questions.',
            actions: [
                { label: 'Review weak questions', description: 'Identify items that need revision, retirement, or replacement before the next exam.' },
            ],
            affected: 'Content quality reviewers and exam difficulty calibration.',
        },
    },
    {
        prefixes: [ADMIN_PATHS.questionBankArchive],
        guide: {
            title: 'Question Archive',
            content: 'This screen stores questions removed from the active authoring pool without hard deletion.',
            actions: [
                { label: 'Restore question', description: 'Return a previously archived question to the active bank.' },
            ],
            affected: 'Question-bank cleanup and restoration workflows.',
        },
    },
    {
        prefixes: [ADMIN_PATHS.questionBankSettings],
        guide: {
            title: 'Question Bank Settings',
            content: 'This screen controls defaults and rules used across question authoring and question reuse.',
            actions: [
                { label: 'Save settings', description: 'Persist the default behaviour used when authors create or import bank content.' },
            ],
            affected: 'Every question-bank authoring workflow.',
        },
    },
    {
        prefixes: [ADMIN_PATHS.financeDashboard],
        guide: {
            title: 'Finance Dashboard',
            content: 'This screen summarizes key finance balances, movement, and the health of current financial operations.',
            actions: [
                { label: 'Review finance widgets', description: 'Check the current state before drilling into invoices, refunds, budgets, or exports.' },
            ],
            affected: 'Finance admins and payment-review operators.',
        },
        quickGuides: FINANCE_DASHBOARD_QUICK_GUIDES,
    },
    {
        prefixes: [ADMIN_PATHS.financeTransactions],
        guide: {
            title: 'Finance Transactions',
            content: 'This screen lists financial movements such as income, adjustments, and operational entries.',
            actions: [
                { label: 'Review transactions', description: 'Inspect transaction history and reconcile mismatched financial state.' },
            ],
            affected: 'Finance review, reconciliation, and audit workflows.',
        },
    },
    {
        prefixes: [ADMIN_PATHS.financeInvoices],
        guide: {
            title: 'Finance Invoices',
            content: 'This screen manages invoice records, due states, and follow-up for collected or outstanding amounts.',
            actions: [
                { label: 'Open invoice', description: 'Inspect and update the invoice record linked to the relevant payer or finance workflow.' },
            ],
            affected: 'Finance staff and invoice follow-up workflows.',
        },
    },
    {
        prefixes: [ADMIN_PATHS.financeExpenses],
        guide: {
            title: 'Finance Expenses',
            content: 'This screen records and reviews outgoing finance items such as operational or manual expense entries.',
            actions: [
                { label: 'Log expense', description: 'Persist an expense so reports and balances reflect the real outgoing total.' },
            ],
            affected: 'Budget tracking and finance reporting.',
        },
    },
    {
        prefixes: [ADMIN_PATHS.financeBudgets],
        guide: {
            title: 'Finance Budgets',
            content: 'This screen manages budget envelopes and target limits used for operational oversight.',
            actions: [
                { label: 'Create or edit budget', description: 'Define or adjust the target amount for a tracked budget category.' },
            ],
            affected: 'Budget planning and spend-control workflows.',
        },
    },
    {
        prefixes: [ADMIN_PATHS.financeRecurring],
        guide: {
            title: 'Recurring Finance',
            content: 'This screen controls recurring finance entries that repeat on a schedule.',
            actions: [
                { label: 'Manage recurring entry', description: 'Keep scheduled income or expense entries aligned with the live ledger.' },
            ],
            affected: 'Recurring cost and subscription-linked finance schedules.',
        },
    },
    {
        prefixes: [ADMIN_PATHS.financeVendors],
        guide: {
            title: 'Vendors',
            content: 'This screen tracks vendor records used across operational and finance workflows.',
            actions: [
                { label: 'Update vendor', description: 'Maintain the vendor details used by expense and payment records.' },
            ],
            affected: 'Vendor management and finance reconciliation.',
        },
    },
    {
        prefixes: [ADMIN_PATHS.financeRefunds],
        guide: {
            title: 'Refunds',
            content: 'This screen manages refund requests, status changes, and the finance reflection of returned funds.',
            actions: [
                { label: 'Review refund', description: 'Confirm that the refund state and related finance record are still aligned.' },
            ],
            affected: 'Students, finance staff, and payment review workflows.',
        },
    },
    {
        prefixes: [ADMIN_PATHS.financeExport],
        guide: {
            title: 'Finance Export',
            content: 'This screen exports finance datasets for reconciliation, reporting, or offline review.',
            actions: [
                { label: 'Export data', description: 'Generate a finance dataset for the selected scope and format.' },
            ],
            affected: 'Finance reports, audits, and external handoffs.',
        },
    },
    {
        prefixes: [ADMIN_PATHS.financeImport],
        guide: {
            title: 'Finance Import',
            content: 'This screen imports finance data from supported file formats into the finance center.',
            actions: [
                { label: 'Import file', description: 'Bring external finance data into the system so dashboards and ledgers can reflect it.' },
            ],
            affected: 'Finance migration and reconciliation workflows.',
        },
    },
    {
        prefixes: [ADMIN_PATHS.financeAuditLog],
        guide: {
            title: 'Finance Audit Log',
            content: 'This screen shows who changed finance data and when the change occurred.',
            actions: [
                { label: 'Inspect audit trail', description: 'Review the history behind a finance change before approving or escalating it.' },
            ],
            affected: 'Audit reviewers and finance compliance workflows.',
        },
    },
    {
        prefixes: [ADMIN_PATHS.financeSettings],
        guide: {
            title: 'Finance Settings',
            content: 'This screen controls finance-center behaviour, defaults, and workflow options.',
            actions: [
                { label: 'Save settings', description: 'Persist finance-center behaviour changes for the team.' },
            ],
            enabledNote: 'The selected finance behaviour stays active after save.',
            disabledNote: 'The selected finance behaviour is turned off while historical records remain intact.',
            affected: 'Finance staff and any workflow using finance-center settings.',
        },
    },
    {
        prefixes: [ADMIN_PATHS.studentMgmtCreate],
        guide: {
            title: 'Create Student',
            content: 'This screen creates a new student record and can attach group or subscription context during onboarding.',
            actions: [
                { label: 'Create student', description: 'Persist the new student account so it becomes available to admin, student, and downstream workflows.' },
            ],
            affected: 'Student onboarding, subscriptions, payments, and group assignment flows.',
        },
    },
    {
        prefixes: [ADMIN_PATHS.studentMgmtImportExport],
        guide: {
            title: 'Student Import / Export',
            content: 'This screen moves student data in or out of the canonical student management system.',
            actions: [
                { label: 'Import or export', description: 'Bulk move student records while preserving the current admin workflow as the source of truth.' },
            ],
            affected: 'Student operations, CRM, and audit handoffs.',
        },
    },
    {
        prefixes: [ADMIN_PATHS.studentMgmtGroups],
        guide: {
            title: 'Student Groups',
            content: 'This screen manages student grouping used for targeting, exams, and communication workflows.',
            actions: [
                { label: 'Manage groups', description: 'Update group membership and structure used by targeted admin flows.' },
            ],
            affected: 'Student targeting, exams, notifications, and CRM workflows.',
        },
    },
    {
        prefixes: [ADMIN_PATHS.studentMgmtAudiences],
        guide: {
            title: 'Student Audiences',
            content: 'This screen builds reusable student audiences used for communication, filtering, and targeting.',
            actions: [
                { label: 'Create audience', description: 'Persist a reusable audience filter that other modules can target later.' },
            ],
            affected: 'Campaigns, notifications, and CRM targeting.',
        },
    },
    {
        prefixes: [ADMIN_PATHS.studentMgmtCrmTimeline],
        guide: {
            title: 'CRM Timeline',
            content: 'This screen tracks communication and operational history for students.',
            actions: [
                { label: 'Add or review timeline entry', description: 'Keep the student communication history current and auditable.' },
            ],
            affected: 'CRM follow-up, support, and communication history.',
        },
    },
    {
        prefixes: [ADMIN_PATHS.studentMgmtWeakTopics],
        guide: {
            title: 'Weak Topics',
            content: 'This screen highlights weak-topic patterns for students based on current performance data.',
            actions: [
                { label: 'Review weak areas', description: 'Use the surfaced data to guide intervention, grouping, or content support.' },
            ],
            affected: 'Student coaching, exam review, and performance support.',
        },
    },
    {
        prefixes: [ADMIN_PATHS.studentMgmtProfileRequests],
        guide: {
            title: 'Profile Requests',
            content: 'This screen reviews pending student profile update requests before approval or rejection.',
            actions: [
                { label: 'Approve or reject', description: 'Control when a requested student profile change is allowed to go live.' },
            ],
            affected: 'Student profiles, approvals, and reflected public or student data.',
        },
    },
    {
        prefixes: [ADMIN_PATHS.studentMgmtSettings],
        guide: {
            title: 'Student Settings',
            content: 'This screen controls student-management defaults and operational settings.',
            actions: [
                { label: 'Save settings', description: 'Persist the defaults used by student-management workflows.' },
            ],
            enabledNote: 'The selected student-management behaviour remains active after save.',
            disabledNote: 'The selected behaviour is turned off while records stay stored.',
            affected: 'Student-management operators and related automation.',
        },
    },
    {
        prefixes: [ADMIN_PATHS.subscriptionContactCenter],
        guide: {
            title: 'Subscription Contact Center',
            content: 'This screen is the canonical subscription-wise contact workspace for live audience filters, copy/export, personal outreach, presets, and logs.',
            actions: [
                { label: 'Filter once', description: 'Reuse the same live subscription audience across overview, members, export, outreach, and campaign handoff.' },
            ],
            affected: 'Campaign operators, moderators, support teams, and subscription-based communication workflows.',
        },
    },
    {
        prefixes: [ADMIN_PATHS.campaignsList],
        guide: {
            title: 'Campaign List',
            content: 'This screen lists created campaigns and lets admins inspect status, cost, and retry opportunities.',
            actions: [
                { label: 'Open or retry', description: 'Inspect a campaign in detail or retry failed sends where allowed.' },
            ],
            affected: 'Campaign operators, recipients, and delivery tracking.',
        },
    },
    {
        prefixes: [ADMIN_PATHS.campaignsNew],
        guide: {
            title: 'New Campaign',
            content: 'This screen creates a new campaign and prepares it for preview or sending.',
            actions: [
                { label: 'Create and send', description: 'Prepare the audience, content, and schedule for a new campaign send.' },
            ],
            affected: 'Campaign operators, targeted audiences, and notification delivery.',
        },
    },
    {
        prefixes: [ADMIN_PATHS.campaignsTemplates],
        guide: {
            title: 'Campaign Templates',
            content: 'This screen manages reusable campaign templates.',
            actions: [
                { label: 'Create or edit template', description: 'Persist a reusable message structure for future campaign sends.' },
            ],
            affected: 'Campaign composition and content consistency.',
        },
    },
    {
        prefixes: [ADMIN_PATHS.campaignsLogs],
        guide: {
            title: 'Campaign Logs',
            content: 'This screen reviews delivery history and operational outcomes for campaign sends.',
            actions: [
                { label: 'Inspect logs', description: 'Confirm what happened during campaign delivery before retrying or escalating.' },
            ],
            affected: 'Campaign operations, debugging, and audits.',
        },
    },
    {
        prefixes: [ADMIN_PATHS.campaignsSettings],
        guide: {
            title: 'Campaign Settings',
            content: 'This screen controls campaign platform defaults, providers, triggers, and export support.',
            actions: [
                { label: 'Save settings', description: 'Persist the live campaign-platform behaviour and provider configuration.' },
            ],
            enabledNote: 'The selected campaign behaviour or provider path stays active after save.',
            disabledNote: 'The selected campaign behaviour or provider path is turned off.',
            affected: 'Campaign operators, recipients, and delivery routing.',
        },
    },
    {
        prefixes: [ADMIN_PATHS.homeControl],
        guide: {
            title: 'Home Settings',
            content: 'This page controls what appears on the public home page, in which order it appears, and which call-to-actions stay visible.',
            actions: [
                { label: 'Save', description: 'Persist the latest draft so public home sections, hero content, previews, and CTA labels reflect your changes.' },
                { label: 'Reset section', description: 'Restore only the current section to its default values without wiping unrelated home settings.' },
            ],
            enabledNote: 'When a section or toggle is enabled, the matching home block can render for public visitors after save and refresh.',
            disabledNote: 'When disabled, the related block or feature is hidden from the public home page even if its content still exists in admin.',
            affected: 'Public visitors and any student journey starting from the home page.',
            bestPractice: 'Change one section at a time, save, then verify the public home page reflects the update before editing the next block.',
        },
        quickGuides: HOME_CONTROL_QUICK_GUIDES,
    },
    {
        prefixes: [ADMIN_PATHS.siteSettings],
        guide: {
            title: 'Site Settings',
            content: 'This page controls the global brand, contact channels, theme defaults, pricing display rules, and subscription-page presentation.',
            actions: [
                { label: 'Save', description: 'Apply website identity, public contact data, pricing formatting, and UI defaults across public and student views.' },
                { label: 'Upload logo or favicon', description: 'Replace the public brand assets used in navigation, browser tabs, and shared UI surfaces.' },
            ],
            enabledNote: 'When a UI option is enabled, the related public or student interface behavior becomes available immediately after save.',
            disabledNote: 'When disabled, the related mode or UI treatment stops appearing even if old data still exists in the database.',
            affected: 'Public visitors, students, and all branded surfaces using global settings.',
        },
        quickGuides: SITE_SETTINGS_QUICK_GUIDES,
    },
    {
        prefixes: [ADMIN_PATHS.bannerManager, ADMIN_PATHS.campaignBanners],
        guide: {
            title: 'Banner Controls',
            content: 'These pages manage the promotional visuals shown on home and campaign surfaces, including visibility and ordering.',
            actions: [
                { label: 'Create or edit banner', description: 'Update the artwork, destination URL, and targeting for a banner slot.' },
                { label: 'Reorder', description: 'Change which banner appears first in a carousel or slot sequence.' },
            ],
            enabledNote: 'Enabled banners are eligible to appear in their assigned slots once saved and published.',
            disabledNote: 'Disabled banners stay stored in admin but no longer render to visitors in the linked slot.',
            affected: 'Public home visitors, active marketing campaigns, and click-through routes tied to banner CTAs.',
        },
    },
    {
        prefixes: [ADMIN_PATHS.universities, ADMIN_PATHS.universitySettings],
        guide: {
            title: 'University Management',
            content: 'This area controls university records, visibility, categorisation, featured placement, and public-card presentation.',
            actions: [
                { label: 'Edit university', description: 'Update the data that drives public university detail pages and admin review lists.' },
                { label: 'Toggle visibility or featured state', description: 'Control whether a university shows in public lists or receives highlighted placement.' },
            ],
            enabledNote: 'Enabled or featured records stay eligible for public rendering, sorting, and home or cluster placement.',
            disabledNote: 'Disabled records remain in admin for maintenance but drop out of the public discovery flow.',
            affected: 'Public university browsing, student shortlist flows, and deadline/exam discovery widgets.',
        },
    },
    {
        prefixes: [adminUi('news')],
        guide: {
            title: 'News Management',
            content: 'This console handles news ingestion, moderation, publishing, duplicate review, and public visibility.',
            actions: [
                { label: 'Publish', description: 'Move approved items into the public news feed and any linked home preview surfaces.' },
                { label: 'Reject or archive', description: 'Keep low-quality or duplicate items out of the public feed while preserving audit history.' },
            ],
            enabledNote: 'Enabled sources or settings continue pulling and surfacing allowed news content.',
            disabledNote: 'Disabled sources stop contributing new items, and disabled display settings hide linked public news surfaces.',
            affected: 'Public news readers, homepage preview blocks, and internal review workflows.',
        },
    },
    {
        prefixes: [ADMIN_PATHS.exams],
        guide: {
            title: 'Exam Controls',
            content: 'This module controls internal and external exam visibility, imports, sync settings, and student-facing exam access.',
            actions: [
                { label: 'Create or edit exam', description: 'Define eligibility, dates, result rules, and visibility for the exam lifecycle.' },
                { label: 'Switch tabs', description: 'Change between internal, external, import, center, sync-log, or settings views without leaving the module.' },
            ],
            enabledNote: 'Enabled exam visibility makes the exam eligible to appear for matching students or public visitors, depending on its access rules.',
            disabledNote: 'Disabled exams or settings remove the item from the intended audience while preserving admin access for maintenance.',
            affected: 'Eligible students, admin exam operators, and any public preview surfaces configured to show exams.',
        },
    },
    {
        prefixes: [ADMIN_PATHS.questionBank],
        guide: {
            title: 'Question Bank',
            content: 'This module manages question storage, imports, analytics, archives, and the content used to assemble assessments.',
            actions: [
                { label: 'Add or import questions', description: 'Increase the pool of question content available for exam assembly and review.' },
                { label: 'Archive or restore', description: 'Move questions in and out of active authoring without losing history.' },
            ],
            affected: 'Exam creators, review staff, and any assessment flows relying on the stored question set.',
        },
    },
    {
        prefixes: [adminUi('student-management'), ADMIN_PATHS.notificationCenter, ADMIN_PATHS.studentSettings],
        guide: {
            title: 'Student Management',
            content: 'This area manages students, groups, audiences, profile requests, CRM actions, and student-side operational settings.',
            actions: [
                { label: 'Create or update student', description: 'Change the account, subscription, group, and profile state used across the student experience.' },
                { label: 'Open profile requests or alerts', description: 'Review admin actions waiting for approval, profile moderation, or targeted student follow-up.' },
            ],
            enabledNote: 'Enabled automation or notification settings continue affecting student lifecycle events after save.',
            disabledNote: 'Disabled student settings stop the linked automation or visibility behavior while leaving records intact.',
            affected: 'Students, support/admin teams, notifications, subscriptions, and related exam eligibility flows.',
        },
    },
    {
        prefixes: [ADMIN_PATHS.subscriptionPlans, ADMIN_PATHS.subscriptionsV2, ADMIN_PATHS.subscriptionContactCenter],
        guide: {
            title: 'Subscription and Payments',
            content: 'This module controls plan definitions, current subscriptions, and the privileges those plans unlock across the product.',
            actions: [
                { label: 'Edit plan', description: 'Update pricing, labels, privileges, and descriptions shown in pricing and student dashboards.' },
                { label: 'Review subscriptions', description: 'Check active, expired, or pending student subscription state and investigate plan mismatches.' },
            ],
            enabledNote: 'Enabled plans remain selectable and can gate support, exams, or premium widgets based on the configured privileges.',
            disabledNote: 'Disabled plans stay in history but should stop being offered to new users and can be hidden from pricing surfaces.',
            affected: 'Students, finance sync flows, pricing pages, and any plan-gated feature.',
        },
    },
    {
        prefixes: [ADMIN_PATHS.resources, ADMIN_PATHS.resourceSettings],
        guide: {
            title: 'Resources',
            content: 'This module manages resource records and the settings that control how resources appear on public and student pages.',
            actions: [
                { label: 'Create or edit resource', description: 'Publish or revise study resources, links, and downloadable content.' },
                { label: 'Adjust settings', description: 'Control how resource previews and listing behaviour work across the product.' },
            ],
            enabledNote: 'Enabled resources and preview settings stay visible in the intended public or student surfaces.',
            disabledNote: 'Disabled items remain in admin but stop appearing in the resource discovery flow.',
        },
    },
    {
        prefixes: [ADMIN_PATHS.contact],
        guide: {
            title: 'Contact Messages',
            content: 'This screen manages public contact submissions and the admin follow-up queue.',
            actions: [
                { label: 'Refresh inbox', description: 'Pull in the latest public contact submissions before reviewing or responding.' },
                { label: 'Update message state', description: 'Mark messages as read or replied to keep the support queue accurate.' },
            ],
            affected: 'Public visitors submitting contact forms and admins handling outreach follow-up.',
        },
        quickGuides: CONTACT_MESSAGES_QUICK_GUIDES,
    },
    {
        prefixes: [ADMIN_PATHS.supportCenter, ADMIN_PATHS.helpCenterAdmin, ADMIN_PATHS.contact, ADMIN_PATHS.notifications],
        guide: {
            title: 'Support and Communication',
            content: 'These pages manage support tickets, contact messages, help-center content, and notification delivery settings.',
            actions: [
                { label: 'Reply or resolve', description: 'Handle live support and contact conversations while keeping unread counts and statuses accurate.' },
                { label: 'Update communication settings', description: 'Control whether certain notification or help-center behaviours remain active.' },
            ],
            enabledNote: 'Enabled communication settings keep the related public, student, or admin messaging flow available.',
            disabledNote: 'Disabled settings can block public communication entry points or stop certain notification behaviour from firing.',
            affected: 'Public contact flows, subscribed support users, admins, and notification operators.',
        },
    },
    {
        prefixes: [ADMIN_PATHS.campaignsDashboard, ADMIN_PATHS.notificationTriggers],
        guide: {
            title: 'Campaign Platform',
            content: 'This module controls notification campaigns, templates, trigger rules, provider checks, and delivery logs.',
            actions: [
                { label: 'Preview or provider check', description: 'Use campaign preview and provider-level checks to verify routing and delivery readiness without keeping a duplicate test-send console.' },
                { label: 'Activate trigger or campaign', description: 'Allow new automated or manual sends to start from this configuration.' },
            ],
            enabledNote: 'Enabled triggers and campaign settings allow the configured sends to execute when their conditions match.',
            disabledNote: 'Disabled triggers or campaigns stay stored but stop sending automatically or appearing as active choices.',
            affected: 'Notification recipients, campaign managers, provider usage, and any finance-cost sync tied to sends.',
        },
    },
    {
        prefixes: [ADMIN_PATHS.dataHub],
        guide: {
            title: 'Data Hub',
            content: 'This page controls import/export workflows and lets admins review historical transfer jobs.',
            actions: [
                { label: 'Export', description: 'Generate downloadable datasets for the selected entity or audience.' },
                { label: 'Review history', description: 'Check who imported or exported data and what happened during the job.' },
            ],
            affected: 'Admins handling operational data moves, audits, and reporting handoffs.',
        },
    },
    {
        prefixes: [adminUi('finance')],
        guide: {
            title: 'Finance Center',
            content: 'This module controls revenue, expenses, invoices, refunds, recurring entries, vendors, exports, and audit history.',
            actions: [
                { label: 'Record or review entries', description: 'Inspect dashboards, transactions, invoices, and refunds to keep financial state aligned with the product.' },
                { label: 'Import, export, or change settings', description: 'Move financial data in or out and define how finance workflows behave for the team.' },
            ],
            enabledNote: 'Enabled finance settings keep the linked automation, formatting, or reconciliation behaviour active after save.',
            disabledNote: 'Disabled finance settings stop the related workflow or visibility while preserving historical records.',
            affected: 'Finance admins, campaign cost sync, payment review flows, and financial reporting surfaces.',
        },
    },
    {
        prefixes: [adminUi('team')],
        guide: {
            title: 'Team and Access Control',
            content: 'This module controls team members, roles, permissions, approval rules, security posture, and invite workflows.',
            actions: [
                { label: 'Edit role or permission', description: 'Change what staff can see or do across admin pages and protected actions.' },
                { label: 'Review activity or security', description: 'Check access changes, login posture, and team-side audit trails.' },
            ],
            enabledNote: 'Enabled access or approval rules allow the linked staff capability or workflow to remain available.',
            disabledNote: 'Disabled roles, permissions, or rules remove access to the linked route or action without deleting historical records.',
            affected: 'Admins, moderators, support agents, finance agents, and any protected admin route or API.',
        },
    },
    {
        prefixes: [ADMIN_PATHS.securityCenter, ADMIN_PATHS.systemLogs, ADMIN_PATHS.reports, ADMIN_PATHS.approvals],
        guide: {
            title: 'Security and Logs',
            content: 'This area covers security posture, reports, approvals, and audit visibility for sensitive admin actions.',
            actions: [
                { label: 'Review alerts or approvals', description: 'Investigate risk, then approve, deny, or follow up on sensitive operations.' },
                { label: 'Adjust security settings', description: 'Change authentication, access, alerting, or audit rules that protect the control plane.' },
            ],
            enabledNote: 'Enabled controls enforce the related protection or logging behaviour after save.',
            disabledNote: 'Disabled controls relax the linked protection or visibility, which can increase operational risk.',
            affected: 'Every admin role, high-risk actions, protected routes, and the audit or compliance trail.',
        },
        quickGuides: SECURITY_CENTER_QUICK_GUIDES,
    },
    {
        prefixes: [ADMIN_PATHS.adminProfile],
        guide: {
            title: 'Admin Profile',
            content: 'This page manages the current admin account profile, preferences, and personal control-plane settings.',
            actions: [
                { label: 'Update profile', description: 'Save changes to the current admin identity and personal display information.' },
                { label: 'Review account state', description: 'Check the account details and preferences affecting the current admin session.' },
            ],
            affected: 'The currently signed-in admin and any personal settings attached to that account.',
        },
    },
];

export function getAdminPageGuide(pathname: string): AdminPageGuide | null {
    const normalizedPath = pathname.split('?')[0];
    const matches = PAGE_GUIDES
        .map((entry, index) => ({
            entry,
            index,
            matchedPrefixLength: Math.max(
                ...entry.prefixes
                    .filter((prefix) => normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`))
                    .map((prefix) => prefix.length),
            ),
        }))
        .filter((entry) => Number.isFinite(entry.matchedPrefixLength));
    if (matches.length === 0) return null;
    matches.sort((a, b) => {
        if (b.matchedPrefixLength !== a.matchedPrefixLength) {
            return b.matchedPrefixLength - a.matchedPrefixLength;
        }
        return a.index - b.index;
    });
    return matches[0].entry.guide;
}

export function getAdminPageQuickGuides(pathname: string): AdminPageGuide[] {
    const normalizedPath = pathname.split('?')[0];
    const matches = PAGE_GUIDES
        .map((entry, index) => ({
            entry,
            index,
            matchedPrefixLength: Math.max(
                ...entry.prefixes
                    .filter((prefix) => normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`))
                    .map((prefix) => prefix.length),
            ),
        }))
        .filter((entry) => Number.isFinite(entry.matchedPrefixLength));
    if (matches.length === 0) return [];
    matches.sort((a, b) => {
        if (b.matchedPrefixLength !== a.matchedPrefixLength) {
            return b.matchedPrefixLength - a.matchedPrefixLength;
        }
        return a.index - b.index;
    });
    return matches[0].entry.quickGuides || [];
}
