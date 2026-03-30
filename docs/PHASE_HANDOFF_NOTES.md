# CampusWay Phase Handoff Notes

## Bootstrap Outcome

The bootstrap/setup phase has completed these practical readiness actions:
- corrected the checked-in MCP filesystem root
- removed the stray root `package-lock.json` that caused Next root inference warnings
- established a dedicated Next hybrid smoke path
- added a visual-baseline Playwright subset
- added an env-gated Firebase App Check baseline for selected public write endpoints
- removed unnecessary `shell: true` use from active Node runner scripts
- expanded CI to include backend build + `test:home`, frontend lint + build, and frontend-next build
- added a manual Playwright smoke workflow
- refreshed the core internal docs and release-check guidance

## Phase 1 Can Start With

- stable local boot instructions
- backend + Vite + Next dual-track runtime clarity
- Playwright smoke entrypoints for Vite and Next
- seed/test-data expectations documented
- release-check script available

## Phase 2 Should Focus On

- communication hub
- campaign hub
- subscription contact center
- provider/template/trigger runtime verification
- publish/send and audience safety verification

## Phase 3 Should Focus On

- production App Check rollout with real Firebase project settings
- Azure observability and Key Vault binding execution
- security/access abuse-path testing
- final release gate and regression signoff

## Do Not Undo In Later Phases

- keep Playwright as the single browser test stack unless there is a concrete reason to replace it
- keep JWT auth as the active authority until a real auth migration is implemented
- keep `frontend-next/` runnable even if most QA still targets `frontend/`
- keep root workspace free of a root package-lock/workspace setup unless an intentional monorepo migration is approved
