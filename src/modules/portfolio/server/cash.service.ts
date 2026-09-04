import { eq, and, isNull, desc, sql } from 'drizzle-orm';
import { db, type Database, type DatabaseTransaction, type DbExecutor } from '@/lib/db';
import { cashAccounts, cashTransactions } from '@/lib/db/schema/cash';
import { portfolios } from '@/lib/db/schema/portfolio';
import { Decimal } from '@/lib/decimal';
import { insertAuditLog } from '@/lib/db/audit';
import type { SafeUser } from '@/modules/identity/domain/user.types';
import { assertOwnership } from '@/modules/identity/server/authorization-service';
import { assertPortfolioWritable } from '@/modules/plans/server/plan.service';
import type {
  CashAccount,
  CashAccountWithBalance,
  CashTransaction,
  CashSummary,
  SerializedCashAccount,
  SerializedCashTransaction,
  SerializedCashSummary,
} from '../domain/cash.types';
import {
  createCashAccountSchema,
  cashTransactionInputSchema,
  type CreateCashAccountInput,
  type CashTransactionInput,
} from '../domain/cash.schema';
import {
  CashAccountNotFoundError,
  CashAccountArchivedError,
  InsufficientCashBalanceError,
  InvalidCashTransactionError,
  PortfolioNotFoundError,
} from '../domain/errors';

export function serializeCashAccount(account: CashAccountWithBalance): SerializedCashAccount {
  return {
    id: account.id,
    portfolioId: account.portfolioId,
    name: account.name,
    currency: account.currency,
    status: account.status,
    balance: account.balance.toFixed(8),
    totalDeposits: account.totalDeposits.toFixed(8),
    totalWithdrawals: account.totalWithdrawals.toFixed(8),
    transactionsCount: account.transactionsCount,
    createdAt: account.createdAt.toISOString(),
    updatedAt: account.updatedAt.toISOString(),
  };
}

export function serializeCashTransaction(tx: CashTransaction): SerializedCashTransaction {
  return {
    id: tx.id,
    cashAccountId: tx.cashAccountId,
    type: tx.type,
    amount: tx.amount.toFixed(8),
    transactionDate: tx.transactionDate.toISOString(),
    description: tx.description,
    portfolioEventId: tx.portfolioEventId,
    createdAt: tx.createdAt.toISOString(),
  };
}

export function serializeCashSummary(summary: CashSummary): SerializedCashSummary {
  return {
    accounts: summary.accounts.map(serializeCashAccount),
    totalCashBalance: summary.totalCashBalance.toFixed(8),
    baseCurrency: summary.baseCurrency,
  };
}

/**
 * Cria a conta de caixa principal de forma idempotente para uma carteira dentro de uma transação.
 */
