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

The full manual fallback guide remains in [DEPLOYMENT.md](C:\Users\m1x3d\OneDrive\Documents\TNA-Nexus\DEPLOYMENT.md).

Notes:
- rerunning the script is generally safe for the same server and domain
- if DNS is not live yet, use `ENABLE_HTTPS=no` first, then run Certbot later
- the installer now builds `shared`, generates Prisma clients, and links the generated API clients into the runtime `dist` path before starting services
