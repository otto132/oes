# Auth System Design (A-01 through A-04)

## Overview

Implement user authentication for Eco Insight using NextAuth v5 (Auth.js) with Microsoft Entra ID (Azure AD) as the sole identity provider. This covers four backlog items:

- **A-01**: NextAuth with Microsoft Entra provider
- **A-02**: Auth middleware on all API routes
- **A-03**: Replace hardcoded `'u1'` with session userId
- **A-04**: Login page + redirect flow

## Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Auth library | NextAuth v5 (Auth.js) | App Router native, active development |
| Session strategy | JWT | No extra DB tables, avoids `Account` naming conflict with CRM model |
| Identity provider | Microsoft Entra ID (Azure AD) | Enterprise SSO, matches existing Microsoft Graph integration |
| New user handling | Auto-create on first login | Simplest path; upsert User by email |
| Auth methods | Microsoft SSO only | No email/password fallback |

## Architecture

### A-01: Auth Core

**New files:**
- `src/lib/auth.ts` — NextAuth v5 configuration
- `src/app/api/auth/[...nextauth]/route.ts` — Route handler (GET + POST)

**`src/lib/auth.ts` config:**

```typescript
import NextAuth from "next-auth"
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id"
import { db } from "@/lib/db"

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    MicrosoftEntraID({
      clientId: process.env.AZURE_AD_CLIENT_ID!,
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
      issuer: `https://login.microsoftonline.com/${process.env.AZURE_AD_TENANT_ID!}/v2.0`,
    }),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  callbacks: {
    async signIn({ user }) {
      // Upsert user in Prisma
      await db.user.upsert({
        where: { email: user.email! },
        update: { name: user.name! },
        create: {
          email: user.email!,
          name: user.name!,
          initials: deriveInitials(user.name!),
          role: "rep",
        },
      })
      return true
    },
    async jwt({ token, user }) {
      if (user?.email) {
        const dbUser = await db.user.findUnique({ where: { email: user.email } })
        if (dbUser) {
          token.userId = dbUser.id
          token.role = dbUser.role
        }
      }
      return token
    },
    async session({ session, token }) {
      session.user.id = token.userId as string
      session.user.role = token.role as string
      return session
    },
  },
})

function deriveInitials(name: string): string {
  const parts = name.trim().split(/\s+/)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}
```

**`src/app/api/auth/[...nextauth]/route.ts`:**

```typescript
import { handlers } from "@/lib/auth"
export const { GET, POST } = handlers
```

**Note:** The existing `/api/auth/connect` and `/api/auth/callback` routes for Microsoft Graph (Outlook integration) remain unchanged. They are separate from the NextAuth auth flow.

**Environment variables (added to `.env.example`):**
- `AZURE_AD_CLIENT_ID` — Azure app registration client ID
- `AZURE_AD_CLIENT_SECRET` — Azure app registration client secret
- `AZURE_AD_TENANT_ID` — Azure AD tenant ID
- `NEXTAUTH_SECRET` — Random secret for JWT signing
- `NEXTAUTH_URL` — App URL (e.g., `http://localhost:3000`)

**Package additions:**
- `next-auth@5.0.0-beta.25` (pin to specific beta for stability)

**TypeScript augmentation (`src/types/next-auth.d.ts`):**

```typescript
import "next-auth"
import "next-auth/jwt"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      role: string
      name?: string | null
      email?: string | null
      image?: string | null
    }
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string
    role?: string
  }
}
```

**Route resolution note:** The existing `/api/auth/connect` and `/api/auth/callback` routes are static segments and will take priority over the `[...nextauth]` catch-all in Next.js App Router. No conflict.

### A-02: API Route Protection

**New file:** `src/middleware.ts`

```typescript
import { auth } from "@/lib/auth"

export default auth((req) => {
  const { pathname } = req.nextUrl

  // Public routes
  if (pathname.startsWith("/login") || pathname.startsWith("/api/auth")) {
    return
  }

  // Cron routes: allow with CRON_SECRET header
  if (pathname.startsWith("/api/sync")) {
    const cronSecret = req.headers.get("x-cron-secret")
    if (cronSecret === process.env.CRON_SECRET) return
  }

  // No session → redirect or 401
  if (!req.auth) {
    if (pathname.startsWith("/api/")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      })
    }
    const loginUrl = new URL("/login", req.url)
    loginUrl.searchParams.set("callbackUrl", pathname)
    return Response.redirect(loginUrl)
  }
})

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
```

