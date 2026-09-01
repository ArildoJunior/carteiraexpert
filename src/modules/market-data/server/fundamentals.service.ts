import crypto from 'node:crypto';
import { db, type DbExecutor } from '@/lib/db';
import { assets } from '@/lib/db/schema/portfolio';
import { assetFundamentals } from '@/lib/db/schema/market-fundamentals';
import { cvmCompanies, cvmCompanyAssets } from '@/lib/db/schema/cvm-market-data';
import { eq, and, isNull, desc, asc, sql } from 'drizzle-orm';
import { Decimal } from '@/lib/decimal';
import {
  assetFundamentalInputSchema,
  type AssetFundamentalInput,
} from '../domain/fundamentals.schema';
import type {
  RawAssetFundamentalStatement,
  AssetFundamentalsViewData,
  CvmCompanyMetadata,
  StatementPeriodType,
  StatementType,
} from '../domain/fundamentals.types';
import {
  calculateFundamentalIndicators,
  type FundamentalQuoteContext,
} from '../domain/fundamentals-engine';
import { getLatestUsableQuote } from './unified-quote.service';

function mapStatementRow(row: typeof assetFundamentals.$inferSelect): RawAssetFundamentalStatement {
  return {
    id: row.id,
    assetId: row.assetId,
    referencePeriod: row.referencePeriod,
    periodType: row.periodType as StatementPeriodType,
    statementType: row.statementType as StatementType,
    referenceDate: row.referenceDate,
    filingDate: row.filingDate,
    source: row.source,
    sourceReference: row.sourceReference,
    version: row.version,
    isRestated: row.isRestated,
    currency: row.currency,
    netRevenue: row.netRevenue !== null ? new Decimal(row.netRevenue) : null,
    ebitda: row.ebitda !== null ? new Decimal(row.ebitda) : null,
    netIncome: row.netIncome !== null ? new Decimal(row.netIncome) : null,
    totalEquity: row.totalEquity !== null ? new Decimal(row.totalEquity) : null,
    totalAssets: row.totalAssets !== null ? new Decimal(row.totalAssets) : null,
    grossDebt: row.grossDebt !== null ? new Decimal(row.grossDebt) : null,
    cashEquivalents: row.cashEquivalents !== null ? new Decimal(row.cashEquivalents) : null,
    sharesCount: row.sharesCount !== null ? new Decimal(row.sharesCount) : null,
    dividendsDeclared: row.dividendsDeclared !== null ? new Decimal(row.dividendsDeclared) : null,
    notes: row.notes,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Salva ou atualiza uma demonstração fundamentalista de forma idempotente.
 */
export async function saveAssetFundamentals(
  input: AssetFundamentalInput,
  executor: DbExecutor = db
): Promise<RawAssetFundamentalStatement> {
  const validated = assetFundamentalInputSchema.parse(input);

  const [asset] = await executor
    .select({ id: assets.id, ticker: assets.ticker, isCustom: assets.isCustom, userId: assets.userId })
    .from(assets)
    .where(eq(assets.id, validated.assetId))
    .limit(1);

  if (!asset) {
    throw new Error(`Ativo não encontrado para o assetId ${validated.assetId}`);
  }

  const id = crypto.randomUUID();
  const now = new Date();

  const [inserted] = await executor
    .insert(assetFundamentals)
    .values({
      id,
      assetId: validated.assetId,
      referencePeriod: validated.referencePeriod,
      periodType: validated.periodType,
      statementType: validated.statementType,
      referenceDate: validated.referenceDate,
      filingDate: validated.filingDate ?? null,
      source: validated.source,
      sourceReference: validated.sourceReference ?? null,
      version: validated.version,
      isRestated: validated.isRestated,
      currency: validated.currency,
      netRevenue: validated.netRevenue ?? null,
      ebitda: validated.ebitda ?? null,
      netIncome: validated.netIncome ?? null,
      totalEquity: validated.totalEquity ?? null,
      totalAssets: validated.totalAssets ?? null,
      grossDebt: validated.grossDebt ?? null,
      cashEquivalents: validated.cashEquivalents ?? null,
      sharesCount: validated.sharesCount ?? null,
      dividendsDeclared: validated.dividendsDeclared ?? null,
      notes: validated.notes ?? null,
      createdAt: now,
      updatedAt: now,
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
        referenceDate: validated.referenceDate,
        filingDate: validated.filingDate ?? null,
        sourceReference: validated.sourceReference ?? null,
        isRestated: validated.isRestated,
        currency: validated.currency,
        netRevenue: validated.netRevenue ?? null,
        ebitda: validated.ebitda ?? null,
        netIncome: validated.netIncome ?? null,
        totalEquity: validated.totalEquity ?? null,
        totalAssets: validated.totalAssets ?? null,
        grossDebt: validated.grossDebt ?? null,
        cashEquivalents: validated.cashEquivalents ?? null,
        sharesCount: validated.sharesCount ?? null,
        dividendsDeclared: validated.dividendsDeclared ?? null,
        notes: validated.notes ?? null,
        updatedAt: now,
      },
    })
    .returning();

  return mapStatementRow(inserted);
}

/**
 * Seleciona o demonstrativo mais representativo para consulta de forma estritamente determinística:
 * 1. Data de referência mais recente (reference_date DESC)
 * 2. Demonstração CONSOLIDATED antes de INDIVIDUAL
 * 3. Versão mais recente (version DESC)
 * 4. Desempate estável (source ASC, id ASC)
 */
export async function getRepresentativeFundamentals(
  assetId: string,
  executor: DbExecutor = db
): Promise<RawAssetFundamentalStatement | null> {
  const rows = await executor
    .select()
    .from(assetFundamentals)
    .where(eq(assetFundamentals.assetId, assetId))
    .orderBy(
      desc(assetFundamentals.referenceDate),
      sql`CASE WHEN ${assetFundamentals.statementType} = 'CONSOLIDATED' THEN 1 ELSE 2 END ASC`,
      desc(assetFundamentals.version),
      asc(assetFundamentals.source),
      asc(assetFundamentals.id)
    )
    .limit(1);

  if (rows.length === 0) {
    return null;
  }

  return mapStatementRow(rows[0]);
}

/**
 * Retorna os dados fundamentais completos com indicadores calculados e auditoria de cotação para exibição pública.
 * Restringe a busca a ativos estritamente públicos (isCustom = false e userId IS NULL).
 */
export async function getPublicAssetFundamentalsWithIndicators(
  ticker: string,
  options?: {
    customQuote?: FundamentalQuoteContext | null;
  },
  executor: DbExecutor = db
): Promise<AssetFundamentalsViewData | null> {
  const normalizedTicker = ticker.trim().toUpperCase();

  const [asset] = await executor
    .select({
      id: assets.id,
      ticker: assets.ticker,
      currency: assets.currency,
    })
    .from(assets)
    .where(
      and(
        eq(assets.ticker, normalizedTicker),
        eq(assets.isCustom, false),
        isNull(assets.userId)
      )
    )
    .orderBy(asc(assets.ticker), asc(assets.id))
    .limit(1);

  if (!asset) {
    return null;
  }

  const statement = await getRepresentativeFundamentals(asset.id, executor);
  if (!statement) {
    return null;
  }

  let quoteContext: FundamentalQuoteContext | null = options?.customQuote ?? null;
  if (!quoteContext) {
    const usableQuote = await getLatestUsableQuote(normalizedTicker, executor);
    if (usableQuote) {
      quoteContext = {
        price: usableQuote.closePrice,
        quoteDate: usableQuote.tradeDate,
        source: usableQuote.source,
        delayStatus: usableQuote.delayStatus,
        isStale: usableQuote.dataAgeDays > 1 || usableQuote.isOutdated,
        currency: usableQuote.currency,
      };
    }
  }


  const indicators = calculateFundamentalIndicators(statement, quoteContext);

  let cvmCompany: CvmCompanyMetadata | null = null;
  try {
    const [companyRow] = await executor
      .select({
        cnpj: cvmCompanies.cnpj,
        cvmCode: cvmCompanies.cvmCode,
        legalName: cvmCompanies.legalName,
        tradeName: cvmCompanies.tradeName,
        industrySector: cvmCompanies.industrySector,
        marketType: cvmCompanies.marketType,
      })
      .from(cvmCompanyAssets)
      .innerJoin(cvmCompanies, eq(cvmCompanyAssets.companyId, cvmCompanies.id))
      .where(
        and(
          eq(cvmCompanyAssets.assetId, asset.id),
          eq(cvmCompanyAssets.status, 'APPROVED')
        )
      )
      .limit(1);

    if (companyRow) {
      cvmCompany = {
        cnpj: companyRow.cnpj,
        cvmCode: companyRow.cvmCode,
        legalName: companyRow.legalName,
        tradeName: companyRow.tradeName,
        industrySector: companyRow.industrySector,
        marketType: companyRow.marketType,
      };
    }
  } catch {
    cvmCompany = null;
  }

  return {
    statement: {
      referencePeriod: statement.referencePeriod,
      periodType: statement.periodType,
      statementType: statement.statementType,
      referenceDate: statement.referenceDate.toISOString().slice(0, 10),
      filingDate: statement.filingDate ? statement.filingDate.toISOString().slice(0, 10) : null,
      source: statement.source,
      sourceReference: statement.sourceReference,
      version: statement.version,
      isRestated: statement.isRestated,
      currency: statement.currency,
      netRevenue: statement.netRevenue !== null ? statement.netRevenue.toFixed(4) : null,
      ebitda: statement.ebitda !== null ? statement.ebitda.toFixed(4) : null,
      netIncome: statement.netIncome !== null ? statement.netIncome.toFixed(4) : null,
      totalEquity: statement.totalEquity !== null ? statement.totalEquity.toFixed(4) : null,
      totalAssets: statement.totalAssets !== null ? statement.totalAssets.toFixed(4) : null,
      grossDebt: statement.grossDebt !== null ? statement.grossDebt.toFixed(4) : null,
      cashEquivalents: statement.cashEquivalents !== null ? statement.cashEquivalents.toFixed(4) : null,
      sharesCount: statement.sharesCount !== null ? statement.sharesCount.toFixed(4) : null,
      dividendsDeclared: statement.dividendsDeclared !== null ? statement.dividendsDeclared.toFixed(4) : null,
      notes: statement.notes,
    },
    indicators,
    cvmCompany,
  };
}
