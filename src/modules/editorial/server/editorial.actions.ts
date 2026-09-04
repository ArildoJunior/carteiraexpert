'use server';

import { requireAuthAndConsent } from '../../identity/server/authorization-service';
import {
  createEditorialDocumentSchema,
  updateEditorialDocumentDraftSchema,
  submitEditorialForReviewSchema,
  reviewEditorialDocumentSchema,
  publishEditorialDocumentSchema,
  archiveEditorialDocumentSchema,
  editorialAiAssistantSchema,
} from '../domain/editorial.schema';
import {
  serializeEditorialDocument,
  serializeEditorialVersion,
  serializeEditorialReview,
} from '../domain/editorial.serializer';
import { editorialService } from './editorial.service';
import type {
  SerializedEditorialDocument,
  SerializedEditorialVersion,
  SerializedEditorialReview,
  EditorialStatus,
  EditorialDocumentType,
} from '../domain/editorial.types';

export interface ActionResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

export async function createEditorialDocumentAction(
  rawInput: unknown
): Promise<ActionResponse<SerializedEditorialDocument>> {
  try {
    const user = await requireAuthAndConsent();
    const validated = createEditorialDocumentSchema.parse(rawInput);

    const doc = await editorialService.createDocument(user.id, validated);
    return {
      success: true,
      data: serializeEditorialDocument(doc),
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Erro ao criar documento editorial.',
    };
  }
}

export async function updateEditorialDraftAction(
  rawInput: unknown
): Promise<ActionResponse<SerializedEditorialDocument>> {
  try {
    const user = await requireAuthAndConsent();
    const validated = updateEditorialDocumentDraftSchema.parse(rawInput);

    const doc = await editorialService.updateDraft(user.id, validated);
    return {
      success: true,
      data: serializeEditorialDocument(doc),
    };
  } catch (err: unknown) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Erro ao atualizar rascunho.',
    };
  }
}

export async function submitEditorialForReviewAction(
  rawInput: unknown
): Promise<ActionResponse<SerializedEditorialDocument>> {
  try {
    const user = await requireAuthAndConsent();
    const validated = submitEditorialForReviewSchema.parse(rawInput);

    const doc = await editorialService.submitForReview(
      user.id,
      validated.documentId
    );
    return {
      success: true,
      data: serializeEditorialDocument(doc),
    };
  } catch (err: unknown) {
    return {
      success: false,
      error:
        err instanceof Error
          ? err.message
          : 'Erro ao submeter documento para revisão.',
    };
  }
}

export async function reviewEditorialDocumentAction(
  rawInput: unknown
): Promise<ActionResponse<SerializedEditorialDocument>> {
  try {
    const user = await requireAuthAndConsent();
    const validated = reviewEditorialDocumentSchema.parse(rawInput);

    const doc = await editorialService.reviewDocument(user.id, validated);
    return {
      success: true,
      data: serializeEditorialDocument(doc),
    };
  } catch (err: unknown) {
    return {
      success: false,
      error:
        err instanceof Error ? err.message : 'Erro ao registrar decisão de revisão.',
    };
  }
}

export async function publishEditorialDocumentAction(
  rawInput: unknown
): Promise<ActionResponse<SerializedEditorialDocument>> {
  try {
    const user = await requireAuthAndConsent();
    const validated = publishEditorialDocumentSchema.parse(rawInput);

    const doc = await editorialService.publishDocument(
      user.id,
      validated.documentId,
      Boolean(validated.confirmed)
    );
    return {
      success: true,
      data: serializeEditorialDocument(doc),
    };
  } catch (err: unknown) {
    return {
      success: false,
      error:
        err instanceof Error ? err.message : 'Erro ao publicar documento editorial.',
    };
  }
}

export async function archiveEditorialDocumentAction(
  rawInput: unknown
): Promise<ActionResponse<SerializedEditorialDocument>> {
  try {
    const user = await requireAuthAndConsent();
    const validated = archiveEditorialDocumentSchema.parse(rawInput);

    const doc = await editorialService.archiveDocument(
      user.id,
      validated.documentId
    );
    return {
      success: true,
      data: serializeEditorialDocument(doc),
    };
  } catch (err: unknown) {
    return {
      success: false,
      error:
        err instanceof Error ? err.message : 'Erro ao arquivar documento editorial.',
    };
  }
}

export async function executeEditorialAiAssistantAction(
  rawInput: unknown
): Promise<ActionResponse<unknown>> {
  try {
    const user = await requireAuthAndConsent();
    const validated = editorialAiAssistantSchema.parse(rawInput);

    const result = await editorialService.executeAiAssistant(
      user.id,
      validated
    );
    return {
      success: true,
      data: result,
    };
  } catch (err: unknown) {
    return {
      success: false,
      error:
        err instanceof Error ? err.message : 'Erro na assistência editorial por IA.',
    };
  }
}

export async function listEditorialDocumentsAction(filters?: {
  status?: EditorialStatus;
  documentType?: EditorialDocumentType;
}): Promise<ActionResponse<SerializedEditorialDocument[]>> {
  try {
    const user = await requireAuthAndConsent();
    const docs = await editorialService.listDocuments(user.id, filters);

    return {
      success: true,
      data: docs.map(serializeEditorialDocument),
    };
  } catch (err: unknown) {
    return {
      success: false,
      error:
        err instanceof Error ? err.message : 'Erro ao listar documentos editoriais.',
    };
  }
}

export async function getEditorialDocumentDetailsAction(
  documentId: string
): Promise<
  ActionResponse<{
    document: SerializedEditorialDocument;
    versions: SerializedEditorialVersion[];
    reviews: SerializedEditorialReview[];
  }>
> {
  try {
    const user = await requireAuthAndConsent();
    const res = await editorialService.getDocumentById(user.id, documentId);

    return {
      success: true,
      data: {
        document: serializeEditorialDocument(res.document),
        versions: res.versions.map(serializeEditorialVersion),
        reviews: res.reviews.map(serializeEditorialReview),
      },
    };
  } catch (err: unknown) {
    return {
      success: false,
      error:
        err instanceof Error
          ? err.message
          : 'Erro ao buscar detalhes do documento.',
    };
  }
}
