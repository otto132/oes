import { auth } from "@/lib/auth"

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"])

export default auth((req) => {
  const { pathname } = req.nextUrl

  // Public routes — no auth needed
  if (pathname.startsWith("/login") || pathname.startsWith("/api/auth") || pathname.startsWith("/api/health")) {
    return
  }

  // Cron routes — allow with CRON_SECRET header
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
  if (pathname.startsWith("/api/") && !SAFE_METHODS.has(req.method)) {
    const origin = req.headers.get("origin")
    const appOrigin = req.nextUrl.origin
    if (!origin || origin !== appOrigin) {
      return new Response(JSON.stringify({ error: "Forbidden: invalid origin" }), {
        status: 403,
        headers: { "Content-Type": "application/json" },
      })
    }
  }
})

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
