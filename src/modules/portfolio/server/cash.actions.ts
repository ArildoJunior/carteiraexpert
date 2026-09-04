'use server';

import { revalidatePath } from 'next/cache';
import { getCurrentUser } from '@/modules/identity/server/current-user';
import {
  createCashAccount,
  depositCash,
  withdrawCash,
  getPortfolioCashSummary,
  listCashTransactionsByAccount,
  serializeCashAccount,
  serializeCashTransaction,
  serializeCashSummary,
} from './cash.service';
import {
  createCashAccountSchema,
  cashTransactionInputSchema,
  type CreateCashAccountInput,
  type CashTransactionInput,
} from '../domain/cash.schema';
import {
  InsufficientCashBalanceError,
  CashAccountNotFoundError,
  CashAccountArchivedError,
  PortfolioFrozenError,
  PortfolioNotFoundError,
} from '../domain/errors';
import type {
  SerializedCashAccount,
  SerializedCashTransaction,
  SerializedCashSummary,
} from '../domain/cash.types';

export type CashActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };

export type ActionResult<T> = CashActionResult<T>;

export async function createCashAccountAction(
  rawInput: CreateCashAccountInput
): Promise<CashActionResult<SerializedCashAccount>> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: 'Sessão expirada. Faça login novamente.' };
    }

    const input = createCashAccountSchema.parse(rawInput);
    const account = await createCashAccount(input, user);

    revalidatePath(`/portfolios/${input.portfolioId}`);
    revalidatePath('/dashboard');

    return {
      success: true,
      data: serializeCashAccount({
        ...account,
        balance: new (await import('@/lib/decimal')).Decimal(0),
        totalDeposits: new (await import('@/lib/decimal')).Decimal(0),
        totalWithdrawals: new (await import('@/lib/decimal')).Decimal(0),
        transactionsCount: 0,
      }),
    };
  } catch (err: unknown) {
    if (err instanceof PortfolioFrozenError) {
      return { success: false, error: err.message };
    }
    if (err instanceof PortfolioNotFoundError) {
      return { success: false, error: 'Carteira não encontrada.' };
    }
    const message = err instanceof Error ? err.message : 'Erro ao criar conta de caixa.';
    return { success: false, error: message };
  }
}

export async function depositCashAction(
  rawInput: CashTransactionInput,
  portfolioId: string
): Promise<ActionResult<{ transaction: SerializedCashTransaction; newBalance: string }>> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: 'Sessão expirada. Faça login novamente.' };
    }

    const input = cashTransactionInputSchema.parse(rawInput);
    const result = await depositCash(input, user);

    revalidatePath(`/portfolios/${portfolioId}`);
    revalidatePath('/dashboard');

    return {
      success: true,
      data: {
        transaction: serializeCashTransaction(result.transaction),
        newBalance: result.newBalance.toFixed(8),
      },
    };
  } catch (err: unknown) {
    if (err instanceof PortfolioFrozenError) {
      return { success: false, error: err.message };
    }
    if (err instanceof CashAccountArchivedError) {
      return { success: false, error: err.message };
    }
    if (err instanceof CashAccountNotFoundError) {
      return { success: false, error: 'Conta de caixa não encontrada.' };
    }
    const message = err instanceof Error ? err.message : 'Erro ao realizar depósito.';
    return { success: false, error: message };
  }
}

export async function withdrawCashAction(
  rawInput: CashTransactionInput,
  portfolioId: string
): Promise<ActionResult<{ transaction: SerializedCashTransaction; newBalance: string }>> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: 'Sessão expirada. Faça login novamente.' };
    }

    const input = cashTransactionInputSchema.parse(rawInput);
    const result = await withdrawCash(input, user);

    revalidatePath(`/portfolios/${portfolioId}`);
    revalidatePath('/dashboard');

    return {
      success: true,
      data: {
        transaction: serializeCashTransaction(result.transaction),
        newBalance: result.newBalance.toFixed(8),
      },
    };
  } catch (err: unknown) {
    if (err instanceof InsufficientCashBalanceError) {
      return { success: false, error: err.message };
    }
    if (err instanceof PortfolioFrozenError) {
      return { success: false, error: err.message };
    }
    if (err instanceof CashAccountArchivedError) {
      return { success: false, error: err.message };
    }
    if (err instanceof CashAccountNotFoundError) {
      return { success: false, error: 'Conta de caixa não encontrada.' };
    }
    const message = err instanceof Error ? err.message : 'Erro ao realizar retirada.';
    return { success: false, error: message };
  }
}

export async function getPortfolioCashSummaryAction(
  portfolioId: string
): Promise<ActionResult<SerializedCashSummary>> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: 'Sessão expirada. Faça login novamente.' };
    }

    const summary = await getPortfolioCashSummary(portfolioId, user);
    return {
      success: true,
      data: serializeCashSummary(summary),
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao obter resumo de caixa.';
    return { success: false, error: message };
  }
}

export async function listCashTransactionsAction(
  cashAccountId: string
): Promise<ActionResult<SerializedCashTransaction[]>> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: 'Sessão expirada. Faça login novamente.' };
    }

    const txs = await listCashTransactionsByAccount(cashAccountId, user);
    return {
      success: true,
      data: txs.map(serializeCashTransaction),
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erro ao listar movimentações de caixa.';
    return { success: false, error: message };
  }
}
