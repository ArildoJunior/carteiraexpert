import { authConfig } from "@/lib/auth/config";
import NextAuth from "next-auth";

// Edge Runtime: usa APENAS o config edge-safe (sem argon2, sem db)
export const { auth: middleware } = NextAuth(authConfig);

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico)$).*)",
  ],
};
