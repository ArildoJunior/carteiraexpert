import type Decimal from 'decimal.js';

export type DelayStatus = 'realtime' | 'delayed_15m' | 'eod' | 'manual' | 'unknown';

// ─── Cotações de Mercado ───────────────────────────────────────────────────────
export interface MarketQuote {
  id: string;
  assetId: string;
  price: Decimal;
  currency: string;
  quoteDate: Date;
  source: string;
  delayStatus: DelayStatus;
  notes?: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SerializedMarketQuote {
  id: string;
  assetId: string;
  price: string;
  currency: string;
  quoteDate: string;
  source: string;
  delayStatus: DelayStatus;
  notes?: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Taxas de Câmbio ─────────────────────────────────────────────────────────
export interface ExchangeRate {
  id: string;
  fromCurrency: string;
  toCurrency: string;
  rate: Decimal;
  rateDate: Date;
  source: string;
  delayStatus: DelayStatus;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface SerializedExchangeRate {
  id: string;
  fromCurrency: string;
  toCurrency: string;
  rate: string;
  rateDate: string;
  source: string;
  delayStatus: DelayStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Valuation e Avaliação a Mercado ─────────────────────────────────────────
export interface AssetValuation {
  assetId: string;
  hasQuote: boolean;
  marketPrice: Decimal | null;
  marketValue: Decimal | null;
  unrealizedPnL: Decimal | null;
  unrealizedPnLPercent: Decimal | null;
  quoteCurrency: string;
  quoteDate: Date | null;
  quoteSource: string | null;
  delayStatus: DelayStatus | null;
  marketValueBrl: Decimal | null;
  fxRateUsed: Decimal | null;
  fxDateUsed: Date | null;
  assetPriceReturnPercent: Decimal | null;
  fxReturnPercent: Decimal | null;
}

export interface SerializedAssetValuation {
  assetId: string;
  hasQuote: boolean;
  marketPrice: string | null;
  marketValue: string | null;
  unrealizedPnL: string | null;
  unrealizedPnLPercent: string | null;
  quoteCurrency: string;
  quoteDate: string | null;
  quoteSource: string | null;
  delayStatus: DelayStatus | null;
  marketValueBrl: string | null;
  fxRateUsed: string | null;
  fxDateUsed: string | null;
  assetPriceReturnPercent: string | null;
  fxReturnPercent: string | null;
}
