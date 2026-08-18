import { Decimal } from '@/lib/decimal';
import type {
  EvolutionPeriod,
  PortfolioEvolutionPoint,
  PortfolioEvolutionSummary,
  SerializedPortfolioEvolutionPoint,
  SerializedPortfolioEvolutionSummary,
} from './portfolio-evolution.types';
import type { Asset } from './asset.types';
import type { MarketQuote, ExchangeRate } from '@/modules/market-data';
import {
  sortEventsChronologically,
  type TimelineEvent,
} from './position-engine';
import {
  applySplit,
  applyGrouping,
  applyBonusShare,
} from '@/modules/corporate-actions/domain';
import { evolutionPeriodSchema } from './portfolio-evolution.schema';
import {
  FutureDateNotAllowedError,
  InvalidEvolutionPeriodError,
} from './errors';

export const MAX_QUOTE_AGE_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
export const MAX_ALL_PERIOD_DAYS = 3650; // Limite de segurança de 10 anos para o período ALL

export function formatEvolutionMoney(
  value: Decimal | string | null,
  currency = 'BRL'
): string {
  if (value === null || value === undefined) return '—';
  try {
    const dec = value instanceof Decimal ? value : new Decimal(value || '0');
    const [intPart, fracPart = '00'] = dec.toFixed(2).split('.');
    const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const cur = currency.toUpperCase().trim();
    const symbol =
      cur === 'USD' ? '$' : cur === 'EUR' ? '€' : cur === 'BRL' ? 'R$' : `${cur} `;
    return `${symbol} ${formattedInt},${fracPart}`;
  } catch {
    return 'R$ 0,00';
  }
}

export function formatEvolutionPercent(
  percent: Decimal | string | null
): string {
  if (percent === null || percent === undefined) return '—';
  try {
    const dec =
      percent instanceof Decimal ? percent : new Decimal(percent || '0');
    const sign = dec.greaterThan(0) ? '+' : '';
    return `${sign}${dec.toFixed(2).replace('.', ',')}%`;
  } catch {
    return '0,00%';
  }
}

/**
 * Calcula a diferença em dias civis UTC entre duas datas.
 * Normaliza ambas para o início do dia UTC (00:00:00.000Z), eliminando distorções de fuso e horário.
 */
export function getUtcCalendarDaysDiff(
  targetDate: Date,
  sourceDate: Date
): number {
  const t = new Date(targetDate);
  const s = new Date(sourceDate);
  const utc1 = Date.UTC(
    t.getUTCFullYear(),
    t.getUTCMonth(),
    t.getUTCDate()
  );
  const utc2 = Date.UTC(
    s.getUTCFullYear(),
    s.getUTCMonth(),
    s.getUTCDate()
  );
  return Math.floor((utc1 - utc2) / MS_PER_DAY);
}

export function toUtcDateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function toUtcDayEnd(d: Date): Date {
  const copy = new Date(d);
  copy.setUTCHours(23, 59, 59, 999);
  return copy;
}

export function toUtcDayStart(d: Date): Date {
  const copy = new Date(d);
  copy.setUTCHours(0, 0, 0, 0);
  return copy;
}

export interface CalculateEvolutionInput {
  portfolioId: string;
  baseCurrency?: string;
  period?: EvolutionPeriod | string;
  referenceDate?: Date; // Data final de referência (default: hoje)
  events: TimelineEvent[];
  assetsMap?: Map<string, Asset>;
  quotes?: MarketQuote[];
  exchangeRates?: ExchangeRate[];
  maxAllPeriodDays?: number; // Configuração opcional de limite para ALL
}

interface RunningAssetPosition {
  assetId: string;
  quantity: Decimal;
  totalCost: Decimal;
  currency: string;
}

/**
 * Calcula a evolução patrimonial diária reconstruindo o estado da carteira dia a dia.
 * 
 * Complexidade Temporal:
 * - Ordenação inicial: O(N log N + Q log Q + R log R)
 * - Replay temporal com ponteiros cronológicos únicos: O(D * A_active + N + Q + R)
 * Onde:
 * - D = número de dias no período selecionado;
 * - A_active = número médio de posições ativas em custódia no dia;
 * - N = número de eventos da carteira;
 * - Q = número de cotações carregadas;
 * - R = número de taxas cambiais carregadas.
 */
