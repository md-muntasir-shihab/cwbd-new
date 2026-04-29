# CAMPUSWAY-BD: PROJECT WORKFLOW PLAN

## Incremental Development with Controlled Progression

---

## Overview

This document outlines a systematic, incremental approach for implementing the full integration system for CampusWay-BD. The workflow emphasizes:

1. **Plan First, Code Later** - Create comprehensive plans and get explicit approval before making any code changes
2. **Small Commits** - Break work into atomic, testable units
3. **Build Verification** - Test backend and frontend builds after each phase
4. **Fix Before Moving Forward** - No progression until builds pass
5. **Final Push Only** - Commit and push to main branch only after complete approval

---

## WORKFLOW RULES (MUST FOLLOW)

```
RULE 1: NO CODE CHANGES WITHOUT EXPLICIT APPROVAL
- Present the plan first
- Wait for explicit "approved" or "proceed" response
- Only then begin implementation

RULE 2: SMALL, ATOMIC COMMITS
- Each commit should do ONE thing
- Commit message format: "[Phase X.Y] Short description"
- Maximum 5-10 files per commit

RULE 3: BUILD VERIFICATION AFTER EACH PHASE
- Run backend build: cd backend && npm run build
- Run frontend build: cd frontend && npm run build
- Both must pass before proceeding

RULE 4: FIX BREAKS IMMEDIATELY
- If a build breaks, STOP
- Fix the issue in the same phase
- Re-verify builds before continuing

RULE 5: NO PUSH TO MAIN UNTIL COMPLETE
- All changes stay local during development
- Create feature branch for work
- Push to main only after:
  - All phases complete
  - All builds pass
  - Final approval received
```

---

## PHASE 0: MANDATORY REPOSITORY AUDIT (Pre-Implementation)

### Objective
Understand the complete codebase before writing any code.

### Steps

#### Step 0.1: Read Root Configuration Files
```
Files to read:
- README.md
- render.yaml
- docker-compose.yml (if exists)
- package.json (root, if exists)
- .env.example or .env.sample
- docs/ (all files)
- .github/workflows/ (all files)
```

#### Step 0.2: Read Backend Files
```
Files to read:
- backend/package.json
- backend/tsconfig.json
- backend/Dockerfile
- backend/src/server.ts (or app.ts or index.ts)
- backend/src/config/ (ALL files)
- backend/src/models/ (ALL files)
- backend/src/routes/ (ALL files)
- backend/src/controllers/ (ALL files)
- backend/src/services/ (ALL files)
- backend/src/middlewares/ (ALL files)
- backend/src/security/ (ALL files if exists)
- backend/src/cron/ (ALL files if exists)
- backend/src/scripts/ (ALL files if exists)
- backend/src/utils/ (ALL files if exists)
- backend/src/types/ (ALL files if exists)
```

#### Step 0.3: Read Frontend Files
```
Files to read:
- frontend/package.json
- frontend/src/App.tsx
- frontend/src/main.tsx
- frontend/src/routes/ (ALL files)
- frontend/src/pages/ (ALL files)
- frontend/src/pages/admin/ (ALL files)
- frontend/src/components/ (relevant files)
- frontend/src/services/ (ALL files)
- frontend/src/context/ (ALL files if exists)
- frontend/src/hooks/ (ALL files if exists)
- frontend/src/utils/ (ALL files if exists)
- frontend/src/lib/ (ALL files if exists)
- frontend/index.html
- frontend/vite.config.ts
```

### Deliverable: Audit Report

Before any code is written, produce and present this report:

```markdown
## AUDIT REPORT

### Stack Summary
- Node version: [version]
- TypeScript version: [version]
- Frontend framework: [Vite + React / other]
- Frontend routing: [React Router v6 / v5 / other]
- Backend framework: [Express / Fastify / other]
- Backend entry point: [file path]
- ORM/ODM: [Mongoose / Prisma / other]
- Database env key: [MONGO_URI / MONGODB_URI / other]
- Auth method: [JWT / other]
- Image storage: [local / Cloudinary / other]
- Existing email: [Nodemailer / SendGrid / none]
- Existing search: [MongoDB / Fuse.js / none]
- Cache: [Redis / in-memory / none]

### Existing Systems to REUSE (do not duplicate)
- [List existing services, models, utilities]

### Known Issues or Risks
- [List any broken, missing, or risky items found]

### Collections/Models Found
- [List each model with file path and key fields]

### API Routes Found
- [List each route group]

### Admin Routes Found
- [List each admin page path and component]
```

### Approval Gate
```
STOP HERE.
Present the audit report.
Wait for explicit approval: "Approved to proceed" or "Proceed with implementation"
DO NOT write any code until approval is received.
```

---

## PHASE 1: ARCHITECTURE DECISION

### Objective
Document architectural decisions without writing code.

