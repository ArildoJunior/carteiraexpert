import crypto from 'node:crypto';
import { eq, and, desc, isNull, sql } from 'drizzle-orm';
import { db } from '../../../lib/db';
import {
  editorialDocuments,
  editorialVersions,
  editorialReviews,
  editorialAiExecutions,
} from '../../../lib/db/schema/editorial';
import { insertAuditLog } from '../../../lib/db/audit';
import type {
  EditorialDocument,
  EditorialVersion,
  EditorialReview,
  EditorialStatus,
  EditorialDocumentType,
  EditorialAiActionType,
} from '../domain/editorial.types';
import {
  assertValidEditorialTransition,
  evaluateEditorialGuardrails,
} from '../domain/editorial.rules';
import {
  EditorialDocumentNotFoundError,
  UnauthorizedEditorialAccessError,
  RegulatoryGuardrailBlockedError,
  InvalidEditorialStateTransitionError,
  MissingReviewCommentError,
} from '../domain/errors';
import { slugify } from '../domain/editorial.schema';
import {
  MockEditorialAiProvider,
  type EditorialAiProvider,
} from './editorial-ai.provider';

export interface CreateDocumentParams {
  title: string;
  slug?: string;
  content: string;
  contentFormat?: 'MARKDOWN' | 'PLAIN_TEXT';
  documentType: EditorialDocumentType;
  visibility?: 'INTERNAL' | 'PUBLIC';
  metadata?: Record<string, unknown>;
}

export interface UpdateDraftParams {
  documentId: string;
  title: string;
  content: string;
  documentType: EditorialDocumentType;
  visibility?: 'INTERNAL' | 'PUBLIC';
  notes?: string;
}

export interface ReviewDocumentParams {
  documentId: string;
  decision: 'APPROVE' | 'REJECT' | 'REQUEST_CHANGES';
  comments: string;
}

export class EditorialService {
  private aiProvider: EditorialAiProvider;

  constructor(aiProvider: EditorialAiProvider = new MockEditorialAiProvider()) {
    this.aiProvider = aiProvider;
  }

  private calculateHash(content: string): string {
    return crypto.createHash('sha256').update(content, 'utf-8').digest('hex');
  }

