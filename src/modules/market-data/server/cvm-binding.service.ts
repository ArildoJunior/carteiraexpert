import { eq, sql } from 'drizzle-orm';
import { db, type DbExecutor } from '@/lib/db';
import { auditLogs } from '@/lib/db/schema/audit';
import { assets } from '@/lib/db/schema/portfolio';
import { cvmCompanies, cvmCompanyAssets } from '@/lib/db/schema/cvm-market-data';
import { classifyCvmSector } from '../domain/cvm.schema';
import {
  proposeBindingSchema,
  reviewBindingSchema,
} from '../domain/cvm-binding.schema';
import {
  validateBindingProposalEvidence,
  validateBindingTransition,
  validateShareClassCompatibility,
} from '../domain/cvm-binding-engine';
import {
  CvmBindingError,
  CvmConflictingActiveBindingError,
  type CvmBindingAuditAction,
  type CvmCompanyAssetBinding,
  type ProposeBindingInput,
  type ResolvedAssetTarget,
  type ReviewBindingInput,
} from '../domain/cvm-binding.types';

export class CvmBindingService {
  /**
   * Submete uma proposta de vínculo entre Companhia CVM e Ativo B3.
   * Se o par já existir como REJECTED, reabre reutilizando o registro e emitindo CVM_BINDING_REOPENED.
   */
  public async proposeBinding(
    input: ProposeBindingInput,
    executor: DbExecutor = db
  ): Promise<CvmCompanyAssetBinding> {
    const validated = proposeBindingSchema.parse(input);
    validateBindingProposalEvidence(
      validated.matchMethod,
      validated.justification,
      validated.source
    );

    const executeInTransaction = async (tx: any) => {
      // 1. Validar existência da companhia CVM
      const [company] = await tx
        .select()
        .from(cvmCompanies)
        .where(eq(cvmCompanies.id, validated.companyId));
      if (!company) {
        throw new CvmBindingError(
          `Companhia CVM não encontrada para o ID "${validated.companyId}".`
        );
      }

      // 2. Validar existência e elegibilidade do Ativo B3
      const [asset] = await tx
        .select()
        .from(assets)
        .where(eq(assets.id, validated.assetId));
      if (!asset) {
        throw new CvmBindingError(
          `Ativo B3 não encontrado para o ID "${validated.assetId}".`
        );
      }

      // 3. Validar compatibilidade de tipo e classe
      validateShareClassCompatibility(
        validated.shareClass,
        asset.assetType,
        asset.ticker
      );

      // 4. Verificar se o par (companyId, assetId) já existe
      const [existingPair] = await tx
        .select()
        .from(cvmCompanyAssets)
        .where(
          sql`${cvmCompanyAssets.companyId} = ${validated.companyId} AND ${cvmCompanyAssets.assetId} = ${validated.assetId}`
        );

      if (existingPair) {
        if (existingPair.status === 'APPROVED') {
          throw new CvmConflictingActiveBindingError(
            `O par companhia/ativo (${company.cvmCode} - ${asset.ticker}) já possui vínculo homologado e ativo.`
          );
        }

        if (existingPair.status === 'PENDING_REVIEW') {
          // Idempotente: atualiza justificativa e source sem alterar status
          await tx
            .update(cvmCompanyAssets)
            .set({
              shareClass: validated.shareClass ?? existingPair.shareClass,
              matchMethod: validated.matchMethod,
              justification: validated.justification,
              source: validated.source,
              updatedAt: new Date(),
            })
            .where(eq(cvmCompanyAssets.id, existingPair.id));

          return this.mapToBinding(
            {
              ...existingPair,
              shareClass: validated.shareClass ?? existingPair.shareClass,
              matchMethod: validated.matchMethod,
              justification: validated.justification,
              source: validated.source,
              updatedAt: new Date(),
            },
            company,
            asset
          );
        }

        if (existingPair.status === 'REJECTED') {
          // Reabertura controlada reutilizando o mesmo registro
          const oldSnapshot = { ...existingPair };
          const now = new Date();

          await tx
            .update(cvmCompanyAssets)
            .set({
              status: 'PENDING_REVIEW',
              shareClass: validated.shareClass ?? existingPair.shareClass,
              matchMethod: validated.matchMethod,
              justification: validated.justification,
              source: validated.source,
              updatedAt: now,
            })
            .where(eq(cvmCompanyAssets.id, existingPair.id));

          const newSnapshot = {
            ...existingPair,
            status: 'PENDING_REVIEW',
            shareClass: validated.shareClass ?? existingPair.shareClass,
            matchMethod: validated.matchMethod,
            justification: validated.justification,
            source: validated.source,
            updatedAt: now,
          };

          // Gravação atômica em audit_logs
          await this.recordAuditLog(
            tx,
            existingPair.id,
            'CVM_BINDING_REOPENED',
            validated.actorId ?? 'SYSTEM',
            validated.actorId ? 'user' : 'system',
            validated.justification,
            validated.source,
            oldSnapshot,
            newSnapshot
          );

          return this.mapToBinding(newSnapshot, company, asset);
        }
      }

      // 5. Inserção de Novo Vínculo em PENDING_REVIEW
      const bindingId = crypto.randomUUID();
      const now = new Date();
      const newRecord = {
        id: bindingId,
        companyId: validated.companyId,
        assetId: validated.assetId,
        shareClass: validated.shareClass ?? null,
        status: 'PENDING_REVIEW' as const,
        matchMethod: validated.matchMethod,
        justification: validated.justification,
        source: validated.source,
        createdAt: now,
        updatedAt: now,
      };

      await tx.insert(cvmCompanyAssets).values(newRecord);

      // 6. Gravação atômica em audit_logs
      await this.recordAuditLog(
        tx,
        bindingId,
        'CVM_BINDING_PROPOSED',
        validated.actorId ?? 'SYSTEM',
        validated.actorId ? 'user' : 'system',
        validated.justification,
        validated.source,
        null,
        newRecord
      );

      return this.mapToBinding(newRecord, company, asset);
    };

    if ('transaction' in executor && typeof executor.transaction === 'function') {
      return (executor as any).transaction(executeInTransaction);
    }
    return executeInTransaction(executor);
  }

