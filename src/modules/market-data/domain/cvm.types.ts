export type CvmCompanyStatus = 'ATIVO' | 'CANCELADA' | 'SUSPENSO(A) - DECISÃO ADM';
export type CvmDocumentType = 'CAD' | 'DFP' | 'ITR' | 'FCA' | 'META';
export type CvmSourceFileStatus = 'DOWNLOADED' | 'AVAILABLE' | 'INVALID';
export type CvmIngestionRunStatus =
  | 'PENDING'
  | 'RUNNING'
  | 'COMPLETED'
  | 'FAILED'
  | 'ABANDONED'
  | 'CANCELLED'
  | 'DRY_RUN_SUCCESS'
  | 'DRY_RUN_FAILED';
export type CvmExecutionMode = 'CLI_MANUAL' | 'CLI_SCHEDULED' | 'DRY_RUN';
export type CvmCompanyAssetStatus = 'APPROVED' | 'PENDING_REVIEW' | 'REJECTED';
export type CvmMatchMethod = 'CURATED_SEED' | 'CNPJ_EXACT' | 'MANUAL' | 'HEURISTIC';

export type CvmSectorClassification =
  | 'ELIGIBLE_COMMERCIAL_INDUSTRIAL'
  | 'FINANCIAL_COSIF'
  | 'HOLDING_PURE'
  | 'UNKNOWN';

export type CvmSectorDecision = 'PROCESSABLE' | 'SKIPPED';

export interface CvmSectorRule {
  original: string;
  normalized: string;
  classification: CvmSectorClassification;
  decision: CvmSectorDecision;
  justification: string;
}

export interface CvmSourceReference {
  source: 'cvm_dfp';
  fileId: string;
  runId: string;
  cnpj: string;
  cvmCode: string;
  referenceDate: string;
  periodType: 'annual' | 'quarterly' | 'ttm';
  statementType: 'CONSOLIDATED' | 'INDIVIDUAL';
  exerciseOrder: 'ÚLTIMO';
  version: number;
  parserVersion: string;
  entityLevel: 'COMPANY';
  assetBindingPurpose: 'PUBLICATION_ALIAS';
}

export interface CvmCompanyDomain {
  id: string;
  cvmCode: string;
  cnpj: string;
  legalName: string;
  tradeName: string | null;
  industrySector: string | null;
  marketType: string | null;
  status: CvmCompanyStatus;
  registrationDate: Date | null;
  cancellationDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CvmSourceFileDomain {
  id: string;
  fileName: string;
  documentType: CvmDocumentType;
  referenceYear: number | null;
  sourceUrl: string;
  sha256: string;
  fileSize: number;
  storagePath: string;
  status: CvmSourceFileStatus;
  httpEtag: string | null;
  httpLastModified: string | null;
  downloadedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface CvmIngestionRunDomain {
  id: string;
  fileId: string;
  workerId: string;
  parserVersion: string;
  executionMode: CvmExecutionMode;
  status: CvmIngestionRunStatus;
  heartbeatAt: Date;
  lockExpiresAt: Date;
  startedAt: Date;
  completedAt: Date | null;
  companiesRead: number;
  statementsInserted: number;
  statementsUpdated: number;
  statementsSkipped: number;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CvmCompanyAssetDomain {
  id: string;
  companyId: string;
  assetId: string;
  shareClass: string | null;
  status: CvmCompanyAssetStatus;
  matchMethod: CvmMatchMethod;
  justification: string | null;
  source: string;
  createdAt: Date;
  updatedAt: Date;
}
