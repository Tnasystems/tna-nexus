# API Overview

Base path: `/api/v1`

Authentication:
- `POST /auth/login`
- `POST /auth/refresh`

Platform:
- `GET /platform-admin/dashboard`
- `GET /platform-admin/companies`
- `POST /tenants`

Tenant-scoped operations:
- `GET /companies/me`
- `GET/POST /users`
- `GET/POST /jobs`
- `PATCH /jobs/:jobId`
- `GET/POST /tasks`
- `GET/POST /forms/definitions`
- `GET /timesheets`
- `POST /timesheets/clock-in`
- `POST /timesheets/clock-out`
- `GET/POST /assets`
- `POST /assets/import-vehicles`
- `GET /assets/:assetId/tracking`
- `GET /documents`
- `POST /documents/placeholder`
- `GET /reporting/summary`
- `GET/POST /notifications`
- `GET /search`
- `GET /audit`

Interactive documentation is available from Swagger at `/api/docs`.
