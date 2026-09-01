import type { NormalizedShareClass } from './cvm-matching.types';

export type HumanApprovalDecision =
  | 'PENDING_HUMAN_REVIEW'
  | 'APPROVED_FOR_PERSISTENCE'
  | 'REJECTED';

export type ValidationItemStatus =
  | 'READY_FOR_APPLY'
  | 'PENDING_HUMAN_REVIEW'
  | 'REJECTED'
  | 'CONFLICT'
  | 'INVALIDATED'
  | 'BLOCKED';

export interface HumanCvmBindingApprovalItem {
  /** Chave estável e composta: `${assetId}:${cnpj}` */
  approvalKey: string;
  assetId: string;
  ticker: string;
  assetType: 'stock';
  cnpj: string;
  legalName: string;
  cvmCode: string;
  isin: string | null;
  shareClass: NormalizedShareClass;
  provenance: {
    tickerSource: string;
    cnpjSource: string;
    cvmCodeSource: string;
    isinSource: string;
    shareClassSource: string;
  };
  evidenceFcaFileSha256: string;
  evidenceCadFileSha256: string;
  reviewerId: string;
  reviewedAt: string; // Formato ISO 8601
  justification: string;
  decision: HumanApprovalDecision;
}

export interface HumanApprovalListManifest {
  manifestVersion: '1.0.0';
  generatedAt: string;
  environment: 'development' | 'staging' | 'production';
  expectedFcaFileSha256: string;
  expectedCadFileSha256: string;
  totalItems: number;
  items: HumanCvmBindingApprovalItem[];
}

export interface CvmValidationItemResult {
  approvalKey: string;
  assetId: string;
  ticker: string;
  cnpj: string;
  cvmCode: string;
  shareClass: NormalizedShareClass;
  humanDecision: HumanApprovalDecision;
  validationStatus: ValidationItemStatus;
  isReadyForApply: boolean;
  blockingReasons: string[];
  warnings: string[];
  validatedCompany?: {
    legalName: string;
    status: string;
  };
}

export interface CvmValidationReport {
  timestamp: string;
  mode: 'VALIDATE_READ_ONLY';
  manifestVersion: string;
  fcaIntegrity: {
    expectedSha256: string;
    actualSha256: string;
    matches: boolean;
  };
  cadIntegrity: {
    expectedSha256: string;
    actualSha256: string;
    matches: boolean;
  };
  summary: {
    totalItemsEvaluated: number;
    readyForApplyCount: number;
    pendingHumanReviewCount: number;
    rejectedCount: number;
    conflictCount: number;
    invalidatedCount: number;
    blockedCount: number;
  };
  isOverallApprovedForApply: boolean;
  itemResults: CvmValidationItemResult[];
  criticalErrors: string[];
}
