import { db } from '@/lib/db';

/**
 * Returns a Prisma client extension that auto-injects ownership
 * scoping into queries for owned models.
 *
 * ADMIN: no filter (sees all records)
 * MEMBER/VIEWER: sees records where ownerId = userId OR assigned
 */
export function scopedDb(userId: string, role: string) {
  if (role === 'ADMIN') {
    return db;
  }

  return db.$extends({
    query: {
      account: {
        async findMany({ args, query }) {
          args.where = { ...args.where, ownerId: userId };
          return query(args);
        },
        async findFirst({ args, query }) {
          args.where = { ...args.where, ownerId: userId };
          return query(args);
        },
        async findUnique({ args }) {
          const id = args.where.id;
          return db.account.findFirst({ ...args, where: { id, ownerId: userId } });
        },
      },
      lead: {
        async findMany({ args, query }) {
          args.where = { ...args.where, ownerId: userId };
          return query(args);
        },
        async findFirst({ args, query }) {
          args.where = { ...args.where, ownerId: userId };
          return query(args);
        },
        async findUnique({ args }) {
          const id = args.where.id;
          return db.lead.findFirst({ ...args, where: { id, ownerId: userId } });
        },
      },
      opportunity: {
        async findMany({ args, query }) {
          args.where = { ...args.where, ownerId: userId };
          return query(args);
        },
        async findFirst({ args, query }) {
          args.where = { ...args.where, ownerId: userId };
          return query(args);
        },
        async findUnique({ args }) {
          const id = args.where.id;
          return db.opportunity.findFirst({ ...args, where: { id, ownerId: userId } });
        },
      },
      task: {
        async findMany({ args, query }) {
          args.where = {
            ...args.where,
            OR: [
              { ownerId: userId },
              { assignees: { some: { id: userId } } },
            ],
          };
          return query(args);
        },
        async findFirst({ args, query }) {
          args.where = {
            ...args.where,
            OR: [
              { ownerId: userId },
              { assignees: { some: { id: userId } } },
            ],
          };
          return query(args);
        },
        async findUnique({ args }) {
          const id = args.where.id;
          return db.task.findFirst({
            ...args,
            where: {
              id,
              OR: [
                { ownerId: userId },
                { assignees: { some: { id: userId } } },
              ],
            },
          });
        },
      },
      goal: {
        async findMany({ args, query }) {
          args.where = { ...args.where, ownerId: userId };
          return query(args);
        },
        async findFirst({ args, query }) {
          args.where = { ...args.where, ownerId: userId };
          return query(args);
        },
      },
      meeting: {
        async findMany({ args, query }) {
          const ownedAccounts = await db.account.findMany({
            where: { ownerId: userId },
            select: { id: true },
          });
          const ownedIds = ownedAccounts.map((a) => a.id);
          args.where = {
            ...args.where,
            OR: [
              { accountId: { in: ownedIds } },
              { accountId: null },
            ],
          };
          return query(args);
        },
      },
    },
  });
}

export type ScopedDb = ReturnType<typeof scopedDb>;
