/**
 * CarteiraExpert — Serviço Transacional de Ingestão e Persistência de FIIs da CVM
 *
 * Responsabilidade:
 * Executa a persistência transacional das três coleções desacopladas de FIIs:
 * 1. cvm_fii_registry (100% dos fundos CVM preservados por CNPJ, sem dependência de assetId).
 * 2. fii_monthly_fundamentals (isolados por fii_registry_id, competência e versão contábil).
 * 3. cvm_fii_bindings (propostas de vínculo com ativos B3 com Zero Auto-Approval).
 *
 * Princípios de Resiliência e Governança:
 * 1. Exclusão mútua por Advisory Lock no PostgreSQL (ADVISORY_LOCK_KEYS.CVM_FII_INGESTION: 42103).
 * 2. Transação ACID única (BEGIN ... COMMIT ... ROLLBACK).
 * 3. Suporte nativo a modo dryRun com rollback automático obrigatório.
 * 4. Validação de invariantes rígidas antes do commit (Zero Auto-Approval, integridade referencial).
 * 5. Idempotência por constraints únicas de banco, preservando histórico e decisões humanas existentes.
 */

import crypto from 'node:crypto';
import postgres from 'postgres';
import { ADVISORY_LOCK_KEYS, withAdvisoryLock } from '@/lib/db/advisory-lock';
import { FiiCadastralResolverEngine } from '../domain/cvm-fii-cadastral-resolver';
import type {
  CanonicalFiiAssetInput,
  ExistingFiiBindingInput,
} from '../domain/cvm-fii-cadastral-resolver.types';
import { prepareFiiMonthlyPackage } from './cvm-fii-ingestion-preparer';
import {
  CvmFiiAutoApprovalViolationError,
  CvmFiiInvariantViolationError,
  type CvmFiiIngestionMetrics,
  type CvmFiiIngestionOptions,
  type CvmFiiIngestionResult,
  type FiiIngestionPreparationReport,
  type PreparedFiiBindingRecord,
  type PreparedFiiMonthlyRecord,
  type PreparedFiiRegistryRecord,
} from './cvm-fii-ingestion.types';

/**
 * Sinal interno de controle utilizado para forçar ROLLBACK limpo da transação em modo dryRun.
 */
class CvmFiiDryRunRollbackSignal extends Error {
  constructor(public readonly metrics: CvmFiiIngestionMetrics) {
    super('CVM_FII_DRY_RUN_ROLLBACK_SIGNAL');
    this.name = 'CvmFiiDryRunRollbackSignal';
  }
}

export class CvmFiiIngestionService {
  /**
   * Executa a ingestão e persistência transacional de um pacote mensal de FIIs.
   */
  public async execute(
    options: CvmFiiIngestionOptions
  ): Promise<CvmFiiIngestionResult> {
    const startedAt = new Date();
    const dryRun = options.dryRun ?? false;
    const batchChunkSize = options.batchChunkSize ?? 250;

    if (!options.packageInput && !options.preparedReport) {
      throw new Error(
        'CvmFiiIngestionService requer "packageInput" ou "preparedReport" prévio.'
      );
    }

    const sourceReference =
      options.preparedReport?.sourceReference ??
      options.packageInput?.sourceReference ??
      'inf_mensal_fii_unknown.zip';

    // ─── 1. Exclusão Mútua por Advisory Lock ──────────────────────────────────
    const lockResult = await withAdvisoryLock(
      ADVISORY_LOCK_KEYS.CVM_FII_INGESTION,
      async (client) => {
        // ─── 2. Fase de Preparação (Separada da Persistência) ─────────────────
        const report = await this.resolvePreparationReport(client, options);

        // ─── 3. Fase de Persistência Transacional ─────────────────────────────
        return this.persistReportInTransaction(
          client,
          report,
          dryRun,
          batchChunkSize
        );
      },
      {
        connectionString: options.connectionString,
      }
    );

    const completedAt = new Date();
    const durationMs = completedAt.getTime() - startedAt.getTime();

    // Se o lock não foi adquirido, retorna bloqueio controlado sem mutações
    if (!lockResult.acquired) {
      return {
        status: 'LOCKED',
        dryRun,
        sourceReference,
        startedAt,
        completedAt,
        durationMs,
        metrics: this.createEmptyMetrics(),
        lockedReason:
          lockResult.lockedReason ??
          'Operação bloqueada: ingestão concorrente de FIIs em execução.',
      };
    }

    const txResult = lockResult.result!;
    return {
      status: txResult.status,
      dryRun,
      sourceReference,
      startedAt,
      completedAt,
      durationMs,
      metrics: txResult.metrics,
      preparationSummary: options.preparedReport?.summary,
      errorMessage: txResult.errorMessage,
    };
  }

