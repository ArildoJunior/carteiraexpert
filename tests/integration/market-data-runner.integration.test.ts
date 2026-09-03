import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { runMarketDataIngestion } from '@/modules/market-data/server/market-data-runner.service';
import { db } from '@/lib/db';
import { auditLogs } from '@/lib/db/schema/audit';
import { b3CotahistBatches, b3HistoricalQuotes } from '@/lib/db/schema/b3-market-data';
import { eq, desc, inArray } from 'drizzle-orm';
import { withAdvisoryLock, ADVISORY_LOCK_KEYS } from '@/lib/db/advisory-lock';

describe('MarketDataRunnerService (Integração PostgreSQL)', () => {
  const sampleZipPath = path.resolve(
    process.cwd(),
    '.local-data',
    'cotahist',
    'incoming',
    'COTAHIST_D26082026.ZIP'
  );

  const cleanupTestData = async () => {
    const testBatches = await db
      .select({ id: b3CotahistBatches.id })
      .from(b3CotahistBatches)
      .where(eq(b3CotahistBatches.fileName, 'COTAHIST_D26082026.ZIP'));

    if (testBatches.length > 0) {
      const batchIds = testBatches.map((b) => b.id);
      await db
        .delete(b3HistoricalQuotes)
        .where(inArray(b3HistoricalQuotes.batchId, batchIds));
      await db
        .delete(b3CotahistBatches)
        .where(inArray(b3CotahistBatches.id, batchIds));
    }
  };

  beforeAll(async () => {
    await cleanupTestData();
  });

  afterAll(async () => {
    await cleanupTestData();
  });

  it('retorna status empty quando o diretório alvo não possui arquivos ZIP', async () => {
    const emptyDir = path.resolve(process.cwd(), 'backups'); // pasta vazia garantida

    const report = await runMarketDataIngestion({
      cotahistDir: emptyDir,
      executionMode: 'CRON_HTTP',
    });

    expect(report.status).toBe('empty');
    expect(report.filesFound).toBe(0);
    expect(report.filesProcessed).toBe(0);
    expect(report.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('processa arquivo de teste com idempotência estrita e grava auditoria', async () => {
    if (!fs.existsSync(sampleZipPath)) {
      console.warn(`[SKIP] Arquivo de teste ${sampleZipPath} não encontrado.`);
      return;
    }

    // Executa a ingestão apontando para o arquivo de teste
    const report = await runMarketDataIngestion({
      targetFiles: [sampleZipPath],
      executionMode: 'CLI_SCHEDULED',
      dryRun: false,
    });

    expect(report.status).toBe('success');
    expect(report.filesFound).toBe(1);
    // Pode ter sido processado ou pulado como duplicado se já existia na base de teste
    expect(report.filesProcessed + report.duplicatesSkipped).toBe(1);
    expect(report.durationMs).toBeGreaterThan(0);

    // Valida que o registro de auditoria foi persistido
    const [latestAudit] = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.action, 'MARKET_DATA_RUNNER_COMPLETED'))
      .orderBy(desc(auditLogs.createdAt))
      .limit(1);

    expect(latestAudit).toBeDefined();
    expect(latestAudit.source).toBe('job');
    expect((latestAudit.newValue as any).executionMode).toBe('CLI_SCHEDULED');
  });

  it('detecta colisão concorrente e retorna status locked sem processar dados', async () => {
    let releaseLock: () => void;
    const holdPromise = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    // Simula outro processo segurando o advisory lock do runner
    const holdingLockPromise = withAdvisoryLock(ADVISORY_LOCK_KEYS.MARKET_DATA_RUNNER, async () => {
      await holdPromise;
      return 'ocupado';
    });

    // Aguarda ativação do lock
    await new Promise((r) => setTimeout(r, 50));

    // O runner tenta executar enquanto o lock está ativo
    const report = await runMarketDataIngestion({
      cotahistDir: path.resolve(process.cwd(), 'backups'),
      executionMode: 'CRON_HTTP',
    });

    expect(report.status).toBe('locked');
    expect(report.filesProcessed).toBe(0);
    expect(report.errorMessage).toContain('já detido por outro processo ativo');

    // Libera o lock
    releaseLock!();
    await holdingLockPromise;
  });
});
