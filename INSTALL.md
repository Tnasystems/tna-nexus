# TNA-Nexus One-Command Ubuntu Install

From a fresh Ubuntu Server:

```bash
sudo apt update && sudo apt install -y git
git clone https://github.com/Tnasystems/tna-nexus.git
cd tna-nexus
DOMAIN=your-domain.com ADMIN_EMAIL=admin@your-domain.com ADMIN_PASSWORD='ChangeThisNow123!' bash packages/config/scripts/install-ubuntu.sh
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
