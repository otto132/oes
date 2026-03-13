# A-07: Invite / Registration Flow

> **Status:** Proposed
> **Author:** (team)
> **Date:** 2026-03-13

---

## Decision

**Invite-only via admin.** There is no self-registration.

### Rationale

Eco-Insight is a B2B CRM tool used by internal sales teams. Open self-registration
is not appropriate because:

- Every user must be assigned a role (e.g. `rep`, `Commercial Director`, `CEO`)
  before they can meaningfully interact with the system.
- Team membership is managed by an admin, not by individuals signing themselves up.
- Microsoft Entra ID (Azure AD) SSO is already the sole authentication provider,
  scoped to a single tenant. Adding an invitation gate on top ensures only
  explicitly approved people gain access.

Domain restriction (e.g. allow only `@company.com` emails) is optional and can be
configured as an environment variable (`ALLOWED_EMAIL_DOMAIN`). When set, the system
rejects invitations to addresses outside that domain.

---

## Current State

| Aspect | Today |
|--------|-------|
| Auth provider | Microsoft Entra ID via NextAuth (`src/lib/auth.ts`) |
| Session strategy | JWT |
| Sign-in callback | Auto-upserts a `User` record for **any** authenticated Microsoft account with default role `"rep"` |
| User model | `id`, `name`, `initials`, `email`, `role`, `color`, `createdAt`, `updatedAt` (see `prisma/schema.prisma`) |
| Team UI | Settings page shows a hardcoded list of team members (`src/app/(dashboard)/settings/page.tsx`, line 28) |

The current `signIn` callback (`src/lib/auth.ts:29-41`) creates a user on first
login with no gating. This must be replaced with invitation-based access control.

---

## Flow

```
Admin                         System                        New User
  |                              |                              |
  |  1. Enter email + role       |                              |
  |  in Settings > Team          |                              |
  |----------------------------->|                              |
  |                              |  2. Create Invitation record |
  |                              |     (token, expiry, role)    |
  |                              |                              |
  |                              |  3. Send invite email        |
  |                              |     (or admin copies link)   |
  |                              |                              |
  |                              |                              |
  |                              |     4. Click invite link     |
  |                              |<-----------------------------|
  |                              |                              |
  |                              |  5. Redirect to MS SSO login |
  |                              |----------------------------->|
  |                              |                              |
  |                              |     6. SSO callback fires    |
  |                              |<-----------------------------|
  |                              |                              |
  |                              |  7. signIn callback:         |
  |                              |     a. Look up Invitation    |
  |                              |        by email              |
  |                              |     b. If valid: create User |
  |                              |        with invited role,    |
  |                              |        mark invitation       |
  |                              |        accepted              |
  |                              |     c. If no invitation:     |
  |                              |        reject login          |
  |                              |                              |
  |  8. New user appears in      |                              |
  |     Settings > Team list     |                              |
```

### Step Details

1. **Admin enters email** -- In the Settings page Team section, an "Invite member"
   form collects the new user's email address and role. Only users with an admin
   role can access this action.

2. **Invitation record created** -- The API creates an `Invitation` row with a
   unique token (e.g. `crypto.randomUUID()`), an expiry (default 7 days), and the
   specified role.

3. **Invite link sent** -- For a full implementation, the system sends an email via
   Microsoft Graph or a transactional email service. For MVP, the admin can copy
   the invite link from the UI and share it manually (Slack, email, etc.).

4. **User clicks link** -- The invite link (e.g. `/invite?token=<uuid>`) stores the
   token in a cookie or query parameter.

5. **Redirect to SSO** -- The invite page redirects to the NextAuth sign-in flow
   (`/api/auth/signin`), which sends the user to Microsoft Entra ID.

6. **SSO callback** -- Microsoft authenticates the user and redirects back to
   NextAuth.

7. **signIn callback logic** -- The existing auto-upsert is replaced:
   - Look up the user's email in the `User` table. If they already exist, allow
     sign-in (existing user).
   - If no `User` exists, look up a pending `Invitation` for that email.
   - If a valid (non-expired, pending) invitation exists: create the `User` with
     the role from the invitation, mark the invitation as `accepted`.
   - If no invitation exists: return `false` to reject the sign-in. NextAuth
     redirects to an error page with a "No invitation found" message.

8. **Team list updates** -- The Settings page Team section reads from
   `GET /api/settings/team` and now shows the newly created user.

---

## Schema Additions

### New model: `Invitation`

```prisma
enum InvitationStatus {
  pending
  accepted
  expired
  revoked
}

model Invitation {
  id          String           @id @default(cuid())
  email       String
  role        String           @default("rep")
  token       String           @unique @default(uuid())
  status      InvitationStatus @default(pending)
  expiresAt   DateTime
  createdAt   DateTime         @default(now())

  // Who sent the invitation
  invitedById String
  invitedBy   User             @relation("InvitationSender", fields: [invitedById], references: [id])

  @@index([email, status])
  @@index([token])
  @@map("invitations")
}
```

### User model changes

Add an `isActive` boolean to support deactivating users without deleting their
data (preserves ownership history on leads, accounts, etc.):