  /**
   * Homologa e aprova um vínculo CVM/B3 com verificação de unicidade ativa e lock de concorrência.
   */
  public async approveBinding(
    input: ReviewBindingInput,
    executor: DbExecutor = db
  ): Promise<CvmCompanyAssetBinding> {
    const validated = reviewBindingSchema.parse(input);

    const executeInTransaction = async (tx: any) => {
      // 1. Obter o vínculo atual
      const [binding] = await tx
        .select()
        .from(cvmCompanyAssets)
        .where(eq(cvmCompanyAssets.id, validated.bindingId));
      if (!binding) {
        throw new CvmBindingError(`Vínculo não encontrado para o ID "${validated.bindingId}".`);
      }

      // Idempotência: se já estiver APPROVED, retorna no-op
      if (binding.status === 'APPROVED') {
        const [company] = await tx.select().from(cvmCompanies).where(eq(cvmCompanies.id, binding.companyId));
        const [asset] = await tx.select().from(assets).where(eq(assets.id, binding.assetId));
        return this.mapToBinding(binding, company, asset);
      }

      // Validar máquina de estados
      const { action } = validateBindingTransition(binding.status as any, 'APPROVED');

      // 2. Lock transacional complementar sobre o ativo B3 para serializar aprovações concorrentes
      const [asset] = await tx
        .select()
        .from(assets)
        .where(eq(assets.id, binding.assetId))
        .for('update');

      if (!asset) {
        throw new CvmBindingError(`Ativo B3 "${binding.assetId}" não encontrado.`);
      }

      // 3. Obter companhia CVM
      const [company] = await tx
        .select()
        .from(cvmCompanies)
        .where(eq(cvmCompanies.id, binding.companyId));

      if (!company) {
        throw new CvmBindingError(`Companhia CVM "${binding.companyId}" não encontrada.`);
      }

      // 4. Validar compatibilidade de tipo e classe
      validateShareClassCompatibility(binding.shareClass as any, asset.assetType, asset.ticker);

      // 5. Verificar se já existe outro vínculo APPROVED ativo para este mesmo asset_id
      const [existingApproved] = await tx
        .select()
        .from(cvmCompanyAssets)
        .where(
          sql`${cvmCompanyAssets.assetId} = ${binding.assetId} AND ${cvmCompanyAssets.status} = 'APPROVED' AND ${cvmCompanyAssets.id} != ${binding.id}`
        );

      if (existingApproved) {
        throw new CvmConflictingActiveBindingError(
          `O ativo "${asset.ticker}" já possui outro vínculo homologado e ativo com a companhia ID "${existingApproved.companyId}".`
        );
      }

      // 6. Atualização para APPROVED
      const oldSnapshot = { ...binding };
      const now = new Date();

      await tx
        .update(cvmCompanyAssets)
        .set({
          status: 'APPROVED',
          justification: validated.justification,
          updatedAt: now,
        })
        .where(eq(cvmCompanyAssets.id, binding.id));

      const newSnapshot = {
        ...binding,
        status: 'APPROVED' as const,
        justification: validated.justification,
        updatedAt: now,
      };

      // 7. Gravação atômica em audit_logs
      await this.recordAuditLog(
        tx,
        binding.id,
        action as CvmBindingAuditAction,
        validated.reviewerId,
        'user',
        validated.justification,
        binding.source,
        oldSnapshot,
        newSnapshot
      );

      return this.mapToBinding(newSnapshot, company, asset);
    };

    if ('transaction' in executor && typeof executor.transaction === 'function') {
      return (executor as any).transaction(executeInTransaction);
    }
    return executeInTransaction(executor);
  }