  /**
   * Obtém ou prepara o relatório em memória.
   */
  private async resolvePreparationReport(
    client: postgres.Sql,
    options: CvmFiiIngestionOptions
  ): Promise<FiiIngestionPreparationReport> {
    if (options.preparedReport) {
      return options.preparedReport;
    }

    // Carrega o catálogo B3 de ativos FII a partir do banco
    const fiiAssets = await client`
      SELECT a.id, a.ticker, a.name, a.asset_type, q.isin
      FROM assets a
      LEFT JOIN (
        SELECT DISTINCT ON (ticker) ticker, isin
        FROM b3_historical_quotes
        WHERE ticker IN (SELECT ticker FROM assets WHERE lower(asset_type) = 'fii')
          AND isin IS NOT NULL AND isin != ''
        ORDER BY ticker, trade_date DESC
      ) q ON upper(a.ticker) = upper(q.ticker)
      WHERE lower(a.asset_type) = 'fii'
      ORDER BY a.ticker;
    `;

    const canonicalAssets: CanonicalFiiAssetInput[] = fiiAssets.map((a) => ({
      id: a.id,
      ticker: a.ticker,
      name: a.name,
      assetType: 'fii',
      isin: a.isin ?? null,
    }));

    // Carrega vínculos existentes homologados para retroalimentação do resolver
    const existingBindingsRows = await client`
      SELECT b.asset_id, b.binding_status, b.binding_method, b.confidence_level, r.cnpj, a.ticker
      FROM cvm_fii_bindings b
      INNER JOIN cvm_fii_registry r ON b.fii_registry_id = r.id
      INNER JOIN assets a ON b.asset_id = a.id
      WHERE b.binding_status = 'APPROVED';
    `;

    const existingBindings: ExistingFiiBindingInput[] =
      existingBindingsRows.map((b) => ({
        cnpj: b.cnpj,
        assetId: b.asset_id,
        ticker: b.ticker,
        bindingStatus: b.binding_status,
        bindingMethod: b.binding_method,
        confidenceLevel: b.confidence_level,
      }));

    const resolverEngine = new FiiCadastralResolverEngine({
      canonicalAssets,
      existingBindings,
    });

    return prepareFiiMonthlyPackage({
      input: options.packageInput!,
      resolverEngine,
      executionMode: 'PREPARE_ONLY',
    });
  }

  /**
   * Executa a transação no PostgreSQL com verificação estrita de invariantes.
   */
  private async persistReportInTransaction(
    client: postgres.Sql,
    report: FiiIngestionPreparationReport,
    dryRun: boolean,
    chunkSize: number
  ): Promise<{
    status: 'SUCCESS' | 'ROLLED_BACK_DRY_RUN';
    metrics: CvmFiiIngestionMetrics;
    errorMessage?: string;
  }> {
    // ─── Validação Prévia em Memória de Invariantes Rígidas ───────────────────
    this.assertInMemoryInvariants(report);

    const metrics: CvmFiiIngestionMetrics = {
      registry: {
        totalEvaluated: report.preparedRegistryRecords.length,
        insertedCount: 0,
        updatedCount: 0,
        unchangedCount: 0,
      },
      fundamentals: {
        totalEvaluated: report.preparedMonthlyRecords.length,
        insertedCount: 0,
        skippedDuplicatesCount: 0,
      },
      bindings: {
        totalProposals: report.preparedBindingRecords.length,
        insertedCount: 0,
        existingPreservedCount: 0,
        approvedCount: 0,
        pendingReviewCount: 0,
        ambiguousCount: 0,
      },
    };

    try {
      await client.begin(async (tx) => {
        // 1. Persistência de cvm_fii_registry (Entidades CVM)
        const cnpjToRegistryIdMap = await this.persistRegistryRecords(
          tx,
          report.preparedRegistryRecords,
          metrics,
          chunkSize
        );

        // 2. Persistência de fii_monthly_fundamentals (Demonstrações Contábeis)
        await this.persistMonthlyFundamentals(
          tx,
          report.preparedMonthlyRecords,
          cnpjToRegistryIdMap,
          metrics,
          chunkSize
        );

        // 3. Persistência de cvm_fii_bindings (Propostas de Vínculo Auditáveis)
        await this.persistBindingProposals(
          tx,
          report.preparedBindingRecords,
          cnpjToRegistryIdMap,
          metrics,
          chunkSize
        );

        // 4. Verificação de Invariantes Físicas na Sessão Transacional
        await this.assertPhysicalTransactionalInvariants(tx);

        // 5. Em modo dryRun, dispara sinal para acionar ROLLBACK automático
        if (dryRun) {
          throw new CvmFiiDryRunRollbackSignal(metrics);
        }
      });

      return {
        status: 'SUCCESS',
        metrics,
      };
    } catch (err: unknown) {
      if (err instanceof CvmFiiDryRunRollbackSignal) {
        return {
          status: 'ROLLED_BACK_DRY_RUN',
          metrics: err.metrics,
        };
      }
      throw err;
    }
  }

