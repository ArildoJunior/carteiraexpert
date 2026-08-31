import { eq, sql, and } from 'drizzle-orm';
import { db } from '@/lib/db';
import { assetFundamentals } from '@/lib/db/schema/market-fundamentals';
import { auditLogs } from '@/lib/db/schema/audit';
import { cvmBindingService } from './cvm-binding.service';
import {
  selectStatementsForPublication,
} from '../domain/cvm-fundamentals-engine';
import { publishFundamentalsInputSchema } from '../domain/cvm-fundamentals.schema';
import {
  type ConvertedFundamentals,
  type CvmFundamentalsAuditAction,
  type PublishedFundamentalRecord,
  type PublishFundamentalsInput,
  type PublishFundamentalsResult,
} from '../domain/cvm-fundamentals.types';

type DbExecutor = typeof db | Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Serviço transacional para conversão, resolução de vínculos e publicação
 * de demonstrações financeiras em asset_fundamentals com auditoria contínua.
 */
export class CvmFundamentalsPublisherService {
  /**
   * Processa e publica uma coleção de demonstrativos contábeis CVM.
   */
  public async publishStatements(
    input: PublishFundamentalsInput,
    executor: DbExecutor = db
  ): Promise<PublishFundamentalsResult> {
    publishFundamentalsInputSchema.parse(input);

    const { statements, context, actorId, actorType = 'system' } = input;

    // 1. Seleciona as demonstrações contábeis vencedoras por período (CONSOLIDATED prioritária, INDIVIDUAL fallback)
    const selectedStatementsMap = selectStatementsForPublication(statements);

    const result: PublishFundamentalsResult = {
      totalStatementsReceived: statements.length,
      companiesProcessed: 0,
      totalRecordsPublished: 0,
      recordsInserted: 0,
      recordsUpdated: 0,
      skippedUnboundCompanies: 0,
      skippedUnsupportedSectors: 0,
      sanityCheckFailures: 0,
      records: [],
    };

    // 2. Itera sobre cada período/companhia selecionada
    for (const [periodKey, convertedStmt] of selectedStatementsMap.entries()) {
      result.companiesProcessed++;
      const [cnpj, cvmCode] = periodKey.split('#');

      const executeInTransaction = async (tx: any) => {
        // 3. Resolve os ativos B3 homologados (APPROVED) para a companhia
        const activeAssets = await cvmBindingService.resolveActiveAssetsForCompany(cnpj, tx);

        if (activeAssets.length === 0) {
          result.skippedUnboundCompanies++;
          return;
        }

        // 4. Publica o balanço para cada ativo B3 associado
        for (const targetAsset of activeAssets) {
          const publishedRecord = await this.publishForSingleAsset(
            tx,
            targetAsset,
            cnpj,
            cvmCode,
            convertedStmt,
            context?.runId || actorId || 'system',
            actorType
          );

          if (publishedRecord) {
            result.totalRecordsPublished++;
            if (publishedRecord.action === 'INSERTED') {
              result.recordsInserted++;
            } else if (publishedRecord.action === 'UPDATED') {
              result.recordsUpdated++;
            }
            result.records.push(publishedRecord);
          }
        }
      };

      if ('transaction' in executor && typeof executor.transaction === 'function') {
        await (executor as any).transaction(executeInTransaction);
      } else {
        await executeInTransaction(executor);
      }
    }

    return result;
  }