### Deliverable: Architecture Decision Document

```markdown
## ARCHITECTURE DECISIONS

### Production Architecture
- Main backend: Render Web Service
- Database: MongoDB Atlas via [env key found in audit]
- Frontend: Vite build (Render Static Site / Vercel / Netlify)
- Optional tools: External self-hosted URLs configured from admin

### Tool Decisions
| Tool | Integration Level | Fallback Strategy |
|------|-------------------|-------------------|
| Meilisearch | Full code | MongoDB $text/$regex |
| imgproxy | Full code | Return original URL |
| Umami | Full code | Silent skip |
| Novu | Full code | Existing notification |
| Listmonk | Full code | Existing email |
| Uptime Kuma | Partial | Health endpoints only |
| Restic | Scripts + Docs | Manual backup |
| Mautic | Config only | None needed |
| NocoDB | Config only | None needed |
| Payload CMS | Config only | None needed |
```

### Approval Gate
```
Present architecture decisions.
Wait for explicit approval before proceeding.
```

---

## PHASE 2: CENTRAL INTEGRATION SETTINGS SYSTEM

### Implementation Breakdown (6 Sub-Phases)

#### Phase 2.1: ToolIntegrationSetting Model
```
Files to create:
- backend/src/models/ToolIntegrationSetting.ts

Commit: "[Phase 2.1] Add ToolIntegrationSetting model"

BUILD CHECK:
- cd backend && npm run build
- Must pass before proceeding
```

#### Phase 2.2: Crypto Helper
```
Files to create:
- backend/src/utils/integrationCrypto.ts

Commit: "[Phase 2.2] Add integration crypto helper"

BUILD CHECK:
- cd backend && npm run build
- Must pass before proceeding
```

#### Phase 2.3: Integration Settings Service
```
Files to create:
- backend/src/services/integrationSettingsService.ts

Methods to implement:
- listIntegrations()
- getIntegration()
- upsertIntegration()
- setSecret()
- deleteSecret()
- getDecryptedSecret()
- testIntegration()
- updateHealthStatus()
- getPublicIntegrationConfig()
- maskSecrets()

Commit: "[Phase 2.3] Add integration settings service"

BUILD CHECK:
- cd backend && npm run build
- Must pass before proceeding
```

#### Phase 2.4: Admin Integration Controller
```
Files to create:
- backend/src/controllers/adminIntegrationController.ts

Endpoints:
- GET /api/admin/integrations
- GET /api/admin/integrations/status
- GET /api/admin/integrations/:toolKey
- PUT /api/admin/integrations/:toolKey
- POST /api/admin/integrations/:toolKey/secrets
- DELETE /api/admin/integrations/:toolKey/secrets/:name
- POST /api/admin/integrations/:toolKey/test
- POST /api/admin/integrations/:toolKey/sync
- GET /api/integrations/public-config (public)

Commit: "[Phase 2.4] Add admin integration controller"

BUILD CHECK:
- cd backend && npm run build
- Must pass before proceeding
```

#### Phase 2.5: Admin Integration Routes
```
Files to create/modify:
- backend/src/routes/adminIntegrationRoutes.ts
- Modify existing routes index to mount new routes

Commit: "[Phase 2.5] Add admin integration routes"

BUILD CHECK:
- cd backend && npm run build
- Must pass before proceeding
```

#### Phase 2.6: Seed Default Integrations
```
Files to create/modify:
- Add seed function call in server startup
- Create seed data for all 10 integrations

Commit: "[Phase 2.6] Add integration seed on startup"

BUILD CHECK:
- cd backend && npm run build
- Must pass before proceeding
```

### Phase 2 Completion Gate
```
All 6 sub-phases complete.
Backend builds successfully.
Present completion status.
Wait for approval before Phase 3.
```

---

## PHASE 3: ADMIN PANEL - INTEGRATIONS PAGE

### Implementation Breakdown (5 Sub-Phases)

#### Phase 3.1: API Service Methods
```
Files to modify:
- frontend/src/services/api.ts (or existing API client file)

Methods to add:
- listIntegrations()
- getIntegration()
- updateIntegration()
- saveIntegrationSecret()
- deleteIntegrationSecret()
- testIntegration()
- syncIntegration()
- getIntegrationStatus()
- getPublicIntegrationConfig()

Commit: "[Phase 3.1] Add integration API methods to frontend"

BUILD CHECK:
- cd frontend && npm run build
- Must pass before proceeding
```

#### Phase 3.2: Integration Card Component
```
Files to create:
- frontend/src/components/admin/IntegrationCard.tsx

Features:
- Tool icon/name/status badge
- Enable toggle
- Provider mode dropdown
- URL input fields
- Secret management (set/delete with masked display)
- Save/Test/Open Dashboard buttons
- Collapsible helper text

Commit: "[Phase 3.2] Add IntegrationCard component"

BUILD CHECK:
- cd frontend && npm run build
- Must pass before proceeding
```