  /**
   * Rejeita formalmente uma proposta em análise (PENDING_REVIEW -> REJECTED).
   * Emite exclusivamente o log CVM_BINDING_REJECTED.
   */
  public async rejectBinding(
    input: ReviewBindingInput,
    executor: DbExecutor = db
  ): Promise<CvmCompanyAssetBinding> {
    const validated = reviewBindingSchema.parse(input);

    const executeInTransaction = async (tx: any) => {
      const [binding] = await tx
        .select()
        .from(cvmCompanyAssets)
        .where(eq(cvmCompanyAssets.id, validated.bindingId));

      if (!binding) {
        throw new CvmBindingError(`Vínculo não encontrado para o ID "${validated.bindingId}".`);
      }

      // Idempotência
      if (binding.status === 'REJECTED') {
        const [company] = await tx.select().from(cvmCompanies).where(eq(cvmCompanies.id, binding.companyId));
        const [asset] = await tx.select().from(assets).where(eq(assets.id, binding.assetId));
        return this.mapToBinding(binding, company, asset);
      }

      if (binding.status === 'APPROVED') {
        throw new CvmBindingError(
          'Vínculo já se encontra homologado (APPROVED). Para anular uma homologação, utilize a operação formal de revogação (revokeBinding).'
        );
      }

      const { action } = validateBindingTransition(binding.status as any, 'REJECTED');

      const [company] = await tx.select().from(cvmCompanies).where(eq(cvmCompanies.id, binding.companyId));
      const [asset] = await tx.select().from(assets).where(eq(assets.id, binding.assetId));

      const oldSnapshot = { ...binding };
      const now = new Date();

      await tx
        .update(cvmCompanyAssets)
        .set({
          status: 'REJECTED',
          justification: validated.justification,
          updatedAt: now,
        })
        .where(eq(cvmCompanyAssets.id, binding.id));

      const newSnapshot = {
        ...binding,
        status: 'REJECTED' as const,
        justification: validated.justification,
        updatedAt: now,
      };

      await this.recordAuditLog(
        tx,
        binding.id,
        action as CvmBindingAuditAction,
        validated.reviewerId,
        'user',
        validated.justification,
        binding.source,
        oldSnapshot,
        newSnapshot
      );

      return this.mapToBinding(newSnapshot, company, asset);
    };

    if ('transaction' in executor && typeof executor.transaction === 'function') {
      return (executor as any).transaction(executeInTransaction);
    }
    return executeInTransaction(executor);
  }

