# Epic 5: User Management / Roles / Permissions — Design Spec

> Date: 2026-03-13
> Status: Approved
> Scope: U-03 through U-07

---

## Overview

Epic 5 completes the user management layer for Eco-Insight. Roles (U-01) and RBAC middleware (U-02) are already implemented. This spec covers the remaining five items: admin team management UI, approval authority rules, profile settings, per-user integration tokens, and account ownership.

## Prerequisites (Already Done)

- **U-01**: Role enum (`ADMIN`, `MEMBER`, `VIEWER`) in Prisma schema
- **U-02**: RBAC middleware in `src/middleware.ts` + `requireRole()` in `src/lib/rbac.ts`
- **A-08**: Invite flow backend (invitation model, invite API, sign-in callback provisioning)
- Team management API routes: `GET /api/settings/team`, `POST /api/settings/team/invite`, `PATCH /api/settings/team/[id]`

---

## U-03: Admin Team Management Page

### Problem

The Settings page shows a hardcoded 3-user list. The backend APIs exist but the UI is not wired.

### Settings Page Reorganization

The Settings page currently renders team, agents, and integrations in a single component. With real data and interactive forms, this needs sub-navigation.

**Tab structure:**
- **Team** — team list, invite form, pending invitations (admin-only content, visible to all but actions gated)
- **Integrations** — per-user Outlook connection status and controls
- **Agents** — agent configuration and status
- **Profile** — current user's profile settings (U-05)

All tabs live under `/settings` using client-side tab state (no separate routes).

### Team List

- Fetch from `GET /api/settings/team` using React Query
- Table columns: name, email, role, status (active/inactive), last active, actions
- **Admin view**: role dropdown (ADMIN/MEMBER/VIEWER), deactivate/reactivate toggle
- **Non-admin view**: read-only list (no dropdowns, no action buttons)
- Role change triggers confirmation dialog before calling `PATCH /api/settings/team/[id]`
- Self-demotion disabled (dropdown disabled on own row)
- Last-admin removal disabled (API enforces, UI disables the option)
- Deactivation is clearly labeled as reversible — "Deactivate" button, with "Reactivate" shown for inactive users

### Invite Section (Admin Only)

- "Invite Member" button opens a drawer
- Drawer fields: email (text input), role (select, default MEMBER)
- Submit calls `POST /api/settings/team/invite`
- On success: displays invite link in a copyable field + success toast
- No email sending — admin copies and shares the link manually

### Pending Invitations List

- Displayed below the team list (admin only)
- Shows: email, invited role, expiry ("expires in X days"), revoke button
- Requires new `GET /api/settings/team/invitations` endpoint
- Revoke button requires new `PATCH /api/settings/team/invite/[id]` endpoint (sets status to REVOKED)

### New API Endpoints

**`GET /api/settings/team/invitations`**
- Admin only
- Returns pending invitations: id, email, role, expiresAt, createdAt
- Filter: `status = 'PENDING'` and `expiresAt > now()`

**`PATCH /api/settings/team/invite/[id]`**
- Admin only
- Accepts: `{ status: 'REVOKED' }`
- Validates invitation exists and is PENDING
- Returns updated invitation

---

## U-04: Approval Authority Rules

### Decision

Keep current behavior: any `MEMBER` or `ADMIN` can approve/reject any queue item. `VIEWER` cannot mutate (enforced by middleware).

### Implementation

No code changes required. The middleware already blocks VIEWER from POST/PATCH/DELETE. Document this as intentional policy with a comment in `src/app/api/queue/route.ts`.

---

## U-05: Profile Settings Page

### Problem

Users cannot update their display name, initials, or notification preferences. No profile API exists.

### Schema Changes

Add to `User` model in `prisma/schema.prisma`:
```prisma
notificationPrefs Json?    // Default: { emailAlerts: true, queueAlerts: true }
lastLoginAt       DateTime?
```

`lastLoginAt` is updated in the NextAuth `signIn` callback on each successful login.

### Profile Tab UI

- Accessible to all roles (not admin-only)
- Fetches current user data from `GET /api/settings/profile`

**Editable fields:**
- Display name (text input)
- Initials (text input, max 3 characters)
- Notification preferences:
  - Email alerts toggle — notify on new queue items
  - Queue alerts toggle — notify on items needing review

**Read-only fields (displayed but not editable):**
- Email (from SSO)
- Role (admin-controlled)

