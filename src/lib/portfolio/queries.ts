import { transactions } from "@/db/schema";
import { db } from "@/lib/db";
import { and, asc, eq } from "drizzle-orm";
import { type TransactionInput, calculatePosition } from "./calc";

/**
 * Recalcula a posicao de um (accountId, assetId) com base em todas as
 * movimentacoes registradas. Retorna a posicao atualizada ou null
 * se nao houver transacoes.
 *
 * Uso: cron job, scripts de migracao, debug.
 * Dentro de POST /transactions, prefira usar o db.transaction
 * direto para garantir atomicidade (ver rota).
 */
export async function recalculatePosition(accountId: string, assetId: string, userId: string) {
  const txs = await db
    .select()
    .from(transactions)
    .where(
      and(
        eq(transactions.accountId, accountId),
        eq(transactions.assetId, assetId),
        eq(transactions.userId, userId)
      )
    )
    .orderBy(asc(transactions.transactionDate));

  if (txs.length === 0) return null;

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

  return calculatePosition(inputs);
}
