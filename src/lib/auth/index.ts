import { users } from "@/db/schema";
import { db } from "@/lib/db";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import NextAuth from "next-auth";
import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { z } from "zod";
import { authConfig } from "./config";
import { verifyPassword } from "./password";

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(128),
});

const providers: NextAuthConfig["providers"] = [
  Credentials({
    credentials: {
      email: { label: "E-mail", type: "email" },
      password: { label: "Senha", type: "password" },
    },
    async authorize(credentials) {
      const parsed = credentialsSchema.safeParse(credentials);
      if (!parsed.success) return null;

      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, parsed.data.email.toLowerCase()))
        .limit(1);

      if (!user || !user.passwordHash) return null;

      const valid = await verifyPassword(user.passwordHash, parsed.data.password);
      if (!valid) return null;

      return {
        id: user.id,
        email: user.email,
        name: user.name,
        twoFactorEnabled: user.twoFactorEnabled,
      };
    },
  }),
];

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  providers.push(
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      allowDangerousEmailAccountLinking: true,
    })
  );
}

export const { handlers, auth, signIn, signOut, unstable_update } = NextAuth({
  ...authConfig,
  adapter: DrizzleAdapter(db),
  providers,
});
