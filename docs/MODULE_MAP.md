# Module Map

## Runtime apps
- `backend/`: Express + TypeScript API, MongoDB integration, auth, admin, student, public, jobs, migrations.
- `frontend/`: primary Vite + React application for public, student, and admin UX.
- `frontend-next/`: narrower Next.js hybrid surface used for migration-safe route coverage and smoke verification.

## Backend modules
- `backend/src/routes/`: HTTP entry points grouped by audience and concern.
- `backend/src/controllers/`: request handlers for public, student, admin, finance, notifications, question bank, and content.
- `backend/src/services/`: business logic, orchestration, jobs, security, and external integrations.
- `backend/src/models/`: Mongo collections and schema definitions.
- `backend/src/middlewares/`: auth, rate limiting, CORS, validation, security, and App Check enforcement.
- `backend/src/scripts/`: seed, E2E prep/restore, migrations, backups, and ops helpers.
- `backend/tests/`: Jest and integration coverage.

## Frontend modules
- `frontend/src/pages/`: routed page surfaces for public, student, admin, finance, campaigns, support, and settings.
- `frontend/src/components/`: reusable UI grouped by domain such as `home`, `student`, `admin`, `subscription`, `university`, `news`, and `ui`.
- `frontend/src/services/`: API client layer and data-fetching helpers.
- `frontend/src/routes/`: admin path helpers and route constants.
- `frontend/src/lib/`: runtime helpers, theme/runtime flag utilities, Firebase bootstrap, page metadata, and static page helpers.
- `frontend/e2e/`: Playwright smoke, regression, responsive, theme, and screenshot coverage.
- `frontend/scripts/`: local QA runners and audit helpers.

## Key functional domains
- Public content: home, universities, categories, clusters, resources, news, notices, contact, help center.
- Student workspace: auth, dashboard, exams, results, payments, notifications, profile, support.
- Admin workspace: site settings, home control, universities, news, exams, question bank, subscriptions, finance, reports, support, security, team access.
- Communication stack: campaign console, subscription contact center, providers, templates, triggers, delivery logs.
- Security stack: JWT auth, role checks, rate limiting, audit/security logs, App Check baseline for anonymous write endpoints.

## Legacy areas
- `client/`
- `server/`
- `CAMPUSWAY001-main/`

These are not part of the active runtime path and should stay out of the bootstrap runbooks unless a later migration explicitly targets them.
