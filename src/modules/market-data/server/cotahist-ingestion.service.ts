import fs from 'node:fs';
import readline from 'node:readline';
import crypto from 'node:crypto';
import { eq, isNull, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { b3CotahistBatches } from '@/lib/db/schema/b3-market-data';
import { assets } from '@/lib/db/schema/portfolio';
import { auditLogs } from '@/lib/db/schema/audit';
import {
  parseCotahistHeader,
  parseCotahistQuoteRecord,
  parseCotahistTrailer,
  getCotahistLineType,
  parseB3DateString,
} from '../domain/cotahist-parser';
import type {
  CotahistBatchSummary,
  CotahistFileType,
  CotahistQuoteRecord,
  IngestCotahistOptions,
} from '../domain/cotahist.types';
import {
  computeFileSha256,
  storeZipFile,
  extractTxtFromZip,
} from './cotahist-storage.service';

export class CotahistIngestionService {
  /**
   * Processa a ingestão completa de um arquivo COTAHIST da B3 (diário ou anual).
   */
  public async ingestFile(
    filePath: string,
    options: IngestCotahistOptions = {}
  ): Promise<CotahistBatchSummary> {
    const startTime = Date.now();
    const dryRun = options.dryRun ?? false;
    const force = options.force ?? false;
    const batchChunkSize = Math.min(Math.max(options.batchSize ?? 500, 100), 1000);
    const ingestionRunId = crypto.randomUUID();

    // 1. Calcula o SHA-256 do arquivo original
    const sha256 = await computeFileSha256(filePath);

    // 2. Determina o tipo de arquivo a partir do nome
    const baseName = filePath.split(/[/\\]/).pop() || '';
    const upperBaseName = baseName.toUpperCase();
    const isDaily = upperBaseName.includes('_D') || upperBaseName.startsWith('COTAHIST_D');
    const fileType: CotahistFileType = isDaily ? 'daily' : 'annual';

    // Extrai data de referência ou ano se disponível no nome
    let referenceDate: string | null = null;
    let referenceYear: number | null = null;

    if (isDaily) {
      const match = upperBaseName.match(/D(\d{2})(\d{2})(\d{4})/);
      if (match) {
        const day = match[1];
        const month = match[2];
        const year = match[3];
        referenceDate = `${year}-${month}-${day}`;
        referenceYear = parseInt(year, 10);
      }
    } else {
      const match = upperBaseName.match(/A(\d{4})/);
      if (match) {
        referenceYear = parseInt(match[1], 10);
      }
    }

    // 3. Verifica duplicidade ou estado existente no banco
    const [existingBatch] = await db
      .select()
      .from(b3CotahistBatches)
      .where(eq(b3CotahistBatches.sha256, sha256));

    if (existingBatch) {
      if (existingBatch.status === 'COMPLETED' && !force && !dryRun) {
        return {
          batchId: existingBatch.id,
          fileName: existingBatch.fileName,
          fileType: existingBatch.fileType as CotahistFileType,
          fileSize: existingBatch.fileSize,
          sha256: existingBatch.sha256,
          status: 'DUPLICATE',
          totalLines: existingBatch.totalLines,
          headerCount: existingBatch.headerCount,
          quoteCount: existingBatch.quoteCount,
          trailerCount: existingBatch.trailerCount,
          acceptedRecords: existingBatch.acceptedRecords,
          rejectedRecords: existingBatch.rejectedRecords,
          unknownRecords: existingBatch.unknownRecords,
          associatedInstruments: existingBatch.associatedInstruments,
          unassociatedInstruments: existingBatch.unassociatedInstruments,
          duplicateRecords: existingBatch.duplicateRecords,
          trailerDiscrepancy: existingBatch.trailerDiscrepancy,
          recordsRead: 0,
          recordsAccepted: 0,
          recordsInserted: 0,
          recordsConflicted: 0,
          recordsRejected: 0,
          errorCount: 0,
          skippedAsDuplicate: true,
          skipReason: 'batch_sha256_already_processed',
          startedAt: existingBatch.startedAt ?? undefined,
          completedAt: existingBatch.completedAt ?? undefined,
          executionTimeMs: Date.now() - startTime,
        };
      }
    }

    // 4. Armazena com segurança o ZIP no storage privado
    const { storagePath, fileName, fileSize } = await storeZipFile(filePath, sha256);

    const batchId = existingBatch ? existingBatch.id : crypto.randomUUID();

    if (!dryRun) {
      if (existingBatch) {
        await db
          .update(b3CotahistBatches)
          .set({
            status: 'VALIDATING',
            startedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(b3CotahistBatches.id, batchId));
      } else {
        await db.insert(b3CotahistBatches).values({
          id: batchId,
          fileName,
          fileType,
          referenceDate,
          referenceYear,
          fileSize,
          sha256,
          storagePath,
          status: 'VALIDATING',
          startedAt: new Date(),
          createdBy: options.userId ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    }

    // 5. Carrega o mapa de ativos globais existentes para associação segura de asset_id
    const globalAssets = await db
      .select({ id: assets.id, ticker: assets.ticker })
      .from(assets)
      .where(isNull(assets.userId));

    const assetMap = new Map<string, string>();
    for (const a of globalAssets) {
      assetMap.set(a.ticker.toUpperCase(), a.id);
    }

    // 6. Extrai o TXT de forma segura
    const { tempTxtPath, cleanup } = await extractTxtFromZip(filePath);

    let totalLines = 0;
    let headerCount = 0;
    let quoteCount = 0;
    let trailerCount = 0;
    let rejectedCount = 0;
    let unknownCount = 0;
    let associatedCount = 0;
    let unassociatedCount = 0;
    let recordsInserted = 0;
    let recordsConflicted = 0;
    let errorCount = 0;
    let trailerExpectedCount = 0;
    let trailerDiscrepancy = false;

    let quoteBuffer: CotahistQuoteRecord[] = [];

    try {
      if (!dryRun) {
        await db
          .update(b3CotahistBatches)
          .set({ status: 'PROCESSING', updatedAt: new Date() })
          .where(eq(b3CotahistBatches.id, batchId));
      }

      const fileStream = fs.createReadStream(tempTxtPath, { encoding: 'latin1' });
      const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity,
      });

      const flushBuffer = async () => {
        if (quoteBuffer.length === 0) return;

        const currentChunk = quoteBuffer;
        quoteBuffer = [];

        const recordsToInsert = currentChunk.map((q) => {
          const matchedAssetId = assetMap.get(q.ticker);
          if (matchedAssetId) {
            associatedCount++;
          } else {
            unassociatedCount++;
          }

          return {
            id: crypto.randomUUID(),
            batchId,
            tradeDate: q.tradeDate,
            bdiCode: q.bdiCode,
            ticker: q.ticker,
            marketType: q.marketType,
            shortName: q.shortName,
            specification: q.specification,
            forwardTermDays: q.forwardTermDays ?? null,
            currency: q.currency,
            openPrice: q.openPrice.toFixed(8),
            highPrice: q.highPrice.toFixed(8),
            lowPrice: q.lowPrice.toFixed(8),
            averagePrice: q.averagePrice.toFixed(8),
            closePrice: q.closePrice.toFixed(8),
            bestBidPrice: q.bestBidPrice ? q.bestBidPrice.toFixed(8) : null,
            bestAskPrice: q.bestAskPrice ? q.bestAskPrice.toFixed(8) : null,
            tradeCount: q.tradeCount,
            quantity: q.quantity.toFixed(10),
            financialVolume: q.financialVolume.toFixed(10),
            strikePrice: q.strikePrice ? q.strikePrice.toFixed(8) : null,
            correctionIndicator: q.correctionIndicator ?? null,
            expirationDate: q.expirationDate ?? null,
            quotationFactor: q.quotationFactor,
            strikePoints: q.strikePoints ? q.strikePoints.toFixed(8) : null,
            isin: q.isin ?? null,
            distributionNumber: q.distributionNumber ?? null,
            assetId: matchedAssetId ?? null,
            recordHash: q.recordHash,
            createdAt: new Date().toISOString(),
          };
        });

        if (!dryRun && recordsToInsert.length > 0) {
          // Inserção em lote via SQL parametrizado com detecção exata de inserções e conflitos
          const insertResult = await db.execute(sql`
            INSERT INTO "b3_historical_quotes" (
              "id", "batch_id", "trade_date", "bdi_code", "ticker", "market_type",
              "short_name", "specification", "forward_term_days", "currency",
              "open_price", "high_price", "low_price", "average_price", "close_price",
              "best_bid_price", "best_ask_price", "trade_count", "quantity",
              "financial_volume", "strike_price", "correction_indicator",
              "expiration_date", "quotation_factor", "strike_points", "isin",
              "distribution_number", "asset_id", "record_hash", "created_at"
            )
            VALUES ${sql.join(
              recordsToInsert.map(
                (r) => sql`(${r.id}, ${r.batchId}, ${r.tradeDate}, ${r.bdiCode}, ${r.ticker}, ${r.marketType}, ${r.shortName}, ${r.specification}, ${r.forwardTermDays}, ${r.currency}, ${r.openPrice}, ${r.highPrice}, ${r.lowPrice}, ${r.averagePrice}, ${r.closePrice}, ${r.bestBidPrice}, ${r.bestAskPrice}, ${r.tradeCount}, ${r.quantity}, ${r.financialVolume}, ${r.strikePrice}, ${r.correctionIndicator}, ${r.expirationDate}, ${r.quotationFactor}, ${r.strikePoints}, ${r.isin}, ${r.distributionNumber}, ${r.assetId}, ${r.recordHash}, ${r.createdAt})`
              ),
              sql`, `
            )}
            ON CONFLICT ("record_hash") DO NOTHING
            RETURNING "record_hash";
          `);

          const insertedRows = (insertResult as unknown as Array<{ record_hash: string }>) || [];
          const insertedThisChunk = insertedRows.length;
          const conflictedThisChunk = currentChunk.length - insertedThisChunk;
          recordsInserted += insertedThisChunk;
          recordsConflicted += conflictedThisChunk;
        } else if (dryRun) {
          recordsInserted += recordsToInsert.length;
        }
      };

      for await (const rawLine of rl) {
        if (!rawLine || rawLine.trim().length === 0) {
          continue;
        }

        totalLines++;
        const lineType = getCotahistLineType(rawLine);

        if (lineType === '00') {
          headerCount++;
          const header = parseCotahistHeader(rawLine);
          if (!referenceDate && isDaily) {
            referenceDate = header.generationDateFormatted;
          }
        } else if (lineType === '01') {
          // Filtragem de BDI se configurada (ex: pular opções 78/82 para preservação de espaço e performance)
          if (options.skipOptions) {
            const bdi = rawLine.substring(10, 12).trim();
            if (bdi === '78' || bdi === '82') {
              continue;
            }
          }
          if (options.bdiFilter && options.bdiFilter.length > 0) {
            const bdi = rawLine.substring(10, 12).trim();
            if (!options.bdiFilter.includes(bdi)) {
              continue;
            }
          }

          quoteCount++;
          let quote: CotahistQuoteRecord | null = null;
          try {
            quote = parseCotahistQuoteRecord(rawLine, totalLines);
          } catch {
            rejectedCount++;
            errorCount++;
          }

          if (quote) {
            quoteBuffer.push(quote);
            if (quoteBuffer.length >= batchChunkSize) {
              await flushBuffer();
            }
          }
        } else if (lineType === '99') {
          trailerCount++;
          const trailer = parseCotahistTrailer(rawLine);
          trailerExpectedCount = trailer.totalRecords;
        } else {
          unknownCount++;
        }
      }

      // Flush dos registros restantes
      await flushBuffer();

      // Validação do Trailer contra a contagem real de registros 01 ou linhas totais
      if (trailerCount > 0 && trailerExpectedCount > 0) {
        if (
          trailerExpectedCount !== quoteCount &&
          trailerExpectedCount !== totalLines &&
          trailerExpectedCount !== quoteCount + 2
        ) {
          trailerDiscrepancy = true;
        }
      }

      const completedAt = new Date();
      const executionTimeMs = Date.now() - startTime;
      const mem = process.memoryUsage();
      const recordsRead = quoteCount;
      const recordsAccepted = quoteCount - rejectedCount;

      if (!dryRun) {
        await db
          .update(b3CotahistBatches)
          .set({
            status: 'COMPLETED',
            totalLines,
            headerCount,
            quoteCount,
            trailerCount,
            acceptedRecords: recordsAccepted,
            rejectedRecords: rejectedCount,
            unknownRecords: unknownCount,
            associatedInstruments: associatedCount,
            unassociatedInstruments: unassociatedCount,
            duplicateRecords: recordsConflicted,
            trailerDiscrepancy,
            recordsRead,
            recordsAccepted,
            recordsInserted,
            recordsConflicted,
            recordsRejected: rejectedCount,
            errorCount,
            skippedAsDuplicate: false,
            ingestionRunId,
            completedAt,
            updatedAt: new Date(),
          })
          .where(eq(b3CotahistBatches.id, batchId));

        // Registro de Auditoria
        await db.insert(auditLogs).values({
          id: crypto.randomUUID(),
          tableName: 'b3_cotahist_batches',
          recordId: batchId,
          action: 'INSERT',
          actorId: options.userId ?? null,
          actorType: options.userId ? 'user' : 'system',
          source: 'import',
          reason: `Ingestão de lote COTAHIST ${fileName}`,
          newValue: {
            fileName,
            fileType,
            fileSize,
            sha256,
            totalLines,
            quoteCount,
            recordsRead,
            recordsAccepted,
            recordsInserted,
            recordsConflicted,
            recordsRejected: rejectedCount,
            errorCount,
            associatedInstruments: associatedCount,
            unassociatedInstruments: unassociatedCount,
            trailerDiscrepancy,
            executionTimeMs,
          },
          createdAt: new Date(),
        });
      }

      return {
        batchId,
        fileName,
        fileType,
        fileSize,
        sha256,
        status: 'COMPLETED',
        totalLines,
        headerCount,
        quoteCount,
        trailerCount,
        acceptedRecords: recordsAccepted,
        rejectedRecords: rejectedCount,
        unknownRecords: unknownCount,
        associatedInstruments: associatedCount,
        unassociatedInstruments: unassociatedCount,
        duplicateRecords: recordsConflicted,
        trailerDiscrepancy,
        recordsRead,
        recordsAccepted,
        recordsInserted,
        recordsConflicted,
        recordsRejected: rejectedCount,
        errorCount,
        skippedAsDuplicate: false,
        startedAt: new Date(startTime),
        completedAt,
        executionTimeMs,
        peakMemoryBytes: mem.heapUsed,
      };
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido durante ingestão.';

      if (!dryRun) {
        await db
          .update(b3CotahistBatches)
          .set({
            status: 'FAILED',
            errorMessage,
            errorCount: errorCount + 1,
            updatedAt: new Date(),
          })
          .where(eq(b3CotahistBatches.id, batchId));
      }

      throw err;
    } finally {
      await cleanup();
    }
  }
}
