import {
  assets,
  brokerConnectionsTable,
  brokerageAccounts,
  importQueueTable,
  positions,
  transactions,
} from "@/db/schema";
import { db } from "@/lib/db";
import type { AssetClass, TransactionType } from "@/lib/db/enums";
import { and, eq, inArray } from "drizzle-orm";
import { tryAdvisoryLock } from "./lock";

export type ApplyResult = {
  imported: number;
  duplicates: number;
  rejected: number;
  errors: number;
  details: Array<{
    itemId: string;
    action: "imported" | "duplicate" | "rejected" | "error";
    transactionId?: string;
    positionId?: string;
    message?: string;
  }>;
};

type QueuePayload = {
  externalId: string;
  accountExternalId: string;
  ticker?: string;
  name?: string;
  assetClass?: string;
  side: string;
  quantity: number;
  price: number;
  fees?: number;
  currency: string;
  occurredAt: string;
};

// BrokerTransactionSide -> transactionType (Cap 4 enum).
// Sides sem equivalente (fee, transfer_in, transfer_out, other) viram 'rejected'.
const SIDE_TO_TYPE: Record<string, TransactionType | null> = {
  buy: "buy",
  sell: "sell",
  dividend: "dividend",
  jcp: "jcp",
  interest: "fixedIncomeCoupon",
  fee: null,
  transfer_in: null,
  transfer_out: null,
  split: "split",
  bonus: "bonus",
  other: null,
};

