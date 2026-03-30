# CampusWay Runbook

## Start the Local Stack

### MongoDB

```powershell
"C:\Program Files\MongoDB\Server\8.2\bin\mongod.exe" --dbpath D:\CampusWay\CampusWay\.local-mongo\data
```

### Backend

```bash
cd backend
npm run dev
```

### Vite Frontend

```bash
cd frontend
npm run dev
```

### Next Hybrid Frontend

```bash
cd frontend-next
npm run dev
```

## Health Checks

```bash
curl http://localhost:5003/health
curl http://localhost:5003/api/health
```

## Smoke Checks

```bash
cd frontend
npm run e2e:smoke -- e2e/public-smoke.spec.ts
npm run e2e:next-smoke
npm run e2e:visual-baseline
```

## Seed and Restore

```bash
cd backend
npm run seed
npm run seed:content
npm run seed:default-users
npm run e2e:prepare
npm run e2e:restore
```

## Workspace Quality Gate

```bash
node scripts/release-check.mjs
```

## Manual CI/Cloud Notes

- Azure deployment remains driven by `.github/workflows/azure-deploy.yml`.
- Manual browser smoke is available through `.github/workflows/playwright-smoke-manual.yml`.
- Application Insights, Key Vault references, and WAF/Front Door remain cloud-side actions.

## Common Local Problems

| Problem | Response |
|---|---|
| Backend port busy | free `5003` or change local env intentionally |
| Next smoke fails to boot | run `frontend-next npm run build` and retry smoke |
| Mongo unavailable | restart `mongod` and confirm `localhost:27017` |
| App Check failures in local dev | leave `APP_CHECK_ENFORCED=false` until Firebase config is ready |
| Dirty tree after checks | inspect `git status --porcelain` before re-running `node scripts/release-check.mjs` |
