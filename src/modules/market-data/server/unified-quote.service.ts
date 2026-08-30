import { eq, and, desc, asc, lte, gte, inArray, isNull, sql } from 'drizzle-orm';
import { db, type DbExecutor } from '@/lib/db';
import { b3HistoricalQuotes } from '@/lib/db/schema/b3-market-data';
import { marketQuotes } from '@/lib/db/schema/market-data';
import { assets } from '@/lib/db/schema/portfolio';
import { Decimal } from '@/lib/decimal';
import type { SafeUser } from '@/modules/identity/domain/user.types';
import type { MarketQuote, DelayStatus } from '../domain/market-data.types';
import type {
  UnifiedQuote,
  UnifiedQuoteSource,
  UnifiedHistoricalQuote,
  UnifiedPeriodVariation,
} from '../domain/unified-quote.types';

export const B3_TIMEZONE = 'America/Sao_Paulo';

/**
 * Converte com segurança uma string civil YYYY-MM-DD em um Date sem distorção por fuso horário.
 * Utiliza o meio-dia UTC (12:00:00Z) para manter o dia civil idêntico em qualquer fuso horário brasileiro (UTC-2 a UTC-4).
 */
export function parseCivilDateToB3Date(dateStr: string): Date {
  const clean = dateStr.slice(0, 10);
  const [yearStr, monthStr, dayStr] = clean.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
}

/**
 * Retorna a data civil no formato YYYY-MM-DD no fuso horário da B3 (America/Sao_Paulo).
 */
export function getB3CivilDate(date: Date | string): string {
  if (typeof date === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return date;
    }
    const d = new Date(date);
    if (!Number.isNaN(d.getTime())) {
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: B3_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
      return formatter.format(d);
    }
  }
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: B3_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date as Date);
}

/**
 * Retorna o dia da semana no fuso da B3 (0 = Domingo, 1 = Segunda, ..., 6 = Sábado).
 */
export function getB3DayOfWeek(date: Date | string): number {
  const civilDateStr = getB3CivilDate(date);
  const [y, m, d] = civilDateStr.split('-').map(Number);
  const utcDate = new Date(Date.UTC(y, m - 1, d, 12, 0, 0, 0));
  return utcDate.getUTCDay();
}

/**
 * Verifica se uma data corresponde a um dia útil de pregão na B3 (Segunda a Sexta).
 */
export function isB3TradingDay(date: Date | string): boolean {
  const dayOfWeek = getB3DayOfWeek(date);
  return dayOfWeek !== 0 && dayOfWeek !== 6;
}

/**
 * Retorna a data do pregão B3 no formato YYYY-MM-DD (America/Sao_Paulo).
 * Em fins de semana (sábado/domingo), recua deterministicamente para a última sexta-feira (último pregão útil anterior).
 */
export function getB3TradingDay(date: Date | string): string {
  const civilDateStr = getB3CivilDate(date);
  const [y, m, d] = civilDateStr.split('-').map(Number);
  const cursor = new Date(Date.UTC(y, m - 1, d, 12, 0, 0, 0));
  const dayOfWeek = cursor.getUTCDay(); // 0 = Domingo, 6 = Sábado

  if (dayOfWeek === 6) {
    // Sábado -> recua 1 dia para a Sexta-feira
    cursor.setUTCDate(cursor.getUTCDate() - 1);
  } else if (dayOfWeek === 0) {
    // Domingo -> recua 2 dias para a Sexta-feira
    cursor.setUTCDate(cursor.getUTCDate() - 2);
  }

  const resYear = cursor.getUTCFullYear();
  const resMonth = String(cursor.getUTCMonth() + 1).padStart(2, '0');
  const resDay = String(cursor.getUTCDate()).padStart(2, '0');
  return `${resYear}-${resMonth}-${resDay}`;
}

/**
 * Calcula deterministicamente a quantidade de dias úteis entre duas datas civis.
 * Opera diretamente sobre as strings YYYY-MM-DD no calendário de dias úteis, sem sofrer distorções por fuso horário.
 */
