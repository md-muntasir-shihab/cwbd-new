# CampusWay — সম্পূর্ণ QA Audit Report ও Master Testing Prompt

---

## A. Audit Summary (ধাপ ১: Website Audit)

---

### ১. System Inventory

#### Frontend Surfaces / Pages / Routes

| ক্যাটাগরি | Pages / Routes |
|---|---|
| **Public (Unauthenticated)** | Home, HomeModern, About, Contact, Privacy, Terms, NotFound, Login, OtpVerification, StudentRegister, StudentForgotPassword, StudentResetPassword, AdminSecretLogin, ChairmanLogin, Universities, UniversityDetails, UniversityCategoryBrowse, UniversityClusterBrowse, News, SingleNews, Resources, ResourceDetail, SubscriptionPlans, SubscriptionPlanDetail, SubscriptionPlanCheckout, HelpCenter, HelpArticle, CertificateVerify, ExamsListPage (public-list) |
| **Student (Authenticated)** | StudentDashboard, StudentProfile, StudentExamsHub, StudentExamDetail, ExamRunnerPage, ExamResultPage, ExamSolutionsPage, StudentResults, StudentResultDetail, StudentPayments, StudentNotifications, StudentResources, StudentApplications, StudentSupport, StudentSupportThread, StudentSecurity, Profile |
| **Admin Panel** | AdminDashboard, AdminHomeSettings, AdminSettingsSite, AdminSettingsBanners, AdminCampaignBanners, AdminUniversitiesPage, AdminUniversitySettings, AdminNewsConsole, AdminSettingsNews, AdminExamsPage (7+ tabs: internal/external/imports/templates/centers/sync-logs/settings), AdminQuestionBankPage (8+ tabs), AdminStudentManagement (10+ sub-routes: list/create/import-export/groups/audiences/crm-timeline/weak-topics/profile-requests/notifications/settings), AdminSubscriptionsV2Page, AdminSubscriptionPlans, AdminContactCenter, AdminPayments, AdminFinanceCenter (12 sub-routes: dashboard/transactions/invoices/budgets/recurring/expenses/vendors/refunds/import/export/audit-log/settings), AdminResourcesPage, AdminSettingsResources, AdminSupportCenterPage, AdminHelpCenter, AdminContactPage, AdminNotificationCenter, AdminCampaignsHub (8+ sub-routes), AdminReports, AdminSettingsSecurity, AdminSettingsLogs, AdminSettingsProfile, AdminSettingsRuntime, AdminSettingsAnalytics, AdminSettingsNotifications, AdminSettingsDashboardConfig, AdminSettingsCenter, AdminAccessDenied, AdminTeamMembers, AdminTeamRoles, AdminTeamPermissions, AdminTeamApprovalRules, AdminTeamActivity, AdminTeamSecurity, AdminTeamInvites, AdminApprovals, AdminDataHub |
| **Chairman** | ChairmanDashboard, ChairmanLogin |

**মোট Frontend Pages: ~80+**

#### Backend APIs / Endpoints

| Route Group | Base Path | আনুমানিক Endpoint সংখ্যা |
|---|---|---|
| **Auth** | `/api/auth/*` | ~25 (login, register, refresh, logout, verify-email, forgot-password, reset-password, verify-2fa, resend-otp, session-check, session-stream, security/sessions, 2fa/setup, 2fa/confirm, 2fa/backup-codes, 2fa/disable, oauth/providers, oauth/:provider/start, oauth/:provider/callback, change-password) |
| **Public** | `/api/*` | ~60 (universities, banners, resources, news, exams, subscriptions, help-center, content-blocks, services, contact, search, home, settings, social-links, system/status, analytics) |
| **Student** | `/api/student/*` | ~30 (profile, dashboard, exams, results, payments, notifications, resources, leaderboard, applications, watchlist, weak-topics, support-tickets, dashboard-full) |
| **Admin** | `/api/{ADMIN_SECRET_PATH}/*` | ~300+ (users CRUD, exams CRUD, universities CRUD, news CRUD, question-bank CRUD, banners, resources, subscriptions, finance-center, notification-center, campaigns, support-tickets, security, reports, team-access, backups, approvals, jobs, forensics, analytics, settings) |
| **Webhook** | `/api/webhooks/*` | ~3 (SSLCommerz payment callbacks) |

**মোট Backend Endpoints: ~420+**

#### Auth / Session Flow

