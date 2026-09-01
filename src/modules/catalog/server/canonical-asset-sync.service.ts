/**
 * Serviço de Sincronização Canônica de Ativos (ADR-011).
 *
 * Princípios Arquiteturais:
 * 1. Separação estrita entre Fase de Planejamento (em memória, pura e determinística)
 *    e Fase de Execução Transacional no Banco.
 * 2. Idempotência absoluta e geração determinística de snapshots de old_state e new_state.
 * 3. Proibição de efeitos colaterais durante o planejamento.
 * 4. Proteção explícita de regras de negócio:
 *    - BTC jamais recebe procedência 'b3_cotahist' ou código ISIN B3;
 *    - Derivativos e fracionários são rejeitados com justificativa formal;
 *    - Casos ambíguos geram registro de conflito (PENDING_REVIEW);
 *    - Registros inalterados são marcados como NO_OP.
 */

import crypto from 'node:crypto';
import type {
  RawCotahistCandidateInput,
  CvmContextHint,
  CanonicalClassificationResult,
  CanonicalSyncRunMode,
  AssetLifecycleStatus,
  AssetProvenance,
} from '../domain/canonical-catalog.types';
import { classifyCanonicalCandidate } from '../domain/canonical-classifier';

export interface ExistingAssetSnapshot {
  id: string;
  ticker: string;
  name: string;
  assetType: string;
  market: string;
  currency: string;
  isCustom: boolean;
  userId: string | null;
  isVisibleCatalog: boolean | null;
  isTradeable: boolean | null;
  status: AssetLifecycleStatus | null;
  isin: string | null;
  provenance: AssetProvenance | null;
  lastSyncRunId: string | null;
}

export type PlannedActionType =
  | 'NO_OP'
  | 'INSERT'
  | 'UPDATE'
  | 'REJECT'
  | 'PENDING_REVIEW';

export interface PlannedSyncAction {
  candidateTicker: string;
  existingAssetId: string | null;
  action: PlannedActionType;
  classification: CanonicalClassificationResult;
  oldState: Record<string, unknown> | null;
  newState: Record<string, unknown> | null;
  conflictPayload: Record<string, unknown> | null;
  justification: string;
}

export interface CanonicalSyncPlanMetrics {
  totalCandidates: number;
  proposedInserts: number;
  proposedUpdates: number;
  proposedNoOps: number;
  proposedRejections: number;
  proposedConflicts: number;
}

export interface CanonicalSyncPlan {
  syncRunId: string;
  workerId: string;
  executionMode: CanonicalSyncRunMode;
  environment: string;
  parserVersion: string;
  batchHash: string;
  createdAt: string;
  actions: PlannedSyncAction[];
  metrics: CanonicalSyncPlanMetrics;
}

export interface GenerateSyncPlanParams {
  workerId: string;
  executionMode: CanonicalSyncRunMode;
  environment?: string;
  parserVersion?: string;
  candidates: RawCotahistCandidateInput[];
  existingAssets?: ExistingAssetSnapshot[];
  cvmHints?: Record<string, CvmContextHint>;
}

/**
 * Calcula o hash SHA-256 determinístico dos candidatos de entrada para garantia de idempotência.
 */
export function computeBatchHash(candidates: RawCotahistCandidateInput[]): string {
  const sortedPayload = candidates
    .map((c) => ({
      ticker: (c.ticker || '').trim().toUpperCase(),
      shortName: (c.shortName || '').trim(),
      specification: (c.specification || '').trim(),
      bdiCode: (c.bdiCode || '').trim(),
      marketType: c.marketType ?? null,
      isin: (c.isin || '').trim() || null,
    }))
    .sort((a, b) => a.ticker.localeCompare(b.ticker));

  return crypto
    .createHash('sha256')
    .update(JSON.stringify(sortedPayload))
    .digest('hex');
}