export function countBusinessDays(pastDate: Date | string, currentDate: Date | string = new Date()): number {
  const pastCivilStr = getB3CivilDate(pastDate);
  const currentCivilStr = getB3CivilDate(currentDate);

  if (pastCivilStr >= currentCivilStr) {
    return 0;
  }

  let businessDays = 0;
  const [y, m, d] = pastCivilStr.split('-').map(Number);
  const cursor = new Date(Date.UTC(y, m - 1, d, 12, 0, 0, 0));

  while (getB3CivilDate(cursor) < currentCivilStr) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const dayOfWeek = cursor.getUTCDay(); // 0: Dom, 6: Sáb
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      businessDays += 1;
    }
  }

  return businessDays;
}

function mapDelayStatus(status?: string | null): 'real_time' | 'delayed' | 'end_of_day' {
  if (status === 'realtime') return 'real_time';
  if (status === 'eod') return 'end_of_day';
  return 'delayed';
}

function mapQuoteSource(source?: string | null): UnifiedQuoteSource {
  if (source === 'cotahist_b3' || source === 'brapi' || source === 'manual') {
    return source;
  }
  return 'market_quotes';
}

/**
 * Consulta a cotação mais recente e utilizável para um ticker específico.
 * Prioridade:
 * 1. Cotação intraday/tempo real recente em `market_quotes` (se existir e pertencer estritamente ao pregão atual no fuso da B3);
 * 2. Fechamento oficial em `b3_historical_quotes` (COTAHIST B3 EOD);
 * 3. Cotação anterior registrada em `market_quotes` (fallback secundário);
 * 4. Retorna null se nenhuma cotação estiver disponível (sem inventar valores).
 */
