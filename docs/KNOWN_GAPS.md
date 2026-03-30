# CampusWay Known Gaps

## High-Value Gaps Still Open

1. Communication and campaign flows still need deeper runtime verification.
2. `frontend-next/` remains narrower than the main Vite app and should not yet be treated as the complete replacement surface.
3. Legacy model files and the dual `middleware/` vs `middlewares/` layout still need a cleanup pass.
4. Stub or thin public/student pages still need product-level implementation work in later phases.
5. Azure cloud-side protections and observability are documented but not fully executed from this repo.

## Intentional Deferrals

- Storybook
- Chromatic
- Cypress
- live GitHub MCP auth config checked into the repo
- live Figma MCP auth config checked into the repo
- Stitch MCP hookup without a concrete target

## Operational Risks to Keep Watching

- App Check should stay off unless Firebase Admin and client settings are both ready.
- Local `.env.production` files may exist on developer machines; they must stay ignored and never be surfaced.
- Legacy directories in the repo can still confuse later work if treated as active apps.
- The Next hybrid app depends on the backend API base being set correctly during local builds and smoke runs.

## Recommended Next Cleanup Targets

- confirm active vs legacy `.model.ts` files and document/remediate unused duplicates
- collapse stale or thin wrapper middleware where practical
- continue removing stale docs that still describe placeholder or inactive behavior
