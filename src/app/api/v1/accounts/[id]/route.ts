import { brokerageAccounts } from "@/db/schema";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/db/audit";
import { getAccountForUser } from "@/lib/db/scopes";
import { updateBrokerageAccountSchema } from "@/lib/validations/brokerage-account";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Nao autenticado" }, { status: 401 });
  }
  const { id } = await params;
  const account = await getAccountForUser(id, session.user.id);
  if (!account) {
    return NextResponse.json({ message: "Conta nao encontrada" }, { status: 404 });
  }
  return NextResponse.json(account);
}

export async function PATCH(req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Nao autenticado" }, { status: 401 });
  }
  const { id } = await params;
  const account = await getAccountForUser(id, session.user.id);
  if (!account) {
    return NextResponse.json({ message: "Conta nao encontrada" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const parsed = updateBrokerageAccountSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Dados invalidos", errors: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const [updated] = await db
    .update(brokerageAccounts)
    .set({ ...parsed.data, updatedAt: new Date() })
    .where(and(eq(brokerageAccounts.id, id), eq(brokerageAccounts.userId, session.user.id)))
    .returning();

  if (!updated) {
    return NextResponse.json({ message: "Erro ao atualizar" }, { status: 500 });
  }

  await logAudit({
    userId: session.user.id,
    action: "account.updated",
    resourceType: "brokerage_account",
    resourceId: id,
    metadata: parsed.data,
  });

  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Nao autenticado" }, { status: 401 });
  }
  const { id } = await params;
  const account = await getAccountForUser(id, session.user.id);
  if (!account) {
    return NextResponse.json({ message: "Conta nao encontrada" }, { status: 404 });
  }

  await db
    .delete(brokerageAccounts)
    .where(and(eq(brokerageAccounts.id, id), eq(brokerageAccounts.userId, session.user.id)));

  await logAudit({
    userId: session.user.id,
    action: "account.deleted",
    resourceType: "brokerage_account",
    resourceId: id,
  });

  return NextResponse.json({ ok: true });
}
