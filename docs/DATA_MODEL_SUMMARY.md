# Data Model Summary

## Core identity and access
- `User`
- `StudentProfile`
- `AdminProfile`
- `ActiveSession`
- `RolePermissionSet`
- `TeamRole`
- `MemberPermissionOverride`
- `TeamInvite`
- `TeamAuditLog`
- `LoginActivity`
- `SecurityToken`
- `PasswordReset`
- `OtpVerification`

## Public website and content
- `HomeSettings`
- `HomeConfig`
- `HomePage`
- `WebsiteSettings`
- `Banner`
- `ContentBlock`
- `HomeAlert`
- `Service`
- `ServiceCategory`
- `ServicePricingPlan`
- `ServicePageConfig`
- `Resource`
- `ResourceSettings`
- `HelpCategory`
- `HelpArticle`

## Universities and academic catalog
- `University`
- `UniversityCategory`
- `UniversityCluster`
- `UniversitySettings`
- `UniversityImportJob`

## News and notices
- `News`
- `NewsCategory`
- `NewsMedia`
- `NewsSource`
- `NewsFetchJob`
- `NewsAuditEvent`
- `NewsSystemSettings`
- `AnnouncementNotice`

## Exams and question bank
- `Exam`
- `ExamSession`
- `ExamResult`
- `ExamCertificate`
- `ExamCenter`
- `ExamEvent`
- `ExamImportJob`
- `ExamImportRowIssue`
- `ExamImportTemplate`
- `ExamMappingProfile`
- `ExamProfileSyncLog`
- `Question`
- `QuestionBankQuestion`
- `QuestionBankSet`
- `QuestionBankAnalytics`
- `QuestionBankSettings`
- `QuestionBankUsage`
- `QuestionImportJob`
- `QuestionMedia`
- `QuestionRevision`

## Subscription, payment, finance
- `SubscriptionPlan`
- `UserSubscription`
- `SubscriptionSettings`
- `SubscriptionAutomationLog`
- `SubscriptionContactPreset`
- `ManualPayment`
- `PaymentWebhookEvent`
- `FinanceTransaction`
- `FinanceInvoice`
- `FinanceBudget`
- `FinanceRefund`
- `FinanceRecurringRule`
- `FinanceVendor`
- `FinanceSettings`
- `ExpenseEntry`
- `ChartOfAccounts`
- `StaffPayout`
- `StudentDueLedger`

## Communication and notifications
- `Notification`
- `StudentNotificationRead`
- `AdminNotificationRead`
- `NotificationTemplate`
- `NotificationProvider`
- `NotificationSettings`
- `NotificationJob`
- `NotificationDeliveryLog`
- `LiveAlertAck`
- `EventLog`
- `JobRunLog`

## Support and operational workflows
- `ContactMessage`
- `SupportTicket`
- `SupportTicketMessage`
- `ProfileUpdateRequest`
- `ActionApproval`
- `StudentContactTimeline`
- `ImportExportLog`
- `BackupJob`
- `SecureUpload`
- `SecurityAlertLog`
- `SecurityRateLimitEvent`
- `SecuritySettings`

## Student enrichment
- `StudentGroup`
- `GroupMembership`
- `StudentBadge`
- `Badge`
- `StudentWatchlist`
- `StudentDashboardConfig`
- `StudentApplication`

## Legacy model note
- The models folder still contains legacy lowercase `.model.ts` files beside active PascalCase models.
- Bootstrap did not remove them blindly; they should be retired or explicitly kept in a later cleanup phase after confirming runtime ownership.
