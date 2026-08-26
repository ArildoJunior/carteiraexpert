'use server';

import { revalidatePath } from 'next/cache';
import { requireAuthAndConsent } from '@/modules/identity/server/authorization-service';
import {
  processImportUpload,
  confirmImportBatch,
  rejectImportBatch,
  toggleImportBatchItemExclusion,
  updateImportBatchItem,
  resolveUnmappedBatchItemAsset,
  type ProcessImportUploadInput,
} from './import.service';
import {
  uploadImportFileSchema,
  confirmImportBatchSchema,
  rejectImportBatchSchema,
  toggleImportBatchItemExclusionSchema,
  updateImportItemSchema,
  resolveUnmappedAssetSchema,
  type UploadImportFileInput,
  type ConfirmImportBatchInput,
  type RejectImportBatchInput,
  type ToggleImportBatchItemExclusionInput,
  type UpdateImportItemInput,
  type ResolveUnmappedAssetInput,
} from '../domain/import.schema';
import type { ImportBatch, ImportBatchItem, SerializedImportBatch } from '../domain/import.types';
import { serializeImportBatch } from '../domain/import-utils';
import {
  ImportBatchNotFoundError,
  ImportBatchItemNotFoundError,
  ImportBatchNotEditableError,
  ImportFileValidationError,
} from '../domain/errors';
import {
  PortfolioNotFoundError,
  AssetNotFoundError,
  InsufficientPositionError,
  RetroactiveInconsistencyError,
} from '@/modules/portfolio/domain/errors';
import { PortfolioFrozenError } from '@/modules/plans/domain/errors';
import { AuthorizationError, ConsentRequiredError } from '@/modules/identity/domain/errors';
import { ZodError } from 'zod';

export interface ActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

function safeRevalidatePath(path: string): void {
  try {
    revalidatePath(path);
  } catch {
    // No-op fora do runtime do Next.js (ex: em testes de integração)
  }
}

function handleActionError<T = never>(err: unknown): ActionResult<T> {
  if (err instanceof ZodError) {
    return {
      success: false,
      error: 'Dados fornecidos são inválidos.',
      fieldErrors: err.flatten().fieldErrors,
    };
  }

  if (err instanceof InsufficientPositionError) {
    return {
      success: false,
      error: err.message || 'Posição insuficiente para realizar a venda de um ou mais ativos.',
    };
  }

  if (err instanceof RetroactiveInconsistencyError) {
    return {
      success: false,
      error:
        err.message ||
        'A importação não pode ser concluída pois geraria inconsistência na linha temporal.',
    };
  }

  if (err instanceof PortfolioFrozenError) {
    return {
      success: false,
      error: 'Operação não permitida: a carteira de destino está congelada.',
    };
  }

  if (err instanceof ImportBatchNotFoundError) {
    return {
      success: false,
      error: err.message || 'Lote de importação não encontrado.',
    };
  }

  if (err instanceof ImportBatchItemNotFoundError) {
    return {
      success: false,
      error: err.message || 'Item do lote de importação não encontrado.',
    };
  }

  if (err instanceof ImportBatchNotEditableError) {
    return {
      success: false,
      error: err.message || 'Este lote não pode mais ser alterado ou confirmado.',
    };
  }

  if (err instanceof ImportFileValidationError) {
    return {
      success: false,
      error: err.message || 'Arquivo de importação inválido.',
    };
  }

  if (err instanceof PortfolioNotFoundError) {
    return {
      success: false,
      error: 'Carteira não encontrada ou não pertence ao usuário.',
    };
  }

  if (err instanceof AssetNotFoundError) {
    return {
      success: false,
      error: 'Ativo especificado não foi encontrado no sistema.',
    };
  }

  if (err instanceof AuthorizationError) {
    return {
      success: false,
      error: 'Acesso negado ao recurso solicitado.',
    };
  }

  if (err instanceof ConsentRequiredError) {
    return {
      success: false,
      error: 'É necessário aceitar os termos de uso antes de prosseguir.',
    };
  }

  if (err instanceof Error) {
    return {
      success: false,
      error: err.message,
    };
  }

  return {
    success: false,
    error: 'Ocorreu um erro inesperado ao processar a importação.',
  };
}

/**
 * Server Action para processamento de upload de arquivo CSV.
 */
