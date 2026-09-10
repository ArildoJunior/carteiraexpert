import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Decimal } from '@/lib/decimal';
import {
  CvmFiiIngestionService,
} from '@/modules/market-data/server/cvm-fii-ingestion.service';
import {
  CvmFiiAutoApprovalViolationError,
  CvmFiiInvariantViolationError,
  type FiiIngestionPreparationReport,
  type PreparedFiiBindingRecord,
  type PreparedFiiMonthlyRecord,
  type PreparedFiiRegistryRecord,
} from '@/modules/market-data/server/cvm-fii-ingestion.types';

// Mock do módulo de advisory lock para isolamento total do banco de dados
let shouldAcquireLock = true;
let mockLockClient: any;
let executedQueries: string[] = [];
let queryValues: any[][] = [];

vi.mock('@/lib/db/advisory-lock', () => ({
  ADVISORY_LOCK_KEYS: {
    MARKET_DATA_RUNNER: 42100,
    B3_COTAHIST_INGESTION: 42101,
    CVM_DFP_INGESTION: 42102,
    CVM_FII_INGESTION: 42103,
  },
  withAdvisoryLock: vi.fn(async (_key, operation, _options) => {
    if (!shouldAcquireLock) {
      return {
        acquired: false,
        lockedReason: 'Operação bloqueada: lock exclusivo detido por outro processo ativo.',
      };
    }
    const result = await operation(mockLockClient);
    return {
      acquired: true,
      result,
    };
  }),
}));

function createMockPreparationReport(overrides?: {
  registry?: PreparedFiiRegistryRecord[];
  monthly?: PreparedFiiMonthlyRecord[];
  bindings?: PreparedFiiBindingRecord[];
}): FiiIngestionPreparationReport {
  const defaultRegistry: PreparedFiiRegistryRecord[] = [
    {
      cnpj: '11728688000147',
      legalName: 'CSHG LOGISTICA FII',
      tradeName: null,
      ticker: 'HGLG11',
      isin: 'BRHGLGCTF004',
      source: 'cvm',
      sourceUpdatedAt: new Date('2026-08-10'),
    },
    {
      cnpj: '28737771000185',
      legalName: 'XP MALLS FII',
      tradeName: null,
      ticker: 'XPML11',
      isin: 'BRXPMLCTF005',
      source: 'cvm',
      sourceUpdatedAt: new Date('2026-08-10'),
    },
  ];

  const defaultMonthly: PreparedFiiMonthlyRecord[] = [
    {
      fiiRegistryCnpj: '11728688000147',
      referenceDate: '2026-07-31',
      filingDate: new Date('2026-08-12'),
      version: 1,
      source: 'cvm_inf_mensal',
      sourceReference: 'inf_mensal_fii_2026.zip',
      netAssetValue: new Decimal('5237075583.45'),
      quotaEquityValue: new Decimal('155.00000000'),
      issuedQuotas: new Decimal('33787584'),
      totalAssets: new Decimal('5890000000.00'),
      totalLiabilities: new Decimal('652924416.55'),
      cashEquivalents: new Decimal('125430900.00'),
      dividendDeclaredPerQuota: new Decimal('1.10000000'),
      investorsCount: 375420,
      individualInvestorsCount: 371200,
    },
    {
      fiiRegistryCnpj: '28737771000185',
      referenceDate: '2026-07-31',
      filingDate: new Date('2026-08-14'),
      version: 1,
      source: 'cvm_inf_mensal',
      sourceReference: 'inf_mensal_fii_2026.zip',
      netAssetValue: new Decimal('4350120980.12'),
      quotaEquityValue: new Decimal('105.45747830'),
      issuedQuotas: new Decimal('41250000'),
      totalAssets: new Decimal('4800000000.00'),
      totalLiabilities: new Decimal('449879019.88'),
      cashEquivalents: new Decimal('95000000.00'),
      dividendDeclaredPerQuota: new Decimal('0.92000000'),
      investorsCount: 420100,
      individualInvestorsCount: 415000,
    },
  ];

  const defaultBindings: PreparedFiiBindingRecord[] = [
    {
      fiiRegistryCnpj: '11728688000147',
      assetId: 'asset-hglg-11',
      ticker: 'HGLG11',
      bindingStatus: 'PENDING_REVIEW',
      bindingMethod: 'EXACT_ISIN',
      confidenceLevel: 'HIGH',
      justification: 'Candidato legítimo retido como PENDING_REVIEW para auditoria cadastral.',
      source: 'cvm',
    },
    {
      fiiRegistryCnpj: '28737771000185',
      assetId: 'asset-xpml-11',
      ticker: 'XPML11',
      bindingStatus: 'PENDING_REVIEW',
      bindingMethod: 'EXACT_ISIN',
      confidenceLevel: 'HIGH',
      justification: 'Candidato legítimo retido como PENDING_REVIEW para auditoria cadastral.',
      source: 'cvm',
    },
  ];

  return {
    sourceReference: 'inf_mensal_fii_2026.zip',
    executionMode: 'PREPARE_ONLY',
    parserMetrics: {
      totalGeralLines: 2,
      totalComplementoLines: 2,
      totalAtivoPassivoLines: 2,
      parsedRegistryRecords: 2,
      parsedMonthlyRecords: 2,
      skippedCorruptedLines: 0,
      uniqueFundsCount: 2,
      uniqueCompetenciesCount: 1,
    },
    cadastralReport: {
      totalFundsEvaluated: 2,
      matchedCount: 2,
      unmatchedCount: 0,
      ambiguousCount: 0,
      invalidCount: 0,
      results: [],
      matchedMap: new Map(),
      bindingProposals: [],
      approvedBindingsCount: 0,
      pendingReviewBindingsCount: 2,
      ambiguousBindingsCount: 0,
    },
    preparedRegistryRecords: overrides?.registry ?? defaultRegistry,
    preparedMonthlyRecords: overrides?.monthly ?? defaultMonthly,
    preparedBindingRecords: overrides?.bindings ?? defaultBindings,
    unmatchedMonthlyRecords: [],
    eligibleRegistryRecords: overrides?.registry ?? defaultRegistry,
    eligibleMonthlyRecords: overrides?.monthly ?? defaultMonthly,
    summary: {
      totalMonthlyRecordsParsed: 2,
      totalRegistryRecordsPrepared: 2,
      totalMonthlyRecordsPrepared: 2,
      totalBindingProposals: 2,
      approvedBindingsCount: 0,
      pendingReviewBindingsCount: 2,
      ambiguousBindingsCount: 0,
      unmatchedFundsCount: 0,
      uniqueAssetsMatched: 2,
    },
  };
}

