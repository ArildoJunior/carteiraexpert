import { Decimal } from '@/lib/decimal';
import type {
  CatalogAssetCategory,
  DelayStatus,
  DerivedFreshnessStatus,
  VariationStatus,
} from './catalog.types';

export const B3_TIMEZONE = 'America/Sao_Paulo';

/**
 * Retorna a data no formato YYYY-MM-DD no fuso horário do pregão (padrão B3: America/Sao_Paulo).
 * Garante que cotações próximas da meia-noite UTC sejam agrupadas no dia correto do mercado.
 */
export function getMarketTradingDay(date: Date, timeZone = B3_TIMEZONE): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return formatter.format(date);
}

/**
 * Calcula a quantidade de dias úteis (segunda a sexta-feira) entre uma data no passado e o momento atual.
 */
export function countBusinessDaysSince(pastDate: Date, currentDate = new Date(), timeZone = B3_TIMEZONE): number {
  const pastDayStr = getMarketTradingDay(pastDate, timeZone);
  const currentDayStr = getMarketTradingDay(currentDate, timeZone);

  if (pastDayStr >= currentDayStr) {
    return 0;
  }

  let businessDays = 0;
  const cursor = new Date(pastDate);

  while (getMarketTradingDay(cursor, timeZone) < currentDayStr) {
    cursor.setDate(cursor.getDate() + 1);
    const dayOfWeek = cursor.getDay(); // 0: Dom, 6: Sáb
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      businessDays += 1;
    }
  }

  return businessDays;
}

export interface QuoteComparisonInput {
  price: Decimal | string;
  currency: string;
  quoteDate: Date;
  delayStatus: DelayStatus;
}

export interface DailyVariationResult {
  dailyVariation: string | null;
  variationStatus: VariationStatus;
  previousClosePrice: string | null;
  previousCloseDate: string | null;
}

/**
 * Calcula a variação diária (% change) de forma determinística comparando
 * a cotação mais recente com o fechamento do dia de pregão útil anterior.
 */
export function calculateDailyVariation(
  quotesSortedDesc: QuoteComparisonInput[],
  timeZone = B3_TIMEZONE
): DailyVariationResult {
  if (!quotesSortedDesc || quotesSortedDesc.length === 0) {
    return {
      dailyVariation: null,
      variationStatus: 'unavailable',
      previousClosePrice: null,
      previousCloseDate: null,
    };
  }

  const currentQuote = quotesSortedDesc[0];
  const currentPrice =
    currentQuote.price instanceof Decimal
      ? currentQuote.price
      : new Decimal(currentQuote.price);
  const currentTradingDay = getMarketTradingDay(currentQuote.quoteDate, timeZone);

  // Encontra a cotação mais recente de um dia de negociação anterior
  const previousQuote = quotesSortedDesc.find(
    (q) =>
      getMarketTradingDay(q.quoteDate, timeZone) < currentTradingDay &&
      q.quoteDate < currentQuote.quoteDate
  );

  if (!previousQuote) {
    return {
      dailyVariation: null,
      variationStatus: 'insufficient_history',
      previousClosePrice: null,
      previousCloseDate: null,
    };
  }

  if (currentQuote.currency !== previousQuote.currency) {
    return {
      dailyVariation: null,
      variationStatus: 'unavailable',
      previousClosePrice: null,
      previousCloseDate: null,
    };
  }

  const prevPrice =
    previousQuote.price instanceof Decimal
      ? previousQuote.price
      : new Decimal(previousQuote.price);

  if (prevPrice.lte(0)) {
    return {
      dailyVariation: null,
      variationStatus: 'unavailable',
      previousClosePrice: prevPrice.toFixed(2),
      previousCloseDate: previousQuote.quoteDate.toISOString(),
    };
  }

  // Delta% = ((P_curr - P_prev) / P_prev) * 100
  const diff = currentPrice.minus(prevPrice);
  const percentage = diff.dividedBy(prevPrice).times(100);
  const variationStr = percentage.toFixed(2);

  return {
    dailyVariation: variationStr,
    variationStatus: 'available',
    previousClosePrice: prevPrice.toFixed(2),
    previousCloseDate: previousQuote.quoteDate.toISOString(),
  };
}

