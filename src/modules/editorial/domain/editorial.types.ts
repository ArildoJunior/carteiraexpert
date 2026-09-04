// ─── Tipos e Enums do Módulo Editorial (Etapa 10) ─────────────────────────

export type EditorialDocumentType =
  | 'EDUCATIONAL_ARTICLE'
  | 'INSTITUTIONAL_NOTE'
  | 'PRODUCT_EXPLANATION'
  | 'INTERNAL_DOC'
  | 'GLOSSARY'
  | 'ANNOUNCEMENT'
  | 'MARKET_ANALYSIS'
  | 'TAX_GUIDANCE'
  | 'OPTIONS_DERIVATIVES';

export type EditorialStatus =
  | 'DRAFT'
  | 'IN_REVIEW'
  | 'CHANGES_REQUESTED'
  | 'APPROVED'
  | 'PUBLISHED'
  | 'ARCHIVED';

export type EditorialVisibility = 'INTERNAL' | 'PUBLIC';

export type EditorialContentFormat = 'MARKDOWN' | 'PLAIN_TEXT';

export type EditorialVersionOrigin =
  | 'MANUAL'
  | 'AI_DRAFT'
  | 'AI_SUGGESTION'
  | 'REVISION';

export type EditorialReviewDecision = 'APPROVE' | 'REJECT' | 'REQUEST_CHANGES';

export type EditorialAiActionType =
  | 'GENERATE_DRAFT'
  | 'SUGGEST_TITLE'
  | 'SUMMARIZE'
  | 'SUGGEST_IMPROVEMENTS'
  | 'DETECT_REGULATORY_FLAGS'
  | 'CLASSIFY_CONTENT';

export type GuardrailSeverity = 'BLOCKER' | 'WARNING' | 'SUGGESTION';

export interface EditorialRegulatoryFlag {
  severity: GuardrailSeverity;
  code: string;
  message: string;
  recommendation?: string;
}

export interface EditorialDocument {
  id: string;
  ownerUserId: string;
  title: string;
  slug: string;
  content: string;
  contentFormat: EditorialContentFormat;
  documentType: EditorialDocumentType;
  status: EditorialStatus;
  visibility: EditorialVisibility;
  currentVersion: number;
  createdBy: string;
  updatedBy: string;
  approvedBy: string | null;
  approvedAt: Date | null;
  publishedAt: Date | null;
  archivedAt: Date | null;
  rejectionReason: string | null;
  regulatoryFlags: EditorialRegulatoryFlag[];
  metadata: Record<string, unknown>;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface EditorialVersion {
  id: string;
  documentId: string;
  versionNumber: number;
  title: string;
  content: string;
  authorId: string;
  origin: EditorialVersionOrigin;
  contentHash: string;
  notes: string | null;
  createdAt: Date;
}

export interface EditorialReview {
  id: string;
  documentId: string;
  versionNumber: number;
  reviewerId: string;
  decision: EditorialReviewDecision;
  comments: string;
  regulatoryFlags: EditorialRegulatoryFlag[];
  createdAt: Date;
}

export interface EditorialAiExecution {
  id: string;
  documentId: string | null;
  userId: string;
  actionType: EditorialAiActionType;
  model: string;
  promptSanitized: string;
  responseSanitized: string;
  status: 'SUCCESS' | 'FAILED';
  errorMessage: string | null;
  createdAt: Date;
}

// ─── Serialized Types para Transporte via Server Actions ─────────────────────

export interface SerializedEditorialDocument {
  id: string;
  ownerUserId: string;
  title: string;
  slug: string;
  content: string;
  contentFormat: EditorialContentFormat;
  documentType: EditorialDocumentType;
  status: EditorialStatus;
  visibility: EditorialVisibility;
  currentVersion: number;
  createdBy: string;
  updatedBy: string;
  approvedBy: string | null;
  approvedAt: string | null;
  publishedAt: string | null;
  archivedAt: string | null;
  rejectionReason: string | null;
  regulatoryFlags: EditorialRegulatoryFlag[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface SerializedEditorialVersion {
  id: string;
  documentId: string;
  versionNumber: number;
  title: string;
  content: string;
  authorId: string;
  origin: EditorialVersionOrigin;
  contentHash: string;
  notes: string | null;
  createdAt: string;
}

export interface SerializedEditorialReview {
  id: string;
  documentId: string;
  versionNumber: number;
  reviewerId: string;
  decision: EditorialReviewDecision;
  comments: string;
  regulatoryFlags: EditorialRegulatoryFlag[];
  createdAt: string;
}
