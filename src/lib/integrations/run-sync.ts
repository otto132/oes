// ═══════════════════════════════════════════════════════════════
// Shared Sync Runner
// ═══════════════════════════════════════════════════════════════
// Handles: user iteration, token refresh, error handling, SyncLog writes.
// Email and calendar sync pass their specific logic as syncFn.

import { db } from '@/lib/db';
import { refreshAccessToken } from './microsoft-graph';
import type { IntegrationToken, User } from '@prisma/client';

export interface SyncResult {
  synced: number;
  errors: string[];
}

interface RunSyncOptions {
  type: 'email' | 'calendar';
  syncFn: (token: IntegrationToken & { user: User }, accessToken: string) => Promise<SyncResult>;
}

export async function runSync({ type, syncFn }: RunSyncOptions): Promise<SyncResult> {
  const tokens = await db.integrationToken.findMany({
    where: { provider: 'microsoft', status: 'active', user: { isActive: true } },
    include: { user: true },
  });

  if (tokens.length === 0) {
    return { synced: 0, errors: ['No active Microsoft tokens found — users need to connect Outlook'] };
  }

  let totalSynced = 0;
  const allErrors: string[] = [];

  for (const tokenRow of tokens) {
    const startedAt = new Date();

    try {
      // Refresh token if expired
      let accessToken = tokenRow.accessToken;
      if (tokenRow.expiresAt < new Date()) {
        try {
          const refreshed = await refreshAccessToken(tokenRow.refreshToken);
          accessToken = refreshed.access_token;
          await db.integrationToken.update({
            where: { id: tokenRow.id },
            data: {
              accessToken: refreshed.access_token,
              refreshToken: refreshed.refresh_token,
              expiresAt: new Date(Date.now() + refreshed.expires_in * 1000),
              status: 'active',
            },
          });
        } catch (err) {
          // Mark token as error so Settings shows "Reconnect"
          await db.integrationToken.update({
            where: { id: tokenRow.id },
            data: { status: 'error' },
          });
          const errorMsg = `Token refresh failed for ${tokenRow.userEmail} — reconnect Outlook`;
          allErrors.push(errorMsg);

          // Log failed sync
          await db.syncLog.create({
            data: {
              type,
              status: 'failed',
              itemsSynced: 0,
              errors: [errorMsg],
              userId: tokenRow.userId,
              startedAt,
              completedAt: new Date(),
            },
          });
          continue;
        }
      }

      // Run the sync function for this user
      const result = await syncFn(tokenRow, accessToken);
      totalSynced += result.synced;
      allErrors.push(...result.errors);

      // Log sync result
      await db.syncLog.create({
        data: {
          type,
          status: result.errors.length === 0 ? 'success' : 'partial',
          itemsSynced: result.synced,
          errors: result.errors,
          userId: tokenRow.userId,
          startedAt,
          completedAt: new Date(),
        },
      });
    } catch (err) {
      const errorMsg = `Sync failed for user ${tokenRow.userEmail}: ${err}`;
      allErrors.push(errorMsg);

      await db.syncLog.create({
        data: {
          type,
          status: 'failed',
          itemsSynced: 0,
          errors: [errorMsg],
          userId: tokenRow.userId,
          startedAt,
          completedAt: new Date(),
        },
      });
    }
  }

  return { synced: totalSynced, errors: allErrors };
}