```prisma
model User {
  // ... existing fields ...
  isActive  Boolean  @default(true)

  // New relation
  sentInvitations Invitation[] @relation("InvitationSender")
}
```

The `signIn` callback should also check `isActive` and reject login for
deactivated users.

---

## API Endpoints

### `POST /api/settings/team/invite`

Create a new invitation. Admin-only.

**Request body:**
```json
{
  "email": "new.user@company.com",
  "role": "rep"
}
```

**Behavior:**
- Validate the caller has an admin role.
- If `ALLOWED_EMAIL_DOMAIN` is set, verify the email domain matches.
- Check that no active `User` with this email already exists.
- Check that no pending `Invitation` for this email already exists (or revoke the
  old one and create a new one).
- Create the `Invitation` record with a 7-day expiry.
- Return the invite link (containing the token).

**Response:** `201 Created`
```json
{
  "id": "clxyz...",
  "email": "new.user@company.com",
  "role": "rep",
  "inviteLink": "/invite?token=<uuid>",
  "expiresAt": "2026-03-20T12:00:00Z"
}
```

### `GET /api/settings/team`

List all team members and pending invitations. Admin-only.

**Response:** `200 OK`
```json
{
  "members": [
    {
      "id": "u1",
      "name": "Juuso Kari",
      "email": "juuso@company.com",
      "role": "Commercial Director",
      "isActive": true
    }
  ],
  "invitations": [
    {
      "id": "inv1",
      "email": "new.user@company.com",
      "role": "rep",
      "status": "pending",
      "expiresAt": "2026-03-20T12:00:00Z",
      "invitedBy": "Juuso Kari"
    }
  ]
}
```

### `PATCH /api/settings/team/:id`

Update a team member's role or active status. Admin-only.

**Request body (partial):**
```json
{
  "role": "admin",
  "isActive": false
}
```

**Behavior:**
- Validate the caller has an admin role.
- Prevent deactivating the last admin.
- Update the `User` record.

**Response:** `200 OK` with the updated user object.

### `DELETE /api/settings/team/invite/:id`

Revoke a pending invitation. Admin-only.

**Behavior:**
- Set the invitation status to `revoked`.

**Response:** `200 OK`

---

## Auth Callback Changes

The `signIn` callback in `src/lib/auth.ts` needs to be updated from the current
auto-upsert pattern to the invitation-gated pattern. Pseudocode:

```ts
async signIn({ user }) {
  if (!user.email) return false;

  // Existing user? Allow if active.
  const existing = await db.user.findUnique({ where: { email: user.email } });
  if (existing) {
    return existing.isActive; // reject deactivated users
  }

  // New user: check for valid invitation.
  const invitation = await db.invitation.findFirst({
    where: {
      email: user.email,
      status: 'pending',
      expiresAt: { gt: new Date() },
    },
  });

  if (!invitation) return false; // no invitation — reject

  // Create user from invitation.
  await db.user.create({
    data: {
      email: user.email,
      name: user.name || user.email,
      initials: deriveInitials(user.name || user.email),
      role: invitation.role,
    },
  });

  // Mark invitation as accepted.
  await db.invitation.update({
    where: { id: invitation.id },
    data: { status: 'accepted' },
  });

  return true;
}
```

---

## UI Changes (Settings Page)

The Team section in `src/app/(dashboard)/settings/page.tsx` currently uses a
hardcoded user list (line 28). It needs:

1. **Data fetching** -- Replace the hardcoded array with a call to
   `GET /api/settings/team`.
2. **Invite button** -- Add an "Invite member" button that opens a form (inline or
   drawer) with email and role fields.
3. **Pending invitations** -- Show pending invitations below the team list with a
   "Revoke" action and a "Copy link" button.
4. **Role editing** -- Allow admins to change a member's role via inline select or
   drawer.
5. **Deactivation** -- Allow admins to deactivate a member (with confirmation).

---

## Security Considerations

- Invitation tokens are single-use UUIDs. Once accepted, the token cannot be
  reused.
- Invitations expire after 7 days by default. A cron job or on-access check marks
  expired invitations.
- Only admin-role users can create invitations, change roles, or deactivate
  members.
- The `signIn` callback is the enforcement point: even if someone has a valid
  Microsoft account for the tenant, they cannot access the app without an
  invitation.
- Deactivated users are rejected at sign-in time, not just hidden from the UI.

---

## MVP Scope vs Full Implementation

| Feature | MVP | Full |
|---------|-----|------|
| Invite creation | Admin creates via Settings UI | Same |
| Invite delivery | Admin copies link manually | Automated email via MS Graph |
| Domain restriction | Environment variable check | Configurable in UI |
| Token expiry | 7-day fixed | Configurable |
| Invitation revocation | API only | UI button |
| Role management | Hardcoded role strings | Role enum in schema |
| Audit log | None | Log invitation events |

---

## Open Questions

1. **Role taxonomy** -- The current `User.role` field is a free-form string. Should
   we introduce a `Role` enum (`admin`, `rep`, `viewer`) in the schema?
2. **Multi-tenant** -- If the product ever supports multiple organizations, the
   invitation model will need an `organizationId`. Not needed now.
3. **Bulk invite** -- Should the MVP support CSV upload of multiple emails? Likely
   not needed for a small team.