  // ─── 1. Criação de Documento Editorial ──────────────────────────────────────
  async createDocument(
    userId: string,
    params: CreateDocumentParams
  ): Promise<EditorialDocument> {
    const slug = params.slug
      ? slugify(params.slug)
      : `${slugify(params.title)}-${crypto.randomBytes(3).toString('hex')}`;

    // Avaliação preliminar de guardrails
    const flags = evaluateEditorialGuardrails(
      params.title,
      params.content,
      params.documentType
    );

    const blockers = flags.filter((f) => f.severity === 'BLOCKER');
    if (blockers.length > 0) {
      throw new RegulatoryGuardrailBlockedError(blockers.map((b) => b.message));
    }

    const contentHash = this.calculateHash(params.content);
    const documentId = crypto.randomUUID();
    const versionId = crypto.randomUUID();
    const now = new Date();

    return await db.transaction(async (tx) => {
      // A. Inserir documento mestre
      const [doc] = await tx
        .insert(editorialDocuments)
        .values({
          id: documentId,
          ownerUserId: userId,
          title: params.title,
          slug,
          content: params.content,
          contentFormat: params.contentFormat || 'MARKDOWN',
          documentType: params.documentType,
          status: 'DRAFT',
          visibility: params.visibility || 'INTERNAL',
          currentVersion: 1,
          createdBy: userId,
          updatedBy: userId,
          regulatoryFlags: flags,
          metadata: params.metadata || {},
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      // B. Inserir versão inicial (versão 1)
      await tx.insert(editorialVersions).values({
        id: versionId,
        documentId: doc.id,
        versionNumber: 1,
        title: params.title,
        content: params.content,
        authorId: userId,
        origin: 'MANUAL',
        contentHash,
        notes: 'Criação inicial do documento',
        createdAt: now,
      });

      // C. Trilha de auditoria append-only
      await insertAuditLog(
        {
          tableName: 'editorial_documents',
          recordId: doc.id,
          action: 'INSERT',
          actorId: userId,
          actorType: 'user',
          reason: 'EDITORIAL_DOCUMENT_CREATED',
          source: 'manual',
        },
        {
          newValue: {
            title: doc.title,
            slug: doc.slug,
            documentType: doc.documentType,
            status: doc.status,
            version: String(doc.currentVersion),
          },
        },
        { preMinimized: true, allowedNumbers: ['version', 'versionNumber'] },
        tx
      );

      return doc as unknown as EditorialDocument;
    });
  }

  // ─── 2. Atualização de Rascunho ─────────────────────────────────────────────
  async updateDraft(
    userId: string,
    params: UpdateDraftParams
  ): Promise<EditorialDocument> {
    const [doc] = await db
      .select()
      .from(editorialDocuments)
      .where(
        and(
          eq(editorialDocuments.id, params.documentId),
          isNull(editorialDocuments.deletedAt)
        )
      )
      .limit(1);

    if (!doc) {
      throw new EditorialDocumentNotFoundError(params.documentId);
    }

    if (doc.ownerUserId !== userId) {
      throw new UnauthorizedEditorialAccessError();
    }

    if (doc.status !== 'DRAFT' && doc.status !== 'CHANGES_REQUESTED') {
      throw new InvalidEditorialStateTransitionError(
        doc.status,
        'DRAFT',
        'Apenas documentos nos estados "DRAFT" ou "CHANGES_REQUESTED" podem receber edições de rascunho.'
      );
    }

    const flags = evaluateEditorialGuardrails(
      params.title,
      params.content,
      params.documentType
    );

    const blockers = flags.filter((f) => f.severity === 'BLOCKER');
    if (blockers.length > 0) {
      throw new RegulatoryGuardrailBlockedError(blockers.map((b) => b.message));
    }

    const newVersionNumber = doc.currentVersion + 1;
    const contentHash = this.calculateHash(params.content);
    const now = new Date();

    return await db.transaction(async (tx) => {
      // A. Atualizar documento
      const [updated] = await tx
        .update(editorialDocuments)
        .set({
          title: params.title,
          content: params.content,
          documentType: params.documentType,
          visibility: params.visibility || doc.visibility,
          status: 'DRAFT', // Retorna formalmente para DRAFT quando editado
          currentVersion: newVersionNumber,
          updatedBy: userId,
          regulatoryFlags: flags,
          updatedAt: now,
        })
        .where(eq(editorialDocuments.id, doc.id))
        .returning();

      // B. Gravar nova versão histórica imutável
      await tx.insert(editorialVersions).values({
        id: crypto.randomUUID(),
        documentId: doc.id,
        versionNumber: newVersionNumber,
        title: params.title,
        content: params.content,
        authorId: userId,
        origin: 'REVISION',
        contentHash,
        notes: params.notes || `Revisão do autor para versão ${newVersionNumber}`,
        createdAt: now,
      });

      // C. Auditoria
      await insertAuditLog(
        {
          tableName: 'editorial_documents',
          recordId: doc.id,
          action: 'UPDATE',
          actorId: userId,
          actorType: 'user',
          reason: 'EDITORIAL_DRAFT_UPDATED',
          source: 'manual',
        },
        {
          oldValue: {
            title: doc.title,
            version: String(doc.currentVersion),
            status: doc.status,
          },
          newValue: {
            title: updated.title,
            version: String(updated.currentVersion),
            status: updated.status,
          },
        },
        { preMinimized: true, allowedNumbers: ['version', 'versionNumber'] },
        tx
      );

      return updated as unknown as EditorialDocument;
    });
  }

  // ─── 3. Envio para Revisão Humana Obrigatória ───────────────────────────────
  async submitForReview(
    userId: string,
    documentId: string
  ): Promise<EditorialDocument> {
    const [doc] = await db
      .select()
      .from(editorialDocuments)
      .where(
        and(
          eq(editorialDocuments.id, documentId),
          isNull(editorialDocuments.deletedAt)
        )
      )
      .limit(1);

    if (!doc) {
      throw new EditorialDocumentNotFoundError(documentId);
    }

    if (doc.ownerUserId !== userId) {
      throw new UnauthorizedEditorialAccessError();
    }

    assertValidEditorialTransition(doc.status as EditorialStatus, 'IN_REVIEW');

    const flags = evaluateEditorialGuardrails(
      doc.title,
      doc.content,
      doc.documentType as EditorialDocumentType
    );

    const blockers = flags.filter((f) => f.severity === 'BLOCKER');
    if (blockers.length > 0) {
      throw new RegulatoryGuardrailBlockedError(blockers.map((b) => b.message));
    }

    const now = new Date();

    return await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(editorialDocuments)
        .set({
          status: 'IN_REVIEW',
          regulatoryFlags: flags,
          updatedBy: userId,
          updatedAt: now,
        })
        .where(eq(editorialDocuments.id, doc.id))
        .returning();

      await insertAuditLog(
        {
          tableName: 'editorial_documents',
          recordId: doc.id,
          action: 'UPDATE',
          actorId: userId,
          actorType: 'user',
          reason: 'EDITORIAL_SUBMITTED_FOR_REVIEW',
          source: 'manual',
        },
        {
          oldValue: { status: doc.status },
          newValue: { status: 'IN_REVIEW' },
        },
        { preMinimized: true },
        tx
      );

      return updated as unknown as EditorialDocument;
    });
  }