  /**
   * Persiste os registros em cvm_fii_registry em chunks seguros.
   */
  private async persistRegistryRecords(
    tx: postgres.Sql,
    registryRecords: PreparedFiiRegistryRecord[],
    metrics: CvmFiiIngestionMetrics,
    chunkSize: number
  ): Promise<Map<string, string>> {
    const cnpjToIdMap = new Map<string, string>();

    for (let i = 0; i < registryRecords.length; i += chunkSize) {
      const chunk = registryRecords.slice(i, i + chunkSize);

      for (const record of chunk) {
        const id = record.fiiRegistryId || crypto.randomUUID();
        const rows = await tx<{ id: string; cnpj: string }[]>`
          INSERT INTO cvm_fii_registry (
            id, cnpj, legal_name, trade_name, ticker, isin, source, source_updated_at, created_at, updated_at
          ) VALUES (
            ${id},
            ${record.cnpj},
            ${record.legalName},
            ${record.tradeName ?? null},
            ${record.ticker ?? null},
            ${record.isin ?? null},
            ${record.source},
            ${record.sourceUpdatedAt ?? null},
            NOW(),
            NOW()
          )
          ON CONFLICT (cnpj) DO UPDATE SET
            legal_name = EXCLUDED.legal_name,
            trade_name = COALESCE(EXCLUDED.trade_name, cvm_fii_registry.trade_name),
            ticker = COALESCE(EXCLUDED.ticker, cvm_fii_registry.ticker),
            isin = COALESCE(EXCLUDED.isin, cvm_fii_registry.isin),
            updated_at = NOW()
          RETURNING id, cnpj;
        `;

        if (rows.length > 0) {
          cnpjToIdMap.set(rows[0].cnpj, rows[0].id);
          metrics.registry.insertedCount++;
        }
      }
    }

    if (cnpjToIdMap.size !== registryRecords.length) {
      throw new CvmFiiInvariantViolationError(
        `Discrepância no cadastro CVM: esperado ${registryRecords.length} CNPJs registrados, obtido ${cnpjToIdMap.size}.`
      );
    }

    return cnpjToIdMap;
  }

