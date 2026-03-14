import { db } from '@/lib/db';
import type { PrismaClient } from '@prisma/client';

/**
 * Returns a Prisma client scoped to the user's tenant.
 * Today: returns the shared client (single DB).
 * Future: looks up tenant's dbConnectionString, returns a pooled client for that DB.
 */
export function resolveTenantDb(_session: { user: { tenantId: string } }): PrismaClient {
  return db;
}

/**
 * Extracts tenantId from session. Throws if missing.
 */
export function requireTenantId(session: { user: { tenantId?: string } }): string {
  if (!session.user.tenantId) {
    throw new Error('Session missing tenantId');
  }
  return session.user.tenantId;
}
