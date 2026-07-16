import type { NextAuthConfig } from "next-auth";

// Edge-safe: NAO importar nada que use Node APIs (argon2, db, drizzle).
// Providers, adapter e authorize sao adicionados em ./index.ts (Node).
export const authConfig = {
  pages: {
    signIn: "/login",
    error: "/login",
  },
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
  },
  trustHost: true,
  providers: [],
  callbacks: {
    jwt: async ({ token, user, trigger, session }) => {
      if (user) {
        token.id = user.id;
        token.twoFactorEnabled = (user as { twoFactorEnabled?: boolean }).twoFactorEnabled;
        token.twoFactorVerified = !(user as { twoFactorEnabled?: boolean }).twoFactorEnabled;
      }

      if (trigger === "update" && session?.twoFactorVerified === true) {
        token.twoFactorVerified = true;
      }

      return token;
    },
    session: ({ session, token }) => {
      if (token.id && session.user) {
        session.user.id = token.id as string;
        session.user.twoFactorEnabled = Boolean(token.twoFactorEnabled);
        session.user.twoFactorVerified = Boolean(token.twoFactorVerified);
      }
      return session;
    },
    authorized: ({ auth, request }) => {
      const { pathname } = request.nextUrl;
      const isLoggedIn = !!auth?.user;
      const needs2FA =
        auth?.user?.twoFactorEnabled === true && auth?.user?.twoFactorVerified === false;

      if (pathname === "/" || pathname.startsWith("/dev/")) {
        return true;
      }

      const isAuthRoute =
        pathname === "/login" ||
        pathname === "/cadastro" ||
        pathname === "/esqueci-senha" ||
        pathname === "/resetar-senha" ||
        pathname === "/verificar-email" ||
        pathname.startsWith("/verificar-2fa");

      if (isAuthRoute) {
        if (isLoggedIn && !needs2FA) {
          return Response.redirect(new URL("/app", request.nextUrl));
        }
        return true;
      }

      if (!isLoggedIn) {
        const callbackUrl = encodeURIComponent(pathname);
        return Response.redirect(new URL(`/login?callbackUrl=${callbackUrl}`, request.nextUrl));
      }

      if (needs2FA) {
        return Response.redirect(new URL("/verificar-2fa", request.nextUrl));
      }

      return true;
    },
  },
} satisfies NextAuthConfig;
