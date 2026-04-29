# Phase 0 Audit Report — Campusway-BD

> Generated as part of the integration foundation work. Documents what
> already exists in the repository so new integration code reuses
> existing primitives instead of duplicating them.

## Stack

- **Node**: per Render runtime (no `engines` pin found)
- **TypeScript**: ~5.7.2 (root, backend, frontend)
- **Frontend framework**: Vite 6 + React 19 (`frontend/`)
- **Frontend routing**: React Router v7 (`react-router-dom@^7.1.0`)
- **Backend framework**: Express 4 (`backend/src/server.ts`)
- **Backend entry point**: `backend/src/server.ts`
- **ORM/ODM**: Mongoose 8
- **Database env keys**: `MONGODB_URI` (preferred), `MONGO_URI` (fallback). `server.ts:99-105` mirrors `MONGO_URI` → `MONGODB_URI` at startup.
- **Auth method**: Backend-issued JWT (access + refresh) with cookie + Bearer header support. See `backend/src/middlewares/auth.ts`.
- **Image storage**: Local `/uploads` via `multer`, served by `serveSecureUpload` controller and Express static. `sharp@^0.34.5` available for resize. No Cloudinary detected in backend deps.
- **Existing email**: Nodemailer 6 (`nodemailer@^6.9.16`) is in backend deps. No SendGrid/Brevo SDK present.
- **Existing search**: Frontend uses `fuse.js@^7.3.0` and a `frontend/src/services/searchEngine.ts` module. Backend relies on Mongo `$text`/`$regex` queries inside individual services.
- **Cache**: In-memory only (no Redis client present).
- **Existing notification system**: Yes — fully built (`NotificationProvider`, `NotificationTemplate`, `NotificationDeliveryLog`, `NotificationJob`, `NotificationSettings`, `cron/notificationJobs.ts`, `routes/adminNotificationRoutes.ts`, `routes/adminProviderRoutes.ts`).
- **Existing campaign/audience system**: Yes — `AudienceSnapshot`, `SubscriptionAutomationLog`, `SubscriptionContactPreset`, `pages/admin/campaigns/*`, `CampaignSettingsPage`.
- **Existing backup system**: Yes — `BackupJob` model + `cron/backupJobs.ts`. No B2/SFTP destination wired yet.
- **Existing credential/vault system**: Yes — `CredentialVault` model (per-user encrypted password) and AES‑256‑GCM `services/cryptoService.ts` (`encrypt`/`decrypt`). The notification provider system already stores `credentialsEncrypted` and only returns `credentialsConfigured: boolean` to the client.
- **Existing settings model**: Yes — extensive: `Settings` (a.k.a. `SiteSettings`), `WebsiteSettings`, `HomeSettings`, `SecuritySettings`, `NotificationSettings`, `NewsSystemSettings`, `SubscriptionSettings`, `StudentSettings`, `UniversitySettings`, `QuestionBankSettings`, `ResourceSettings`, `FinanceSettings`, plus `SettingsAuditEntry`.
- **Existing audit log model**: Yes — `AuditLog` (general) plus specialized `SecurityAuditLog`, `TeamAuditLog`, `NewsAuditEvent`, `ServiceAuditLog`, `SettingsAuditEntry`.
- **Existing permission system**: Yes — `RolePermissionSet`, `MemberPermissionOverride`, `TeamRole`, `security/permissionsMatrix.ts` exporting `PermissionAction` and `PermissionModule` types. `requirePermission(module, action)` middleware wraps standalone admin APIs.

## Models found (truncated to relevance for integrations)

- `AuditLog` — generic actor/action/module/target/details audit trail. **Reuse for integration audit.**
- `CredentialVault` — encrypted per-user password storage. **Pattern to mirror for integration secrets.**
- `NotificationProvider` — has `credentialsEncrypted` field + `credentialsConfigured` flag in API responses. **Best template for integration model.**
- `BackupJob` — backup job runs and status.
- `Settings` (SiteSettings) — large feature flag map already present at `featureFlags.*`.
- `JobRunLog`, `EventLog`, `ImportExportLog` — observability primitives.

## API route surface (selected)

| Mount | Source |
|---|---|
| `/api` (public) | `routes/publicRoutes.ts` |
| `/api/${ADMIN_SECRET_PATH}` (legacy admin) | `routes/adminRoutes.ts` |
| `/api/admin` (standalone admin) | `adminStudentMgmtRoutes`, `adminNotificationRoutes`, `adminProviderRoutes`, `adminStudentSecurityRoutes`, then `adminRoutes` |
| `/api/student` | `routes/studentRoutes.ts` |
| `/api/v1/*` (Exam Mgmt System v1) | question hierarchy, question bank, exams, gamification, battles, mistake-vault, practice, study-routine, doubts, examiner, exam-packages |
| `/api/webhooks`, `/api/payments` | `routes/webhookRoutes.ts` |

All `/api/admin/*` routes are wrapped with `standaloneAdminApiHardening` = `[authenticate, enforceAdminPanelPolicy, enforceAdminReadOnlyMode, enforceStandaloneAdminModulePermissions]`. **New integration routes must mount under this same prefix to inherit this.**

## Admin frontend routes

Lazy-loaded via `frontend/src/adminRouteComponents.tsx` and routed in `App.tsx` under the secret admin UI path. Existing settings pages: `AdminSettingsCenter`, `AdminSettingsSite`, `AdminSettingsSecurity`, `AdminSettingsLogs`, `AdminSettingsNotifications`, `AdminSettingsAnalytics`, `AdminSettingsRuntime`, etc. **Add new `Integrations` page next to `Notifications`.**

## Render deployment

- `render.yaml` present at repo root.
- Backend Docker target via `backend/Dockerfile`.
- Backend health check: `/health` and `/api/health` (`server.ts:449-450`).
- `PORT` honored from env (`server.ts:72`).

## frontend-next/

Per project README, a Next.js hybrid surface exists, but no `frontend-next/` directory is in the working tree. Treated as out of scope per spec (rule #10).

## Existing primitives that MUST be reused

- `services/cryptoService.ts` (`encrypt`, `decrypt`) — AES-256-GCM. **All new integration secrets go through this.**
- `AuditLog` model — **all integration mutations write here.**
- `middlewares/auth.ts` (`authenticate`, `authorize`, `requirePermission`) — **gate every new admin route.**
- `middlewares/securityRateLimit.ts` (`adminRateLimiter`) — **already wraps `/api/admin`.**
- `middlewares/sensitiveAction.ts` (`requireSensitiveAction`) — **for destructive integration operations.**
- `routes/adminProviderRoutes.ts` — **reference template for the integrations registry.**
- `Settings.featureFlags` — central place for top-level toggles already exists.

## Known issues / risks

- 24 npm vulnerabilities reported in backend (2 low, 12 moderate, 8 high, 2 critical) — pre-existing, not addressed here.
- Frontend `npm install` requires `--legacy-peer-deps` because `react-quill@2` has not been updated for React 19.
- Some `process.env.MONGODB_URI` validation is non-fatal in production (commented-out `process.exit(1)` at `server.ts:110`). Pre-existing.

## Decision

The codebase already provides the **foundation** for credentials, audit, settings, and admin routing. The 10 integrations from the implementation prompt will plug into these primitives as a new **`IntegrationConfig`** registry keyed by integration name (e.g. `meilisearch`, `imgproxy`, `listmonk`, `mautic`, `novu`, `umami`, `plausible`, `b2_backup`, `smtp`, `cloudinary`). All disabled by default. Secrets via `cryptoService.encrypt`. Mutations via `AuditLog`. Routes mounted under `/api/admin/integrations`.
