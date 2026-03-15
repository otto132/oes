import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const DEFAULT_ROLES = [
  { label: 'Champion', sortOrder: 1, isDefault: true },
  { label: 'Economic Buyer', sortOrder: 2, isDefault: true },
  { label: 'Technical Buyer', sortOrder: 3, isDefault: true },
  { label: 'Influencer', sortOrder: 4, isDefault: true },
  { label: 'Blocker', sortOrder: 5, isDefault: true },
  { label: 'End User', sortOrder: 6 },
  { label: 'Executive Sponsor', sortOrder: 7 },
  { label: 'Gatekeeper', sortOrder: 8 },
  { label: 'Procurement', sortOrder: 9 },
  { label: 'Legal', sortOrder: 10 },
  { label: 'Operations', sortOrder: 11 },
  { label: 'Project Manager', sortOrder: 12 },
  { label: 'Decision Maker', sortOrder: 13 },
  { label: 'Evaluator', sortOrder: 14 },
  { label: 'Coach', sortOrder: 15 },
];
async function main() {
  for (const role of DEFAULT_ROLES) {
    await prisma.contactRoleOption.upsert({
      where: { label: role.label },
      update: {},
      create: role,
    });
  }
  console.log(`Seeded ${DEFAULT_ROLES.length} contact roles`);
}
main().finally(() => prisma.$disconnect());
