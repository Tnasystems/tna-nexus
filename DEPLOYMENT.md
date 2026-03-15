# TNA-Nexus Deployment Guide For A Fresh Ubuntu Server

This is the no-Docker setup.

## Fast path
If you want the automated install, run:
```bash
sudo apt update && sudo apt install -y git
git clone https://github.com/Tnasystems/tna-nexus.git
cd tna-nexus
DOMAIN=your-domain.com ADMIN_EMAIL=admin@your-domain.com ADMIN_PASSWORD='ChangeThisNow123!' bash packages/config/scripts/install-ubuntu.sh
```

If you want to wipe the install and retry on the same server:
```bash
cd tna-nexus
APP_USER=$USER bash packages/config/scripts/purge-ubuntu.sh
```

Short installer notes are in [INSTALL.md](C:\Users\m1x3d\OneDrive\Documents\TNA-Nexus\INSTALL.md).

The rest of this file is the manual step-by-step fallback path.

If you have:
- a fresh Ubuntu Server
- a domain name
- SSH access

follow this exactly.

## 1. Update Ubuntu
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl git unzip build-essential software-properties-common
```

## 2. Install Node.js 22
```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v
```

## 3. Install pnpm
```bash
sudo npm install -g pnpm@10.8.1
pnpm -v
```

## 4. Install PostgreSQL
```bash
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable postgresql
sudo systemctl start postgresql
sudo systemctl status postgresql
```

## 5. Create the project folder
```bash
sudo mkdir -p /var/www/tna-nexus
sudo chown -R $USER:$USER /var/www/tna-nexus
cd /var/www/tna-nexus
```

## 6. Put the project on the server
If using git:
```bash
git clone https://github.com/Tnasystems/tna-nexus.git .
```

If copying manually, upload everything into `/var/www/tna-nexus`.

## 7. Install project dependencies
```bash
cd /var/www/tna-nexus
pnpm install
```

## 8. Create the platform PostgreSQL database
```bash
sudo -u postgres psql
```

Inside PostgreSQL, run:
```sql
ALTER USER postgres WITH PASSWORD 'postgres';
CREATE DATABASE tna_platform OWNER postgres;
\q
```

## 9. Create the app environment file
```bash
cd /var/www/tna-nexus
cp .env.example .env
nano .env
```

Paste and edit values like this:
```env
NODE_ENV=production
APP_URL=https://your-domain.com
API_URL=https://your-domain.com
PORT=4000
PLATFORM_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/tna_platform?schema=public
JWT_ACCESS_SECRET=put-a-long-random-secret-here
JWT_REFRESH_SECRET=put-a-different-long-random-secret-here
TENANT_CREDENTIAL_SECRET=put-another-long-random-secret-here
ACCESS_TOKEN_TTL=15m
REFRESH_TOKEN_TTL=30d
UPLOAD_ROOT=./uploads
DEFAULT_STORAGE_DRIVER=local
PLATFORM_ADMIN_EMAIL=admin@your-domain.com
PLATFORM_ADMIN_PASSWORD=ChangeThisAdminPassword123!
DEMO_COMPANY_SLUG=demo-industrial
DEMO_COMPANY_NAME=Demo Industrial Services
DEMO_COMPANY_DB_NAME=tna_tenant_demo_industrial
DEMO_COMPANY_DB_USER=tenant_demo_user
DEMO_COMPANY_DB_PASSWORD=ChangeThisTenantPassword123!
POSTGRES_HOST=127.0.0.1
POSTGRES_PORT=5432
POSTGRES_SUPERUSER=postgres
POSTGRES_SUPERUSER_PASSWORD=postgres
```

Save with:
- `Ctrl+O`
- `Enter`
- `Ctrl+X`

## 10. Create upload folders and set permissions
```bash
mkdir -p /var/www/tna-nexus/uploads
mkdir -p /var/www/tna-nexus/backups
sudo chown -R $USER:$USER /var/www/tna-nexus
chmod -R 755 /var/www/tna-nexus/uploads
```

## 11. Generate Prisma clients
```bash
cd /var/www/tna-nexus
pnpm --filter @tna-nexus/api prisma:generate
```

## 12. Run the platform database migration
```bash
cd /var/www/tna-nexus
pnpm --filter @tna-nexus/api prisma:migrate:platform
```

## 13. Seed the first admin and demo tenant
```bash
cd /var/www/tna-nexus
pnpm --filter @tna-nexus/api seed
```

This creates:
- the platform admin
- the platform metadata records
- a demo company
- a dedicated tenant database for that demo company
- demo tenant user/job/task/asset/form data

## 14. Build the app
```bash
cd /var/www/tna-nexus
pnpm --filter @tna-nexus/shared build
pnpm --filter @tna-nexus/api prisma:generate
pnpm --filter @tna-nexus/api build
pnpm --filter @tna-nexus/web build
```

## 15. Link Prisma runtime clients
The compiled API expects generated Prisma clients inside the API runtime tree.

```bash
mkdir -p /var/www/tna-nexus/apps/api/dist/generated
ln -sfn /var/www/tna-nexus/apps/api/src/generated/platform-client /var/www/tna-nexus/apps/api/dist/generated/platform-client
ln -sfn /var/www/tna-nexus/apps/api/src/generated/tenant-client /var/www/tna-nexus/apps/api/dist/generated/tenant-client
```

## 16. Install Nginx
```bash
sudo apt install -y nginx
sudo systemctl enable nginx
sudo systemctl start nginx
```

## 17. Add the Nginx site config
Copy the provided file:
- [tna-nexus.ubuntu.conf](C:\Users\m1x3d\OneDrive\Documents\TNA-Nexus\packages\config\nginx\tna-nexus.ubuntu.conf)

Commands:
```bash
sudo cp /var/www/tna-nexus/packages/config/nginx/tna-nexus.ubuntu.conf /etc/nginx/sites-available/tna-nexus
sudo nano /etc/nginx/sites-available/tna-nexus
```

Replace:
- `your-domain.com`
- `www.your-domain.com`

Enable it:
```bash
sudo ln -s /etc/nginx/sites-available/tna-nexus /etc/nginx/sites-enabled/tna-nexus
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
sudo ufw allow 'Nginx Full'
```

## 18. Create systemd services
Copy the service files:
- [tna-nexus-api.service](C:\Users\m1x3d\OneDrive\Documents\TNA-Nexus\packages\config\systemd\tna-nexus-api.service)
- [tna-nexus-web.service](C:\Users\m1x3d\OneDrive\Documents\TNA-Nexus\packages\config\systemd\tna-nexus-web.service)

Commands:
```bash
sudo useradd --system --create-home --shell /bin/bash tna-nexus || true
sudo chown -R tna-nexus:tna-nexus /var/www/tna-nexus
sudo cp /var/www/tna-nexus/packages/config/systemd/tna-nexus-api.service /etc/systemd/system/
sudo cp /var/www/tna-nexus/packages/config/systemd/tna-nexus-web.service /etc/systemd/system/
sudo chmod -R 755 /var/www/tna-nexus
sudo systemctl daemon-reload
sudo systemctl enable tna-nexus-api
sudo systemctl enable tna-nexus-web
sudo systemctl start tna-nexus-api
sudo systemctl start tna-nexus-web
```

Check status:
```bash
sudo systemctl status tna-nexus-api
sudo systemctl status tna-nexus-web
```

## 19. Check the app is running
```bash
curl http://127.0.0.1:4000/api/v1/health
curl http://127.0.0.1:3000
```

If both respond, Nginx should now proxy the app from your domain.

## 20. Set up HTTPS with Certbot
```bash
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com -d www.your-domain.com
```

Choose:
- redirect HTTP to HTTPS = yes

Test renewal:
```bash
sudo certbot renew --dry-run
```

## 21. First admin login
Use the admin credentials from `.env`.

Test login:
```bash
curl -X POST https://your-domain.com/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@your-domain.com","password":"ChangeThisAdminPassword123!"}'
```

## 22. Create your first real tenant/company
Take the access token from the login response and run:
```bash
curl -X POST https://your-domain.com/api/v1/tenants \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "companyName": "North Axis Maintenance",
    "slug": "north-axis",
    "planCode": "growth",
    "databaseName": "tna_tenant_north_axis",
    "databaseUser": "north_axis_user",
    "databasePassword": "StrongTenantPass123!",
    "ownerEmail": "owner@north-axis.example",
    "ownerPassword": "StrongOwnerPass123!"
  }'
