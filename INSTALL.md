# TNA-Nexus One-Command Ubuntu Install

From a fresh Ubuntu Server:

```bash
sudo apt update && sudo apt install -y git
git clone https://github.com/Tnasystems/tna-nexus.git
cd tna-nexus
DOMAIN=tnasystems.ddns.net ADMIN_EMAIL=admin@your-domain.com ADMIN_PASSWORD='ChangeThisNow123!' bash packages/config/scripts/install-ubuntu.sh
```

Optional:

```bash
WWW_DOMAIN=www.your-domain.com POSTGRES_PASSWORD='StrongPostgresPassword123!' ENABLE_HTTPS=no APP_USER=$USER bash packages/config/scripts/install-ubuntu.sh
```

Cleanly remove the install from the same server:

```bash
APP_USER=$USER bash packages/config/scripts/purge-ubuntu.sh
```

The full manual fallback guide remains in [DEPLOYMENT.md](C:\Users\m1x3d\OneDrive\Documents\TNA-Nexus\DEPLOYMENT.md).

Notes:
- rerunning the script is generally safe for the same server and domain
- if DNS is not live yet, use `ENABLE_HTTPS=no` first, then run Certbot later
- the installer now builds `shared`, generates Prisma clients, migrates and seeds the platform DB, and links the generated API clients into the runtime `dist` path before starting services
- the installer waits for both `http://127.0.0.1:4000/api/v1/health` and `http://127.0.0.1:3000` before reporting success
- if `ufw` is active, the installer opens `Nginx Full`
- the purge script removes the app files, `systemd` services, Nginx site, and the platform/demo PostgreSQL databases so you can retry on the same machine

## Local Test Install

For a local-only setup without `systemd`, Nginx, or Certbot:

```bash
git clone https://github.com/Tnasystems/tna-nexus.git
cd tna-nexus
bash install-lite.sh
```

Optional:

```bash
POSTGRES_PASSWORD=postgres OVERWRITE_ENV=yes BUILD_APPS=yes bash install-lite.sh
```

This script:
- installs local test prerequisites on Ubuntu when needed
- writes a local `.env` if one does not already exist
- ensures the platform database exists
- installs dependencies
- builds `shared`
- generates Prisma clients
- runs the platform migration
- seeds the platform admin and demo tenant
- optionally builds the API and web app locally
- does not install or register any services

After it completes, start the apps manually:

```bash
pnpm dev
```

Or start them separately:

```bash
pnpm --filter @tna-nexus/api dev
pnpm --filter @tna-nexus/web dev
```

When you are finished testing, remove the local test setup with:

```bash
bash purge-lite.sh
```

Optional full cleanup including PostgreSQL/Node packages that were installed just for testing:

```bash
REMOVE_SYSTEM_DEPS=yes bash purge-lite.sh
```
