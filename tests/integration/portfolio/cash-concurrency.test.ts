import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../../../src/lib/db';
import { users } from '../../../src/lib/db/schema/identity';
import { portfolios } from '../../../src/lib/db/schema/portfolio';
import { cashAccounts, cashTransactions } from '../../../src/lib/db/schema/cash';
import { userPlans } from '../../../src/lib/db/schema/plans';
import { auditLogs } from '../../../src/lib/db/schema/audit';
import { createPortfolio } from '../../../src/modules/portfolio/server/portfolio.service';
import {
  getCashAccountById,
  listCashAccountsByPortfolio,
  getPortfolioCashSummary,
  createCashAccount,
  createDefaultCashAccountInTransaction,
  depositCash,
  withdrawCash,
  listCashTransactionsByAccount,
} from '../../../src/modules/portfolio/server/cash.service';
import { getUserDashboardData } from '../../../src/modules/portfolio/server/dashboard.service';
import {
  InsufficientCashBalanceError,
  CashAccountNotFoundError,
} from '../../../src/modules/portfolio/domain/errors';
import { AuthorizationError } from '../../../src/modules/identity/domain/errors';
import type { SafeUser } from '../../../src/modules/identity/domain/user.types';
import { eq, inArray } from 'drizzle-orm';
import { Decimal } from '@/lib/decimal';
import crypto from 'node:crypto';

