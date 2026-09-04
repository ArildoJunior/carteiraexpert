import { describe, it, expect } from 'vitest';
import { Decimal } from '@/lib/decimal';
import {
  createCashAccountSchema,
  cashTransactionInputSchema,
} from '../../../src/modules/portfolio/domain/cash.schema';
import {
  serializeCashAccount,
  serializeCashTransaction,
  serializeCashSummary,
} from '../../../src/modules/portfolio/server/cash.service';
import { calculateUserDashboardSummary } from '../../../src/modules/portfolio/domain/position-engine';
import type { PortfolioPositionsSummary, AssetPosition } from '../../../src/modules/portfolio/domain/position.types';
import type { CashAccountWithBalance, CashTransaction, CashSummary } from '../../../src/modules/portfolio/domain/cash.types';
import crypto from 'node:crypto';

describe('Unitário: Domínio de Contas de Caixa e Movimentações Monetárias', () => {
  describe('Zod: createCashAccountSchema', () => {
    it('deve validar com sucesso uma conta de caixa válida', () => {
      const valid = createCashAccountSchema.parse({
        portfolioId: crypto.randomUUID(),
        name: 'Conta Corrente Principal',
        currency: 'BRL',
      });

      expect(valid.name).toBe('Conta Corrente Principal');
      expect(valid.currency).toBe('BRL');
    });

    it('deve aceitar moedas permitidas (BRL, USD, EUR)', () => {
      const pId = crypto.randomUUID();
      expect(createCashAccountSchema.parse({ portfolioId: pId, name: 'C1', currency: 'BRL' }).currency).toBe('BRL');
      expect(createCashAccountSchema.parse({ portfolioId: pId, name: 'C2', currency: 'USD' }).currency).toBe('USD');
      expect(createCashAccountSchema.parse({ portfolioId: pId, name: 'C3', currency: 'EUR' }).currency).toBe('EUR');
    });

    it('deve rejeitar moeda não suportada ou formato inválido', () => {
      const pId = crypto.randomUUID();
      expect(() =>
        createCashAccountSchema.parse({ portfolioId: pId, name: 'Conta', currency: 'GBP' })
      ).toThrow();
    });

    it('deve rejeitar portfolioId inválido (não UUID)', () => {
      expect(() =>
        createCashAccountSchema.parse({ portfolioId: 'invalid-id', name: 'Conta', currency: 'BRL' })
      ).toThrow();
    });

    it('deve rejeitar nome em branco ou com mais de 100 caracteres', () => {
      const pId = crypto.randomUUID();
      expect(() => createCashAccountSchema.parse({ portfolioId: pId, name: '   ', currency: 'BRL' })).toThrow();
      expect(() =>
        createCashAccountSchema.parse({ portfolioId: pId, name: 'a'.repeat(101), currency: 'BRL' })
      ).toThrow();
    });
  });

  describe('Zod: cashTransactionInputSchema', () => {
    it('deve validar com sucesso depósito monetário válido', () => {
      const parsed = cashTransactionInputSchema.parse({
        cashAccountId: crypto.randomUUID(),
        type: 'DEPOSIT',
        amount: '1500.50',
        transactionDate: new Date('2026-09-01T10:00:00Z'),
        description: 'Aporte inicial',
      });

      expect(parsed.type).toBe('DEPOSIT');
      expect(parsed.amount).toBe('1500.50');
      expect(parsed.description).toBe('Aporte inicial');
      expect(parsed.portfolioEventId).toBeUndefined();
    });

    it('deve validar com sucesso retirada monetária com portfolioEventId opcional', () => {
      const eventId = crypto.randomUUID();
      const parsed = cashTransactionInputSchema.parse({
        cashAccountId: crypto.randomUUID(),
        type: 'WITHDRAWAL',
        amount: '250.00',
        transactionDate: '2026-09-02T12:00:00Z',
        description: null,
        portfolioEventId: eventId,
      });

      expect(parsed.type).toBe('WITHDRAWAL');
      expect(parsed.portfolioEventId).toBe(eventId);
    });

    it('deve rejeitar montante zero ou negativo', () => {
      const accId = crypto.randomUUID();
      const now = new Date();

      expect(() =>
        cashTransactionInputSchema.parse({
          cashAccountId: accId,
          type: 'DEPOSIT',
          amount: '0',
          transactionDate: now,
        })
      ).toThrow(/positivo/i);

      expect(() =>
        cashTransactionInputSchema.parse({
          cashAccountId: accId,
          type: 'WITHDRAWAL',
          amount: '-50.00',
          transactionDate: now,
        })
      ).toThrow(/positivo/i);
    });

    it('deve rejeitar tipo inválido de transação', () => {
      const accId = crypto.randomUUID();
      expect(() =>
        cashTransactionInputSchema.parse({
          cashAccountId: accId,
          type: 'TRANSFER',
          amount: '100.00',
          transactionDate: new Date(),
        })
      ).toThrow();
    });

    it('deve rejeitar valor numérico mal formatado', () => {
      const accId = crypto.randomUUID();
      expect(() =>
        cashTransactionInputSchema.parse({
          cashAccountId: accId,
          type: 'DEPOSIT',
          amount: 'abc',
          transactionDate: new Date(),
        })
      ).toThrow();
    });
  });

  describe('Serialização Determinística com Decimal', () => {
    it('deve serializar CashAccount preservando 8 casas decimais', () => {
      const now = new Date();
      const account: CashAccountWithBalance = {
        id: crypto.randomUUID(),
        portfolioId: crypto.randomUUID(),
        name: 'Conta Corrente Principal',
        currency: 'BRL',
        status: 'active',
        balance: new Decimal('1234.56'),
        totalDeposits: new Decimal('2000.00'),
        totalWithdrawals: new Decimal('765.44'),
        transactionsCount: 3,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };

      const serialized = serializeCashAccount(account);
      expect(serialized.balance).toBe('1234.56000000');
      expect(serialized.totalDeposits).toBe('2000.00000000');
      expect(serialized.totalWithdrawals).toBe('765.44000000');
      expect(serialized.transactionsCount).toBe(3);
    });

    it('deve serializar CashTransaction preservando amount com 8 casas decimais', () => {
      const now = new Date();
      const tx: CashTransaction = {
        id: crypto.randomUUID(),
        cashAccountId: crypto.randomUUID(),
        type: 'DEPOSIT',
        amount: new Decimal('500.12345678'),
        transactionDate: now,
        description: 'Depósito de dividendos',
        portfolioEventId: null,
        createdAt: now,
      };

      const serialized = serializeCashTransaction(tx);
      expect(serialized.amount).toBe('500.12345678');
      expect(serialized.type).toBe('DEPOSIT');
      expect(serialized.description).toBe('Depósito de dividendos');
    });

    it('deve serializar CashSummary com lista de contas e total de caixa', () => {
      const now = new Date();
      const account: CashAccountWithBalance = {
        id: crypto.randomUUID(),
        portfolioId: crypto.randomUUID(),
        name: 'Conta Principal',
        currency: 'BRL',
        status: 'active',
        balance: new Decimal('1000.00'),
        totalDeposits: new Decimal('1000.00'),
        totalWithdrawals: new Decimal('0.00'),
        transactionsCount: 1,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      };

      const summary: CashSummary = {
        accounts: [account],
        totalCashBalance: new Decimal('1000.00'),
        baseCurrency: 'BRL',
      };

      const serialized = serializeCashSummary(summary);
      expect(serialized.totalCashBalance).toBe('1000.00000000');
      expect(serialized.baseCurrency).toBe('BRL');
      expect(serialized.accounts).toHaveLength(1);
      expect(serialized.accounts[0].name).toBe('Conta Principal');
    });
  });

  describe('Cálculo de Patrimônio Total no Dashboard com Caixa (Motor Determinístico)', () => {
    const createDummyPosition = (marketValue: string, cost: string): AssetPosition => ({
      assetId: crypto.randomUUID(),
      ticker: 'TEST3',
      name: 'Empresa Teste S.A.',
      assetType: 'stock',
      market: 'B3',
      currency: 'BRL',
      isCustom: false,
      quantity: new Decimal('100'),
      averagePrice: new Decimal(cost).dividedBy(100),
      totalCost: new Decimal(cost),
      totalFees: new Decimal('0'),
      totalRealizedPnL: new Decimal('0'),
      totalIncomeReceived: new Decimal('0'),
      lastTradeDate: new Date('2026-08-20T10:00:00Z'),
      hasFractionalShares: false,
      hasQuote: true,
      marketPrice: new Decimal(marketValue).dividedBy(100),
      marketValue: new Decimal(marketValue),
      unrealizedPnL: new Decimal(marketValue).minus(new Decimal(cost)),
      unrealizedPnLPercent: new Decimal('0'),
      quoteCurrency: 'BRL',
      quoteDate: new Date(),
      quoteSource: 'cotahist',
      delayStatus: 'delayed',
      marketValueBrl: new Decimal(marketValue),
      fxRateUsed: null,
      fxDateUsed: null,
      assetPriceReturnPercent: null,
    });

    it('deve calcular Patrimônio Total = Valor a Mercado + Saldo de Caixa Disponível', () => {
      const portfolioId = crypto.randomUUID();
      const summary: PortfolioPositionsSummary = {
        portfolioId,
        positions: [createDummyPosition('8000.00', '7000.00')],
        closedPositions: [],
        totalInvestedCost: new Decimal('7000.00'),
        totalFees: new Decimal('0'),
        totalRealizedPnL: new Decimal('0'),
        totalIncomeReceived: new Decimal('0'),
        totalMarketValue: new Decimal('8000.00'),
        totalUnrealizedPnL: new Decimal('1000.00'),
        totalUnrealizedPnLPercent: new Decimal('14.28'),
        calculatedAt: new Date(),
      };

      const selectedPortfolio = {
        id: portfolioId,
        name: 'Minha Carteira Real',
        purpose: 'REAL' as const,
        baseCurrency: 'BRL',
        status: 'active',
      };

      const cashBalance = new Decimal('2500.50');

      const result = calculateUserDashboardSummary(
        [
          {
            portfolioId,
            portfolioName: 'Minha Carteira Real',
            baseCurrency: 'BRL',
            summary,
          },
        ],
        [],
        selectedPortfolio,
        [selectedPortfolio],
        cashBalance
      );

      const brlGroup = result.currencyGroups.find((g) => g.currency === 'BRL');
      expect(brlGroup).toBeDefined();
      expect(brlGroup!.totalMarketValue.toString()).toBe('8000');
      expect(brlGroup!.totalCashBalance.toString()).toBe('2500.5');
      // Patrimônio total = 8000 + 2500.50 = 10500.50
      expect(brlGroup!.totalEquity.toString()).toBe('10500.5');
    });

    it('deve refletir o saldo de caixa integral no patrimônio se a carteira não tiver ativos', () => {
      const portfolioId = crypto.randomUUID();
      const emptySummary: PortfolioPositionsSummary = {
        portfolioId,
        positions: [],
        closedPositions: [],
        totalInvestedCost: new Decimal('0'),
        totalFees: new Decimal('0'),
        totalRealizedPnL: new Decimal('0'),
        totalIncomeReceived: new Decimal('0'),
        totalMarketValue: new Decimal('0'),
        totalUnrealizedPnL: new Decimal('0'),
        totalUnrealizedPnLPercent: new Decimal('0'),
        calculatedAt: new Date(),
      };

      const selectedPortfolio = {
        id: portfolioId,
        name: 'Carteira Apenas Caixa',
        purpose: 'REAL' as const,
        baseCurrency: 'BRL',
        status: 'active',
      };

      const cashBalance = new Decimal('50000.00');

      const result = calculateUserDashboardSummary(
        [
          {
            portfolioId,
            portfolioName: 'Carteira Apenas Caixa',
            baseCurrency: 'BRL',
            summary: emptySummary,
          },
        ],
        [],
        selectedPortfolio,
        [selectedPortfolio],
        cashBalance
      );

      const brlGroup = result.currencyGroups.find((g) => g.currency === 'BRL');
      expect(brlGroup).toBeDefined();
      expect(brlGroup!.totalMarketValue.toString()).toBe('0');
      expect(brlGroup!.totalCashBalance.toString()).toBe('50000');
      expect(brlGroup!.totalEquity.toString()).toBe('50000');
    });

    it('não deve somar o saldo de caixa no grupo se a moeda do saldo for diferente da carteira', () => {
      const portfolioId = crypto.randomUUID();
      const summary: PortfolioPositionsSummary = {
        portfolioId,
        positions: [],
        closedPositions: [],
        totalInvestedCost: new Decimal('0'),
        totalFees: new Decimal('0'),
        totalRealizedPnL: new Decimal('0'),
        totalIncomeReceived: new Decimal('0'),
        totalMarketValue: new Decimal('0'),
        totalUnrealizedPnL: new Decimal('0'),
        totalUnrealizedPnLPercent: new Decimal('0'),
        calculatedAt: new Date(),
      };

      const selectedPortfolio = {
        id: portfolioId,
        name: 'Carteira Internacional',
        purpose: 'ESTUDO' as const,
        baseCurrency: 'USD',
        status: 'active',
      };

      const cashBalance = new Decimal('1000.00');

      const result = calculateUserDashboardSummary(
        [
          {
            portfolioId,
            portfolioName: 'Carteira Internacional',
            baseCurrency: 'USD',
            summary,
          },
        ],
        [],
        selectedPortfolio,
        [selectedPortfolio],
        cashBalance
      );

      const usdGroup = result.currencyGroups.find((g) => g.currency === 'USD');
      expect(usdGroup).toBeDefined();
      expect(usdGroup!.totalCashBalance.toString()).toBe('1000');
      expect(usdGroup!.totalEquity.toString()).toBe('1000');

      // BRL não deve receber o caixa em USD
      const brlGroup = result.currencyGroups.find((g) => g.currency === 'BRL');
      expect(brlGroup).toBeUndefined();
    });
  });
});