export async function getLatestUsableQuote(
  ticker: string,
  executor: DbExecutor = db,
  referenceDate: Date = new Date()
): Promise<UnifiedQuote | null> {
  const normalizedTicker = ticker.trim().toUpperCase();
  if (!normalizedTicker) return null;

  const currentTradingDayStr = getB3TradingDay(referenceDate);

  // 1. Prioridade 1: Cotação intraday/recente em market_quotes do pregão atual para ativo exclusivamente público
  const [assetRow] = await executor
    .select({ id: assets.id })
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

  let fallbackOlderMq: {
    tradeDate: Date;
    closePrice: Decimal;
    dataAgeDays: number;
    currency: string;
    source: UnifiedQuoteSource;
    delayStatus: 'real_time' | 'delayed' | 'end_of_day';
    notes?: string | null;
    prevClose: Decimal | null;
    varPercent: Decimal | null;
  } | null = null;

  if (assetRow) {
    const mqRows = await executor
      .select()
      .from(marketQuotes)
      .where(eq(marketQuotes.assetId, assetRow.id))
      .orderBy(desc(marketQuotes.quoteDate))
      .limit(2);

    if (mqRows.length > 0) {
      const mq = mqRows[0];
      const tradeDate = new Date(mq.quoteDate);
      const closePrice = new Decimal(mq.price);
      const dataAgeDays = countBusinessDays(tradeDate, referenceDate);
      const isQuoteOnTradingDay = isB3TradingDay(tradeDate);
      const quoteTradingDayStr = getB3TradingDay(tradeDate);

      let prevClose: Decimal | null = null;
      let varPercent: Decimal | null = null;

      if (mqRows.length > 1) {
        prevClose = new Decimal(mqRows[1].price);
        if (prevClose.gt(0)) {
          varPercent = closePrice.minus(prevClose).dividedBy(prevClose).times(100);
        }
      }

      // Aceita market_quotes como cotação atual SOMENTE se:
      // 1. A cotação tiver ocorrido em um dia útil de pregão (não sábado/domingo);
      // 2. O pregão da cotação corresponder exatamente ao pregão atual da B3.
      if (isQuoteOnTradingDay && quoteTradingDayStr === currentTradingDayStr) {
        return {
          ticker: normalizedTicker,
          tradeDate,
          closePrice,
          openPrice: null,
          highPrice: null,
          lowPrice: null,
          quantity: null,
          financialVolume: null,
          tradeCount: null,
          currency: mq.currency,
          source: mapQuoteSource(mq.source),
          isOfficialClosing: false,
          dataAgeDays,
          isOutdated: false,
          delayStatus: mapDelayStatus(mq.delayStatus),
          notes: mq.notes,
          previousClosePrice: prevClose,
          dailyVariationPercent: varPercent,
        };
      }

      // Cotação de pregão anterior em market_quotes preserva seu status com isOutdated: true
      fallbackOlderMq = {
        tradeDate,
        closePrice,
        dataAgeDays,
        currency: mq.currency,
        source: mapQuoteSource(mq.source),
        delayStatus: mapDelayStatus(mq.delayStatus),
        notes: mq.notes,
        prevClose,
        varPercent,
      };
    }
  }

  // 2. Prioridade 2: Fechamento oficial COTAHIST B3 em b3_historical_quotes
  const b3Rows = await executor
    .select()
    .from(b3HistoricalQuotes)
    .where(eq(b3HistoricalQuotes.ticker, normalizedTicker))
    .orderBy(desc(b3HistoricalQuotes.tradeDate))
    .limit(2);

  if (b3Rows.length > 0) {
    const latestRow = b3Rows[0];
    const tradeDate = parseCivilDateToB3Date(latestRow.tradeDate);
    const closePrice = new Decimal(latestRow.closePrice);
    const dataAgeDays = countBusinessDays(latestRow.tradeDate, referenceDate);
    const isOutdated = dataAgeDays > 0;

    let previousClosePrice: Decimal | null = null;
    let dailyVariationPercent: Decimal | null = null;

    if (b3Rows.length > 1) {
      const prevRow = b3Rows[1];
      previousClosePrice = new Decimal(prevRow.closePrice);
      const tradingGapDays = countBusinessDays(prevRow.tradeDate, latestRow.tradeDate);

      // A variação percentual só é válida para pregões consecutivos/próximos (gap <= 10 dias úteis)
      if (tradingGapDays <= 10 && previousClosePrice.gt(0)) {
        dailyVariationPercent = closePrice
          .minus(previousClosePrice)
          .dividedBy(previousClosePrice)
          .times(100);
      }
    }

    return {
      ticker: normalizedTicker,
      tradeDate,
      closePrice,
      openPrice: latestRow.openPrice ? new Decimal(latestRow.openPrice) : null,
      highPrice: latestRow.highPrice ? new Decimal(latestRow.highPrice) : null,
      lowPrice: latestRow.lowPrice ? new Decimal(latestRow.lowPrice) : null,
      quantity: latestRow.quantity ? new Decimal(latestRow.quantity) : null,
      financialVolume: latestRow.financialVolume ? new Decimal(latestRow.financialVolume) : null,
      tradeCount: latestRow.tradeCount ?? null,
      currency: 'BRL',
      source: 'cotahist_b3',
      isOfficialClosing: true,
      dataAgeDays,
      isOutdated,
      delayStatus: 'end_of_day',
      notes: isOutdated ? 'Usando último fechamento oficial disponível' : 'Fechamento oficial B3',
      previousClosePrice,
      dailyVariationPercent,
    };
  }

  // 3. Fallback secundário: cotação mais antiga de market_quotes
  if (fallbackOlderMq) {
    return {
      ticker: normalizedTicker,
      tradeDate: fallbackOlderMq.tradeDate,
      closePrice: fallbackOlderMq.closePrice,
      openPrice: null,
      highPrice: null,
      lowPrice: null,
      quantity: null,
      financialVolume: null,
      tradeCount: null,
      currency: fallbackOlderMq.currency,
      source: fallbackOlderMq.source,
      isOfficialClosing: false,
      dataAgeDays: fallbackOlderMq.dataAgeDays,
      isOutdated: true,
      delayStatus: fallbackOlderMq.delayStatus,
      notes: fallbackOlderMq.notes,
      previousClosePrice: fallbackOlderMq.prevClose,
      dailyVariationPercent: fallbackOlderMq.varPercent,
    };
  }

  // 4. Sem cotações disponíveis
  return null;
}

export const getUnifiedLatestQuote = getLatestUsableQuote;

function normalizeToDateString(date: Date | string): string {
  return getB3CivilDate(date);
}

/**
 * Consulta a cotação oficial de fechamento na base COTAHIST B3 (b3_historical_quotes)
 * na data informada (ou o último fechamento oficial registrado até ela).
 * Suporta formatos Date ou string (ISO ou YYYY-MM-DD) com normalização segura.
 * Retorna null se não houver registros até a data especificada.
 */
