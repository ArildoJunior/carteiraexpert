import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      twoFactorEnabled: boolean;
      twoFactorVerified: boolean;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    twoFactorEnabled?: boolean;
    twoFactorVerified?: boolean;
  }
}
