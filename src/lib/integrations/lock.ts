import { db } from "@/lib/db";
import { sql } from "drizzle-orm";

export type AdvisoryLockKey = `import:${string}`;

// Tenta adquirir lock distribuido via pg_try_advisory_xact_lock.
// O lock e' automaticamente liberado no COMMIT/ROLLBACK da transacao.
// Retorna true se conseguiu, false se outro import esta em andamento.
//
// IMPORTANTE: precisa ser chamado DENTRO de db.transaction().
// Se for chamado fora, o lock e' liberado imediatamente apos a query.
export async function tryAdvisoryLock(key: AdvisoryLockKey): Promise<boolean> {
  const result = await db.execute(
    sql`SELECT pg_try_advisory_xact_lock(hashtext(${key})) AS locked`
  );
  // postgres-js retorna array-like direto
  const rows = result as unknown as Array<{ locked: boolean | "t" | "f" }>;
  const row = rows[0];
  if (!row) return false;
  return row.locked === true || row.locked === "t";
}