  // ─── 4. Revisão Humana (Aprovação / Rejeição / Ajustes) ─────────────────────
  async reviewDocument(
    reviewerId: string,
    params: ReviewDocumentParams,
    options?: { allowSelfReview?: boolean }
  ): Promise<EditorialDocument> {
    const [doc] = await db
      .select()
      .from(editorialDocuments)
      .where(
        and(
          eq(editorialDocuments.id, params.documentId),
          isNull(editorialDocuments.deletedAt)
        )
      )
      .limit(1);

    if (!doc) {
      throw new EditorialDocumentNotFoundError(params.documentId);
    }

    if (doc.status !== 'IN_REVIEW') {
      throw new InvalidEditorialStateTransitionError(
        doc.status,
        params.decision === 'APPROVE' ? 'APPROVED' : 'CHANGES_REQUESTED',
        'Apenas documentos com status "IN_REVIEW" podem receber decisão de revisão.'
      );
    }

    const isSelfReview = doc.ownerUserId === reviewerId;
    let targetStatus: EditorialStatus;

    if (params.decision === 'APPROVE') {
      targetStatus = 'APPROVED';
      assertValidEditorialTransition(doc.status as EditorialStatus, targetStatus, {
        isSelfReview,
        allowSelfReviewInDev: options?.allowSelfReview,
      });
    } else {
      targetStatus = 'CHANGES_REQUESTED';
      if (!params.comments || params.comments.trim().length < 5) {
        throw new MissingReviewCommentError(params.decision);
      }
    }

    const now = new Date();

    return await db.transaction(async (tx) => {
      // A. Registrar revisão humana na tabela editorial_reviews
      await tx.insert(editorialReviews).values({
        id: crypto.randomUUID(),
        documentId: doc.id,
        versionNumber: doc.currentVersion,
        reviewerId,
        decision: params.decision,
        comments: params.comments,
        regulatoryFlags: doc.regulatoryFlags,
        createdAt: now,
      });

      // B. Atualizar estado do documento
      const [updated] = await tx
        .update(editorialDocuments)
        .set({
          status: targetStatus,
          approvedBy: params.decision === 'APPROVE' ? reviewerId : null,
          approvedAt: params.decision === 'APPROVE' ? now : null,
          rejectionReason:
            params.decision !== 'APPROVE' ? params.comments : null,
          updatedBy: reviewerId,
          updatedAt: now,
        })
        .where(eq(editorialDocuments.id, doc.id))
        .returning();

      // C. Registrar auditoria do evento de revisão
      await insertAuditLog(
        {
          tableName: 'editorial_documents',
          recordId: doc.id,
          action: 'UPDATE',
          actorId: reviewerId,
          actorType: 'user',
          reason: `EDITORIAL_REVIEW_${params.decision}`,
          source: 'manual',
        },
        {
          oldValue: { status: doc.status },
          newValue: {
            status: targetStatus,
            decision: params.decision,
            comments: params.comments,
          },
        },
        { preMinimized: true },
        tx
      );

      return updated as unknown as EditorialDocument;
    });
  }