  /**
   * Revoga formalmente um vínculo previamente homologado (APPROVED -> REJECTED).
   * Aceita estritamente vínculos no estado APPROVED e emite exclusivamente CVM_BINDING_REVOKED.
   * Rejeita tentativas de revogação para vínculos em PENDING_REVIEW ou REJECTED.
   */
  public async revokeBinding(
    input: ReviewBindingInput,
    executor: DbExecutor = db
  ): Promise<CvmCompanyAssetBinding> {
    const validated = reviewBindingSchema.parse(input);

    const executeInTransaction = async (tx: any) => {
      const [binding] = await tx
        .select()
        .from(cvmCompanyAssets)
        .where(eq(cvmCompanyAssets.id, validated.bindingId));

      if (!binding) {
        throw new CvmBindingError(`Vínculo não encontrado para o ID "${validated.bindingId}".`);
      }

      // Rejeita vínculos que não estejam estritamente em APPROVED
      if (binding.status === 'PENDING_REVIEW') {
        throw new CvmBindingError(
          'Operação de revogação inválida: o vínculo encontra-se em PENDING_REVIEW. Para rejeitar uma proposta pendente, utilize rejectBinding.'
        );
      }

      if (binding.status === 'REJECTED') {
        throw new CvmBindingError(
          'Operação de revogação inválida: o vínculo já se encontra com status REJECTED.'
        );
      }

      const { action } = validateBindingTransition(binding.status as any, 'REJECTED');

      const [company] = await tx.select().from(cvmCompanies).where(eq(cvmCompanies.id, binding.companyId));
      const [asset] = await tx.select().from(assets).where(eq(assets.id, binding.assetId));

      const oldSnapshot = { ...binding };
      const now = new Date();

      await tx
        .update(cvmCompanyAssets)
        .set({
          status: 'REJECTED',
          justification: validated.justification,
          updatedAt: now,
        })
        .where(eq(cvmCompanyAssets.id, binding.id));

      const newSnapshot = {
        ...binding,
        status: 'REJECTED' as const,
        justification: validated.justification,
        updatedAt: now,
      };

      await this.recordAuditLog(
        tx,
        binding.id,
        action as CvmBindingAuditAction, // Sempre CVM_BINDING_REVOKED
        validated.reviewerId,
        'user',
        validated.justification,
        binding.source,
        oldSnapshot,
        newSnapshot
      );

      return this.mapToBinding(newSnapshot, company, asset);
    };

    if ('transaction' in executor && typeof executor.transaction === 'function') {
      return (executor as any).transaction(executeInTransaction);
    }
    return executeInTransaction(executor);
  }

  /**
   * Reabre formalmente um vínculo rejeitado (REJECTED -> PENDING_REVIEW).
   */
  public async reopenBinding(
    input: ReviewBindingInput,
    executor: DbExecutor = db
  ): Promise<CvmCompanyAssetBinding> {
    const validated = reviewBindingSchema.parse(input);

    const executeInTransaction = async (tx: any) => {
      const [binding] = await tx
        .select()
        .from(cvmCompanyAssets)
        .where(eq(cvmCompanyAssets.id, validated.bindingId));

      if (!binding) {
        throw new CvmBindingError(`Vínculo não encontrado para o ID "${validated.bindingId}".`);
      }

      if (binding.status === 'PENDING_REVIEW') {
        const [company] = await tx.select().from(cvmCompanies).where(eq(cvmCompanies.id, binding.companyId));
        const [asset] = await tx.select().from(assets).where(eq(assets.id, binding.assetId));
        return this.mapToBinding(binding, company, asset);
      }

      const { action } = validateBindingTransition(binding.status as any, 'PENDING_REVIEW');

      const [company] = await tx.select().from(cvmCompanies).where(eq(cvmCompanies.id, binding.companyId));
      const [asset] = await tx.select().from(assets).where(eq(assets.id, binding.assetId));

      const oldSnapshot = { ...binding };
      const now = new Date();

      await tx
        .update(cvmCompanyAssets)
        .set({
          status: 'PENDING_REVIEW',
          justification: validated.justification,
          updatedAt: now,
        })
        .where(eq(cvmCompanyAssets.id, binding.id));

      const newSnapshot = {
        ...binding,
        status: 'PENDING_REVIEW' as const,
        justification: validated.justification,
        updatedAt: now,
      };

      await this.recordAuditLog(
        tx,
        binding.id,
        action as CvmBindingAuditAction,
        validated.reviewerId,
        'user',
        validated.justification,
        binding.source,
        oldSnapshot,
        newSnapshot
      );

      return this.mapToBinding(newSnapshot, company, asset);
    };

    if ('transaction' in executor && typeof executor.transaction === 'function') {
      return (executor as any).transaction(executeInTransaction);
    }
    return executeInTransaction(executor);
  }

