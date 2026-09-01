#!/usr/bin/env bash
# Provision Bored on Railway: Postgres + api + web + ingest services.
# Requires: railway CLI logged in (`railway login`).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! railway whoami >/dev/null 2>&1; then
  echo "Not logged in. Run: railway login" >&2
  exit 1
fi

PROJECT_NAME="${RAILWAY_PROJECT_NAME:-bored}"

if ! railway status >/dev/null 2>&1; then
  echo "Creating Railway project: $PROJECT_NAME"
  railway init -n "$PROJECT_NAME"
fi

echo "Ensuring Postgres…"
railway add --database postgres 2>/dev/null || true

echo "Ensuring services…"
railway add --service api 2>/dev/null || true
railway add --service web 2>/dev/null || true
railway add --service ingest-phase1 2>/dev/null || true
railway add --service ingest-movies 2>/dev/null || true
railway add --service ingest-daily 2>/dev/null || true

echo ""
echo "For ingest cron wiring (replaces always-on worker):"
echo "  bash scripts/railway-ingest-cron-setup.sh"
echo ""
echo "Next (run once per service after linking):"
echo "  1. railway service link  # pick api / web / ingest-* "
echo "  2. Set variables (see docs/deploy.md)"
echo "  3. railway up"
echo ""
echo "Minimal API vars:"
echo "  SERVICE=api"
echo "  WEB_ORIGIN=https://<web-public-domain>"
echo "  ADMIN_TOKEN=<secret>"
echo "  (DATABASE_URL is usually referenced from the Postgres plugin)"
echo ""
railway status || true