describe('CvmFiiIngestionService (Unit Suite - Transacional Isolada)', () => {
  let service: CvmFiiIngestionService;

  // Controladores de simulação de erro no mock SQL
  let failOnRegistryInsert = false;
  let failOnFundamentalsInsert = false;
  let failOnBindingsInsert = false;
  let simulateOrphanFundamentals = false;
  let simulateOrphanBindings = false;
  let simulateUnapprovedActiveConflict = false;
  let simulateBindingConflictNoOp = false;
  let beginCallCount = 0;

  beforeEach(() => {
    service = new CvmFiiIngestionService();
    shouldAcquireLock = true;
    executedQueries = [];
    queryValues = [];
    beginCallCount = 0;

    failOnRegistryInsert = false;
    failOnFundamentalsInsert = false;
    failOnBindingsInsert = false;
    simulateOrphanFundamentals = false;
    simulateOrphanBindings = false;
    simulateUnapprovedActiveConflict = false;
    simulateBindingConflictNoOp = false;

    // Mock do tx que simula o comportamento real do postgres.js
    const txMock = vi.fn((strings: TemplateStringsArray, ...values: any[]) => {
      const query = strings.join('?').trim();
      executedQueries.push(query);
      queryValues.push(values);

      // Inserção em cvm_fii_registry
      if (query.includes('INSERT INTO cvm_fii_registry')) {
        if (failOnRegistryInsert) {
          return Promise.reject(new Error('DB_ERROR: Falha forçada no insert de cvm_fii_registry'));
        }
        const id = values[0];
        const cnpj = values[1];
        return Promise.resolve([{ id, cnpj }]);
      }

      // Inserção em fii_monthly_fundamentals
      if (query.includes('INSERT INTO fii_monthly_fundamentals')) {
        if (failOnFundamentalsInsert) {
          return Promise.reject(new Error('DB_ERROR: Falha forçada no insert de fii_monthly_fundamentals'));
        }
        const id = values[0];
        return Promise.resolve([{ id }]);
      }

      // Inserção em cvm_fii_bindings
      if (query.includes('INSERT INTO cvm_fii_bindings')) {
        if (failOnBindingsInsert) {
          return Promise.reject(new Error('DB_ERROR: Falha forçada no insert de cvm_fii_bindings'));
        }
        if (simulateBindingConflictNoOp) {
          // Simula ON CONFLICT DO NOTHING (retorna array vazio)
          return Promise.resolve([]);
        }
        const id = values[0];
        const binding_status = values[3];
        return Promise.resolve([{ id, binding_status }]);
      }

      // Invariante 1: Fundamentos órfãos
      if (query.includes('FROM fii_monthly_fundamentals f') && query.includes('WHERE r.id IS NULL')) {
        return Promise.resolve([{ count: simulateOrphanFundamentals ? 2 : 0 }]);
      }

      // Invariante 2: Vínculos órfãos de ativo
      if (query.includes('FROM cvm_fii_bindings b') && query.includes('WHERE a.id IS NULL')) {
        return Promise.resolve([{ count: simulateOrphanBindings ? 1 : 0 }]);
      }

      // Invariante 3: Zero Auto-Approval físico
      if (query.includes('FROM cvm_fii_bindings') && query.includes("binding_status = 'APPROVED'")) {
        return Promise.resolve([{ count: simulateUnapprovedActiveConflict ? 1 : 0 }]);
      }

      return Promise.resolve([]);
    });

    mockLockClient = {
      begin: vi.fn(async (cb: (tx: any) => Promise<any>) => {
        beginCallCount++;
        try {
          return await cb(txMock);
        } catch (error) {
          // O driver executa ROLLBACK ao capturar qualquer erro e relança
          throw error;
        }
      }),
    };
  });

  // ─── 1. Governança e Zero Auto-Approval ────────────────────────────────────
  it('1. deve rejeitar e abortar imediatamente caso qualquer proposta de vínculo possua bindingStatus = APPROVED', async () => {
    const report = createMockPreparationReport({
      bindings: [
        {
          fiiRegistryCnpj: '11728688000147',
          assetId: 'asset-hglg-11',
          ticker: 'HGLG11',
          bindingStatus: 'APPROVED' as any, // Tentativa proibida de autoaprovação
          bindingMethod: 'EXACT_ISIN',
          confidenceLevel: 'HIGH',
          justification: 'Violação ilegal de governança',
          source: 'cvm',
        },
      ],
    });

    await expect(
      service.execute({
        preparedReport: report,
      })
    ).rejects.toThrow(CvmFiiAutoApprovalViolationError);

    // Garante que o begin sequer executou mutações
    expect(executedQueries.filter((q) => q.includes('INSERT INTO'))).toHaveLength(0);
  });

  it('2. deve aceitar e preservar propostas legítimas com status PENDING_REVIEW e AMBIGUOUS', async () => {
    const report = createMockPreparationReport({
      bindings: [
        {
          fiiRegistryCnpj: '11728688000147',
          assetId: 'asset-hglg-11',
          ticker: 'HGLG11',
          bindingStatus: 'PENDING_REVIEW',
          bindingMethod: 'EXACT_ISIN',
          confidenceLevel: 'HIGH',
          justification: 'Pendente de revisão humana',
          source: 'cvm',
        },
        {
          fiiRegistryCnpj: '28737771000185',
          assetId: 'asset-xpml-11',
          ticker: 'XPML11',
          bindingStatus: 'AMBIGUOUS',
          bindingMethod: 'EXACT_ISIN',
          confidenceLevel: 'LOW',
          justification: 'Colisão cadastral ambígua',
          source: 'cvm',
        },
      ],
    });

    const result = await service.execute({
      preparedReport: report,
      dryRun: false,
    });

    expect(result.status).toBe('SUCCESS');
    expect(result.metrics.bindings.approvedCount).toBe(0);
    expect(result.metrics.bindings.pendingReviewCount).toBe(1);
    expect(result.metrics.bindings.ambiguousCount).toBe(1);
    expect(result.metrics.bindings.insertedCount).toBe(2);
  });

  // ─── 2. Validações de Invariantes em Memória ───────────────────────────────
  it('3. deve rejeitar o lote se houver CNPJ duplicado no cadastro CVM preparado', async () => {
    const report = createMockPreparationReport({
      registry: [
        {
          cnpj: '11728688000147',
          legalName: 'PRIMEIRO REGISTRO',
          source: 'cvm',
          sourceUpdatedAt: null,
        },
        {
          cnpj: '11728688000147', // CNPJ Duplicado
          legalName: 'SEGUNDO REGISTRO COM MESMO CNPJ',
          source: 'cvm',
          sourceUpdatedAt: null,
        },
      ],
    });

    await expect(
      service.execute({
        preparedReport: report,
      })
    ).rejects.toThrow(CvmFiiInvariantViolationError);
    await expect(
      service.execute({
        preparedReport: report,
      })
    ).rejects.toThrow(/CNPJ duplicado/);
  });

  it('4. deve rejeitar o lote se houver duplicidade contábil na mesma competência e versão', async () => {
    const report = createMockPreparationReport({
      monthly: [
        {
          fiiRegistryCnpj: '11728688000147',
          referenceDate: '2026-07-31',
          filingDate: null,
          version: 1,
          source: 'cvm_inf_mensal',
          sourceReference: 'inf_mensal_fii_2026.zip',
          netAssetValue: new Decimal('1000'),
          quotaEquityValue: null,
          issuedQuotas: null,
          totalAssets: null,
          totalLiabilities: null,
          cashEquivalents: null,
          dividendDeclaredPerQuota: null,
          investorsCount: null,
          individualInvestorsCount: null,
        },
        {
          fiiRegistryCnpj: '11728688000147',
          referenceDate: '2026-07-31',
          filingDate: null,
          version: 1, // Mesma competência e mesma versão!
          source: 'cvm_inf_mensal',
          sourceReference: 'inf_mensal_fii_2026.zip',
          netAssetValue: new Decimal('2000'),
          quotaEquityValue: null,
          issuedQuotas: null,
          totalAssets: null,
          totalLiabilities: null,
          cashEquivalents: null,
          dividendDeclaredPerQuota: null,
          investorsCount: null,
          individualInvestorsCount: null,
        },
      ],
    });

    await expect(
      service.execute({
        preparedReport: report,
      })
    ).rejects.toThrow(CvmFiiInvariantViolationError);
    await expect(
      service.execute({
        preparedReport: report,
      })
    ).rejects.toThrow(/Duplicidade contábil no lote/);
  });

  // ─── 3. Exclusão Mútua e Advisory Lock ─────────────────────────────────────
  it('5. deve retornar status LOCKED de forma controlada quando o advisory lock não for adquirido, sem executar escrita', async () => {
    shouldAcquireLock = false; // Simula lock concorrente retido por outro processo
    const report = createMockPreparationReport();

    const result = await service.execute({
      preparedReport: report,
    });

    expect(result.status).toBe('LOCKED');
    expect(result.lockedReason).toContain('lock exclusivo');
    expect(beginCallCount).toBe(0); // Garante que a transação não foi iniciada
    expect(result.metrics.registry.insertedCount).toBe(0);
    expect(result.metrics.fundamentals.insertedCount).toBe(0);
    expect(result.metrics.bindings.insertedCount).toBe(0);
  });

  it('6. deve garantir ausência de retry automático em caso de falha de lock ou erro transacional', async () => {
    shouldAcquireLock = false;
    const report = createMockPreparationReport();

    await service.execute({ preparedReport: report });

    // Lock verificado uma única vez, sem repetições
    expect(beginCallCount).toBe(0);

    // Agora simula erro no DB
    shouldAcquireLock = true;
    failOnRegistryInsert = true;

    await expect(service.execute({ preparedReport: report })).rejects.toThrow();
    // Exatamente uma execução tentada, sem retries cegos
    expect(beginCallCount).toBe(1);
  });

  // ─── 4. Modo Dry-Run e Atomicidade ─────────────────────────────────────────
  it('7. deve executar todo o fluxo e retornar ROLLED_BACK_DRY_RUN quando dryRun = true', async () => {
    const report = createMockPreparationReport();

    const result = await service.execute({
      preparedReport: report,
      dryRun: true,
    });

    expect(result.status).toBe('ROLLED_BACK_DRY_RUN');
    expect(result.dryRun).toBe(true);
    expect(result.metrics.registry.insertedCount).toBe(2);
    expect(result.metrics.fundamentals.insertedCount).toBe(2);
    expect(result.metrics.bindings.insertedCount).toBe(2);

    // Garante que todas as queries foram submetidas ao banco para validação dentro do tx
    expect(executedQueries.some((q) => q.includes('INSERT INTO cvm_fii_registry'))).toBe(true);
    expect(executedQueries.some((q) => q.includes('INSERT INTO fii_monthly_fundamentals'))).toBe(true);
    expect(executedQueries.some((q) => q.includes('INSERT INTO cvm_fii_bindings'))).toBe(true);
  });

  it('8. deve confirmar que o caminho de dry-run não retorna status SUCCESS', async () => {
    const report = createMockPreparationReport();

    const result = await service.execute({
      preparedReport: report,
      dryRun: true,
    });

    expect(result.status).not.toBe('SUCCESS');
    expect(result.status).toBe('ROLLED_BACK_DRY_RUN');
  });

  // ─── 5. Rollback Lógico em Falhas ──────────────────────────────────────────
  it('9. deve disparar rollback e interromper execução caso ocorra erro na persistência do cadastro', async () => {
    failOnRegistryInsert = true;
    const report = createMockPreparationReport();

    await expect(service.execute({ preparedReport: report })).rejects.toThrow(/Falha forçada no insert de cvm_fii_registry/);

    // Garante que fundamentos e vínculos não foram executados após falha no cadastro
    expect(executedQueries.some((q) => q.includes('INSERT INTO fii_monthly_fundamentals'))).toBe(false);
    expect(executedQueries.some((q) => q.includes('INSERT INTO cvm_fii_bindings'))).toBe(false);
  });

  it('10. deve disparar rollback e interromper execução caso ocorra erro na persistência dos fundamentos', async () => {
    failOnFundamentalsInsert = true;
    const report = createMockPreparationReport();

    await expect(service.execute({ preparedReport: report })).rejects.toThrow(/Falha forçada no insert de fii_monthly_fundamentals/);

    // Vínculos não devem ser processados se fundamentos falharem
    expect(executedQueries.some((q) => q.includes('INSERT INTO cvm_fii_bindings'))).toBe(false);
  });

  it('11. deve disparar rollback e interromper execução caso ocorra erro na persistência dos vínculos', async () => {
    failOnBindingsInsert = true;
    const report = createMockPreparationReport();

    await expect(service.execute({ preparedReport: report })).rejects.toThrow(/Falha forçada no insert de cvm_fii_bindings/);
  });

  // ─── 6. Idempotência e Preservação de Dados Existentes ─────────────────────
  it('12. deve preservar vínculos existentes via ON CONFLICT DO NOTHING sem gerar falhas', async () => {
    simulateBindingConflictNoOp = true; // Simula que os vínculos já existiam e nada foi inserido
    const report = createMockPreparationReport();

    const result = await service.execute({
      preparedReport: report,
      dryRun: false,
    });

    expect(result.status).toBe('SUCCESS');
    expect(result.metrics.bindings.insertedCount).toBe(0);
    expect(result.metrics.bindings.existingPreservedCount).toBe(2);
  });

  it('13. deve preservar vínculos APPROVED previamente existentes sem rebaixá-los', async () => {
    simulateBindingConflictNoOp = true;
    const report = createMockPreparationReport();

    const result = await service.execute({
      preparedReport: report,
      dryRun: false,
    });

    // O ON CONFLICT (fii_registry_id, asset_id) DO NOTHING impede sobrescrita
    expect(executedQueries.some((q) => q.includes('ON CONFLICT (fii_registry_id, asset_id) DO NOTHING'))).toBe(true);
    expect(result.metrics.bindings.existingPreservedCount).toBe(2);
    expect(result.metrics.bindings.approvedCount).toBe(0);
  });

  // ─── 7. Independência de assetId nos Fundamentos ────────────────────────────
  it('14. deve garantir que fundamentos utilizam estritamente fii_registry_id sem dependência de assetId', async () => {
    const report = createMockPreparationReport();

    await service.execute({
      preparedReport: report,
      dryRun: false,
    });

    const fundQueries = executedQueries.filter((q) => q.includes('INSERT INTO fii_monthly_fundamentals'));
    expect(fundQueries.length).toBeGreaterThan(0);

    for (const q of fundQueries) {
      expect(q).toContain('fii_registry_id');
      expect(q).not.toContain('asset_id');
    }
  });

  // ─── 8. Métricas Discriminadas ─────────────────────────────────────────────
  it('15. deve emitir métricas discriminando com precisão inseridos, existentes e ignorados', async () => {
    const report = createMockPreparationReport();

    const result = await service.execute({
      preparedReport: report,
      dryRun: false,
    });

    expect(result.metrics).toEqual({
      registry: {
        totalEvaluated: 2,
        insertedCount: 2,
        updatedCount: 0,
        unchangedCount: 0,
      },
      fundamentals: {
        totalEvaluated: 2,
        insertedCount: 2,
        skippedDuplicatesCount: 0,
      },
      bindings: {
        totalProposals: 2,
        insertedCount: 2,
        existingPreservedCount: 0,
        approvedCount: 0,
        pendingReviewCount: 2,
        ambiguousCount: 0,
      },
    });
  });

  // ─── 9. Invariantes Físicas Pré-Commit ──────────────────────────────────────
  it('16. deve falhar a transação antes do commit caso uma invariante física retorne violação (ex: fundamentos órfãos)', async () => {
    simulateOrphanFundamentals = true; // Simula violação na query de integridade referencial
    const report = createMockPreparationReport();

    await expect(service.execute({ preparedReport: report })).rejects.toThrow(CvmFiiInvariantViolationError);
    await expect(service.execute({ preparedReport: report })).rejects.toThrow(/fundamentos mensais sem entidade correspondente/);
  });
});
