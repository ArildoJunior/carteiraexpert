/**
 * Tipos de domínio para o Catálogo Canônico de Ativos (ADR-011).
 *
 * Princípios:
 * 1. Tipagem estrita e imutável para candidatos, classificações, estados e conflitos.
 * 2. Desacoplamento entre entidade física permanente e representação visual.
 * 3. Rastreabilidade determinística de procedência e estado do ciclo de vida.
 */

import type { CatalogAssetCategory } from './catalog.types';

export type { CatalogAssetCategory };

/**
 * Status do ciclo de vida operacional persistido na entidade mestre assets.
 */
export type AssetLifecycleStatus = 'active' | 'delisted' | 'suspended';

/**
 * Procedência cadastral de origem da entidade mestre assets.
 */
export type AssetProvenance =
  | 'curated_seed' // Ativos curados manualmente no seed inicial (ex: PETR4, BTC)
  | 'b3_cotahist'  // Ativos oficiais materializados a partir do COTAHIST da B3
  | 'user_custom'  // Ativos customizados privados de usuários (is_custom = true)
  | 'manual_admin'; // Ativos inseridos ou ajustados manualmente pela administração

/**
 * Decisão determinística do motor classificador de candidatos.
 */
export type ClassificationDecision =
  | 'ACCEPT'          // Elegível para materialização como ativo canônico oficial
  | 'REJECT'          // Rejeitado justificadamente (ex: derivativo, fracionário, inválido)
  | 'PENDING_REVIEW'; // Ambíguo ou conflitante; exige revisão manual antes de materializar

/**
 * Nível de confiança heurística na classificação.
 */
export type ClassificationConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

/**
 * Motivos formais de rejeição de um candidato de mercado.
 */
export type RejectionReason =
  | 'DERIVATIVE_OPTION'        // Opções de compra/venda (market_type 70/80, BDI 96/78)
  | 'FRACTIONAL_MARKET'        // Mercado fracionário (market_type 20, ticker final F)
  | 'INVALID_TICKER_FORMAT'    // Código de ticker fora dos padrões da B3
  | 'MISSING_MANDATORY_FIELDS' // Ausência de shortName, bdiCode ou tradeDate
  | 'UNSUPPORTED_MARKET_TYPE'  // Mercados a termo/futuro não suportados no catálogo à vista
  | 'INACTIVE_EXPIRED';        // Série histórica sem negociação válida

/**
 * Tipos formais de conflitos cadastrais que direcionam o candidato para PENDING_REVIEW.
 */
export type CatalogConflictType =
  | 'ISIN_MISMATCH'        // Código ISIN inválido ou divergente entre fontes
  | 'CLASS_AMBIGUITY'      // Ambiguidade entre Unit de Ação (UNT), FII (CI) e Fiagro
  | 'DUPLICATE_TICKER_ISIN'// Mesmo ticker associado a múltiplos ISINs incompatíveis
  | 'DUPLICATE_NAME'       // Razão social divergente da especificação do papel
  | 'CVM_CODE_MISMATCH';   // Divergência de código CVM em relação ao CNPJ/Ticker

/**
 * Dados brutos de entrada extraídos do COTAHIST para avaliação do classificador.
 */
export interface RawCotahistCandidateInput {
  ticker: string;
  shortName?: string | null;
  specification?: string | null;
  bdiCode?: string | null;
  marketType?: number | null;
  currency?: string | null;
  isin?: string | null;
  closePrice?: string | null;
  tradeDate?: string | null;
  tradeCount?: number | null;
  financialVolume?: string | null;
}

/**
 * Informações institucionais complementares da CVM para apoio à classificação.
 */
export interface CvmContextHint {
  cnpj?: string | null;
  cvmCode?: string | null;
  legalName?: string | null;
  industrySector?: string | null;
  companyStatus?: string | null;
  isRegisteredFii?: boolean;
}

/**
 * Resultado determinístico emitido pelo classificador canônico de ativos.
 */
export interface CanonicalClassificationResult {
  decision: ClassificationDecision;
  ticker: string;
  assetType: CatalogAssetCategory | null;
  shareClass: string | null; // 'ON' | 'PN' | 'UNT' | 'CI' | 'BDR' | 'ETF' | null
  market: string;            // 'B3' | 'CRYPTO' | 'CUSTOM'
  currency: string;          // 'BRL' | 'USD'
  canonicalName: string;
  isin: string | null;
  confidence: ClassificationConfidence;
  rejectionReason: RejectionReason | null;
  conflictType: CatalogConflictType | null;
  justification: string;
  evaluatedAt: string; // ISO 8601
}

/**
 * Estrutura do candidato a ativo canônico validado e pronto para materialização.
 */
export interface CanonicalAssetCandidate {
  ticker: string;
  name: string;
  assetType: CatalogAssetCategory;
  market: string;
  currency: string;
  isin: string | null;
  provenance: AssetProvenance;
  isVisibleCatalog: boolean;
  isTradeable: boolean;
  status: AssetLifecycleStatus;
}

/**
 * Modos operacionais suportados pelo sincronizador de catálogo.
 */
export type CanonicalSyncRunMode = 'DRY_RUN' | 'APPLY';

/**
 * Status do ciclo de vida de uma execução de sincronização.
 */
export type CanonicalSyncRunStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'REVERTED'
  | 'ABANDONED';

/**
 * Ações atômicas registradas por item de execução em canonical_sync_run_items.
 */
export type CanonicalSyncItemAction =
  | 'INSERT'
  | 'UPDATE'
  | 'NO_OP'
  | 'REJECT'
  | 'LINK_QUOTE'
  | 'UNLINK_QUOTE';

/**
 * Resultado atômico de processamento de um item individual.
 */
export type CanonicalSyncItemResult = 'SUCCESS' | 'FAILED' | 'CONFLICT' | 'SKIPPED';

/**
 * Tipos de entidades afetadas no log de sincronização.
 */
export type CanonicalSyncEntityType =
  | 'asset'
  | 'b3_quote_link'
  | 'cvm_binding'
  | 'fundamental';

/**
 * Registro atômico de mutação para rollback determinístico e auditoria.
 */
export interface CanonicalSyncRunItemRecord {
  id: string;
  syncRunId: string;
  entityType: CanonicalSyncEntityType;
  recordId: string;
  action: CanonicalSyncItemAction;
  oldState: Record<string, unknown> | null;
  newState: Record<string, unknown> | null;
  resultStatus: CanonicalSyncItemResult;
  errorDetail: string | null;
  createdAt: Date;
}
