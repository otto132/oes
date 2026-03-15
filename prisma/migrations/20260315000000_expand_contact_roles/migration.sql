-- Convert Contact.role from enum to TEXT
ALTER TABLE "Contact" ADD COLUMN "roleStr" TEXT;
UPDATE "Contact" SET "roleStr" = "role"::text;
ALTER TABLE "Contact" DROP COLUMN "role";
ALTER TABLE "Contact" RENAME COLUMN "roleStr" TO "role";
ALTER TABLE "Contact" ALTER COLUMN "role" SET DEFAULT 'Champion';
ALTER TABLE "Contact" ALTER COLUMN "role" SET NOT NULL;
DROP TYPE IF EXISTS "ContactRole";

-- Create ContactRoleOption table
CREATE TABLE "ContactRoleOption" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ContactRoleOption_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContactRoleOption_label_key" ON "ContactRoleOption"("label");