export function calculatePortfolioEvolutionTimeline(
  input: CalculateEvolutionInput
): PortfolioEvolutionSummary {
  const portfolioId = input.portfolioId;
  const baseCurrency = (input.baseCurrency || 'BRL').toUpperCase().trim();

  // 1. Validação estrita do período (Rejeição imediata de valores inválidos)
  const parsedPeriodResult = evolutionPeriodSchema.safeParse(
    input.period ?? 'YTD'
  );
  if (!parsedPeriodResult.success) {
    throw new InvalidEvolutionPeriodError();
  }
  const period = parsedPeriodResult.data;

  // 2. Validação estrita de referenceDate (Rejeição de datas futuras em dias civis UTC)
  const today = new Date();
  const refDate = input.referenceDate ? new Date(input.referenceDate) : today;
  if (isNaN(refDate.getTime())) {
    throw new Error('Data de referência inválida.');
  }

  if (getUtcCalendarDaysDiff(refDate, today) > 0) {
    throw new FutureDateNotAllowedError('A data de referência não pode estar no futuro.');
  }

  const endDate = toUtcDayEnd(refDate);

  const activeEvents = sortEventsChronologically(
    input.events.filter((e) => !e.deletedAt)
  );

  const isEmptyPortfolio = activeEvents.length === 0;

  // 3. Determina a data de início conforme o período
  let startDate: Date;
  let isPeriodTruncated = false;
  let truncatedHistoryStartDate: Date | null = null;

  const firstEventDate =
    activeEvents.length > 0 ? new Date(activeEvents[0].tradeDate) : refDate;

  switch (period) {
    case '1M':
      startDate = new Date(refDate.getTime() - 30 * MS_PER_DAY);
      break;
    case '3M':
      startDate = new Date(refDate.getTime() - 90 * MS_PER_DAY);
      break;
    case '6M':
      startDate = new Date(refDate.getTime() - 180 * MS_PER_DAY);
      break;
    case 'YTD':
      startDate = new Date(Date.UTC(refDate.getUTCFullYear(), 0, 1, 0, 0, 0, 0));
      break;
    case '1Y':
      startDate = new Date(refDate.getTime() - 365 * MS_PER_DAY);
      break;
    case 'ALL':
      {
        const earliest = toUtcDayStart(firstEventDate);
        const maxDays = input.maxAllPeriodDays ?? MAX_ALL_PERIOD_DAYS;
        const limitDate = new Date(refDate.getTime() - maxDays * MS_PER_DAY);

        if (earliest < limitDate) {
          startDate = limitDate;
          isPeriodTruncated = true;
          truncatedHistoryStartDate = earliest;
        } else {
          startDate = earliest;
          isPeriodTruncated = false;
          truncatedHistoryStartDate = null;
        }
      }
      break;
  }

  startDate = toUtcDayStart(startDate);
  if (startDate > endDate) {
    startDate = toUtcDayStart(endDate);
  }

  // 4. Ordena cotações e taxas cambiais cronologicamente para consumo em fila única
  const sortedQuotes = [...(input.quotes || [])].sort(
    (a, b) => new Date(a.quoteDate).getTime() - new Date(b.quoteDate).getTime()
  );

  const sortedRates = [...(input.exchangeRates || [])].sort(
    (a, b) => new Date(a.rateDate).getTime() - new Date(b.rateDate).getTime()
  );

  // 5. Monta o vetor de datas diárias entre startDate e endDate
  const dayPoints: Date[] = [];
  const currentDay = new Date(startDate);
  while (currentDay <= endDate) {
    dayPoints.push(toUtcDayEnd(currentDay));
    currentDay.setUTCDate(currentDay.getUTCDate() + 1);
  }

  // 6. Estruturas para o replay temporal
  const custodyMap = new Map<string, RunningAssetPosition>();
  let eventIndex = 0;
  let quoteIndex = 0;
  let rateIndex = 0;

  // Mapas dos estados mais recentes no momento T
  const latestCompatibleQuoteMap = new Map<string, MarketQuote>();
  const latestIncompatibleQuoteMap = new Map<string, MarketQuote>();
  const latestFxMap = new Map<string, ExchangeRate>();

  const points: PortfolioEvolutionPoint[] = [];
  let hasStaleQuotesInPeriod = false;
  let hasStaleFxInPeriod = false;
  let hasMissingFxInPeriod = false;

  // Processa o replay dia a dia
  for (const dayEnd of dayPoints) {
    const dayEndMs = dayEnd.getTime();

    // 6.1. Aplica todos os eventos de carteira ocorridos até o final deste dia
    while (
      eventIndex < activeEvents.length &&
      new Date(activeEvents[eventIndex].tradeDate).getTime() <= dayEndMs
    ) {
      const e = activeEvents[eventIndex];
      const assetId = e.assetId;
      const qty = new Decimal(e.quantity);
      const price = new Decimal(e.unitPrice);
      const fees = new Decimal(e.fees || 0);
      const assetMeta = input.assetsMap?.get(assetId);
      const currency = (assetMeta?.currency || e.currency || baseCurrency)
        .toUpperCase()
        .trim();

      let pos = custodyMap.get(assetId);
      if (!pos) {
        pos = {
          assetId,
          quantity: new Decimal(0),
          totalCost: new Decimal(0),
          currency,
        };
        custodyMap.set(assetId, pos);
      }

      if (
        e.type === 'BUY' ||
        e.type === 'TRANSFER_IN' ||
        e.type === 'SUBSCRIPTION_EXERCISE'
      ) {
        const costDelta = qty.times(price).plus(fees);
        pos.quantity = pos.quantity.plus(qty);
        pos.totalCost = pos.totalCost.plus(costDelta);
      } else if (e.type === 'SELL' || e.type === 'TRANSFER_OUT') {
        if (pos.quantity.greaterThan(0)) {
          const sellQty = Decimal.min(qty, pos.quantity);
          const priorAvgPrice = pos.totalCost.dividedBy(pos.quantity);
          pos.quantity = pos.quantity.minus(sellQty);
          if (pos.quantity.isZero()) {
            pos.totalCost = new Decimal(0);
          } else {
            pos.totalCost = pos.quantity.times(priorAvgPrice);
          }
        }
      } else if (e.type === 'SPLIT') {
        if (pos.quantity.greaterThan(0) && qty.greaterThan(0)) {
          const splitRes = applySplit(pos.quantity, qty, pos.totalCost);
          pos.quantity = splitRes.quantity;
          pos.totalCost = splitRes.totalCost;
        }
      } else if (e.type === 'GROUPING') {
        if (pos.quantity.greaterThan(0) && qty.greaterThan(0)) {
          const groupRes = applyGrouping(pos.quantity, qty, pos.totalCost);
          pos.quantity = groupRes.quantity;
          pos.totalCost = groupRes.totalCost;
        }
      } else if (e.type === 'BONUS_SHARE') {
        if (pos.quantity.greaterThan(0) && qty.greaterThan(0)) {
          const bonusRes = applyBonusShare(pos.quantity, pos.totalCost, qty, price);
          pos.quantity = bonusRes.quantity;
          pos.totalCost = bonusRes.totalCost;
        }
      }

      eventIndex++;
    }

    // 6.2. Avança ponteiro de cotações em fila única O(Q) separando cotações compatíveis de incompatíveis
    while (
      quoteIndex < sortedQuotes.length &&
      new Date(sortedQuotes[quoteIndex].quoteDate).getTime() <= dayEndMs
    ) {
      const q = sortedQuotes[quoteIndex];
      const assetMeta = input.assetsMap?.get(q.assetId);
      const expectedCurrency = (assetMeta?.currency || baseCurrency)
        .toUpperCase()
        .trim();
      const quoteCurrency = q.currency.toUpperCase().trim();

      if (quoteCurrency === expectedCurrency) {
        latestCompatibleQuoteMap.set(q.assetId, q);
      } else {
        latestIncompatibleQuoteMap.set(q.assetId, q);
      }
      quoteIndex++;
    }

    // 6.3. Avança ponteiro de câmbio em fila única O(R) por par exato até dayEnd
    while (
      rateIndex < sortedRates.length &&
      new Date(sortedRates[rateIndex].rateDate).getTime() <= dayEndMs
    ) {
      const r = sortedRates[rateIndex];
      const pairKey = `${r.fromCurrency.toUpperCase().trim()}_${r.toCurrency.toUpperCase().trim()}`;
      latestFxMap.set(pairKey, r);
      rateIndex++;
    }

    // 6.4. Apura posições ativas deste dia
    const activePositions = Array.from(custodyMap.values()).filter((p) =>
      p.quantity.greaterThan(0)
    );

    const totalPositionsCount = activePositions.length;

    if (totalPositionsCount === 0) {
      points.push({
        date: dayEnd,
        dateKey: toUtcDateKey(dayEnd),
        investedCost: new Decimal(0),
        quotedInvestedCost: new Decimal(0),
        marketValue: new Decimal(0),
        unrealizedPnL: new Decimal(0),
        unrealizedPnLPercent: null,
        totalPositionsCount: 0,
        quotedPositionsCount: 0,
        stalePositionsCount: 0,
        staleQuotePositionsCount: 0,
        unquotedPositionsCount: 0,
        fxMissingPositionsCount: 0,
        fxStalePositionsCount: 0,
        currencyMismatchPositionsCount: 0,
        coveragePercent: new Decimal(100),
        hasStaleQuotes: false,
        hasStaleFx: false,
        hasMissingFx: false,
        hasOnlyMissingFx: false,
        isPartiallyValued: false,
        hasOnlyUnquotedPositions: false,
        hasOnlyStaleQuotes: false,
        hasOnlyStaleFx: false,
        isEmpty: true,
      });
      continue;
    }

    let investedCost = new Decimal(0);
    let quotedInvestedCost = new Decimal(0);
    let marketValue = new Decimal(0);
    let quotedPositionsCount = 0;
    let stalePositionsCount = 0;
    let staleQuotePositionsCount = 0;
    let unquotedPositionsCount = 0;
    let fxMissingPositionsCount = 0;
    let fxStalePositionsCount = 0;
    let currencyMismatchPositionsCount = 0;
    let dayHasStaleQuotes = false;
    let dayHasStaleFx = false;
    let dayHasMissingFx = false;

    for (const pos of activePositions) {
      const posCurrency = pos.currency.toUpperCase().trim();
      const isBaseCurrency = posCurrency === baseCurrency;

      // Validação Cambial genérica (para qualquer baseCurrency)
      let fxRateValue: Decimal | null = null;
      let fxStatus: 'VALID' | 'STALE' | 'MISSING' = 'VALID';

      if (!isBaseCurrency) {
        const pairKey = `${posCurrency}_${baseCurrency}`;
        const fx = latestFxMap.get(pairKey);

        if (!fx || new Date(fx.rateDate).getTime() > dayEndMs) {
          fxStatus = 'MISSING';
          fxMissingPositionsCount++;
          dayHasMissingFx = true;
          hasMissingFxInPeriod = true;
        } else {
          const fxAgeDays = getUtcCalendarDaysDiff(dayEnd, new Date(fx.rateDate));
          if (fxAgeDays > MAX_QUOTE_AGE_DAYS) {
            fxStatus = 'STALE';
            fxStalePositionsCount++;
            dayHasStaleFx = true;
            hasStaleFxInPeriod = true;
          } else {
            fxStatus = 'VALID';
            fxRateValue = fx.rate;
          }
        }
      } else {
        fxRateValue = new Decimal(1);
      }

      // Regra 1: Conversão cambial estrita - sem FX válido NUNCA soma valor nominal na moeda-base
      let posCostInBase: Decimal | null = null;
      if (isBaseCurrency) {
        posCostInBase = pos.totalCost;
        investedCost = investedCost.plus(posCostInBase);
      } else if (fxStatus === 'VALID' && fxRateValue !== null) {
        posCostInBase = pos.totalCost.times(fxRateValue);
        investedCost = investedCost.plus(posCostInBase);
      }

      // 1. Diagnóstico de Cotação Incompatível (não sobrescreve a cotação compatível)
      const incompQuote = latestIncompatibleQuoteMap.get(pos.assetId);
      if (
        incompQuote &&
        new Date(incompQuote.quoteDate).getTime() <= dayEndMs
      ) {
        currencyMismatchPositionsCount++;
      }

      // 2. Avaliação da Última Cotação Compatível para Valuation
      const compQuote = latestCompatibleQuoteMap.get(pos.assetId);
      let quoteStatus: 'VALID' | 'STALE' | 'MISSING' = 'MISSING';

      if (!compQuote || new Date(compQuote.quoteDate).getTime() > dayEndMs) {
        quoteStatus = 'MISSING';
      } else {
        const quoteAgeDays = getUtcCalendarDaysDiff(
          dayEnd,
          new Date(compQuote.quoteDate)
        );
        if (quoteAgeDays > MAX_QUOTE_AGE_DAYS) {
          quoteStatus = 'STALE';
        } else {
          quoteStatus = 'VALID';
        }
      }

      // Classificação mutuamente exclusiva das posições (quoted vs stale vs unquoted)
      if (isBaseCurrency) {
        if (quoteStatus === 'VALID') {
          quotedPositionsCount++;
          if (posCostInBase !== null) {
            quotedInvestedCost = quotedInvestedCost.plus(posCostInBase);
          }
          marketValue = marketValue.plus(pos.quantity.times(compQuote!.price));
        } else if (quoteStatus === 'STALE') {
          stalePositionsCount++;
          staleQuotePositionsCount++;
          dayHasStaleQuotes = true;
          hasStaleQuotesInPeriod = true;
        } else {
          // quoteStatus === 'MISSING'
          unquotedPositionsCount++;
        }
      } else {
        // Ativo em moeda estrangeira: requer cotação E taxa cambial válidas
        if (quoteStatus === 'VALID' && fxStatus === 'VALID' && fxRateValue !== null) {
          quotedPositionsCount++;
          if (posCostInBase !== null) {
            quotedInvestedCost = quotedInvestedCost.plus(posCostInBase);
          }
          const rawMktVal = pos.quantity.times(compQuote!.price);
          marketValue = marketValue.plus(rawMktVal.times(fxRateValue));
        } else if (quoteStatus === 'STALE' || fxStatus === 'STALE') {
          stalePositionsCount++;
          if (quoteStatus === 'STALE') {
            staleQuotePositionsCount++;
            dayHasStaleQuotes = true;
            hasStaleQuotesInPeriod = true;
          }
        } else {
          // quoteStatus === 'MISSING' ou fxStatus === 'MISSING'
          unquotedPositionsCount++;
        }
      }
    }

    const isPartiallyValued =
      quotedPositionsCount > 0 && quotedPositionsCount < totalPositionsCount;
    const hasOnlyUnquotedPositions =
      unquotedPositionsCount === totalPositionsCount && totalPositionsCount > 0;
    const hasOnlyStaleQuotes =
      staleQuotePositionsCount === totalPositionsCount && totalPositionsCount > 0;
    const hasOnlyStaleFx =
      fxStalePositionsCount === totalPositionsCount && totalPositionsCount > 0;
    const hasOnlyMissingFx =
      fxMissingPositionsCount === totalPositionsCount && totalPositionsCount > 0;

    let finalMarketValue: Decimal | null = marketValue;
    let unrealizedPnL: Decimal | null = null;
    let unrealizedPnLPercent: Decimal | null = null;

    if (
      hasOnlyUnquotedPositions ||
      hasOnlyStaleQuotes ||
      hasOnlyStaleFx ||
      hasOnlyMissingFx ||
      quotedPositionsCount === 0
    ) {
      finalMarketValue = null;
    } else {
      unrealizedPnL = marketValue.minus(quotedInvestedCost);
      if (quotedInvestedCost.greaterThan(0)) {
        unrealizedPnLPercent = unrealizedPnL
          .dividedBy(quotedInvestedCost)
          .times(100);
      }
    }

    const coveragePercent =
      totalPositionsCount > 0
        ? new Decimal(quotedPositionsCount)
            .dividedBy(new Decimal(totalPositionsCount))
            .times(100)
        : new Decimal(100);

    points.push({
      date: dayEnd,
      dateKey: toUtcDateKey(dayEnd),
      investedCost,
      quotedInvestedCost,
      marketValue: finalMarketValue,
      unrealizedPnL,
      unrealizedPnLPercent,
      totalPositionsCount,
      quotedPositionsCount,
      stalePositionsCount,
      staleQuotePositionsCount,
      unquotedPositionsCount,
      fxMissingPositionsCount,
      fxStalePositionsCount,
      currencyMismatchPositionsCount,
      coveragePercent,
      hasStaleQuotes: dayHasStaleQuotes,
      hasStaleFx: dayHasStaleFx,
      hasMissingFx: dayHasMissingFx,
      hasOnlyMissingFx,
      isPartiallyValued,
      hasOnlyUnquotedPositions,
      hasOnlyStaleQuotes,
      hasOnlyStaleFx,
      isEmpty: false,
    });
  }

  // 7. Métricas do ponto mais recente (último ponto)
  const lastPoint =
    points.length > 0
      ? points[points.length - 1]
      : {
          investedCost: new Decimal(0),
          marketValue: null,
          unrealizedPnL: null,
          unrealizedPnLPercent: null,
          isPartiallyValued: false,
          hasOnlyStaleQuotes: false,
          hasOnlyStaleFx: false,
          hasOnlyUnquotedPositions: false,
          hasOnlyMissingFx: false,
        };

  const hasNoEventsInPeriod =
    activeEvents.filter(
      (e) =>
        new Date(e.tradeDate).getTime() >= startDate.getTime() &&
        new Date(e.tradeDate).getTime() <= endDate.getTime()
    ).length === 0;

  return {
    portfolioId,
    baseCurrency,
    period,
    startDate,
    endDate,
    points,
    currentInvestedCost: lastPoint.investedCost,
    currentMarketValue: lastPoint.marketValue,
    currentUnrealizedPnL: lastPoint.unrealizedPnL,
    currentUnrealizedPnLPercent: lastPoint.unrealizedPnLPercent,
    isCurrentlyPartiallyValued: lastPoint.isPartiallyValued,
    hasStaleQuotesInPeriod,
    hasStaleFxInPeriod,
    hasMissingFxInPeriod,
    hasOnlyStaleQuotes: lastPoint.hasOnlyStaleQuotes,
    hasOnlyStaleFx: lastPoint.hasOnlyStaleFx,
    hasOnlyUnquotedPositions: lastPoint.hasOnlyUnquotedPositions,
    hasOnlyMissingFx: lastPoint.hasOnlyMissingFx,
    isEmptyPortfolio,
    hasNoEventsInPeriod,
    isPeriodTruncated,
    truncatedHistoryStartDate,
  };
}

