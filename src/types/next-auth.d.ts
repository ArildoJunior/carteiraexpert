import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "user" | "editor" | "admin";
      twoFactorEnabled: boolean;
      twoFactorVerified: boolean;
    } & DefaultSession["user"];
  }

  interface User {
    role?: "user" | "editor" | "admin";
    twoFactorEnabled?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: "user" | "editor" | "admin";
    twoFactorEnabled?: boolean;
    twoFactorVerified?: boolean;
  }
}
