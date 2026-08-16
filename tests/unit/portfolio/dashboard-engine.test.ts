import { describe, it, expect } from 'vitest';
import { Decimal } from '@/lib/decimal';
import {
  calculateUserDashboardSummary,
  serializeUserDashboardData,
} from '../../../src/modules/portfolio/domain/position-engine';
import { listUserRecentEventsSchema } from '../../../src/modules/portfolio/domain/dashboard.schema';
import type { PortfolioPositionsSummary, AssetPosition } from '../../../src/modules/portfolio/domain/position.types';
import type { UserRecentEventItem } from '../../../src/modules/portfolio/domain/dashboard.types';
import crypto from 'node:crypto';

describe('Unitário: Motor de Consolidação do Dashboard Multi-Carteiras', () => {
  const dummyAssetPos = (ticker: string, cost: string, pnl = '0', income = '0'): AssetPosition => ({
    assetId: crypto.randomUUID(),
    ticker,
    name: `${ticker} S.A.`,
    assetType: 'stock',
    market: 'B3',
    currency: 'BRL',
    isCustom: false,
    quantity: new Decimal('100'),
    averagePrice: new Decimal(cost).dividedBy(100),
    totalCost: new Decimal(cost),
    totalFees: new Decimal('5.00'),
    totalRealizedPnL: new Decimal(pnl),
    totalIncomeReceived: new Decimal(income),
    lastTradeDate: new Date('2026-08-14T10:00:00.000Z'),
    hasFractionalShares: false,
  });

  it('deve consolidar corretamente múltiplas carteiras na mesma moeda base (BRL)', () => {
    const summary1: PortfolioPositionsSummary = {
      portfolioId: 'port-1',
      positions: [dummyAssetPos('PETR4', '3000.00', '150.00', '50.00')],
      closedPositions: [],
      totalInvestedCost: new Decimal('3000.00'),
      totalFees: new Decimal('10.00'),
      totalRealizedPnL: new Decimal('150.00'),
      totalIncomeReceived: new Decimal('50.00'),
      calculatedAt: new Date(),
    };

    const summary2: PortfolioPositionsSummary = {
      portfolioId: 'port-2',
      positions: [
        dummyAssetPos('VALE3', '5000.00', '300.00', '100.00'),
        dummyAssetPos('ITUB4', '2000.00', '-50.00', '25.00'),
      ],
      closedPositions: [],
      totalInvestedCost: new Decimal('7000.00'),
      totalFees: new Decimal('25.00'),
      totalRealizedPnL: new Decimal('250.00'),
      totalIncomeReceived: new Decimal('125.00'),
      calculatedAt: new Date(),
    };

    const input = [
      {
        portfolioId: 'port-1',
        portfolioName: 'Carteira Dividendos',
        baseCurrency: 'BRL',
        summary: summary1,
      },
      {
        portfolioId: 'port-2',
        portfolioName: 'Carteira Valor',
        baseCurrency: 'BRL',
        summary: summary2,
      },
    ];

    const result = calculateUserDashboardSummary(input);

    expect(result.totalActivePortfolios).toBe(2);
    expect(result.totalActivePositions).toBe(3);
    expect(result.currencyGroups).toHaveLength(1);

    const brlGroup = result.currencyGroups[0];
    expect(brlGroup.currency).toBe('BRL');
    expect(brlGroup.portfoliosCount).toBe(2);
    expect(brlGroup.activePositionsCount).toBe(3);
    expect(brlGroup.totalInvestedCost.toString()).toBe('10000'); // 3000 + 7000
    expect(brlGroup.totalFees.toString()).toBe('35'); // 10 + 25
    expect(brlGroup.totalRealizedPnL.toString()).toBe('400'); // 150 + 250
    expect(brlGroup.totalIncomeReceived.toString()).toBe('175'); // 50 + 125
  });

  it('deve segregar métricas por moeda base sem misturar valores quando houver moedas distintas', () => {
    const summaryBRL: PortfolioPositionsSummary = {
      portfolioId: 'port-brl',
      positions: [dummyAssetPos('PETR4', '4000.00')],
      closedPositions: [],
      totalInvestedCost: new Decimal('4000.00'),
      totalFees: new Decimal('12.00'),
      totalRealizedPnL: new Decimal('100.00'),
      totalIncomeReceived: new Decimal('40.00'),
      calculatedAt: new Date(),
    };

    const summaryUSD: PortfolioPositionsSummary = {
      portfolioId: 'port-usd',
      positions: [dummyAssetPos('AAPL', '1500.00')],
      closedPositions: [],
      totalInvestedCost: new Decimal('1500.00'),
      totalFees: new Decimal('3.00'),
      totalRealizedPnL: new Decimal('50.00'),
      totalIncomeReceived: new Decimal('15.00'),
      calculatedAt: new Date(),
    };

    const input = [
      {
        portfolioId: 'port-brl',
        portfolioName: 'Ações Brasil',
        baseCurrency: 'BRL',
        summary: summaryBRL,
      },
      {
        portfolioId: 'port-usd',
        portfolioName: 'Ações EUA',
        baseCurrency: 'USD',
        summary: summaryUSD,
      },
    ];

    const result = calculateUserDashboardSummary(input);

    expect(result.totalActivePortfolios).toBe(2);
    expect(result.totalActivePositions).toBe(2);
    expect(result.currencyGroups).toHaveLength(2);

    // BRL deve vir em primeiro
    expect(result.currencyGroups[0].currency).toBe('BRL');
    expect(result.currencyGroups[0].totalInvestedCost.toString()).toBe('4000');
    expect(result.currencyGroups[0].totalIncomeReceived.toString()).toBe('40');
    expect(result.currencyGroups[0].portfoliosCount).toBe(1);

    // USD em segundo
    expect(result.currencyGroups[1].currency).toBe('USD');
    expect(result.currencyGroups[1].totalInvestedCost.toString()).toBe('1500');
    expect(result.currencyGroups[1].totalIncomeReceived.toString()).toBe('15');
    expect(result.currencyGroups[1].portfoliosCount).toBe(1);
  });

  it('deve retornar estrutura padrão zerada quando o usuário não tiver carteiras', () => {
    const result = calculateUserDashboardSummary([], []);

    expect(result.totalActivePortfolios).toBe(0);
    expect(result.totalActivePositions).toBe(0);
    expect(result.currencyGroups).toHaveLength(1);
    expect(result.currencyGroups[0].currency).toBe('BRL');
    expect(result.currencyGroups[0].totalInvestedCost.toString()).toBe('0');
    expect(result.currencyGroups[0].totalFees.toString()).toBe('0');
    expect(result.currencyGroups[0].totalRealizedPnL.toString()).toBe('0');
    expect(result.currencyGroups[0].totalIncomeReceived.toString()).toBe('0');
    expect(result.recentEvents).toHaveLength(0);
  });

  it('deve serializar todos os dados do dashboard em strings formatadas com precisão', () => {
    const summary: PortfolioPositionsSummary = {
      portfolioId: 'port-1',
      positions: [dummyAssetPos('B3SA3', '1250.50', '80.25', '20.00')],
      closedPositions: [],
      totalInvestedCost: new Decimal('1250.50'),
      totalFees: new Decimal('4.75'),
      totalRealizedPnL: new Decimal('80.25'),
      totalIncomeReceived: new Decimal('20.00'),
      calculatedAt: new Date('2026-08-15T12:00:00.000Z'),
    };

    const recentEvent: UserRecentEventItem = {
      id: crypto.randomUUID(),
      portfolioId: 'port-1',
      portfolioName: 'Carteira Principal',
      assetId: crypto.randomUUID(),
      assetTicker: 'B3SA3',
      assetName: 'B3 S.A.',
      assetMarket: 'B3',
      type: 'BUY',
      tradeDate: new Date('2026-08-15T10:00:00.000Z'),
      settlementDate: new Date('2026-08-17T10:00:00.000Z'),
      quantity: '100.0000000000',
      unitPrice: '12.50500000',
      fees: '4.75000000',
      currency: 'BRL',
      notes: 'Compra regular',
      source: 'manual',
      createdBy: crypto.randomUUID(),
      createdAt: new Date('2026-08-15T10:00:00.000Z'),
      deletedAt: null,
      cancellationReason: null,
    };

    const dashboardSummary = calculateUserDashboardSummary(
      [
        {
          portfolioId: 'port-1',
          portfolioName: 'Carteira Principal',
          baseCurrency: 'BRL',
          summary,
        },
      ],
      [recentEvent]
    );

    const serialized = serializeUserDashboardData(dashboardSummary);

    expect(serialized.totalActivePortfolios).toBe(1);
    expect(serialized.totalActivePositions).toBe(1);
    expect(serialized.currencyGroups[0].totalInvestedCost).toBe('1250.50000000');
    expect(serialized.currencyGroups[0].totalRealizedPnL).toBe('80.25000000');
    expect(serialized.recentEvents[0].portfolioName).toBe('Carteira Principal');
    expect(serialized.recentEvents[0].assetTicker).toBe('B3SA3');
    expect(serialized.recentEvents[0].quantity).toBe('100.0000000000');
  });

  it('deve validar limites de paginação e filtros no schema listUserRecentEventsSchema', () => {
    const valid = listUserRecentEventsSchema.parse({
      limit: 25,
      offset: 10,
      type: 'BUY',
    });

    expect(valid.limit).toBe(25);
    expect(valid.offset).toBe(10);
    expect(valid.type).toBe('BUY');

    // Default limit = 10, offset = 0
    const defaults = listUserRecentEventsSchema.parse({});
    expect(defaults.limit).toBe(10);
    expect(defaults.offset).toBe(0);

    // Rejeita limite acima de 50
    expect(() =>
      listUserRecentEventsSchema.parse({
        limit: 100,
      })
    ).toThrow();

    // Rejeita offset negativo
    expect(() =>
      listUserRecentEventsSchema.parse({
        offset: -1,
      })
    ).toThrow();
  });
});
