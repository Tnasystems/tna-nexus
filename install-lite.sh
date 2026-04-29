#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ENV_FILE:-${REPO_ROOT}/.env}"
INSTALL_DEPS="${INSTALL_DEPS:-yes}"
OVERWRITE_ENV="${OVERWRITE_ENV:-no}"
POSTGRES_HOST="${POSTGRES_HOST:-127.0.0.1}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_SUPERUSER="${POSTGRES_SUPERUSER:-postgres}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-postgres}"
PLATFORM_DB_NAME="${PLATFORM_DB_NAME:-tna_platform}"
PLATFORM_DB_SCHEMA="${PLATFORM_DB_SCHEMA:-public}"
PLATFORM_DATABASE_URL="${PLATFORM_DATABASE_URL:-postgresql://${POSTGRES_SUPERUSER}:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${PLATFORM_DB_NAME}?schema=${PLATFORM_DB_SCHEMA}}"
APP_URL="${APP_URL:-http://localhost:3000}"
API_URL="${API_URL:-http://localhost:4000}"
PLATFORM_ADMIN_EMAIL="${PLATFORM_ADMIN_EMAIL:-admin@tna-nexus.local}"
PLATFORM_ADMIN_PASSWORD="${PLATFORM_ADMIN_PASSWORD:-ChangeMe123!}"
DEMO_COMPANY_SLUG="${DEMO_COMPANY_SLUG:-demo-industrial}"
DEMO_COMPANY_NAME="${DEMO_COMPANY_NAME:-Demo Industrial Services}"
DEMO_COMPANY_DB_NAME="${DEMO_COMPANY_DB_NAME:-tna_tenant_demo_industrial}"
DEMO_COMPANY_DB_USER="${DEMO_COMPANY_DB_USER:-tenant_demo_user}"
DEMO_COMPANY_DB_PASSWORD="${DEMO_COMPANY_DB_PASSWORD:-ChangeMeTenant123!}"
UPLOAD_ROOT="${UPLOAD_ROOT:-./uploads}"