#### Phase 3.3: Integrations Page
```
Files to create:
- frontend/src/pages/admin/IntegrationsPage.tsx

Features:
- Page header with Bengali title
- Global status bar (Healthy/Degraded/Down/Disabled counts)
- Action buttons (Run All Health Checks, Export Config, View Logs)
- Grid of 10 IntegrationCard components

Commit: "[Phase 3.3] Add IntegrationsPage component"

BUILD CHECK:
- cd frontend && npm run build
- Must pass before proceeding
```

#### Phase 3.4: Add Route
```
Files to modify:
- frontend/src/routes/ (match existing pattern)

Route to add:
- /admin/settings/integrations -> IntegrationsPage

Commit: "[Phase 3.4] Add integrations route to admin"

BUILD CHECK:
- cd frontend && npm run build
- Must pass before proceeding
```

#### Phase 3.5: Add Sidebar Link
```
Files to modify:
- Admin sidebar/navigation component

Link to add:
- "টুল ইন্টিগ্রেশন" pointing to new route

Commit: "[Phase 3.5] Add integrations link to admin sidebar"

BUILD CHECK:
- cd frontend && npm run build
- Must pass before proceeding
```

### Phase 3 Completion Gate
```
All 5 sub-phases complete.
Frontend builds successfully.
Backend still builds successfully.
Present completion status.
Wait for approval before Phase 4.
```

---

## PHASE 4: MEILISEARCH IMPLEMENTATION

### Implementation Breakdown (5 Sub-Phases)

#### Phase 4.1: Meilisearch Config
```
Files to create:
- backend/src/config/meilisearch.ts

Features:
- getMeilisearchClient()
- isMeilisearchEnabled()
- INDEX_PREFIX
- INDEXES constant

Commit: "[Phase 4.1] Add Meilisearch config"

BUILD CHECK: Backend must pass
```

#### Phase 4.2: Search Index Service
```
Files to create:
- backend/src/services/searchIndexService.ts

Methods:
- indexDocument()
- deleteDocument()
- search() with MongoDB fallback
- setupIndexes()
- reindexCollection()
- getIndexStats()
- clearIndex()

Commit: "[Phase 4.2] Add search index service with fallback"

BUILD CHECK: Backend must pass
```

#### Phase 4.3: Search Controller
```
Files to create:
- backend/src/controllers/searchController.ts

Endpoints:
- GET /api/search (public)
- POST /api/admin/search/reindex
- POST /api/admin/search/reindex/:collection
- GET /api/admin/search/stats
- POST /api/admin/search/clear/:collection

Commit: "[Phase 4.3] Add search controller"

BUILD CHECK: Backend must pass
```

#### Phase 4.4: Search Routes
```
Files to create:
- backend/src/routes/searchRoutes.ts

Mount routes in existing index.

Commit: "[Phase 4.4] Add search routes"

BUILD CHECK: Backend must pass
```

#### Phase 4.5: Reindex Script
```
Files to create:
- backend/src/scripts/reindex-search.ts

Commit: "[Phase 4.5] Add reindex script"

BUILD CHECK: Backend must pass
```

### Phase 4 Completion Gate
```
All sub-phases complete.
Build passes.
Wait for approval before Phase 5.
```

---

## PHASES 5-14: REMAINING IMPLEMENTATIONS

Follow the same pattern for each phase:

### Phase 5: imgproxy Implementation
- 5.1: imageProxyService.ts
- 5.2: imageProxyController.ts
- 5.3: Frontend imageUrl utility
- 5.4: Update existing image components

### Phase 6: Umami Analytics Implementation
- 6.1: Frontend umami.ts utility
- 6.2: App.tsx integration
- 6.3: Event tracking implementation

### Phase 7: Novu Notification Implementation
- 7.1: novuProviderService.ts
- 7.2: Integration with existing notifications
- 7.3: Frontend notification bell (if compatible)

### Phase 8: Listmonk Newsletter Implementation
- 8.1: listmonkService.ts
- 8.2: User registration sync
- 8.3: Daily digest generation

### Phase 9: Uptime Kuma Health Endpoints
- 9.1: Improve /health endpoint
- 9.2: Add /api/health/deep
- 9.3: uptimeKumaHeartbeatService.ts
- 9.4: Heartbeat integration in server.ts

### Phase 10: Restic Backup Scripts
- 10.1: ops/backup/.env.example
- 10.2: ops/backup/restic-backup.sh
- 10.3: ops/backup/restic-restore-drill.sh
- 10.4: ops/backup/README.md

### Phase 11: Mautic, NocoDB, Payload (Config Only)
- 11.1: mauticService.ts (stub)
- 11.2: nocoDbService.ts (stub)
- 11.3: payloadCmsBridgeService.ts (stub)

