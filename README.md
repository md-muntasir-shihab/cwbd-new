# CampusWay

CampusWay is a dual-track full-stack workspace for the public site, student portal, admin panel, news, subscriptions, communication workflows, and related operations tooling.

## Active Applications

- `backend/` - Express + TypeScript API on `5003`
- `frontend/` - Vite + React SPA on `5175`
- `frontend-next/` - Next.js hybrid surface on `3000`
- `.local-mongo/` - local MongoDB data directory

## Current Auth and Cloud Posture

- Backend-issued JWT sessions are the active auth system.
- Firebase is used for client/admin SDK readiness, hosting/storage workflows, and App Check hardening paths.
- Azure remains the backend deployment target for cloud runtime, observability, and secret-management readiness.

## Local Start

```powershell
# Terminal 1
"C:\Program Files\MongoDB\Server\8.2\bin\mongod.exe" --dbpath D:\CampusWay\CampusWay\.local-mongo\data

# Terminal 2
cd backend
npm install
npm run dev

# Terminal 3
cd frontend
npm install
npm run dev

# Optional Terminal 4
cd frontend-next
npm install
npm run dev
```

## Verification Commands

```bash
# Backend quality
cd backend
npm run build
npm run test:home

# Frontend quality
cd frontend
npm run lint
npm run build
npm run e2e:smoke -- e2e/public-smoke.spec.ts
npm run e2e:next-smoke
npm run e2e:visual-baseline

# Next quality
cd ../frontend-next
npm run build

# Whole workspace gate
cd ..
node scripts/release-check.mjs
```

## Internal Docs

Primary working docs live in `docs/`:

- `PROJECT_OVERVIEW.md`
- `STRUCTURE_MAP.md`
- `ENV_SETUP.md`
- `RUNBOOK.md`
- `TESTING_BASELINE.md`
- `SECURITY_BASELINE.md`
- `DESIGN_SYSTEM_NOTES.md`
- `KNOWN_GAPS.md`
- `KNOWN_ISSUES.md`
- `RELEASE_CHECKLIST.md`
- `PHASE_HANDOFF_NOTES.md`
- `PROJECT_HANDOVER.md`

## Notes

- Keep Playwright as the single browser/E2E framework.
- Storybook and Chromatic are intentionally deferred in this bootstrap state.
- The workspace root must stay free of a root `package-lock.json`.
- Legacy directories are documented but not part of the active run path.