export async function getQuoteAtDate(
  ticker: string,
  date: Date | string,
  executor: DbExecutor = db
): Promise<UnifiedQuote | null> {
  const normalizedTicker = ticker.trim().toUpperCase();
  if (!normalizedTicker) return null;

  const targetDateStr = normalizeToDateString(date);

  const rows = await executor
    .select()
    .from(b3HistoricalQuotes)
    .where(
      and(
        eq(b3HistoricalQuotes.ticker, normalizedTicker),
        lte(b3HistoricalQuotes.tradeDate, targetDateStr)
      )
    )
    .orderBy(desc(b3HistoricalQuotes.tradeDate))
    .limit(2);

  if (rows.length === 0) {
    return null;
  }

  const current = rows[0];
  const tradeDate = parseCivilDateToB3Date(current.tradeDate);
  const closePrice = new Decimal(current.closePrice);
  const dataAgeDays = countBusinessDays(current.tradeDate, targetDateStr);

  let previousClosePrice: Decimal | null = null;
  let dailyVariationPercent: Decimal | null = null;

  if (rows.length > 1) {
    const prev = rows[1];
    previousClosePrice = new Decimal(prev.closePrice);
    if (previousClosePrice.gt(0)) {
      dailyVariationPercent = closePrice
        .minus(previousClosePrice)
        .dividedBy(previousClosePrice)
        .times(100);
    }
  }

  return {
    ticker: normalizedTicker,
    tradeDate,
    closePrice,
    openPrice: current.openPrice ? new Decimal(current.openPrice) : null,
    highPrice: current.highPrice ? new Decimal(current.highPrice) : null,
    lowPrice: current.lowPrice ? new Decimal(current.lowPrice) : null,
    quantity: current.quantity ? new Decimal(current.quantity) : null,
    financialVolume: current.financialVolume ? new Decimal(current.financialVolume) : null,
    tradeCount: current.tradeCount ?? null,
    currency: 'BRL',
    source: 'cotahist_b3',
    isOfficialClosing: true,
    dataAgeDays,
    isOutdated: dataAgeDays > 0,
    delayStatus: 'end_of_day',
    notes: 'Fechamento oficial B3',
    previousClosePrice,
    dailyVariationPercent,
  };
}

export const getCotahistClosingQuote = getQuoteAtDate;

/**
 * Consulta a série histórica de cotações para um ticker em ordem cronológica ascendente (ASC).
 */
export async function getHistoricalQuotes(
  ticker: string,
  from?: Date | string,
  to?: Date | string,
  executor: DbExecutor = db
): Promise<UnifiedHistoricalQuote[]> {
  const normalizedTicker = ticker.trim().toUpperCase();
  if (!normalizedTicker) return [];

  const conditions = [eq(b3HistoricalQuotes.ticker, normalizedTicker)];
  if (from) {
    conditions.push(gte(b3HistoricalQuotes.tradeDate, normalizeToDateString(from)));
  }
  if (to) {
    conditions.push(lte(b3HistoricalQuotes.tradeDate, normalizeToDateString(to)));
  }

  const rows = await executor
    .select()
    .from(b3HistoricalQuotes)
    .where(and(...conditions))
    .orderBy(asc(b3HistoricalQuotes.tradeDate));

  return rows.map((r) => ({
    ticker: normalizedTicker,
    tradeDate: parseCivilDateToB3Date(r.tradeDate),
    openPrice: new Decimal(r.openPrice),
    highPrice: new Decimal(r.highPrice),
    lowPrice: new Decimal(r.lowPrice),
    closePrice: new Decimal(r.closePrice),
    quantity: new Decimal(r.quantity),
    financialVolume: new Decimal(r.financialVolume),
    tradeCount: r.tradeCount ?? 0,
    bdiCode: r.bdiCode ?? undefined,
    source: 'cotahist_b3',
  }));
}

export const getUnifiedHistoricalSeries = getHistoricalQuotes;

/**
 * Calcula variações de preço, extremos e volume de um ticker dentro de um período.
 * Garante estritamente que apenas dados do mesmo ticker são comparados.
 */
