import { sql } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from '@/lib/db/schema';
import { cvmSourceReferenceSchema } from '../domain/cvm.schema';
import type { CvmExecutionMode, CvmSourceReference } from '../domain/cvm.types';

export class CvmConcurrencyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CvmConcurrencyError';
  }
}

export interface CvmRunCompletionMetrics {
  companiesRead: number;
  statementsInserted: number;
  statementsUpdated: number;
  statementsSkipped: number;
}

/**
 * Adquire o lease exclusivo sobre o arquivo e inicia um novo run em estado RUNNING.
 * Ordem canônica de locks:
 * 1. cvm_source_files (FOR UPDATE)
 * 2. cvm_ingestion_runs (transição de runs expirados para ABANDONED e checagem de exclusão mútua)
 */
export async function acquireCvmFileLease(
  tx: PostgresJsDatabase<typeof schema>,
  params: {
    fileId: string;
    workerId: string;
    parserVersion?: string;
    executionMode?: CvmExecutionMode;
    leaseDurationMinutes?: number;
  }
): Promise<{ runId: string; lockExpiresAt: Date }> {
  const {
    fileId,
    workerId,
    parserVersion = '1.0.0',
    executionMode = 'CLI_MANUAL',
    leaseDurationMinutes = 2,
  } = params;

  // 1. PRIMEIRO: Bloqueia a linha do arquivo físico
  const sourceFileRows = await tx.execute<{ id: string; status: string }>(
    sql`SELECT id, status FROM cvm_source_files WHERE id = ${fileId}::uuid FOR UPDATE`
  );

  if (sourceFileRows.length === 0) {
    throw new CvmConcurrencyError(`Arquivo CVM com id ${fileId} não encontrado.`);
  }

  // 2. SEGUNDO: Transita runs anteriores expirados para ABANDONED
  await tx.execute(
    sql`
      UPDATE cvm_ingestion_runs
      SET status = 'ABANDONED',
          error_message = 'Lease expirado: worker anterior inativo ou interrompido',
          completed_at = NOW(),
          updated_at = NOW()
      WHERE file_id = ${fileId}::uuid
        AND status = 'RUNNING'
        AND lock_expires_at <= NOW()
    `
  );

  // 3. Verifica se ainda existe algum run ativo e com lease vigente
  const activeRuns = await tx.execute<{ id: string; worker_id: string }>(
    sql`
      SELECT id, worker_id 
      FROM cvm_ingestion_runs 
      WHERE file_id = ${fileId}::uuid 
        AND status = 'RUNNING' 
        AND lock_expires_at > NOW()
    `
  );

  if (activeRuns.length > 0) {
    throw new CvmConcurrencyError(
      `O arquivo ${fileId} já está sob processamento ativo pelo worker ${activeRuns[0].worker_id}.`
    );
  }

  // 4. Cria o novo run com status 'RUNNING'
  const newRunId = crypto.randomUUID();
  const lockExpiresAt = new Date(Date.now() + leaseDurationMinutes * 60 * 1000);

  await tx.execute(
    sql`
      INSERT INTO cvm_ingestion_runs (
        id, file_id, worker_id, parser_version, execution_mode,
        status, heartbeat_at, lock_expires_at, started_at, created_at, updated_at
      ) VALUES (
        ${newRunId}::uuid, ${fileId}::uuid, ${workerId}::uuid, ${parserVersion}, ${executionMode},
        'RUNNING', NOW(), ${lockExpiresAt.toISOString()}::timestamptz, NOW(), NOW(), NOW()
      )
    `
  );

  return { runId: newRunId, lockExpiresAt };
}

/**
 * Renova o heartbeat do lease durante o processamento em streaming.
 * Ordem canônica de locks:
 * 1. cvm_source_files (FOR UPDATE)
 * 2. cvm_ingestion_runs (UPDATE com verificação quadrupla e rowCount === 1)
 */
export async function renewCvmHeartbeat(
  tx: PostgresJsDatabase<typeof schema>,
  params: {
    fileId: string;
    runId: string;
    workerId: string;
    leaseExtensionMinutes?: number;
  }
): Promise<Date> {
  const { fileId, runId, workerId, leaseExtensionMinutes = 2 } = params;

  // 1. Bloqueia o arquivo físico
  await tx.execute(
    sql`SELECT id FROM cvm_source_files WHERE id = ${fileId}::uuid FOR UPDATE`
  );

  // 2. Renova o lease exigindo status RUNNING e lease vigente
  const newLockExpiresAt = new Date(Date.now() + leaseExtensionMinutes * 60 * 1000);

  const result = await tx.execute(
    sql`
      UPDATE cvm_ingestion_runs
      SET heartbeat_at = NOW(),
          lock_expires_at = ${newLockExpiresAt.toISOString()}::timestamptz,
          updated_at = NOW()
      WHERE id = ${runId}::uuid
        AND worker_id = ${workerId}::uuid
        AND status = 'RUNNING'
        AND lock_expires_at > NOW()
    `
  );

  // Exigência estrita de rowCount === 1
  if ((result as unknown as { count: number }).count !== 1) {
    throw new CvmConcurrencyError(
      `Falha ao renovar heartbeat: lease do run ${runId} foi perdido ou expirou.`
    );
  }

  return newLockExpiresAt;
}

