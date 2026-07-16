import { positions, transactions } from "@/db/schema";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/db/audit";
import { type TransactionInput, calculatePosition } from "@/lib/portfolio/calc";
import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Nao autenticado" }, { status: 401 });
  }
  const { id } = await params;
  const [tx] = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.userId, session.user.id)))
    .limit(1);
  if (!tx) {
    return NextResponse.json({ message: "Movimentacao nao encontrada" }, { status: 404 });
  }
  return NextResponse.json(tx);
}

export async function DELETE(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Nao autenticado" }, { status: 401 });
  }
  const { id } = await params;
  const userId = session.user.id;

  const [target] = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.id, id), eq(transactions.userId, userId)))
    .limit(1);
  if (!target) {
    return NextResponse.json({ message: "Movimentacao nao encontrada" }, { status: 404 });
  }

  // FIX: import estatico de positions (sem dynamic import desnecessario)
  const result = await db.transaction(async (tx) => {
    await tx
      .delete(transactions)
      .where(and(eq(transactions.id, id), eq(transactions.userId, userId)));

    // Recalcular posicao apos deletar
    const txs = await tx
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.accountId, target.accountId),
          eq(transactions.assetId, target.assetId),
          eq(transactions.userId, userId)
        )
      )
      .orderBy(asc(transactions.transactionDate));

    if (txs.length === 0) {
      // Sem transacoes, fecha a posicao
      await tx
        .update(positions)
        .set({
          quantity: "0",
          averageCost: "0",
          isOpen: "false",
          closedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(positions.accountId, target.accountId),
            eq(positions.assetId, target.assetId),
            eq(positions.userId, userId)
          )
        );
      return null;
    }

    const inputs: TransactionInput[] = txs.map((t) => ({
      id: t.id,
      assetId: t.assetId,
      accountId: t.accountId,
      type: t.type as TransactionInput["type"],
      transactionDate: new Date(t.transactionDate),
      quantity: Number(t.quantity),
      unitPrice: Number(t.unitPrice),
      totalAmount: Number(t.totalAmount),
    }));

    const updated = calculatePosition(inputs);

    await tx
      .update(positions)
      .set({
        quantity: String(updated.quantity),
        averageCost: String(updated.averageCost),
        isOpen: String(updated.isOpen),
        closedAt: updated.closedAt,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(positions.accountId, target.accountId),
          eq(positions.assetId, target.assetId),
          eq(positions.userId, userId)
        )
      );

    return updated;
  });

  await logAudit({
    userId,
    action: "transaction.deleted",
    resourceType: "transaction",
    resourceId: id,
  });

  return NextResponse.json({ ok: true, position: result });
}