/**
 * Deriva o status de frescor da cotação considerando idade em dias úteis e delay informado.
 */
export function deriveFreshnessStatus(
  latestQuote: QuoteComparisonInput | null | undefined,
  now = new Date(),
  timeZone = B3_TIMEZONE
): DerivedFreshnessStatus {
  if (!latestQuote) {
    return 'unquoted';
  }

  const businessDays = countBusinessDaysSince(latestQuote.quoteDate, now, timeZone);

  // Se mais de 5 dias úteis se passaram sem nova cotação, classifica como obsoleta/defasada (stale)
  if (businessDays > 5) {
    return 'stale';
  }

  return latestQuote.delayStatus;
}

export function getCategoryLabel(category: string): string {
  switch (category.toLowerCase()) {
    case 'stock':
      return 'Ações';
    case 'fii':
      return 'Fundos Imobiliários';
    case 'etf':
      return 'ETFs';
    case 'bdr':
      return 'BDRs';
    default:
      return category.toUpperCase();
  }
}

export function getCategoryPluralName(category: CatalogAssetCategory): string {
  switch (category) {
    case 'stock':
      return 'Ações Brasileiras';
    case 'fii':
      return 'Fundos Imobiliários (FIIs)';
    case 'etf':
      return 'Fundos de Índice (ETFs)';
    case 'bdr':
      return 'Brazilian Depositary Receipts (BDRs)';
  }
}

export function getCategoryRoute(category: string): string {
  switch (category.toLowerCase()) {
    case 'stock':
      return '/acoes';
    case 'fii':
      return '/fiis';
    case 'etf':
      return '/etfs';
    case 'bdr':
      return '/bdrs';
    default:
      return '/ativos';
  }
}

export function getAssetDetailRoute(assetType: string, ticker: string): string {
  const normTicker = encodeURIComponent(ticker.toUpperCase().trim());
  switch (assetType.toLowerCase()) {
    case 'stock':
      return `/acoes/${normTicker}`;
    case 'fii':
      return `/fiis/${normTicker}`;
    case 'etf':
      return `/etfs/${normTicker}`;
    case 'bdr':
      return `/bdrs/${normTicker}`;
    default:
      return `/ativos?query=${normTicker}`;
  }
}

export function getFreshnessBadge(status: DerivedFreshnessStatus): {
  label: string;
  variant: 'success' | 'warning' | 'muted' | 'danger';
  description: string;
} {
  switch (status) {
    case 'realtime':
      return {
        label: 'Tempo Real',
        variant: 'success',
        description: 'Cotação em tempo real confirmada pela fonte',
      };
    case 'delayed_15m':
      return {
        label: '15m Atraso',
        variant: 'warning',
        description: 'Cotação com atraso regulamentar de 15 minutos de pregão',
      };
    case 'eod':
      return {
        label: 'Fechamento',
        variant: 'muted',
        description: 'Cotação de fechamento do último pregão',
      };
    case 'manual':
      return {
        label: 'Manual',
        variant: 'muted',
        description: 'Cotação inserida administrativamente',
      };
    case 'stale':
      return {
        label: 'Defasada',
        variant: 'danger',
        description: 'Cotação sem atualização há mais de 5 dias úteis',
      };
    case 'unquoted':
      return {
        label: 'Sem Cotação',
        variant: 'muted',
        description: 'Ativo sem cotações registradas no catálogo interno',
      };
    case 'unknown':
    default:
      return {
        label: 'Indefinido',
        variant: 'muted',
        description: 'Status de cotação não identificado',
      };
  }
}
