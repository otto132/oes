-- AlterEnum
ALTER TYPE "QueueItemType" ADD VALUE 'meeting_scheduling';

-- AlterTable: InboxEmail - add inbox threading fields
ALTER TABLE "inbox_emails" ADD COLUMN     "body" TEXT,
ADD COLUMN     "bodyHtml" TEXT,
ADD COLUMN     "inReplyTo" TEXT,
ADD COLUMN     "messageId" TEXT,
ADD COLUMN     "references" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "snoozedUntil" TIMESTAMP(3),
ADD COLUMN     "threadId" TEXT;

-- AlterTable: Meeting - add outcome fields
ALTER TABLE "meetings" ADD COLUMN     "noShow" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "outcomeRecordedAt" TIMESTAMP(3),
ADD COLUMN     "outcomeSummary" TEXT,
ADD COLUMN     "rawNotes" TEXT,
ADD COLUMN     "sentimentTag" TEXT;

-- CreateTable: WeeklyDigest
CREATE TABLE "WeeklyDigest" (
    "id" TEXT NOT NULL,
    "weekStart" TIMESTAMP(3) NOT NULL,
    "weekEnd" TIMESTAMP(3) NOT NULL,
    "pipelineSnapshot" JSONB NOT NULL,
    "accountHighlights" JSONB NOT NULL,
    "weekAhead" JSONB NOT NULL,
    "renderedHtml" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeeklyDigest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "inbox_emails_threadId_idx" ON "inbox_emails"("threadId");

-- CreateIndex
CREATE INDEX "inbox_emails_snoozedUntil_idx" ON "inbox_emails"("snoozedUntil");

-- CreateIndex
CREATE INDEX "meetings_accountId_date_idx" ON "meetings"("accountId", "date" DESC);

-- CreateIndex
CREATE INDEX "WeeklyDigest_tenantId_weekStart_idx" ON "WeeklyDigest"("tenantId", "weekStart");

-- AddForeignKey
ALTER TABLE "WeeklyDigest" ADD CONSTRAINT "WeeklyDigest_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
