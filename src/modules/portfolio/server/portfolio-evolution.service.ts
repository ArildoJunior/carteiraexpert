import { eq, and, isNull, inArray, lte } from 'drizzle-orm';
import { db, type DbExecutor } from '@/lib/db';
import { portfolioEvents, assets } from '@/lib/db/schema/portfolio';
import { marketQuotes, exchangeRates } from '@/lib/db/schema/market-data';
import type { SafeUser } from '@/modules/identity/domain/user.types';
import type { Asset } from '../domain/asset.types';
import type { MarketQuote, ExchangeRate, DelayStatus } from '@/modules/market-data';
import { Decimal } from '@/lib/decimal';
import { getPortfolioById } from './portfolio.service';
import {
  calculatePortfolioEvolutionTimeline,
  serializePortfolioEvolutionSummary,
  getUtcCalendarDaysDiff,
} from '../domain/portfolio-evolution-engine';
import { evolutionPeriodSchema } from '../domain/portfolio-evolution.schema';
import {
  FutureDateNotAllowedError,
  InvalidEvolutionPeriodError,
} from '../domain/errors';
import type {
  EvolutionPeriod,
  PortfolioEvolutionSummary,
  SerializedPortfolioEvolutionSummary,
} from '../domain/portfolio-evolution.types';

export interface GetPortfolioEvolutionOptions {
  period?: EvolutionPeriod | string;
  referenceDate?: Date;
}

/**
 * Mapeia uma linha do PostgreSQL para a entidade MarketQuote.
 */
function mapQuoteRow(row: typeof marketQuotes.$inferSelect): MarketQuote {
  return {
    id: row.id,
    assetId: row.assetId,
    price: new Decimal(row.price),
    currency: row.currency,
    quoteDate: new Date(row.quoteDate),
    source: row.source,
    delayStatus: row.delayStatus as DelayStatus,
    notes: row.notes,
    createdBy: row.createdBy,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

/**
 * Mapeia uma linha do PostgreSQL para a entidade ExchangeRate.
 */
function mapExchangeRateRow(
  row: typeof exchangeRates.$inferSelect
): ExchangeRate {
  return {
    id: row.id,
    fromCurrency: row.fromCurrency,
    toCurrency: row.toCurrency,
    rate: new Decimal(row.rate),
    rateDate: new Date(row.rateDate),
    source: row.source,
    delayStatus: row.delayStatus as DelayStatus,
    createdBy: row.createdBy,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

/**
 * Recupera o histórico patrimonial e a evolução temporal de uma carteira.
 * Executa todas as consultas necessárias em lote antes do replay temporal em memória,
 * garantindo zero consultas dentro do loop diário.
 */
export async function getPortfolioEvolutionData(
  portfolioId: string,
  user: SafeUser,
  options: GetPortfolioEvolutionOptions = {},
  executor: DbExecutor = db
): Promise<PortfolioEvolutionSummary> {
  // 0. Validação defensiva de referenceDate e period
  const today = new Date();
  const refDate = options.referenceDate ? new Date(options.referenceDate) : today;
  if (isNaN(refDate.getTime())) {
    throw new Error('Data de referência inválida.');
  }
  if (getUtcCalendarDaysDiff(refDate, today) > 0) {
    throw new FutureDateNotAllowedError(
      'A data de referência não pode estar no futuro.'
    );
  }

  if (options.period !== undefined) {
    const periodValidation = evolutionPeriodSchema.safeParse(options.period);
    if (!periodValidation.success) {
      throw new InvalidEvolutionPeriodError();
    }
  }

  // 1. Valida propriedade da carteira (garante isolamento multi-tenant)
  const portfolio = await getPortfolioById(portfolioId, user, executor);

  const endOfDay = new Date(refDate);
  endOfDay.setUTCHours(23, 59, 59, 999);

  // 2. Busca todos os eventos ativos da carteira até a data de corte
  const rawEvents = await executor
    .select()
    .from(portfolioEvents)
    .where(
      and(
        eq(portfolioEvents.portfolioId, portfolioId),
        isNull(portfolioEvents.deletedAt),
        lte(portfolioEvents.tradeDate, endOfDay)
      )
    );

  if (rawEvents.length === 0) {
    return calculatePortfolioEvolutionTimeline({
      portfolioId,
      baseCurrency: portfolio.baseCurrency,
      period: options.period,
      referenceDate: refDate,
      events: [],
    });
  }

  // 3. Busca metadados de todos os ativos referenciados
  const distinctAssetIds = Array.from(new Set(rawEvents.map((e) => e.assetId)));
  const assetRows = await executor
    .select()
    .from(assets)
    .where(inArray(assets.id, distinctAssetIds));

  const assetsMap = new Map<string, Asset>();
  const distinctCurrencies = new Set<string>();

  for (const a of assetRows) {
    assetsMap.set(a.id, {
      id: a.id,
      ticker: a.ticker,
      name: a.name,
      assetType: a.assetType as Asset['assetType'],
      market: a.market as Asset['market'],
      currency: a.currency,
      isCustom: a.isCustom,
      userId: a.userId,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    });
    if (a.currency) {
      distinctCurrencies.add(a.currency.toUpperCase());
    }
  }

  // 4. Busca em lote todas as cotações dos ativos até endOfDay
  const quoteRows = await executor
    .select()
    .from(marketQuotes)
    .where(
      and(
        inArray(marketQuotes.assetId, distinctAssetIds),
        lte(marketQuotes.quoteDate, endOfDay)
      )
    );

  const quotes = quoteRows.map(mapQuoteRow);

  // 5. Busca em lote todas as taxas de câmbio necessárias até endOfDay
  const currenciesList = Array.from(distinctCurrencies).filter(
    (c) => c !== portfolio.baseCurrency.toUpperCase()
  );

  let exchangeRateList: ExchangeRate[] = [];
  if (currenciesList.length > 0) {
    const rateRows = await executor
      .select()
      .from(exchangeRates)
      .where(
        and(
          inArray(exchangeRates.fromCurrency, currenciesList),
          eq(exchangeRates.toCurrency, portfolio.baseCurrency.toUpperCase()),
          lte(exchangeRates.rateDate, endOfDay)
        )
      );

    exchangeRateList = rateRows.map(mapExchangeRateRow);
  }

  // 6. Executa o replay temporal em memória no motor puro
  return calculatePortfolioEvolutionTimeline({
    portfolioId,
    baseCurrency: portfolio.baseCurrency,
    period: options.period,
    referenceDate: refDate,
    events: rawEvents,
    assetsMap,
    quotes,
    exchangeRates: exchangeRateList,
  });
}

/**
 * Retorna a evolução patrimonial serializada pronta para consumo em Server Components e UI.
 */
export async function getSerializedPortfolioEvolutionData(
  portfolioId: string,
  user: SafeUser,
  options: GetPortfolioEvolutionOptions = {},
  executor: DbExecutor = db
): Promise<SerializedPortfolioEvolutionSummary> {
  const summary = await getPortfolioEvolutionData(
    portfolioId,
    user,
    options,
    executor
  );
  return serializePortfolioEvolutionSummary(summary);
}
