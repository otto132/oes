import NextAuth from "next-auth"
import { authConfig } from "@/lib/auth.config"

const { auth } = NextAuth(authConfig)

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"])

export default auth((req) => {
  const { pathname } = req.nextUrl

  // Public routes — no auth needed
  if (pathname.startsWith("/login") || pathname.startsWith("/api/auth") || pathname.startsWith("/api/health")) {
    return
  }

  // Cron routes — allow with CRON_SECRET header (skip session + CSRF checks)
  if (pathname.startsWith("/api/sync")) {
    const cronSecret = req.headers.get("x-cron-secret")
    if (cronSecret === process.env.CRON_SECRET) return
  }

  // No session → respond appropriately
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

  // CSRF protection — validate Origin on state-changing requests
  // Skip for NextAuth routes (they have their own CSRF token validation)
  if (
    pathname.startsWith("/api/") &&
    !pathname.startsWith("/api/auth/") &&
    !SAFE_METHODS.has(req.method)
  ) {
    const origin = req.headers.get("origin")
    const referer = req.headers.get("referer")
    const appOrigin = req.nextUrl.origin

    // Accept if Origin header matches, or fall back to Referer header
    const originMatch = origin === appOrigin
    const refererMatch = referer?.startsWith(appOrigin + "/") ?? false

    if (!originMatch && !refererMatch) {
      return new Response(JSON.stringify({ error: "Forbidden: invalid origin" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      })
    }

    // RBAC: Viewers cannot perform mutations (POST/PATCH/DELETE)
    const role = req.auth?.user?.role
    if (role === "VIEWER") {
      return new Response(
        JSON.stringify({ error: { code: "FORBIDDEN", message: "Viewers cannot modify data" } }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      )
    }
  }
})

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
