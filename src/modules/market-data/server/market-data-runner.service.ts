/**
 * CarteiraExpert — Orquestrador Automatizado de Ingestão de Dados de Mercado
 *
 * Provê execução centralizada, idempotente e segura para ingestão de dados de mercado
 * (B3 COTAHIST e fontes oficiais), utilizada tanto pelo Runner CLI quanto pelo Endpoint HTTP
 * acionado por agendadores externos (cron/Cloud Scheduler).
 *
 * Princípios de Resiliência:
 * 1. Exclusão mútua por Advisory Lock no PostgreSQL (ADVISORY_LOCK_KEYS.MARKET_DATA_RUNNER).
 * 2. Idempotência por verificação de SHA-256 e status COMPLETED em b3_cotahist_batches.
 * 3. Reutilização estrita dos parsers e serviços de domínio existentes (CotahistIngestionService).
 * 4. Registro auditável em audit_logs com contagens precisas e sem vazamento de segredos.
 * 5. Tratamento de diretórios ausentes ou vazios sem falhas críticas.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { auditLogs } from '@/lib/db/schema/audit';
import { ADVISORY_LOCK_KEYS, withAdvisoryLock } from '@/lib/db/advisory-lock';
import { CotahistIngestionService } from './cotahist-ingestion.service';
import type { CotahistBatchSummary } from '../domain/cotahist.types';

export interface MarketDataRunnerOptions {
  /** Modo de execução: 'CLI_MANUAL' | 'CLI_SCHEDULED' | 'CRON_HTTP' */
  executionMode?: 'CLI_MANUAL' | 'CLI_SCHEDULED' | 'CRON_HTTP';
  /** Lista explícita de caminhos de arquivos a processar (opcional) */
  targetFiles?: string[];
  /** Diretório base de busca de arquivos COTAHIST (opcional) */
  cotahistDir?: string;
  /** Se deve simular sem persistência (dry-run) */
  dryRun?: boolean;
  /** Se deve forçar reprocessamento de lotes já existentes */
  force?: boolean;
  /** Se deve ignorar séries de opções de ações (padrão: true para cargas volumosas) */
  skipOptions?: boolean;
  /** Tamanho do lote de inserção no banco (padrão: 1000) */
  batchSize?: number;
  /** ID do usuário operador para auditoria (se houver) */
  userId?: string;
  /** String de conexão para o banco (opcional para testes) */
  connectionString?: string;
}

export interface MarketDataRunnerReport {
  status: 'success' | 'locked' | 'error' | 'empty';
  executionMode: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  filesFound: number;
  filesProcessed: number;
  duplicatesSkipped: number;
  recordsRead: number;
  recordsInserted: number;
  recordsConflicted: number;
  recordsRejected: number;
  errorMessage?: string;
  details?: CotahistBatchSummary[];
}

/**
 * Varre diretórios buscando arquivos .zip de cotações elegíveis,
 * excluindo estritamente diretórios protegidos (como storage/).
 */
export function discoverIncomingCotahistFiles(baseDir?: string): string[] {
  const targetDirs: string[] = [];

  if (baseDir) {
    const resolved = path.isAbsolute(baseDir) ? baseDir : path.resolve(/*turbopackIgnore: true*/ process.cwd(), baseDir);
    targetDirs.push(resolved);
  } else {
    // Diretórios canônicos do CarteiraExpert
    const incomingDir = path.resolve(process.cwd(), '.local-data', 'cotahist', 'incoming');
    const annualDir = path.resolve(process.cwd(), '.local-data', 'cotahist', 'annual');
    targetDirs.push(incomingDir, annualDir);
  }

  const results: string[] = [];

  function scan(dir: string) {
    if (!fs.existsSync(dir)) return;

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // Proteção estrita contra a pasta storage
        if (entry.name.toLowerCase() === 'storage') {
          continue;
        }
        scan(fullPath);
      } else if (entry.isFile() && /\.zip$/i.test(entry.name)) {
        // Exclusão estrita se o caminho contiver /storage/
        const norm = fullPath.replace(/\\/g, '/');
        if (!norm.includes('/storage/')) {
          results.push(fullPath);
        }
      }
    }
  }

  for (const dir of targetDirs) {
    scan(dir);
  }

  // Ordena cronologicamente: Anuais primeiro, depois diários
  results.sort((a, b) => {
    const baseA = path.basename(a).toUpperCase();
    const baseB = path.basename(b).toUpperCase();
    return baseA.localeCompare(baseB);
  });

  return results;
}

/**
 * Executa o ciclo de ingestão automatizado de dados de mercado sob Advisory Lock.
 */
