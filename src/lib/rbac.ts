/**
 * Role-Based Access Control (RBAC) helpers.
 *
 * Roles (from prisma Role enum):
 *   ADMIN  - full access (all CRUD + settings + user management)
 *   MEMBER - read all, create/update/approve/reject (no settings or user management)
 *   VIEWER - read-only (GET requests only, no mutations)
 */

import { forbidden } from '@/lib/api-errors';

export type Role = 'ADMIN' | 'MEMBER' | 'VIEWER';

/** Roles that are allowed to perform data mutations (POST/PATCH/DELETE). */
const MUTABLE_ROLES: ReadonlySet<Role> = new Set<Role>(['ADMIN', 'MEMBER']);

/** Roles that have admin-level access (settings, user management, manual sync). */
const ADMIN_ROLES: ReadonlySet<Role> = new Set<Role>(['ADMIN']);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns true if the given role may perform data mutations. */
export function canMutate(role: string | undefined): boolean {
  return MUTABLE_ROLES.has(role as Role);
}

/** Returns true if the given role has admin-level access. */
export function isAdmin(role: string | undefined): boolean {
  return ADMIN_ROLES.has(role as Role);
}

/**
 * Guard to be used inside route handlers or the `withHandler` wrapper.
 *
 * Throws a 403 JSON response if the session user's role is not in
 * `allowedRoles`.
 *
 * @example
 *   const denied = requireRole(session, 'ADMIN');
 *   if (denied) return denied;
 */
export function requireRole(
  session: { user: { role?: string } } | null | undefined,
  ...allowedRoles: Role[]
) {
  const role = session?.user?.role as Role | undefined;
  if (!role || !allowedRoles.includes(role)) {
    return forbidden('Insufficient permissions');
  }
  return null;
}
