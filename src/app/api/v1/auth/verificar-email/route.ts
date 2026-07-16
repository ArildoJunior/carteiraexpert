import { users, verificationTokens } from "@/db/schema";
import { db } from "@/lib/db";
import { and, eq, gt } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ message: "Token ausente" }, { status: 400 });
  }

  const [vt] = await db
    .select()
    .from(verificationTokens)
    .where(and(eq(verificationTokens.token, token), gt(verificationTokens.expires, new Date())))
    .limit(1);

  if (!vt) {
    return NextResponse.json({ message: "Token invalido" }, { status: 400 });
  }

  await db
    .update(users)
    .set({ emailVerifiedAt: new Date(), updatedAt: new Date() })
    .where(eq(users.email, vt.identifier));

  await db.delete(verificationTokens).where(eq(verificationTokens.token, token));

  return NextResponse.redirect(new URL("/verificar-email", req.url));
}
