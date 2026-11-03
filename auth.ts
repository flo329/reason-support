import NextAuth, { type DefaultSession } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/db";
import { env, isAllowedEmail } from "@/lib/env";
import { logActivity } from "@/lib/activity";

declare module "next-auth" {
  interface Session {
    user: { id: string; role: "ADMIN" | "AGENT" } & DefaultSession["user"];
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 14 },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(creds) {
        const email = String(creds?.email ?? "").toLowerCase().trim();
        const password = String(creds?.password ?? "");
        if (!email || !password || !isAllowedEmail(email)) return null;
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user?.active || !user.passwordHash) return null;
        if (!(await bcrypt.compare(password, user.passwordHash))) return null;
        return { id: user.id, email: user.email, name: user.name };
      },
    }),
    ...(env.googleEnabled ? [Google] : []),
  ],
  callbacks: {
    authorized({ auth }) {
      return Boolean(auth?.user);
    },
    async signIn({ user, account, profile }) {
      const email = user.email?.toLowerCase();
      if (!isAllowedEmail(email)) return false;
      if (account?.provider === "google") {
        if (profile && profile.email_verified === false) return false;
        const existing = await prisma.user.findUnique({ where: { email: email! } });
        if (existing && !existing.active) return false;
        if (!existing) {
          await prisma.user.create({ data: { email: email!, name: user.name ?? null } });
        }
      }
      return true;
    },
    async jwt({ token, user }) {
      if (user?.email) {
        const dbUser = await prisma.user.update({
          where: { email: user.email.toLowerCase() },
          data: { lastLoginAt: new Date() },
        });
        token.uid = dbUser.id;
        token.role = dbUser.role;
        token.name = dbUser.name ?? user.name;
        await logActivity({ userId: dbUser.id, action: "auth.login" });
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = String(token.uid ?? "");
      session.user.role = (token.role as "ADMIN" | "AGENT") ?? "AGENT";
      return session;
    },
  },
});
