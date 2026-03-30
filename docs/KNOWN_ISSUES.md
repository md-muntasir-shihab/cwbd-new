# CampusWay Known Issues

## Currently Tracked

1. Legacy directories (`client/`, `server/`, `CAMPUSWAY001-main/`) still exist and can confuse new contributors.
2. Legacy model-file duplication still needs a dedicated cleanup pass.
3. Some public/student pages remain thin and need product work beyond bootstrap.
4. `frontend-next/` is intentionally limited in scope and should not be mistaken for the full surface.
5. Azure CLI is not guaranteed to be installed locally; cloud-side commands may still require machine-level tooling setup.

## Recently Addressed In Bootstrap

- stale MCP filesystem root path
- root `package-lock.json` that caused Next root inference warnings
- duplicate TTL index declarations on security token/rate-limit models
- missing Next smoke path
- missing visual baseline subset
- missing App Check baseline wiring