/**
 * Serializa a evolução patrimonial para transferência entre Server Components e cliente.
 */
export function serializePortfolioEvolutionSummary(
  summary: PortfolioEvolutionSummary
): SerializedPortfolioEvolutionSummary {
  const currency = summary.baseCurrency;

  const serializedPoints: SerializedPortfolioEvolutionPoint[] = summary.points.map(
    (p) => ({
      date: p.date.toISOString(),
      dateKey: p.dateKey,
      investedCost: p.investedCost.toString(),
      quotedInvestedCost: p.quotedInvestedCost.toString(),
      marketValue: p.marketValue !== null ? p.marketValue.toString() : null,
      unrealizedPnL:
        p.unrealizedPnL !== null ? p.unrealizedPnL.toString() : null,
      unrealizedPnLPercent:
        p.unrealizedPnLPercent !== null
          ? p.unrealizedPnLPercent.toString()
          : null,
      formattedInvestedCost: formatEvolutionMoney(p.investedCost, currency),
      formattedQuotedInvestedCost: formatEvolutionMoney(
        p.quotedInvestedCost,
        currency
      ),
      formattedMarketValue: formatEvolutionMoney(p.marketValue, currency),
      formattedUnrealizedPnL: formatEvolutionMoney(p.unrealizedPnL, currency),
      formattedUnrealizedPnLPercent: formatEvolutionPercent(
        p.unrealizedPnLPercent
      ),
      totalPositionsCount: p.totalPositionsCount,
      quotedPositionsCount: p.quotedPositionsCount,
      stalePositionsCount: p.stalePositionsCount,
      staleQuotePositionsCount: p.staleQuotePositionsCount,
      unquotedPositionsCount: p.unquotedPositionsCount,
      fxMissingPositionsCount: p.fxMissingPositionsCount,
      fxStalePositionsCount: p.fxStalePositionsCount,
      currencyMismatchPositionsCount: p.currencyMismatchPositionsCount,
      coveragePercent: p.coveragePercent.toString(),
      formattedCoveragePercent: `${p.coveragePercent.toFixed(0)}%`,
      hasStaleQuotes: p.hasStaleQuotes,
      hasStaleFx: p.hasStaleFx,
      hasMissingFx: p.hasMissingFx,
      hasOnlyMissingFx: p.hasOnlyMissingFx,
      isPartiallyValued: p.isPartiallyValued,
      hasOnlyUnquotedPositions: p.hasOnlyUnquotedPositions,
      hasOnlyStaleQuotes: p.hasOnlyStaleQuotes,
      hasOnlyStaleFx: p.hasOnlyStaleFx,
      isEmpty: p.isEmpty,
    })
  );

  return {
    portfolioId: summary.portfolioId,
    baseCurrency: summary.baseCurrency,
    period: summary.period,
    startDate: summary.startDate.toISOString(),
    endDate: summary.endDate.toISOString(),
    points: serializedPoints,
    currentInvestedCost: summary.currentInvestedCost.toString(),
    currentMarketValue:
      summary.currentMarketValue !== null
        ? summary.currentMarketValue.toString()
        : null,
    currentUnrealizedPnL:
      summary.currentUnrealizedPnL !== null
        ? summary.currentUnrealizedPnL.toString()
        : null,
    currentUnrealizedPnLPercent:
      summary.currentUnrealizedPnLPercent !== null
        ? summary.currentUnrealizedPnLPercent.toString()
        : null,
    formattedCurrentInvestedCost: formatEvolutionMoney(
      summary.currentInvestedCost,
      currency
    ),
    formattedCurrentMarketValue: formatEvolutionMoney(
      summary.currentMarketValue,
      currency
    ),
    formattedCurrentUnrealizedPnL: formatEvolutionMoney(
      summary.currentUnrealizedPnL,
      currency
    ),
    formattedCurrentUnrealizedPnLPercent: formatEvolutionPercent(
      summary.currentUnrealizedPnLPercent
    ),
    isCurrentlyPartiallyValued: summary.isCurrentlyPartiallyValued,
    hasStaleQuotesInPeriod: summary.hasStaleQuotesInPeriod,
    hasStaleFxInPeriod: summary.hasStaleFxInPeriod,
    hasMissingFxInPeriod: summary.hasMissingFxInPeriod,
    hasOnlyStaleQuotes: summary.hasOnlyStaleQuotes,
    hasOnlyStaleFx: summary.hasOnlyStaleFx,
    hasOnlyUnquotedPositions: summary.hasOnlyUnquotedPositions,
    hasOnlyMissingFx: summary.hasOnlyMissingFx,
    isEmptyPortfolio: summary.isEmptyPortfolio,
    hasNoEventsInPeriod: summary.hasNoEventsInPeriod,
    isPeriodTruncated: summary.isPeriodTruncated,
    truncatedHistoryStartDate: summary.truncatedHistoryStartDate
      ? summary.truncatedHistoryStartDate.toISOString()
      : null,
  };
}
