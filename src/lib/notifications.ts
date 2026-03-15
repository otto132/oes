import type { PrismaClient, NotificationType, Notification } from '@prisma/client';
import { publishToUser } from '@/lib/notifications-pubsub';

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

  const notification = await db.notification.create({
    data: {
      userId: params.userId,
      actorId: params.actorId,
      type: params.type,
      title: params.title,
      message: params.message,
      entityType: params.entityType,
      entityId: params.entityId,
    },
    include: {
      actor: { select: { id: true, name: true, initials: true, color: true } },
    },
  });

  // Push to SSE-connected clients (fire-and-forget, never blocks)
  try {
    publishToUser(params.userId, 'notification', {
      id: notification.id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      entityType: notification.entityType,
      entityId: notification.entityId,
      readAt: null,
      createdAt: notification.createdAt.toISOString(),
      actor: notification.actor
        ? { id: notification.actor.id, name: notification.actor.name, initials: notification.actor.initials, color: notification.actor.color }
        : null,
    });
  } catch {
    // Never block notification creation
  }

  return notification;
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
  await Promise.allSettled(
    targets.map((userId) =>
      createNotification(db, { ...params, userId, actorId }),
    ),
  );
}
