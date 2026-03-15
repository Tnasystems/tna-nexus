# Future Mobile App Integration

## Goal
The backend is structured so React Native or Flutter clients can consume the same versioned API that the web app uses today.

## Mobile-ready design choices
- `JWT access token + refresh token` authentication is suitable for secure native session renewal.
- `URI versioning` is enabled at `/api/v1/*` so mobile app releases can pin stable contracts.
- `Schema-driven forms` are stored in `FormDefinition.schemaJson` so future mobile clients can render and submit the same forms as the web app.
- `File and photo uploads` are routed through API endpoints and stored behind a storage abstraction, starting with local disk and designed for future S3-compatible storage.
- `Notification entities` already model queued delivery and channels so push notifications can later be wired to APNs/FCM.

## Offline sync strategy
- Jobs, tasks, forms, timesheets, and documents should be cached on-device by tenant and user.
- Mobile clients should maintain an operation queue for check-ins, form submissions, clock events, signatures, and uploads.
- Each queued action should carry: tenant slug, local item ID, API target, payload checksum, created timestamp, and retry count.
- The API should later expose sync cursors using `updatedAt` timestamps or server-issued cursor tokens for incremental pulls.
- Uploads should use a staged state model: `queued`, `uploading`, `uploaded`, `linked`, `failed`.

## Recommended next backend additions for mobile
- Add device session records with refresh token rotation and revocation.
- Add assignment endpoints for `my jobs`, `my tasks`, `my documents`.
- Add binary upload endpoints with pre-signed URL support once S3-compatible storage is enabled.
- Add websocket or webhook-based notification fanout service.
- Add OpenAPI-generated client SDKs for TypeScript and Dart.
