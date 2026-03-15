#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -eq 0 ]]; then
  echo "Run this script as your normal sudo user, not as root."
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../../.." && pwd)"
INSTALL_DIR="${INSTALL_DIR:-/var/www/tna-nexus}"
DOMAIN="${DOMAIN:-}"
WWW_DOMAIN="${WWW_DOMAIN:-}"
ADMIN_EMAIL="${ADMIN_EMAIL:-}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-postgres}"
DEMO_TENANT_PASSWORD="${DEMO_TENANT_PASSWORD:-ChangeThisTenantPassword123!}"
JWT_ACCESS_SECRET="${JWT_ACCESS_SECRET:-}"
JWT_REFRESH_SECRET="${JWT_REFRESH_SECRET:-}"
TENANT_CREDENTIAL_SECRET="${TENANT_CREDENTIAL_SECRET:-}"
ENABLE_HTTPS="${ENABLE_HTTPS:-yes}"

usage() {
  cat <<'EOF'
Usage:
  DOMAIN=example.com ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD='StrongPassword123!' bash packages/config/scripts/install-ubuntu.sh

Optional environment variables:
  WWW_DOMAIN=www.example.com
  INSTALL_DIR=/var/www/tna-nexus
  POSTGRES_PASSWORD=postgres
  DEMO_TENANT_PASSWORD='AnotherStrongPassword123!'
  JWT_ACCESS_SECRET='...'
  JWT_REFRESH_SECRET='...'
  TENANT_CREDENTIAL_SECRET='...'
  ENABLE_HTTPS=yes|no
EOF
}

if [[ -z "${DOMAIN}" || -z "${ADMIN_EMAIL}" || -z "${ADMIN_PASSWORD}" ]]; then
  usage
  exit 1
fi

if [[ -z "${WWW_DOMAIN}" ]]; then
  WWW_DOMAIN="www.${DOMAIN}"
fi

random_secret() {
  openssl rand -hex 32
}

JWT_ACCESS_SECRET="${JWT_ACCESS_SECRET:-$(random_secret)}"
JWT_REFRESH_SECRET="${JWT_REFRESH_SECRET:-$(random_secret)}"
TENANT_CREDENTIAL_SECRET="${TENANT_CREDENTIAL_SECRET:-$(random_secret)}"

echo "Installing Ubuntu packages..."
sudo apt update
sudo apt upgrade -y
sudo apt install -y \
  curl \
  git \
  unzip \
  build-essential \
  software-properties-common \
  rsync \
  nginx \
  certbot \
  python3-certbot-nginx \
  postgresql \
  postgresql-contrib

if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | sed 's/v\([0-9]*\).*/\1/')" -lt 22 ]]; then
  echo "Installing Node.js 22..."
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt install -y nodejs
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "Installing pnpm..."
  sudo npm install -g pnpm@10.8.1
fi

echo "Enabling services..."
sudo systemctl enable postgresql
sudo systemctl start postgresql
sudo systemctl enable nginx
sudo systemctl start nginx

echo "Preparing install directory..."
sudo mkdir -p "${INSTALL_DIR}"
sudo chown -R "${USER}:${USER}" "${INSTALL_DIR}"
rsync -a --delete --exclude .git --exclude node_modules --exclude .next --exclude dist "${REPO_ROOT}/" "${INSTALL_DIR}/"

cd "${INSTALL_DIR}"

echo "Configuring PostgreSQL..."
sudo -u postgres psql <<EOF
ALTER USER postgres WITH PASSWORD '${POSTGRES_PASSWORD}';
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_database WHERE datname = 'tna_platform') THEN
    CREATE DATABASE tna_platform OWNER postgres;
  END IF;
END
\$\$;
EOF

echo "Writing environment file..."
cat > "${INSTALL_DIR}/.env" <<EOF
NODE_ENV=production
APP_URL=https://${DOMAIN}
API_URL=https://${DOMAIN}
PLATFORM_DATABASE_URL=postgresql://postgres:${POSTGRES_PASSWORD}@127.0.0.1:5432/tna_platform?schema=public
JWT_ACCESS_SECRET=${JWT_ACCESS_SECRET}
JWT_REFRESH_SECRET=${JWT_REFRESH_SECRET}
TENANT_CREDENTIAL_SECRET=${TENANT_CREDENTIAL_SECRET}
ACCESS_TOKEN_TTL=15m
REFRESH_TOKEN_TTL=30d
UPLOAD_ROOT=./uploads
DEFAULT_STORAGE_DRIVER=local
PLATFORM_ADMIN_EMAIL=${ADMIN_EMAIL}
PLATFORM_ADMIN_PASSWORD=${ADMIN_PASSWORD}
DEMO_COMPANY_SLUG=demo-industrial
DEMO_COMPANY_NAME=Demo Industrial Services
DEMO_COMPANY_DB_NAME=tna_tenant_demo_industrial
DEMO_COMPANY_DB_USER=tenant_demo_user
DEMO_COMPANY_DB_PASSWORD=${DEMO_TENANT_PASSWORD}
POSTGRES_HOST=127.0.0.1
POSTGRES_PORT=5432
POSTGRES_SUPERUSER=postgres
POSTGRES_SUPERUSER_PASSWORD=${POSTGRES_PASSWORD}
EOF

mkdir -p "${INSTALL_DIR}/uploads" "${INSTALL_DIR}/backups"

echo "Installing app dependencies..."
pnpm install
pnpm prisma:generate
pnpm prisma:migrate:platform
pnpm seed
pnpm --filter @tna-nexus/api build
pnpm --filter @tna-nexus/web build

echo "Installing systemd services..."
sudo cp "${INSTALL_DIR}/packages/config/systemd/tna-nexus-api.service" /etc/systemd/system/tna-nexus-api.service
sudo cp "${INSTALL_DIR}/packages/config/systemd/tna-nexus-web.service" /etc/systemd/system/tna-nexus-web.service
sudo chown -R www-data:www-data "${INSTALL_DIR}"
sudo chmod -R 755 "${INSTALL_DIR}"
sudo systemctl daemon-reload
sudo systemctl enable tna-nexus-api
sudo systemctl enable tna-nexus-web
sudo systemctl restart tna-nexus-api
sudo systemctl restart tna-nexus-web

echo "Configuring Nginx..."
TMP_NGINX="$(mktemp)"
sed \
  -e "s/www.your-domain.com/${WWW_DOMAIN}/g" \
  -e "s/your-domain.com/${DOMAIN}/g" \
  "${INSTALL_DIR}/packages/config/nginx/tna-nexus.ubuntu.conf" > "${TMP_NGINX}"
sudo cp "${TMP_NGINX}" /etc/nginx/sites-available/tna-nexus
rm -f "${TMP_NGINX}"
sudo ln -sf /etc/nginx/sites-available/tna-nexus /etc/nginx/sites-enabled/tna-nexus
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx

if [[ "${ENABLE_HTTPS}" == "yes" ]]; then
  echo "Requesting HTTPS certificate..."
  sudo certbot --nginx -d "${DOMAIN}" -d "${WWW_DOMAIN}" --non-interactive --agree-tos -m "${ADMIN_EMAIL}" --redirect || true
fi

echo
echo "Installation complete."
echo "Site: https://${DOMAIN}"
echo "Admin email: ${ADMIN_EMAIL}"
echo "API health: https://${DOMAIN}/api/v1/health"
echo
echo "Useful checks:"
echo "  sudo systemctl status tna-nexus-api"
echo "  sudo systemctl status tna-nexus-web"
echo "  sudo journalctl -u tna-nexus-api -n 80 --no-pager"
