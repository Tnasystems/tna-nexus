#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="${ENV_FILE:-${REPO_ROOT}/.env}"
POSTGRES_HOST="${POSTGRES_HOST:-127.0.0.1}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_SUPERUSER="${POSTGRES_SUPERUSER:-postgres}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-postgres}"
PLATFORM_DB_NAME="${PLATFORM_DB_NAME:-tna_platform}"
DEMO_COMPANY_DB_NAME="${DEMO_COMPANY_DB_NAME:-tna_tenant_demo_industrial}"
DEMO_COMPANY_DB_USER="${DEMO_COMPANY_DB_USER:-tenant_demo_user}"
REMOVE_ENV_FILE="${REMOVE_ENV_FILE:-yes}"
REMOVE_NODE_MODULES="${REMOVE_NODE_MODULES:-yes}"
REMOVE_SYSTEM_DEPS="${REMOVE_SYSTEM_DEPS:-no}"
PURGE_CONFIRM="${PURGE_CONFIRM:-}"

usage() {
  cat <<'EOF'
Usage:
  bash purge-lite.sh

Optional environment variables:
  ENV_FILE=/path/to/.env
  POSTGRES_HOST=127.0.0.1
  POSTGRES_PORT=5432
  POSTGRES_SUPERUSER=postgres
  POSTGRES_PASSWORD=postgres
  PLATFORM_DB_NAME=tna_platform
  DEMO_COMPANY_DB_NAME=tna_tenant_demo_industrial
  DEMO_COMPANY_DB_USER=tenant_demo_user
  REMOVE_ENV_FILE=yes|no
  REMOVE_NODE_MODULES=yes|no
  REMOVE_SYSTEM_DEPS=yes|no
  PURGE_CONFIRM=YES

This removes local test artifacts and demo databases.
It does not remove app services because install-lite.sh does not create any.
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

require_confirmation() {
  if [[ "${PURGE_CONFIRM}" == "YES" ]]; then
    return 0
  fi

  echo "This will remove local test build artifacts, uploads, backups, and demo databases."
  if [[ "${REMOVE_NODE_MODULES}" == "yes" ]]; then
    echo "It will also remove node_modules."
  fi
  if [[ "${REMOVE_SYSTEM_DEPS}" == "yes" ]]; then
    echo "It will try to uninstall locally installed PostgreSQL and Node.js packages."
  fi
  echo
  read -r -p "Type YES to continue: " response
  [[ "${response}" == "YES" ]]
}

drop_database_if_exists() {
  local db_name="$1"

  if [[ -z "${db_name}" ]] || ! command -v psql >/dev/null 2>&1; then
    return 0
  fi

  if PGPASSWORD="${POSTGRES_PASSWORD}" psql -h "${POSTGRES_HOST}" -p "${POSTGRES_PORT}" -U "${POSTGRES_SUPERUSER}" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '${db_name}'" | grep -q 1; then
    PGPASSWORD="${POSTGRES_PASSWORD}" psql -h "${POSTGRES_HOST}" -p "${POSTGRES_PORT}" -U "${POSTGRES_SUPERUSER}" -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${db_name}' AND pid <> pg_backend_pid();" >/dev/null 2>&1 || true
    PGPASSWORD="${POSTGRES_PASSWORD}" dropdb -h "${POSTGRES_HOST}" -p "${POSTGRES_PORT}" -U "${POSTGRES_SUPERUSER}" "${db_name}" || true
  fi
}

drop_role_if_exists() {
  local role_name="$1"

  if [[ -z "${role_name}" ]] || ! command -v psql >/dev/null 2>&1; then
    return 0
  fi

  if PGPASSWORD="${POSTGRES_PASSWORD}" psql -h "${POSTGRES_HOST}" -p "${POSTGRES_PORT}" -U "${POSTGRES_SUPERUSER}" -d postgres -tAc "SELECT 1 FROM pg_roles WHERE rolname = '${role_name}'" | grep -q 1; then
    PGPASSWORD="${POSTGRES_PASSWORD}" psql -h "${POSTGRES_HOST}" -p "${POSTGRES_PORT}" -U "${POSTGRES_SUPERUSER}" -d postgres -c "DROP ROLE IF EXISTS \"${role_name}\";" >/dev/null 2>&1 || true
  fi
}

if ! require_confirmation; then
  echo "Purge cancelled."
  exit 1
fi

echo "Removing local test databases..."
drop_database_if_exists "${DEMO_COMPANY_DB_NAME}"
drop_role_if_exists "${DEMO_COMPANY_DB_USER}"
drop_database_if_exists "${PLATFORM_DB_NAME}"

echo "Removing generated app artifacts..."
rm -rf "${REPO_ROOT}/apps/api/dist" \
       "${REPO_ROOT}/apps/api/src/generated" \
       "${REPO_ROOT}/apps/web/.next" \
       "${REPO_ROOT}/packages/shared/dist" \
       "${REPO_ROOT}/uploads" \
       "${REPO_ROOT}/backups"
find "${REPO_ROOT}" -name "*.tsbuildinfo" -delete

if [[ "${REMOVE_NODE_MODULES}" == "yes" ]]; then
  echo "Removing node_modules..."
  rm -rf "${REPO_ROOT}/node_modules" \
         "${REPO_ROOT}/apps/api/node_modules" \
         "${REPO_ROOT}/apps/web/node_modules" \
         "${REPO_ROOT}/packages/shared/node_modules"
fi

if [[ "${REMOVE_ENV_FILE}" == "yes" ]]; then
  echo "Removing environment file..."
  rm -f "${ENV_FILE}"
fi

if [[ "${REMOVE_SYSTEM_DEPS}" == "yes" ]] && [[ -f /etc/debian_version ]] && command -v sudo >/dev/null 2>&1; then
  echo "Removing system packages installed for local testing..."
  sudo apt purge -y postgresql postgresql-contrib nodejs || true
  sudo apt autoremove -y || true
fi

echo
echo "Local test purge complete."
