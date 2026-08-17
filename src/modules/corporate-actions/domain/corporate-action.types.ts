import type Decimal from 'decimal.js';

/**
 * Representação de domínio puro de uma operação ou evento patrimonial.
 * Não depende de ORMs, tabelas Drizzle ou schemas de persistência.
 */
export interface PortfolioEvent {
  id: string;
  portfolioId: string;
  assetId: string;
  type: string;
  tradeDate: Date;
  settlementDate: Date | null;
  quantity: string;
  unitPrice: string;
  fees: string;
  currency: string;
  notes: string | null;
  source: string;
  createdBy: string;
  createdAt: Date;
  deletedAt: Date | null;
  cancellationReason: string | null;
}

export const CORPORATE_ACTION_TYPES = [
  'SPLIT',
  'GROUPING',
  'BONUS_SHARE',
  'DIVIDEND',
  'JCP',
] as const;

export type CorporateActionType = (typeof CORPORATE_ACTION_TYPES)[number];

export interface SplitTransitionResult {
  quantity: Decimal;
  totalCost: Decimal;
}

export interface GroupingTransitionResult {
  quantity: Decimal;
  totalCost: Decimal;
}

export interface BonusShareTransitionResult {
  quantity: Decimal;
  totalCost: Decimal;
}

export interface DividendCalculationResult {
  incomeAmount: Decimal;
}

export interface JcpCalculationResult {
  grossAmount: Decimal;
  irrfFees: Decimal;
  netIncomeAmount: Decimal;
}
