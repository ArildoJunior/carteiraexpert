import { createHash } from "node:crypto";
import { passwordResets, users } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { db } from "@/lib/db";
import { and, eq, gt, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  token: z.string().min(64).max(128),
  password: z.string().min(12).max(128),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Dados invalidos" }, { status: 400 });
  }

  const tokenHash = createHash("sha256").update(parsed.data.token).digest("hex");
  const now = new Date();

  const [reset] = await db
    .select()
    .from(passwordResets)
    .where(
      and(
        eq(passwordResets.tokenHash, tokenHash),
        gt(passwordResets.expiresAt, now),
        isNull(passwordResets.usedAt)
      )
    )
    .limit(1);

  if (!reset) {
    return NextResponse.json({ message: "Token invalido ou expirado" }, { status: 400 });
  }

  const passwordHash = await hashPassword(parsed.data.password);

  await db.transaction(async (tx) => {
    await tx.update(users).set({ passwordHash, updatedAt: now }).where(eq(users.id, reset.userId));
    await tx.update(passwordResets).set({ usedAt: now }).where(eq(passwordResets.id, reset.id));
  });

  return NextResponse.json({ ok: true });
}