```
Login Flow:
1. POST /api/auth/login → email/username + password
2. Backend validates → checks account status (active/suspended/blocked/pending)
3. Account lock check → 5 failed attempts = 15 min lock
4. Suspicious login detection → unknown IP/device flagged
5. 2FA check → if enabled, returns pending_2fa status
6. POST /api/auth/verify-2fa → OTP/TOTP/backup code
7. JWT access token (15 min) + refresh token (7 days) issued
8. Token stored in cookie (access_token) + Authorization header support
9. Session tracked in ActiveSession model

Token Refresh: POST /api/auth/refresh (CSRF protected)
Logout: POST /api/auth/logout (invalidates session)
Session Stream: GET /api/auth/session-stream (SSE real-time)

Admin Login: POST /api/auth/admin/login (separate endpoint, stricter rate limit)
Chairman Login: POST /api/auth/chairman/login (separate endpoint)
Student Register: POST /api/auth/register (App Check enforced, registration policy)
```

#### Role Matrix

| Role | Admin Panel Access | Module Permissions | বিশেষ সীমাবদ্ধতা |
|---|---|---|---|
| **superadmin** | সম্পূর্ণ | সব 17 module × 8 action = সব | কোনো সীমাবদ্ধতা নেই |
| **admin** | সম্পূর্ণ | সব module-এ view/create/edit/publish/approve/export/bulk; নির্দিষ্ট module-এ delete | delete শুধু universities/news/exams/question_bank/students_groups/resources |
| **moderator** | Content + Students | Content modules-এ view/create/edit/publish/export; news/qbank/exams-এ approve/bulk; students_groups-এ view/edit/bulk; support_center-এ view/edit | delete নেই, finance নেই, security নেই |
| **editor** | সীমিত Content | news/resources/question_bank-এ view/create/edit/export; home_control-এ view/edit; universities/exams-এ শুধু view | delete/publish/approve/bulk নেই |
| **viewer** | Read-only | সব admin module-এ শুধু view | কোনো write operation নেই |
| **support_agent** | Support Only | support_center-এ view/create/edit/approve/export; reports_analytics-এ view | শুধু support ও reports |
| **finance_agent** | Finance Only | payments ও finance_center-এ view/create/edit/approve/export/bulk; reports_analytics-এ view/export | শুধু finance ও reports |
| **chairman** | Reports Only | reports_analytics-এ view/export; security_logs-এ view | শুধু reports ও security logs দেখতে পারে |
| **student** | নেই | Admin panel-এ কোনো access নেই | শুধু student portal |

#### Data Dependencies ও Seed Needs

**Core Models (135+ MongoDB collections):**
- User, StudentProfile, AdminProfile
- Exam, ExamSession, ExamResult, ExamEvent, ExamCertificate, Question, QuestionBankQuestion
- University, UniversityCategory, UniversityCluster
- News, NewsSource, NewsCategory, NewsMedia
- SubscriptionPlan, UserSubscription, SubscriptionSettings
- FinanceTransaction, FinanceInvoice, FinanceBudget, FinanceRecurringRule, FinanceRefund, FinanceVendor
- Banner, Resource, HomeConfig, HomeSettings, HomeAlert
- Notification, NotificationTemplate, NotificationProvider, NotificationJob
- SupportTicket, SupportTicketMessage, ContactMessage
- AuditLog, SecurityAlert, LoginActivity, ActiveSession
- TeamRole, TeamApprovalRule, TeamInvite, TeamAuditLog
- StudentGroup, StudentWatchlist, StudentBadge, Badge
- HelpArticle, HelpCategory, ContentBlock
- ActionApproval, BackupJob, JobRunLog

**Seed Data Requirements:**
1. superadmin user (ADMIN_EMAIL env variable)
2. কমপক্ষে ১টি student user
3. প্রতিটি admin sub-role-এর জন্য ১টি user (moderator, editor, viewer, support_agent, finance_agent)
4. chairman user
5. কমপক্ষে ২টি university (with categories)
6. কমপক্ষে ২টি exam (1 internal MCQ, 1 external link)
7. কমপক্ষে ৫টি question (question bank)
8. কমপক্ষে ২টি subscription plan (1 free, 1 paid)
9. কমপক্ষে ১টি news item (published)
10. কমপক্ষে ১টি banner (active)
11. কমপক্ষে ১টি resource
12. কমপক্ষে ১টি support ticket
13. কমপক্ষে ১টি notification template + provider
14. Finance seed: ১টি transaction, ১টি invoice, ১টি budget

---

### ২. Feature Map

#### Module-wise Feature তালিকা