// Aplica um lote de itens da fila de importacao.
// decision='accept': cria transaction (e position se buy/sell), ou marca duplicate
//   se ja existir transacao igual (mesmo user/asset/data/type/qty/price).
// decision='reject': marca como 'skipped'.
// Tudo dentro de 1 transacao + advisory lock por user (chave 'apply:{userId}').
// Erro em 1 item NAO aborta o lote: item vai como 'error' no details e a queue
// continua 'pending' para retry.
export async function applyQueueItems(
  userId: string,
  itemIds: string[],
  decision: "accept" | "reject"
): Promise<ApplyResult> {
  if (itemIds.length === 0) {
    return { imported: 0, duplicates: 0, rejected: 0, errors: 0, details: [] };
  }

  return await db.transaction(async (tx) => {
    const acquired = await tryAdvisoryLock(`apply:${userId}` as const);
    if (!acquired) {
      throw new Error("Ja existe um apply em andamento para este usuario");
    }

    const result: ApplyResult = {
      imported: 0,
      duplicates: 0,
      rejected: 0,
      errors: 0,
      details: [],
    };

    const items = await tx
      .select()
      .from(importQueueTable)
      .where(
        and(
          inArray(importQueueTable.id, itemIds),
          eq(importQueueTable.userId, userId),
          eq(importQueueTable.reviewStatus, "pending")
        )
      );

    if (items.length === 0) {
      return result;
    }

    for (const item of items) {
      try {
        if (decision === "reject") {
          await tx
            .update(importQueueTable)
            .set({ reviewStatus: "skipped", reviewedAt: new Date() })
            .where(eq(importQueueTable.id, item.id));
          result.rejected++;
          result.details.push({ itemId: item.id, action: "rejected" });
          continue;
        }

        // decision === "accept"
        let payload: QueuePayload;
        try {
          payload = JSON.parse(item.payload) as QueuePayload;
        } catch {
          throw new Error("payload JSON invalido");
        }

        if (
          !payload.ticker ||
          !payload.side ||
          !payload.occurredAt ||
          payload.quantity == null ||
          payload.price == null
        ) {
          throw new Error(
            "payload com campos obrigatorios faltando (ticker, side, occurredAt, quantity, price)"
          );
        }

        const type = SIDE_TO_TYPE[payload.side];
        if (!type) {
          await tx
            .update(importQueueTable)
            .set({ reviewStatus: "skipped", reviewedAt: new Date() })
            .where(eq(importQueueTable.id, item.id));
          result.rejected++;
          result.details.push({
            itemId: item.id,
            action: "rejected",
            message: `Side '${payload.side}' nao suportado para aplicacao`,
          });
          continue;
        }

        // Asset upsert
        const tickerUpper = payload.ticker.toUpperCase();
        let assetId: string;
        const [existingAsset] = await tx
          .select({ id: assets.id })
          .from(assets)
          .where(eq(assets.ticker, tickerUpper))
          .limit(1);
        if (existingAsset) {
          assetId = existingAsset.id;
        } else {
          const [newAsset] = await tx
            .insert(assets)
            .values({
              ticker: tickerUpper,
              name: payload.name ?? tickerUpper,
              assetClass: (payload.assetClass ?? "stock") as AssetClass,
              currency: payload.currency ?? "BRL",
            })
            .returning({ id: assets.id });
          if (!newAsset) throw new Error("Falha ao criar asset");
          assetId = newAsset.id;
        }

        // Resolver accountId: metadata.accountId OU 1a brokerage_account do user
        const [connection] = await tx
          .select()
          .from(brokerConnectionsTable)
          .where(eq(brokerConnectionsTable.id, item.connectionId))
          .limit(1);
        if (!connection) throw new Error("connection nao encontrada");

        let accountId: string | undefined;
        if (connection.metadata) {
          try {
            const meta = JSON.parse(connection.metadata) as { accountId?: string };
            accountId = meta.accountId;
          } catch {
            // metadata malformado - segue pro fallback
          }
        }
        if (!accountId) {
          const [firstAccount] = await tx
            .select({ id: brokerageAccounts.id })
            .from(brokerageAccounts)
            .where(eq(brokerageAccounts.userId, userId))
            .limit(1);
          if (!firstAccount) {
            throw new Error("usuario nao tem brokerage_account cadastrada");
          }
          accountId = firstAccount.id;
        }

        // Dedup contra transactions (6 campos)
        const [existingTx] = await tx
          .select({ id: transactions.id })
          .from(transactions)
          .where(
            and(
              eq(transactions.userId, userId),
              eq(transactions.assetId, assetId),
              eq(transactions.transactionDate, payload.occurredAt),
              eq(transactions.type, type),
              eq(transactions.quantity, String(payload.quantity)),
              eq(transactions.unitPrice, String(payload.price))
            )
          )
          .limit(1);
        if (existingTx) {
          await tx
            .update(importQueueTable)
            .set({
              reviewStatus: "duplicate",
              reviewedAt: new Date(),
              resultingTransactionId: existingTx.id,
            })
            .where(eq(importQueueTable.id, item.id));
          result.duplicates++;
          result.details.push({
            itemId: item.id,
            action: "duplicate",
            transactionId: existingTx.id,
          });
          continue;
        }

        // Position upsert (apenas buy/sell)
        let positionId: string | null = null;
        if (type === "buy" || type === "sell") {
          const [existingPos] = await tx
            .select()
            .from(positions)
            .where(
              and(
                eq(positions.userId, userId),
                eq(positions.accountId, accountId),
                eq(positions.assetId, assetId)
              )
            )
            .limit(1);

          if (existingPos) {
            const existingQty = Number(existingPos.quantity);
            const existingAvg = Number(existingPos.averageCost);
            const newQty = Number(payload.quantity);
            const newPrice = Number(payload.price);

            let finalQty: number;
            let finalAvg: number;
            if (type === "buy") {
              finalQty = existingQty + newQty;
              finalAvg = (existingQty * existingAvg + newQty * newPrice) / finalQty;
            } else {
              finalQty = existingQty - newQty;
              finalAvg = existingAvg;
            }

            await tx
              .update(positions)
              .set({
                quantity: String(finalQty),
                averageCost: String(finalAvg),
                updatedAt: new Date(),
                isOpen: finalQty > 0 ? "true" : "false",
                closedAt: finalQty > 0 ? null : new Date(),
              })
              .where(eq(positions.id, existingPos.id));
            positionId = existingPos.id;
          } else {
            const [newPos] = await tx
              .insert(positions)
              .values({
                userId,
                accountId,
                assetId,
                quantity: String(payload.quantity),
                averageCost: String(payload.price),
                costCurrency: payload.currency ?? "BRL",
                isOpen: "true",
              })
              .returning({ id: positions.id });
            if (!newPos) throw new Error("Falha ao criar position");
            positionId = newPos.id;
          }
        }

        // Criar transaction
        const totalAmount = (Number(payload.quantity) * Number(payload.price)).toFixed(8);
        const [newTx] = await tx
          .insert(transactions)
          .values({
            userId,
            accountId,
            assetId,
            positionId,
            type,
            transactionDate: payload.occurredAt,
            quantity: String(payload.quantity),
            unitPrice: String(payload.price),
            totalAmount,
            fees: String(payload.fees ?? 0),
            currency: payload.currency ?? "BRL",
          })
          .returning({ id: transactions.id });
        if (!newTx) throw new Error("Falha ao criar transaction");

        await tx
          .update(importQueueTable)
          .set({
            reviewStatus: "imported",
            reviewedAt: new Date(),
            resultingPositionId: positionId,
            resultingTransactionId: newTx.id,
          })
          .where(eq(importQueueTable.id, item.id));

        result.imported++;
        result.details.push({
          itemId: item.id,
          action: "imported",
          transactionId: newTx.id,
          positionId: positionId ?? undefined,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        result.errors++;
        result.details.push({ itemId: item.id, action: "error", message });
        // Nao atualiza a queue - deixa 'pending' para retry
      }
    }

    return result;
  });
}
