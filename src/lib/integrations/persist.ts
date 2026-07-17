import { importJobsTable, importQueueTable } from "@/db/schema";
import type { ImportPreview } from "@/lib/brokers/types";
import { db } from "@/lib/db";
import { eq } from "drizzle-orm";

export type PersistResult = {
  queued: number;
  duplicates: number;
  errors: number;
  totalRows: number;
};

type QueueInsert = typeof importQueueTable.$inferInsert;

// Persiste o ImportPreview em import_queue.
// Cada transacao vira uma linha com reviewStatus='pending'.
// O canonicalHash (gerado pelo connector como tx.externalId) garante dedup
// via indice unico idx_import_queue_hash.
//
// IMPORTANTE: chamar dentro de db.transaction() para o advisory lock funcionar.
export async function persistImportPreview(
  userId: string,
  preview: ImportPreview,
  jobId: string,
  brokerId: string,
  connectionId: string
): Promise<PersistResult> {
  let queued = 0;
  let duplicates = 0;
  let errors = 0;

  for (const tx of preview.transactions) {
    try {
      const values: QueueInsert = {
        userId,
        connectionId,
        brokerId,
        payload: JSON.stringify(tx),
        canonicalHash: tx.externalId, // ja vem como sha256 slice 16 do connector
        reviewStatus: "pending",
      };

      const result = await db
        .insert(importQueueTable)
        .values(values)
        .onConflictDoNothing({
          target: [importQueueTable.userId, importQueueTable.canonicalHash],
        })
        .returning({ id: importQueueTable.id });

      if (result.length > 0) {
        queued++;
      } else {
        duplicates++;
      }
    } catch (err) {
      errors++;
      console.error("[persist] Erro ao inserir transacao:", err);
    }
  }

  // Atualiza o job com os stats finais
  const finalStatus = errors > 0 && queued === 0 ? "error" : errors > 0 ? "partial" : "success";
  await db
    .update(importJobsTable)
    .set({
      finishedAt: new Date(),
      status: finalStatus,
      rowsRead: String(preview.totalRows),
      rowsImported: String(queued),
      rowsSkipped: String(duplicates),
      rowsQueued: String(queued),
    })
    .where(eq(importJobsTable.id, jobId));

  return { queued, duplicates, errors, totalRows: preview.totalRows };
}
