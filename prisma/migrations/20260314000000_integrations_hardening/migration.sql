-- CreateEnum
CREATE TYPE "IntegrationTokenStatus" AS ENUM ('active', 'error', 'revoked');

-- AlterTable: IntegrationToken - add status column
ALTER TABLE "integration_tokens" ADD COLUMN "status" "IntegrationTokenStatus" NOT NULL DEFAULT 'active';

-- AlterTable: InboxEmail - add externalId column
ALTER TABLE "inbox_emails" ADD COLUMN "externalId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "inbox_emails_externalId_key" ON "inbox_emails"("externalId");

-- AlterTable: Meeting - change startTime from String to DateTime, duration from String to Int
-- Add new columns first
ALTER TABLE "meetings" ADD COLUMN "attendeeEmails" TEXT[];
ALTER TABLE "meetings" ADD COLUMN "externalId" TEXT;

-- Convert startTime from text to timestamp
ALTER TABLE "meetings" ALTER COLUMN "startTime" TYPE TIMESTAMP(3) USING ("date" + "startTime"::time);

-- Convert duration from text to integer (extract numeric part)
ALTER TABLE "meetings" ALTER COLUMN "duration" TYPE INTEGER USING (regexp_replace("duration", '[^0-9]', '', 'g'))::integer;

-- CreateIndex
CREATE UNIQUE INDEX "meetings_externalId_key" ON "meetings"("externalId");

-- CreateTable
CREATE TABLE "sync_logs" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "itemsSynced" INTEGER NOT NULL DEFAULT 0,
    "errors" TEXT[],
    "userId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sync_logs_userId_type_startedAt_idx" ON "sync_logs"("userId", "type", "startedAt" DESC);

-- AddForeignKey
ALTER TABLE "sync_logs" ADD CONSTRAINT "sync_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
