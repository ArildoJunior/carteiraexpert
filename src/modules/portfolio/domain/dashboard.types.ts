import type Decimal from 'decimal.js';
import type {
  PortfolioPositionsSummary,
  SerializedPortfolioPositionsSummary,
} from './position.types';
import type { PortfolioEvent } from './portfolio-event.types';
import type { PortfolioPurpose } from './portfolio.types';

// ─── Tipos Internos de Domínio (Baseados em Decimal) ─────────────────────────

export interface DashboardPortfolioMetadata {
  id: string;
  name: string;
  purpose: PortfolioPurpose;
  baseCurrency: string;
  status: string;
}

export interface CurrencyGroupSummary {
  currency: string;
  totalInvestedCost: Decimal;
  totalFees: Decimal;
  totalRealizedPnL: Decimal;
  totalIncomeReceived: Decimal;
  totalMarketValue: Decimal;
  totalUnrealizedPnL: Decimal;
  totalCashBalance: Decimal;
  totalEquity: Decimal;
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
  selectedPortfolio: DashboardPortfolioMetadata | null;
  availablePortfolios: DashboardPortfolioMetadata[];
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
  totalCashBalance: string;
  totalEquity: string;
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
  direction?: string | null;
  tradeDate: string;
  settlementDate: string | null;
  quantity: string;
  unitPrice: string;
  fees: string;
  currency: string;
  source: string;
  custodyAccountId?: string | null;
  notes: string | null;
  createdAt: string;
}

export interface SerializedUserDashboardData {
  selectedPortfolio: DashboardPortfolioMetadata | null;
  availablePortfolios: DashboardPortfolioMetadata[];
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
