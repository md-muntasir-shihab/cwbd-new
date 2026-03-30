# CampusWay Project Overview

## Workspace Summary

CampusWay is a multi-surface education platform workspace with:
- a public website
- a student portal
- an admin panel
- communication, campaign, subscription, news, and support workflows
- MongoDB-backed backend services
- Firebase hosting/storage/App Check readiness
- Azure backend deployment and observability readiness

## Active Runtime Surfaces

| Surface | Location | Default Port | Status |
|---|---|---:|---|
| Backend API | `backend/` | 5003 | Active and primary |
| Vite frontend | `frontend/` | 5175 | Active and primary |
| Next hybrid frontend | `frontend-next/` | 3000 | Active but narrower |
| MongoDB | `.local-mongo/` | 27017 | Local dependency |

## Current Auth Reality

- Authoritative auth: backend-issued JWT access + refresh flow
- Firebase Auth: not the current primary login system
- Firebase App Check: available as an env-gated hardening layer for selected anonymous/public write routes

## Current Tooling Decisions

- Package management stays per app with `npm`
- Playwright is the only browser/E2E stack
- Storybook is intentionally deferred
- Chromatic is intentionally deferred
- GitHub MCP and Figma MCP remain optional/documented, not checked-in live auth configs
- Stitch MCP remains deferred until a concrete target is supplied

## Verified Bootstrap Baseline

- `backend` build passes
- `backend` `npm run test:home` passes
- `frontend` lint passes with warnings only
- `frontend` build passes
- `frontend-next` build passes
- Playwright public smoke is established as the main browser readiness gate

## Legacy and Non-Primary Areas

These exist in the repo but are not part of the active runtime path:
- `client/`
- `server/`
- `CAMPUSWAY001-main/`
- root screenshot/binary capture artifacts already ignored by `.gitignore`

## Next Phase Readiness

| Phase | Status | Notes |
|---|---|---|
| Phase 1 | Ready | Workspace, docs, runtime, and core test gates are prepared |
| Phase 2 | Ready with known gaps | Communication and audience flows need deeper runtime verification |
| Phase 3 | Ready with known gaps | Security hardening, release gate, and cloud-side enforcement still need follow-through |
| Final Full Testing | Ready to start | Browser stack, smoke paths, docs, and seed expectations are in place |
