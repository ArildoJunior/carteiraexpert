import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, inArray, sql } from 'drizzle-orm';
import * as schema from '@/lib/db/schema';
import { Decimal } from '@/lib/decimal';
import { cvmBindingService } from '@/modules/market-data/server/cvm-binding.service';
import { cvmFundamentalsPublisherService } from '@/modules/market-data/server/cvm-fundamentals-publisher.service';
import type { CvmRawStatementData } from '@/modules/market-data/domain/cvm-fundamentals.types';

const connectionString =
  process.env.DATABASE_URL_TEST ||
  'postgresql://postgres:postgres@localhost:5432/carteiraexpert_test';

const queryClient = postgres(connectionString, { max: 5 });
const db = drizzle(queryClient, { schema });

describe('CVM Fundamentals Publisher Service (Integration)', () => {
  const createdCompanyIds = new Set<string>();
  const createdAssetIds = new Set<string>();
  const createdBindingIds = new Set<string>();
  const createdUserIds = new Set<string>();
  const createdFundamentalIds = new Set<string>();
  const createdAuditRecordIds = new Set<string>();

  let companyPetrId: string;
  let companyValeId: string;
  let companyItauId: string;
  let assetPetr4Id: string;
  let assetPetr3Id: string;
  let assetVale3Id: string;
  let assetItub4Id: string;
  let reviewerUserId: string;

  async function cleanupTrackedIds() {
    try {
      // 1. Limpeza de audit_logs estritamente pelos record_ids rastreados
      const allRecordIds = Array.from(
        new Set([
          ...Array.from(createdAuditRecordIds),
          ...Array.from(createdFundamentalIds),
          ...Array.from(createdBindingIds),
        ])
      );

      if (allRecordIds.length > 0) {
        await db
          .delete(schema.auditLogs)
          .where(
            sql`${schema.auditLogs.tableName} IN ('asset_fundamentals', 'cvm_company_assets') AND ${inArray(schema.auditLogs.recordId, allRecordIds)}`
          );
      }

      // 2. Limpeza de asset_fundamentals pelos IDs rastreados e pelos assetIds
      const assetIds = Array.from(createdAssetIds);
      if (assetIds.length > 0) {
        await db
          .delete(schema.assetFundamentals)
          .where(inArray(schema.assetFundamentals.assetId, assetIds));
      }

      const fundIds = Array.from(createdFundamentalIds);
      if (fundIds.length > 0) {
        await db
          .delete(schema.assetFundamentals)
          .where(inArray(schema.assetFundamentals.id, fundIds));
      }

      // 3. Limpeza de cvm_company_assets
      const bindingIds = Array.from(createdBindingIds);
      if (bindingIds.length > 0) {
        await db
          .delete(schema.cvmCompanyAssets)
          .where(inArray(schema.cvmCompanyAssets.id, bindingIds));
      }

      // 4. Limpeza de cvm_companies e vínculos
      const compIds = Array.from(createdCompanyIds);
      const testCompanies = await db
        .select({ id: schema.cvmCompanies.id })
        .from(schema.cvmCompanies)
        .where(
          compIds.length > 0
            ? inArray(schema.cvmCompanies.id, compIds)
            : inArray(schema.cvmCompanies.cvmCode, ['009512', '004170', '019348'])
        );

      const targetCompanyIds = testCompanies.map((c) => c.id);
      if (targetCompanyIds.length > 0) {
        await db
          .delete(schema.cvmCompanyAssets)
          .where(inArray(schema.cvmCompanyAssets.companyId, targetCompanyIds));

        await db
          .delete(schema.cvmCompanies)
          .where(inArray(schema.cvmCompanies.id, targetCompanyIds));
      }

      // 5. Limpeza de assets
      if (assetIds.length > 0) {
        await db
          .delete(schema.cvmCompanyAssets)
          .where(inArray(schema.cvmCompanyAssets.assetId, assetIds));

        await db
          .delete(schema.assets)
          .where(inArray(schema.assets.id, assetIds));
      }

      // 6. Limpeza de users
      const userIds = Array.from(createdUserIds);
      if (userIds.length > 0) {
        await db
          .delete(schema.users)
          .where(inArray(schema.users.id, userIds));
      }
    } finally {
      createdCompanyIds.clear();
      createdAssetIds.clear();
      createdBindingIds.clear();
      createdUserIds.clear();
      createdFundamentalIds.clear();
      createdAuditRecordIds.clear();
    }
  }

  beforeEach(async () => {
    await cleanupTrackedIds();

    reviewerUserId = crypto.randomUUID();
    createdUserIds.add(reviewerUserId);
    await db.insert(schema.users).values({
      id: reviewerUserId,
      email: `auditor_${Date.now()}_${crypto.randomUUID().slice(0, 6)}@carteiraexpert.test`,
      name: 'Auditor CVM',
      passwordHash: 'hash_test_auditor',
    });

    // Companhias
    companyPetrId = crypto.randomUUID();
    createdCompanyIds.add(companyPetrId);
    await db.insert(schema.cvmCompanies).values({
      id: companyPetrId,
      cvmCode: '009512',
      cnpj: '33000167000101',
      legalName: 'PETRÓLEO BRASILEIRO S.A. - PETROBRAS',
      industrySector: 'Petróleo e Gás',
      status: 'ATIVO',
    });

    companyValeId = crypto.randomUUID();
    createdCompanyIds.add(companyValeId);
    await db.insert(schema.cvmCompanies).values({
      id: companyValeId,
      cvmCode: '004170',
      cnpj: '33592510000154',
      legalName: 'VALE S.A.',
      industrySector: 'Extração Mineral',
      status: 'ATIVO',
    });

    companyItauId = crypto.randomUUID();
    createdCompanyIds.add(companyItauId);
    await db.insert(schema.cvmCompanies).values({
      id: companyItauId,
      cvmCode: '019348',
      cnpj: '60701190000104',
      legalName: 'ITAÚ UNIBANCO HOLDING S.A.',
      industrySector: 'Bancos', // Setor inelegível
      status: 'ATIVO',
    });

    // Ativos B3
    assetPetr4Id = crypto.randomUUID();
    createdAssetIds.add(assetPetr4Id);
    await db.insert(schema.assets).values({
      id: assetPetr4Id,
      ticker: `PETR4_${Date.now()}`,
      name: 'PETROBRAS PN',
      assetType: 'STOCK',
    });

    assetPetr3Id = crypto.randomUUID();
    createdAssetIds.add(assetPetr3Id);
    await db.insert(schema.assets).values({
      id: assetPetr3Id,
      ticker: `PETR3_${Date.now()}`,
      name: 'PETROBRAS ON',
      assetType: 'STOCK',
    });

    assetVale3Id = crypto.randomUUID();
    createdAssetIds.add(assetVale3Id);
    await db.insert(schema.assets).values({
      id: assetVale3Id,
      ticker: `VALE3_${Date.now()}`,
      name: 'VALE ON',
      assetType: 'STOCK',
    });

    assetItub4Id = crypto.randomUUID();
    createdAssetIds.add(assetItub4Id);
    await db.insert(schema.assets).values({
      id: assetItub4Id,
      ticker: `ITUB4_${Date.now()}`,
      name: 'ITAU UNIBANCO PN',
      assetType: 'STOCK',
    });
  });

  afterEach(async () => {
    await cleanupTrackedIds();
  });

  afterAll(async () => {
    await cleanupTrackedIds();
    await queryClient.end();
  });

  function createSamplePetrobrasStatement(version = 1, statementType: 'CONSOLIDATED' | 'INDIVIDUAL' = 'CONSOLIDATED'): CvmRawStatementData {
    return {
      cnpj: '33000167000101',
      cvmCode: '009512',
      companyLegalName: 'PETRÓLEO BRASILEIRO S.A. - PETROBRAS',
      referenceDate: '2024-12-31',
      periodType: 'annual',
      statementType,
      exerciseOrder: 'ÚLTIMO',
      version,
      filingDate: '2025-03-01',
      accounts: new Map<string, Decimal>([
        ['1', new Decimal('1065000000000.0000')],
        ['1.01', new Decimal('200000000000.0000')],
        ['1.01.01', new Decimal('50000000000.0000')],
        ['2.01', new Decimal('180000000000.0000')],
        ['2.01.04', new Decimal('30000000000.0000')],
        ['2.02', new Decimal('400000000000.0000')],
        ['2.02.01', new Decimal('250000000000.0000')],
        ['2.03', new Decimal('485000000000.0000')],
        ['3.01', new Decimal('511000000000.0000')],
        ['3.03', new Decimal('190000000000.0000')],
        ['3.11', new Decimal('124600000000.0000')],
      ]),
      sourceReference: JSON.stringify({
        source: 'cvm_dfp',
        fileId: 'a0000000-0000-4000-8000-000000000001',
        runId: 'b0000000-0000-4000-8000-000000000002',
        parserVersion: '1.0.0',
      }),
    };
  }

  describe('Publicação com Vínculo APPROVED Único e Múltiplos Ativos', () => {
    it('deve publicar balanço para um ativo B3 com vínculo APPROVED e gerar audit_logs', async () => {
      // 1. Cria e homologa vínculo da Petrobras com PETR4
      const binding = await cvmBindingService.proposeBinding(
        {
          companyId: companyPetrId,
          assetId: assetPetr4Id,
          shareClass: 'PN',
          matchMethod: 'CURATED_SEED',
          justification: 'Vínculo oficial Petrobras PN',
          source: 'seed',
        },
        db
      );
      createdBindingIds.add(binding.id);

      await cvmBindingService.approveBinding(
        {
          bindingId: binding.id,
          reviewerId: reviewerUserId,
          justification: 'Aprovação formal auditada Petrobras PN.',
        },
        db
      );

      // 2. Executa a publicação
      const stmt = createSamplePetrobrasStatement(1);
      const result = await cvmFundamentalsPublisherService.publishStatements(
        {
          statements: [stmt],
          actorId: reviewerUserId,
          actorType: 'system',
        },
        db
      );

      expect(result.totalRecordsPublished).toBe(1);
      expect(result.recordsInserted).toBe(1);
      expect(result.records[0].assetId).toBe(assetPetr4Id);
      expect(result.records[0].referencePeriod).toBe('2024-FY');
      expect(result.records[0].isRestated).toBe(false);

      createdFundamentalIds.add(result.records[0].id);
      createdAuditRecordIds.add(result.records[0].id);

      // 3. Verifica persistência em asset_fundamentals
      const [persisted] = await db
        .select()
        .from(schema.assetFundamentals)
        .where(eq(schema.assetFundamentals.id, result.records[0].id));

      expect(persisted).toBeDefined();
      expect(persisted.netRevenue).toBe('511000000000.0000');
      expect(persisted.netIncome).toBe('124600000000.0000');
      expect(persisted.totalAssets).toBe('1065000000000.0000');
      expect(persisted.totalEquity).toBe('485000000000.0000');
      expect(persisted.grossDebt).toBe('280000000000.0000');
      expect(persisted.cashEquivalents).toBe('50000000000.0000');

      // 4. Verifica auditoria em audit_logs
      const logs = await db
        .select()
        .from(schema.auditLogs)
        .where(
          sql`${schema.auditLogs.recordId} = ${result.records[0].id} AND ${schema.auditLogs.action} = 'CVM_FUNDAMENTALS_PUBLISHED'`
        );

      expect(logs).toHaveLength(1);
      expect(logs[0].tableName).toBe('asset_fundamentals');
      expect(logs[0].reason).toContain('PETR4');
    });

    it('deve publicar balanço para múltiplos ativos B3 aprovados da mesma companhia (PETR3 e PETR4)', async () => {
      // Homologa PETR4 e PETR3
      const binding4 = await cvmBindingService.proposeBinding(
        {
          companyId: companyPetrId,
          assetId: assetPetr4Id,
          shareClass: 'PN',
          matchMethod: 'CURATED_SEED',
          justification: 'Vínculo Petrobras PN PETR4',
          source: 'seed',
        },
        db
      );
      createdBindingIds.add(binding4.id);
      await cvmBindingService.approveBinding({ bindingId: binding4.id, reviewerId: reviewerUserId, justification: 'Homologação oficial PETR4' }, db);

      const binding3 = await cvmBindingService.proposeBinding(
        {
          companyId: companyPetrId,
          assetId: assetPetr3Id,
          shareClass: 'ON',
          matchMethod: 'CURATED_SEED',
          justification: 'Vínculo Petrobras ON PETR3',
          source: 'seed',
        },
        db
      );
      createdBindingIds.add(binding3.id);
      await cvmBindingService.approveBinding({ bindingId: binding3.id, reviewerId: reviewerUserId, justification: 'Homologação oficial PETR3' }, db);

      const stmt = createSamplePetrobrasStatement(1);
      const result = await cvmFundamentalsPublisherService.publishStatements(
        {
          statements: [stmt],
          actorId: reviewerUserId,
        },
        db
      );

      expect(result.totalRecordsPublished).toBe(2);
      expect(result.recordsInserted).toBe(2);

      for (const rec of result.records) {
        createdFundamentalIds.add(rec.id);
        createdAuditRecordIds.add(rec.id);
      }

      const publishedAssetIds = result.records.map((r) => r.assetId).sort();
      expect(publishedAssetIds).toEqual([assetPetr3Id, assetPetr4Id].sort());
    });
  });

  describe('Bloqueios: Companhia Sem Vínculo ou Setor Inelegível', () => {
    it('não deve publicar nada se a companhia não possuir vínculo APPROVED', async () => {
      // Proposta sem homologação (status PENDING_REVIEW)
      const binding = await cvmBindingService.proposeBinding(
        {
          companyId: companyValeId,
          assetId: assetVale3Id,
          shareClass: 'ON',
          matchMethod: 'MANUAL',
          justification: 'Proposta pendente de análise Vale',
          source: 'manual',
        },
        db
      );
      createdBindingIds.add(binding.id);

      const valeStmt: CvmRawStatementData = {
        ...createSamplePetrobrasStatement(1),
        cnpj: '33592510000154',
        cvmCode: '004170',
        companyLegalName: 'VALE S.A.',
      };

      const result = await cvmFundamentalsPublisherService.publishStatements(
        {
          statements: [valeStmt],
          actorId: reviewerUserId,
        },
        db
      );

      expect(result.totalRecordsPublished).toBe(0);
      expect(result.skippedUnboundCompanies).toBe(1);

      // Confirma que nada foi gravado em asset_fundamentals
      const count = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(schema.assetFundamentals)
        .where(eq(schema.assetFundamentals.assetId, assetVale3Id));

      expect(count[0].count).toBe(0);
    });

    it('não deve publicar balanço para companhia pertencente a setor financeiro (Bancos / COSIF)', async () => {
      const binding = await cvmBindingService.proposeBinding(
        {
          companyId: companyItauId,
          assetId: assetItub4Id,
          shareClass: 'PN',
          matchMethod: 'MANUAL',
          justification: 'Vínculo Itaú Unibanco PN',
          source: 'manual',
        },
        db
      );
      createdBindingIds.add(binding.id);
      await cvmBindingService.approveBinding({ bindingId: binding.id, reviewerId: reviewerUserId, justification: 'Homologação vínculo Itaú' }, db);

      const itauStmt: CvmRawStatementData = {
        ...createSamplePetrobrasStatement(1),
        cnpj: '60701190000104',
        cvmCode: '019348',
        companyLegalName: 'ITAÚ UNIBANCO HOLDING S.A.',
      };

      const result = await cvmFundamentalsPublisherService.publishStatements(
        {
          statements: [itauStmt],
          actorId: reviewerUserId,
        },
        db
      );

      expect(result.totalRecordsPublished).toBe(0);
      expect(result.skippedUnboundCompanies).toBe(1);
    });
  });

  describe('Idempotência e Retificação de Versões', () => {
    it('deve ser idempotente em reexecuções da mesma DFP sem duplicar logs de auditoria', async () => {
      const binding = await cvmBindingService.proposeBinding(
        {
          companyId: companyPetrId,
          assetId: assetPetr4Id,
          shareClass: 'PN',
          matchMethod: 'CURATED_SEED',
          justification: 'Vínculo Petrobras PN PETR4',
          source: 'seed',
        },
        db
      );
      createdBindingIds.add(binding.id);
      await cvmBindingService.approveBinding({ bindingId: binding.id, reviewerId: reviewerUserId, justification: 'Homologação oficial PETR4' }, db);

      const stmt = createSamplePetrobrasStatement(1);

      // Primeira execução
      const firstRun = await cvmFundamentalsPublisherService.publishStatements(
        { statements: [stmt], actorId: reviewerUserId },
        db
      );
      expect(firstRun.recordsInserted).toBe(1);
      createdFundamentalIds.add(firstRun.records[0].id);
      createdAuditRecordIds.add(firstRun.records[0].id);

      // Segunda execução com os mesmos dados
      const secondRun = await cvmFundamentalsPublisherService.publishStatements(
        { statements: [stmt], actorId: reviewerUserId },
        db
      );
      expect(secondRun.recordsInserted).toBe(0);
      expect(secondRun.recordsUpdated).toBe(0);
      expect(secondRun.records[0].action).toBe('NO_OP');

      // Verifica que no banco existe apenas 1 registro e apenas 1 log de auditoria
      const records = await db
        .select()
        .from(schema.assetFundamentals)
        .where(eq(schema.assetFundamentals.assetId, assetPetr4Id));
      expect(records).toHaveLength(1);

      const logs = await db
        .select()
        .from(schema.auditLogs)
        .where(eq(schema.auditLogs.recordId, firstRun.records[0].id));
      expect(logs).toHaveLength(1);
    });

    it('deve preservar histórico completo de versões (v1 e v2), marcar is_restated = true e ser idempotente contra retrocesso ou reprocessamento', async () => {
      const binding = await cvmBindingService.proposeBinding(
        {
          companyId: companyPetrId,
          assetId: assetPetr4Id,
          shareClass: 'PN',
          matchMethod: 'CURATED_SEED',
          justification: 'Vínculo Petrobras PN PETR4',
          source: 'seed',
        },
        db
      );
      createdBindingIds.add(binding.id);
      await cvmBindingService.approveBinding({ bindingId: binding.id, reviewerId: reviewerUserId, justification: 'Homologação oficial PETR4' }, db);

      // 1. Publica Versão 1
      const stmtV1 = createSamplePetrobrasStatement(1);
      const resV1 = await cvmFundamentalsPublisherService.publishStatements(
        { statements: [stmtV1], actorId: reviewerUserId },
        db
      );
      expect(resV1.records[0].version).toBe(1);
      expect(resV1.records[0].isRestated).toBe(false);
      expect(resV1.records[0].action).toBe('INSERTED');
      createdFundamentalIds.add(resV1.records[0].id);
      createdAuditRecordIds.add(resV1.records[0].id);

      // 2. Publica Versão 2 (retificada com receita atualizada)
      const stmtV2 = createSamplePetrobrasStatement(2);
      stmtV2.accounts.set('3.01', new Decimal('520000000000.0000'));

      const resV2 = await cvmFundamentalsPublisherService.publishStatements(
        { statements: [stmtV2], actorId: reviewerUserId },
        db
      );

      expect(resV2.records[0].version).toBe(2);
      expect(resV2.records[0].isRestated).toBe(true);
      expect(resV2.records[0].action).toBe('INSERTED');
      createdFundamentalIds.add(resV2.records[0].id);
      createdAuditRecordIds.add(resV2.records[0].id);

      // 3. Verifica que no banco existem exatamente 2 linhas distintas (v1 e v2 preservadas)
      const allVersions = await db
        .select()
        .from(schema.assetFundamentals)
        .where(eq(schema.assetFundamentals.assetId, assetPetr4Id))
        .orderBy(schema.assetFundamentals.version);

      expect(allVersions).toHaveLength(2);
      expect(allVersions[0].version).toBe(1);
      expect(allVersions[0].isRestated).toBe(false);
      expect(allVersions[0].netRevenue).toBe('511000000000.0000');

      expect(allVersions[1].version).toBe(2);
      expect(allVersions[1].isRestated).toBe(true);
      expect(allVersions[1].netRevenue).toBe('520000000000.0000');

      // 4. Verifica auditorias de cada versão
      const logsV1 = await db
        .select()
        .from(schema.auditLogs)
        .where(
          sql`${schema.auditLogs.recordId} = ${resV1.records[0].id} AND ${schema.auditLogs.action} = 'CVM_FUNDAMENTALS_PUBLISHED'`
        );
      expect(logsV1).toHaveLength(1);

      const logsV2 = await db
        .select()
        .from(schema.auditLogs)
        .where(
          sql`${schema.auditLogs.recordId} = ${resV2.records[0].id} AND ${schema.auditLogs.action} = 'CVM_FUNDAMENTALS_RESTATED'`
        );
      expect(logsV2).toHaveLength(1);
      expect(logsV2[0].reason).toContain('Retificação DFP');

      // 5. Repetir publicação de Version = 2 (idempotência de retificação)
      const repeatV2 = await cvmFundamentalsPublisherService.publishStatements(
        { statements: [stmtV2], actorId: reviewerUserId },
        db
      );
      expect(repeatV2.records[0].action).toBe('NO_OP');
      const countV2Logs = await db
        .select()
        .from(schema.auditLogs)
        .where(eq(schema.auditLogs.recordId, resV2.records[0].id));
      expect(countV2Logs).toHaveLength(1); // Sem duplicação de log

      // 6. Tentar publicar Version = 1 após Version = 2 (idempotência contra retrocesso)
      const retroV1 = await cvmFundamentalsPublisherService.publishStatements(
        { statements: [stmtV1], actorId: reviewerUserId },
        db
      );
      expect(retroV1.records[0].action).toBe('NO_OP');

      // Confirma que Version = 2 continua intacta no banco
      const finalCheck = await db
        .select()
        .from(schema.assetFundamentals)
        .where(
          sql`${schema.assetFundamentals.assetId} = ${assetPetr4Id} AND ${schema.assetFundamentals.version} = 2`
        );
      expect(finalCheck[0].netRevenue).toBe('520000000000.0000');
    });
  });

  describe('Rollback Transacional e Concorrência', () => {
    it('deve realizar rollback integral quando o banco falha ao persistir audit_logs', async () => {
      // Cria ativo específico para o teste de falha
      const assetRollbackId = crypto.randomUUID();
      createdAssetIds.add(assetRollbackId);
      const rollbackTicker = `ROLLBACK_${Date.now()}`;
      await db.insert(schema.assets).values({
        id: assetRollbackId,
        ticker: rollbackTicker,
        name: 'ROLLBACK ASSET TEST',
        assetType: 'STOCK',
      });

      const binding = await cvmBindingService.proposeBinding(
        {
          companyId: companyPetrId,
          assetId: assetRollbackId,
          shareClass: 'PN',
          matchMethod: 'CURATED_SEED',
          justification: 'Vínculo para teste de rollback',
          source: 'seed',
        },
        db
      );
      createdBindingIds.add(binding.id);
      await cvmBindingService.approveBinding({ bindingId: binding.id, reviewerId: reviewerUserId, justification: 'Homologação teste rollback' }, db);

      // Cria trigger temporário no PostgreSQL para falhar ao gravar audit_logs
      await db.execute(sql`
        CREATE OR REPLACE FUNCTION trg_fn_force_fundamentals_audit_failure() RETURNS trigger AS $$
        BEGIN
          IF NEW.table_name = 'asset_fundamentals' AND NEW.reason LIKE '%ROLLBACK_%' THEN
            RAISE EXCEPTION 'ERRO_POSTGRES_TRIGGER: Falha forçada de persistência em audit_logs para teste de atomicidade';
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;

        DROP TRIGGER IF EXISTS trg_test_force_fundamentals_audit_failure ON audit_logs;
        CREATE TRIGGER trg_test_force_fundamentals_audit_failure
          BEFORE INSERT ON audit_logs
          FOR EACH ROW
          EXECUTE FUNCTION trg_fn_force_fundamentals_audit_failure();
      `);

      try {
        const stmt = createSamplePetrobrasStatement(1);

        await expect(
          cvmFundamentalsPublisherService.publishStatements(
            { statements: [stmt], actorId: reviewerUserId },
            db
          )
        ).rejects.toThrow(/Failed query: insert into "audit_logs"|ERRO_POSTGRES_TRIGGER/);

        // Confirma que nenhum registro foi persistido em asset_fundamentals (rollback total!)
        const count = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(schema.assetFundamentals)
          .where(eq(schema.assetFundamentals.assetId, assetRollbackId));

        expect(count[0].count).toBe(0);
      } finally {
        await db.execute(sql`
          DROP TRIGGER IF EXISTS trg_test_force_fundamentals_audit_failure ON audit_logs;
          DROP FUNCTION IF EXISTS trg_fn_force_fundamentals_audit_failure();
        `);
      }
    });

    it('deve serializar publicações concorrentes com 2 conexões distintas garantindo exatamente 1 linha e exatamente 1 log de auditoria', async () => {
      const binding = await cvmBindingService.proposeBinding(
        {
          companyId: companyPetrId,
          assetId: assetPetr4Id,
          shareClass: 'PN',
          matchMethod: 'CURATED_SEED',
          justification: 'Vínculo Petrobras PN PETR4',
          source: 'seed',
        },
        db
      );
      createdBindingIds.add(binding.id);
      await cvmBindingService.approveBinding({ bindingId: binding.id, reviewerId: reviewerUserId, justification: 'Homologação oficial PETR4' }, db);

      const client1 = postgres(connectionString, { max: 1 });
      const client2 = postgres(connectionString, { max: 1 });
      const db1 = drizzle(client1, { schema });
      const db2 = drizzle(client2, { schema });

      try {
        const stmt1 = createSamplePetrobrasStatement(1);
        const stmt2 = createSamplePetrobrasStatement(1);

        const results = await Promise.all([
          cvmFundamentalsPublisherService.publishStatements({ statements: [stmt1], actorId: 'client1' }, db1),
          cvmFundamentalsPublisherService.publishStatements({ statements: [stmt2], actorId: 'client2' }, db2),
        ]);

        const actions = results.map((r) => r.records[0].action);
        expect(actions).toContain('INSERTED');
        expect(actions).toContain('NO_OP');

        // Verifica que no banco há exatamente 1 registro para o ativo e período
        const persisted = await db
          .select()
          .from(schema.assetFundamentals)
          .where(
            sql`${schema.assetFundamentals.assetId} = ${assetPetr4Id} AND ${schema.assetFundamentals.referencePeriod} = '2024-FY'`
          );

        expect(persisted).toHaveLength(1);
        createdFundamentalIds.add(persisted[0].id);
        createdAuditRecordIds.add(persisted[0].id);

        // Verifica que no banco há exatamente 1 log de auditoria emitido
        const audits = await db
          .select()
          .from(schema.auditLogs)
          .where(eq(schema.auditLogs.recordId, persisted[0].id));

        expect(audits).toHaveLength(1);
        expect(audits[0].action).toBe('CVM_FUNDAMENTALS_PUBLISHED');
      } finally {
        await client1.end();
        await client2.end();
      }
    });
  });
});
