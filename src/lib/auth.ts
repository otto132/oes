import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import { db } from "@/lib/db"
import { authConfig } from "./auth.config"
import { testSignInCallback } from "./auth-callbacks"

// Full auth config — extends the edge-safe base with DB-dependent callbacks.
// The middleware uses authConfig directly (no Prisma in the edge bundle).

const providers = [...authConfig.providers]

// Dev-only credentials provider — auto-signs in as first active user
if (process.env.NODE_ENV === "development") {
  providers.push(
    Credentials({
      id: "dev-login",
      name: "Dev Login",
      credentials: {},
      async authorize() {
        const user = await db.user.findFirst({
          where: { isActive: true },
          orderBy: { createdAt: "asc" },
        })
        if (!user) return null
        return { id: user.id, email: user.email, name: user.name }
      },
    })
  )
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers,
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
          token.tenantId = dbUser.tenantId
        }
      }
      return token
    },
    async session({ session, token }) {
      if (token.userId) session.user.id = token.userId
      if (token.role) session.user.role = token.role
      if (token.tenantId) session.user.tenantId = token.tenantId
      return session
    },
  },
})
