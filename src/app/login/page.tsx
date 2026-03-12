import { signIn } from "@/lib/auth"

export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>
}) {
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

        {/* Sign in button */}
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
      </div>
    </div>
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
