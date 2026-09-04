import type {
  EditorialDocument,
  EditorialVersion,
  EditorialReview,
  SerializedEditorialDocument,
  SerializedEditorialVersion,
  SerializedEditorialReview,
} from './editorial.types';

export function serializeEditorialDocument(
  doc: EditorialDocument
): SerializedEditorialDocument {
  return {
    id: doc.id,
    ownerUserId: doc.ownerUserId,
    title: doc.title,
    slug: doc.slug,
    content: doc.content,
    contentFormat: doc.contentFormat,
    documentType: doc.documentType,
    status: doc.status,
    visibility: doc.visibility,
    currentVersion: doc.currentVersion,
    createdBy: doc.createdBy,
    updatedBy: doc.updatedBy,
    approvedBy: doc.approvedBy,
    approvedAt: doc.approvedAt ? doc.approvedAt.toISOString() : null,
    publishedAt: doc.publishedAt ? doc.publishedAt.toISOString() : null,
    archivedAt: doc.archivedAt ? doc.archivedAt.toISOString() : null,
    rejectionReason: doc.rejectionReason,
    regulatoryFlags: doc.regulatoryFlags,
    metadata: doc.metadata,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

export function serializeEditorialVersion(
  version: EditorialVersion
): SerializedEditorialVersion {
  return {
    id: version.id,
    documentId: version.documentId,
    versionNumber: version.versionNumber,
    title: version.title,
    content: version.content,
    authorId: version.authorId,
    origin: version.origin,
    contentHash: version.contentHash,
    notes: version.notes,
    createdAt: version.createdAt.toISOString(),
  };
}

export function serializeEditorialReview(
  review: EditorialReview
): SerializedEditorialReview {
  return {
    id: review.id,
    documentId: review.documentId,
    versionNumber: review.versionNumber,
    reviewerId: review.reviewerId,
    decision: review.decision,
    comments: review.comments,
    regulatoryFlags: review.regulatoryFlags,
    createdAt: review.createdAt.toISOString(),
  };
}
