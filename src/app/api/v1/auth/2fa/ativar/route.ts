import { twoFactorSecrets, users } from "@/db/schema";
import { auth } from "@/lib/auth";
import {
  generateBackupCodes,
  generateTOTPSecret,
  getTOTPUri,
  hashBackupCode,
} from "@/lib/auth/totp";
import { db } from "@/lib/db";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import QRCode from "qrcode";

export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Nao autenticado" }, { status: 401 });
  }

  const [user] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);

  if (!user || !user.email) {
    return NextResponse.json({ message: "Usuario nao encontrado" }, { status: 404 });
  }

  if (user.twoFactorEnabled) {
    return NextResponse.json({ message: "2FA ja esta ativo" }, { status: 400 });
  }

  const secret = generateTOTPSecret();
  const plainCodes = generateBackupCodes(10);
  const backupCodesHashed = plainCodes.map(hashBackupCode);
  const uri = getTOTPUri(user.email, secret);
  const qrCode = await QRCode.toDataURL(uri);

  await db
    .insert(twoFactorSecrets)
    .values({ userId: user.id, secret, backupCodesHashed })
    .onConflictDoUpdate({
      target: twoFactorSecrets.userId,
      set: { secret, backupCodesHashed, createdAt: new Date() },
    });

  return NextResponse.json({ qrCode, secret, backupCodes: plainCodes });
}
