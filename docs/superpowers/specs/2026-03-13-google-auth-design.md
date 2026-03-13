# Add Google Login + Dev Open Signup

## Problem

The app only supports Microsoft Entra ID for authentication, which requires Azure AD credentials the developer doesn't have yet. We need Google login as a second provider and a dev mode that lets new users sign in without an invitation.

## Design

### 1. Auth Config (`src/lib/auth.ts`)

**Build providers array conditionally.** Currently `auth.ts` reads `process.env.AZURE_AD_*` with `!` non-null assertions. Change to: build a `providers` array, only adding Microsoft Entra when all three Azure vars are present, only adding Google when both Google vars are present.

**Add Google provider** using `next-auth/providers/google` with `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

**Import from `env.ts`** instead of reading `process.env` directly. Use `env.GOOGLE_CLIENT_ID`, `env.AZURE_AD_CLIENT_ID`, etc. and `availableProviders()` for conditional provider setup.

**Modify `signIn` callback** to support open signup:
- Existing users: no change (allow if `isActive`, update name)
- New users with valid invitation: no change (create with invitation role)
- New users without invitation AND `ALLOW_OPEN_SIGNUP=true`: auto-create as MEMBER (Prisma defaults handle `color` and `role`), explicitly generate and pass `initials` (required field with no schema default)
- New users without invitation AND `ALLOW_OPEN_SIGNUP` is falsy: reject (current behavior)

The open signup path is a single `db.user.create()`. Catch Prisma P2002 (unique constraint violation) and return `true` to handle race conditions gracefully — the concurrent request that lost the race just logs in as the now-existing user.

**Multi-provider same-email behavior**: A user who signed up via Microsoft can later sign in via Google (and vice versa) if they use the same email. This is intentional — we identify users by email, not by provider. The invitation path's non-atomic create+update is a pre-existing issue and out of scope for this change.

### 2. Environment (`src/lib/env.ts`)

**Make Azure AD vars optional** — move from `collectRequired()` to `getOptionalEnv()`. Since these change from `string` to `string | undefined`, update the exported `env` object types accordingly. The only consumer of these values is `auth.ts`, which will now check for their presence before using them.

**Add new optional vars:**
- `GOOGLE_CLIENT_ID` — Google OAuth client ID
- `GOOGLE_CLIENT_SECRET` — Google OAuth client secret
- `ALLOW_OPEN_SIGNUP` — when `"true"`, skip invitation check for new users

**Export a helper** `availableProviders()` that returns `{ google: boolean, microsoft: boolean }` based on which env vars are set. Used by both `auth.ts` and the login page.

**Startup validation**: Keep `DATABASE_URL`, `NEXTAUTH_SECRET`, and `NEXTAUTH_URL` as required. No check that at least one provider is configured — a login page with zero buttons is an obvious signal, not a crash.

### 3. Login Page (`src/app/login/page.tsx`)

Import `availableProviders()` from `env.ts` to determine which buttons to show:
- Google button: shown when `google` is true
- Microsoft button: shown when `microsoft` is true

Each button is a form with a server action calling `signIn("<provider-id>", { redirectTo })`.

### 4. Environment Files

**`.env.local`** — add:
```
GOOGLE_CLIENT_ID="<from Google Cloud Console>"
GOOGLE_CLIENT_SECRET="<from Google Cloud Console>"
ALLOW_OPEN_SIGNUP="true"
```

**`.env.example`** — add Google section with setup instructions, add `ALLOW_OPEN_SIGNUP` with a clear warning: "Set to true ONLY in development. In production, use the invitation system to control access."

### 5. Files Changed

| File | Change |
|------|--------|
| `src/lib/auth.ts` | Conditional providers array, remove `!` assertions, open signup in signIn callback |
| `src/lib/env.ts` | Azure AD vars become optional, add Google + ALLOW_OPEN_SIGNUP, export `availableProviders()` |
| `src/app/login/page.tsx` | Show multiple provider buttons conditionally via `availableProviders()` |
| `.env.local` | Add Google credentials + ALLOW_OPEN_SIGNUP |
| `.env.example` | Document new vars with security warnings |

### 6. What Does NOT Change

- Middleware (`src/middleware.ts`) — auth checks are provider-agnostic
- Prisma schema — User model works for any provider
- Session/JWT callbacks — enrich token by email lookup, provider-independent
- Type definitions (`src/types/next-auth.d.ts`) — no new fields needed
- API routes — all use session, not provider-specific logic

### 7. Google Cloud Console Setup

User must:
1. Go to https://console.cloud.google.com → APIs & Services → Credentials
2. Create OAuth 2.0 Client ID (Web application)
3. Add authorized redirect URI: `http://localhost:3000/api/auth/callback/google`
4. Copy client ID and secret to `.env.local`

For production: add the production URL as an additional redirect URI.

### 8. Security Considerations

- `ALLOW_OPEN_SIGNUP` should only be `true` in development. Production should use the invitation system. `.env.example` will carry a prominent warning.
- No domain restriction on open signup — any Google/Microsoft account can sign in when enabled. This is intentional for dev; production relies on invitation-only flow.
- Google provider uses PKCE by default in NextAuth v5.
- No changes to CSRF protection or cookie configuration.
- `NEXTAUTH_SECRET` is auto-detected by NextAuth v5 from the environment. No mapping needed.
