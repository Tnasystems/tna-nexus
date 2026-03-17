#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -eq 0 ]]; then
  echo "Run this script as your normal sudo user, not as root."
  exit 1
fi

INSTALL_DIR="${INSTALL_DIR:-/var/www/tna-nexus}"
APP_USER="${APP_USER:-tna-nexus}"
DOMAIN="${DOMAIN:-}"
WWW_DOMAIN="${WWW_DOMAIN:-}"
POSTGRES_SUPERUSER="${POSTGRES_SUPERUSER:-postgres}"
REMOVE_DATA="${REMOVE_DATA:-yes}"
REMOVE_PACKAGES="${REMOVE_PACKAGES:-no}"
REMOVE_CERTS="${REMOVE_CERTS:-yes}"
PURGE_CONFIRM="${PURGE_CONFIRM:-yes}"

usage() {
  cat <<'EOF'
Usage:
  APP_USER=$USER bash packages/config/scripts/purge-ubuntu.sh

Optional environment variables:
  INSTALL_DIR=/var/www/tna-nexus
  APP_USER=tna-nexus
  DOMAIN=example.com
  WWW_DOMAIN=www.example.com
  POSTGRES_SUPERUSER=postgres
  REMOVE_DATA=yes|no
  REMOVE_CERTS=yes|no
  REMOVE_PACKAGES=yes|no
  PURGE_CONFIRM=YES
EOF
}

require_confirmation() {
  if [[ "${PURGE_CONFIRM}" == "YES" ]]; then
    return 0
  fi

  echo "This will stop services, remove Nginx and systemd config, and delete the installed app files."
  if [[ "${REMOVE_DATA}" == "yes" ]]; then
    echo "It will also try to delete the platform and demo tenant PostgreSQL databases."
  fi
  echo
  read -r -p "Type YES to continue: " response
  [[ "${response}" == "YES" ]]
}

read_env_value() {
  local key="$1"
  local env_file="${INSTALL_DIR}/.env"

  if [[ -f "${env_file}" ]]; then
    grep -E "^${key}=" "${env_file}" | head -n 1 | cut -d '=' -f2-
  fi
}

drop_database_if_exists() {
  local db_name="$1"

  if [[ -z "${db_name}" ]]; then
    return 0
  fi

  if sudo -u "${POSTGRES_SUPERUSER}" psql -tAc "SELECT 1 FROM pg_database WHERE datname = '${db_name}'" | grep -q 1; then
    sudo -u "${POSTGRES_SUPERUSER}" psql -d postgres -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${db_name}' AND pid <> pg_backend_pid();" >/dev/null 2>&1 || true
    sudo -u "${POSTGRES_SUPERUSER}" dropdb "${db_name}" || true
  fi
}

drop_role_if_exists() {
  local role_name="$1"

  if [[ -z "${role_name}" ]]; then
    return 0
  fi

  if sudo -u "${POSTGRES_SUPERUSER}" psql -tAc "SELECT 1 FROM pg_roles WHERE rolname = '${role_name}'" | grep -q 1; then
    sudo -u "${POSTGRES_SUPERUSER}" psql -d postgres -c "DROP ROLE IF EXISTS \"${role_name}\";" >/dev/null 2>&1 || true
  fi
}

if ! require_confirmation; then
  echo "Purge cancelled."
  exit 1
fi

if [[ -z "${DOMAIN}" ]]; then
  DOMAIN="$(read_env_value APP_URL | sed -E 's#https?://##')"
  DOMAIN="${DOMAIN%%/*}"
fi

if [[ -z "${WWW_DOMAIN}" && -n "${DOMAIN}" ]]; then
  WWW_DOMAIN="www.${DOMAIN}"
fi

PLATFORM_DB_NAME="tna_platform"
DEMO_DB_NAME="$(read_env_value DEMO_COMPANY_DB_NAME)"
DEMO_DB_USER="$(read_env_value DEMO_COMPANY_DB_USER)"

echo "Stopping app services..."
sudo systemctl stop tna-nexus-api 2>/dev/null || true
sudo systemctl stop tna-nexus-web 2>/dev/null || true
sudo systemctl disable tna-nexus-api 2>/dev/null || true
sudo systemctl disable tna-nexus-web 2>/dev/null || true

echo "Removing systemd service files..."
sudo rm -f /etc/systemd/system/tna-nexus-api.service
sudo rm -f /etc/systemd/system/tna-nexus-web.service
sudo systemctl daemon-reload

echo "Removing Nginx site..."
sudo rm -f /etc/nginx/sites-enabled/tna-nexus
sudo rm -f /etc/nginx/sites-available/tna-nexus
sudo nginx -t >/dev/null 2>&1 && sudo systemctl reload nginx || true

if [[ "${REMOVE_CERTS}" == "yes" && -n "${DOMAIN}" ]] && command -v certbot >/dev/null 2>&1; then
  echo "Removing Certbot certificate if present..."
  sudo certbot delete --cert-name "${DOMAIN}" --non-interactive >/dev/null 2>&1 || true
fi

if [[ "${REMOVE_DATA}" == "yes" ]]; then
  echo "Removing PostgreSQL databases and tenant role..."
  drop_database_if_exists "${DEMO_DB_NAME}"
  drop_role_if_exists "${DEMO_DB_USER}"
  drop_database_if_exists "${PLATFORM_DB_NAME}"
fi

echo "Removing install directory..."
sudo rm -rf "${INSTALL_DIR}"

if id -u "${APP_USER}" >/dev/null 2>&1; then
  echo "Removing app user ${APP_USER}..."
  sudo userdel -r "${APP_USER}" >/dev/null 2>&1 || sudo userdel "${APP_USER}" >/dev/null 2>&1 || true
fi

if [[ "${REMOVE_PACKAGES}" == "yes" ]]; then
  echo "Removing installed Ubuntu packages..."
  sudo apt purge -y nginx certbot python3-certbot-nginx postgresql postgresql-contrib nodejs || true
  sudo apt autoremove -y || true
fi

echo
echo "Purge complete."
echo "You can now rerun the installer on the same server."
