# CampusWay Security Baseline

## Current Security Posture

### Authentication and Sessions

- Current authoritative auth path: backend JWT access tokens plus refresh flow
- Session protection: active session tracking, forced logout handling, and role-based route protection already exist
- Firebase Auth is not the active primary auth path today

### Public Write Hardening

Selected anonymous/public write endpoints now support Firebase App Check verification when enabled:
- `/api/auth/register`
- `/api/auth/forgot-password`
- `/api/auth/verify-2fa`
- `/api/auth/resend-otp`
- `/api/contact`
- `/api/help-center/:slug/feedback`
- `/api/content-blocks/:id/impression`
- `/api/content-blocks/:id/click`
- `/api/events/track`
- `/api/news/share/track`

Enforcement rule:
- disabled unless `APP_CHECK_ENFORCED=true`
- bypassed for local/E2E paths unless the environment is explicitly configured for enforcement

### Firebase Readiness

Backend:
- Firebase Admin SDK is already present
- App Check verification uses the existing Admin app when service-account configuration exists

Frontend:
- Firebase client bootstrap already exists
- App Check initialization is now optional and only starts when both Firebase config and `VITE_FIREBASE_APPCHECK_SITE_KEY` exist
- optional debug token support exists through `VITE_FIREBASE_APPCHECK_DEBUG_TOKEN`

### Existing Backend Security Controls

Already present in the active stack:
- Helmet
- HPP
- express-mongo-sanitize
- route-level rate limiters
- request sanitization
- role-based authorization
- sensitive action workflows
- audit-oriented models and logs

### Secret Handling Baseline

- Backend secrets must stay in backend env only
- Frontend only receives `VITE_*` public config
- `.env.production` values must remain ignored and must never be echoed in logs, docs, screenshots, or generated artifacts
- `ALLOW_TEST_OTP=false` is required in production

### Azure Readiness Notes

Cloud-side controls still required later:
- Azure Key Vault references for backend secrets
- Application Insights / Azure Monitor connection string wiring
- Front Door / WAF placement and policy configuration
- production CORS origin scoping

Documented env/config points now include:
- `APP_CHECK_ENFORCED`
- `APPLICATIONINSIGHTS_CONNECTION_STRING`
- Key Vault reference patterns for `JWT_SECRET`, `JWT_REFRESH_SECRET`, `ENCRYPTION_KEY`, and `MONGODB_URI`

## Security Work Still Deferred

- full production App Check enforcement with real Firebase project config
- Azure WAF and Front Door cloud-side rollout
- final export/copy abuse-path testing during later QA phases
- final production secret rotation and environment verification
