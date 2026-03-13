import NextAuth from "next-auth"
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id"
import { db } from "@/lib/db"

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    MicrosoftEntraID({
      clientId: process.env.AZURE_AD_CLIENT_ID!,
      clientSecret: process.env.AZURE_AD_CLIENT_SECRET!,
      issuer: `https://login.microsoftonline.com/${process.env.AZURE_AD_TENANT_ID!}/v2.0`,
    }),
  ],
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

      if (!invitation) return false // no invitation — reject

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
