import type { Decimal } from '@/lib/decimal';
import type { DbExecutor } from '@/lib/db';
import type { DelayStatus } from '../domain/market-data.types';

export interface ProviderQuoteItem {
  assetId?: string;
  ticker?: string;
  price: string | Decimal;
  currency?: string;
  market?: string;
  quoteDate: Date | string;
  source?: string;
  delayStatus?: DelayStatus;
  notes?: string | null;
}

export interface ProviderExchangeRateItem {
  fromCurrency: string;
  toCurrency?: string;
  rate: string | Decimal;
  rateDate: Date | string;
  source?: string;
  delayStatus?: DelayStatus;
}

export interface ManualMarketDataPayload {
  quotes?: ProviderQuoteItem[];
  exchangeRates?: ProviderExchangeRateItem[];
}

export interface MarketDataProviderAdapter {
  readonly name: string;
  fetchQuotes(
    tickers?: string[],
    targetDate?: Date
  ): Promise<ProviderQuoteItem[]>;
  fetchExchangeRates(
    pairs?: Array<{ fromCurrency: string; toCurrency?: string }>,
    targetDate?: Date
  ): Promise<ProviderExchangeRateItem[]>;
}

export interface IngestMarketDataOptions {
  dryRun?: boolean;
  executor?: DbExecutor;
}

export interface IngestionItemResult {
  identifier: string; // Ticker / AssetId ou Par de Moedas
  status: 'success' | 'failed';
  recordId?: string;
  priceOrRate?: string;
  currency?: string;
  date?: string;
  error?: string;
  errorCode?: string;
}

export interface IngestionReport {
  dryRun: boolean;
  quotesSummary: {
    total: number;
    succeeded: number;
    failed: number;
    items: IngestionItemResult[];
  };
  exchangeRatesSummary: {
    total: number;
    succeeded: number;
    failed: number;
    items: IngestionItemResult[];
  };
  success: boolean;
}