### Phase 12: Render YAML Update
- 12.1: Update render.yaml with all env vars

### Phase 13: Docker Compose Update
- 13.1: Add optional services with profiles
- 13.2: Add volume definitions

### Phase 14: Documentation
- 14.1: docs/INTEGRATIONS_ARCHITECTURE.md
- 14.2: docs/RENDER_DEPLOYMENT.md
- 14.3: docs/MONGODB_ATLAS_SETUP.md
- 14.4: docs/BACKUP_RUNBOOK.md
- 14.5: docs/INTEGRATIONS_RUNBOOK.md
- 14.6: Update README.md

---

## PHASE 15: BUILD AND VERIFY

### Final Verification Steps

```bash
# Step 1: Full backend build
cd backend
npm install
npm run build
# Document any warnings or errors

# Step 2: Full frontend build
cd ../frontend
npm install
npm run lint || true  # Document lint issues
npm run build
# Document any warnings or errors

# Step 3: Type checking (if applicable)
npm run type-check || true

# Step 4: Run existing tests (if any)
npm test || true
```

### Error Handling Rules

```
IF build fails on a file you DID NOT modify:
- Document the pre-existing issue
- Do not attempt to fix unless safe
- Note in final report

IF build fails on a file you DID modify:
- MUST fix before proceeding
- This is your responsibility
- Re-run build verification after fix
```

---

## PHASE 16: FINAL APPROVAL AND PUSH

### Pre-Push Checklist

```
[ ] All phases 0-15 complete
[ ] Backend build passes
[ ] Frontend build passes
[ ] All TypeScript errors resolved
[ ] No console errors in development
[ ] Audit report completed
[ ] Architecture decisions documented
[ ] All new files listed
[ ] All modified files documented
```

### Final Report Template

```markdown
## IMPLEMENTATION COMPLETE

### 1. ACTUAL REPO FINDINGS
(Summary from audit phase)

### 2. FILES CREATED
(Full path and one-line description for each)

### 3. FILES MODIFIED
(Full path, what changed, and why)

### 4. FULLY IMPLEMENTED
(Features with real working code)

### 5. CONFIG-ONLY
(Features with admin settings only)

### 6. SKIPPED AND WHY
(Anything not implemented with reason)

### 7. RENDER ENV VARS TO ADD
Required:
- [list]

Optional but recommended:
- [list]

Optional:
- [list]

### 8. MONGODB ATLAS NOTES
(Any specific notes)

### 9. HOW TO RUN LOCALLY
(Exact commands)

### 10. HOW TO DEPLOY ON RENDER
(Step-by-step)

### 11. BUILD RESULT
Backend: [ ] Builds / [ ] Warnings / [ ] Errors
Frontend: [ ] Builds / [ ] Warnings / [ ] Errors

### 12. KNOWN LIMITATIONS AND NEXT STEPS
(Be honest about what needs more work)
```

### Push Approval Gate

```
STOP HERE.
Present the final report.
Wait for explicit approval: "Approved to push to main"
DO NOT push until approval is received.
```

### Push Commands

```bash
# Only after approval
git checkout -b feature/full-integration-implementation
git add .
git commit -m "[Complete] Full integration implementation"
git push origin feature/full-integration-implementation

# Create PR or merge to main as directed
```

---

## QUICK REFERENCE: COMMIT MESSAGE FORMAT

```
[Phase X.Y] Short description

Examples:
[Phase 0] Complete repository audit
[Phase 2.1] Add ToolIntegrationSetting model
[Phase 2.2] Add integration crypto helper
[Phase 3.3] Add IntegrationsPage component
[Phase 4.2] Add search index service with fallback
[Phase 15] Fix TypeScript errors in searchController
[Complete] Full integration implementation
```

---

## TROUBLESHOOTING

### Build Fails After Changes

1. Read the error message carefully
2. Identify which file and line caused the error
3. Check if it's a file you modified
4. If yes: fix it immediately
5. If no: document it and proceed cautiously
6. Re-run build after every fix

### TypeScript Errors

Common fixes:
- Missing type imports: Add the import
- Undefined properties: Add null checks
- Type mismatches: Cast or fix the type
- Missing dependencies: Install with npm

### Dependency Issues

```bash
# Clear and reinstall
rm -rf node_modules package-lock.json
npm install

# If still failing, check for version conflicts
npm ls [package-name]
```

---

## SUMMARY

This workflow ensures:

1. **No surprises** - Full audit before any changes
2. **Controlled progression** - Explicit approval gates
3. **Build safety** - Verification after every phase
4. **Small commits** - Easy to review and revert
5. **Complete documentation** - Clear final report
6. **Safe deployment** - Push only after full approval

Follow this plan exactly. Do not skip steps. Do not proceed without build verification. Do not push without final approval.
