import { brokerageAccounts, positions, transactions } from "@/db/schema";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { logAudit } from "@/lib/db/audit";
import { type TransactionInput, calculatePosition } from "@/lib/portfolio/calc";
import { createTransactionSchema } from "@/lib/validations/transaction";
import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Nao autenticado" }, { status: 401 });
  }

  const url = new URL(req.url);
  const accountId = url.searchParams.get("accountId");
  const assetId = url.searchParams.get("assetId");
  const startDate = url.searchParams.get("startDate");
  const endDate = url.searchParams.get("endDate");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "100"), 500);

  const conditions = [eq(transactions.userId, session.user.id)];
  if (accountId) conditions.push(eq(transactions.accountId, accountId));
  if (assetId) conditions.push(eq(transactions.assetId, assetId));
  if (startDate) conditions.push(gte(transactions.transactionDate, startDate));
  if (endDate) conditions.push(lte(transactions.transactionDate, endDate));

  const rows = await db
    .select()
    .from(transactions)
    .where(and(...conditions))
    .orderBy(desc(transactions.transactionDate))
    .limit(limit);

  return NextResponse.json({ data: rows });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Nao autenticado" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = createTransactionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { message: "Dados invalidos", errors: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const userId = session.user.id;

  // Verificar conta pertence ao user
  const [account] = await db
    .select()
    .from(brokerageAccounts)
    .where(
      and(eq(brokerageAccounts.id, parsed.data.accountId), eq(brokerageAccounts.userId, userId))
    )
    .limit(1);
  if (!account) {
    return NextResponse.json({ message: "Conta nao encontrada" }, { status: 404 });
  }

  // Encontrar posicao existente
  const [existingPosition] = await db
    .select()
    .from(positions)
    .where(
      and(
        eq(positions.accountId, parsed.data.accountId),
        eq(positions.assetId, parsed.data.assetId),
        eq(positions.userId, userId)
      )
    )
    .limit(1);

  // Apenas "buy" pode criar posicao nova (createTransactionSchema so tem 8 tipos do Cap 4)
  let positionId: string;
  if (existingPosition) {
    positionId = existingPosition.id;
  } else if (parsed.data.type === "buy") {
    const [newPosition] = await db
      .insert(positions)
      .values({
        userId,
        accountId: parsed.data.accountId,
        assetId: parsed.data.assetId,
        quantity: String(parsed.data.quantity),
        averageCost: String(parsed.data.unitPrice),
        costCurrency: parsed.data.currency,
      })
      .returning();
    if (!newPosition) {
      return NextResponse.json({ message: "Erro ao criar posicao" }, { status: 500 });
    }
    positionId = newPosition.id;
  } else {
    return NextResponse.json(
      { message: "Posicao nao encontrada para esta operacao" },
      { status: 404 }
    );
  }

  const totalAmount = parsed.data.quantity * parsed.data.unitPrice + (parsed.data.fees ?? 0);

  // Transacao atomica: criar tx + recalcular posicao + atualizar position
  const result = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(transactions)
      .values({
        userId,
        accountId: parsed.data.accountId,
        assetId: parsed.data.assetId,
        positionId,
        type: parsed.data.type,
        transactionDate: parsed.data.transactionDate,
        quantity: String(parsed.data.quantity),
        unitPrice: String(parsed.data.unitPrice),
        totalAmount: String(totalAmount),
        fees: String(parsed.data.fees ?? 0),
        currency: parsed.data.currency,
        notes: parsed.data.notes,
      })
      .returning();

    if (!created) throw new Error("Falha ao criar movimentacao");

    const txs = await tx
      .select()
      .from(transactions)
      .where(
        and(
          eq(transactions.accountId, parsed.data.accountId),
          eq(transactions.assetId, parsed.data.assetId),
          eq(transactions.userId, userId)
        )
      )
      .orderBy(asc(transactions.transactionDate));

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
      .where(eq(positions.id, positionId));

    return { transaction: created, position: updated };
  });

  await logAudit({
    userId,
    action: "transaction.created",
    resourceType: "transaction",
    resourceId: result.transaction.id,
    metadata: {
      type: result.transaction.type,
      quantity: result.transaction.quantity,
      unitPrice: result.transaction.unitPrice,
    },
  });

  return NextResponse.json(result, { status: 201 });
}
