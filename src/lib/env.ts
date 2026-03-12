// Environment variable validation — runs at import time.
// Import `env` from this module instead of reading process.env directly.

function getRequiredEnv(name: string, description: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name} — ${description}`
    );
  }
  return value;
}

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

// --- Core ---
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

// --- Azure AD (authentication provider) ---
const AZURE_AD_CLIENT_ID = collectRequired(
  "AZURE_AD_CLIENT_ID",
  "Azure AD application (client) ID for authentication"
);
const AZURE_AD_CLIENT_SECRET = collectRequired(
  "AZURE_AD_CLIENT_SECRET",
  "Azure AD client secret for authentication"
);
const AZURE_AD_TENANT_ID = collectRequired(
  "AZURE_AD_TENANT_ID",
  "Azure AD tenant ID for authentication"
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

// --- Optional ---
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

  // Azure AD
  AZURE_AD_CLIENT_ID,
  AZURE_AD_CLIENT_SECRET,
  AZURE_AD_TENANT_ID,

  // Optional
  CRON_SECRET,
  MICROSOFT_CLIENT_ID,
  MICROSOFT_CLIENT_SECRET,
  MICROSOFT_REDIRECT_URI,
} as const;

export type Env = typeof env;
