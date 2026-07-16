import { brokerageAccounts } from "@/db/schema";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/db/audit";
import { createBrokerageAccountSchema } from "@/lib/validations/brokerage-account";
import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Nao autenticado" }, { status: 401 });
  }

  const accounts = await db
    .select()
    .from(brokerageAccounts)
    .where(eq(brokerageAccounts.userId, session.user.id))
    .orderBy(desc(brokerageAccounts.createdAt));

  return NextResponse.json({ data: accounts });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Nao autenticado" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = createBrokerageAccountSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Dados invalidos", errors: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const [account] = await db
    .insert(brokerageAccounts)
    .values({ ...parsed.data, userId: session.user.id })
    .returning();

  if (!account) {
    return NextResponse.json({ message: "Erro ao criar conta" }, { status: 500 });
  }

  await logAudit({
    userId: session.user.id,
    action: "account.created",
    resourceType: "brokerage_account",
    resourceId: account.id,
    metadata: {
      name: account.name,
      type: account.type,
      broker: account.broker,
    },
  });

  return NextResponse.json(account, { status: 201 });
}
