-- Migration: backfill_tenant
-- Inserts the default tenant and backfills tenantId on all existing rows

INSERT INTO "tenants" ("id", "name", "slug", "plan", "settings", "createdAt", "updatedAt")
VALUES ('tenant-default', 'Eco-Insight', 'eco-insight', 'free', '{}', NOW(), NOW())
ON CONFLICT ("id") DO NOTHING;

UPDATE "users" SET "tenantId" = 'tenant-default' WHERE "tenantId" IS NULL;
UPDATE "invitations" SET "tenantId" = 'tenant-default' WHERE "tenantId" IS NULL;
