import type Decimal from 'decimal.js';

export interface AssetPosition {
  assetId: string;
  ticker: string;
  name: string;
  assetType: string;
  market: string;
  currency: string;
  isCustom: boolean;
  quantity: Decimal;
  averagePrice: Decimal;
  totalCost: Decimal;
  totalFees: Decimal;
  totalRealizedPnL: Decimal;
  totalIncomeReceived: Decimal;
  lastTradeDate: Date | null;
  hasFractionalShares: boolean;

  // Campos de Valuation e Marcação a Mercado
  hasQuote: boolean;
  marketPrice: Decimal | null;
  marketValue: Decimal | null;
  unrealizedPnL: Decimal | null;
  unrealizedPnLPercent: Decimal | null;
  quoteCurrency: string | null;
  quoteDate: Date | null;
  quoteSource: string | null;
  delayStatus: string | null;
  marketValueBrl: Decimal | null;
  fxRateUsed: Decimal | null;
  fxDateUsed: Date | null;
  assetPriceReturnPercent: Decimal | null;
}

export interface SerializedAssetPosition {
  assetId: string;
  ticker: string;
  name: string;
  assetType: string;
  market: string;
  currency: string;
  isCustom: boolean;
  quantity: string;
  averagePrice: string;
  totalCost: string;
  totalFees: string;
  totalRealizedPnL: string;
  totalIncomeReceived: string;
  lastTradeDate: string | null;
  hasFractionalShares: boolean;

  // Campos Serializados de Valuation
  hasQuote: boolean;
  marketPrice: string | null;
  marketValue: string | null;
  unrealizedPnL: string | null;
  unrealizedPnLPercent: string | null;
  quoteCurrency: string | null;
  quoteDate: string | null;
  quoteSource: string | null;
  delayStatus: string | null;
  marketValueBrl: string | null;
  fxRateUsed: string | null;
  fxDateUsed: string | null;
  assetPriceReturnPercent: string | null;
}

export interface RealizedTradePnL {
  eventId: string;
  assetId: string;
  quantity: Decimal;
  salePrice: Decimal;
  saleFees: Decimal;
  costBasisPrice: Decimal;
  totalProceedsNet: Decimal;
  totalCostBasis: Decimal;
  realizedPnL: Decimal;
  tradeDate: Date;
}

export interface SerializedRealizedTradePnL {
  eventId: string;
  assetId: string;
  quantity: string;
  salePrice: string;
  saleFees: string;
  costBasisPrice: string;
  totalProceedsNet: string;
  totalCostBasis: string;
  realizedPnL: string;
  tradeDate: string;
}

export interface PortfolioPositionsSummary {
  portfolioId: string;
  positions: AssetPosition[];
  closedPositions: AssetPosition[];
  totalInvestedCost: Decimal;
  totalFees: Decimal;
  totalRealizedPnL: Decimal;
  totalIncomeReceived: Decimal;
  totalMarketValue: Decimal;
  totalUnrealizedPnL: Decimal;
  totalUnrealizedPnLPercent: Decimal | null;
  calculatedAt: Date;
}

export interface SerializedPortfolioPositionsSummary {
  portfolioId: string;
  positions: SerializedAssetPosition[];
  closedPositions: SerializedAssetPosition[];
  totalInvestedCost: string;
  totalFees: string;
  totalRealizedPnL: string;
  totalIncomeReceived: string;
  totalMarketValue: string;
  totalUnrealizedPnL: string;
  totalUnrealizedPnLPercent: string | null;
  calculatedAt: string;
}

export interface AssetPositionDetail {
  position: AssetPosition;
  realizedTrades: RealizedTradePnL[];
}

export interface SerializedAssetPositionDetail {
  position: SerializedAssetPosition;
  realizedTrades: SerializedRealizedTradePnL[];
}