| Module | Features |
|---|---|
| **Auth System** | Email/username login, Student registration, Admin login (separate), Chairman login (separate), 2FA (email/SMS/authenticator), Backup codes, Password reset, Email verification, OTP verification, OAuth providers, Session management, Suspicious login detection, Account lock (5 attempts/15 min), CSRF protection, App Check enforcement |
| **Home / CMS** | Dynamic home page, Hero banner, Promotional banner, Announcements, Stats, Home stream (SSE), Aggregated home data, Site settings, Social links, Content blocks, System status page |
| **Universities** | CRUD, Categories, Clusters, Featured ordering, Bulk import (CSV/XLSX), Bulk delete (2-person approval), Export, Slug-based public view, Browse by category/cluster, Settings |
| **News** | RSS feed integration, AI content check, Multi-stage workflow (draft→review→approve→publish), Scheduled publishing, Breaking news publish (2-person approval), Media management, Categories, Sources management, Appearance/AI/Share settings, Export (news/sources/logs), Audit logs, Archive/Restore/Purge, Merge duplicates, Convert to notice, Trending/Featured |
| **Exams** | Create/Edit/Delete, MCQ + Written optional, Internal/External delivery, Advanced scheduling (multiple windows), Question randomization, Negative marking, Anti-cheat (tab switch/copy-paste/fullscreen), Auto-submit on timeout, Answer edit limits, Exam preview, Clone exam, Share link, Banner upload, Result publishing (immediate/scheduled/manual), Certificate generation, Live monitoring (SSE), Force submit, Reset attempt, Import/Export results, Exam centers, Import templates, Mapping profiles, Profile sync, Daily report, Analytics |
| **Question Bank** | CRUD with versioning, Multi-language (EN/BN), Difficulty levels, Topic/subtopic, Image/formula support (KaTeX), Bulk import, Export, Similar question search, Approve/Lock workflow, Revision history, Media upload, Analytics, Archive, Sets |
| **Student Management** | List/Create/Update/Delete, Bulk import (CSV/XLSX), Groups management, Audiences, CRM timeline, Weak topics analysis, Profile update requests (approve/reject), Notifications, Settings, Export, Guardian contact (OTP verification), Badges |
| **Subscriptions** | Plans CRUD, Free/Paid/Custom/Enterprise types, Billing cycles, Feature-based access, Plan comparison, Reorder, Duplicate, Toggle featured, Export, Settings, Contact center, Payment request, Upload proof, Renewal automation, Subscription history |
| **Finance Center** | Dashboard (summary/cashflow/revenue/expenses/student growth/plan distribution), Transactions CRUD, Invoices CRUD, Budgets CRUD, Recurring rules, Expenses, Vendors, Refunds (2-person approval), Import/Export, Audit log, Settings, Chart of accounts, P&L report, Staff payouts, Student LTV, Due management, Reminders, Real-time stream (SSE) |
| **Notifications / Campaigns** | Multi-channel (email/SMS/in-app), Templates, Providers (with encrypted credentials), Jobs, Delivery logs, Retry failed, Automation settings, Campaign platform, Audience targeting, Frequency capping, Suppression lists |
| **Resources** | CRUD, Publish/Featured toggle, View/Download tracking, Slug-based public view, Settings |
| **Support** | Tickets CRUD, Student-admin messaging, Eligibility check, Status management, Notices, Contact messages (archive/resolve/delete) |
| **Help Center** | Categories, Articles CRUD, Publish/Unpublish, Public search, Feedback |
| **Security** | Security settings, Anti-cheat policy, Active sessions, Force logout (single/all), 2FA management, Security dashboard metrics, Audit logs, Security alerts (read/resolve/delete), Maintenance mode, Admin panel lock, Forensics (timeline/summary/export), Unacknowledged alerts |
| **Reports** | Summary, Analytics overview, Event logs export, Exam insights, Export |
| **Team & Access Control** | Members CRUD, Roles CRUD (with duplicate), Permissions matrix, Member overrides, Approval rules, Activity log, Security overview, Invites, Password reset, Session revoke, 2FA toggle |
| **Backups** | List, Run, Download, Restore |
| **Data Hub** | Import/Export history |

#### Critical User Journeys

1. **Student Registration → Login → Exam → Result**: Register → Verify email/OTP → Login → Browse exams → Start exam → Answer questions → Submit → View result → Download certificate
2. **Admin Exam Lifecycle**: Login → Create exam → Add questions (manual/import/question bank) → Set schedule → Publish → Monitor live → Force submit if needed → Publish results → Export report
3. **Subscription Purchase**: Browse plans → Select plan → Request payment → Upload proof → Admin approves → Subscription activated
4. **Admin User Management**: Login → Create student → Assign group → Assign subscription → Monitor dashboard → Export data
5. **Finance Workflow**: Create transaction → Create invoice → Track payment → Approve refund (2-person) → Generate P&L report
6. **News Publishing**: Fetch RSS → AI check → Edit → Submit review → Approve → Publish/Schedule → Track shares
7. **Support Flow**: Student creates ticket → Admin views → Admin replies → Student replies → Admin resolves

