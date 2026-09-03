/**
 * CarteiraExpert — Lock Distribuído no PostgreSQL (Advisory Locks)
 *
 * Garante exclusão mútua distribuída para jobs, runners e processos batch,
 * impedindo que múltiplas instâncias concorrentes executem a mesma rotina
 * de processamento sobre dados de mercado ou rotinas patrimoniais.
 *
 * Princípios de Engenharia:
 * 1. Utiliza `pg_try_advisory_lock` em nível de sessão PostgreSQL.
 * 2. Garante que a aquisição e a liberação ocorram estritamente sobre a mesma conexão
 *    PostgreSQL dedicada (`max: 1`).
 * 3. Garante liberação incondicional no bloco `finally` via `pg_advisory_unlock`.
 * 4. Caso o processo seja interrompido, o encerramento do socket TCP no PostgreSQL
 *    libera o lock de sessão automaticamente, prevenindo deadlocks permanentes.
 * 5. Chaves numéricas estáveis, documentadas e imutáveis.
 */

import postgres from 'postgres';

// ─── Chaves Estáveis de Advisory Lock ──────────────────────────────────────────
// Chaves numéricas de 64 bits (espaço de chaves reservado para o CarteiraExpert: faixa 42100..42199)
export const ADVISORY_LOCK_KEYS = {
  /** Lock global para orquestrador/runner de dados de mercado */
  MARKET_DATA_RUNNER: 42100,
  /** Lock específico para ingestão de séries históricas B3 COTAHIST */
  B3_COTAHIST_INGESTION: 42101,
  /** Lock específico para ingestão contábil CVM DFP */
  CVM_DFP_INGESTION: 42102,
} as const;

export type AdvisoryLockKey = typeof ADVISORY_LOCK_KEYS[keyof typeof ADVISORY_LOCK_KEYS] | number;

export interface WithAdvisoryLockOptions {
  connectionString?: string;
  onLocked?: () => void;
}

export interface WithAdvisoryLockResult<T> {
  acquired: boolean;
  result?: T;
  lockedReason?: string;
}

/**
 * Obtém a connection string segura para operações de lock.
 */
function resolveConnectionString(override?: string): string {
  if (override) return override;
  if (process.env.VITEST === 'true' && process.env.DATABASE_URL_TEST) {
    return process.env.DATABASE_URL_TEST;
  }
  const url = process.env.DATABASE_URL || process.env.DATABASE_URL_TEST;
  if (!url) {
    throw new Error('DATABASE_URL inválida ou ausente para conexão de advisory lock.');
  }
  return url;
}

/**
 * Executa uma operação protegida por advisory lock exclusivo no PostgreSQL.
 *
 * @param lockKey Chave numérica estável que identifica a exclusão mútua
 * @param operation Função assíncrona a ser executada com exclusividade
 * @param options Opções de conexão e callbacks
 */
export async function withAdvisoryLock<T>(
  lockKey: AdvisoryLockKey,
  operation: (client: postgres.Sql) => Promise<T>,
  options: WithAdvisoryLockOptions = {}
): Promise<WithAdvisoryLockResult<T>> {
  const connectionString = resolveConnectionString(options.connectionString);

  // Conexão dedicada exclusiva (max: 1) para garantir que a aquisição e o unlock
  // ocorram exatamente na mesma sessão de backend do PostgreSQL.
  const lockClient = postgres(connectionString, {
    max: 1,
    idle_timeout: 10,
    connect_timeout: 10,
  });

  try {
    const rows = await lockClient<{ acquired: boolean }[]>`
      SELECT pg_try_advisory_lock(${lockKey}::bigint) AS acquired;
    `;

    const acquired = Boolean(rows[0]?.acquired);

    if (!acquired) {
      if (options.onLocked) {
        options.onLocked();
      }
      return {
        acquired: false,
        lockedReason: `Operação bloqueada: lock exclusivo (chave ${lockKey}) já detido por outro processo ativo.`,
      };
    }

    try {
      const result = await operation(lockClient);
      return {
        acquired: true,
        result,
      };
    } finally {
      // Liberação garantida na mesma conexão antes de encerrá-la
      try {
        await lockClient`SELECT pg_advisory_unlock(${lockKey}::bigint);`;
      } catch (unlockErr) {
        console.error(`[ADVISORY_LOCK] Falha ao executar pg_advisory_unlock para a chave ${lockKey}:`, unlockErr);
      }
    }
  } finally {
    // Fecha a conexão dedicada
    await lockClient.end({ timeout: 5 });
  }
}
