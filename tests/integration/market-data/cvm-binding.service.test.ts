import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq, inArray, sql } from 'drizzle-orm';
import * as schema from '@/lib/db/schema';
import { cvmBindingService } from '@/modules/market-data/server/cvm-binding.service';
import {
  CvmConflictingActiveBindingError,
  CvmIneligibleAssetTypeError,
} from '@/modules/market-data/domain/cvm-binding.types';

const connectionString =
  process.env.DATABASE_URL_TEST ||
  'postgresql://postgres:postgres@localhost:5432/carteiraexpert_test';

const queryClient = postgres(connectionString, { max: 5 });
const db = drizzle(queryClient, { schema });

describe('CVM Binding Service & Concurrency (Integration)', () => {
  // Sets para rastreamento explícito e controle estrito de IDs criados pela suíte
  const createdCompanyIds = new Set<string>();
  const createdAssetIds = new Set<string>();
  const createdBindingIds = new Set<string>();
  const createdUserIds = new Set<string>();
  const createdAuditRecordIds = new Set<string>();

  let companyPetrId: string;
  let companyValeId: string;
  let companyItauId: string;
  let assetPetr4Id: string;
  let assetPetr3Id: string;
  let assetVale3Id: string;
  let assetFiiId: string;
  let reviewerUserId: string;

  async function cleanupTrackedIds() {
    try {
      // 1. Limpeza de audit_logs estritamente pelos record_ids criados
      const auditIds = Array.from(createdAuditRecordIds);
      const bindingIds = Array.from(createdBindingIds);
      const allRecordIds = Array.from(new Set([...auditIds, ...bindingIds]));

      if (allRecordIds.length > 0) {
        await db
          .delete(schema.auditLogs)
          .where(
            sql`${schema.auditLogs.tableName} = 'cvm_company_assets' AND ${inArray(schema.auditLogs.recordId, allRecordIds)}`
          );
      }

      // 2. Limpeza de cvm_company_assets pelos IDs rastreados
      if (bindingIds.length > 0) {
        await db
          .delete(schema.cvmCompanyAssets)
          .where(inArray(schema.cvmCompanyAssets.id, bindingIds));
      }

      // 3. Limpeza de cvm_companies e vínculos dependentes
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

      // 4. Limpeza de assets pelos IDs rastreados
      const assetIds = Array.from(createdAssetIds);
      if (assetIds.length > 0) {
        await db
          .delete(schema.cvmCompanyAssets)
          .where(inArray(schema.cvmCompanyAssets.assetId, assetIds));

        await db
          .delete(schema.assets)
          .where(inArray(schema.assets.id, assetIds));
      }

      // 5. Limpeza de users pelos IDs rastreados
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
      createdAuditRecordIds.clear();
    }
  }

  beforeEach(async () => {
    // 1. Limpa resíduos de execuções anteriores antes de recriar fixtures isoladas
    await cleanupTrackedIds();

    // 2. Criação de reviewer de teste
    reviewerUserId = crypto.randomUUID();
    createdUserIds.add(reviewerUserId);
    await db.insert(schema.users).values({
      id: reviewerUserId,
      email: `reviewer_${Date.now()}_${crypto.randomUUID().slice(0, 6)}@carteiraexpert.test`,
      name: 'Auditor CVM',
      passwordHash: 'hash_test_reviewer',
    });

    // 3. Criação de Companhias CVM de teste
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
      industrySector: 'Bancos', // Setor inelegível para DFP corporativa padrão
      status: 'ATIVO',
    });

    // 4. Criação de Ativos B3 de teste
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

    assetFiiId = crypto.randomUUID();
    createdAssetIds.add(assetFiiId);
    await db.insert(schema.assets).values({
      id: assetFiiId,
      ticker: `HGLG11_${Date.now()}`,
      name: 'CSHG LOGÍSTICA FII',
      assetType: 'FII',
    });
  });

  afterEach(async () => {
    // Limpeza rigorosa e controlada apenas dos IDs criados no teste
    await cleanupTrackedIds();
  });

  afterAll(async () => {
    // Limpeza final de segurança e encerramento do pool
    await cleanupTrackedIds();
    await queryClient.end();
  });

  describe('Proposta de Vínculo e Auditoria Inicial', () => {
    it('deve criar uma proposta em PENDING_REVIEW e registrar log de auditoria CVM_BINDING_PROPOSED', async () => {
      const binding = await cvmBindingService.proposeBinding(
        {
          companyId: companyPetrId,
          assetId: assetPetr4Id,
          shareClass: 'PN',
          matchMethod: 'CURATED_SEED',
          justification: 'FCA CVM 2024 - Seção 16.1 / Código ISIN BRPETRACNPR6 / PETR4',
          source: 'cvm_seed_2024',
        },
        db
      );

      createdBindingIds.add(binding.id);
      createdAuditRecordIds.add(binding.id);

      expect(binding).toBeDefined();
      expect(binding.status).toBe('PENDING_REVIEW');
      expect(binding.shareClass).toBe('PN');

      // Verifica auditoria
      const logs = await db
        .select()
        .from(schema.auditLogs)
        .where(
          sql`${schema.auditLogs.recordId} = ${binding.id} AND ${schema.auditLogs.action} = 'CVM_BINDING_PROPOSED'`
        );

      expect(logs).toHaveLength(1);
      expect(logs[0].tableName).toBe('cvm_company_assets');
      expect(logs[0].reason).toContain('FCA CVM 2024');
    });

    it('deve rejeitar proposta de ativo inelegível (ex: FII)', async () => {
      await expect(
        cvmBindingService.proposeBinding(
          {
            companyId: companyPetrId,
            assetId: assetFiiId,
            shareClass: 'UNT',
            matchMethod: 'MANUAL',
            justification: 'Tentativa indevida de vincular FII com DFP corporativa',
            source: 'manual',
          },
          db
        )
      ).rejects.toThrow(CvmIneligibleAssetTypeError);
    });
  });

  describe('Homologação, Auditoria e Unicidade Ativa', () => {
    it('deve homologar um vínculo para APPROVED e registrar log CVM_BINDING_APPROVED', async () => {
      const proposed = await cvmBindingService.proposeBinding(
        {
          companyId: companyPetrId,
          assetId: assetPetr4Id,
          shareClass: 'PN',
          matchMethod: 'CURATED_SEED',
          justification: 'FCA CVM 2024 - Seção 16.1 / Código ISIN BRPETRACNPR6 / PETR4',
          source: 'cvm_seed_2024',
        },
        db
      );

      createdBindingIds.add(proposed.id);
      createdAuditRecordIds.add(proposed.id);

      const approved = await cvmBindingService.approveBinding(
        {
          bindingId: proposed.id,
          reviewerId: reviewerUserId,
          justification: 'Homologação confirmada com base no boletim oficial da B3.',
        },
        db
      );

      expect(approved.status).toBe('APPROVED');

      const logs = await db
        .select()
        .from(schema.auditLogs)
        .where(
          sql`${schema.auditLogs.recordId} = ${proposed.id} AND ${schema.auditLogs.action} = 'CVM_BINDING_APPROVED'`
        );

      expect(logs).toHaveLength(1);
      expect(logs[0].actorId).toBe(reviewerUserId);
      expect(logs[0].actorType).toBe('user');
    });

    it('deve ser idempotente em chamadas repetidas de approveBinding', async () => {
      const proposed = await cvmBindingService.proposeBinding(
        {
          companyId: companyValeId,
          assetId: assetVale3Id,
          shareClass: 'ON',
          matchMethod: 'CNPJ_EXACT',
          justification: 'CNPJ exato coincidente com cadastro B3 / VALE3 ON',
          source: 'b3_sync',
        },
        db
      );

      createdBindingIds.add(proposed.id);
      createdAuditRecordIds.add(proposed.id);

      await cvmBindingService.approveBinding(
        {
          bindingId: proposed.id,
          reviewerId: reviewerUserId,
          justification: 'Primeira homologação formal auditada.',
        },
        db
      );

      // Segunda chamada (idempotente)
      const secondCall = await cvmBindingService.approveBinding(
        {
          bindingId: proposed.id,
          reviewerId: reviewerUserId,
          justification: 'Primeira homologação formal auditada.',
        },
        db
      );

      expect(secondCall.status).toBe('APPROVED');

      const logs = await db
        .select()
        .from(schema.auditLogs)
        .where(
          sql`${schema.auditLogs.recordId} = ${proposed.id} AND ${schema.auditLogs.action} = 'CVM_BINDING_APPROVED'`
        );

      expect(logs).toHaveLength(1); // Não gerou log duplicado
    });

    it('deve realizar rollback integral quando o banco de dados falha fisicamente ao persistir audit_logs (sem monkey patch)', async () => {
      const proposed = await cvmBindingService.proposeBinding(
        {
          companyId: companyPetrId,
          assetId: assetPetr3Id,
          shareClass: 'ON',
          matchMethod: 'CURATED_SEED',
          justification: 'FCA CVM 2024 Petrobras ON / PETR3',
          source: 'seed',
        },
        db
      );

      createdBindingIds.add(proposed.id);
      createdAuditRecordIds.add(proposed.id);

      // Criação de trigger físico no PostgreSQL para forçar erro nativo de banco no INSERT de audit_logs
      await db.execute(sql`
        CREATE OR REPLACE FUNCTION trg_fn_force_audit_failure() RETURNS trigger AS $$
        BEGIN
          IF NEW.action = 'CVM_BINDING_APPROVED' AND NEW.reason LIKE '%SIMULATED_PHYSICAL_DB_ERROR%' THEN
            RAISE EXCEPTION 'ERRO_POSTGRES_TRIGGER: Falha fisica forcada pelo PostgreSQL ao gravar audit_logs';
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;

        DROP TRIGGER IF EXISTS trg_test_force_audit_failure ON audit_logs;
        CREATE TRIGGER trg_test_force_audit_failure
        BEFORE INSERT ON audit_logs
        FOR EACH ROW
        EXECUTE FUNCTION trg_fn_force_audit_failure();
      `);

      try {
        await expect(
          cvmBindingService.approveBinding(
            {
              bindingId: proposed.id,
              reviewerId: reviewerUserId,
              justification: 'SIMULATED_PHYSICAL_DB_ERROR: Teste de falha nativa no PostgreSQL.',
            },
            db
          )
        ).rejects.toThrow(/Failed query: insert into "audit_logs"|ERRO_POSTGRES_TRIGGER/);

        // Confirma que no banco o status PERMANECE PENDING_REVIEW (rollback transacional do PostgreSQL funcionou!)
        const [persistedBinding] = await db
          .select()
          .from(schema.cvmCompanyAssets)
          .where(eq(schema.cvmCompanyAssets.id, proposed.id));

        expect(persistedBinding.status).toBe('PENDING_REVIEW');

        // Confirma que nenhum log parcial foi gravado para essa homologação
        const logs = await db
          .select()
          .from(schema.auditLogs)
          .where(
            sql`${schema.auditLogs.recordId} = ${proposed.id} AND ${schema.auditLogs.action} = 'CVM_BINDING_APPROVED'`
          );

        expect(logs).toHaveLength(0);
      } finally {
        await db.execute(sql`
          DROP TRIGGER IF EXISTS trg_test_force_audit_failure ON audit_logs;
          DROP FUNCTION IF EXISTS trg_fn_force_audit_failure();
        `);
      }
    });
  });

  describe('Concorrência e Bloqueio de Múltiplos Vínculos APPROVED para o Mesmo Ativo', () => {
    it('deve impedir que duas companhias distintas possuam vínculo APPROVED simultâneo para o mesmo assetId', async () => {
      // Proposta 1: Petrobras -> assetPetr4Id
      const binding1 = await cvmBindingService.proposeBinding(
        {
          companyId: companyPetrId,
          assetId: assetPetr4Id,
          shareClass: 'PN',
          matchMethod: 'CURATED_SEED',
          justification: 'FCA CVM 2024 Petrobras PN / PETR4',
          source: 'seed',
        },
        db
      );
      createdBindingIds.add(binding1.id);
      createdAuditRecordIds.add(binding1.id);

      // Proposta 2: Vale -> assetPetr4Id (conflito de mesmo ativo!)
      const binding2 = await cvmBindingService.proposeBinding(
        {
          companyId: companyValeId,
          assetId: assetPetr4Id,
          shareClass: 'PN',
          matchMethod: 'MANUAL',
          justification: 'Tentativa conflitante para o mesmo ativo.',
          source: 'manual',
        },
        db
      );
      createdBindingIds.add(binding2.id);
      createdAuditRecordIds.add(binding2.id);

      // Aprova o primeiro
      await cvmBindingService.approveBinding(
        {
          bindingId: binding1.id,
          reviewerId: reviewerUserId,
          justification: 'Homologação legítima da Petrobras.',
        },
        db
      );

      // Tentar aprovar o segundo vínculo para o mesmo ativo deve ser bloqueado
      await expect(
        cvmBindingService.approveBinding(
          {
            bindingId: binding2.id,
            reviewerId: reviewerUserId,
            justification: 'Tentativa indevida de homologar segundo vínculo.',
          },
          db
        )
      ).rejects.toThrow(CvmConflictingActiveBindingError);
    });

    it('deve resolver aprovações concorrentes garantindo que exatamente 1 transação vence sem deadlock', async () => {
      const bindingA = await cvmBindingService.proposeBinding(
        {
          companyId: companyPetrId,
          assetId: assetPetr4Id,
          shareClass: 'PN',
          matchMethod: 'CURATED_SEED',
          justification: 'Proposta A concorrente auditável.',
          source: 'seed_a',
        },
        db
      );
      createdBindingIds.add(bindingA.id);
      createdAuditRecordIds.add(bindingA.id);

      const bindingB = await cvmBindingService.proposeBinding(
        {
          companyId: companyValeId,
          assetId: assetPetr4Id,
          shareClass: 'PN',
          matchMethod: 'MANUAL',
          justification: 'Proposta B concorrente auditável.',
          source: 'seed_b',
        },
        db
      );
      createdBindingIds.add(bindingB.id);
      createdAuditRecordIds.add(bindingB.id);

      const client1 = postgres(connectionString, { max: 1 });
      const client2 = postgres(connectionString, { max: 1 });
      const db1 = drizzle(client1, { schema });
      const db2 = drizzle(client2, { schema });

      try {
        const results = await Promise.allSettled([
          cvmBindingService.approveBinding(
            {
              bindingId: bindingA.id,
              reviewerId: reviewerUserId,
              justification: 'Aprovação paralela Transação 1.',
            },
            db1
          ),
          cvmBindingService.approveBinding(
            {
              bindingId: bindingB.id,
              reviewerId: reviewerUserId,
              justification: 'Aprovação paralela Transação 2.',
            },
            db2
          ),
        ]);

        const fulfilled = results.filter((r) => r.status === 'fulfilled');
        const rejected = results.filter((r) => r.status === 'rejected');

        // Exatamente 1 transação vence e 1 é rejeitada
        expect(fulfilled).toHaveLength(1);
        expect(rejected).toHaveLength(1);

        // Erro da transação perdedora é CvmConflictingActiveBindingError ou violação de unicidade
        const failureReason = (rejected[0] as PromiseRejectedResult).reason;
        expect(
          failureReason instanceof CvmConflictingActiveBindingError ||
          failureReason.message.includes('uq_cvm_company_assets_single_active_approved') ||
          failureReason.message.includes('já possui outro vínculo')
        ).toBe(true);

        // Ausência de deadlock (ambas as promises resolveram/rejeitaram rapidamente)

        // Confirma que no banco há exatamente 1 vínculo APPROVED para o asset_id
        const approvedCount = await db
          .select({ count: sql<number>`count(*)::int` })
          .from(schema.cvmCompanyAssets)
          .where(
            sql`${schema.cvmCompanyAssets.assetId} = ${assetPetr4Id} AND ${schema.cvmCompanyAssets.status} = 'APPROVED'`
          );

        expect(approvedCount[0].count).toBe(1);

        // Consulta final dos dois vínculos no banco
        const [finalBindingA] = await db
          .select()
          .from(schema.cvmCompanyAssets)
          .where(eq(schema.cvmCompanyAssets.id, bindingA.id));

        const [finalBindingB] = await db
          .select()
          .from(schema.cvmCompanyAssets)
          .where(eq(schema.cvmCompanyAssets.id, bindingB.id));

        const statuses = [finalBindingA.status, finalBindingB.status].sort();
        expect(statuses).toEqual(['APPROVED', 'PENDING_REVIEW']); // O perdedor sofreu rollback e permaneceu PENDING_REVIEW
      } finally {
        await client1.end();
        await client2.end();
      }
    });
  });

  describe('Rejeição, Revogação e Reabertura', () => {
    it('deve rejeitar uma proposta com CVM_BINDING_REJECTED', async () => {
      const binding = await cvmBindingService.proposeBinding(
        {
          companyId: companyPetrId,
          assetId: assetPetr4Id,
          shareClass: 'PN',
          matchMethod: 'MANUAL',
          justification: 'Proposta para teste de rejeição.',
          source: 'manual',
        },
        db
      );
      createdBindingIds.add(binding.id);
      createdAuditRecordIds.add(binding.id);

      const rejected = await cvmBindingService.rejectBinding(
        {
          bindingId: binding.id,
          reviewerId: reviewerUserId,
          justification: 'Rejeição fundamentada: documentação incompleta.',
        },
        db
      );

      expect(rejected.status).toBe('REJECTED');

      const logs = await db
        .select()
        .from(schema.auditLogs)
        .where(
          sql`${schema.auditLogs.recordId} = ${binding.id} AND ${schema.auditLogs.action} = 'CVM_BINDING_REJECTED'`
        );

      expect(logs).toHaveLength(1);
    });

    it('deve impedir que uma proposta rebaixe um vínculo APPROVED para PENDING_REVIEW', async () => {
      const binding = await cvmBindingService.proposeBinding(
        {
          companyId: companyPetrId,
          assetId: assetPetr4Id,
          shareClass: 'PN',
          matchMethod: 'CURATED_SEED',
          justification: 'FCA CVM 2024 Petrobras PN / PETR4',
          source: 'seed',
        },
        db
      );
      createdBindingIds.add(binding.id);
      createdAuditRecordIds.add(binding.id);

      await cvmBindingService.approveBinding(
        {
          bindingId: binding.id,
          reviewerId: reviewerUserId,
          justification: 'Homologação oficial aprovada.',
        },
        db
      );

      // Tentativa de repropor o mesmo par já APPROVED deve ser bloqueada
      await expect(
        cvmBindingService.proposeBinding(
          {
            companyId: companyPetrId,
            assetId: assetPetr4Id,
            shareClass: 'PN',
            matchMethod: 'MANUAL',
            justification: 'Tentativa indevida de reproposta para rebaixar vínculo.',
            source: 'manual',
          },
          db
        )
      ).rejects.toThrow(CvmConflictingActiveBindingError);

      // Confirma que no banco o status permanece estritamente APPROVED
      const [persisted] = await db
        .select()
        .from(schema.cvmCompanyAssets)
        .where(eq(schema.cvmCompanyAssets.id, binding.id));

      expect(persisted.status).toBe('APPROVED');
    });

    it('deve rejeitar tentativa de revogação para vínculo em PENDING_REVIEW', async () => {
      const binding = await cvmBindingService.proposeBinding(
        {
          companyId: companyPetrId,
          assetId: assetPetr4Id,
          shareClass: 'PN',
          matchMethod: 'MANUAL',
          justification: 'Proposta pendente de análise.',
          source: 'manual',
        },
        db
      );
      createdBindingIds.add(binding.id);
      createdAuditRecordIds.add(binding.id);

      await expect(
        cvmBindingService.revokeBinding(
          {
            bindingId: binding.id,
            reviewerId: reviewerUserId,
            justification: 'Tentativa inválida de revogar proposta pendente.',
          },
          db
        )
      ).rejects.toThrow(/Operação de revogação inválida: o vínculo encontra-se em PENDING_REVIEW/);
    });

    it('deve rejeitar tentativa de revogação para vínculo em REJECTED', async () => {
      const binding = await cvmBindingService.proposeBinding(
        {
          companyId: companyPetrId,
          assetId: assetPetr4Id,
          shareClass: 'PN',
          matchMethod: 'MANUAL',
          justification: 'Proposta que será rejeitada.',
          source: 'manual',
        },
        db
      );
      createdBindingIds.add(binding.id);
      createdAuditRecordIds.add(binding.id);

      await cvmBindingService.rejectBinding(
        {
          bindingId: binding.id,
          reviewerId: reviewerUserId,
          justification: 'Rejeição inicial.',
        },
        db
      );

      await expect(
        cvmBindingService.revokeBinding(
          {
            bindingId: binding.id,
            reviewerId: reviewerUserId,
            justification: 'Tentativa inválida de revogar vínculo já rejeitado.',
          },
          db
        )
      ).rejects.toThrow(/Operação de revogação inválida: o vínculo já se encontra com status REJECTED/);
    });

    it('deve revogar um vínculo APPROVED emitindo exclusivamente CVM_BINDING_REVOKED sem log CVM_BINDING_REJECTED', async () => {
      const binding = await cvmBindingService.proposeBinding(
        {
          companyId: companyPetrId,
          assetId: assetPetr4Id,
          shareClass: 'PN',
          matchMethod: 'CURATED_SEED',
          justification: 'FCA CVM 2024 - Seção 16.1 / Código ISIN BRPETRACNPR6',
          source: 'seed',
        },
        db
      );
      createdBindingIds.add(binding.id);
      createdAuditRecordIds.add(binding.id);

      await cvmBindingService.approveBinding(
        {
          bindingId: binding.id,
          reviewerId: reviewerUserId,
          justification: 'Homologação inicial.',
        },
        db
      );

      const revoked = await cvmBindingService.revokeBinding(
        {
          bindingId: binding.id,
          reviewerId: reviewerUserId,
          justification: 'Revogação formal: classe de ativo reestruturada na B3.',
        },
        db
      );

      expect(revoked.status).toBe('REJECTED');

      // Verifica que emitiu exclusivamente CVM_BINDING_REVOKED
      const revokedLogs = await db
        .select()
        .from(schema.auditLogs)
        .where(
          sql`${schema.auditLogs.recordId} = ${binding.id} AND ${schema.auditLogs.action} = 'CVM_BINDING_REVOKED'`
        );

      expect(revokedLogs).toHaveLength(1);
      expect(revokedLogs[0].reason).toContain('Revogação formal');

      // Confirma que NÃO emitiu CVM_BINDING_REJECTED
      const rejectedLogs = await db
        .select()
        .from(schema.auditLogs)
        .where(
          sql`${schema.auditLogs.recordId} = ${binding.id} AND ${schema.auditLogs.action} = 'CVM_BINDING_REJECTED'`
        );

      expect(rejectedLogs).toHaveLength(0);
    });

    it('deve realizar rollback integral quando o banco de dados falha ao persistir audit_logs durante a revogação', async () => {
      const binding = await cvmBindingService.proposeBinding(
        {
          companyId: companyPetrId,
          assetId: assetPetr4Id,
          shareClass: 'PN',
          matchMethod: 'CURATED_SEED',
          justification: 'FCA CVM 2024 Petrobras PN / PETR4',
          source: 'seed',
        },
        db
      );
      createdBindingIds.add(binding.id);
      createdAuditRecordIds.add(binding.id);

      await cvmBindingService.approveBinding(
        {
          bindingId: binding.id,
          reviewerId: reviewerUserId,
          justification: 'Aprovação prévia.',
        },
        db
      );

      // Cria trigger nativo no PostgreSQL para falhar apenas no log de CVM_BINDING_REVOKED
      await db.execute(sql`
        CREATE OR REPLACE FUNCTION trg_fn_force_revoke_audit_failure() RETURNS trigger AS $$
        BEGIN
          IF NEW.action = 'CVM_BINDING_REVOKED' AND NEW.reason LIKE '%SIMULATED_REVOKE_DB_ERROR%' THEN
            RAISE EXCEPTION 'ERRO_POSTGRES_REVOKE: Falha simulada ao gravar log de revogacao';
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;

        DROP TRIGGER IF EXISTS trg_test_force_revoke_audit_failure ON audit_logs;
        CREATE TRIGGER trg_test_force_revoke_audit_failure
        BEFORE INSERT ON audit_logs
        FOR EACH ROW
        EXECUTE FUNCTION trg_fn_force_revoke_audit_failure();
      `);

      try {
        await expect(
          cvmBindingService.revokeBinding(
            {
              bindingId: binding.id,
              reviewerId: reviewerUserId,
              justification: 'SIMULATED_REVOKE_DB_ERROR: Teste de falha na revogação.',
            },
            db
          )
        ).rejects.toThrow(/Failed query: insert into "audit_logs"|ERRO_POSTGRES_REVOKE/);

        // Confirma que no banco o status PERMANECE APPROVED (rollback transacional da revogação)
        const [persisted] = await db
          .select()
          .from(schema.cvmCompanyAssets)
          .where(eq(schema.cvmCompanyAssets.id, binding.id));

        expect(persisted.status).toBe('APPROVED');

        // Confirma que nenhum log de CVM_BINDING_REVOKED permaneceu gravado
        const logs = await db
          .select()
          .from(schema.auditLogs)
          .where(
            sql`${schema.auditLogs.recordId} = ${binding.id} AND ${schema.auditLogs.action} = 'CVM_BINDING_REVOKED'`
          );

        expect(logs).toHaveLength(0);
      } finally {
        await db.execute(sql`
          DROP TRIGGER IF EXISTS trg_test_force_revoke_audit_failure ON audit_logs;
          DROP FUNCTION IF EXISTS trg_fn_force_revoke_audit_failure();
        `);
      }
    });

    it('deve reabrir um vínculo REJECTED reutilizando o registro e emitindo CVM_BINDING_REOPENED', async () => {
      const binding = await cvmBindingService.proposeBinding(
        {
          companyId: companyPetrId,
          assetId: assetPetr4Id,
          shareClass: 'PN',
          matchMethod: 'MANUAL',
          justification: 'Proposta inicial rejeitada.',
          source: 'manual',
        },
        db
      );
      createdBindingIds.add(binding.id);
      createdAuditRecordIds.add(binding.id);

      await cvmBindingService.rejectBinding(
        {
          bindingId: binding.id,
          reviewerId: reviewerUserId,
          justification: 'Rejeitado por ausência de comprovante ISIN.',
        },
        db
      );

      // Nova proposta para o mesmo par reabre o registro
      const reopened = await cvmBindingService.proposeBinding(
        {
          companyId: companyPetrId,
          assetId: assetPetr4Id,
          shareClass: 'PN',
          matchMethod: 'CURATED_SEED',
          justification: 'Reabertura com anexo de ISIN oficial BRPETRACNPR6.',
          source: 'seed_v2',
          actorId: reviewerUserId,
        },
        db
      );

      expect(reopened.id).toBe(binding.id); // Reutilizou o mesmo ID e registro
      expect(reopened.status).toBe('PENDING_REVIEW');

      const logs = await db
        .select()
        .from(schema.auditLogs)
        .where(
          sql`${schema.auditLogs.recordId} = ${binding.id} AND ${schema.auditLogs.action} = 'CVM_BINDING_REOPENED'`
        );

      expect(logs).toHaveLength(1);
      expect(logs[0].reason).toContain('Reabertura com anexo');
    });
  });

  describe('Resolução de Ativos para Publicação (resolveActiveAssetsForCompany)', () => {
    it('deve resolver múltiplos ativos aprovados da mesma companhia (PETR3 e PETR4)', async () => {
      const b1 = await cvmBindingService.proposeBinding(
        {
          companyId: companyPetrId,
          assetId: assetPetr3Id,
          shareClass: 'ON',
          matchMethod: 'CURATED_SEED',
          justification: 'FCA CVM 2024 Petrobras ON / PETR3',
          source: 'seed',
        },
        db
      );
      createdBindingIds.add(b1.id);
      createdAuditRecordIds.add(b1.id);

      const b2 = await cvmBindingService.proposeBinding(
        {
          companyId: companyPetrId,
          assetId: assetPetr4Id,
          shareClass: 'PN',
          matchMethod: 'CURATED_SEED',
          justification: 'FCA CVM 2024 Petrobras PN / PETR4',
          source: 'seed',
        },
        db
      );
      createdBindingIds.add(b2.id);
      createdAuditRecordIds.add(b2.id);

      await cvmBindingService.approveBinding(
        { bindingId: b1.id, reviewerId: reviewerUserId, justification: 'Aprovado PETR3' },
        db
      );
      await cvmBindingService.approveBinding(
        { bindingId: b2.id, reviewerId: reviewerUserId, justification: 'Aprovado PETR4' },
        db
      );

      const targets = await cvmBindingService.resolveActiveAssetsForCompany(companyPetrId, db);
      expect(targets).toHaveLength(2);

      const tickers = targets.map((t) => t.ticker);
      expect(tickers.some((t) => t.startsWith('PETR3'))).toBe(true);
      expect(tickers.some((t) => t.startsWith('PETR4'))).toBe(true);
    });

    it('deve retornar [] para companhia pertencente a setor inelegível (ex: Bancos) mesmo com vínculo APPROVED', async () => {
      const assetItub4Id = crypto.randomUUID();
      createdAssetIds.add(assetItub4Id);

      await db.insert(schema.assets).values({
        id: assetItub4Id,
        ticker: `ITUB4_${Date.now()}`,
        name: 'ITAU UNIBANCO PN',
        assetType: 'STOCK',
      });

      const binding = await cvmBindingService.proposeBinding(
        {
          companyId: companyItauId,
          assetId: assetItub4Id,
          shareClass: 'PN',
          matchMethod: 'CURATED_SEED',
          justification: 'FCA CVM 2024 Itaú Unibanco PN / ITUB4',
          source: 'seed',
        },
        db
      );
      createdBindingIds.add(binding.id);
      createdAuditRecordIds.add(binding.id);

      await cvmBindingService.approveBinding(
        { bindingId: binding.id, reviewerId: reviewerUserId, justification: 'Homologação' },
        db
      );

      // Resolução dinâmica verifica que o setor "Bancos" é DISCARD e bloqueia retorno
      const targets = await cvmBindingService.resolveActiveAssetsForCompany(companyItauId, db);
      expect(targets).toHaveLength(0);
    });

    it('deve ignorar vínculos em PENDING_REVIEW ou REJECTED na resolução', async () => {
      const binding = await cvmBindingService.proposeBinding(
        {
          companyId: companyValeId,
          assetId: assetVale3Id,
          shareClass: 'ON',
          matchMethod: 'MANUAL',
          justification: 'Vínculo pendente de aprovação.',
          source: 'manual',
        },
        db
      );
      createdBindingIds.add(binding.id);
      createdAuditRecordIds.add(binding.id);

      const targets = await cvmBindingService.resolveActiveAssetsForCompany(companyValeId, db);
      expect(targets).toHaveLength(0);
    });
  });
});
