import type { Decimal } from '@/lib/decimal';

export type EvolutionPeriod = '1M' | '3M' | '6M' | 'YTD' | '1Y' | 'ALL';

export type EvolutionViewMode =
  | 'market_value'
  | 'cost_basis'
  | 'comparison'
  | 'pnl';

export interface PortfolioEvolutionPoint {
  date: Date;
  dateKey: string; // 'YYYY-MM-DD'
  investedCost: Decimal;
  quotedInvestedCost: Decimal;
  marketValue: Decimal | null;
  unrealizedPnL: Decimal | null;
  unrealizedPnLPercent: Decimal | null;
  totalPositionsCount: number;
  quotedPositionsCount: number;
  stalePositionsCount: number;
  staleQuotePositionsCount: number;
  unquotedPositionsCount: number;
  fxMissingPositionsCount: number;
  fxStalePositionsCount: number;
  currencyMismatchPositionsCount: number;
  coveragePercent: Decimal;
  hasStaleQuotes: boolean;
  hasStaleFx: boolean;
  hasMissingFx: boolean;
  hasOnlyMissingFx: boolean;
  isPartiallyValued: boolean;
  hasOnlyUnquotedPositions: boolean;
  hasOnlyStaleQuotes: boolean;
  hasOnlyStaleFx: boolean;
  isEmpty: boolean;
}

export interface SerializedPortfolioEvolutionPoint {
  date: string;
  dateKey: string;
  investedCost: string;
  quotedInvestedCost: string;
  marketValue: string | null;
  unrealizedPnL: string | null;
  unrealizedPnLPercent: string | null;
  formattedInvestedCost: string;
  formattedQuotedInvestedCost: string;
  formattedMarketValue: string | null;
  formattedUnrealizedPnL: string | null;
  formattedUnrealizedPnLPercent: string | null;
  totalPositionsCount: number;
  quotedPositionsCount: number;
  stalePositionsCount: number;
  staleQuotePositionsCount: number;
  unquotedPositionsCount: number;
  fxMissingPositionsCount: number;
  fxStalePositionsCount: number;
  currencyMismatchPositionsCount: number;
  coveragePercent: string;
  formattedCoveragePercent: string;
  hasStaleQuotes: boolean;
  hasStaleFx: boolean;
  hasMissingFx: boolean;
  hasOnlyMissingFx: boolean;
  isPartiallyValued: boolean;
  hasOnlyUnquotedPositions: boolean;
  hasOnlyStaleQuotes: boolean;
  hasOnlyStaleFx: boolean;
  isEmpty: boolean;
}

export interface PortfolioEvolutionSummary {
  portfolioId: string;
  baseCurrency: string;
  period: EvolutionPeriod;
  startDate: Date;
  endDate: Date;
  points: PortfolioEvolutionPoint[];
  currentInvestedCost: Decimal;
  currentMarketValue: Decimal | null;
  currentUnrealizedPnL: Decimal | null;
  currentUnrealizedPnLPercent: Decimal | null;
  isCurrentlyPartiallyValued: boolean;
  hasStaleQuotesInPeriod: boolean;
  hasStaleFxInPeriod: boolean;
  hasMissingFxInPeriod: boolean;
  hasOnlyStaleQuotes: boolean;
  hasOnlyStaleFx: boolean;
  hasOnlyUnquotedPositions: boolean;
  hasOnlyMissingFx: boolean;
  isEmptyPortfolio: boolean;
  hasNoEventsInPeriod: boolean;
  isPeriodTruncated: boolean;
  truncatedHistoryStartDate?: Date | null;
}

export interface SerializedPortfolioEvolutionSummary {
  portfolioId: string;
  baseCurrency: string;
  period: EvolutionPeriod;
  startDate: string;
  endDate: string;
  points: SerializedPortfolioEvolutionPoint[];
  currentInvestedCost: string;
  currentMarketValue: string | null;
  currentUnrealizedPnL: string | null;
  currentUnrealizedPnLPercent: string | null;
  formattedCurrentInvestedCost: string;
  formattedCurrentMarketValue: string | null;
  formattedCurrentUnrealizedPnL: string | null;
  formattedCurrentUnrealizedPnLPercent: string | null;
  isCurrentlyPartiallyValued: boolean;
  hasStaleQuotesInPeriod: boolean;
  hasStaleFxInPeriod: boolean;
  hasMissingFxInPeriod: boolean;
  hasOnlyStaleQuotes: boolean;
  hasOnlyStaleFx: boolean;
  hasOnlyUnquotedPositions: boolean;
  hasOnlyMissingFx: boolean;
  isEmptyPortfolio: boolean;
  hasNoEventsInPeriod: boolean;
  isPeriodTruncated: boolean;
  truncatedHistoryStartDate?: string | null;
}
