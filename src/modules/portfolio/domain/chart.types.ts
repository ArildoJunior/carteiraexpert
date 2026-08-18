import type Decimal from 'decimal.js';

export type AllocationBasis = 'market_value' | 'cost_basis';
export type ChartGroupingType = 'asset' | 'asset_type' | 'currency';

export interface ChartSlice {
  id: string;
  key: string;
  label: string;
  secondaryLabel?: string | null;
  assetType?: string | null;
  currency: string;
  rawValue: Decimal;
  percent: Decimal;
  formattedValue: string;
  formattedPercent: string;
  color: string;
  hasQuote: boolean;
  positionsCount: number;
}

export interface SerializedChartSlice {
  id: string;
  key: string;
  label: string;
  secondaryLabel?: string | null;
  assetType?: string | null;
  currency: string;
  rawValue: string;
  percent: string;
  formattedValue: string;
  formattedPercent: string;
  color: string;
  hasQuote: boolean;
  positionsCount: number;
}

export interface PortfolioAllocationResult {
  basis: AllocationBasis;
  groupingType: ChartGroupingType;
  baseCurrency: string;
  totalCalculatedValue: Decimal;
  formattedTotalValue: string;
  slices: ChartSlice[];
  totalPositionsCount: number;
  quotedPositionsCount: number;
  unquotedPositionsCount: number;
  unquotedTotalCost: Decimal;
  formattedUnquotedTotalCost: string;
  isPartiallyQuoted: boolean;
  hasOnlyUnquotedPositions: boolean;
  isEmpty: boolean;
}

export interface SerializedPortfolioAllocationResult {
  basis: AllocationBasis;
  groupingType: ChartGroupingType;
  baseCurrency: string;
  totalCalculatedValue: string;
  formattedTotalValue: string;
  slices: SerializedChartSlice[];
  totalPositionsCount: number;
  quotedPositionsCount: number;
  unquotedPositionsCount: number;
  unquotedTotalCost: string;
  formattedUnquotedTotalCost: string;
  isPartiallyQuoted: boolean;
  hasOnlyUnquotedPositions: boolean;
  isEmpty: boolean;
}
