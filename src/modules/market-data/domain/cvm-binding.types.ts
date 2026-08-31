// ─── Tipos e Estados do Vínculo CVM/B3 ──────────────────────────────────────
export type CvmBindingStatus = 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';

export type CvmBindingMatchMethod =
  | 'CURATED_SEED'
  | 'CNPJ_EXACT'
  | 'MANUAL'
  | 'HEURISTIC';

export type CvmShareClass = 'ON' | 'PN' | 'PNA' | 'PNB' | 'UNT';

export type CvmBindingAuditAction =
  | 'CVM_BINDING_PROPOSED'
  | 'CVM_BINDING_APPROVED'
  | 'CVM_BINDING_REJECTED'
  | 'CVM_BINDING_REVOKED'
  | 'CVM_BINDING_REOPENED';

export interface CvmCompanyAssetBinding {
  id: string;
  companyId: string;
  companyCnpj: string;
  companyCvmCode: string;
  companyLegalName: string;
  assetId: string;
  assetTicker: string;
  assetType: string;
  shareClass: CvmShareClass | null;
  status: CvmBindingStatus;
  matchMethod: CvmBindingMatchMethod;
  justification: string | null;
  source: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProposeBindingInput {
  companyId: string;
  assetId: string;
  shareClass?: CvmShareClass | null;
  matchMethod: CvmBindingMatchMethod;
  justification: string;
  source: string;
  actorId?: string | null;
}

export interface ReviewBindingInput {
  bindingId: string;
  reviewerId: string;
  justification: string;
}

export interface ResolvedAssetTarget {
  assetId: string;
  ticker: string;
  assetType: string;
  shareClass: CvmShareClass | null;
  bindingId: string;
}

// ─── Hierarquia de Erros de Governança de Vínculos ──────────────────────────
export class CvmBindingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CvmBindingError';
  }
}

export class CvmIncompatibleShareClassError extends CvmBindingError {
  constructor(message: string) {
    super(message);
    this.name = 'CvmIncompatibleShareClassError';
  }
}

export class CvmConflictingActiveBindingError extends CvmBindingError {
  constructor(message: string) {
    super(message);
    this.name = 'CvmConflictingActiveBindingError';
  }
}

export class CvmInvalidBindingTransitionError extends CvmBindingError {
  constructor(message: string) {
    super(message);
    this.name = 'CvmInvalidBindingTransitionError';
  }
}

export class CvmInsufficientEvidenceError extends CvmBindingError {
  constructor(message: string) {
    super(message);
    this.name = 'CvmInsufficientEvidenceError';
  }
}

export class CvmIneligibleAssetTypeError extends CvmBindingError {
  constructor(message: string) {
    super(message);
    this.name = 'CvmIneligibleAssetTypeError';
  }
}

export class CvmIneligibleSectorError extends CvmBindingError {
  constructor(message: string) {
    super(message);
    this.name = 'CvmIneligibleSectorError';
  }
}
