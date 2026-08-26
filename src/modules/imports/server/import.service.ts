import crypto from 'node:crypto';
import { eq, and, isNull, or, inArray, desc, sql } from 'drizzle-orm';
import { db, type Database, type DatabaseTransaction, type DbExecutor } from '@/lib/db';
import { importBatches, importBatchItems } from '@/lib/db/schema/imports';
import { assets, portfolioEvents, portfolios } from '@/lib/db/schema/portfolio';
import { insertAuditLog } from '@/lib/db/audit';
import { assertOwnership } from '@/modules/identity/server/authorization-service';
import type { SafeUser } from '@/modules/identity/domain/user.types';
import { getPortfolioById } from '@/modules/portfolio/server/portfolio.service';
import { getAssetById, createCustomAssetInTransaction } from '@/modules/portfolio/server/asset.service';
import { createPortfolioEventInTransaction } from '@/modules/portfolio/server/portfolio-event.service';
import { assertPortfolioWritable } from '@/modules/plans/server/plan.service';
import { defaultImportParserRegistry } from '../domain/parsers/parser-registry';
import { calculateFileHash, normalizeTicker } from '../domain/import-utils';
import {
  uploadFileLimitsSchema,
  updateImportItemSchema,
  confirmImportBatchSchema,
  rejectImportBatchSchema,
  type UpdateImportItemInput,
  type ConfirmImportBatchInput,
  type RejectImportBatchInput,
} from '../domain/import.schema';
import type {
  ImportBatch,
  ImportBatchItem,
  ImportFormatId,
  ImportItemStatus,
  ParsedImportBatch,
  ParsedImportRow,
} from '../domain/import.types';
import {
  ImportBatchNotFoundError,
  ImportBatchItemNotFoundError,
  ImportBatchNotEditableError,
  ImportFileValidationError,
} from '../domain/errors';
import {
  type ResolveUnmappedAssetInput,
} from '../domain/import.schema';
import { Decimal } from '@/lib/decimal';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ProcessImportUploadInput {
  fileContent: string;
  fileName: string;
  fileSize: number;
  portfolioId: string;
  preferredFormatId?: ImportFormatId;
  formatId?: ImportFormatId;
}

/**
 * Processa o upload de um arquivo de importação:
 * 1. Valida tamanho, extensão e carteira de destino (pertencente ao usuário e não congelada).
 * 2. Realiza o parsing determinístico usando o parser apropriado.
 * 3. Identifica e resolve ativos globais ou customizados pertencentes ao usuário.
 * 4. Sinaliza ativos não encontrados como WARNING (sem criação automática).
 * 5. Identifica duplicidades por hash de arquivo e por linha contra eventos já existentes.
 * 6. Persiste o lote e seus itens em transação atômica no status pending_review.
 */
