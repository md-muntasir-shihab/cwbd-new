# CampusWay Structure Map

## Root Workspace

```text
CampusWay/
|- backend/                Express + TypeScript API
|- frontend/               Vite + React SPA
|- frontend-next/          Next.js hybrid frontend
|- docs/                   Internal project docs and runbooks
|- .github/                CI, security, and automation workflows
|- .local-mongo/           Local MongoDB data directory
|- scripts/                Workspace-level helper scripts
|- AGENTS.md               Agent/developer operating guide
|- README.md               Human-readable workspace entrypoint
```

## Active Application Boundaries

### `backend/`

Primary responsibilities:
- public API routes
- student API routes
- admin API routes
- auth/session management
- security middleware
- communication, campaign, and subscription logic
- seed, migration, and E2E preparation scripts

Key areas:
- `src/server.ts`
- `src/routes/`
- `src/controllers/`
- `src/services/`
- `src/middlewares/`
- `src/models/`
- `src/scripts/`
- `tests/`

### `frontend/`

Primary responsibilities:
- main public UI
- student panel
- admin panel
- Playwright test suite and runner scripts
- theme and responsive behavior

Key areas:
- `src/App.tsx`
- `src/pages/`
- `src/components/`
- `src/services/api.ts`
- `src/lib/firebase.ts`
- `e2e/`
- `scripts/`

### `frontend-next/`

Primary responsibilities:
- incremental Next.js route migration
- hybrid admin/student/public entry surfaces
- backend API reuse through `NEXT_PUBLIC_API_BASE`

Key areas:
- `app/`
- `components/`
- `lib/api.ts`
- `.env.example`

## Docs and Operational Files

- `docs/ENV_SETUP.md` - setup and env expectations
- `docs/RUNBOOK.md` - local run and operations flow
- `docs/TESTING_BASELINE.md` - browser/runtime/testing posture
- `docs/SECURITY_BASELINE.md` - auth, App Check, secret, Azure readiness
- `docs/DESIGN_SYSTEM_NOTES.md` - UI consistency rules and component inventory
- `docs/KNOWN_GAPS.md` - deferred work and structural risks
- `docs/KNOWN_ISSUES.md` - concrete currently-known issues to watch
- `docs/RELEASE_CHECKLIST.md` - release gate checklist
- `docs/PHASE_HANDOFF_NOTES.md` - what later phases should pick up

## CI and Automation

- `.github/workflows/lint-and-typecheck.yml` - build/test quality gate
- `.github/workflows/codeql.yml` - code scanning
- `.github/workflows/azure-deploy.yml` - backend deployment workflow
- `.github/workflows/playwright-smoke-manual.yml` - manual smoke workflow
- `.github/dependabot.yml` - dependency update automation for `backend/`, `frontend/`, `frontend-next/`, and Actions

## Legacy Directories

These remain in the repository for reference only and should not be treated as active runtime targets:
- `client/`
- `server/`
- `CAMPUSWAY001-main/`
