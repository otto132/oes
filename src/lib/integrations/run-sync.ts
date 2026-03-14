// ═══════════════════════════════════════════════════════════════
// Shared Sync Runner
// ═══════════════════════════════════════════════════════════════
// Handles: user iteration, token refresh, error handling, SyncLog writes.
// Email and calendar sync pass their specific logic as syncFn.

import { db } from '@/lib/db';
import { refreshAccessToken } from './microsoft-graph';
import { decrypt, encrypt } from '@/lib/crypto';
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
      let accessToken = decrypt(tokenRow.accessToken);
      if (tokenRow.expiresAt < new Date()) {
        try {
          const refreshed = await refreshAccessToken(decrypt(tokenRow.refreshToken));
          accessToken = refreshed.access_token;
          await db.integrationToken.update({
            where: { id: tokenRow.id },
            data: {
              accessToken: encrypt(refreshed.access_token),
              refreshToken: encrypt(refreshed.refresh_token),
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

          // Create alert activity for the failure
          await createSyncFailureAlert(type, errorMsg, tokenRow.userId);
          continue;
        }
      }

      // Run the sync function for this user
      const result = await syncFn(tokenRow, accessToken);
      totalSynced += result.synced;
      allErrors.push(...result.errors);

      // Log sync result
      const status = result.errors.length === 0 ? 'success' : 'partial';
      await db.syncLog.create({
        data: {
          type,
          status,
          itemsSynced: result.synced,
          errors: result.errors,
          userId: tokenRow.userId,
          startedAt,
          completedAt: new Date(),
        },
      });

      // Create alert activity for partial failures
      if (status === 'partial') {
        const detail = result.errors.slice(0, 5).join('\n');
        await createSyncFailureAlert(
          type,
          detail,
          tokenRow.userId,
          `Sync partial: ${type} (${result.errors.length} error${result.errors.length === 1 ? '' : 's'})`,
        );
      }
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

      // Create alert activity for the failure
      await createSyncFailureAlert(type, errorMsg, tokenRow.userId);
    }
  }

  return { synced: totalSynced, errors: allErrors };
}

/** Create an in-app Activity alert for a sync failure or partial failure. */
async function createSyncFailureAlert(
  type: string,
  detail: string,
  userId: string,
  summary?: string,
): Promise<void> {
  try {
    await db.activity.create({
      data: {
        type: 'Note',
        summary: summary || `Sync failed: ${type}`,
        detail: detail.slice(0, 2000), // truncate to avoid oversized entries
        source: 'System Alert',
        authorId: userId,
      },
    });
  } catch {
    // Best-effort: don't let alert creation break the sync flow
    console.error(`Failed to create sync failure alert for user ${userId}`);
  }
}
