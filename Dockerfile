# Bored monorepo — one image, select process with SERVICE=api|web|ingest
# Railway: set SERVICE per service; build once from repo root.

FROM node:20-bookworm-slim AS base

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && corepack prepare pnpm@10.28.2 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/
COPY packages/ingest/package.json packages/ingest/

RUN pnpm install --frozen-lockfile

COPY . .

# Next.js needs NEXT_PUBLIC_* at build time.
# Default DEMO user — an unset ARG must not bake "" into the client (breaks uuid cols).
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN
ARG NEXT_PUBLIC_DEMO_USER_ID=00000000-0000-4000-8000-000000000001
ENV NODE_ENV=production \
    NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=$NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN \
    NEXT_PUBLIC_DEMO_USER_ID=$NEXT_PUBLIC_DEMO_USER_ID

RUN pnpm --filter @bored/web build

# Optional Chromium for ingest flyer scrape (skip on api/web)
ARG INSTALL_PLAYWRIGHT=0
RUN if [ "$INSTALL_PLAYWRIGHT" = "1" ]; then \
      pnpm --filter @bored/ingest exec playwright install --with-deps chromium; \
    fi

ENV SERVICE=api
EXPOSE 3000 4000

COPY scripts/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

ENTRYPOINT ["/docker-entrypoint.sh"]
