import { twoFactorSecrets } from "@/db/schema";
import { auth } from "@/lib/auth";
import { hashBackupCode, verifyTOTPCode } from "@/lib/auth/totp";
import { db } from "@/lib/db";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({ code: z.string().min(6).max(20) });

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
    return NextResponse.json({ message: "2FA nao configurado" }, { status: 400 });
  }

  let valid = verifyTOTPCode(secret.secret, parsed.data.code);

  if (!valid) {
    const codeHash = hashBackupCode(parsed.data.code);
    if (secret.backupCodesHashed.includes(codeHash)) {
      valid = true;
      await db
        .update(twoFactorSecrets)
        .set({
          backupCodesHashed: secret.backupCodesHashed.filter((c) => c !== codeHash),
          lastUsedAt: new Date(),
        })
        .where(eq(twoFactorSecrets.userId, session.user.id));
    }
  }

  if (!valid) {
    return NextResponse.json({ message: "Codigo incorreto" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