  /**
   * Persiste atomicamente um demonstrativo para um ativo específico com ON CONFLICT e auditoria.
   */
  private async publishForSingleAsset(
    tx: any,
    targetAsset: { assetId: string; ticker: string },
    cnpj: string,
    cvmCode: string,
    converted: ConvertedFundamentals,
    actorId: string,
    actorType: 'system' | 'user'
  ): Promise<PublishedFundamentalRecord | null> {
    // Advisory lock transacional por chave natural para serializar execuções concorrentes
    const lockKey = `cvm_fund:${targetAsset.assetId}:${converted.referencePeriod}:${converted.periodType}:${converted.statementType}:${converted.source}:${converted.version}`;
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`);

    const existing = await tx
      .select()
      .from(assetFundamentals)
      .where(
        and(
          eq(assetFundamentals.assetId, targetAsset.assetId),
          eq(assetFundamentals.referencePeriod, converted.referencePeriod),
          eq(assetFundamentals.periodType, converted.periodType),
          eq(assetFundamentals.statementType, converted.statementType),
          eq(assetFundamentals.source, converted.source),
          eq(assetFundamentals.version, converted.version)
        )
      );

    const isExisting = existing.length > 0;
    const existingRecord = isExisting ? existing[0] : null;

    const recordId = existingRecord ? existingRecord.id : crypto.randomUUID();
    const now = new Date();

    const valuesToPersist = {
      id: recordId,
      assetId: targetAsset.assetId,
      referencePeriod: converted.referencePeriod,
      periodType: converted.periodType,
      statementType: converted.statementType,
      referenceDate: converted.referenceDate,
      filingDate: converted.filingDate,
      source: converted.source,
      sourceReference: converted.sourceReference,
      version: converted.version,
      isRestated: converted.isRestated,
      currency: converted.currency,
      netRevenue: converted.netRevenue ? converted.netRevenue.toFixed(4) : null,
      ebitda: converted.ebitda ? converted.ebitda.toFixed(4) : null,
      netIncome: converted.netIncome ? converted.netIncome.toFixed(4) : null,
      totalEquity: converted.totalEquity ? converted.totalEquity.toFixed(4) : null,
      totalAssets: converted.totalAssets ? converted.totalAssets.toFixed(4) : null,
      grossDebt: converted.grossDebt ? converted.grossDebt.toFixed(4) : null,
      cashEquivalents: converted.cashEquivalents ? converted.cashEquivalents.toFixed(4) : null,
      sharesCount: converted.sharesCount ? converted.sharesCount.toFixed(10) : null,
      dividendsDeclared: converted.dividendsDeclared ? converted.dividendsDeclared.toFixed(4) : null,
      notes: converted.notes,
      updatedAt: now,
    };

    let actionTaken: 'INSERTED' | 'UPDATED' | 'NO_OP' = 'INSERTED';

    if (isExisting) {
      // Verifica se houve alteração real nos valores
      const isIdentical =
        existingRecord.netRevenue === valuesToPersist.netRevenue &&
        existingRecord.netIncome === valuesToPersist.netIncome &&
        existingRecord.totalEquity === valuesToPersist.totalEquity &&
        existingRecord.totalAssets === valuesToPersist.totalAssets &&
        existingRecord.grossDebt === valuesToPersist.grossDebt &&
        existingRecord.cashEquivalents === valuesToPersist.cashEquivalents &&
        existingRecord.sourceReference === valuesToPersist.sourceReference;

      if (isIdentical) {
        // Idempotência exata: não emite log duplicado
        return {
          id: existingRecord.id,
          assetId: targetAsset.assetId,
          ticker: targetAsset.ticker,
          referencePeriod: converted.referencePeriod,
          periodType: converted.periodType,
          statementType: converted.statementType,
          version: converted.version,
          isRestated: converted.isRestated,
          action: 'NO_OP',
          sourceReference: converted.sourceReference,
        };
      }

      actionTaken = 'UPDATED';

      // Atualização controlada com ON CONFLICT / UPDATE
      await tx
        .update(assetFundamentals)
        .set(valuesToPersist)
        .where(eq(assetFundamentals.id, existingRecord.id));
    } else {
      // Inserção usando ON CONFLICT para robustez contra concorrência paralela
      await tx
        .insert(assetFundamentals)
        .values({
          ...valuesToPersist,
          createdAt: now,
        })
        .onConflictDoUpdate({
          target: [
            assetFundamentals.assetId,
            assetFundamentals.referencePeriod,
            assetFundamentals.periodType,
            assetFundamentals.statementType,
            assetFundamentals.source,
            assetFundamentals.version,
          ],
          set: {
            netRevenue: sql`excluded.net_revenue`,
            netIncome: sql`excluded.net_income`,
            totalEquity: sql`excluded.total_equity`,
            totalAssets: sql`excluded.total_assets`,
            grossDebt: sql`excluded.gross_debt`,
            cashEquivalents: sql`excluded.cash_equivalents`,
            sourceReference: sql`excluded.source_reference`,
            isRestated: sql`excluded.is_restated`,
            updatedAt: sql`excluded.updated_at`,
          },
        });
    }

    // 5. Auditoria transacional
    const auditAction: CvmFundamentalsAuditAction =
      converted.version > 1 ? 'CVM_FUNDAMENTALS_RESTATED' : 'CVM_FUNDAMENTALS_PUBLISHED';

    const reason =
      converted.version > 1
        ? `Retificação DFP ${converted.referencePeriod} (v${converted.version}) para ${targetAsset.ticker} (CNPJ: ${cnpj})`
        : `Publicação DFP ${converted.referencePeriod} (v${converted.version}) para ${targetAsset.ticker} (CNPJ: ${cnpj})`;

    await tx.insert(auditLogs).values({
      id: crypto.randomUUID(),
      tableName: 'asset_fundamentals',
      recordId,
      action: auditAction,
      actorId,
      actorType,
      correlationId: null,
      oldValue: existingRecord ? JSON.stringify(existingRecord) : null,
      newValue: JSON.stringify(valuesToPersist),
      reason,
      source: 'cvm_dfp',
      createdAt: now,
    });

    return {
      id: recordId,
      assetId: targetAsset.assetId,
      ticker: targetAsset.ticker,
      referencePeriod: converted.referencePeriod,
      periodType: converted.periodType,
      statementType: converted.statementType,
      version: converted.version,
      isRestated: converted.isRestated,
      action: actionTaken,
      sourceReference: converted.sourceReference,
    };
  }
}

export const cvmFundamentalsPublisherService = new CvmFundamentalsPublisherService();