export class CanonicalAssetSyncService {
  /**
   * Gera um plano determinístico de sincronização em memória, sem qualquer acesso a banco ou efeitos colaterais.
   */
  public generateSyncPlan(params: GenerateSyncPlanParams): CanonicalSyncPlan {
    const syncRunId = crypto.randomUUID();
    const workerId = params.workerId;
    const executionMode = params.executionMode;
    const environment = params.environment || 'development';
    const parserVersion = params.parserVersion || '1.0.0';
    const createdAt = new Date().toISOString();
    const batchHash = computeBatchHash(params.candidates);

    // Mapeamento dos ativos existentes por ticker normalizado (apenas globais: isCustom = false)
    const existingMap = new Map<string, ExistingAssetSnapshot>();
    if (params.existingAssets) {
      for (const asset of params.existingAssets) {
        if (!asset.isCustom && asset.userId === null) {
          existingMap.set(asset.ticker.trim().toUpperCase(), asset);
        }
      }
    }

    const cvmHints = params.cvmHints || {};
    const actions: PlannedSyncAction[] = [];

    let proposedInserts = 0;
    let proposedUpdates = 0;
    let proposedNoOps = 0;
    let proposedRejections = 0;
    let proposedConflicts = 0;

    for (const candidate of params.candidates) {
      const ticker = (candidate.ticker || '').trim().toUpperCase();
      const cvmHint = cvmHints[ticker];

      // 1. Classificação pura através do classificador oficial de domínio
      const classification = classifyCanonicalCandidate(candidate, cvmHint);
      const existing = existingMap.get(ticker) || null;

      // 2. Proteção Absoluta para Ativos Especiais (BTC / Cripto)
      if (ticker === 'BTC' || classification.market === 'CRYPTO') {
        if (classification.isin !== null) {
          throw new Error('VIOLAÇÃO DE DOMÍNIO: Ativo BTC não pode possuir código ISIN B3.');
        }
      }

      // 3. Avaliação da Ação Planejada com base na Decisão do Classificador
      if (classification.decision === 'REJECT') {
        proposedRejections++;
        actions.push({
          candidateTicker: ticker,
          existingAssetId: existing ? existing.id : null,
          action: 'REJECT',
          classification,
          oldState: null,
          newState: null,
          conflictPayload: null,
          justification: `Candidato rejeitado formalmente: ${classification.rejectionReason} — ${classification.justification}`,
        });
        continue;
      }

      if (classification.decision === 'PENDING_REVIEW') {
        proposedConflicts++;
        actions.push({
          candidateTicker: ticker,
          existingAssetId: existing ? existing.id : null,
          action: 'PENDING_REVIEW',
          classification,
          oldState: existing
            ? {
                isVisibleCatalog: existing.isVisibleCatalog,
                isTradeable: existing.isTradeable,
                status: existing.status,
                isin: existing.isin,
                provenance: existing.provenance,
              }
            : null,
          newState: null,
          conflictPayload: {
            ticker,
            conflictType: classification.conflictType || 'CLASS_AMBIGUITY',
            detectedData: {
              candidate,
              classification,
            },
          },
          justification: `Candidato direcionado para PENDING_REVIEW: ${classification.conflictType} — ${classification.justification}`,
        });
        continue;
      }

      // 4. Caso ACCEPT: Determinar se é NO_OP, UPDATE ou INSERT
      const targetProvenance: AssetProvenance =
        ticker === 'BTC'
          ? 'curated_seed'
          : existing && existing.provenance === 'curated_seed'
          ? 'curated_seed'
          : 'b3_cotahist';

      const proposedNewState = {
        name: classification.canonicalName,
        assetType: classification.assetType,
        market: classification.market,
        currency: classification.currency,
        isVisibleCatalog: true,
        isTradeable: true,
        status: 'active' as AssetLifecycleStatus,
        isin: classification.isin,
        provenance: targetProvenance,
        lastSyncRunId: syncRunId,
      };

      if (existing) {
        // Verifica se os campos já são idênticos (Idempotência)
        const isIdentical =
          existing.name === proposedNewState.name &&
          existing.assetType === proposedNewState.assetType &&
          existing.market === proposedNewState.market &&
          existing.currency === proposedNewState.currency &&
          existing.isVisibleCatalog === proposedNewState.isVisibleCatalog &&
          existing.isTradeable === proposedNewState.isTradeable &&
          existing.status === proposedNewState.status &&
          existing.isin === proposedNewState.isin &&
          existing.provenance === proposedNewState.provenance;

        if (isIdentical) {
          proposedNoOps++;
          actions.push({
            candidateTicker: ticker,
            existingAssetId: existing.id,
            action: 'NO_OP',
            classification,
            oldState: {
              name: existing.name,
              assetType: existing.assetType,
              market: existing.market,
              currency: existing.currency,
              isVisibleCatalog: existing.isVisibleCatalog,
              isTradeable: existing.isTradeable,
              status: existing.status,
              isin: existing.isin,
              provenance: existing.provenance,
            },
            newState: proposedNewState,
            conflictPayload: null,
            justification: 'Ativo existente no catálogo possui dados idênticos aos do candidato. Nenhuma alteração necessária (NO_OP).',
          });
        } else {
          proposedUpdates++;
          actions.push({
            candidateTicker: ticker,
            existingAssetId: existing.id,
            action: 'UPDATE',
            classification,
            oldState: {
              name: existing.name,
              assetType: existing.assetType,
              market: existing.market,
              currency: existing.currency,
              isVisibleCatalog: existing.isVisibleCatalog,
              isTradeable: existing.isTradeable,
              status: existing.status,
              isin: existing.isin,
              provenance: existing.provenance,
            },
            newState: proposedNewState,
            conflictPayload: null,
            justification: 'Ativo existente no catálogo requer atualização cadastral dos novos atributos.',
          });
        }
      } else {
        proposedInserts++;
        actions.push({
          candidateTicker: ticker,
          existingAssetId: null,
          action: 'INSERT',
          classification,
          oldState: null,
          newState: proposedNewState,
          conflictPayload: null,
          justification: 'Novo ativo canônico oficial identificado para materialização no catálogo.',
        });
      }
    }

    return {
      syncRunId,
      workerId,
      executionMode,
      environment,
      parserVersion,
      batchHash,
      createdAt,
      actions,
      metrics: {
        totalCandidates: params.candidates.length,
        proposedInserts,
        proposedUpdates,
        proposedNoOps,
        proposedRejections,
        proposedConflicts,
      },
    };
  }
}
