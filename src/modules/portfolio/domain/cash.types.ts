import type Decimal from 'decimal.js';

export type CashAccountStatus = 'active' | 'archived';
export type CashTransactionType = 'DEPOSIT' | 'WITHDRAWAL';

export interface CashAccount {
  id: string;
  portfolioId: string;
  name: string;
  currency: string;
  status: CashAccountStatus;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface CashAccountWithBalance extends CashAccount {
  balance: Decimal;
  totalDeposits: Decimal;
  totalWithdrawals: Decimal;
  transactionsCount: number;
}

export interface CashTransaction {
  id: string;
  cashAccountId: string;
  type: CashTransactionType;
  amount: Decimal;
  transactionDate: Date;
  description: string | null;
  portfolioEventId: string | null;
  createdAt: Date;
}

export interface SerializedCashAccount {
  id: string;
  portfolioId: string;
  name: string;
  currency: string;
  status: CashAccountStatus;
  balance: string;
  totalDeposits: string;
  totalWithdrawals: string;
  transactionsCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface SerializedCashTransaction {
  id: string;
  cashAccountId: string;
  type: CashTransactionType;
  amount: string;
  transactionDate: string;
  description: string | null;
  portfolioEventId: string | null;
  createdAt: string;
}

export interface CashSummary {
  accounts: CashAccountWithBalance[];
  totalCashBalance: Decimal;
  baseCurrency: string;
}

export interface SerializedCashSummary {
  accounts: SerializedCashAccount[];
  totalCashBalance: string;
  baseCurrency: string;
}
