# Google Login + Dev Open Signup Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Google as a second auth provider and allow open signup in dev mode.

**Architecture:** Add Google to NextAuth providers array alongside Microsoft Entra (conditional on env vars). Modify signIn callback to auto-create users when ALLOW_OPEN_SIGNUP is set. Make Azure AD env vars optional so the app runs without them.

**Tech Stack:** NextAuth v5, next-auth/providers/google, Prisma, Vitest

**Spec:** `docs/superpowers/specs/2026-03-13-google-auth-design.md`

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/lib/env.ts` | Environment validation, `availableProviders()` helper |
| `src/lib/auth.ts` | NextAuth config, conditional providers, signIn callback with open signup |
| `src/app/login/page.tsx` | Multi-provider login UI |
| `src/lib/__tests__/env.test.ts` | Tests for env validation and `availableProviders()` |
| `.env.example` | Documentation for new env vars |
| `.env.local` | Add Google credentials + ALLOW_OPEN_SIGNUP |

---

## Chunk 1: Environment and Auth

### Task 1: Update `src/lib/env.ts` — make Azure AD optional, add Google + open signup vars

**Files:**
- Modify: `src/lib/env.ts`
- Create: `src/lib/__tests__/env.test.ts`

- [ ] **Step 1: Write tests for env module**

Create `src/lib/__tests__/env.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('env', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    // Reset module cache so env.ts re-evaluates
    vi.resetModules();
  });

  it('throws if DATABASE_URL is missing', async () => {
    vi.stubEnv('DATABASE_URL', '');
    vi.stubEnv('NEXTAUTH_SECRET', 'secret');
    vi.stubEnv('NEXTAUTH_URL', 'http://localhost:3000');
    await expect(import('@/lib/env')).rejects.toThrow('DATABASE_URL');
  });

  it('does NOT throw when Azure AD vars are missing', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://localhost/test');
    vi.stubEnv('NEXTAUTH_SECRET', 'secret');
    vi.stubEnv('NEXTAUTH_URL', 'http://localhost:3000');
    // Azure AD vars intentionally not set
    const mod = await import('@/lib/env');
    expect(mod.env.DATABASE_URL).toBe('postgresql://localhost/test');
    expect(mod.env.AZURE_AD_CLIENT_ID).toBeUndefined();
  });

  it('exports Google vars as optional', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://localhost/test');
    vi.stubEnv('NEXTAUTH_SECRET', 'secret');
    vi.stubEnv('NEXTAUTH_URL', 'http://localhost:3000');
    vi.stubEnv('GOOGLE_CLIENT_ID', 'gid');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'gsecret');
    const mod = await import('@/lib/env');
    expect(mod.env.GOOGLE_CLIENT_ID).toBe('gid');
    expect(mod.env.GOOGLE_CLIENT_SECRET).toBe('gsecret');
  });

  it('availableProviders returns google=true when Google vars set', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://localhost/test');
    vi.stubEnv('NEXTAUTH_SECRET', 'secret');
    vi.stubEnv('NEXTAUTH_URL', 'http://localhost:3000');
    vi.stubEnv('GOOGLE_CLIENT_ID', 'gid');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'gsecret');
    const mod = await import('@/lib/env');
    expect(mod.availableProviders()).toEqual({ google: true, microsoft: false });
  });

  it('availableProviders returns microsoft=true when all Azure vars set', async () => {
    vi.stubEnv('DATABASE_URL', 'postgresql://localhost/test');
    vi.stubEnv('NEXTAUTH_SECRET', 'secret');
    vi.stubEnv('NEXTAUTH_URL', 'http://localhost:3000');
    vi.stubEnv('AZURE_AD_CLIENT_ID', 'aid');
    vi.stubEnv('AZURE_AD_CLIENT_SECRET', 'asecret');
    vi.stubEnv('AZURE_AD_TENANT_ID', 'tid');
    const mod = await import('@/lib/env');
    expect(mod.availableProviders()).toEqual({ google: false, microsoft: true });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/__tests__/env.test.ts`
Expected: FAIL — `availableProviders` not exported, Azure AD vars still required

- [ ] **Step 3: Implement env.ts changes**

Replace `src/lib/env.ts` with:

```typescript
// Environment variable validation — runs at import time.
// Import `env` from this module instead of reading process.env directly.

function getOptionalEnv(name: string, fallback?: string): string | undefined {
  return process.env[name] ?? fallback;
}

// ---------------------------------------------------------------------------
// Validate all required vars eagerly so the app fails fast on misconfiguration
// ---------------------------------------------------------------------------

const missing: string[] = [];

function collectRequired(name: string, description: string): string {
  const value = process.env[name];
  if (!value) {
    missing.push(`  ${name} — ${description}`);
    return ""; // placeholder; we throw before this is used
  }
  return value;
}

// --- Core (required) ---
const DATABASE_URL = collectRequired(
  "DATABASE_URL",
  "PostgreSQL connection string"
);
const NEXTAUTH_SECRET = collectRequired(
  "NEXTAUTH_SECRET",
  "Secret used to encrypt NextAuth.js JWTs and session tokens"
);
const NEXTAUTH_URL = collectRequired(
  "NEXTAUTH_URL",
  "Canonical URL of the application (e.g. http://localhost:3000)"
);

if (missing.length > 0) {
  throw new Error(
    [
      "Environment validation failed. The following required variables are missing:",
      ...missing,
      "",
      "Check your .env or deployment configuration.",
    ].join("\n")
  );
}

// --- Azure AD (optional — only needed if using Microsoft login) ---
const AZURE_AD_CLIENT_ID = getOptionalEnv("AZURE_AD_CLIENT_ID");
const AZURE_AD_CLIENT_SECRET = getOptionalEnv("AZURE_AD_CLIENT_SECRET");
const AZURE_AD_TENANT_ID = getOptionalEnv("AZURE_AD_TENANT_ID");

// --- Google (optional — only needed if using Google login) ---
const GOOGLE_CLIENT_ID = getOptionalEnv("GOOGLE_CLIENT_ID");
const GOOGLE_CLIENT_SECRET = getOptionalEnv("GOOGLE_CLIENT_SECRET");

// --- Open signup (dev mode) ---
const ALLOW_OPEN_SIGNUP = getOptionalEnv("ALLOW_OPEN_SIGNUP");

// --- Other optional ---
const CRON_SECRET = getOptionalEnv("CRON_SECRET");
const MICROSOFT_CLIENT_ID = getOptionalEnv("MICROSOFT_CLIENT_ID");
const MICROSOFT_CLIENT_SECRET = getOptionalEnv("MICROSOFT_CLIENT_SECRET");
const MICROSOFT_REDIRECT_URI = getOptionalEnv("MICROSOFT_REDIRECT_URI");

// ---------------------------------------------------------------------------
// Typed export
// ---------------------------------------------------------------------------

export const env = {
  // Core
  DATABASE_URL,
  NEXTAUTH_SECRET,
  NEXTAUTH_URL,

  // Azure AD (optional)
  AZURE_AD_CLIENT_ID,
  AZURE_AD_CLIENT_SECRET,
  AZURE_AD_TENANT_ID,

  // Google (optional)
  GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET,

  // Dev mode
  ALLOW_OPEN_SIGNUP,

  // Optional
  CRON_SECRET,
  MICROSOFT_CLIENT_ID,
  MICROSOFT_CLIENT_SECRET,
  MICROSOFT_REDIRECT_URI,
} as const;

export type Env = typeof env;

// ---------------------------------------------------------------------------
// Provider availability helper
// ---------------------------------------------------------------------------

export function availableProviders(): { google: boolean; microsoft: boolean } {
  return {
    google: !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET),
    microsoft: !!(AZURE_AD_CLIENT_ID && AZURE_AD_CLIENT_SECRET && AZURE_AD_TENANT_ID),
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/__tests__/env.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/env.ts src/lib/__tests__/env.test.ts
git commit -m "feat(auth): make Azure AD optional, add Google + open signup env vars"
```

---

### Task 2: Update `src/lib/auth.ts` — conditional providers + open signup

**Files:**
- Modify: `src/lib/auth.ts`

- [ ] **Step 1: Implement auth.ts changes**

Replace `src/lib/auth.ts` with:

```typescript
import NextAuth from "next-auth"
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id"
import Google from "next-auth/providers/google"
import { db } from "@/lib/db"
import { env, availableProviders } from "@/lib/env"
import { Prisma } from "@prisma/client"

// Build providers array based on which env vars are configured
const providers: Parameters<typeof NextAuth>[0]["providers"] = []

const { google, microsoft } = availableProviders()

if (google) {
  providers.push(
    Google({
      clientId: env.GOOGLE_CLIENT_ID!,
      clientSecret: env.GOOGLE_CLIENT_SECRET!,
    })
  )
}

if (microsoft) {
  providers.push(
    MicrosoftEntraID({
      clientId: env.AZURE_AD_CLIENT_ID!,
      clientSecret: env.AZURE_AD_CLIENT_SECRET!,
      issuer: `https://login.microsoftonline.com/${env.AZURE_AD_TENANT_ID!}/v2.0`,
    })
  )
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  cookies: {
    sessionToken: {
      name: process.env.NODE_ENV === "production"
        ? "__Secure-next-auth.session-token"
        : "next-auth.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
    csrfToken: {
      name: process.env.NODE_ENV === "production"
        ? "__Host-next-auth.csrf-token"
        : "next-auth.csrf-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
    callbackUrl: {
      name: process.env.NODE_ENV === "production"
        ? "__Secure-next-auth.callback-url"
        : "next-auth.callback-url",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
  callbacks: {
    async signIn({ user }) {
      if (!user.email) return false

      // Existing user? Allow if active, reject if deactivated.
      const existing = await db.user.findUnique({ where: { email: user.email } })
      if (existing) {
        if (!existing.isActive) return false // deactivated
        // Update name on each login
        await db.user.update({
          where: { id: existing.id },
          data: { name: user.name || user.email },
        })
        return true
      }

      // New user: check for a valid pending invitation.
      const invitation = await db.invitation.findFirst({
        where: {
          email: user.email,
          status: 'PENDING',
          expiresAt: { gt: new Date() },
        },
      })

      if (invitation) {
        // Create user from invitation
        await db.user.create({
          data: {
            email: user.email,
            name: user.name || user.email,
            initials: deriveInitials(user.name || user.email),
            role: invitation.role,
          },
        })

        // Mark invitation as accepted
        await db.invitation.update({
          where: { id: invitation.id },
          data: { status: 'ACCEPTED' },
        })

        return true
      }

      // No invitation — check if open signup is enabled
      if (env.ALLOW_OPEN_SIGNUP === "true") {
        try {
          await db.user.create({
            data: {
              email: user.email,
              name: user.name || user.email,
              initials: deriveInitials(user.name || user.email),
            },
          })
          return true
        } catch (e) {
          // Race condition: another request created the user first
          if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
            return true
          }
          throw e
        }
      }

      return false // no invitation, no open signup
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
      if (token.userId) session.user.id = token.userId
      if (token.role) session.user.role = token.role
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

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors related to auth.ts or env.ts

- [ ] **Step 3: Commit**

```bash
git add src/lib/auth.ts
git commit -m "feat(auth): add Google provider, conditional Microsoft, open signup"
```

---

### Task 3: Update login page — multi-provider buttons

**Files:**
- Modify: `src/app/login/page.tsx`

- [ ] **Step 1: Replace login page**

Replace `src/app/login/page.tsx` with:

```tsx
import { signIn } from "@/lib/auth"
import { availableProviders } from "@/lib/env"

export const dynamic = "force-dynamic"

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>
}) {
  const { google, microsoft } = availableProviders()

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--bg)] px-4">
      <div className="w-full max-w-sm bg-[var(--elevated)] border border-[var(--border)] rounded-lg p-8 text-center">
        {/* Logo / App Name */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-[var(--text)]">
            Eco<span className="text-brand">Insight</span>
          </h1>
          <p className="text-sm text-[var(--muted)] mt-1">
            Energy certificate intelligence platform
          </p>
        </div>

        {/* Provider buttons */}
        <div className="flex flex-col gap-3">
          {google && (
            <form
              action={async () => {
                "use server"
                const params = await searchParams
                await signIn("google", {
                  redirectTo: params.callbackUrl || "/",
                })
              }}
            >
              <button
                type="submit"
                className="w-full flex items-center justify-center gap-3 bg-white text-gray-700 font-semibold py-2.5 px-4 rounded-lg hover:bg-gray-50 transition-all text-sm border border-gray-300"
              >
                <GoogleIcon />
                Sign in with Google
              </button>
            </form>
          )}

          {microsoft && (
            <form
              action={async () => {
                "use server"
                const params = await searchParams
                await signIn("microsoft-entra-id", {
                  redirectTo: params.callbackUrl || "/",
                })
              }}
            >
              <button
                type="submit"
                className="w-full flex items-center justify-center gap-3 bg-brand text-[#09090b] font-semibold py-2.5 px-4 rounded-lg hover:brightness-110 transition-all text-sm"
              >
                <MicrosoftIcon />
                Sign in with Microsoft
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  )
}

function MicrosoftIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 21 21" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="1" y="1" width="9" height="9" fill="#F25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </svg>
  )
}
```

- [ ] **Step 2: Verify page compiles**

Run: `npx tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/app/login/page.tsx
git commit -m "feat(auth): multi-provider login page with Google + Microsoft"
```

---

### Task 4: Update environment files

**Files:**
- Modify: `.env.example`
- Modify: `.env.local`

- [ ] **Step 1: Update `.env.example`**

Add after the existing Azure AD section:

```
# ── Google Login (optional) ──────────────────────
# 1. Go to https://console.cloud.google.com → APIs & Services → Credentials
# 2. Create OAuth 2.0 Client ID (Web application)
# 3. Add redirect URI: http://localhost:3000/api/auth/callback/google
# 4. Copy Client ID and Client Secret here
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""

# ── Open Signup (development only) ───────────────
# WARNING: Set to "true" ONLY in development.
# In production, use the invitation system to control access.
# When enabled, any Google/Microsoft user can sign in without an invitation.
ALLOW_OPEN_SIGNUP=""
```

- [ ] **Step 2: Update `.env.local`**

Add Google credentials placeholder and enable open signup:

```
GOOGLE_CLIENT_ID=""
GOOGLE_CLIENT_SECRET=""
ALLOW_OPEN_SIGNUP="true"
```

(User will fill in real Google credentials after creating them in Google Cloud Console. Do NOT commit `.env.local`.)

- [ ] **Step 3: Commit**

```bash
git add .env.example
git commit -m "docs: add Google login and open signup env vars to .env.example"
```

---

### Task 5: Install Google provider dependency and verify

- [ ] **Step 1: Verify no new npm install needed**

The `next-auth/providers/google` module ships with `next-auth` — no separate package needed. Verify:

Run: `ls node_modules/next-auth/providers/google.js 2>/dev/null && echo "exists" || echo "missing"`
Expected: `exists`

- [ ] **Step 2: Run all existing tests**

Run: `npx vitest run`
Expected: All tests pass (existing + new env tests)

- [ ] **Step 3: Start dev server and verify login page loads**

Run: `npm run dev`
Navigate to: `http://localhost:3000/login`
Expected: Login page shows Google button (no Microsoft button since Azure vars are placeholders)

- [ ] **Step 4: Final commit if any fixes needed**

If any adjustments were made during verification, commit them.