describe('Integração: Contas de Caixa, Movimentações Monetárias e Concorrência', () => {
  const userAId = crypto.randomUUID();
  const userBId = crypto.randomUUID();
  let userA: SafeUser;
  let userB: SafeUser;

  const createdPortfolioIds: string[] = [];

  beforeAll(async () => {
    const now = new Date();

    // 1. Cria dois usuários
    await db.insert(users).values([
      {
        id: userAId,
        email: `cash_user_a_${Date.now()}@carteiraexpert.test`,
        name: 'Cash User A',
        passwordHash: 'dummy',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: userBId,
        email: `cash_user_b_${Date.now()}@carteiraexpert.test`,
        name: 'Cash User B',
        passwordHash: 'dummy',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
    ]);

    // 2. Planos PRO para ambos
    await db.insert(userPlans).values([
      {
        id: crypto.randomUUID(),
        userId: userAId,
        planId: 'pro',
        status: 'active',
        startsAt: now,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: crypto.randomUUID(),
        userId: userBId,
        planId: 'pro',
        status: 'active',
        startsAt: now,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    userA = {
      id: userAId,
      email: `cash_user_a_${Date.now()}@carteiraexpert.test`,
      name: 'Cash User A',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    userB = {
      id: userBId,
      email: `cash_user_b_${Date.now()}@carteiraexpert.test`,
      name: 'Cash User B',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
  });

  afterAll(async () => {
    // Limpeza em cascata
    if (createdPortfolioIds.length > 0) {
      await db.delete(portfolios).where(inArray(portfolios.id, createdPortfolioIds));
    }
    await db.delete(userPlans).where(inArray(userPlans.userId, [userAId, userBId]));
    await db.delete(auditLogs).where(inArray(auditLogs.actorId, [userAId, userBId]));
    await db.delete(users).where(inArray(users.id, [userAId, userBId]));
  });

  it('1. deve criar automaticamente "Conta Corrente Principal" na moeda base ao criar carteira', async () => {
    const portfolio = await createPortfolio(
      {
        name: 'Carteira com Caixa Automático',
        baseCurrency: 'BRL',
        purpose: 'REAL',
      },
      userA
    );
    createdPortfolioIds.push(portfolio.id);

    const accounts = await listCashAccountsByPortfolio(portfolio.id, userA);
    expect(accounts).toHaveLength(1);

    const mainAccount = accounts[0];
    expect(mainAccount.name).toBe('Conta Corrente Principal');
    expect(mainAccount.currency).toBe('BRL');
    expect(mainAccount.status).toBe('active');
    expect(mainAccount.balance.toString()).toBe('0');
    expect(mainAccount.totalDeposits.toString()).toBe('0');
    expect(mainAccount.totalWithdrawals.toString()).toBe('0');
    expect(mainAccount.transactionsCount).toBe(0);
  });

  it('2. deve garantir criação idempotente da conta principal sem duplicação em retentativa', async () => {
    const portfolio = await createPortfolio(
      {
        name: 'Carteira Idempotência Caixa',
        baseCurrency: 'USD',
        purpose: 'ESTUDO',
      },
      userA
    );
    createdPortfolioIds.push(portfolio.id);

    // Tenta re-executar a criação da conta padrão
    const secondCallAccount = await db.transaction(async (tx) => {
      return await createDefaultCashAccountInTransaction(portfolio.id, 'USD', userA.id, tx);
    });

    const accounts = await listCashAccountsByPortfolio(portfolio.id, userA);
    expect(accounts).toHaveLength(1);
    expect(secondCallAccount.id).toBe(accounts[0].id);
  });

  it('3. deve permitir depositar na conta de caixa e acumular saldo com Decimal', async () => {
    const portfolio = await createPortfolio(
      {
        name: 'Carteira Depósitos',
        baseCurrency: 'BRL',
        purpose: 'ANALISE',
      },
      userA
    );
    createdPortfolioIds.push(portfolio.id);

    const accounts = await listCashAccountsByPortfolio(portfolio.id, userA);
    const account = accounts[0];

    const dep1 = await depositCash(
      {
        cashAccountId: account.id,
        type: 'DEPOSIT',
        amount: '1250.75',
        transactionDate: new Date('2026-09-01T10:00:00Z'),
        description: 'Primeiro Aporte',
      },
      userA
    );

    expect(dep1.newBalance.toString()).toBe('1250.75');

    const dep2 = await depositCash(
      {
        cashAccountId: account.id,
        type: 'DEPOSIT',
        amount: '749.25',
        transactionDate: new Date('2026-09-02T10:00:00Z'),
        description: 'Segundo Aporte',
      },
      userA
    );

    expect(dep2.newBalance.toString()).toBe('2000');

    // Confirma via consulta da conta
    const updatedAccount = await getCashAccountById(account.id, userA);
    expect(updatedAccount.balance.toString()).toBe('2000');
    expect(updatedAccount.totalDeposits.toString()).toBe('2000');
    expect(updatedAccount.totalWithdrawals.toString()).toBe('0');
    expect(updatedAccount.transactionsCount).toBe(2);

    // Lista de transações ordenadas cronologicamente decrescente
    const txs = await listCashTransactionsByAccount(account.id, userA);
    expect(txs).toHaveLength(2);
    expect(txs[0].description).toBe('Segundo Aporte');
  });

  it('4. deve permitir retirada com saldo suficiente e rejeitar se saldo for insuficiente', async () => {
    const portfolio = await createPortfolio(
      {
        name: 'Carteira Saques',
        baseCurrency: 'BRL',
        purpose: 'ANALISE',
      },
      userA
    );
    createdPortfolioIds.push(portfolio.id);

    const accounts = await listCashAccountsByPortfolio(portfolio.id, userA);
    const account = accounts[0];

    // Depósito de 1000
    await depositCash(
      {
        cashAccountId: account.id,
        type: 'DEPOSIT',
        amount: '1000.00',
        transactionDate: new Date('2026-09-01T10:00:00Z'),
      },
      userA
    );

    // Saque de 350.50
    const w1 = await withdrawCash(
      {
        cashAccountId: account.id,
        type: 'WITHDRAWAL',
        amount: '350.50',
        transactionDate: new Date('2026-09-02T10:00:00Z'),
        description: 'Retirada parcial',
      },
      userA
    );

    expect(w1.newBalance.toString()).toBe('649.5');

    // Tentativa de saque de 700.00 (maior que o saldo disponível de 649.50)
    await expect(
      withdrawCash(
        {
          cashAccountId: account.id,
          type: 'WITHDRAWAL',
          amount: '700.00',
          transactionDate: new Date('2026-09-03T10:00:00Z'),
        },
        userA
      )
    ).rejects.toThrow(InsufficientCashBalanceError);

    // O saldo deve permanecer inalterado após a falha
    const finalAccount = await getCashAccountById(account.id, userA);
    expect(finalAccount.balance.toString()).toBe('649.5');
  });

  it('5. deve serializar concorrência em saques simultâneos com FOR UPDATE evitando saldo negativo', async () => {
    const portfolio = await createPortfolio(
      {
        name: 'Carteira Concorrência Saque',
        baseCurrency: 'BRL',
        purpose: 'ANALISE',
      },
      userA
    );
    createdPortfolioIds.push(portfolio.id);

    const accounts = await listCashAccountsByPortfolio(portfolio.id, userA);
    const account = accounts[0];

    // Saldo inicial de R$ 500,00
    await depositCash(
      {
        cashAccountId: account.id,
        type: 'DEPOSIT',
        amount: '500.00',
        transactionDate: new Date('2026-09-01T10:00:00Z'),
      },
      userA
    );

    // Dispara dois saques simultâneos de R$ 350,00 cada (total = R$ 700,00 > R$ 500,00)
    const [result1, result2] = await Promise.allSettled([
      withdrawCash(
        {
          cashAccountId: account.id,
          type: 'WITHDRAWAL',
          amount: '350.00',
          transactionDate: new Date('2026-09-02T10:00:00Z'),
          description: 'Saque Concorrente A',
        },
        userA
      ),
      withdrawCash(
        {
          cashAccountId: account.id,
          type: 'WITHDRAWAL',
          amount: '350.00',
          transactionDate: new Date('2026-09-02T10:00:00Z'),
          description: 'Saque Concorrente B',
        },
        userA
      ),
    ]);

    // Exatamente uma transação deve ter sucesso e uma deve falhar
    const fulfilled = [result1, result2].filter((r) => r.status === 'fulfilled');
    const rejected = [result1, result2].filter((r) => r.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);

    // A rejeitada deve ser InsufficientCashBalanceError
    const rejectionReason = (rejected[0] as PromiseRejectedResult).reason;
    expect(rejectionReason).toBeInstanceOf(InsufficientCashBalanceError);

    // O saldo final deve ser exatamente 500 - 350 = 150 (nunca negativo)
    const checkAccount = await getCashAccountById(account.id, userA);
    expect(checkAccount.balance.toString()).toBe('150');
  });

  it('6. deve proteger contra IDOR: Usuário B não pode acessar nem movimentar caixa do Usuário A', async () => {
    const portfolioA = await createPortfolio(
      {
        name: 'Carteira Privada User A',
        baseCurrency: 'BRL',
        purpose: 'ANALISE',
      },
      userA
    );
    createdPortfolioIds.push(portfolioA.id);

    const [accountA] = await listCashAccountsByPortfolio(portfolioA.id, userA);

    // User B tenta consultar conta do User A
    await expect(getCashAccountById(accountA.id, userB)).rejects.toThrow(AuthorizationError);

    // User B tenta listar contas da carteira do User A
    await expect(listCashAccountsByPortfolio(portfolioA.id, userB)).rejects.toThrow(AuthorizationError);

    // User B tenta criar conta na carteira do User A
    await expect(
      createCashAccount(
        {
          portfolioId: portfolioA.id,
          name: 'Conta Invasora',
          currency: 'BRL',
        },
        userB
      )
    ).rejects.toThrow(AuthorizationError);

    // User B tenta depositar na conta do User A
    await expect(
      depositCash(
        {
          cashAccountId: accountA.id,
          type: 'DEPOSIT',
          amount: '100.00',
          transactionDate: new Date(),
        },
        userB
      )
    ).rejects.toThrow(AuthorizationError);

    // User B tenta sacar da conta do User A
    await expect(
      withdrawCash(
        {
          cashAccountId: accountA.id,
          type: 'WITHDRAWAL',
          amount: '50.00',
          transactionDate: new Date(),
        },
        userB
      )
    ).rejects.toThrow(AuthorizationError);
  });

  it('7. deve rejeitar movimentações de caixa se a carteira estiver congelada', async () => {
    const portfolio = await createPortfolio(
      {
        name: 'Carteira Congelada Teste',
        baseCurrency: 'BRL',
        purpose: 'ANALISE',
      },
      userA
    );
    createdPortfolioIds.push(portfolio.id);

    const [account] = await listCashAccountsByPortfolio(portfolio.id, userA);

    // Congela a carteira
    await db.update(portfolios).set({ status: 'frozen' }).where(eq(portfolios.id, portfolio.id));

    // Tentar depositar
    await expect(
      depositCash(
        {
          cashAccountId: account.id,
          type: 'DEPOSIT',
          amount: '100.00',
          transactionDate: new Date(),
        },
        userA
      )
    ).rejects.toThrow(/congelada/i);

    // Tentar retirar
    await expect(
      withdrawCash(
        {
          cashAccountId: account.id,
          type: 'WITHDRAWAL',
          amount: '50.00',
          transactionDate: new Date(),
        },
        userA
      )
    ).rejects.toThrow(/congelada/i);
  });

  it('8. deve integrar o saldo de caixa no patrimônio total do Dashboard da carteira selecionada', async () => {
    const userDashId = crypto.randomUUID();
    const now = new Date();

    await db.insert(users).values({
      id: userDashId,
      email: `cash_dash_user_${Date.now()}@carteiraexpert.test`,
      name: 'Cash Dash User',
      passwordHash: 'dummy',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(userPlans).values({
      id: crypto.randomUUID(),
      userId: userDashId,
      planId: 'pro',
      status: 'active',
      startsAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const userDash: SafeUser = {
      id: userDashId,
      email: `cash_dash_user_${Date.now()}@carteiraexpert.test`,
      name: 'Cash Dash User',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    // 1. Cria carteira REAL para User Dash com depósito de R$ 15.000,00
    const portReal = await createPortfolio(
      {
        name: 'Carteira Real Dashboard',
        baseCurrency: 'BRL',
        purpose: 'REAL',
      },
      userDash
    );
    createdPortfolioIds.push(portReal.id);

    const [accountReal] = await listCashAccountsByPortfolio(portReal.id, userDash);
    await depositCash(
      {
        cashAccountId: accountReal.id,
        type: 'DEPOSIT',
        amount: '15000.00',
        transactionDate: new Date('2026-09-01T10:00:00Z'),
        description: 'Aporte de Capital',
      },
      userDash
    );

    // 2. Cria carteira ESTUDO para User Dash com depósito de R$ 5.000,00
    const portEstudo = await createPortfolio(
      {
        name: 'Carteira Estudo Dashboard',
        baseCurrency: 'BRL',
        purpose: 'ESTUDO',
      },
      userDash
    );
    createdPortfolioIds.push(portEstudo.id);

    const [accountEstudo] = await listCashAccountsByPortfolio(portEstudo.id, userDash);
    await depositCash(
      {
        cashAccountId: accountEstudo.id,
        type: 'DEPOSIT',
        amount: '5000.00',
        transactionDate: new Date('2026-09-01T10:00:00Z'),
      },
      userDash
    );

    // 3. Consulta Dashboard padrão (seleciona automaticamente a carteira REAL)
    const dashboardReal = await getUserDashboardData(userDash);
    expect(dashboardReal.selectedPortfolio?.id).toBe(portReal.id);

    const brlRealGroup = dashboardReal.currencyGroups.find((g) => g.currency === 'BRL');
    expect(brlRealGroup).toBeDefined();
    // Saldo de caixa deve ser exclusivamente os 15.000 da carteira REAL (não misturando com os 5.000 de Estudo)
    expect(brlRealGroup!.totalCashBalance.toString()).toBe('15000');
    expect(brlRealGroup!.totalEquity.toString()).toBe('15000');

    // 4. Consulta Dashboard com contexto da carteira ESTUDO explicitamente selecionada
    const dashboardEstudo = await getUserDashboardData(userDash, { portfolioId: portEstudo.id });
    expect(dashboardEstudo.selectedPortfolio?.id).toBe(portEstudo.id);

    const brlEstudoGroup = dashboardEstudo.currencyGroups.find((g) => g.currency === 'BRL');
    expect(brlEstudoGroup).toBeDefined();
    // Saldo de caixa deve ser exclusivamente os 5.000 da carteira ESTUDO
    expect(brlEstudoGroup!.totalCashBalance.toString()).toBe('5000');
    expect(brlEstudoGroup!.totalEquity.toString()).toBe('5000');

    // Limpeza de userDash
    await db.delete(portfolios).where(eq(portfolios.userId, userDashId));
    await db.delete(userPlans).where(eq(userPlans.userId, userDashId));
    await db.delete(users).where(eq(users.id, userDashId));
  });
});