```

## 23. Where to view logs
API logs:
```bash
sudo journalctl -u tna-nexus-api -f
```

Web logs:
```bash
sudo journalctl -u tna-nexus-web -f
```

Nginx logs:
```bash
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

## 24. How to restart after changes
```bash
cd /var/www/tna-nexus
pnpm install
pnpm --filter @tna-nexus/shared build
pnpm --filter @tna-nexus/api prisma:generate
pnpm --filter @tna-nexus/api build
pnpm --filter @tna-nexus/web build
mkdir -p /var/www/tna-nexus/apps/api/dist/generated
ln -sfn /var/www/tna-nexus/apps/api/src/generated/platform-client /var/www/tna-nexus/apps/api/dist/generated/platform-client
ln -sfn /var/www/tna-nexus/apps/api/src/generated/tenant-client /var/www/tna-nexus/apps/api/dist/generated/tenant-client
sudo systemctl restart tna-nexus-api
sudo systemctl restart tna-nexus-web
sudo systemctl reload nginx
```

## 25. How to update later
```bash
cd /var/www/tna-nexus
git pull
pnpm install
pnpm --filter @tna-nexus/shared build
pnpm --filter @tna-nexus/api prisma:generate
pnpm --filter @tna-nexus/api prisma:migrate:platform
pnpm --filter @tna-nexus/api build
pnpm --filter @tna-nexus/web build
mkdir -p /var/www/tna-nexus/apps/api/dist/generated
ln -sfn /var/www/tna-nexus/apps/api/src/generated/platform-client /var/www/tna-nexus/apps/api/dist/generated/platform-client
ln -sfn /var/www/tna-nexus/apps/api/src/generated/tenant-client /var/www/tna-nexus/apps/api/dist/generated/tenant-client
sudo systemctl restart tna-nexus-api
sudo systemctl restart tna-nexus-web
```

