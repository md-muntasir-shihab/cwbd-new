#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# CampusWay Dev Script
# Quick commands for development, testing, and maintenance.
#
# Usage:
#   ./scripts/dev.sh <command>
#
# Commands:
#   start         Start backend + frontend dev servers
#   start:be      Start backend dev server only
#   start:fe      Start frontend dev server only
#   build         Build both backend and frontend
#   build:be      Build backend only
#   build:fe      Build frontend only
#   typecheck     Run TypeScript checks on both
#   typecheck:be  Run backend TypeScript check
#   typecheck:fe  Run frontend TypeScript check
#   lint          Lint both backend and frontend
#   test          Run all tests
#   test:be       Run backend tests (Jest)
#   test:fe       Run frontend tests (Vitest)
#   seed          Run all database seeders
#   seed:exam     Run exam system seeder
#   clean         Remove build artifacts and caches
#   db:start      Start local MongoDB via Docker
#   db:stop       Stop local MongoDB
#   check         Full pre-push check (typecheck + lint + test)
# ─────────────────────────────────────────────────────────────

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BE_DIR="$ROOT_DIR/backend"
FE_DIR="$ROOT_DIR/frontend"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${CYAN}[dev]${NC} $1"; }
ok()   { echo -e "${GREEN}[ok]${NC} $1"; }
err()  { echo -e "${RED}[err]${NC} $1"; }

cmd_start() {
  log "Starting backend + frontend dev servers..."
  (cd "$BE_DIR" && npm run dev) &
  (cd "$FE_DIR" && npm run dev) &
  trap "kill 0" EXIT
  wait
}

cmd_start_be() { log "Starting backend (port 5003)..."; cd "$BE_DIR" && npm run dev; }
cmd_start_fe() { log "Starting frontend (port 5175)..."; cd "$FE_DIR" && npm run dev; }

cmd_build()    { cmd_build_be; cmd_build_fe; ok "Both builds complete"; }
cmd_build_be() { log "Building backend..."; cd "$BE_DIR" && npm run build; ok "Backend built"; }
cmd_build_fe() { log "Building frontend..."; cd "$FE_DIR" && npm run build; ok "Frontend built"; }

cmd_typecheck()    { cmd_typecheck_be; cmd_typecheck_fe; ok "All types OK"; }
cmd_typecheck_be() { log "Type-checking backend..."; cd "$BE_DIR" && npx tsc --noEmit; ok "Backend types OK"; }
cmd_typecheck_fe() { log "Type-checking frontend..."; cd "$FE_DIR" && npx tsc --noEmit; ok "Frontend types OK"; }

cmd_lint() { log "Linting..."; cd "$ROOT_DIR" && npm run lint:backend && npm run lint:frontend; ok "Lint OK"; }

cmd_test()    { cmd_test_be; cmd_test_fe; ok "All tests passed"; }
cmd_test_be() { log "Backend tests (Jest)..."; cd "$BE_DIR" && npx jest --passWithNoTests --forceExit; ok "Backend tests OK"; }
cmd_test_fe() { log "Frontend tests (Vitest)..."; cd "$FE_DIR" && npx vitest run; ok "Frontend tests OK"; }

cmd_seed()      { log "Running all seeders..."; cd "$BE_DIR" && npm run seed; ok "Seeds complete"; }
cmd_seed_exam() { log "Seeding exam system..."; cd "$BE_DIR" && npx tsx src/seeds/examSystemSeed.ts; ok "Exam seed done"; }

cmd_clean() {
  log "Cleaning build artifacts..."
  rm -rf "$BE_DIR/dist" "$FE_DIR/dist" "$FE_DIR/.vite" "$ROOT_DIR/.vite" 2>/dev/null || true
  rm -rf "$FE_DIR/playwright-report" "$FE_DIR/test-results" 2>/dev/null || true
  rm -f "$ROOT_DIR"/*.log "$ROOT_DIR"/temp-* 2>/dev/null || true
  ok "Clean complete"
}

cmd_db_start() { log "Starting MongoDB..."; cd "$ROOT_DIR" && docker-compose up -d mongo; ok "MongoDB started"; }
cmd_db_stop()  { log "Stopping MongoDB..."; cd "$ROOT_DIR" && docker-compose down; ok "MongoDB stopped"; }

cmd_check() {
  log "Full pre-push check..."
  cmd_typecheck; echo ""
  cmd_lint; echo ""
  cmd_test; echo ""
  ok "All checks passed — safe to push"
}

cmd_help() {
  echo ""
  echo -e "${CYAN}CampusWay Dev Script${NC}"
  echo ""
  echo "Usage: ./scripts/dev.sh <command>"
  echo ""
  echo "  start         Start backend + frontend"
  echo "  start:be      Start backend only"
  echo "  start:fe      Start frontend only"
  echo "  build         Build both"
  echo "  typecheck     TypeScript check both"
  echo "  lint          Lint both"
  echo "  test          Run all tests"
  echo "  test:be       Backend tests (Jest)"
  echo "  test:fe       Frontend tests (Vitest)"
  echo "  seed          Run all seeders"
  echo "  seed:exam     Exam system seeder"
  echo "  clean         Remove build artifacts"
  echo "  db:start      Start local MongoDB"
  echo "  db:stop       Stop local MongoDB"
  echo "  check         Full pre-push check"
  echo ""
}

case "${1:-help}" in
  start)        cmd_start ;;
  start:be)     cmd_start_be ;;
  start:fe)     cmd_start_fe ;;
  build)        cmd_build ;;
  build:be)     cmd_build_be ;;
  build:fe)     cmd_build_fe ;;
  typecheck)    cmd_typecheck ;;
  typecheck:be) cmd_typecheck_be ;;
  typecheck:fe) cmd_typecheck_fe ;;
  lint)         cmd_lint ;;
  test)         cmd_test ;;
  test:be)      cmd_test_be ;;
  test:fe)      cmd_test_fe ;;
  seed)         cmd_seed ;;
  seed:exam)    cmd_seed_exam ;;
  clean)        cmd_clean ;;
  db:start)     cmd_db_start ;;
  db:stop)      cmd_db_stop ;;
  check)        cmd_check ;;
  help|--help|-h) cmd_help ;;
  *) err "Unknown: $1"; cmd_help; exit 1 ;;
esac