  // ─── 5. Publicação Interna Controlada ───────────────────────────────────────
  async publishDocument(
    userId: string,
    documentId: string,
    confirmed = false
  ): Promise<EditorialDocument> {
    if (!confirmed) {
      throw new Error('A publicação exige confirmação explícita do usuário.');
    }

    const [doc] = await db
      .select()
      .from(editorialDocuments)
      .where(
        and(
          eq(editorialDocuments.id, documentId),
          isNull(editorialDocuments.deletedAt)
        )
      )
      .limit(1);

    if (!doc) {
      throw new EditorialDocumentNotFoundError(documentId);
    }

    assertValidEditorialTransition(doc.status as EditorialStatus, 'PUBLISHED');

    const now = new Date();

    return await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(editorialDocuments)
        .set({
          status: 'PUBLISHED',
          publishedAt: now,
          updatedBy: userId,
          updatedAt: now,
        })
        .where(eq(editorialDocuments.id, doc.id))
        .returning();

      await insertAuditLog(
        {
          tableName: 'editorial_documents',
          recordId: doc.id,
          action: 'UPDATE',
          actorId: userId,
          actorType: 'user',
          reason: 'EDITORIAL_DOCUMENT_PUBLISHED',
          source: 'manual',
        },
        {
          oldValue: { status: doc.status },
          newValue: { status: 'PUBLISHED', publishedAt: now.toISOString() },
        },
        { preMinimized: true },
        tx
      );

      return updated as unknown as EditorialDocument;
    });
  }

  // ─── 6. Arquivamento de Documento ──────────────────────────────────────────
  async archiveDocument(
    userId: string,
    documentId: string
  ): Promise<EditorialDocument> {
    const [doc] = await db
      .select()
      .from(editorialDocuments)
      .where(
        and(
          eq(editorialDocuments.id, documentId),
          isNull(editorialDocuments.deletedAt)
        )
      )
      .limit(1);

    if (!doc) {
      throw new EditorialDocumentNotFoundError(documentId);
    }

    if (doc.ownerUserId !== userId) {
      throw new UnauthorizedEditorialAccessError();
    }

    assertValidEditorialTransition(doc.status as EditorialStatus, 'ARCHIVED');

    const now = new Date();

    return await db.transaction(async (tx) => {
      const [updated] = await tx
        .update(editorialDocuments)
        .set({
          status: 'ARCHIVED',
          archivedAt: now,
          updatedBy: userId,
          updatedAt: now,
        })
        .where(eq(editorialDocuments.id, doc.id))
        .returning();

      await insertAuditLog(
        {
          tableName: 'editorial_documents',
          recordId: doc.id,
          action: 'UPDATE',
          actorId: userId,
          actorType: 'user',
          reason: 'EDITORIAL_DOCUMENT_ARCHIVED',
          source: 'manual',
        },
        {
          oldValue: { status: doc.status },
          newValue: { status: 'ARCHIVED' },
        },
        { preMinimized: true },
        tx
      );

      return updated as unknown as EditorialDocument;
    });
  }

  // ─── 7. Assistência por IA (Desacoplada e Auditada) ─────────────────────────
  async executeAiAssistant(
    userId: string,
    params: {
      actionType: EditorialAiActionType;
      documentId?: string;
      prompt: string;
      documentType?: EditorialDocumentType;
    }
  ): Promise<unknown> {
    const now = new Date();
    const actionType = params.actionType;
    const documentType = params.documentType || 'EDUCATIONAL_ARTICLE';

    let result: unknown;
    let status: 'SUCCESS' | 'FAILED' = 'SUCCESS';
    let errorMessage: string | null = null;

    try {
      switch (actionType) {
        case 'GENERATE_DRAFT':
          result = await this.aiProvider.generateDraft({
            briefing: params.prompt,
            documentType,
          });
          break;
        case 'SUGGEST_TITLE':
          result = await this.aiProvider.suggestTitle({
            content: params.prompt,
            documentType,
          });
          break;
        case 'SUMMARIZE':
          result = await this.aiProvider.summarize({
            content: params.prompt,
          });
          break;
        case 'SUGGEST_IMPROVEMENTS':
          result = await this.aiProvider.suggestImprovements({
            title: 'Análise de Rascunho',
            content: params.prompt,
            documentType,
          });
          break;
        default:
          throw new Error(`Ação de IA não suportada: ${actionType}`);
      }
    } catch (err: unknown) {
      status = 'FAILED';
      errorMessage = err instanceof Error ? err.message : 'Erro desconhecido na IA';
      throw err;
    } finally {
      // Registrar execução em editorial_ai_executions para auditoria e governança
      await db.insert(editorialAiExecutions).values({
        id: crypto.randomUUID(),
        documentId: params.documentId || null,
        userId,
        actionType,
        model: 'mock-editorial-v1',
        promptSanitized: params.prompt.slice(0, 1000),
        responseSanitized:
          status === 'SUCCESS'
            ? JSON.stringify(result).slice(0, 2000)
            : `Erro: ${errorMessage}`,
        status,
        errorMessage,
        createdAt: now,
      });
    }

    return result;
  }

  // ─── 8. Consultas (Leitura e Listagem) ──────────────────────────────────────
  async listDocuments(
    userId: string,
    filters?: {
      status?: EditorialStatus;
      documentType?: EditorialDocumentType;
    }
  ): Promise<EditorialDocument[]> {
    const conditions = [
      eq(editorialDocuments.ownerUserId, userId),
      isNull(editorialDocuments.deletedAt),
    ];

    if (filters?.status) {
      conditions.push(eq(editorialDocuments.status, filters.status));
    }
    if (filters?.documentType) {
      conditions.push(eq(editorialDocuments.documentType, filters.documentType));
    }

    const docs = await db
      .select()
      .from(editorialDocuments)
      .where(and(...conditions))
      .orderBy(desc(editorialDocuments.updatedAt));

    return docs as unknown as EditorialDocument[];
  }

  async getDocumentById(
    userId: string,
    documentId: string
  ): Promise<{
    document: EditorialDocument;
    versions: EditorialVersion[];
    reviews: EditorialReview[];
  }> {
    const [doc] = await db
      .select()
      .from(editorialDocuments)
      .where(
        and(
          eq(editorialDocuments.id, documentId),
          isNull(editorialDocuments.deletedAt)
        )
      )
      .limit(1);

    if (!doc) {
      throw new EditorialDocumentNotFoundError(documentId);
    }

    if (doc.ownerUserId !== userId && doc.visibility !== 'PUBLIC') {
      throw new UnauthorizedEditorialAccessError();
    }

    const versions = await db
      .select()
      .from(editorialVersions)
      .where(eq(editorialVersions.documentId, doc.id))
      .orderBy(desc(editorialVersions.versionNumber));

    const reviews = await db
      .select()
      .from(editorialReviews)
      .where(eq(editorialReviews.documentId, doc.id))
      .orderBy(desc(editorialReviews.createdAt));

    return {
      document: doc as unknown as EditorialDocument,
      versions: versions as unknown as EditorialVersion[],
      reviews: reviews as unknown as EditorialReview[],
    };
  }
}

export const editorialService = new EditorialService();
