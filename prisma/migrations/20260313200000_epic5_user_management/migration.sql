-- Add nullable userId column
ALTER TABLE "integration_tokens" ADD COLUMN "userId" TEXT;

-- Backfill from user email
UPDATE "integration_tokens" SET "userId" = u."id"
FROM "users" u WHERE "integration_tokens"."userEmail" = u."email";

-- Delete orphaned tokens (no matching user)
DELETE FROM "integration_tokens" WHERE "userId" IS NULL;

-- Make non-nullable
ALTER TABLE "integration_tokens" ALTER COLUMN "userId" SET NOT NULL;

-- Drop old unique constraint
ALTER TABLE "integration_tokens" DROP CONSTRAINT IF EXISTS "integration_tokens_provider_userEmail_key";

-- Add new unique constraint
ALTER TABLE "integration_tokens" ADD CONSTRAINT "integration_tokens_provider_userId_key" UNIQUE ("provider", "userId");

-- Add foreign key
ALTER TABLE "integration_tokens" ADD CONSTRAINT "integration_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Add User fields
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "notificationPrefs" JSONB;
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMP(3);