**Note:** Notification preferences are stored but not acted on yet. No notification system exists (that's C-04 in Epic 16). The UI captures preferences for future use.

### API Endpoints

**`GET /api/settings/profile`**
- Any authenticated user
- Returns: id, name, email, initials, role, notificationPrefs, lastLoginAt

**`PATCH /api/settings/profile`**
- Any authenticated user
- Accepts: `{ name?, initials?, notificationPrefs? }`
- Zod validation: name (1-100 chars), initials (1-3 chars), notificationPrefs (object with boolean fields)
- Users can only update their own profile (userId from session)

---

## U-06: Per-User Integration Tokens

### Problem

`IntegrationToken` is keyed by email, not User ID. `findFirst({ where: { provider: 'microsoft' } })` grabs a single global token. Multi-user teams cannot each connect their own Outlook.

### Schema Changes

Update `IntegrationToken` in `prisma/schema.prisma`:
```prisma
model IntegrationToken {
  id           String   @id @default(cuid())
  provider     String
  accessToken  String   @db.Text
  refreshToken String   @db.Text
  expiresAt    DateTime
  userEmail    String
  userId       String
  user         User     @relation(fields: [userId], references: [id])
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@unique([provider, userId])
  @@map("integration_tokens")
}
```

Key changes:
- Add `userId` FK to `User`
- Change unique constraint from `[provider, userEmail]` to `[provider, userId]`
- Keep `userEmail` as a non-unique display field

Add relation to `User` model:
```prisma
integrationTokens IntegrationToken[]
```

### Migration Strategy

- Migration adds `userId` column (nullable initially)
- Backfill: match existing tokens to users by email
- Make `userId` non-nullable after backfill
- Update unique constraint

### OAuth Callback Update (`/api/auth/callback/route.ts`)

- Require active session (user must be logged in)
- Link token to `session.user.id`
- Upsert keyed on `[provider, userId]`

### Sync Job Updates (`email-sync.ts`, `calendar-sync.ts`)

- Query: `findMany({ where: { provider: 'microsoft' }, include: { user: true } })`
- Loop over each connected user's token
- Per-user: refresh if expired, fetch emails/events, store records
- If one user's token fails, log error and continue to next user
- Skip tokens for inactive users (`user.isActive = false`)

### Settings Integrations Tab (Per-User)

- Every user sees their own Outlook connection status
- Not connected: "Connect Outlook" button initiates OAuth flow
- Connected: shows connected email, last sync time, "Disconnect" button
- "Disconnect" deletes the user's token
- Admins see an additional summary: "X of Y team members connected"

---

## U-07: Account Ownership & Assignment

### Problem

Accounts have `ownerId` in the schema but ownership is not surfaced in the UI and there's no way to reassign or filter by owner.

### Design Decision

Ownership is informational only — no access restrictions. All authenticated non-VIEWER users can view and edit any account.

### Accounts List Page

- Add "My Accounts" / "All Accounts" toggle filter
- "My Accounts" filters `ownerId = session.user.id`
- API: add `?owner=me` query param to `GET /api/accounts`

### Account Detail Page

- Show owner name/initials badge
- Admin sees "Reassign Owner" dropdown (lists active team members)
- Non-admin sees owner as read-only
- Reassignment calls `PATCH /api/accounts/:id` with `{ ownerId: newUserId }`

### API Changes

**`PATCH /api/accounts/:id`** (new — API-04)
- Any authenticated MEMBER or ADMIN
- Accepts partial account fields including `ownerId`
- Zod validated
- Returns updated account

### Scope Limitation

This Epic scopes ownership UI to accounts only. Leads, opportunities, and tasks can follow the same pattern in a future iteration.

---

## Schema Change Summary

All Prisma schema changes in one place:

1. **User model** — add `notificationPrefs Json?`, `lastLoginAt DateTime?`, `integrationTokens IntegrationToken[]`
2. **IntegrationToken model** — add `userId String` FK, change unique constraint to `[provider, userId]`, add `user` relation
3. **Single migration** covering all changes

---

## New API Endpoints Summary

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/settings/team/invitations` | Admin | List pending invitations |
| PATCH | `/api/settings/team/invite/[id]` | Admin | Revoke invitation |
| GET | `/api/settings/profile` | Any | Get current user profile |
| PATCH | `/api/settings/profile` | Any | Update name, initials, prefs |
| PATCH | `/api/accounts/[id]` | Member+ | Update account fields |

---

## Testing Strategy

- **Unit tests**: Zod schemas for new endpoints, notification prefs defaults
- **Integration tests**: invite revocation, profile update, token linking, account ownership reassignment
- **E2E**: admin invites user flow (if feasible without real SSO)
- **Manual verification**: OAuth connect/disconnect, sync with multiple tokens
