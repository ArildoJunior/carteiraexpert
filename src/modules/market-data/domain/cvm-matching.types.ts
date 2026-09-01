// ─── Tipos de Entrada para o Motor Puro de Matching CVM ─────────────────────────

export type MatchingDecision =
  | 'APPROVED_CANDIDATE'
  | 'PENDING_REVIEW'
  | 'NO_MATCH'
  | 'OUT_OF_SCOPE'
  | 'PROTECTED_EXISTING_BINDING';

export type MatchingConfidence = 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE';

export type MatchingMethod =
  | 'CURATED_SEED'
  | 'OFFICIAL_SECURITY_MAPPING'
  | 'CNPJ_EXACT'
  | 'HEURISTIC'
  | 'MANUAL'
  | 'NONE';

export type NormalizedShareClass = 'ON' | 'PN' | 'PNA' | 'PNB' | 'UNT';

export interface CanonicalAssetMatchingInput {
  id: string;
  ticker: string;
  name: string;
  assetType: string; // 'stock' | 'fii' | 'etf' | 'bdr' | 'crypto' | 'custom'
  market?: string;
  currency?: string;
  isin?: string | null;
  provenance?: string;
  bdiCode?: string | null;
  specification?: string | null;
}

export interface CvmCompanyMatchingInput {
  id: string;
  cvmCode: string; // 6 dígitos
  cnpj: string; // 14 dígitos
  legalName: string;
  tradeName?: string | null;
  industrySector?: string | null;
  marketType?: string | null;
  status: string; // 'ATIVO' | 'CANCELADA' | 'SUSPENSO(A) - DECISÃO ADM'
}

export interface CvmSecurityMappingInput {
  cvmCode?: string | null; // 6 dígitos
  cnpj?: string | null; // 14 dígitos
  ticker: string; // Ticker oficial de negociação (ex: 'WEGE3', 'TAEE11')
  securityType?: string | null; // 'AÇÕES' | 'BDR' | 'DEBÊNTURES' | etc.
  shareClass?: string | null; // 'ON' | 'PN' | 'PNA' | 'PNB' | 'UNT'
  isin?: string | null;
  status?: string | null;
  rawValorMobiliario?: string | null;
}

export interface ExistingBindingMatchingInput {
  id: string;
  assetId: string;
  ticker: string;
  companyId: string;
  cvmCode: string;
  cnpj: string;
  shareClass?: string | null;
  status: 'APPROVED' | 'PENDING_REVIEW' | 'REJECTED';
  matchMethod: 'CURATED_SEED' | 'CNPJ_EXACT' | 'MANUAL' | 'HEURISTIC';
  source?: string;
}

// ─── Proveniência Rastreável de Evidências ────────────────────────────────────

export interface CvmEvidenceProvenance {
  cnpj: { value: string | null; source: string };
  cvmCode: { value: string | null; source: string };
  ticker: { value: string; source: string };
  isin: { value: string | null; source: string };
  provenShareClass: { value: NormalizedShareClass | null; source: string };
}

// ─── Resultado Estruturado da Decisão de Matching ────────────────────────────

export interface CvmCandidateCompanyInfo {
  companyId: string;
  cvmCode: string;
  cnpj: string;
  legalName: string;
  status: string;
  industrySector: string | null;
}

export interface CvmMatchingResult {
  assetId: string;
  ticker: string;
  assetType: string;
  decision: MatchingDecision;
  candidateCompany: CvmCandidateCompanyInfo | null;
  expectedShareClass: NormalizedShareClass | null;
  provenShareClass: NormalizedShareClass | null;
  matchMethod: MatchingMethod;
  confidenceLevel: MatchingConfidence;
  evidences: string[];
  evidenceProvenance: CvmEvidenceProvenance | null;
  justification: string;
  requiresHumanReview: boolean;
}

export interface CvmMatchingBatchResult {
  totalAssetsEvaluated: number;
  approvedCandidates: number;
  pendingReview: number;
  noMatch: number;
  outOfScope: number;
  protectedExistingBindings: number;
  results: CvmMatchingResult[];
}
