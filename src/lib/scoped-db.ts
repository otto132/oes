import { db } from '@/lib/db';

/**
 * Returns a Prisma client extension that auto-injects ownership
 * scoping into queries for owned models.
 *
 * ADMIN: no filter (sees all records)
 * MEMBER/VIEWER: sees records where ownerId = userId OR assigned
 */

export class AccessDeniedError extends Error {
  constructor(model: string) {
    super(`Access denied: ${model}`);
    this.name = 'AccessDeniedError';
  }
}

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
        async update({ args, query }) {
          const id = (args.where as { id?: string }).id;
          if (!id) throw new AccessDeniedError('account');
          const owned = await db.account.findFirst({
            where: { id, ownerId: userId },
            select: { id: true },
          });
          if (!owned) throw new AccessDeniedError('account');
          return query(args);
        },
        async delete({ args, query }) {
          const id = (args.where as { id?: string }).id;
          if (!id) throw new AccessDeniedError('account');
          const owned = await db.account.findFirst({
            where: { id, ownerId: userId },
            select: { id: true },
          });
          if (!owned) throw new AccessDeniedError('account');
          return query(args);
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
        async update({ args, query }) {
          const id = (args.where as { id?: string }).id;
          if (!id) throw new AccessDeniedError('lead');
          const owned = await db.lead.findFirst({
            where: { id, ownerId: userId },
            select: { id: true },
          });
          if (!owned) throw new AccessDeniedError('lead');
          return query(args);
        },
        async delete({ args, query }) {
          const id = (args.where as { id?: string }).id;
          if (!id) throw new AccessDeniedError('lead');
          const owned = await db.lead.findFirst({
            where: { id, ownerId: userId },
            select: { id: true },
          });
          if (!owned) throw new AccessDeniedError('lead');
          return query(args);
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
        async update({ args, query }) {
          const id = (args.where as { id?: string }).id;
          if (!id) throw new AccessDeniedError('opportunity');
          const owned = await db.opportunity.findFirst({
            where: { id, ownerId: userId },
            select: { id: true },
          });
          if (!owned) throw new AccessDeniedError('opportunity');
          return query(args);
        },
        async delete({ args, query }) {
          const id = (args.where as { id?: string }).id;
          if (!id) throw new AccessDeniedError('opportunity');
          const owned = await db.opportunity.findFirst({
            where: { id, ownerId: userId },
            select: { id: true },
          });
          if (!owned) throw new AccessDeniedError('opportunity');
          return query(args);
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
        async update({ args, query }) {
          const id = (args.where as { id?: string }).id;
          if (!id) throw new AccessDeniedError('task');
          const owned = await db.task.findFirst({
            where: {
              id,
              OR: [
                { ownerId: userId },
                { assignees: { some: { id: userId } } },
              ],
            },
            select: { id: true },
          });
          if (!owned) throw new AccessDeniedError('task');
          return query(args);
        },
        async delete({ args, query }) {
          const id = (args.where as { id?: string }).id;
          if (!id) throw new AccessDeniedError('task');
          const owned = await db.task.findFirst({
            where: {
              id,
              OR: [
                { ownerId: userId },
                { assignees: { some: { id: userId } } },
              ],
            },
            select: { id: true },
          });
          if (!owned) throw new AccessDeniedError('task');
          return query(args);
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
        async findUnique({ args }) {
          const id = args.where.id;
          return db.goal.findFirst({ ...args, where: { id, ownerId: userId } });
        },
        async update({ args, query }) {
          const id = (args.where as { id?: string }).id;
          if (!id) throw new AccessDeniedError('goal');
          const owned = await db.goal.findFirst({
            where: { id, ownerId: userId },
            select: { id: true },
          });
          if (!owned) throw new AccessDeniedError('goal');
          return query(args);
        },
        async delete({ args, query }) {
          const id = (args.where as { id?: string }).id;
          if (!id) throw new AccessDeniedError('goal');
          const owned = await db.goal.findFirst({
            where: { id, ownerId: userId },
            select: { id: true },
          });
          if (!owned) throw new AccessDeniedError('goal');
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
        async update({ args, query }) {
          const id = (args.where as { id?: string }).id;
          if (!id) throw new AccessDeniedError('meeting');
          const meeting = await db.meeting.findFirst({
            where: { id },
            select: { accountId: true },
          });
          if (!meeting) throw new AccessDeniedError('meeting');
          if (meeting.accountId) {
            const owned = await db.account.findFirst({
              where: { id: meeting.accountId, ownerId: userId },
              select: { id: true },
            });
            if (!owned) throw new AccessDeniedError('meeting');
          }
          return query(args);
        },
        async delete({ args, query }) {
          const id = (args.where as { id?: string }).id;
          if (!id) throw new AccessDeniedError('meeting');
          const meeting = await db.meeting.findFirst({
            where: { id },
            select: { accountId: true },
          });
          if (!meeting) throw new AccessDeniedError('meeting');
          if (meeting.accountId) {
            const owned = await db.account.findFirst({
              where: { id: meeting.accountId, ownerId: userId },
              select: { id: true },
            });
            if (!owned) throw new AccessDeniedError('meeting');
          }
          return query(args);
        },
      },
    },
  });
}

export type ScopedDb = ReturnType<typeof scopedDb>;
