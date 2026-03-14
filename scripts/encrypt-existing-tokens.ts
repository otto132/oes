import { PrismaClient } from '@prisma/client';
import { encrypt } from '../src/lib/crypto';

const db = new PrismaClient();

async function main() {
  const tokens = await db.integrationToken.findMany();
  let encrypted = 0;
  let skipped = 0;

  for (const token of tokens) {
    if (token.accessToken.startsWith('v1:')) {
      skipped++;
      continue;
    }

    await db.integrationToken.update({
      where: { id: token.id },
      data: {
        accessToken: encrypt(token.accessToken),
        refreshToken: encrypt(token.refreshToken),
        tokenVersion: 1,
      },
    });
    encrypted++;
  }

  console.log(`Encrypted ${encrypted} tokens, skipped ${skipped} (already encrypted)`);
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect());
