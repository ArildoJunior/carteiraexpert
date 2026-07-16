import { users } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { db } from "@/lib/db";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

const schema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email().max(255),
  password: z.string().min(12).max(128),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "Dados invalidos" }, { status: 400 });
  }

  const { name, email, password } = parsed.data;
  const emailLower = email.toLowerCase();

  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, emailLower))
    .limit(1);

  if (existing.length > 0) {
    return NextResponse.json({ message: "E-mail ja cadastrado" }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);

  const [newUser] = await db
    .insert(users)
    .values({ email: emailLower, name, passwordHash })
    .returning();

  if (!newUser) {
    return NextResponse.json({ message: "Erro ao criar conta" }, { status: 500 });
  }

  return NextResponse.json({ id: newUser.id, email: newUser.email }, { status: 201 });
}