export async function processImportUploadAction(
  rawInput: UploadImportFileInput
): Promise<ActionResult<{ batchId: string; validRecords: number; totalRecords: number }>> {
  try {
    const user = await requireAuthAndConsent();
    const validatedInput = uploadImportFileSchema.parse(rawInput);

    const result = await processImportUpload(
      {
        fileName: validatedInput.fileName,
        fileSize: validatedInput.fileSize,
        fileContent: validatedInput.fileContent,
        portfolioId: validatedInput.portfolioId,
        formatId: validatedInput.formatId,
      },
      user
    );

    safeRevalidatePath('/import');
    safeRevalidatePath(`/import/${result.batch.id}`);

    return {
      success: true,
      data: {
        batchId: result.batch.id,
        validRecords: result.batch.validRecords,
        totalRecords: result.batch.totalRecords,
      },
    };
  } catch (err) {
    return handleActionError(err);
  }
}

/**
 * Server Action para exclusão ou reativação de um item do lote durante a revisão.
 */
export async function toggleImportBatchItemExclusionAction(
  rawInput: ToggleImportBatchItemExclusionInput
): Promise<ActionResult<{ isExcluded: boolean }>> {
  try {
    const user = await requireAuthAndConsent();
    const validatedInput = toggleImportBatchItemExclusionSchema.parse(rawInput);

    const item = await toggleImportBatchItemExclusion(
      validatedInput.batchId,
      validatedInput.itemId,
      validatedInput.isExcluded,
      user
    );

    safeRevalidatePath(`/import/${validatedInput.batchId}`);

    return {
      success: true,
      data: {
        isExcluded: item.isExcluded,
      },
    };
  } catch (err) {
    return handleActionError(err);
  }
}

/**
 * Server Action para edição de um item do lote durante a revisão.
 */
export async function updateImportBatchItemAction(
  batchId: string,
  itemId: string,
  rawData: UpdateImportItemInput
): Promise<ActionResult<{ success: true }>> {
  try {
    const user = await requireAuthAndConsent();
    await updateImportBatchItem(batchId, itemId, rawData, user);

    safeRevalidatePath(`/import/${batchId}`);

    return {
      success: true,
      data: { success: true },
    };
  } catch (err) {
    return handleActionError(err);
  }
}

/**
 * Server Action para resolução de ativo não identificado durante a revisão.
 */
export async function resolveUnmappedBatchItemAssetAction(
  rawInput: ResolveUnmappedAssetInput
): Promise<ActionResult<{ success: true }>> {
  try {
    const user = await requireAuthAndConsent();
    const validatedInput = resolveUnmappedAssetSchema.parse(rawInput);

    await resolveUnmappedBatchItemAsset(validatedInput, user);

    safeRevalidatePath(`/import/${validatedInput.batchId}`);

    return {
      success: true,
      data: { success: true },
    };
  } catch (err) {
    return handleActionError(err);
  }
}

/**
 * Server Action para confirmação e gravação transacional de um lote de importação.
 */
export async function confirmImportBatchAction(
  rawInput: ConfirmImportBatchInput
): Promise<ActionResult<{ batch: ImportBatch; importedEventsCount: number }>> {
  try {
    const user = await requireAuthAndConsent();
    const validated = confirmImportBatchSchema.parse(rawInput);
    const result = await confirmImportBatch(validated, user);

    safeRevalidatePath('/dashboard');
    safeRevalidatePath('/history');
    safeRevalidatePath('/import');
    safeRevalidatePath(`/import/${result.batch.id}`);
    safeRevalidatePath(`/portfolios/${result.batch.portfolioId}`);

    return {
      success: true,
      data: {
        batch: result.batch,
        importedEventsCount: result.importedEventsCount,
      },
    };
  } catch (err) {
    return handleActionError(err);
  }
}

/**
 * Server Action para rejeição ou descarte de um lote de importação.
 */
export async function rejectImportBatchAction(
  rawInput: RejectImportBatchInput
): Promise<ActionResult<{ batch: ImportBatch }>> {
  try {
    const user = await requireAuthAndConsent();
    const validated = rejectImportBatchSchema.parse(rawInput);
    const result = await rejectImportBatch(validated, user);

    safeRevalidatePath('/dashboard');
    safeRevalidatePath('/history');
    safeRevalidatePath('/import');
    safeRevalidatePath(`/import/${result.batch.id}`);

    return {
      success: true,
      data: {
        batch: result.batch,
      },
    };
  } catch (err) {
    return handleActionError(err);
  }
}
