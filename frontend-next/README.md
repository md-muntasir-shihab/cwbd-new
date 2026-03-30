# CampusWay Next Hybrid Frontend

`frontend-next/` is the incremental Next.js migration track. It stays runnable and testable, but it is not the primary product surface yet.

## Current Route Targets

- `/`
- `/news`
- `/student`
- `/admin-dashboard`

## Local Setup

```bash
cp .env.example .env.local
npm install
npm run dev
```

Default local URL: `http://localhost:3000`

## Required Environment

```bash
NEXT_PUBLIC_API_BASE=http://localhost:5003
NEXT_PUBLIC_ADMIN_PATH=campusway-secure-admin
```

- `NEXT_PUBLIC_API_BASE` must point at the Express backend.
- `NEXT_PUBLIC_ADMIN_PATH` must match the backend `ADMIN_SECRET_PATH`.

## Smoke Test

The checked-in Playwright smoke entrypoint for this app lives in `frontend/`:

```bash
cd ../frontend
npm run e2e:next-smoke
```

This builds `frontend-next`, starts it on port `3000`, and verifies the key hybrid routes.

## Current Behavior

- The hybrid app reuses the existing backend APIs.
- Auth token handoff is still based on the current JWT/browser storage flow.
- This app should remain runnable while the broader Vite app continues as the main QA target.