  /**
   * Resolução rigorosa de ativos B3 autorizados para receber demonstrações contábeis CVM.
   * Aplica verificação dinâmica de elegibilidade setorial: se o setor não for PROCESSABLE, retorna [].
   */
  public async resolveActiveAssetsForCompany(
    companyIdentifier: string,
    executor: DbExecutor = db
  ): Promise<ResolvedAssetTarget[]> {
    if (!companyIdentifier) return [];

    // 1. Buscar a companhia por ID, CNPJ ou CD_CVM
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      companyIdentifier
    );

    const condition = isUuid
      ? eq(cvmCompanies.id, companyIdentifier)
      : sql`${cvmCompanies.cnpj} = ${companyIdentifier} OR ${cvmCompanies.cvmCode} = ${companyIdentifier}`;

    const [company] = await executor
      .select()
      .from(cvmCompanies)
      .where(condition);

    if (!company || company.status !== 'ATIVO') {
      return [];
    }

    // 2. Verificação dinâmica de elegibilidade setorial
    const sectorEvaluation = classifyCvmSector(company.industrySector);
    if (sectorEvaluation.decision !== 'PROCESSABLE') {
      // Bloqueio categórico para bancos, holdings puras e setores não suportados
      return [];
    }

    // 3. Buscar vínculos com status = 'APPROVED'
    const rows = await executor
      .select({
        bindingId: cvmCompanyAssets.id,
        shareClass: cvmCompanyAssets.shareClass,
        assetId: assets.id,
        ticker: assets.ticker,
        assetType: assets.assetType,
      })
      .from(cvmCompanyAssets)
      .innerJoin(assets, eq(cvmCompanyAssets.assetId, assets.id))
      .where(
        sql`${cvmCompanyAssets.companyId} = ${company.id} AND ${cvmCompanyAssets.status} = 'APPROVED'`
      );

    return rows.map((r) => ({
      assetId: r.assetId,
      ticker: r.ticker,
      assetType: r.assetType,
      shareClass: r.shareClass as any,
      bindingId: r.bindingId,
    }));
  }

  /**
   * Inserção atômica e sanitizada na tabela audit_logs.
   */
  private async recordAuditLog(
    tx: any,
    recordId: string,
    action: CvmBindingAuditAction,
    actorId: string,
    actorType: 'user' | 'system',
    reason: string,
    source: string,
    oldValue: any,
    newValue: any
  ): Promise<void> {
    await tx.insert(auditLogs).values({
      id: crypto.randomUUID(),
      tableName: 'cvm_company_assets',
      recordId,
      action,
      actorId,
      actorType,
      correlationId: null,
      oldValue: oldValue ? JSON.stringify(oldValue) : null,
      newValue: newValue ? JSON.stringify(newValue) : null,
      reason,
      source,
      createdAt: new Date(),
    });
  }

  private mapToBinding(
    record: any,
    company: any,
    asset: any
  ): CvmCompanyAssetBinding {
    return {
      id: record.id,
      companyId: record.companyId,
      companyCnpj: company?.cnpj ?? '',
      companyCvmCode: company?.cvmCode ?? '',
      companyLegalName: company?.legalName ?? '',
      assetId: record.assetId,
      assetTicker: asset?.ticker ?? '',
      assetType: asset?.assetType ?? '',
      shareClass: record.shareClass,
      status: record.status,
      matchMethod: record.matchMethod,
      justification: record.justification,
      source: record.source,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}

export const cvmBindingService = new CvmBindingService();
