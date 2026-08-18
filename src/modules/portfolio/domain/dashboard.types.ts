import type Decimal from 'decimal.js';
import type {
  PortfolioPositionsSummary,
  SerializedPortfolioPositionsSummary,
} from './position.types';
import type { PortfolioEvent } from './portfolio-event.types';

// ─── Tipos Internos de Domínio (Baseados em Decimal) ─────────────────────────

export interface CurrencyGroupSummary {
  currency: string;
  totalInvestedCost: Decimal;
  totalFees: Decimal;
  totalRealizedPnL: Decimal;
  totalIncomeReceived: Decimal;
  totalMarketValue: Decimal;
  totalUnrealizedPnL: Decimal;
  activePositionsCount: number;
  portfoliosCount: number;
}

export interface UserRecentEventItem extends PortfolioEvent {
  portfolioName: string;
  assetTicker: string;
  assetName: string;
  assetMarket: string;
}

export interface UserDashboardSummary {
  currencyGroups: CurrencyGroupSummary[];
  totalActivePortfolios: number;
  totalActivePositions: number;
  portfolioSummaries: {
    portfolioId: string;
    portfolioName: string;
    baseCurrency: string;
    summary: PortfolioPositionsSummary;
  }[];
  recentEvents: UserRecentEventItem[];
  calculatedAt: Date;
}

export interface UserHistoryPaginatedResult {
  items: UserRecentEventItem[];
  totalCount: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ─── Tipos Serializados para SSR, UI e Server Actions (Baseados em String) ───

export interface SerializedCurrencyGroupSummary {
  currency: string;
  totalInvestedCost: string;
  totalFees: string;
  totalRealizedPnL: string;
  totalIncomeReceived: string;
  totalMarketValue: string;
  totalUnrealizedPnL: string;
  activePositionsCount: number;
  portfoliosCount: number;
}

export interface SerializedUserRecentEventItem {
  id: string;
  portfolioId: string;
  portfolioName: string;
  assetId: string;
  assetTicker: string;
  assetName: string;
  assetMarket: string;
  type: string;
  tradeDate: string;
  settlementDate: string | null;
  quantity: string;
  unitPrice: string;
  fees: string;
  currency: string;
  source: string;
  notes: string | null;
  createdAt: string;
}

export interface SerializedUserDashboardData {
  currencyGroups: SerializedCurrencyGroupSummary[];
  totalActivePortfolios: number;
  totalActivePositions: number;
  portfolioSummaries: {
    portfolioId: string;
    portfolioName: string;
    baseCurrency: string;
    summary: SerializedPortfolioPositionsSummary;
  }[];
  recentEvents: SerializedUserRecentEventItem[];
  calculatedAt: string;
}

export interface SerializedUserHistoryPaginatedResult {
  items: SerializedUserRecentEventItem[];
  totalCount: number;
  page: number;
  limit: number;
  totalPages: number;
}
