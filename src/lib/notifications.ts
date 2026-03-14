import type { PrismaClient, NotificationType, Notification } from '@prisma/client';

interface CreateNotificationParams {
  userId: string;
  actorId?: string;
  type: NotificationType;
  title: string;
  message: string;
  entityType?: string;
  entityId?: string;
}

/**
 * Create a notification for a user with dedup.
 * Returns null if an unread notification for the same entity+type+user already exists.
 */
export async function createNotification(
  db: PrismaClient,
  params: CreateNotificationParams,
): Promise<Notification | null> {
  // Dedup: skip if unread notification exists for same user+entity+type
  if (params.entityType && params.entityId) {
    const existing = await db.notification.findFirst({
      where: {
        userId: params.userId,
        type: params.type,
        entityType: params.entityType,
        entityId: params.entityId,
        readAt: null,
      },
    });
    if (existing) return null;
  }

  return db.notification.create({
    data: {
      userId: params.userId,
      actorId: params.actorId,
      type: params.type,
      title: params.title,
      message: params.message,
      entityType: params.entityType,
      entityId: params.entityId,
    },
  });
}

/**
 * Create notifications for multiple users (e.g., all admins).
 * Skips the actor (no self-notifications).
 */
export async function notifyUsers(
  db: PrismaClient,
  userIds: string[],
  actorId: string | undefined,
  params: Omit<CreateNotificationParams, 'userId' | 'actorId'>,
): Promise<void> {
  const targets = actorId ? userIds.filter((id) => id !== actorId) : userIds;
  await Promise.all(
    targets.map((userId) =>
      createNotification(db, { ...params, userId, actorId }),
    ),
  );
}
