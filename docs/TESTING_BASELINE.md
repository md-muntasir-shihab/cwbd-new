# CampusWay Testing Baseline

## Current Test Stack

### Backend

- Jest + Supertest
- primary verified command: `backend npm run test:home`
- additional focused suites: team, question-bank unit, question-bank integration

### Frontend and Browser

- Playwright only
- primary smoke command: `frontend npm run e2e:smoke -- e2e/public-smoke.spec.ts`
- Next hybrid smoke command: `frontend npm run e2e:next-smoke`
- visual baseline command: `frontend npm run e2e:visual-baseline`
- broader regression and role QA commands already exist under `frontend/scripts/`

## Runtime Defaults for Local QA

- MongoDB: `localhost:27017`
- Backend: `localhost:5003`
- Vite: `localhost:5175`
- Next: `localhost:3000`

## E2E Data Lifecycle

Use the backend seed helpers already in the repo:

```bash
cd backend
npm run e2e:prepare
npm run e2e:restore
```

The smoke runners use these commands automatically.

## Playwright Readiness

Checked-in behavior:
- `trace: 'on-first-retry'`
- HTML reporting under `qa-artifacts/playwright-report`
- screenshot on failure
- retained video on failure
- explicit Next hybrid smoke path
- visual-baseline subset using `toHaveScreenshot()`

## Responsive and Theme Matrix

Critical specs now share the required matrix:
- `320`
- `360`
- `375`
- `390`
- `414`
- `768`
- `820`
- `1024`
- `1280`
- `1440`

Theme coverage:
- light
- dark

Shared helper:
- `frontend/e2e/responsiveTheme.ts`

## CI Quality Gate

The main PR gate now runs:
- backend build
- backend `test:home`
- frontend lint
- frontend build
- frontend-next build

Manual browser smoke is available through:
- `.github/workflows/playwright-smoke-manual.yml`

## Current Gaps Still Left for Later Phases

- full admin and student browser regression still needs active issue-fix loops in later phases
- communication/campaign/provider flows still need deeper runtime verification
- App Check enforcement should stay off locally unless Firebase Admin + client config is ready
