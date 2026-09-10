// ─── Tipos e Contratos para Resolução Cadastral de FIIs (CVM <-> B3) ────────

export type FiiMatchingStatus =
  | 'MATCHED'              // Correspondência unívoca confirmada
  | 'UNMATCHED_NO_ASSET'  // CNPJ da CVM sem ativo correspondente no catálogo local
  | 'AMBIGUOUS_MATCH'     // Múltiplos ativos candidatos para o mesmo CNPJ/ISIN
  | 'INVALID_IDENTIFIER'; // CNPJ malformado ou nulo

export type FiiMatchMethod =
  | 'EXISTING_REGISTRY'   // Já vinculado na tabela cvm_fii_registry
  | 'CANONICAL_DE_PARA'   // De-para canônico curado (CNPJ <-> Ticker)
  | 'EXACT_ISIN'          // Código ISIN oficial coincidente no catálogo
  | 'ISIN_TICKER_ROOT';   // Raiz de 4 letras do ISIN de cota de FII (ex: BRHGLGCTF004 -> HGLG11)

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
 * Vínculo já existente registrado em `cvm_fii_registry`.
 */
export interface ExistingFiiRegistryInput {
  assetId: string;
  cnpj: string; // 14 dígitos numéricos normalizados
  legalName: string;
  ticker?: string | null;
  isin?: string | null;
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
}
