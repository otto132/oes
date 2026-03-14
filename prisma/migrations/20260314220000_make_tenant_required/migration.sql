-- Migration: make_tenant_required
-- Makes tenantId NOT NULL on users and invitations after backfill

ALTER TABLE "users" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "invitations" ALTER COLUMN "tenantId" SET NOT NULL;