**Behavior:**
- Pages without session → redirect to `/login?callbackUrl=<original-path>`
- API routes without session → `401 { error: "Unauthorized" }`
- `/login` and `/api/auth/*` → always accessible
- `/api/sync/*` with valid `CRON_SECRET` header → allowed without session

### A-03: Replace Hardcoded userId

**Affected files:**
- `src/app/api/activities/route.ts`
- `src/app/api/queue/route.ts`
- `src/app/api/accounts/route.ts`
- `src/app/api/opportunities/route.ts` (if exists)
- `src/app/api/inbox/route.ts`
- `src/app/api/leads/route.ts`
- `src/app/api/signals/route.ts`
- `src/app/api/tasks/route.ts`
- `src/app/api/search/route.ts` (audit for session needs)
- `src/app/api/sync/route.ts` (audit for session needs)

**Pattern for each route:**

```typescript
// Before
const userId = 'u1'

// After
import { auth } from "@/lib/auth"

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) {
    return Response.json({ error: "Unauthorized" }, { status: 401 })
  }
  const userId = session.user.id
  // ... rest of handler
}
```

Fields affected: `ownerId`, `reviewedById`, `authorId`, `assignees`, and any other user-referencing fields.

### A-04: Login Page

**New file:** `src/app/login/page.tsx`

**Visual design:**
- Full-screen dark background (`var(--bg)`)
- Centered card (`var(--elevated)` background, 8px border radius, subtle border)
- App name "Eco Insight" with brand green accent
- Brief tagline (e.g., "Energy certificate intelligence platform")
- Single "Sign in with Microsoft" button
  - Brand green background (`#3ecf8e`), dark text
  - Microsoft icon (inline SVG)
  - Hover state with slight brightness increase
- Plus Jakarta Sans font, consistent with app design system

**Login page layout:**
- Uses its own layout — no sidebar, no topbar
- Achieved by conditionally rendering the app shell in `layout.tsx`

**Layout change in `src/app/layout.tsx`:**

The root layout currently always renders Sidebar + TopBar. Two options:

**Option chosen: Route group approach**
- Move authenticated pages into a `(dashboard)` route group with its own layout that includes Sidebar/TopBar
- Login page stays at `src/app/login/page.tsx` with minimal layout (just dark background)
- Root layout only provides `<html>`, `<body>`, `QueryProvider`, and `ThemeInit`

**Pages to move into `src/app/(dashboard)/`:**
- `page.tsx` (home)
- `accounts/`
- `inbox/`
- `leads/`
- `queue/`
- `signals/`
- `tasks/`
- `settings/`

**Migration risk:** All pages use `@/` path aliases for imports, so file moves should not break import paths. The `usePathname()` calls in sidebar/navigation return the same paths regardless of route groups (Next.js strips the group prefix). React Query `queryKey` patterns are URL-based and unaffected.

This avoids conditional logic in the root layout and follows Next.js conventions.

**Post-login redirect:**
- `callbackUrl` query parameter passed from middleware
- NextAuth handles redirect after successful sign-in
- Defaults to `/` if no callbackUrl

## File Changes Summary

| File | Action | Purpose |
|------|--------|---------|
| `src/lib/auth.ts` | Create | NextAuth v5 config |
| `src/app/api/auth/[...nextauth]/route.ts` | Create | Auth route handler |
| `src/middleware.ts` | Create | Route protection |
| `src/app/login/page.tsx` | Create | Login page |
| `src/app/layout.tsx` | Modify | Move app shell to dashboard layout |
| `src/app/(dashboard)/layout.tsx` | Create | Authenticated layout with Sidebar/TopBar |
| `src/app/api/*/route.ts` | Modify | Replace `'u1'` with session userId |
| `.env.example` | Modify | Add auth env vars |
| `package.json` | Modify | Add next-auth dependency |
| `src/types/next-auth.d.ts` | Create | Type augmentation for session |

## Out of Scope

- Sign-out flow (A-05 — separate task)
- Session-aware layout showing current user info (A-06)
- Invite/registration flow design (A-07)
- Role-based access control (Epic 5)
- Light mode support for login page

## Testing Strategy

- Verify login redirect works when accessing protected routes
- Verify API routes return 401 without session
- Verify user upsert creates new users on first login
- Verify existing seeded users are matched by email on login
- Verify post-login redirect to original URL works
- Verify cron routes still work with CRON_SECRET header