  /**
   * Persiste as demonstrações mensais em fii_monthly_fundamentals.
   */
  private async persistMonthlyFundamentals(
    tx: postgres.Sql,
    monthlyRecords: PreparedFiiMonthlyRecord[],
    cnpjToIdMap: Map<string, string>,
    metrics: CvmFiiIngestionMetrics,
    chunkSize: number
  ): Promise<void> {
    for (let i = 0; i < monthlyRecords.length; i += chunkSize) {
      const chunk = monthlyRecords.slice(i, i + chunkSize);

      for (const record of chunk) {
        const fiiRegistryId = cnpjToIdMap.get(record.fiiRegistryCnpj);
        if (!fiiRegistryId) {
          throw new CvmFiiInvariantViolationError(
            `Inconsistência referencial: registro contábil do CNPJ ${record.fiiRegistryCnpj} sem fii_registry_id resolvido.`
          );
        }

        const id = crypto.randomUUID();
        const rows = await tx<{ id: string }[]>`
          INSERT INTO fii_monthly_fundamentals (
            id,
            fii_registry_id,
            reference_date,
            filing_date,
            version,
            source,
            source_reference,
            net_asset_value,
            quota_equity_value,
            issued_quotas,
            total_assets,
            total_liabilities,
            cash_equivalents,
            dividend_declared_per_quota,
            investors_count,
            individual_investors_count,
            created_at,
            updated_at
          ) VALUES (
            ${id},
            ${fiiRegistryId},
            ${record.referenceDate},
            ${record.filingDate ?? null},
            ${record.version},
            ${record.source},
            ${record.sourceReference ?? null},
            ${record.netAssetValue ? record.netAssetValue.toString() : null},
            ${record.quotaEquityValue ? record.quotaEquityValue.toString() : null},
            ${record.issuedQuotas ? record.issuedQuotas.toString() : null},
            ${record.totalAssets ? record.totalAssets.toString() : null},
            ${record.totalLiabilities ? record.totalLiabilities.toString() : null},
            ${record.cashEquivalents ? record.cashEquivalents.toString() : null},
            ${record.dividendDeclaredPerQuota ? record.dividendDeclaredPerQuota.toString() : null},
            ${record.investorsCount ?? null},
            ${record.individualInvestorsCount ?? null},
            NOW(),
            NOW()
          )
          ON CONFLICT (fii_registry_id, reference_date, version, source) DO NOTHING
          RETURNING id;
        `;

        if (rows.length > 0) {
          metrics.fundamentals.insertedCount++;
        } else {
          metrics.fundamentals.skippedDuplicatesCount++;
        }
      }
    }
  }

  /**
   * Persiste as propostas auditáveis de vínculo em cvm_fii_bindings.
   */
  private async persistBindingProposals(
    tx: postgres.Sql,
    bindingProposals: PreparedFiiBindingRecord[],
    cnpjToIdMap: Map<string, string>,
    metrics: CvmFiiIngestionMetrics,
    chunkSize: number
  ): Promise<void> {
    for (let i = 0; i < bindingProposals.length; i += chunkSize) {
      const chunk = bindingProposals.slice(i, i + chunkSize);

      for (const proposal of chunk) {
        if (proposal.bindingStatus === 'APPROVED') {
          throw new CvmFiiAutoApprovalViolationError(
            `Invariante violada: proposta para o CNPJ ${proposal.fiiRegistryCnpj} e ticker ${proposal.ticker} possui status APPROVED!`
          );
        }

        const fiiRegistryId = cnpjToIdMap.get(proposal.fiiRegistryCnpj);
        if (!fiiRegistryId) {
          throw new CvmFiiInvariantViolationError(
            `Proposta de vínculo órfã: CNPJ ${proposal.fiiRegistryCnpj} não localizado em cvm_fii_registry.`
          );
        }

        const id = crypto.randomUUID();
        const rows = await tx<{ id: string; binding_status: string }[]>`
          INSERT INTO cvm_fii_bindings (
            id,
            fii_registry_id,
            asset_id,
            binding_status,
            binding_method,
            confidence_level,
            justification,
            source,
            source_updated_at,
            created_at,
            updated_at
          ) VALUES (
            ${id},
            ${fiiRegistryId},
            ${proposal.assetId},
            ${proposal.bindingStatus},
            ${proposal.bindingMethod},
            ${proposal.confidenceLevel},
            ${proposal.justification},
            ${proposal.source},
            ${proposal.sourceUpdatedAt ?? null},
            NOW(),
            NOW()
          )
          ON CONFLICT (fii_registry_id, asset_id) DO NOTHING
          RETURNING id, binding_status;
        `;

        if (rows.length > 0) {
          metrics.bindings.insertedCount++;
          if (proposal.bindingStatus === 'PENDING_REVIEW') {
            metrics.bindings.pendingReviewCount++;
          } else if (proposal.bindingStatus === 'AMBIGUOUS') {
            metrics.bindings.ambiguousCount++;
          }
        } else {
          metrics.bindings.existingPreservedCount++;
        }
      }
    }
  }