export async function calculateTickerPeriodVariation(
  ticker: string,
  from?: Date,
  to?: Date,
  executor: DbExecutor = db
): Promise<UnifiedPeriodVariation | null> {
  const quotes = await getHistoricalQuotes(ticker, from, to, executor);
  if (quotes.length === 0) {
    return null;
  }

  const initialPrice = quotes[0].closePrice;
  const finalPrice = quotes[quotes.length - 1].closePrice;

  let periodHigh = quotes[0].highPrice;
  let periodLow = quotes[0].lowPrice;
  let totalVolume = new Decimal(0);
  let totalQuantity = new Decimal(0);
  let totalTrades = 0;

  for (const q of quotes) {
    if (q.highPrice.gt(periodHigh)) periodHigh = q.highPrice;
    if (q.lowPrice.lt(periodLow)) periodLow = q.lowPrice;
    totalVolume = totalVolume.plus(q.financialVolume);
    totalQuantity = totalQuantity.plus(q.quantity);
    totalTrades += q.tradeCount;
  }

  let periodVariationPercent = new Decimal(0);
  if (initialPrice.gt(0)) {
    periodVariationPercent = finalPrice
      .minus(initialPrice)
      .dividedBy(initialPrice)
      .times(100);
  }

  return {
    ticker: ticker.trim().toUpperCase(),
    startDate: quotes[0].tradeDate,
    endDate: quotes[quotes.length - 1].tradeDate,
    initialPrice,
    finalPrice,
    periodVariationPercent,
    periodHigh,
    periodLow,
    totalVolume,
    totalQuantity,
    totalTrades,
    quoteCount: quotes.length,
  };
}

/**
 * Retorna as cotações de valuation para uma lista de ativos pertencentes à carteira do usuário.
 * Para cada ativo, caso não exista cotação em `market_quotes`, consulta `b3_historical_quotes` pelo ticker.
 */
export async function getPortfolioValuationQuotes(
  assetIds: string[],
  user: SafeUser,
  asOfDate?: Date,
  executor: DbExecutor = db
): Promise<Map<string, MarketQuote>> {
  const result = new Map<string, MarketQuote>();
  if (assetIds.length === 0) return result;

  // 1. Busca metadados dos ativos autorizados
  const assetRows = await executor
    .select()
    .from(assets)
    .where(inArray(assets.id, assetIds));

  const authorizedAssets = assetRows.filter(
    (a) => !a.isCustom || a.userId === user.id
  );

  if (authorizedAssets.length === 0) return result;

  const authIds = authorizedAssets.map((a) => a.id);

  // 2. Busca cotações existentes em market_quotes
  const mqRows = await executor
    .selectDistinctOn([marketQuotes.assetId])
    .from(marketQuotes)
    .where(
      asOfDate
        ? and(inArray(marketQuotes.assetId, authIds), lte(marketQuotes.quoteDate, asOfDate))
        : inArray(marketQuotes.assetId, authIds)
    )
    .orderBy(marketQuotes.assetId, desc(marketQuotes.quoteDate), desc(marketQuotes.createdAt));

  for (const row of mqRows) {
    result.set(row.assetId, {
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
    });
  }

  // 3. Para ativos que não possuem cotação em market_quotes, busca em b3_historical_quotes pelo ticker
  const missingAssets = authorizedAssets.filter((a) => !result.has(a.id));

  for (const asset of missingAssets) {
    const b3Conditions = [eq(b3HistoricalQuotes.ticker, asset.ticker)];
    if (asOfDate) {
      b3Conditions.push(lte(b3HistoricalQuotes.tradeDate, normalizeToDateString(asOfDate)));
    }

    const [b3Row] = await executor
      .select()
      .from(b3HistoricalQuotes)
      .where(and(...b3Conditions))
      .orderBy(desc(b3HistoricalQuotes.tradeDate))
      .limit(1);

    if (b3Row) {
      const qDate = new Date(b3Row.tradeDate);
      result.set(asset.id, {
        id: `cotahist-${b3Row.id}`,
        assetId: asset.id,
        price: new Decimal(b3Row.closePrice),
        currency: 'BRL',
        quoteDate: qDate,
        source: 'cotahist_b3',
        delayStatus: 'eod',
        notes: `Fechamento oficial B3 COTAHIST (${getB3TradingDay(qDate)})`,
        createdBy: 'system',
        createdAt: qDate,
        updatedAt: qDate,
      });
    }
  }

  return result;
}
