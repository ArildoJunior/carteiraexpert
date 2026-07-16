export type PortfolioTransactionType =
  | "buy"
  | "sell"
  | "dividend"
  | "jcp"
  | "reitIncome"
  | "fixedIncomeCoupon"
  | "bonus"
  | "split"
  | "transferIn"
  | "transferOut"
  | "subscription"
  | "spinoff"
  | "merger"
  | "adjustment";

export type TransactionInput = {
  id: string;
  assetId: string;
  accountId: string;
  type: PortfolioTransactionType;
  transactionDate: Date;
  quantity: number;
  unitPrice: number;
  totalAmount: number;
  splitRatio?: number;
  metadata?: Record<string, unknown>;
};

export type PositionResult = {
  assetId: string;
  accountId: string;
  quantity: number;
  averageCost: number;
  totalInvested: number;
  realizedPnL: number;
  isOpen: boolean;
  openedAt: Date | null;
  closedAt: Date | null;
  lastTransactionAt: Date;
};

export class PortfolioCalculationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PortfolioCalculationError";
  }
}
