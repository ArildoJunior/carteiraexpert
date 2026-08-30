import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { db } from '../../../src/lib/db';
import { users } from '../../../src/lib/db/schema/identity';
import { assets } from '../../../src/lib/db/schema/portfolio';
import { b3CotahistBatches, b3HistoricalQuotes } from '../../../src/lib/db/schema/b3-market-data';
import { CotahistIngestionService } from '../../../src/modules/market-data/server/cotahist-ingestion.service';
import type { SafeUser } from '../../../src/modules/identity/domain/user.types';

describe('CotahistIngestionService (Integração PostgreSQL)', () => {
  const service = new CotahistIngestionService();
  const testUserId = crypto.randomUUID();
  const testUserEmail = `cotahist_test_${Date.now()}@carteiraexpert.invalid`;

  const testUser: SafeUser = {
    id: testUserId,
    email: testUserEmail,
    name: 'Operador Cotahist Teste',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const sampleDailyZipPath = path.resolve(
    process.cwd(),
    '.local-data',
    'cotahist',
    'incoming',
    'COTAHIST_D26082026.ZIP'
  );

  let globalPetr4Id: string;
  let createdPetr4ByTest = false;

  beforeAll(async () => {
    // Garante que o arquivo de teste existe no ambiente
    expect(fs.existsSync(sampleDailyZipPath)).toBe(true);

    // Cria o usuário de teste
    await db.insert(users).values({
      id: testUserId,
      email: testUserEmail,
      name: testUser.name,
      status: 'active',
      passwordHash: 'hash_placeholder',
    });

    // Localiza ou cria ativo global PETR4 sem apagar dados pré-existentes vinculados
    const [existingPetr4] = await db
      .select()
      .from(assets)
      .where(eq(assets.ticker, 'PETR4'));

    if (existingPetr4) {
      globalPetr4Id = existingPetr4.id;
    } else {
      globalPetr4Id = crypto.randomUUID();
      createdPetr4ByTest = true;
      await db.insert(assets).values({
        id: globalPetr4Id,
        userId: null,
        ticker: 'PETR4',
        name: 'PETROBRAS PN',
        assetType: 'stock',
        market: 'B3',
        currency: 'BRL',
        isCustom: false,
      });
    }

    // Limpa lotes de testes anteriores associados a este arquivo específico se houver
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
  });

  afterAll(async () => {
    // Limpeza estrita apenas dos dados criados durante o teste
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

    if (createdPetr4ByTest && globalPetr4Id) {
      await db.delete(assets).where(eq(assets.id, globalPetr4Id));
    }

    await db.delete(users).where(eq(users.id, testUserId));
  });

  it('deve executar em modo dry-run sem gravar dados no PostgreSQL', async () => {
    const summary = await service.ingestFile(sampleDailyZipPath, {
      dryRun: true,
      userId: testUserId,
    });

    expect(summary.fileName).toBe('COTAHIST_D26082026.ZIP');
    expect(summary.totalLines).toBe(17042);
    expect(summary.quoteCount).toBe(17040);
    expect(summary.acceptedRecords).toBe(17040);

    // Confirma que nada foi inserido no banco
    const [foundBatch] = await db
      .select()
      .from(b3CotahistBatches)
      .where(eq(b3CotahistBatches.sha256, summary.sha256));

    expect(foundBatch).toBeUndefined();
  });

  it('deve realizar a ingestão real do arquivo diário COTAHIST_D26082026.ZIP', async () => {
    const summary = await service.ingestFile(sampleDailyZipPath, {
      dryRun: false,
      userId: testUserId,
      batchSize: 1000,
    });

    expect(summary.status).toBe('COMPLETED');
    expect(summary.totalLines).toBe(17042);
    expect(summary.headerCount).toBe(1);
    expect(summary.quoteCount).toBe(17040);
    expect(summary.trailerCount).toBe(1);
    expect(summary.acceptedRecords).toBe(17040);
    expect(summary.rejectedRecords).toBe(0);
    expect(summary.recordsRead).toBe(17040);
    expect(summary.recordsAccepted).toBe(17040);
    expect(summary.recordsInserted).toBe(17040);
    expect(summary.recordsConflicted).toBe(0);
    expect(summary.recordsRejected).toBe(0);
    expect(summary.skippedAsDuplicate).toBe(false);
    expect(summary.trailerDiscrepancy).toBe(false);
    expect(summary.executionTimeMs).toBeGreaterThan(0);

    // Valida persistência na tabela de lotes b3_cotahist_batches
    const [savedBatch] = await db
      .select()
      .from(b3CotahistBatches)
      .where(eq(b3CotahistBatches.id, summary.batchId));

    expect(savedBatch).toBeDefined();
    expect(savedBatch.status).toBe('COMPLETED');
    expect(savedBatch.quoteCount).toBe(17040);
    expect(savedBatch.recordsInserted).toBe(17040);

    // Valida cotação persistida de PETR4 com vínculo a asset_id no lote específico
    const [petr4Quote] = await db
      .select()
      .from(b3HistoricalQuotes)
      .where(
        and(
          eq(b3HistoricalQuotes.batchId, summary.batchId),
          eq(b3HistoricalQuotes.ticker, 'PETR4')
        )
      )
      .limit(1);

    expect(petr4Quote).toBeDefined();
    expect(petr4Quote.tradeDate).toBe('2026-08-26');
    expect(petr4Quote.bdiCode).toBe('02');
    expect(petr4Quote.marketType).toBe(10);
    expect(petr4Quote.assetId).toBe(globalPetr4Id);
    expect(Number(petr4Quote.closePrice)).toBeGreaterThan(0);
  }, 30000);

  it('deve retornar DUPLICATE e não duplicar registros na reimportação sem --force', async () => {
    const duplicateSummary = await service.ingestFile(sampleDailyZipPath, {
      dryRun: false,
      force: false,
      userId: testUserId,
    });

    expect(duplicateSummary.status).toBe('DUPLICATE');
    expect(duplicateSummary.quoteCount).toBe(17040);
    expect(duplicateSummary.skippedAsDuplicate).toBe(true);
    expect(duplicateSummary.recordsInserted).toBe(0);
  }, 30000);

  it('deve permitir reprocessamento seguro com force: true sem violar unicidade de registros', async () => {
    const forcedSummary = await service.ingestFile(sampleDailyZipPath, {
      dryRun: false,
      force: true,
      userId: testUserId,
      batchSize: 1000,
    });

    expect(forcedSummary.status).toBe('COMPLETED');
    expect(forcedSummary.quoteCount).toBe(17040);
    expect(forcedSummary.recordsRead).toBe(17040);
    expect(forcedSummary.recordsAccepted).toBe(17040);
    expect(forcedSummary.recordsInserted).toBe(0);
    expect(forcedSummary.recordsConflicted).toBe(17040);
  }, 30000);

  it('deve confirmar a ausência de estruturas de unicidade duplicadas para record_hash no PostgreSQL', async () => {
    const constraintsResult = await db.execute<{ constraint_name: string; column_name: string }>(
      sql`
        SELECT 
          tc.constraint_name,
          kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu 
          ON tc.constraint_name = kcu.constraint_name 
          AND tc.table_schema = kcu.table_schema
        WHERE tc.table_name = 'b3_historical_quotes'
          AND tc.constraint_type = 'UNIQUE'
          AND kcu.column_name = 'record_hash';
      `
    );

    const constraints = Array.from(constraintsResult);
    // Deve existir EXATAMENTE uma constraint única para record_hash, com o nome canônico definido na migração
    expect(constraints.length).toBe(1);
    expect(constraints[0].constraint_name).toBe('uq_b3_historical_quotes_record_hash');
  });
});
