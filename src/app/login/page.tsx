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

          {process.env.NODE_ENV === "development" && (
            <>
              <div className="flex items-center gap-2 my-1">
                <div className="flex-1 h-px bg-[var(--border)]" />
                <span className="text-[10px] uppercase tracking-wider text-[var(--muted)]">dev only</span>
                <div className="flex-1 h-px bg-[var(--border)]" />
              </div>
              <form
                action={async () => {
                  "use server"
                  const params = await searchParams
                  await signIn("dev-login", {
                    redirectTo: params.callbackUrl || "/",
                  })
                }}
              >
                <button
                  type="submit"
                  className="w-full flex items-center justify-center gap-3 bg-[var(--surface)] text-[var(--text)] font-semibold py-2.5 px-4 rounded-lg hover:bg-[var(--surface-hover)] transition-all text-sm border border-dashed border-[var(--border)]"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                  Dev Login (first seed user)
                </button>
              </form>
            </>
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
