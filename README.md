# TNA-Nexus

TNA-Nexus is an original industrial-tech SaaS starter for field service, job management, staff coordination, forms, assets, compliance, documents, notifications, timesheets, and reporting.

## Core principles
- API-first backend suitable for web now and native mobile later
- Strict multi-tenancy with one dedicated PostgreSQL database per company
- Platform-level control plane for company metadata, subscriptions, demo accounts, and audit logs
- Direct Ubuntu Server deployment with Node.js, PostgreSQL, Nginx, systemd, and Certbot
- Swagger/OpenAPI documentation for all major business endpoints

## Stack
- Next.js 15 + TypeScript
- NestJS 11 + Fastify
- PostgreSQL
- Prisma
- JWT access tokens + refresh token flow
- Nginx

## Ubuntu deployment
The primary setup path is now a direct Ubuntu Server install with:
- Node.js 22
- pnpm
- PostgreSQL 16
- Nginx
- systemd
- Certbot

Repository clone pattern:
```bash
git clone https://github.com/Tnasystems/tna-nexus.git
```

Use the full beginner-proof guide in [DEPLOYMENT.md](C:\Users\m1x3d\OneDrive\Documents\TNA-Nexus\DEPLOYMENT.md).

## Local development
1. Copy the environment file:
   ```bash
   cp .env.example .env
   ```
2. Install dependencies:
   ```bash
   corepack enable
   pnpm install
   ```
3. Generate Prisma clients:
   ```bash
   pnpm prisma:generate
   ```
4. Run platform migration:
   ```bash
   pnpm prisma:migrate:platform
   ```
5. Seed the platform admin and demo tenant:
   ```bash
   pnpm seed
   ```
6. Start the API and web apps:
   ```bash
   pnpm --filter @tna-nexus/api dev
   pnpm --filter @tna-nexus/web dev
   ```
7. Open:
   - Web: [http://localhost:3000](http://localhost:3000)
   - API: [http://localhost:4000/api/v1/health](http://localhost:4000/api/v1/health)
   - Swagger: [http://localhost:4000/api/docs](http://localhost:4000/api/docs)

## Key files
- [apps/api/src/modules/app.module.ts](C:\Users\m1x3d\OneDrive\Documents\TNA-Nexus\apps\api\src\modules\app.module.ts)
- [apps/api/src/database/provisioning.service.ts](C:\Users\m1x3d\OneDrive\Documents\TNA-Nexus\apps\api\src\database\provisioning.service.ts)
- [prisma/platform/schema.prisma](C:\Users\m1x3d\OneDrive\Documents\TNA-Nexus\prisma\platform\schema.prisma)
- [prisma/tenant/schema.prisma](C:\Users\m1x3d\OneDrive\Documents\TNA-Nexus\prisma\tenant\schema.prisma)
- [apps/web/app/dashboard/page.tsx](C:\Users\m1x3d\OneDrive\Documents\TNA-Nexus\apps\web\app\dashboard\page.tsx)
- [packages/config/nginx/tna-nexus.ubuntu.conf](C:\Users\m1x3d\OneDrive\Documents\TNA-Nexus\packages\config\nginx\tna-nexus.ubuntu.conf)
- [packages/config/systemd/tna-nexus-api.service](C:\Users\m1x3d\OneDrive\Documents\TNA-Nexus\packages\config\systemd\tna-nexus-api.service)
- [packages/config/systemd/tna-nexus-web.service](C:\Users\m1x3d\OneDrive\Documents\TNA-Nexus\packages\config\systemd\tna-nexus-web.service)

## Documentation
- Deployment guide: [DEPLOYMENT.md](C:\Users\m1x3d\OneDrive\Documents\TNA-Nexus\DEPLOYMENT.md)
- API overview: [docs/api/API_OVERVIEW.md](C:\Users\m1x3d\OneDrive\Documents\TNA-Nexus\docs\api\API_OVERVIEW.md)
- Mobile readiness: [docs/mobile/FUTURE_MOBILE_APP_INTEGRATION.md](C:\Users\m1x3d\OneDrive\Documents\TNA-Nexus\docs\mobile\FUTURE_MOBILE_APP_INTEGRATION.md)
