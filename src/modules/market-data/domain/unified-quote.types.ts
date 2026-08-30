import type { Decimal } from '@/lib/decimal';

export type UnifiedQuoteSource = 'cotahist_b3' | 'market_quotes' | 'brapi' | 'manual';

export interface UnifiedQuote {
  ticker: string;
  tradeDate: Date;
  closePrice: Decimal;
  openPrice: Decimal | null;
  highPrice: Decimal | null;
  lowPrice: Decimal | null;
  quantity: Decimal | null;
  financialVolume: Decimal | null;
  tradeCount: number | null;
  currency: string;
  source: UnifiedQuoteSource;
  isOfficialClosing: boolean;
  dataAgeDays: number;
  isOutdated: boolean;
  delayStatus: 'real_time' | 'delayed' | 'end_of_day';
  notes?: string | null;
  previousClosePrice?: Decimal | null;
  dailyVariationPercent?: Decimal | null;
}

export interface UnifiedHistoricalQuote {
  ticker: string;
  tradeDate: Date;
  openPrice: Decimal;
  highPrice: Decimal;
  lowPrice: Decimal;
  closePrice: Decimal;
  quantity: Decimal;
  financialVolume: Decimal;
  tradeCount: number;
  bdiCode?: string;
  source: UnifiedQuoteSource;
}

export interface UnifiedPeriodVariation {
  ticker: string;
  startDate: Date;
  endDate: Date;
  initialPrice: Decimal;
  finalPrice: Decimal;
  periodVariationPercent: Decimal;
  periodHigh: Decimal;
  periodLow: Decimal;
  totalVolume: Decimal;
  totalQuantity: Decimal;
  totalTrades: number;
  quoteCount: number;
}