export async function processImportUpload(
  rawInput: ProcessImportUploadInput,
  user: SafeUser,
  database: Database = db,
  auditLogger: typeof insertAuditLog = insertAuditLog
): Promise<{ batch: ImportBatch; items: ImportBatchItem[] }> {
  // 1. Validação estrutural do arquivo e carteira
  const validatedInput = uploadFileLimitsSchema.parse({
    fileName: rawInput.fileName,
    fileSize: rawInput.fileSize,
    portfolioId: rawInput.portfolioId,
  });

  // 2. Validação da carteira (posse + writable)
  const portfolio = await getPortfolioById(validatedInput.portfolioId, user, database);
  assertPortfolioWritable(portfolio);

  // 3. Cálculo de hash determinístico do arquivo
  const rawContentHash = calculateFileHash(rawInput.fileContent);

  // 4. Execução do parsing com registry
  let parsedBatch: ParsedImportBatch;
  try {
    parsedBatch = await defaultImportParserRegistry.parse(
      rawInput.fileContent,
      {
        fileName: validatedInput.fileName,
        fileSize: validatedInput.fileSize,
        defaultCurrency: portfolio.baseCurrency,
        userId: user.id,
        portfolioId: portfolio.id,
      },
      rawInput.preferredFormatId || rawInput.formatId
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha ao processar arquivo.';
    throw new ImportFileValidationError(message);
  }

  return await database.transaction(async (tx) => {
    // 5. Deduplicação por hash de arquivo confirmado anteriormente
    const [existingConfirmedBatch] = await tx
      .select({ id: importBatches.id, confirmedAt: importBatches.confirmedAt })
      .from(importBatches)
      .where(
        and(
          eq(importBatches.userId, user.id),
          eq(importBatches.portfolioId, portfolio.id),
          eq(importBatches.rawContentHash, rawContentHash),
          eq(importBatches.status, 'confirmed')
        )
      )
      .limit(1);

    // 6. Resolução de Ativos
    // Coleta tickers normalizados únicos das linhas válidas
    const validTickers = Array.from(
      new Set(
        parsedBatch.rows
          .map((r) => r.normalizedTicker)
          .filter((t): t is string => Boolean(t && t.length > 0))
      )
    );

    const assetMap = new Map<string, { id: string; isCustom: boolean; userId: string | null }>();

    if (validTickers.length > 0) {
      // Busca ativos globais (B3/sistema) e customizados do próprio usuário
      const foundAssets = await tx
        .select({
          id: assets.id,
          ticker: assets.ticker,
          isCustom: assets.isCustom,
          userId: assets.userId,
        })
        .from(assets)
        .where(
          and(
            inArray(assets.ticker, validTickers),
            or(
              and(eq(assets.isCustom, false), isNull(assets.userId)),
              and(eq(assets.isCustom, true), eq(assets.userId, user.id))
            )
          )
        );

      for (const a of foundAssets) {
        // Ativo global tem prioridade se houver colisão de ticker com customizado
        if (!assetMap.has(a.ticker) || (!a.isCustom && assetMap.get(a.ticker)?.isCustom)) {
          assetMap.set(a.ticker, a);
        }
      }
    }

    // 7. Consulta de eventos existentes na carteira para detecção de duplicidade linha a linha
    const existingEvents = await tx
      .select({
        assetId: portfolioEvents.assetId,
        type: portfolioEvents.type,
        tradeDate: portfolioEvents.tradeDate,
        quantity: portfolioEvents.quantity,
        unitPrice: portfolioEvents.unitPrice,
      })
      .from(portfolioEvents)
      .where(
        and(
          eq(portfolioEvents.portfolioId, portfolio.id),
          isNull(portfolioEvents.deletedAt)
        )
      );

    // Cria um conjunto de chaves para lookup rápido de eventos existentes
    const existingEventKeys = new Set(
      existingEvents.map(
        (e) =>
          `${e.assetId}|${e.type}|${e.tradeDate.toISOString().slice(0, 10)}|${new Decimal(e.quantity).toString()}|${new Decimal(e.unitPrice).toString()}`
      )
    );

    // 8. Processamento e enriquecimento das linhas
    const batchId = crypto.randomUUID();
    const now = new Date();
    let validCount = 0;
    let warningCount = 0;
    let errorCount = 0;

    const itemsToInsert = parsedBatch.rows.map((row) => {
      const itemId = crypto.randomUUID();
      const validationErrors = [...row.validationErrors];
      let status: ImportItemStatus = row.status;
      let resolvedAssetId: string | null = null;
      let isDuplicate = false;
      let duplicateReason: string | null = null;
      let isExcluded = false;

      if (row.normalizedTicker) {
        const resolved = assetMap.get(row.normalizedTicker);
        if (resolved) {
          resolvedAssetId = resolved.id;
        } else if (status !== 'error') {
          // Ativo não identificado -> WARNING
          status = 'warning';
          validationErrors.push(
            'Ativo não encontrado no catálogo. Associe a um ativo existente ou autorize a criação de ativo customizado na revisão.'
          );
        }
      }

      // Detecção de duplicidade se a linha tiver ativo resolvido e dados válidos
      if (
        status === 'valid' &&
        resolvedAssetId &&
        row.actionType &&
        row.tradeDate &&
        row.quantity &&
        row.unitPrice
      ) {
        const eventKey = `${resolvedAssetId}|${row.actionType}|${row.tradeDate.toISOString().slice(0, 10)}|${row.quantity.toString()}|${row.unitPrice.toString()}`;
        if (existingEventKeys.has(eventKey)) {
          isDuplicate = true;
          duplicateReason = 'Operação idêntica já registrada nesta carteira para a mesma data.';
          isExcluded = true; // Desmarcado preventivamente por padrão
          status = 'duplicate';
        }
      }

      // Contabilização de métricas
      if (status === 'error') {
        errorCount++;
      } else if (status === 'warning') {
        warningCount++;
      } else {
        validCount++;
      }

      return {
        id: itemId,
        batchId,
        lineNumber: row.lineNumber,
        rawLine: row.rawLine,
        status,
        actionType: row.actionType || 'BUY',
        direction: row.direction,
        rawTicker: row.rawTicker || row.normalizedTicker || 'DESCONHECIDO',
        resolvedAssetId,
        tradeDate: row.tradeDate || now,
        settlementDate: row.settlementDate,
        quantity: (row.quantity || new Decimal('1')).toString(),
        unitPrice: (row.unitPrice || new Decimal('0')).toString(),
        fees: (row.fees || new Decimal('0')).toString(),
        currency: row.currency || portfolio.baseCurrency,
        notes: row.notes,
        validationErrors,
        isDuplicate,
        duplicateReason,
        isExcluded,
        importedPortfolioEventId: null,
        createdAt: now,
        updatedAt: now,
      };
    });

    const fileHashMessage = existingConfirmedBatch
      ? `Aviso: Um arquivo com o mesmo conteúdo já foi importado nesta carteira em ${existingConfirmedBatch.confirmedAt?.toLocaleDateString('pt-BR') || ''}.`
      : null;

    // 9. Inserção do lote
    const [insertedBatch] = await tx
      .insert(importBatches)
      .values({
        id: batchId,
        userId: user.id,
        portfolioId: portfolio.id,
        fileName: validatedInput.fileName,
        fileSize: validatedInput.fileSize,
        fileFormat: parsedBatch.formatId,
        status: 'pending_review',
        totalRecords: itemsToInsert.length,
        validRecords: validCount,
        warningRecords: warningCount,
        errorRecords: errorCount,
        rawContentHash,
        errorMessage: fileHashMessage,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    if (!insertedBatch) {
      throw new Error('Falha ao persistir lote de importação.');
    }

    // 10. Inserção dos itens do lote
    let insertedItems: ImportBatchItem[] = [];
    if (itemsToInsert.length > 0) {
      const rawInsertedItems = await tx
        .insert(importBatchItems)
        .values(itemsToInsert)
        .returning();

      insertedItems = rawInsertedItems.map((item) => ({
        ...item,
        status: item.status as ImportItemStatus,
        actionType: item.actionType as any,
        direction: item.direction as any,
        quantity: new Decimal(item.quantity),
        unitPrice: new Decimal(item.unitPrice),
        fees: new Decimal(item.fees),
        validationErrors: (item.validationErrors as string[]) || [],
      }));
    }

    // 11. Registro de auditoria
    await auditLogger(
      {
        tableName: 'import_batches',
        recordId: batchId,
        action: 'INSERT',
        actorId: user.id,
        actorType: 'user',
        source: 'import',
      },
      {
        newValue: {
          fileName: validatedInput.fileName,
          fileSize: validatedInput.fileSize,
          fileFormat: parsedBatch.formatId,
          totalRecords: itemsToInsert.length,
          validRecords: validCount,
          warningRecords: warningCount,
          errorRecords: errorCount,
          rawContentHash,
        },
      },
      {
        allowlist: [
          'fileName',
          'fileSize',
          'fileFormat',
          'totalRecords',
          'validRecords',
          'warningRecords',
          'errorRecords',
          'rawContentHash',
        ],
        allowedNumbers: [
          'fileSize',
          'totalRecords',
          'validRecords',
          'warningRecords',
          'errorRecords',
        ],
      },
      tx
    );

    const mappedBatch: ImportBatch = {
      ...insertedBatch,
      fileFormat: insertedBatch.fileFormat as ImportFormatId,
      status: insertedBatch.status as any,
    };

    return { batch: mappedBatch, items: insertedItems };
  });
}

/**
 * Consulta um lote de importação por ID com verificação estrita de autorização (IDOR protection).
 */
export async function getImportBatchById(
  id: string,
  user: SafeUser,
  executor: DbExecutor = db
): Promise<{ batch: ImportBatch; items: ImportBatchItem[] }> {
  if (!id || !UUID_REGEX.test(id)) {
    throw new ImportBatchNotFoundError();
  }

  const [batch] = await executor
    .select()
    .from(importBatches)
    .where(eq(importBatches.id, id))
    .limit(1);

  if (!batch) {
    throw new ImportBatchNotFoundError();
  }

  // Validação de posse
  await assertOwnership(batch.userId, user, 'import_batch', executor);

  // Busca nome da carteira
  const [portfolio] = await executor
    .select({ name: portfolios.name })
    .from(portfolios)
    .where(eq(portfolios.id, batch.portfolioId))
    .limit(1);

  const rawItems = await executor
    .select()
    .from(importBatchItems)
    .where(eq(importBatchItems.batchId, id))
    .orderBy(importBatchItems.lineNumber);

  const resolvedAssetIds = rawItems
    .map((i) => i.resolvedAssetId)
    .filter((assetId): assetId is string => assetId !== null);

  const assetMap = new Map<string, { ticker: string; name: string }>();
  if (resolvedAssetIds.length > 0) {
    const foundAssets = await executor
      .select({ id: assets.id, ticker: assets.ticker, name: assets.name })
      .from(assets)
      .where(inArray(assets.id, resolvedAssetIds));
    for (const a of foundAssets) {
      assetMap.set(a.id, { ticker: a.ticker, name: a.name });
    }
  }

  const items: ImportBatchItem[] = rawItems.map((item) => {
    const assetInfo = item.resolvedAssetId ? assetMap.get(item.resolvedAssetId) : undefined;
    return {
      ...item,
      resolvedAssetTicker: assetInfo?.ticker || null,
      resolvedAssetName: assetInfo?.name || null,
      status: item.status as ImportItemStatus,
      actionType: item.actionType as any,
      direction: item.direction as any,
      quantity: new Decimal(item.quantity),
      unitPrice: new Decimal(item.unitPrice),
      fees: new Decimal(item.fees),
      validationErrors: (item.validationErrors as string[]) || [],
    };
  });

  const mappedBatch: ImportBatch = {
    ...batch,
    portfolioName: portfolio?.name,
    fileFormat: batch.fileFormat as ImportFormatId,
    status: batch.status as any,
  };

  return { batch: mappedBatch, items };
}

/**
 * Lista os lotes de importação pertencentes exclusivamente ao usuário.
 */
export async function listImportBatches(
  user: SafeUser,
  portfolioId?: string,
  executor: DbExecutor = db
): Promise<ImportBatch[]> {
  const conditions = [eq(importBatches.userId, user.id)];
  if (portfolioId) {
    if (!UUID_REGEX.test(portfolioId)) {
      return [];
    }
    conditions.push(eq(importBatches.portfolioId, portfolioId));
  }

  const rawBatches = await executor
    .select({
      batch: importBatches,
      portfolioName: portfolios.name,
    })
    .from(importBatches)
    .leftJoin(portfolios, eq(importBatches.portfolioId, portfolios.id))
    .where(and(...conditions))
    .orderBy(desc(importBatches.createdAt));

  return rawBatches.map(({ batch: b, portfolioName }) => ({
    ...b,
    portfolioName: portfolioName || undefined,
    fileFormat: b.fileFormat as ImportFormatId,
    status: b.status as any,
  }));
}

/**
 * Atualiza um item do lote de importação durante a revisão humana.
 * Exige que o lote esteja no status 'pending_review'.
 */
export async function updateImportBatchItem(
  batchId: string,
  itemId: string,
  rawInput: UpdateImportItemInput,
  user: SafeUser,
  database: Database = db,
  auditLogger: typeof insertAuditLog = insertAuditLog
): Promise<ImportBatchItem> {
  const { batch } = await getImportBatchById(batchId, user, database);
  if (batch.status !== 'pending_review') {
    throw new ImportBatchNotEditableError();
  }

  if (!itemId || !UUID_REGEX.test(itemId)) {
    throw new ImportBatchItemNotFoundError();
  }

  const validatedInput = updateImportItemSchema.parse(rawInput);

  return await database.transaction(async (tx) => {
    const [existingItem] = await tx
      .select()
      .from(importBatchItems)
      .where(
        and(
          eq(importBatchItems.id, itemId),
          eq(importBatchItems.batchId, batchId)
        )
      )
      .limit(1);

    if (!existingItem) {
      throw new ImportBatchItemNotFoundError();
    }

    let resolvedAssetId = validatedInput.resolvedAssetId || null;
    const validationErrors: string[] = [];

    // Se resolvedAssetId foi fornecido diretamente, valida posse/acesso
    if (resolvedAssetId) {
      const asset = await getAssetById(resolvedAssetId, user, tx);
      resolvedAssetId = asset.id;
    } else {
      // Tenta resolver pelo ticker editado
      const normalizedTicker = normalizeTicker(validatedInput.rawTicker);
      const [foundAsset] = await tx
        .select({ id: assets.id })
        .from(assets)
        .where(
          and(
            eq(assets.ticker, normalizedTicker),
            or(
              and(eq(assets.isCustom, false), isNull(assets.userId)),
              and(eq(assets.isCustom, true), eq(assets.userId, user.id))
            )
          )
        )
        .limit(1);

      if (foundAsset) {
        resolvedAssetId = foundAsset.id;
      } else {
        validationErrors.push(
          'Ativo não encontrado no catálogo. Associe a um ativo existente ou autorize a criação de ativo customizado.'
        );
      }
    }

    let newStatus: ImportItemStatus = 'valid';
    if (validationErrors.length > 0) {
      newStatus = 'warning';
    }

    const [updated] = await tx
      .update(importBatchItems)
      .set({
        actionType: validatedInput.actionType,
        direction: validatedInput.direction ?? null,
        rawTicker: validatedInput.rawTicker,
        resolvedAssetId,
        tradeDate: validatedInput.tradeDate,
        settlementDate: validatedInput.settlementDate ?? null,
        quantity: validatedInput.quantity.toString(),
        unitPrice: validatedInput.unitPrice.toString(),
        fees: (validatedInput.fees || new Decimal('0')).toString(),
        currency: validatedInput.currency,
        notes: validatedInput.notes ?? null,
        validationErrors,
        isExcluded: validatedInput.isExcluded,
        status: newStatus,
        updatedAt: new Date(),
      })
      .where(eq(importBatchItems.id, itemId))
      .returning();

    if (!updated) {
      throw new ImportBatchItemNotFoundError();
    }

    // Recalcula métricas do lote
    await recalculateBatchMetrics(batchId, tx);

    await auditLogger(
      {
        tableName: 'import_batch_items',
        recordId: itemId,
        action: 'UPDATE',
        actorId: user.id,
        actorType: 'user',
        source: 'import',
      },
      {
        oldValue: {
          actionType: existingItem.actionType,
          rawTicker: existingItem.rawTicker,
          quantity: existingItem.quantity,
          unitPrice: existingItem.unitPrice,
        },
        newValue: {
          actionType: validatedInput.actionType,
          rawTicker: validatedInput.rawTicker,
          quantity: validatedInput.quantity.toString(),
          unitPrice: validatedInput.unitPrice.toString(),
        },
      },
      {
        allowlist: ['actionType', 'rawTicker', 'quantity', 'unitPrice'],
      },
      tx
    );

    return {
      ...updated,
      status: updated.status as ImportItemStatus,
      actionType: updated.actionType as any,
      direction: updated.direction as any,
      quantity: new Decimal(updated.quantity),
      unitPrice: new Decimal(updated.unitPrice),
      fees: new Decimal(updated.fees),
      validationErrors: (updated.validationErrors as string[]) || [],
    };
  });
}

/**
 * Alterna o status de exclusão (desmarcar/marcar) de um item do lote.
 */
export async function toggleImportBatchItemExclusion(
  batchId: string,
  itemId: string,
  isExcluded: boolean,
  user: SafeUser,
  database: Database = db
): Promise<ImportBatchItem> {
  const { batch } = await getImportBatchById(batchId, user, database);
  if (batch.status !== 'pending_review') {
    throw new ImportBatchNotEditableError();
  }

  if (!itemId || !UUID_REGEX.test(itemId)) {
    throw new ImportBatchItemNotFoundError();
  }

  return await database.transaction(async (tx) => {
    const [updated] = await tx
      .update(importBatchItems)
      .set({
        isExcluded,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(importBatchItems.id, itemId),
          eq(importBatchItems.batchId, batchId)
        )
      )
      .returning();

    if (!updated) {
      throw new ImportBatchItemNotFoundError();
    }

    return {
      ...updated,
      status: updated.status as ImportItemStatus,
      actionType: updated.actionType as any,
      direction: updated.direction as any,
      quantity: new Decimal(updated.quantity),
      unitPrice: new Decimal(updated.unitPrice),
      fees: new Decimal(updated.fees),
      validationErrors: (updated.validationErrors as string[]) || [],
    };
  });
}

/**
 * Resolve um ativo não identificado mediante ação explícita e autorizada do usuário na tela de revisão:
 * - 'select_existing': associa o item a um ativo existente no catálogo (global ou customizado do usuário).
 * - 'create_custom': cria um ativo customizado pertencente estritamente ao usuário autenticado e associa ao item.
 */
export async function resolveUnmappedBatchItemAsset(
  input: ResolveUnmappedAssetInput,
  user: SafeUser,
  database: Database = db,
  auditLogger: typeof insertAuditLog = insertAuditLog
): Promise<ImportBatchItem> {
  const { batch } = await getImportBatchById(input.batchId, user, database);
  if (batch.status !== 'pending_review') {
    throw new ImportBatchNotEditableError();
  }

  if (!input.itemId || !UUID_REGEX.test(input.itemId)) {
    throw new ImportBatchItemNotFoundError();
  }

  return await database.transaction(async (tx) => {
    const [item] = await tx
      .select()
      .from(importBatchItems)
      .where(
        and(
          eq(importBatchItems.id, input.itemId),
          eq(importBatchItems.batchId, input.batchId)
        )
      )
      .limit(1);

    if (!item) {
      throw new ImportBatchItemNotFoundError();
    }

    let targetAssetId: string;

    if (input.action === 'select_existing') {
      if (!input.existingAssetId) {
        throw new Error('ID do ativo existente é obrigatório para a ação "select_existing".');
      }
      // Valida que o ativo existe e é global ou customizado do próprio usuário
      const asset = await getAssetById(input.existingAssetId, user, tx);
      targetAssetId = asset.id;
    } else if (input.action === 'create_custom') {
      // Cria ativo customizado pertencente estritamente ao usuário
      const normalizedTicker = normalizeTicker(item.rawTicker);
      const rawCurr = input.customAssetData?.currency || item.currency || 'BRL';
      const targetCurrency: 'BRL' | 'USD' | 'EUR' =
        rawCurr === 'USD' || rawCurr === 'EUR' ? rawCurr : 'BRL';

      const customAsset = await createCustomAssetInTransaction(
        {
          ticker: normalizedTicker,
          name: input.customAssetData?.name || normalizedTicker,
          assetType: 'custom',
          market: 'CUSTOM',
          currency: targetCurrency,
          userId: user.id,
        },
        user,
        tx,
        auditLogger
      );
      targetAssetId = customAsset.id;
    } else {
      throw new Error('Ação de resolução de ativo inválida.');
    }

    // Remove erros relacionados a ativo não identificado
    const currentErrors = (item.validationErrors as string[]) || [];
    const remainingErrors = currentErrors.filter(
      (e) => !e.includes('Ativo não encontrado') && !e.includes('Ativo não identificado')
    );

    const newStatus: ImportItemStatus = remainingErrors.length > 0 ? 'error' : 'valid';

    const [updated] = await tx
      .update(importBatchItems)
      .set({
        resolvedAssetId: targetAssetId,
        validationErrors: remainingErrors,
        status: newStatus,
        updatedAt: new Date(),
      })
      .where(eq(importBatchItems.id, input.itemId))
      .returning();

    if (!updated) {
      throw new ImportBatchItemNotFoundError();
    }

    // Recalcula contadores do lote
    await recalculateBatchMetrics(input.batchId, tx);

    return {
      ...updated,
      status: updated.status as ImportItemStatus,
      actionType: updated.actionType as any,
      direction: updated.direction as any,
      quantity: new Decimal(updated.quantity),
      unitPrice: new Decimal(updated.unitPrice),
      fees: new Decimal(updated.fees),
      validationErrors: remainingErrors,
    };
  });
}

/**
 * Função utilitária interna para sincronizar e recalcular contadores do lote.
 */
async function recalculateBatchMetrics(
  batchId: string,
  tx: DatabaseTransaction
): Promise<void> {
  const items = await tx
    .select({ status: importBatchItems.status })
    .from(importBatchItems)
    .where(eq(importBatchItems.batchId, batchId));

  let valid = 0;
  let warning = 0;
  let error = 0;

  for (const item of items) {
    if (item.status === 'error') error++;
    else if (item.status === 'warning') warning++;
    else valid++;
  }

  await tx
    .update(importBatches)
    .set({
      totalRecords: items.length,
      validRecords: valid,
      warningRecords: warning,
      errorRecords: error,
      updatedAt: new Date(),
    })
    .where(eq(importBatches.id, batchId));
}

export interface ConfirmImportBatchResult {
  batch: ImportBatch;
  importedEventsCount: number;
  eventIds: string[];
}

/**
 * Confirma a importação de um lote de operações em transação única e atômica:
 * 1. Lock pessimista no lote e validação de propriedade e status (apenas pending_review).
 * 2. Validação da carteira de destino (pertencente ao usuário, ativa e não congelada).
 * 3. Lock pessimista na carteira para serializar concorrência financeira.
 * 4. Validação estrita de cada linha ativa a ser importada (rejeita erros, falta de ativo, valores inválidos).
 * 5. Ordenação cronológica determinística dos eventos.
 * 6. Criação dos portfolio_events reutilizando createPortfolioEventInTransaction e regras do position-engine.
 * 7. Vínculo de cada item ao evento financeiro gerado (importedPortfolioEventId).
 * 8. Atualização do status do lote para 'confirmed' e auditoria.
 * 9. Rollback integral e seguro em caso de qualquer falha.
 */
export async function confirmImportBatch(
  rawInput: ConfirmImportBatchInput,
  user: SafeUser,
  database: Database = db,
  auditLogger: typeof insertAuditLog = insertAuditLog
): Promise<ConfirmImportBatchResult> {
  const input = confirmImportBatchSchema.parse(rawInput);

  return await database.transaction(async (tx) => {
    // 1. Lock pessimista no lote
    const [batch] = await tx
      .select()
      .from(importBatches)
      .where(eq(importBatches.id, input.batchId))
      .for('update');

    if (!batch) {
      throw new ImportBatchNotFoundError();
    }

    // Validação de propriedade do lote
    await assertOwnership(batch.userId, user, 'import_batch', tx);

    // Validação de status: somente pending_review pode ser confirmado
    if (batch.status !== 'pending_review') {
      throw new ImportBatchNotEditableError(
        `Não é possível confirmar um lote no status "${batch.status}". Apenas lotes em revisão pendente podem ser confirmados.`
      );
    }

    // 2. Validação da carteira de destino e bloqueio de carteira congelada
    const targetPortfolioId = input.targetPortfolioId || batch.portfolioId;
    const portfolio = await getPortfolioById(targetPortfolioId, user, tx);
    assertPortfolioWritable(portfolio);

    // 3. Lock pessimista na carteira para serializar operações financeiras concorrentes
    await tx
      .select({ id: portfolios.id })
      .from(portfolios)
      .where(eq(portfolios.id, targetPortfolioId))
      .for('update');

    // 4. Busca todos os itens do lote
    const items = await tx
      .select()
      .from(importBatchItems)
      .where(eq(importBatchItems.batchId, batch.id))
      .orderBy(importBatchItems.lineNumber);

    // 5. Filtra itens ativos a serem importados
    const itemsToImport = items.filter((item) => {
      if (input.selectedItemIds && input.selectedItemIds.length > 0) {
        return input.selectedItemIds.includes(item.id);
      }
      return !item.isExcluded;
    });

    if (itemsToImport.length === 0) {
      throw new Error('Nenhum item válido selecionado para importação nesta carteira.');
    }

    // 6. Validação estrita de cada item antes de gravar qualquer evento
    for (const item of itemsToImport) {
      if (item.status === 'error') {
        throw new Error(
          `A linha ${item.lineNumber} (${item.rawTicker}) possui erros e não pode ser importada. Corrija o item ou desmarque-o da importação.`
        );
      }
      if (!item.resolvedAssetId) {
        throw new Error(
          `A linha ${item.lineNumber} (ativo ${item.rawTicker}) não possui um ativo associado. Associe a um ativo existente ou autorize a criação de ativo customizado antes de confirmar.`
        );
      }
      if (
        !['BUY', 'SELL', 'TRANSFER_IN', 'TRANSFER_OUT', 'MANUAL_ADJUSTMENT'].includes(
          item.actionType
        )
      ) {
        throw new Error(
          `Tipo de operação "${item.actionType}" na linha ${item.lineNumber} não é suportado pelo sistema.`
        );
      }
      if (
        item.actionType === 'MANUAL_ADJUSTMENT' &&
        item.direction !== 'IN' &&
        item.direction !== 'OUT'
      ) {
        throw new Error(
          `Operação de ajuste manual na linha ${item.lineNumber} exige direção ("IN" ou "OUT").`
        );
      }
      const qty = new Decimal(item.quantity);
      if (qty.lte(0)) {
        throw new Error(`Quantidade na linha ${item.lineNumber} deve ser maior que zero.`);
      }
      const price = new Decimal(item.unitPrice);
      if (price.lt(0)) {
        throw new Error(`Preço unitário na linha ${item.lineNumber} não pode ser negativo.`);
      }
      const fees = new Decimal(item.fees);
      if (fees.lt(0)) {
        throw new Error(`Taxas na linha ${item.lineNumber} não podem ser negativas.`);
      }
    }

    // 7. Ordenação cronológica determinística dos itens (entradas antes de saídas na mesma data/hora)
    const sortedItems = [...itemsToImport].sort((a, b) => {
      const timeA = new Date(a.tradeDate).getTime();
      const timeB = new Date(b.tradeDate).getTime();
      if (timeA !== timeB) return timeA - timeB;

      const isEntryA =
        a.actionType === 'BUY' ||
        a.actionType === 'TRANSFER_IN' ||
        (a.actionType === 'MANUAL_ADJUSTMENT' && a.direction === 'IN');
      const isEntryB =
        b.actionType === 'BUY' ||
        b.actionType === 'TRANSFER_IN' ||
        (b.actionType === 'MANUAL_ADJUSTMENT' && b.direction === 'IN');
      if (isEntryA && !isEntryB) return -1;
      if (!isEntryA && isEntryB) return 1;

      return a.lineNumber - b.lineNumber;
    });

    // 8. Criação sequencial de portfolio_events e vinculação de cada item
    const createdEventIds: { itemId: string; eventId: string }[] = [];
    for (const item of sortedItems) {
      const rawCurr = item.currency || portfolio.baseCurrency || 'BRL';
      const targetCurrency: 'BRL' | 'USD' | 'EUR' =
        rawCurr === 'USD' || rawCurr === 'EUR' ? rawCurr : 'BRL';

      const eventOutput = {
        portfolioId: targetPortfolioId,
        assetId: item.resolvedAssetId!,
        type: item.actionType as any,
        direction: item.direction as any,
        tradeDate: new Date(item.tradeDate),
        settlementDate: item.settlementDate ? new Date(item.settlementDate) : null,
        quantity: item.quantity.toString(),
        unitPrice: item.unitPrice.toString(),
        fees: item.fees.toString(),
        currency: targetCurrency,
        notes: item.notes || `Importado via lote ${batch.fileName} (linha ${item.lineNumber})`,
        source: 'import' as const,
      };

      const createdEvent = await createPortfolioEventInTransaction(
        eventOutput,
        user,
        tx,
        auditLogger
      );

      createdEventIds.push({ itemId: item.id, eventId: createdEvent.id });

      // Vincula o item ao ID do evento gerado
      await tx
        .update(importBatchItems)
        .set({
          importedPortfolioEventId: createdEvent.id,
          updatedAt: new Date(),
        })
        .where(eq(importBatchItems.id, item.id));
    }

    // 9. Atualiza o status do lote para 'confirmed'
    const now = new Date();
    const [confirmedBatch] = await tx
      .update(importBatches)
      .set({
        status: 'confirmed',
        portfolioId: targetPortfolioId,
        confirmedAt: now,
        updatedAt: now,
      })
      .where(eq(importBatches.id, batch.id))
      .returning();

    if (!confirmedBatch) {
      throw new Error('Falha ao atualizar status do lote de importação.');
    }

    // 10. Registra auditoria da confirmação
    await auditLogger(
      {
        tableName: 'import_batches',
        recordId: batch.id,
        action: 'UPDATE',
        actorId: user.id,
        actorType: 'user',
        source: 'import',
      },
      {
        oldValue: { status: 'pending_review' },
        newValue: {
          status: 'confirmed',
          confirmedAt: now.toISOString(),
          importedEventsCount: sortedItems.length,
        },
      },
      {
        allowlist: ['status', 'confirmedAt', 'importedEventsCount'],
        allowedNumbers: ['importedEventsCount'],
      },
      tx
    );

    return {
      batch: {
        ...confirmedBatch,
        fileFormat: confirmedBatch.fileFormat as ImportFormatId,
        status: 'confirmed' as const,
      },
      importedEventsCount: sortedItems.length,
      eventIds: createdEventIds.map((c) => c.eventId),
    };
  });
}

/**
 * Rejeita ou descarta um lote de importação não confirmado:
 * 1. Lock pessimista no lote e validação de propriedade.
 * 2. Impede descarte de lotes já confirmados ou já rejeitados.
 * 3. Atualiza o status para 'rejected' com motivo opcional.
 * 4. Registra auditoria em audit_logs.
 */
export async function rejectImportBatch(
  rawInput: RejectImportBatchInput,
  user: SafeUser,
  database: Database = db,
  auditLogger: typeof insertAuditLog = insertAuditLog
): Promise<{ batch: ImportBatch }> {
  const input = rejectImportBatchSchema.parse(rawInput);

  return await database.transaction(async (tx) => {
    const [batch] = await tx
      .select()
      .from(importBatches)
      .where(eq(importBatches.id, input.batchId))
      .for('update');

    if (!batch) {
      throw new ImportBatchNotFoundError();
    }

    await assertOwnership(batch.userId, user, 'import_batch', tx);

    if (batch.status === 'confirmed') {
      throw new ImportBatchNotEditableError('Lotes já confirmados não podem ser rejeitados.');
    }
    if (batch.status === 'rejected') {
      throw new ImportBatchNotEditableError('Este lote já foi rejeitado anteriormente.');
    }

    const now = new Date();
    const reason = input.reason || 'Lote descartado pelo usuário.';
    const [rejectedBatch] = await tx
      .update(importBatches)
      .set({
        status: 'rejected',
        errorMessage: reason,
        updatedAt: now,
      })
      .where(eq(importBatches.id, batch.id))
      .returning();

    if (!rejectedBatch) {
      throw new Error('Falha ao rejeitar lote de importação.');
    }

    await auditLogger(
      {
        tableName: 'import_batches',
        recordId: batch.id,
        action: 'UPDATE',
        actorId: user.id,
        actorType: 'user',
        source: 'import',
      },
      {
        oldValue: { status: batch.status },
        newValue: {
          status: 'rejected',
          reason,
        },
      },
      {
        allowlist: ['status', 'reason'],
      },
      tx
    );

    return {
      batch: {
        ...rejectedBatch,
        fileFormat: rejectedBatch.fileFormat as ImportFormatId,
        status: 'rejected' as const,
      },
    };
  });
}
