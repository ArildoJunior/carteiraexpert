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
  lastTradeDate: Date | null;
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
  lastTradeDate: string | null;
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
  calculatedAt: Date;
}

export interface SerializedPortfolioPositionsSummary {
  portfolioId: string;
  positions: SerializedAssetPosition[];
  closedPositions: SerializedAssetPosition[];
  totalInvestedCost: string;
  totalFees: string;
  totalRealizedPnL: string;
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
