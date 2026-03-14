-- Migration: add_tenant_model_nullable
-- Creates the Tenant model and adds nullable tenantId to User and Invitation

-- CreateTable: tenants
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "settings" JSONB NOT NULL DEFAULT '{}',
    "dbConnectionString" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: unique slug
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- AlterTable: users — add nullable tenantId
ALTER TABLE "users" ADD COLUMN "tenantId" TEXT;

-- CreateIndex: users.tenantId
CREATE INDEX "users_tenantId_idx" ON "users"("tenantId");

-- AlterTable: invitations — add nullable tenantId
ALTER TABLE "invitations" ADD COLUMN "tenantId" TEXT;

-- CreateIndex: invitations.tenantId
CREATE INDEX "invitations_tenantId_idx" ON "invitations"("tenantId");

-- AddForeignKey: users.tenantId -> tenants.id
ALTER TABLE "users" ADD CONSTRAINT "users_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey: invitations.tenantId -> tenants.id
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE SET NULL ON UPDATE CASCADE;
