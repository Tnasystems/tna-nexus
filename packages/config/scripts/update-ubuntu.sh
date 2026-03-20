#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -eq 0 ]]; then
  echo "Run this script as your normal sudo user, not as root."
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
DEFAULT_INSTALL_DIR="/var/www/tna-nexus"
INSTALL_DIR="${INSTALL_DIR:-}"
SOURCE_DIR="${SOURCE_DIR:-}"
APP_USER="${APP_USER:-$USER}"
GIT_PULL="${GIT_PULL:-yes}"
RUN_PLATFORM_MIGRATION="${RUN_PLATFORM_MIGRATION:-yes}"
RUN_TENANT_MIGRATION="${RUN_TENANT_MIGRATION:-yes}"
RESTART_NGINX="${RESTART_NGINX:-yes}"

usage() {
  cat <<'EOF'
Usage:
  cd /var/www/tna-nexus
  bash update.sh

Optional environment variables:
  INSTALL_DIR=/var/www/tna-nexus
  SOURCE_DIR=/home/your-user/tna-nexus
  APP_USER=tna-nexus
  GIT_PULL=yes|no
  RUN_PLATFORM_MIGRATION=yes|no
  RUN_TENANT_MIGRATION=yes|no
  RESTART_NGINX=yes|no
EOF
}

read_env_value() {
  local key="$1"
  local env_file="${INSTALL_DIR}/.env"

  if [[ -f "${env_file}" ]]; then
    grep -E "^${key}=" "${env_file}" | head -n 1 | cut -d '=' -f2-
  fi
}

resolve_install_dir() {
  if [[ -n "${INSTALL_DIR}" ]]; then
    echo "${INSTALL_DIR}"
    return 0
  fi

  if [[ -f "${DEFAULT_INSTALL_DIR}/.env" && -f "${DEFAULT_INSTALL_DIR}/package.json" ]]; then
    echo "${DEFAULT_INSTALL_DIR}"
    return 0
  fi

  if [[ -f "${PWD}/.env" && -f "${PWD}/package.json" ]]; then
    echo "${PWD}"
    return 0
  fi

  echo "${DEFAULT_REPO_ROOT}"
}

resolve_source_dir() {
  if [[ -n "${SOURCE_DIR}" ]]; then
    echo "${SOURCE_DIR}"
    return 0
  fi

  if [[ -d "${PWD}/.git" ]]; then
    echo "${PWD}"
    return 0
  fi

  if [[ -d "${DEFAULT_REPO_ROOT}/.git" ]]; then
    echo "${DEFAULT_REPO_ROOT}"
    return 0
  fi

  if [[ -d "${INSTALL_DIR}/.git" ]]; then
    echo "${INSTALL_DIR}"
    return 0
  fi

  echo ""
}

INSTALL_DIR="$(resolve_install_dir)"
SOURCE_DIR="$(resolve_source_dir)"

if [[ ! -f "${INSTALL_DIR}/package.json" ]]; then
  usage
  echo
  echo "Could not find package.json in ${INSTALL_DIR}."
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is required to run updates."
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm is required to run updates."
  exit 1
fi

cd "${INSTALL_DIR}"

if [[ "${GIT_PULL}" == "yes" ]]; then
  if [[ -n "${SOURCE_DIR}" && -d "${SOURCE_DIR}/.git" ]]; then
    echo "Pulling latest code..."
    git -C "${SOURCE_DIR}" pull --ff-only
  else
    echo "GIT_PULL=yes was set, but no git checkout was found."
    exit 1
  fi
fi

if [[ -n "${SOURCE_DIR}" && "${SOURCE_DIR}" != "${INSTALL_DIR}" ]]; then
  echo "Syncing source into install directory..."
  rsync -a --delete \
    --exclude .git \
    --exclude node_modules \
    --exclude .next \
    --exclude dist \
    --exclude uploads \
    --exclude backups \
    --exclude .env \
    "${SOURCE_DIR}/" "${INSTALL_DIR}/"
fi

