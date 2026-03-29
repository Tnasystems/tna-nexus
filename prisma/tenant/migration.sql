CREATE TABLE IF NOT EXISTS "User" (
  "id" TEXT PRIMARY KEY,
  "email" TEXT NOT NULL UNIQUE,
  "fullName" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "accountStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
  "trainingRecordsJson" TEXT NOT NULL DEFAULT '[]',
  "passwordHash" TEXT NOT NULL,
  "phone" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "accountStatus" TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "trainingRecordsJson" TEXT NOT NULL DEFAULT '[]';

CREATE TABLE IF NOT EXISTS "Job" (
  "id" TEXT PRIMARY KEY,
  "title" TEXT NOT NULL,
  "companyJobNumber" TEXT NOT NULL,
  "customerJobNumber" TEXT NOT NULL,
  "siteAddress" TEXT NOT NULL,
  "externalInfo" TEXT NOT NULL DEFAULT '',
  "internalInfo" TEXT NOT NULL DEFAULT '',
  "status" TEXT NOT NULL,
  "quoteStatus" TEXT NOT NULL DEFAULT 'NOT_STARTED',
  "quotationJson" TEXT NOT NULL DEFAULT '{}',
  "quotationRevisionsJson" TEXT NOT NULL DEFAULT '[]',
  "finalMeasureJson" TEXT NOT NULL DEFAULT '{}',
  "scheduledFor" TIMESTAMP,
  "scheduledTo" TIMESTAMP,
  "scheduledStartTime" TEXT,
  "scheduledEndTime" TEXT,
  "scheduledDays" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "dailyAssignmentsJson" TEXT NOT NULL DEFAULT '{}',
  "assignedOperativeIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "assignedVehicleIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "Contract" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL UNIQUE,
  "description" TEXT NOT NULL DEFAULT '',
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "QuoteItem" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL UNIQUE,
  "description" TEXT NOT NULL DEFAULT '',
  "unit" TEXT NOT NULL DEFAULT 'item',
  "defaultRate" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "contractRatesJson" TEXT NOT NULL DEFAULT '{}',
  "isActive" BOOLEAN NOT NULL DEFAULT TRUE,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "Contract" ADD COLUMN IF NOT EXISTS "description" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Contract" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE "Contract" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE "QuoteItem" ADD COLUMN IF NOT EXISTS "description" TEXT NOT NULL DEFAULT '';
ALTER TABLE "QuoteItem" ADD COLUMN IF NOT EXISTS "unit" TEXT NOT NULL DEFAULT 'item';
ALTER TABLE "QuoteItem" ADD COLUMN IF NOT EXISTS "defaultRate" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "QuoteItem" ADD COLUMN IF NOT EXISTS "contractRatesJson" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "QuoteItem" ADD COLUMN IF NOT EXISTS "isActive" BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE "QuoteItem" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

INSERT INTO "Contract" ("id", "name", "code", "description")
SELECT 'contract-standard', 'Standard Contract', 'STANDARD', 'Default pricing schedule'
WHERE NOT EXISTS (SELECT 1 FROM "Contract" WHERE "id" = 'contract-standard');

INSERT INTO "QuoteItem" ("id", "name", "code", "description", "unit", "defaultRate", "contractRatesJson")
SELECT 'quote-sign-face', 'Sign face replacement', 'SIGN-FACE', 'Replacement sign face supply and fit', 'item', 95.00, '{"contract-standard":"95.00"}'
WHERE NOT EXISTS (SELECT 1 FROM "QuoteItem" WHERE "id" = 'quote-sign-face');

INSERT INTO "QuoteItem" ("id", "name", "code", "description", "unit", "defaultRate", "contractRatesJson")
SELECT 'quote-post-install', 'Sign post installation', 'POST-INSTALL', 'Install new sign post including excavation and concrete', 'item', 165.00, '{"contract-standard":"165.00"}'
WHERE NOT EXISTS (SELECT 1 FROM "QuoteItem" WHERE "id" = 'quote-post-install');

INSERT INTO "QuoteItem" ("id", "name", "code", "description", "unit", "defaultRate", "contractRatesJson")
SELECT 'quote-traffic-management', 'Traffic management setup', 'TM-SETUP', 'Traffic management deployment for site works', 'day', 220.00, '{"contract-standard":"220.00"}'
WHERE NOT EXISTS (SELECT 1 FROM "QuoteItem" WHERE "id" = 'quote-traffic-management');

ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "companyJobNumber" TEXT;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "customerJobNumber" TEXT;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "externalInfo" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "internalInfo" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "quoteStatus" TEXT NOT NULL DEFAULT 'NOT_STARTED';
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "quotationJson" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "quotationRevisionsJson" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "finalMeasureJson" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "scheduledTo" TIMESTAMP;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "scheduledStartTime" TEXT;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "scheduledEndTime" TEXT;
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "scheduledDays" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "dailyAssignmentsJson" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "assignedOperativeIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "Job" ADD COLUMN IF NOT EXISTS "assignedVehicleIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
UPDATE "Job" SET "companyJobNumber" = COALESCE("companyJobNumber", "id") WHERE "companyJobNumber" IS NULL;
UPDATE "Job" SET "customerJobNumber" = COALESCE("customerJobNumber", "id") WHERE "customerJobNumber" IS NULL;
ALTER TABLE "Job" ALTER COLUMN "companyJobNumber" SET NOT NULL;
ALTER TABLE "Job" ALTER COLUMN "customerJobNumber" SET NOT NULL;

CREATE TABLE IF NOT EXISTS "Task" (
  "id" TEXT PRIMARY KEY,
  "jobId" TEXT NOT NULL REFERENCES "Job"("id") ON DELETE CASCADE,
  "title" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "FormDefinition" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "schemaJson" TEXT NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "TimesheetEntry" (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE,
  "startedAt" TIMESTAMP NOT NULL,
  "endedAt" TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "Asset" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "serialNumber" TEXT NOT NULL,
  "kind" TEXT NOT NULL DEFAULT 'GENERAL',
  "assetStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
  "registrationNumber" TEXT,
  "notes" TEXT NOT NULL DEFAULT '',
  "lastServicedAt" TIMESTAMP,
  "nextServiceDueAt" TIMESTAMP,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'GENERAL';
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "assetStatus" TEXT NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "registrationNumber" TEXT;
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "notes" TEXT NOT NULL DEFAULT '';
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "lastServicedAt" TIMESTAMP;
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "nextServiceDueAt" TIMESTAMP;
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

INSERT INTO "Asset" ("id", "name", "serialNumber", "kind", "registrationNumber")
SELECT 'vehicle-transit-01', 'Ford Transit 350', 'VH-001', 'VEHICLE', 'YN24 TNA'
WHERE NOT EXISTS (SELECT 1 FROM "Asset" WHERE "id" = 'vehicle-transit-01');

INSERT INTO "Asset" ("id", "name", "serialNumber", "kind", "registrationNumber")
SELECT 'vehicle-vivaro-01', 'Vauxhall Vivaro', 'VH-002', 'VEHICLE', 'YN24 RTC'
WHERE NOT EXISTS (SELECT 1 FROM "Asset" WHERE "id" = 'vehicle-vivaro-01');

INSERT INTO "Asset" ("id", "name", "serialNumber", "kind", "registrationNumber")
SELECT 'vehicle-crafter-01', 'VW Crafter', 'VH-003', 'VEHICLE', 'YN24 JOB'
WHERE NOT EXISTS (SELECT 1 FROM "Asset" WHERE "id" = 'vehicle-crafter-01');

CREATE TABLE IF NOT EXISTS "Document" (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL,
  "storagePath" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "jobId" TEXT REFERENCES "Job"("id") ON DELETE CASCADE,
  "visibility" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "jobId" TEXT REFERENCES "Job"("id") ON DELETE CASCADE;
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "visibility" TEXT;

CREATE TABLE IF NOT EXISTS "Notification" (
  "id" TEXT PRIMARY KEY,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "channel" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "AuditLog" (
  "id" TEXT PRIMARY KEY,
  "action" TEXT NOT NULL,
  "entity" TEXT NOT NULL,
  "entityId" TEXT NOT NULL,
  "actorId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
