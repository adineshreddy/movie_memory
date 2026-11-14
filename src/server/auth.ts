import "server-only";
import { PrismaAdapter } from "@auth/prisma-adapter";
import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import { redirect } from "next/navigation";
import { getDb } from "./db";

export const { handlers, auth, signIn, signOut } = NextAuth(() => ({
  adapter: PrismaAdapter(getDb()),
  providers: [Google],
  session: { strategy: "database" },
  pages: { signIn: "/" },
  callbacks: {
    session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
  },
}));

export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) redirect("/");
  return session.user;
}
