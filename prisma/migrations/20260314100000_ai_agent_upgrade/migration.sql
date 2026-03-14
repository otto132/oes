-- Migration: ai_agent_upgrade
-- Adds fields for AI agent upgrade (LinkedIn, sentiment, WinLoss)

-- AlterTable: Contact — add linkedinData and personalProfile
ALTER TABLE "contacts" ADD COLUMN "linkedinData" JSONB;
ALTER TABLE "contacts" ADD COLUMN "personalProfile" JSONB;

-- AlterTable: Account — add sentimentTrajectory
ALTER TABLE "accounts" ADD COLUMN "sentimentTrajectory" JSONB;

-- AlterTable: User — add linkedinConnections
ALTER TABLE "users" ADD COLUMN "linkedinConnections" JSONB;

-- CreateTable: WinLossAnalysis
CREATE TABLE "WinLossAnalysis" (
    "id" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "analysis" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WinLossAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WinLossAnalysis_opportunityId_idx" ON "WinLossAnalysis"("opportunityId");

-- AddForeignKey
ALTER TABLE "WinLossAnalysis" ADD CONSTRAINT "WinLossAnalysis_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "opportunities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