export async function runMarketDataIngestion(
  options: MarketDataRunnerOptions = {}
): Promise<MarketDataRunnerReport> {
  const startTime = Date.now();
  const startedAt = new Date(startTime).toISOString();
  const executionMode = options.executionMode ?? 'CRON_HTTP';
  const dryRun = options.dryRun ?? false;
  const force = options.force ?? false;
  const skipOptions = options.skipOptions ?? true;
  const batchSize = options.batchSize ?? 1000;
  const runCorrelationId = crypto.randomUUID();

  // Executa sob exclusão mútua distribuída
  const lockResult = await withAdvisoryLock(
    ADVISORY_LOCK_KEYS.MARKET_DATA_RUNNER,
    async () => {
      // 1. Identificação de arquivos elegíveis
      let filesToProcess: string[] = [];
      if (options.targetFiles && options.targetFiles.length > 0) {
        filesToProcess = options.targetFiles.filter((f) => {
          const norm = f.replace(/\\/g, '/');
          return fs.existsSync(f) && /\.zip$/i.test(f) && !norm.includes('/storage/');
        });
      } else {
        filesToProcess = discoverIncomingCotahistFiles(options.cotahistDir);
      }

      if (filesToProcess.length === 0) {
        const completedAt = new Date().toISOString();
        return {
          status: 'empty' as const,
          executionMode,
          startedAt,
          completedAt,
          durationMs: Date.now() - startTime,
          filesFound: 0,
          filesProcessed: 0,
          duplicatesSkipped: 0,
          recordsRead: 0,
          recordsInserted: 0,
          recordsConflicted: 0,
          recordsRejected: 0,
        };
      }

      // 2. Processamento sequencial com CotahistIngestionService
      const ingestionService = new CotahistIngestionService();
      const batchSummaries: CotahistBatchSummary[] = [];

      let filesProcessed = 0;
      let duplicatesSkipped = 0;
      let totalRecordsRead = 0;
      let totalRecordsInserted = 0;
      let totalRecordsConflicted = 0;
      let totalRecordsRejected = 0;

      for (const file of filesToProcess) {
        const summary = await ingestionService.ingestFile(file, {
          dryRun,
          force,
          skipOptions,
          batchSize,
          userId: options.userId,
        });

        batchSummaries.push(summary);

        if (summary.status === 'DUPLICATE') {
          duplicatesSkipped++;
        } else {
          filesProcessed++;
        }

        totalRecordsRead += summary.recordsRead || 0;
        totalRecordsInserted += summary.recordsInserted || 0;
        totalRecordsConflicted += summary.recordsConflicted || 0;
        totalRecordsRejected += summary.recordsRejected || 0;
      }

      const completedAt = new Date().toISOString();
      const durationMs = Date.now() - startTime;

      // 3. Auditoria consolidada do runner
      if (!dryRun) {
        try {
          await db.insert(auditLogs).values({
            id: crypto.randomUUID(),
            tableName: 'b3_cotahist_batches',
            recordId: runCorrelationId,
            action: 'MARKET_DATA_RUNNER_COMPLETED',
            actorId: options.userId ?? null,
            actorType: options.userId ? 'user' : 'job',
            source: 'job',
            reason: `Execução de ingestão de mercado finalizada via ${executionMode}`,
            newValue: {
              executionMode,
              filesFound: filesToProcess.length,
              filesProcessed,
              duplicatesSkipped,
              recordsRead: totalRecordsRead,
              recordsInserted: totalRecordsInserted,
              recordsConflicted: totalRecordsConflicted,
              recordsRejected: totalRecordsRejected,
              durationMs,
            },
            createdAt: new Date(),
          });
        } catch (auditErr) {
          console.error('[MARKET_DATA_RUNNER] Erro ao gravar audit log do runner:', auditErr);
        }
      }

      return {
        status: 'success' as const,
        executionMode,
        startedAt,
        completedAt,
        durationMs,
        filesFound: filesToProcess.length,
        filesProcessed,
        duplicatesSkipped,
        recordsRead: totalRecordsRead,
        recordsInserted: totalRecordsInserted,
        recordsConflicted: totalRecordsConflicted,
        recordsRejected: totalRecordsRejected,
        details: batchSummaries,
      };
    },
    {
      connectionString: options.connectionString,
    }
  );

  // Se o lock não foi adquirido (concorrência ativa)
  if (!lockResult.acquired) {
    const completedAt = new Date().toISOString();
    return {
      status: 'locked',
      executionMode,
      startedAt,
      completedAt,
      durationMs: Date.now() - startTime,
      filesFound: 0,
      filesProcessed: 0,
      duplicatesSkipped: 0,
      recordsRead: 0,
      recordsInserted: 0,
      recordsConflicted: 0,
      recordsRejected: 0,
      errorMessage: lockResult.lockedReason ?? 'Lock de ingestão de dados de mercado já ocupado.',
    };
  }

  return lockResult.result!;
}
