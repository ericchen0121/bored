#!/usr/bin/env bash
set -euo pipefail

SERVICE="${SERVICE:-api}"

case "$SERVICE" in
  api)
    echo "[entrypoint] migrating database…"
    pnpm db:migrate
    echo "[entrypoint] starting API on PORT=${PORT:-4000}"
    exec pnpm --filter @bored/api start
    ;;
  web)
    echo "[entrypoint] starting web on PORT=${PORT:-3000}"
    exec pnpm --filter @bored/web start
    ;;
  ingest)
    echo "[entrypoint] starting ingest scheduler (local dev — use ingest-cron in production)"
    exec pnpm --filter @bored/ingest start
    ;;
  ingest-cron)
    TASK="${INGEST_CRON_TASK:?Set INGEST_CRON_TASK=phase1|movies|daily}"
    echo "[entrypoint] ingest cron task=${TASK}"
    case "$TASK" in
      phase1)
        exec pnpm --filter @bored/ingest exec tsx src/cli.ts --jobs --once --phase1
        ;;
      movies)
        exec pnpm --filter @bored/ingest exec tsx src/cli.ts --jobs --once --only=indie_theater
        ;;
      daily)
        exec pnpm --filter @bored/ingest exec tsx src/cli.ts --jobs --once
        ;;
      *)
        echo "Unknown INGEST_CRON_TASK=$TASK (expected phase1|movies|daily)" >&2
        exit 1
        ;;
    esac
    ;;
  migrate)
    exec pnpm db:migrate
    ;;
  *)
    echo "Unknown SERVICE=$SERVICE (expected api|web|ingest|migrate)" >&2
    exit 1
    ;;
esac