#### Integration Points

| From | To | Method |
|---|---|---|
| Frontend (React) | Backend (Express) | REST API (Axios) |
| Backend | MongoDB | Mongoose ODM |
| Backend | Email | Nodemailer (SMTP/SendGrid) |
| Backend | Firebase | firebase-admin (storage, auth, App Check) |
| Backend | AWS S3 | AWS SDK (file storage) |
| Backend | SSLCommerz | Payment webhooks |
| Backend | OpenAI/Gemini | AI content check (news) |
| Frontend | Firebase | Client SDK (App Check) |
| Real-time | SSE | Admin live stream, Student dashboard stream, Finance stream, User management stream, Session stream |

---

### ৩. Risk Audit

#### Permission Boundary Risks

| Risk | Severity | বিবরণ |
|---|---|---|
| **IDOR on student data** | HIGH | `/api/student/me/*` endpoints-এ user_id validation নিশ্চিত করতে হবে — অন্য student-এর data access করা যায় কিনা |
| **Admin role escalation** | HIGH | `PATCH /users/:id/role` endpoint-এ lower role admin যেন higher role assign করতে না পারে |
| **Finance agent scope creep** | MEDIUM | finance_agent যেন শুধু payments/finance_center access করতে পারে, অন্য module-এ না |
| **Viewer write attempt** | MEDIUM | viewer role-এ POST/PUT/DELETE request backend-এ properly reject হচ্ছে কিনা |
| **Chairman boundary** | MEDIUM | chairman শুধু reports_analytics (view/export) ও security_logs (view) — অন্য কিছু access করতে পারলে vulnerability |
| **2-person approval bypass** | HIGH | Bulk delete (students/universities), exam result publish, payment refund — single admin-এ complete হওয়া উচিত না |
| **Sensitive action step-up bypass** | HIGH | Export, security settings change, provider credential change, destructive operations — step-up verification ছাড়া হওয়া উচিত না |

#### Broken Flow Risks

| Risk | Severity | বিবরণ |
|---|---|---|
| **Exam auto-submit failure** | HIGH | Timeout-এ auto-submit না হলে student-এর attempt হারিয়ে যেতে পারে |
| **Exam session recovery** | HIGH | Browser crash/refresh-এ exam state recover হচ্ছে কিনা (autosave + attempt state) |
| **Payment proof upload → approval gap** | MEDIUM | Upload হলে কিন্তু admin notification না পেলে payment stuck হবে |
| **2FA recovery flow** | MEDIUM | Backup codes exhausted হলে recovery path কী |
| **Subscription expiry automation** | MEDIUM | Recurring rule execution failure-তে subscription stuck হতে পারে |
| **SSE connection drop** | LOW | Real-time streams reconnect না হলে stale data দেখাবে |

#### Mobile Responsive Risks

| Risk | Severity | বিবরণ |
|---|---|---|
| **Admin panel mobile** | HIGH | 300+ admin routes-এর complex tables/forms mobile-এ usable কিনা |
| **Exam runner mobile** | HIGH | Question palette, timer, navigation — small screen-এ overlap হতে পারে |
| **Finance tables** | MEDIUM | Multi-column tables mobile-এ horizontal scroll বা truncation |
| **Modal/Dialog stacking** | MEDIUM | Confirmation dialogs + 2-person approval modals mobile-এ overlap |
| **Keyboard overlap** | MEDIUM | Form inputs-এ mobile keyboard open হলে submit button hidden হতে পারে |

#### Security ও Privacy Risks

| Risk | Severity | বিবরণ |
|---|---|---|
| **JWT secret exposure** | CRITICAL | Production-এ JWT_SECRET hardcoded না থাকা উচিত |
| **ADMIN_SECRET_PATH guessable** | HIGH | Default "campusway-secure-admin" easily guessable |
| **NoSQL injection** | HIGH | express-mongo-sanitize আছে, কিন্তু custom query builders-এ bypass সম্ভব |
| **File upload validation** | HIGH | Multer 10MB limit আছে, কিন্তু file type validation কতটুকু strict |
| **Rate limit bypass** | MEDIUM | Distributed attack-এ IP-based rate limit bypass সম্ভব |
| **CSRF token validation** | MEDIUM | সব state-changing endpoint-এ CSRF protection আছে কিনা |
| **Sensitive data in JWT** | MEDIUM | Token-এ permissions object থাকলে token size বড় + stale permissions risk |
| **Backup download auth** | HIGH | Backup file download-এ proper authorization আছে কিনা |
| **Guardian OTP exposure** | MEDIUM | Guardian phone verification OTP leak হলে privacy breach |