## 26. Backups
Create a backup:
```bash
bash /var/www/tna-nexus/packages/config/scripts/backup-postgres.sh
```

Restore platform DB:
```bash
bash /var/www/tna-nexus/packages/config/scripts/restore-postgres.sh /var/backups/tna-nexus/platform-YYYYMMDD-HHMMSS.sql
```

Important:
- the platform DB is backed up by the included script
- each tenant DB should also be backed up with the same `pg_dump` pattern
- keep upload folder backups too

## 27. Troubleshooting
If the API will not start:
```bash
sudo journalctl -u tna-nexus-api -n 100 --no-pager
```

If the web app will not start:
```bash
sudo journalctl -u tna-nexus-web -n 100 --no-pager
```

If PostgreSQL login fails:
```bash
sudo -u postgres psql
```

If Nginx config is broken:
```bash
sudo nginx -t
```

If the site loads but API calls fail:
- check `.env`
- check that API is listening on port `4000`
- check that Nginx proxies `/api/` to `127.0.0.1:4000`

If you want to remove the install and start over on the same server:
```bash
cd /var/www/tna-nexus
APP_USER=$USER bash packages/config/scripts/purge-ubuntu.sh
```

## 28. Quick command list
```bash
sudo systemctl restart tna-nexus-api
sudo systemctl restart tna-nexus-web
sudo systemctl reload nginx
sudo systemctl status tna-nexus-api
sudo systemctl status tna-nexus-web
sudo systemctl status nginx
sudo journalctl -u tna-nexus-api -f
sudo journalctl -u tna-nexus-web -f
```
