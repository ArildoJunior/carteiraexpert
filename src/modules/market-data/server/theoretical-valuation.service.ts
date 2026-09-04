import { db, type DbExecutor } from '@/lib/db';
import { assets } from '@/lib/db/schema/portfolio';
import { eq, and, isNull, asc } from 'drizzle-orm';
import { Decimal } from '@/lib/decimal';
import {
  calculateTheoreticalValuations,
  serializeTheoreticalValuationResultSet,
} from '../domain/theoretical-valuation-engine';
import type {
  ValuationFundamentalContext,
  ValuationQuoteContext,
  SerializedTheoreticalValuationResultSet,
} from '../domain/theoretical-valuation.types';
import {
  valuationSimulationOptionsSchema,
  type ValuationSimulationOptions,
} from '../domain/theoretical-valuation.schema';
import { getRepresentativeFundamentals } from './fundamentals.service';
import { getLatestUsableQuote } from './unified-quote.service';

/**
 * Consulta e calcula os modelos teóricos de valuation para um ativo do catálogo público.
 * Recupera demonstrativos contábeis oficiais de `asset_fundamentals` e cotação de mercado de `market_quotes`/`cotahist`.
 */
export async function getPublicAssetTheoreticalValuation(
  ticker: string,
  options?: ValuationSimulationOptions,
  executor: DbExecutor = db
): Promise<SerializedTheoreticalValuationResultSet | null> {
  const normalizedTicker = ticker.trim().toUpperCase();

  // 1. Localiza ativo público canônico
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

  // 2. Localiza demonstrativo mais representativo e recente
  const statement = await getRepresentativeFundamentals(asset.id, executor);
  if (!statement) {
    return null;
  }

  // 3. Localiza cotação de mercado mais recente utilizável
  let quoteContext: ValuationQuoteContext | null = null;
  const usableQuote = await getLatestUsableQuote(normalizedTicker, executor);
  if (usableQuote && usableQuote.closePrice && usableQuote.closePrice.greaterThan(0)) {
    quoteContext = {
      price: usableQuote.closePrice,
      quoteDate: usableQuote.tradeDate,
      source: usableQuote.source,
      delayStatus: usableQuote.delayStatus,
      isStale: usableQuote.dataAgeDays > 1 || usableQuote.isOutdated,
      currency: usableQuote.currency,
    };
  }

  // 4. Mapeia dados contábeis factuais para o contexto de valuation
  const fundamentalContext: ValuationFundamentalContext = {
    netRevenue: statement.netRevenue,
    ebitda: statement.ebitda,
    netIncome: statement.netIncome,
    totalEquity: statement.totalEquity,
    totalAssets: statement.totalAssets,
    grossDebt: statement.grossDebt,
    cashEquivalents: statement.cashEquivalents,
    sharesCount: statement.sharesCount,
    dividendsDeclared: statement.dividendsDeclared,
    currency: statement.currency,
    referencePeriod: statement.referencePeriod,
    referenceDate: statement.referenceDate,
    statementType: statement.statementType,
  };

  // 5. Normaliza premissas customizadas caso fornecidas
  let parsedOptions: ValuationSimulationOptions = {};
  if (options) {
    parsedOptions = valuationSimulationOptionsSchema.parse(options);
  }

  const customPremises = {
    bazin: parsedOptions.bazin?.targetDividendYield
      ? { targetDividendYield: new Decimal(parsedOptions.bazin.targetDividendYield) }
      : undefined,
    graham: parsedOptions.graham?.grahamMultiplier
      ? { grahamMultiplier: new Decimal(parsedOptions.graham.grahamMultiplier) }
      : undefined,
    dcf: parsedOptions.dcf
      ? {
          discountRate: new Decimal(parsedOptions.dcf.discountRate),
          growthRateStage1: new Decimal(parsedOptions.dcf.growthRateStage1),
          terminalGrowthRate: new Decimal(parsedOptions.dcf.terminalGrowthRate),
          projectionYears: parsedOptions.dcf.projectionYears,
        }
      : undefined,
  };

  // 6. Executa cálculo puro dos modelos teóricos
  const resultSet = calculateTheoreticalValuations(
    asset.id,
    asset.ticker,
    fundamentalContext,
    quoteContext,
    customPremises
  );

  // 7. Retorna representação serializada estrita para SSR e visualização
  return serializeTheoreticalValuationResultSet(resultSet);
}