  /**
   * Asserção das invariantes lógicas em memória antes de tocar no banco.
   */
  private assertInMemoryInvariants(report: FiiIngestionPreparationReport): void {
    // 1. Zero Auto-Approval
    for (const binding of report.preparedBindingRecords) {
      if (binding.bindingStatus === 'APPROVED') {
        throw new CvmFiiAutoApprovalViolationError(
          `A proposta de vínculo para o ticker "${binding.ticker}" e CNPJ "${binding.fiiRegistryCnpj}" possui status APPROVED. Proibida qualquer autoaprovação cadastral!`
        );
      }
    }

    // 2. Unicidade de CNPJ no cadastro regulatório
    const cnpjSet = new Set<string>();
    for (const reg of report.preparedRegistryRecords) {
      if (cnpjSet.has(reg.cnpj)) {
        throw new CvmFiiInvariantViolationError(
          `CNPJ duplicado encontrado no lote de cadastro CVM: "${reg.cnpj}".`
        );
      }
      cnpjSet.add(reg.cnpj);
    }

    // 3. Unicidade contábil no pacote mensal
    const accountingSet = new Set<string>();
    for (const monthly of report.preparedMonthlyRecords) {
      const key = `${monthly.fiiRegistryCnpj}|${monthly.referenceDate}|${monthly.version}|${monthly.source}`;
      if (accountingSet.has(key)) {
        throw new CvmFiiInvariantViolationError(
          `Duplicidade contábil no lote: mesma competência e versão para chave "${key}".`
        );
      }
      accountingSet.add(key);
    }
  }

  /**
   * Asserção das invariantes físicas no banco dentro da sessão transacional antes do commit.
   */
  private async assertPhysicalTransactionalInvariants(
    tx: postgres.Sql
  ): Promise<void> {
    // 1. Integridade referencial: nenhum fundamento mensal órfão
    const [orphanFundamentals] = await tx<{ count: number }[]>`
      SELECT count(*)::int AS count
      FROM fii_monthly_fundamentals f
      LEFT JOIN cvm_fii_registry r ON f.fii_registry_id = r.id
      WHERE r.id IS NULL;
    `;
    if (orphanFundamentals.count > 0) {
      throw new CvmFiiInvariantViolationError(
        `Invariante violada: ${orphanFundamentals.count} fundamentos mensais sem entidade correspondente em cvm_fii_registry.`
      );
    }

    // 2. Integridade de vínculos: nenhum vínculo órfão de ativo B3
    const [orphanBindings] = await tx<{ count: number }[]>`
      SELECT count(*)::int AS count
      FROM cvm_fii_bindings b
      LEFT JOIN assets a ON b.asset_id = a.id
      WHERE a.id IS NULL;
    `;
    if (orphanBindings.count > 0) {
      throw new CvmFiiInvariantViolationError(
        `Invariante violada: ${orphanBindings.count} vínculos com asset_id inexistente no catálogo B3.`
      );
    }

    // 3. Zero Auto-Approval: nenhum vínculo com APPROVED pode ter sido inserido nesta transação
    // (Caso houvesse qualquer falha no fluxo que criasse um vínculo APPROVED não homologado previamente)
    const [invalidApprovedBindings] = await tx<{ count: number }[]>`
      SELECT count(*)::int AS count
      FROM cvm_fii_bindings
      WHERE binding_status = 'APPROVED' AND reviewed_at IS NULL;
    `;
    if (invalidApprovedBindings.count > 0) {
      throw new CvmFiiAutoApprovalViolationError(
        `Invariante violada: detectados ${invalidApprovedBindings.count} vínculos com status APPROVED sem revisão humana registrada!`
      );
    }
  }

  private createEmptyMetrics(): CvmFiiIngestionMetrics {
    return {
      registry: {
        totalEvaluated: 0,
        insertedCount: 0,
        updatedCount: 0,
        unchangedCount: 0,
      },
      fundamentals: {
        totalEvaluated: 0,
        insertedCount: 0,
        skippedDuplicatesCount: 0,
      },
      bindings: {
        totalProposals: 0,
        insertedCount: 0,
        existingPreservedCount: 0,
        approvedCount: 0,
        pendingReviewCount: 0,
        ambiguousCount: 0,
      },
    };
  }
}
