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

export function availableProviders(): { google: boolean } {
  return {
    google: !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET),
  };
}
