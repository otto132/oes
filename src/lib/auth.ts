import NextAuth from "next-auth"
import type { NextAuthConfig } from "next-auth"
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id"
import Google from "next-auth/providers/google"
import { db } from "@/lib/db"
import { env, availableProviders } from "@/lib/env"
import { testSignInCallback } from "./auth-callbacks"

// Build providers array based on which env vars are configured
const providers: NextAuthConfig["providers"] = []

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
      return testSignInCallback({ user })
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