/**
 * Conclui o run marcando como COMPLETED após persistência com guarda estrita quadrupla.
 * Se rowCount !== 1, lança erro para provocar ROLLBACK integral.
 */
export async function completeCvmRun(
  tx: PostgresJsDatabase<typeof schema>,
  params: {
    fileId: string;
    runId: string;
    workerId: string;
    metrics: CvmRunCompletionMetrics;
  }
): Promise<void> {
  const { fileId, runId, workerId, metrics } = params;

  // 1. Bloqueia o arquivo físico
  await tx.execute(
    sql`SELECT id FROM cvm_source_files WHERE id = ${fileId}::uuid FOR UPDATE`
  );

  // 2. Bloqueia o run ativo
  await tx.execute(
    sql`
      SELECT id FROM cvm_ingestion_runs
      WHERE id = ${runId}::uuid
        AND worker_id = ${workerId}::uuid
        AND status = 'RUNNING'
        AND lock_expires_at > NOW()
      FOR UPDATE
    `
  );

  // 3. Atualização atômica do status do run
  const result = await tx.execute(
    sql`
      UPDATE cvm_ingestion_runs
      SET status = 'COMPLETED',
          completed_at = NOW(),
          companies_read = ${metrics.companiesRead},
          statements_inserted = ${metrics.statementsInserted},
          statements_updated = ${metrics.statementsUpdated},
          statements_skipped = ${metrics.statementsSkipped},
          updated_at = NOW()
      WHERE id = ${runId}::uuid
        AND worker_id = ${workerId}::uuid
        AND status = 'RUNNING'
        AND lock_expires_at > NOW()
    `
  );

  if ((result as unknown as { count: number }).count !== 1) {
    throw new CvmConcurrencyError(
      `[ATOMIC_PERSISTENCE_FAILED] Falha ao concluir o run ${runId}: lease expirado ou status alterado durante a persistência. Rollback total disparado.`
    );
  }
}

/**
 * Registra falha da execução marcando o run como FAILED.
 */
export async function failCvmRun(
  tx: PostgresJsDatabase<typeof schema>,
  params: {
    fileId: string;
    runId: string;
    workerId: string;
    errorMessage: string;
  }
): Promise<void> {
  const { fileId, runId, workerId, errorMessage } = params;

  // 1. Bloqueia o arquivo físico
  await tx.execute(
    sql`SELECT id FROM cvm_source_files WHERE id = ${fileId}::uuid FOR UPDATE`
  );

  // 2. Marca o run como FAILED
  await tx.execute(
    sql`
      UPDATE cvm_ingestion_runs
      SET status = 'FAILED',
          completed_at = NOW(),
          error_message = ${errorMessage},
          updated_at = NOW()
      WHERE id = ${runId}::uuid
        AND worker_id = ${workerId}::uuid
    `
  );
}

/**
 * Validação rigorosa em memória do payload de sourceReference contra o contrato canônico.
 */
export function buildAndValidateCvmSourceReference(params: {
  fileId: string;
  runId: string;
  cnpj: string;
  cvmCode: string;
  referenceDate: string;
  periodType: 'annual' | 'quarterly' | 'ttm';
  statementType: 'CONSOLIDATED' | 'INDIVIDUAL';
  version: number;
  parserVersion: string;
}): string {
  const payload: CvmSourceReference = {
    source: 'cvm_dfp',
    fileId: params.fileId,
    runId: params.runId,
    cnpj: params.cnpj.replace(/\D/g, '').padStart(14, '0'),
    cvmCode: params.cvmCode.replace(/\D/g, '').padStart(6, '0'),
    referenceDate: params.referenceDate,
    periodType: params.periodType,
    statementType: params.statementType,
    exerciseOrder: 'ÚLTIMO',
    version: params.version,
    parserVersion: params.parserVersion,
    entityLevel: 'COMPANY',
    assetBindingPurpose: 'PUBLICATION_ALIAS',
  };

  const parsed = cvmSourceReferenceSchema.parse(payload);
  return JSON.stringify(parsed);
}
