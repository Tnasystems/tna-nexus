#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="${1:-/var/www/tna-nexus}"

cd "$PROJECT_DIR"
corepack enable
pnpm install
pnpm prisma:generate
pnpm --filter @tna-nexus/api build
pnpm --filter @tna-nexus/web build
pnpm --filter @tna-nexus/api prisma:migrate:platform
pnpm --filter @tna-nexus/api seed
sudo systemctl restart tna-nexus-api
sudo systemctl restart tna-nexus-web
