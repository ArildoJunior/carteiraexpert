import { twoFactorSecrets, users } from "@/db/schema";
import { auth } from "@/lib/auth";
import { verifyTOTPCode } from "@/lib/auth/totp";
import { db } from "@/lib/db";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({ code: z.string().regex(/^\d{6}$/) });

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Nao autenticado" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Codigo invalido" }, { status: 400 });
  }

  const [secret] = await db
    .select()
    .from(twoFactorSecrets)
    .where(eq(twoFactorSecrets.userId, session.user.id))
    .limit(1);

  if (!secret) {
    return NextResponse.json({ message: "Setup nao iniciado" }, { status: 400 });
  }

  if (!verifyTOTPCode(secret.secret, parsed.data.code)) {
    return NextResponse.json({ message: "Codigo incorreto" }, { status: 400 });
  }

  await db
    .update(users)
    .set({ twoFactorEnabled: true, updatedAt: new Date() })
    .where(eq(users.id, session.user.id));

  return NextResponse.json({ ok: true });
}