if [[ -f "${INSTALL_DIR}/.env" ]]; then
  PLATFORM_DATABASE_URL="${PLATFORM_DATABASE_URL:-$(read_env_value PLATFORM_DATABASE_URL)}"
  POSTGRES_HOST="${POSTGRES_HOST:-$(read_env_value POSTGRES_HOST)}"
  POSTGRES_PORT="${POSTGRES_PORT:-$(read_env_value POSTGRES_PORT)}"
  POSTGRES_SUPERUSER="${POSTGRES_SUPERUSER:-$(read_env_value POSTGRES_SUPERUSER)}"
  POSTGRES_SUPERUSER_PASSWORD="${POSTGRES_SUPERUSER_PASSWORD:-$(read_env_value POSTGRES_SUPERUSER_PASSWORD)}"
else
  echo "Missing ${INSTALL_DIR}/.env"
  echo "Tip: if your live install is elsewhere, run INSTALL_DIR=/your/install/path bash update.sh"
  exit 1
fi

platform_db_name() {
  local url="${PLATFORM_DATABASE_URL:-}"
  url="${url#*@}"
  url="${url#*/}"
  echo "${url%%\?*}"
}

run_tenant_migrations() {
  local platform_db
  platform_db="$(platform_db_name)"

  if [[ -z "${platform_db}" ]]; then
    echo "Could not determine platform database name from PLATFORM_DATABASE_URL."
    exit 1
  fi

  if [[ -z "${POSTGRES_HOST:-}" || -z "${POSTGRES_PORT:-}" || -z "${POSTGRES_SUPERUSER:-}" || -z "${POSTGRES_SUPERUSER_PASSWORD:-}" ]]; then
    echo "Skipping tenant migrations because PostgreSQL superuser connection values are missing from .env."
    return 0
  fi

  echo "Applying tenant schema updates..."
  export PGPASSWORD="${POSTGRES_SUPERUSER_PASSWORD}"
  mapfile -t tenant_dbs < <(
    psql \
      -h "${POSTGRES_HOST}" \
      -p "${POSTGRES_PORT}" \
      -U "${POSTGRES_SUPERUSER}" \
      -d "${platform_db}" \
      -At \
      -c 'SELECT "databaseName" FROM "TenantDatabase" ORDER BY "databaseName";'
  )

  for tenant_db in "${tenant_dbs[@]}"; do
    [[ -n "${tenant_db}" ]] || continue
    echo "  - ${tenant_db}"
    psql \
      -h "${POSTGRES_HOST}" \
      -p "${POSTGRES_PORT}" \
      -U "${POSTGRES_SUPERUSER}" \
      -d "${tenant_db}" \
      -v ON_ERROR_STOP=1 \
      -f "${INSTALL_DIR}/prisma/tenant/migration.sql" >/dev/null
  done
  unset PGPASSWORD
}

echo "Installing dependencies..."
if [[ -f "${INSTALL_DIR}/pnpm-lock.yaml" ]]; then
  pnpm install --frozen-lockfile
else
  pnpm install
fi

echo "Building shared package..."
pnpm --filter @tna-nexus/shared build

echo "Generating Prisma clients..."
pnpm --filter @tna-nexus/api prisma:generate

if [[ "${RUN_PLATFORM_MIGRATION}" == "yes" ]]; then
  echo "Applying platform schema updates..."
  pnpm --filter @tna-nexus/api prisma:migrate:platform
fi

if [[ "${RUN_TENANT_MIGRATION}" == "yes" ]]; then
  run_tenant_migrations
fi

echo "Building API and web app..."
pnpm --filter @tna-nexus/api build
pnpm --filter @tna-nexus/web build

echo "Refreshing Prisma runtime links..."
mkdir -p "${INSTALL_DIR}/apps/api/dist/generated"
ln -sfn "${INSTALL_DIR}/apps/api/src/generated/platform-client" "${INSTALL_DIR}/apps/api/dist/generated/platform-client"
ln -sfn "${INSTALL_DIR}/apps/api/src/generated/tenant-client" "${INSTALL_DIR}/apps/api/dist/generated/tenant-client"

echo "Resetting file ownership..."
sudo chown -R "${APP_USER}:${APP_USER}" "${INSTALL_DIR}"

echo "Restarting services..."
sudo systemctl restart tna-nexus-api
sudo systemctl restart tna-nexus-web

if [[ "${RESTART_NGINX}" == "yes" ]]; then
  sudo systemctl reload nginx
fi

echo
echo "Update complete."
echo "Database contents and uploads were left in place."