usage() {
  cat <<'EOF'
Usage:
  bash install-lite.sh

Optional environment variables:
  INSTALL_DEPS=yes|no
  OVERWRITE_ENV=yes|no
  ENV_FILE=/path/to/.env
  POSTGRES_HOST=127.0.0.1
  POSTGRES_PORT=5432
  POSTGRES_SUPERUSER=postgres
  POSTGRES_PASSWORD=postgres
  PLATFORM_DB_NAME=tna_platform
  PLATFORM_ADMIN_EMAIL=admin@tna-nexus.local
  PLATFORM_ADMIN_PASSWORD='ChangeMe123!'
  DEMO_COMPANY_DB_PASSWORD='ChangeMeTenant123!'

This script prepares a local test install only.
It does not configure systemd, nginx, certbot, or a dedicated app user.
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

require_command() {
  local cmd="$1"
  local hint="$2"
  if ! command -v "${cmd}" >/dev/null 2>&1; then
    echo "Missing required command: ${cmd}"
    echo "${hint}"
    exit 1
  fi
}

random_secret() {
  openssl rand -hex 32
}

write_env_file() {
  local access_secret refresh_secret tenant_secret
  access_secret="${JWT_ACCESS_SECRET:-$(random_secret)}"
  refresh_secret="${JWT_REFRESH_SECRET:-$(random_secret)}"
  tenant_secret="${TENANT_CREDENTIAL_SECRET:-$(random_secret)}"

  cat > "${ENV_FILE}" <<EOF
NODE_ENV=development
APP_URL=${APP_URL}
API_URL=${API_URL}
PLATFORM_DATABASE_URL=${PLATFORM_DATABASE_URL}
JWT_ACCESS_SECRET=${access_secret}
JWT_REFRESH_SECRET=${refresh_secret}
TENANT_CREDENTIAL_SECRET=${tenant_secret}
ACCESS_TOKEN_TTL=15m
REFRESH_TOKEN_TTL=30d
UPLOAD_ROOT=${UPLOAD_ROOT}
DEFAULT_STORAGE_DRIVER=local
PLATFORM_ADMIN_EMAIL=${PLATFORM_ADMIN_EMAIL}
PLATFORM_ADMIN_PASSWORD=${PLATFORM_ADMIN_PASSWORD}
DEMO_COMPANY_SLUG=${DEMO_COMPANY_SLUG}
DEMO_COMPANY_NAME=${DEMO_COMPANY_NAME}
DEMO_COMPANY_DB_NAME=${DEMO_COMPANY_DB_NAME}
DEMO_COMPANY_DB_USER=${DEMO_COMPANY_DB_USER}
DEMO_COMPANY_DB_PASSWORD=${DEMO_COMPANY_DB_PASSWORD}
POSTGRES_HOST=${POSTGRES_HOST}
POSTGRES_PORT=${POSTGRES_PORT}
POSTGRES_SUPERUSER=${POSTGRES_SUPERUSER}
POSTGRES_SUPERUSER_PASSWORD=${POSTGRES_PASSWORD}
EOF
}

echo "Preparing local test install in ${REPO_ROOT}"

require_command "openssl" "Install OpenSSL and rerun the script."
require_command "node" "Install Node.js 22 or newer and rerun the script."
require_command "psql" "Install PostgreSQL client tools and rerun the script."

NODE_MAJOR="$(node -p 'process.versions.node.split(\".\")[0]')"
if [[ "${NODE_MAJOR}" -lt 22 ]]; then
  echo "Node.js 22 or newer is required. Found: $(node -v)"
  exit 1
fi

if command -v pnpm >/dev/null 2>&1; then
  PNPM_CMD="pnpm"
elif command -v corepack >/dev/null 2>&1; then
  PNPM_CMD="corepack pnpm"
else
  echo "Missing pnpm and corepack."
  echo "Install pnpm 10.8.1 or enable Corepack, then rerun the script."
  exit 1
fi

if [[ ! -f "${ENV_FILE}" || "${OVERWRITE_ENV}" == "yes" ]]; then
  echo "Writing environment file to ${ENV_FILE}"
  write_env_file
else
  echo "Keeping existing environment file at ${ENV_FILE}"
fi

echo "Checking PostgreSQL connectivity..."
if ! PGPASSWORD="${POSTGRES_PASSWORD}" psql \
  -h "${POSTGRES_HOST}" \
  -p "${POSTGRES_PORT}" \
  -U "${POSTGRES_SUPERUSER}" \
  -d postgres \
  -tAc "SELECT 1" >/dev/null; then
  echo "Could not connect to PostgreSQL with the supplied settings."
  echo "Check POSTGRES_HOST, POSTGRES_PORT, POSTGRES_SUPERUSER, and POSTGRES_PASSWORD."
  exit 1
fi

echo "Ensuring platform database exists..."
if ! PGPASSWORD="${POSTGRES_PASSWORD}" psql \
  -h "${POSTGRES_HOST}" \
  -p "${POSTGRES_PORT}" \
  -U "${POSTGRES_SUPERUSER}" \
  -d postgres \
  -tAc "SELECT 1 FROM pg_database WHERE datname = '${PLATFORM_DB_NAME}'" | grep -q 1; then
  PGPASSWORD="${POSTGRES_PASSWORD}" createdb \
    -h "${POSTGRES_HOST}" \
    -p "${POSTGRES_PORT}" \
    -U "${POSTGRES_SUPERUSER}" \
    "${PLATFORM_DB_NAME}"
fi

mkdir -p "${REPO_ROOT}/uploads" "${REPO_ROOT}/backups"

cd "${REPO_ROOT}"

if [[ "${INSTALL_DEPS}" == "yes" ]]; then
  echo "Installing workspace dependencies..."
  ${PNPM_CMD} install
fi

echo "Building shared package..."
${PNPM_CMD} --filter @tna-nexus/shared build

echo "Generating Prisma clients..."
${PNPM_CMD} --filter @tna-nexus/api prisma:generate

echo "Running platform migration..."
${PNPM_CMD} --filter @tna-nexus/api prisma:migrate:platform

echo "Seeding platform and demo tenant..."
${PNPM_CMD} --filter @tna-nexus/api seed

cat <<'EOF'

Local test install complete.

Start the apps with:
  pnpm --filter @tna-nexus/api dev
  pnpm --filter @tna-nexus/web dev

Default local URLs:
  Web: http://localhost:3000
  API: http://localhost:4000/api/v1/health
  Swagger: http://localhost:4000/api/docs
EOF
