# CampusWay Release Checklist

## Local Release Gate

Run:

```bash
node scripts/release-check.mjs
```

Required pass set:
- backend build
- backend `test:home`
- frontend lint
- frontend build
- frontend-next build
- clean `git status --porcelain`

## Browser Readiness Gate

Run before a serious release candidate:

```bash
cd frontend
npm run e2e:smoke -- e2e/public-smoke.spec.ts
npm run e2e:next-smoke
npm run e2e:visual-baseline
```

## Config and Security Checks

- `ALLOW_TEST_OTP=false` in production
- `APP_CHECK_ENFORCED` only enabled when Firebase Admin and client config are ready
- frontend env contains only public `VITE_*` values
- backend secrets use env/App Service/Key Vault only
- `NEXT_PUBLIC_API_BASE` points to the correct backend
- production CORS origins are scoped correctly
- Application Insights connection string is configured where needed

## Cloud-Side Checks

- Azure App Service configuration updated
- Key Vault references wired for backend secrets
- Front Door / WAF posture reviewed
- Firebase hosting/storage/App Check settings reviewed if in use