export async function createDefaultCashAccountInTransaction(
  portfolioId: string,
  baseCurrency: string,
  userId: string,
  tx: DatabaseTransaction,
  auditLogger: typeof insertAuditLog = insertAuditLog
): Promise<CashAccount> {
  const existing = await tx
    .select()
    .from(cashAccounts)
    .where(and(eq(cashAccounts.portfolioId, portfolioId), isNull(cashAccounts.deletedAt)))
    .limit(1);

  if (existing.length > 0) {
    const acc = existing[0];
    return {
      id: acc.id,
      portfolioId: acc.portfolioId,
      name: acc.name,
      currency: acc.currency,
      status: acc.status as 'active' | 'archived',
      createdAt: acc.createdAt,
      updatedAt: acc.updatedAt,
      deletedAt: acc.deletedAt,
    };
  }

  const id = crypto.randomUUID();
  const now = new Date();

  const [created] = await tx
    .insert(cashAccounts)
    .values({
      id,
      portfolioId,
      name: 'Conta Corrente Principal',
      currency: baseCurrency,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  await auditLogger(
    {
      tableName: 'cash_accounts',
      recordId: id,
      action: 'INSERT',
      actorId: userId,
      actorType: 'user',
      source: 'manual',
    },
    {
      newValue: {
        portfolioId,
        name: 'Conta Corrente Principal',
        currency: baseCurrency,
        status: 'active',
      },
    },
    { allowlist: ['portfolioId', 'name', 'currency', 'status'] },
    tx
  );

  return {
    id: created.id,
    portfolioId: created.portfolioId,
    name: created.name,
    currency: created.currency,
    status: created.status as 'active' | 'archived',
    createdAt: created.createdAt,
    updatedAt: created.updatedAt,
    deletedAt: created.deletedAt,
  };
}

/**
 * Consulta uma conta de caixa garantindo validação de titularidade da carteira pai.
 */
export async function getCashAccountById(
  cashAccountId: string,
  user: SafeUser,
  executor: Database | DatabaseTransaction = db
): Promise<CashAccountWithBalance> {
  const rows = await executor
    .select({
      account: cashAccounts,
      portfolio: portfolios,
    })
    .from(cashAccounts)
    .innerJoin(portfolios, eq(cashAccounts.portfolioId, portfolios.id))
    .where(and(eq(cashAccounts.id, cashAccountId), isNull(cashAccounts.deletedAt)))
    .limit(1);

  if (rows.length === 0) {
    throw new CashAccountNotFoundError();
  }

  const { account, portfolio } = rows[0];
  await assertOwnership(portfolio.userId, user, 'cash_account', executor);

  const txs = await executor
    .select()
    .from(cashTransactions)
    .where(eq(cashTransactions.cashAccountId, account.id));

  let totalDeposits = new Decimal(0);
  let totalWithdrawals = new Decimal(0);

  for (const t of txs) {
    const amt = new Decimal(t.amount);
    if (t.type === 'DEPOSIT') {
      totalDeposits = totalDeposits.plus(amt);
    } else if (t.type === 'WITHDRAWAL') {
      totalWithdrawals = totalWithdrawals.plus(amt);
    }
  }

  const balance = totalDeposits.minus(totalWithdrawals);

  return {
    id: account.id,
    portfolioId: account.portfolioId,
    name: account.name,
    currency: account.currency,
    status: account.status as 'active' | 'archived',
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
    deletedAt: account.deletedAt,
    balance,
    totalDeposits,
    totalWithdrawals,
    transactionsCount: txs.length,
  };
}

/**
 * Lista todas as contas de caixa de uma carteira com seus respectivos saldos calculados.
 */
export async function listCashAccountsByPortfolio(
  portfolioId: string,
  user: SafeUser,
  executor: Database | DatabaseTransaction = db
): Promise<CashAccountWithBalance[]> {
  const [portfolio] = await executor
    .select()
    .from(portfolios)
    .where(and(eq(portfolios.id, portfolioId), isNull(portfolios.deletedAt)))
    .limit(1);

  if (!portfolio) {
    throw new PortfolioNotFoundError();
  }

  await assertOwnership(portfolio.userId, user, 'portfolio', executor);

  const accounts = await executor
    .select()
    .from(cashAccounts)
    .where(and(eq(cashAccounts.portfolioId, portfolioId), isNull(cashAccounts.deletedAt)))
    .orderBy(cashAccounts.createdAt);

  if (accounts.length === 0) {
    return [];
  }

  const results: CashAccountWithBalance[] = [];

  for (const acc of accounts) {
    const txs = await executor
      .select()
      .from(cashTransactions)
      .where(eq(cashTransactions.cashAccountId, acc.id));

    let totalDeposits = new Decimal(0);
    let totalWithdrawals = new Decimal(0);

    for (const t of txs) {
      const amt = new Decimal(t.amount);
      if (t.type === 'DEPOSIT') {
        totalDeposits = totalDeposits.plus(amt);
      } else if (t.type === 'WITHDRAWAL') {
        totalWithdrawals = totalWithdrawals.plus(amt);
      }
    }

    results.push({
      id: acc.id,
      portfolioId: acc.portfolioId,
      name: acc.name,
      currency: acc.currency,
      status: acc.status as 'active' | 'archived',
      createdAt: acc.createdAt,
      updatedAt: acc.updatedAt,
      deletedAt: acc.deletedAt,
      balance: totalDeposits.minus(totalWithdrawals),
      totalDeposits,
      totalWithdrawals,
      transactionsCount: txs.length,
    });
  }

  return results;
}

/**
 * Retorna o resumo consolidado de caixa da carteira selecionada.
 * Totaliza no saldo consolidado apenas contas ativas na moeda base da carteira.
 */
export async function getPortfolioCashSummary(
  portfolioId: string,
  user: SafeUser,
  executor: Database | DatabaseTransaction = db
): Promise<CashSummary> {
  const [portfolio] = await executor
    .select()
    .from(portfolios)
    .where(and(eq(portfolios.id, portfolioId), isNull(portfolios.deletedAt)))
    .limit(1);

  if (!portfolio) {
    throw new PortfolioNotFoundError();
  }

  await assertOwnership(portfolio.userId, user, 'portfolio', executor);

  const accounts = await listCashAccountsByPortfolio(portfolioId, user, executor);

  let totalCashBalance = new Decimal(0);

  for (const acc of accounts) {
    if (acc.status === 'active' && acc.currency === portfolio.baseCurrency) {
      totalCashBalance = totalCashBalance.plus(acc.balance);
    }
  }

  return {
    accounts,
    totalCashBalance,
    baseCurrency: portfolio.baseCurrency,
  };
}

/**
 * Cria uma conta de caixa adicional na carteira.
 */
export async function createCashAccount(
  rawInput: CreateCashAccountInput,
  user: SafeUser,
  database: Database = db,
  auditLogger: typeof insertAuditLog = insertAuditLog
): Promise<CashAccount> {
  const input = createCashAccountSchema.parse(rawInput);

  return await database.transaction(async (tx: DatabaseTransaction) => {
    const [portfolio] = await tx
      .select()
      .from(portfolios)
      .where(and(eq(portfolios.id, input.portfolioId), isNull(portfolios.deletedAt)))
      .limit(1);

    if (!portfolio) {
      throw new PortfolioNotFoundError();
    }

    await assertOwnership(portfolio.userId, user, 'portfolio', tx);
    assertPortfolioWritable(portfolio);

    const id = crypto.randomUUID();
    const now = new Date();

    const [created] = await tx
      .insert(cashAccounts)
      .values({
        id,
        portfolioId: input.portfolioId,
        name: input.name,
        currency: input.currency,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    await auditLogger(
      {
        tableName: 'cash_accounts',
        recordId: id,
        action: 'INSERT',
        actorId: user.id,
        actorType: 'user',
        source: 'manual',
      },
      {
        newValue: {
          portfolioId: input.portfolioId,
          name: input.name,
          currency: input.currency,
          status: 'active',
        },
      },
      { allowlist: ['portfolioId', 'name', 'currency', 'status'] },
      tx
    );

    return {
      id: created.id,
      portfolioId: created.portfolioId,
      name: created.name,
      currency: created.currency,
      status: created.status as 'active' | 'archived',
      createdAt: created.createdAt,
      updatedAt: created.updatedAt,
      deletedAt: created.deletedAt,
    };
  });
}

/**
 * Deposita recursos em uma conta de caixa de forma atômica.
 */
export async function depositCash(
  rawInput: CashTransactionInput,
  user: SafeUser,
  database: Database = db,
  auditLogger: typeof insertAuditLog = insertAuditLog
): Promise<{ transaction: CashTransaction; newBalance: Decimal }> {
  const input = cashTransactionInputSchema.parse(rawInput);
  if (input.type !== 'DEPOSIT') {
    throw new InvalidCashTransactionError('Operação de depósito exige type = DEPOSIT.');
  }

  return await database.transaction(async (tx: DatabaseTransaction) => {
    const rows = await tx
      .select({
        account: cashAccounts,
        portfolio: portfolios,
      })
      .from(cashAccounts)
      .innerJoin(portfolios, eq(cashAccounts.portfolioId, portfolios.id))
      .where(and(eq(cashAccounts.id, input.cashAccountId), isNull(cashAccounts.deletedAt)))
      .limit(1);

    if (rows.length === 0) {
      throw new CashAccountNotFoundError();
    }

    const { account, portfolio } = rows[0];
    await assertOwnership(portfolio.userId, user, 'cash_account', tx);
    assertPortfolioWritable(portfolio);

    if (account.status === 'archived') {
      throw new CashAccountArchivedError();
    }

    const id = crypto.randomUUID();
    const amountDec = new Decimal(input.amount);
    const now = new Date();

    const [created] = await tx
      .insert(cashTransactions)
      .values({
        id,
        cashAccountId: account.id,
        type: 'DEPOSIT',
        amount: amountDec.toFixed(8),
        transactionDate: input.transactionDate,
        description: input.description ?? null,
        portfolioEventId: input.portfolioEventId ?? null,
        createdAt: now,
      })
      .returning();

    await auditLogger(
      {
        tableName: 'cash_transactions',
        recordId: id,
        action: 'INSERT',
        actorId: user.id,
        actorType: 'user',
        source: 'manual',
      },
      {
        newValue: {
          cashAccountId: account.id,
          type: 'DEPOSIT',
          amount: amountDec.toFixed(8),
          transactionDate: input.transactionDate.toISOString(),
          description: input.description ?? null,
        },
      },
      { allowlist: ['cashAccountId', 'type', 'amount', 'transactionDate', 'description'] },
      tx
    );

    // Calcula o novo saldo acumulado
    const allTxs = await tx
      .select({ type: cashTransactions.type, amount: cashTransactions.amount })
      .from(cashTransactions)
      .where(eq(cashTransactions.cashAccountId, account.id));

    let newBalance = new Decimal(0);
    for (const t of allTxs) {
      const a = new Decimal(t.amount);
      if (t.type === 'DEPOSIT') newBalance = newBalance.plus(a);
      else if (t.type === 'WITHDRAWAL') newBalance = newBalance.minus(a);
    }

    return {
      transaction: {
        id: created.id,
        cashAccountId: created.cashAccountId,
        type: 'DEPOSIT',
        amount: amountDec,
        transactionDate: created.transactionDate,
        description: created.description,
        portfolioEventId: created.portfolioEventId,
        createdAt: created.createdAt,
      },
      newBalance,
    };
  });
}

/**
 * Realiza uma retirada (saque) de recursos de uma conta de caixa.
 * Utiliza bloqueio pessimista FOR UPDATE na conta de caixa para prevenir race conditions
 * e rejeita atomicamente qualquer retirada superior ao saldo disponível.
 */
export async function withdrawCash(
  rawInput: CashTransactionInput,
  user: SafeUser,
  database: Database = db,
  auditLogger: typeof insertAuditLog = insertAuditLog
): Promise<{ transaction: CashTransaction; newBalance: Decimal }> {
  const input = cashTransactionInputSchema.parse(rawInput);
  if (input.type !== 'WITHDRAWAL') {
    throw new InvalidCashTransactionError('Operação de retirada exige type = WITHDRAWAL.');
  }

  return await database.transaction(async (tx: DatabaseTransaction) => {
    // 1. Bloqueio pessimista FOR UPDATE na conta de caixa
    const lockedAccounts = await tx
      .select()
      .from(cashAccounts)
      .where(and(eq(cashAccounts.id, input.cashAccountId), isNull(cashAccounts.deletedAt)))
      .for('update');

    if (lockedAccounts.length === 0) {
      throw new CashAccountNotFoundError();
    }

    const account = lockedAccounts[0];

    // 2. Busca a carteira para autorização e validação de escrita
    const [portfolio] = await tx
      .select()
      .from(portfolios)
      .where(and(eq(portfolios.id, account.portfolioId), isNull(portfolios.deletedAt)))
      .limit(1);

    if (!portfolio) {
      throw new PortfolioNotFoundError();
    }

    await assertOwnership(portfolio.userId, user, 'cash_account', tx);
    assertPortfolioWritable(portfolio);

    if (account.status === 'archived') {
      throw new CashAccountArchivedError();
    }

    // 3. Calcula determinísticamente o saldo atual com Decimal
    const allTxs = await tx
      .select({ type: cashTransactions.type, amount: cashTransactions.amount })
      .from(cashTransactions)
      .where(eq(cashTransactions.cashAccountId, account.id));

    let currentBalance = new Decimal(0);
    for (const t of allTxs) {
      const a = new Decimal(t.amount);
      if (t.type === 'DEPOSIT') currentBalance = currentBalance.plus(a);
      else if (t.type === 'WITHDRAWAL') currentBalance = currentBalance.minus(a);
    }

    const requestedAmount = new Decimal(input.amount);

    // 4. Validação atômica de saldo suficiente
    if (requestedAmount.greaterThan(currentBalance)) {
      throw new InsufficientCashBalanceError(
        requestedAmount.toFixed(2),
        currentBalance.toFixed(2),
        account.currency
      );
    }

    // 5. Inserção da retirada
    const id = crypto.randomUUID();
    const now = new Date();

    const [created] = await tx
      .insert(cashTransactions)
      .values({
        id,
        cashAccountId: account.id,
        type: 'WITHDRAWAL',
        amount: requestedAmount.toFixed(8),
        transactionDate: input.transactionDate,
        description: input.description ?? null,
        portfolioEventId: input.portfolioEventId ?? null,
        createdAt: now,
      })
      .returning();

    await auditLogger(
      {
        tableName: 'cash_transactions',
        recordId: id,
        action: 'INSERT',
        actorId: user.id,
        actorType: 'user',
        source: 'manual',
      },
      {
        newValue: {
          cashAccountId: account.id,
          type: 'WITHDRAWAL',
          amount: requestedAmount.toFixed(8),
          transactionDate: input.transactionDate.toISOString(),
          description: input.description ?? null,
        },
      },
      { allowlist: ['cashAccountId', 'type', 'amount', 'transactionDate', 'description'] },
      tx
    );

    const newBalance = currentBalance.minus(requestedAmount);

    return {
      transaction: {
        id: created.id,
        cashAccountId: created.cashAccountId,
        type: 'WITHDRAWAL',
        amount: requestedAmount,
        transactionDate: created.transactionDate,
        description: created.description,
        portfolioEventId: created.portfolioEventId,
        createdAt: created.createdAt,
      },
      newBalance,
    };
  });
}

/**
 * Lista as transações de uma conta de caixa com ordenação cronológica decrescente.
 */
export async function listCashTransactionsByAccount(
  cashAccountId: string,
  user: SafeUser,
  executor: Database | DatabaseTransaction = db
): Promise<CashTransaction[]> {
  const rows = await executor
    .select({
      account: cashAccounts,
      portfolio: portfolios,
    })
    .from(cashAccounts)
    .innerJoin(portfolios, eq(cashAccounts.portfolioId, portfolios.id))
    .where(and(eq(cashAccounts.id, cashAccountId), isNull(cashAccounts.deletedAt)))
    .limit(1);

  if (rows.length === 0) {
    throw new CashAccountNotFoundError();
  }

  const { account, portfolio } = rows[0];
  await assertOwnership(portfolio.userId, user, 'cash_account', executor);

  const txs = await executor
    .select()
    .from(cashTransactions)
    .where(eq(cashTransactions.cashAccountId, account.id))
    .orderBy(desc(cashTransactions.transactionDate), desc(cashTransactions.createdAt));

  return txs.map((t: typeof cashTransactions.$inferSelect) => ({
    id: t.id,
    cashAccountId: t.cashAccountId,
    type: t.type as 'DEPOSIT' | 'WITHDRAWAL',
    amount: new Decimal(t.amount),
    transactionDate: t.transactionDate,
    description: t.description,
    portfolioEventId: t.portfolioEventId,
    createdAt: t.createdAt,
  }));
}
