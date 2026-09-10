// ─── Tipos e Contratos para Resolução Cadastral de FIIs (CVM <-> B3) ────────

export type FiiMatchingStatus =
  | 'MATCHED'              // Correspondência unívoca confirmada
  | 'UNMATCHED_NO_ASSET'  // CNPJ da CVM sem ativo correspondente no catálogo local
  | 'AMBIGUOUS_MATCH'     // Múltiplos ativos candidatos ou colisão de múltiplos CNPJs para o mesmo ativo
  | 'INVALID_IDENTIFIER'; // CNPJ malformado ou nulo

export type FiiMatchMethod =
  | 'EXISTING_REGISTRY'   // Já vinculado e homologado em cvm_fii_bindings / cvm_fii_registry
  | 'CANONICAL_DE_PARA'   // De-para canônico curado (CNPJ <-> Ticker)
  | 'EXACT_ISIN'          // Código ISIN oficial coincidente no catálogo
  | 'ISIN_TICKER_ROOT';   // Raiz de 4 letras do ISIN de cota de FII (ex: BRHGLGCTF004 -> HGLG11)

export type FiiBindingStatus =
  | 'APPROVED'            // Vínculo canônico oficial aprovado (máximo 1 por assetId)
  | 'PENDING_REVIEW'      // Vínculo plausível retido para revisão manual (ex: APTO11, regras sob auditoria)
  | 'AMBIGUOUS'           // Ambiguidade ou colisão cadastral (ex: múltiplos CNPJs para o mesmo ativo)
  | 'REJECTED';           // Vínculo descartado após análise

export type FiiBindingMethod =
  | 'CANONICAL_DE_PARA'
  | 'EXACT_ISIN'
  | 'ISIN_TICKER_ROOT'
  | 'MANUAL';

export type FiiBindingConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

/**
 * Ativo candidato do catálogo local `assets` para FIIs.
 */
export interface CanonicalFiiAssetInput {
  id: string;        // UUID do asset
  ticker: string;    // Ex: 'HGLG11'
  name: string;      // Ex: 'CSHG LOGÍSTICA FDO INV IMOB - FII'
  assetType: string; // Deve ser 'fii'
  isin?: string | null;
}

/**
 * Registro de entidade CVM existente em `cvm_fii_registry`.
 * Independente de assetId (pode existir sem vínculo a ativo B3).
 */
export interface ExistingFiiRegistryInput {
  fiiRegistryId?: string;
  assetId?: string | null; // Opcional / legado
  cnpj: string;            // 14 dígitos numéricos normalizados
  legalName: string;
  tradeName?: string | null;
  ticker?: string | null;
  isin?: string | null;
}

/**
 * Vínculo pré-existente registrado em `cvm_fii_bindings`.
 */
export interface ExistingFiiBindingInput {
  fiiRegistryId?: string;
  cnpj: string;            // CNPJ do fundo CVM vinculado
  assetId: string;         // UUID do ativo B3
  ticker?: string;
  bindingStatus: FiiBindingStatus;
  bindingMethod: FiiBindingMethod;
  confidenceLevel: FiiBindingConfidence;
  justification?: string | null;
}

/**
 * Proposta estruturada de vínculo entre fundo CVM e ativo B3.
 */
export interface FiiBindingProposal {
  fiiRegistryCnpj: string;
  assetId: string;
  matchedTicker: string;
  matchedName: string;
  bindingStatus: FiiBindingStatus;
  bindingMethod: FiiBindingMethod;
  confidenceLevel: FiiBindingConfidence;
  justification: string;
}

/**
 * Entrada para resolução de um FII a partir do informe da CVM.
 */
export interface FiiCadastralResolutionInput {
  cnpj: string;           // CNPJ formatado ou não
  legalName: string;      // Razão social na CVM
  isin?: string | null;   // Código ISIN oficial (se disponível)
}

/**
 * Resultado da resolução cadastral para um fundo específico.
 */
export interface FiiCadastralMatchResult {
  cnpj: string; // 14 dígitos numéricos normalizados
  legalName: string;
  isin: string | null;
  status: FiiMatchingStatus;
  matchMethod: FiiMatchMethod | null;
  matchedAssetId: string | null;
  matchedTicker: string | null;
  matchedName: string | null;
  candidateTickers?: string[];
  bindingProposal?: FiiBindingProposal | null;
  justification: string;
}

/**
 * Relatório consolidado do lote de resolução cadastral.
 */
export interface FiiCadastralResolutionReport {
  totalFundsEvaluated: number;
  matchedCount: number;
  unmatchedCount: number;
  ambiguousCount: number;
  invalidCount: number;
  results: FiiCadastralMatchResult[];
  matchedMap: Map<string, FiiCadastralMatchResult>; // Chave: CNPJ normalizado (14 dígitos)
  bindingProposals: FiiBindingProposal[];
  approvedBindingsCount: number;
  pendingReviewBindingsCount: number;
  ambiguousBindingsCount: number;
}
