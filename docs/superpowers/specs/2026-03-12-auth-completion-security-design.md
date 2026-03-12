# Auth Completion + Security — Design Spec

**Date:** 2026-03-12
**Track:** Session 3 — Auth Completion + Security
**Status:** Approved

## Overview

Complete the auth system and harden security for the Eco-Insight Revenue OS. Five deliverables: sign-out flow, security headers, CSRF protection, secure session cookies, and two design decision documents (invite flow, tenant model).

## A-05: Sign-out Flow

**Goal:** Sign-out button in Sidebar; clears session; redirects to login.

**Implementation:**
- Add sign-out button to `Sidebar.tsx` at the bottom of the nav, near the user profile area
- Use `signOut` from `next-auth/react` (client-side): `signOut({ callbackUrl: '/login' })`
- NextAuth handles the POST to `/api/auth/signout`, clears the JWT session cookie, and redirects

**Files:** `src/components/layout/Sidebar.tsx`

## S-01: Security Headers

**Goal:** Add CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy.

**Implementation:** Configure in `next.config.ts` using Next.js `headers()` config (declarative, no middleware overhead).

**Headers:**
| Header | Value |
|--------|-------|
| X-Frame-Options | DENY |
| X-Content-Type-Options | nosniff |
| Referrer-Policy | strict-origin-when-cross-origin |
| Strict-Transport-Security | max-age=31536000; includeSubDomains |
| Content-Security-Policy | default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; frame-ancestors 'none' |
| Permissions-Policy | camera=(), microphone=(), geolocation=() |

**Rationale for moderate CSP:** Tailwind uses inline styles; Next.js uses inline scripts. Strict nonce-based CSP adds complexity disproportionate to the threat model of an internal tool.

**Files:** `next.config.ts`

## S-07: CSRF Protection

**Goal:** Protect custom API routes from cross-site request forgery.

**Implementation:**
1. **SameSite=Lax cookies** (S-09) prevent cross-origin cookie attachment on POST/PUT/DELETE
2. **Origin header validation in middleware** — for state-changing requests (POST, PUT, PATCH, DELETE), verify the `Origin` or `Referer` header matches the app's own origin. Reject requests from foreign origins with 403.

**Rationale:** Double-submit defense per OWASP recommendations for modern apps with SameSite cookies. No separate CSRF token library needed.

**Files:** `src/middleware.ts`

## S-09: Secure Session Cookie Config

**Goal:** Harden NextAuth session cookies with HttpOnly, Secure, SameSite, and proper naming.

**Implementation:** Add `cookies` config to NextAuth options in `src/lib/auth.ts`:
- `httpOnly: true` — no JavaScript access
- `sameSite: 'lax'` — CSRF mitigation
- `secure: true` in production — HTTPS only
- `path: '/'` — available across the app
- `__Secure-` prefix in production

**Files:** `src/lib/auth.ts`

## A-07: Invite Flow Decision

**Decision:** Entra-only.

The Azure AD tenant is the identity boundary. Anyone added to the tenant can sign in. The app auto-provisions users on first login via the existing JWT callback (`db.user.upsert` on sign-in). No in-app invite mechanism needed.

**Rationale:**
- Reduces attack surface (no invite tokens to secure)
- Leverages existing IT admin workflows (Azure portal)
- Keeps auth concerns in one place (Entra ID)
- Auto-provisioning already works

## A-09: Tenant Model Decision

**Decision:** Single-tenant.

One organization, one data space. All users share the same data, filtered by role and ownership (existing `ownerId` on records).

**Rationale:**
- Current Entra ID config uses a single `AZURE_AD_TENANT_ID`
- Schema has no `tenantId` columns
- Appropriate for an internal CRM tool
- No current multi-org requirement

**Future migration notes (if ever needed):**
- Add `tenantId` column to all business tables
- Add `Tenant` model with org metadata
- Switch Entra ID to multi-tenant app registration
- Add tenant resolution in middleware (from session or subdomain)
- Add row-level filtering by tenant in all queries