#### Performance Bottleneck সম্ভাবনা

| Area | Risk | বিবরণ |
|---|---|---|
| **Aggregated home data** | MEDIUM | `/api/home` endpoint-এ multiple collection query — slow response possible |
| **Admin dashboard summary** | MEDIUM | Real-time stats calculation across 135+ collections |
| **Exam live monitoring** | HIGH | Multiple SSE connections + frequent updates — server memory pressure |
| **Bulk import** | MEDIUM | 1000+ student/university import-এ timeout possible |
| **Finance P&L report** | LOW | Large transaction set-এ aggregation pipeline slow হতে পারে |
| **News RSS fetch** | LOW | Multiple RSS sources simultaneous fetch-এ external dependency bottleneck |

---

### ৪. Testing Readiness Gaps

#### বিদ্যমান Test Coverage

**E2E Tests (Playwright): 59 spec files** — ভালো coverage আছে, তবে:
- `qa-security.spec.ts` — security tests আছে
- `qa-cross-role-flow.spec.ts` — role-based tests আছে
- `qa-responsive-theme.spec.ts` — responsive tests আছে
- `qa-student-dashboard.spec.ts` — student tests আছে
- `qa-admin-panel.spec.ts` — admin tests আছে

**Unit Tests**: Vitest + Jest configured (both frontend ও backend)

#### Missing Test Data

| Item | Status | Action Required |
|---|---|---|
| Deterministic seed script | ❌ অনুপস্থিত | প্রতিটি role-এর জন্য fixed credentials-সহ seed script দরকার |
| Test OTP bypass | ✅ আছে | `ALLOW_TEST_OTP=true`, `TEST_OTP_CODE=123456` |
| Finance test data | ❌ অনুপস্থিত | Transactions, invoices, budgets-এর seed দরকার |
| Exam with questions | ❌ আংশিক | Complete exam + 10+ questions-সহ seed দরকার |
| Multi-role test accounts | ❌ অনুপস্থিত | সব 9 role-এর জন্য pre-created accounts দরকার |

#### Missing Coverage Areas

| Area | Gap |
|---|---|
| **API negative testing** | Unauthorized access, invalid payload, rate limit exhaustion |
| **2FA complete flow** | TOTP setup → verify → backup codes → disable |
| **Finance center E2E** | Transaction → Invoice → Budget → Refund complete flow |
| **Webhook testing** | SSLCommerz payment callback simulation |
| **SSE stream testing** | Connection, reconnection, data integrity |
| **Bulk import edge cases** | Malformed CSV, duplicate entries, partial failure |
| **Certificate verification** | Generate → verify → invalid certificate |
| **Chairman portal** | Complete chairman journey |
| **Data Hub** | Import/export history |

#### Required Mocks / Seeds / Setup

1. **MongoDB**: Local MongoDB instance (`.local-mongo` directory exists) অথবা `mongodb-memory-server`
2. **Email**: SMTP mock (Nodemailer test account) অথবা SendGrid sandbox
3. **Firebase**: Firebase emulator অথবা mock
4. **S3**: LocalStack অথবা mock
5. **Payment**: SSLCommerz sandbox credentials
6. **AI**: OpenAI/Gemini mock responses

---

## B. Coverage Gaps (সংক্ষিপ্ত)

1. **Finance Center E2E**: Transaction lifecycle, invoice generation, refund approval (2-person), P&L report — কোনো dedicated E2E নেই
2. **Chairman Portal**: শুধু login test আছে, dashboard data validation নেই
3. **Webhook Integration**: Payment callback processing untested
4. **2FA Full Lifecycle**: Setup → use → backup → disable → re-enable
5. **Bulk Operations Edge Cases**: Partial failure handling, rollback behavior
6. **API Authorization Matrix**: সব 420+ endpoint × 9 role = 3780 combination-এর systematic test নেই
7. **SSE Stream Reliability**: Reconnection, data ordering, memory leak
8. **Mobile Exam Runner**: Touch interactions, orientation change, keyboard overlap
9. **Sensitive Action Step-up**: Export, security change, destructive operation verification
10. **Data Integrity**: Cross-collection consistency (e.g., user delete → cascade to student profile, exam results, subscriptions)

---

## C. Final Master Testing Prompt (Copy-Paste Ready)

---

> **এই prompt সরাসরি AI agent-কে দিলে সে পুরো CampusWay platform-এর comprehensive QA test suite তৈরি ও execute করতে পারবে।**

---