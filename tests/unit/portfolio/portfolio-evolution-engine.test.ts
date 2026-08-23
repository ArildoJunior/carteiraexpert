import { describe, it, expect } from 'vitest';
import { Decimal } from '@/lib/decimal';
import {
  calculatePortfolioEvolutionTimeline,
  serializePortfolioEvolutionSummary,
  getUtcCalendarDaysDiff,
  MAX_QUOTE_AGE_DAYS,
} from '@/modules/portfolio/domain/portfolio-evolution-engine';
import { InsufficientPositionError } from '@/modules/portfolio/domain/errors';
import type { TimelineEvent } from '@/modules/portfolio/domain/position-engine';
import type { Asset } from '@/modules/portfolio/domain/asset.types';
import type { MarketQuote, ExchangeRate } from '@/modules/market-data';

describe('Unitário: Motor Temporal de Evolução Patrimonial (portfolio-evolution-engine)', () => {
  const dummyPortfolioId = '11111111-1111-1111-1111-111111111111';
  const petr4Id = '22222222-2222-2222-2222-222222222222';
  const vale3Id = '33333333-3333-3333-3333-333333333333';
  const aaplId = '44444444-4444-4444-4444-444444444444';

  const petr4Asset: Asset = {
    id: petr4Id,
    ticker: 'PETR4',
    name: 'Petrobras PN',
    assetType: 'stock',
    market: 'B3',
    currency: 'BRL',
    isCustom: false,
    userId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const vale3Asset: Asset = {
    id: vale3Id,
    ticker: 'VALE3',
    name: 'Vale ON',
    assetType: 'stock',
    market: 'B3',
    currency: 'BRL',
    isCustom: false,
    userId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const aaplAsset: Asset = {
    id: aaplId,
    ticker: 'AAPL',
    name: 'Apple Inc',
    assetType: 'stock',
    market: 'NASDAQ',
    currency: 'USD',
    isCustom: false,
    userId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const assetsMap = new Map<string, Asset>([
    [petr4Id, petr4Asset],
    [vale3Id, vale3Asset],
    [aaplId, aaplAsset],
  ]);

  const refDate = new Date('2026-08-18T18:00:00.000Z');

  it('1. deve processar operações anteriores a startDate para formar o estado inicial correto', () => {
    // Compra há 60 dias (fora do período de 1M = 30 dias)
    const eventOld: TimelineEvent = {
      id: 'e1',
      portfolioId: dummyPortfolioId,
      assetId: petr4Id,
      type: 'BUY',
      tradeDate: new Date('2026-06-15T12:00:00.000Z'),
      quantity: '100',
      unitPrice: '30.00',
      fees: '5.00',
    };

    // Cotação na data inicial do período 1M (2026-07-19)
    const quote: MarketQuote = {
      id: 'q1',
      assetId: petr4Id,
      price: new Decimal('35.00'),
      currency: 'BRL',
      quoteDate: new Date('2026-07-19T00:00:00.000Z'),
      source: 'manual',
      delayStatus: 'eod',
      createdBy: '00000000-0000-0000-0000-000000000000',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const summary = calculatePortfolioEvolutionTimeline({
      portfolioId: dummyPortfolioId,
      baseCurrency: 'BRL',
      period: '1M',
      referenceDate: refDate,
      events: [eventOld],
      assetsMap,
      quotes: [quote],
    });

    expect(summary.points.length).toBeGreaterThan(25);
    const firstPoint = summary.points[0];

    // No primeiro ponto de 1M, a carteira já possui as 100 ações compradas há 60 dias
    expect(firstPoint.totalPositionsCount).toBe(1);
    expect(firstPoint.investedCost.toString()).toBe('3005');
    expect(firstPoint.quotedInvestedCost.toString()).toBe('3005');
    expect(firstPoint.marketValue?.toString()).toBe('3500');
    expect(firstPoint.unrealizedPnL?.toString()).toBe('495');
  });

  it('2. deve tratar vendas parciais e totais reduzindo o custo acumulado proporcionalmente', () => {
    const events: TimelineEvent[] = [
      {
        id: 'e1',
        portfolioId: dummyPortfolioId,
        assetId: petr4Id,
        type: 'BUY',
        tradeDate: new Date('2026-08-01T12:00:00.000Z'),
        quantity: '100',
        unitPrice: '30.00',
        fees: '0.00',
      },
      {
        id: 'e2',
        portfolioId: dummyPortfolioId,
        assetId: petr4Id,
        type: 'SELL',
        tradeDate: new Date('2026-08-10T12:00:00.000Z'),
        quantity: '40',
        unitPrice: '35.00',
        fees: '0.00',
      },
    ];

    const quotes: MarketQuote[] = [
      {
        id: 'q1',
        assetId: petr4Id,
        price: new Decimal('36.00'),
        currency: 'BRL',
        quoteDate: new Date('2026-08-01T00:00:00.000Z'),
        source: 'manual',
        delayStatus: 'eod',
        createdBy: '00000000-0000-0000-0000-000000000000',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'q2',
        assetId: petr4Id,
        price: new Decimal('36.00'),
        currency: 'BRL',
        quoteDate: new Date('2026-08-10T00:00:00.000Z'),
        source: 'manual',
        delayStatus: 'eod',
        createdBy: '00000000-0000-0000-0000-000000000000',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const summary = calculatePortfolioEvolutionTimeline({
      portfolioId: dummyPortfolioId,
      baseCurrency: 'BRL',
      period: '1M',
      referenceDate: refDate,
      events,
      assetsMap,
      quotes,
    });

    const pointBeforeSell = summary.points.find((p) => p.dateKey === '2026-08-05')!;
    const pointAfterSell = summary.points.find((p) => p.dateKey === '2026-08-12')!;

    // Antes da venda: 100 ações, custo 3000
    expect(pointBeforeSell.investedCost.toString()).toBe('3000');
    expect(pointBeforeSell.totalPositionsCount).toBe(1);

    // Após a venda de 40: restam 60 ações, custo 1800
    expect(pointAfterSell.investedCost.toString()).toBe('1800');
    expect(pointAfterSell.totalPositionsCount).toBe(1);
    expect(pointAfterSell.marketValue?.toString()).toBe('2160'); // 60 * 36
  });

  it('3. deve aplicar eventos corporativos (SPLIT, GROUPING, BONUS_SHARE, SUBSCRIPTION_EXERCISE)', () => {
    const events: TimelineEvent[] = [
      {
        id: 'e1',
        portfolioId: dummyPortfolioId,
        assetId: petr4Id,
        type: 'BUY',
        tradeDate: new Date('2026-08-01T12:00:00.000Z'),
        quantity: '100',
        unitPrice: '20.00',
        fees: '0.00', // Custo total: 2000
      },
      {
        id: 'e2',
        portfolioId: dummyPortfolioId,
        assetId: petr4Id,
        type: 'SPLIT',
        tradeDate: new Date('2026-08-05T12:00:00.000Z'),
        quantity: '2', // Desdobramento 1:2 -> 200 ações
        unitPrice: '0.00',
        fees: '0.00',
      },
      {
        id: 'e3',
        portfolioId: dummyPortfolioId,
        assetId: petr4Id,
        type: 'BONUS_SHARE',
        tradeDate: new Date('2026-08-10T12:00:00.000Z'),
        quantity: '20', // +20 ações bonificadas a custo fiscal R$ 10
        unitPrice: '10.00',
        fees: '0.00', // Custo adicional: 200 -> Custo total: 2200, 220 ações
      },
    ];

    const quotes: MarketQuote[] = [
      {
        id: 'q1',
        assetId: petr4Id,
        price: new Decimal('15.00'),
        currency: 'BRL',
        quoteDate: new Date('2026-08-01T00:00:00.000Z'),
        source: 'manual',
        delayStatus: 'eod',
        createdBy: '00000000-0000-0000-0000-000000000000',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'q2',
        assetId: petr4Id,
        price: new Decimal('15.00'),
        currency: 'BRL',
        quoteDate: new Date('2026-08-08T00:00:00.000Z'),
        source: 'manual',
        delayStatus: 'eod',
        createdBy: '00000000-0000-0000-0000-000000000000',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const summary = calculatePortfolioEvolutionTimeline({
      portfolioId: dummyPortfolioId,
      baseCurrency: 'BRL',
      period: '1M',
      referenceDate: refDate,
      events,
      assetsMap,
      quotes,
    });

    const pointAfterSplit = summary.points.find((p) => p.dateKey === '2026-08-07')!;
    const pointAfterBonus = summary.points.find((p) => p.dateKey === '2026-08-12')!;

    // Após o Split: custo permanece 2000, 200 ações a R$ 15 = 3000
    expect(pointAfterSplit.investedCost.toString()).toBe('2000');
    expect(pointAfterSplit.marketValue?.toString()).toBe('3000');

    // Após o Bonus: custo vai para 2200, 220 ações a R$ 15 = 3300
    expect(pointAfterBonus.investedCost.toString()).toBe('2200');
    expect(pointAfterBonus.marketValue?.toString()).toBe('3300');
  });

  it('4. cotação futura nunca contamina ponto histórico anterior', () => {
    const events: TimelineEvent[] = [
      {
        id: 'e1',
        portfolioId: dummyPortfolioId,
        assetId: petr4Id,
        type: 'BUY',
        tradeDate: new Date('2026-08-01T12:00:00.000Z'),
        quantity: '100',
        unitPrice: '30.00',
        fees: '0.00',
      },
    ];

    // Cotação lançada no dia 15/08 (futura em relação ao dia 05/08)
    const quoteFuture: MarketQuote = {
      id: 'q1',
      assetId: petr4Id,
      price: new Decimal('40.00'),
      currency: 'BRL',
      quoteDate: new Date('2026-08-15T00:00:00.000Z'),
      source: 'manual',
      delayStatus: 'eod',
      createdBy: '00000000-0000-0000-0000-000000000000',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const summary = calculatePortfolioEvolutionTimeline({
      portfolioId: dummyPortfolioId,
      baseCurrency: 'BRL',
      period: '1M',
      referenceDate: refDate,
      events,
      assetsMap,
      quotes: [quoteFuture],
    });

    const pointOnAug5 = summary.points.find((p) => p.dateKey === '2026-08-05')!;
    const pointOnAug15 = summary.points.find((p) => p.dateKey === '2026-08-15')!;

    // No dia 05/08, a cotação futura do dia 15 NÃO é conhecida -> mercado é null
    expect(pointOnAug5.marketValue).toBeNull();
    expect(pointOnAug5.unquotedPositionsCount).toBe(1);
    expect(pointOnAug5.quotedPositionsCount).toBe(0);

    // No dia 15/08, a cotação passa a ser válida -> mercado 4000
    expect(pointOnAug15.marketValue?.toString()).toBe('4000');
    expect(pointOnAug15.quotedPositionsCount).toBe(1);
  });

  it('5. deve calcular a idade em dias civis UTC e marcar cotações acima de 7 dias como obsoletas', () => {
    expect(
      getUtcCalendarDaysDiff(
        new Date('2026-08-08T23:59:59.999Z'),
        new Date('2026-08-01T00:00:00.000Z')
      )
    ).toBe(7); // Exatamente 7 dias civis

    expect(
      getUtcCalendarDaysDiff(
        new Date('2026-08-09T00:00:00.000Z'),
        new Date('2026-08-01T23:59:59.999Z')
      )
    ).toBe(8); // 8 dias civis

    const events: TimelineEvent[] = [
      {
        id: 'e1',
        portfolioId: dummyPortfolioId,
        assetId: petr4Id,
        type: 'BUY',
        tradeDate: new Date('2026-08-01T12:00:00.000Z'),
        quantity: '100',
        unitPrice: '30.00',
        fees: '0.00',
      },
    ];

    const quote: MarketQuote = {
      id: 'q1',
      assetId: petr4Id,
      price: new Decimal('35.00'),
      currency: 'BRL',
      quoteDate: new Date('2026-08-01T00:00:00.000Z'),
      source: 'manual',
      delayStatus: 'eod',
      createdBy: '00000000-0000-0000-0000-000000000000',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const summary = calculatePortfolioEvolutionTimeline({
      portfolioId: dummyPortfolioId,
      baseCurrency: 'BRL',
      period: '1M',
      referenceDate: refDate,
      events,
      assetsMap,
      quotes: [quote],
    });

    // Dia 08/08: exatamente 7 dias civis -> cotação VÁLIDA
    const pointDay7 = summary.points.find((p) => p.dateKey === '2026-08-08')!;
    expect(pointDay7.quotedPositionsCount).toBe(1);
    expect(pointDay7.stalePositionsCount).toBe(0);
    expect(pointDay7.marketValue?.toString()).toBe('3500');

    // Dia 09/08: 8 dias civis (> 7 dias) -> cotação OBSOLETA
    const pointDay8 = summary.points.find((p) => p.dateKey === '2026-08-09')!;
    expect(pointDay8.quotedPositionsCount).toBe(0);
    expect(pointDay8.stalePositionsCount).toBe(1);
    expect(pointDay8.marketValue).toBeNull(); // Nenhuma cotação válida -> mercado nulo
    expect(pointDay8.hasStaleQuotes).toBe(true);
    expect(pointDay8.hasOnlyStaleQuotes).toBe(true);
  });

  it('6. deve tratar valuation parcial (1 ativo cotado e 1 sem cotação) sem distorcer o PnL', () => {
    const events: TimelineEvent[] = [
      {
        id: 'e1',
        portfolioId: dummyPortfolioId,
        assetId: petr4Id,
        type: 'BUY',
        tradeDate: new Date('2026-08-01T12:00:00.000Z'),
        quantity: '10',
        unitPrice: '30.00',
        fees: '0.00', // Custo PETR4: 300
      },
      {
        id: 'e2',
        portfolioId: dummyPortfolioId,
        assetId: vale3Id,
        type: 'BUY',
        tradeDate: new Date('2026-08-01T12:00:00.000Z'),
        quantity: '10',
        unitPrice: '60.00',
        fees: '0.00', // Custo VALE3: 600
      },
    ];

    // Somente PETR4 possui cotação
    const quotes: MarketQuote[] = [
      {
        id: 'q1',
        assetId: petr4Id,
        price: new Decimal('35.00'),
        currency: 'BRL',
        quoteDate: new Date('2026-08-01T00:00:00.000Z'),
        source: 'manual',
        delayStatus: 'eod',
        createdBy: '00000000-0000-0000-0000-000000000000',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const summary = calculatePortfolioEvolutionTimeline({
      portfolioId: dummyPortfolioId,
      baseCurrency: 'BRL',
      period: '1M',
      referenceDate: new Date('2026-08-05T18:00:00.000Z'),
      events,
      assetsMap,
      quotes,
    });

    const point = summary.points.find((p) => p.dateKey === '2026-08-05')!;

    expect(point.totalPositionsCount).toBe(2);
    expect(point.quotedPositionsCount).toBe(1);
    expect(point.unquotedPositionsCount).toBe(1);
    expect(point.isPartiallyValued).toBe(true);
    expect(point.coveragePercent.toString()).toBe('50');

    // investedCost inclui ambas as posições (300 + 600 = 900)
    expect(point.investedCost.toString()).toBe('900');
    // quotedInvestedCost inclui apenas PETR4 (300)
    expect(point.quotedInvestedCost.toString()).toBe('300');
    // marketValue inclui apenas PETR4 (10 * 35 = 350)
    expect(point.marketValue?.toString()).toBe('350');
    // unrealizedPnL = 350 - 300 = +50
    expect(point.unrealizedPnL?.toString()).toBe('50');
    // unrealizedPnLPercent = (50 / 300) * 100 = 16.66666667%
    expect(point.unrealizedPnLPercent?.toFixed(2)).toBe('16.67');
  });

  it('7. Moedas estrangeiras sem FX: nunca soma custo nominal em BRL sem taxa cambial válida', () => {
    const events: TimelineEvent[] = [
      {
        id: 'e1',
        portfolioId: dummyPortfolioId,
        assetId: aaplId,
        type: 'BUY',
        tradeDate: new Date('2026-08-01T12:00:00.000Z'),
        quantity: '10',
        unitPrice: '150.00', // 1500 USD
        fees: '0.00',
        currency: 'USD',
      },
    ];

    const quotes: MarketQuote[] = [
      {
        id: 'q1',
        assetId: aaplId,
        price: new Decimal('160.00'),
        currency: 'USD',
        quoteDate: new Date('2026-08-01T00:00:00.000Z'),
        source: 'manual',
        delayStatus: 'eod',
        createdBy: '00000000-0000-0000-0000-000000000000',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    // SEM taxas cambiais fornecidas
    const summaryNoFx = calculatePortfolioEvolutionTimeline({
      portfolioId: dummyPortfolioId,
      baseCurrency: 'BRL',
      period: '1M',
      referenceDate: new Date('2026-08-05T18:00:00.000Z'),
      events,
      assetsMap,
      quotes,
      exchangeRates: [],
    });

    const pointNoFx = summaryNoFx.points.find((p) => p.dateKey === '2026-08-05')!;

    // Custo nominal em USD NÃO pode ser somado em BRL
    expect(pointNoFx.investedCost.toString()).toBe('0');
    expect(pointNoFx.quotedInvestedCost.toString()).toBe('0');
    expect(pointNoFx.marketValue).toBeNull();
    expect(pointNoFx.unquotedPositionsCount).toBe(1);
    expect(pointNoFx.quotedPositionsCount).toBe(0);
    expect(pointNoFx.hasOnlyUnquotedPositions).toBe(true);

    // COM taxa cambial válida (USD/BRL = 5.50)
    const summaryWithFx = calculatePortfolioEvolutionTimeline({
      portfolioId: dummyPortfolioId,
      baseCurrency: 'BRL',
      period: '1M',
      referenceDate: new Date('2026-08-05T18:00:00.000Z'),
      events,
      assetsMap,
      quotes,
      exchangeRates: [
        {
          id: 'fx1',
          fromCurrency: 'USD',
          toCurrency: 'BRL',
          rate: new Decimal('5.50'),
          rateDate: new Date('2026-08-01T00:00:00.000Z'),
          source: 'manual',
          delayStatus: 'eod',
          createdBy: '00000000-0000-0000-0000-000000000000',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    });

    const pointWithFx = summaryWithFx.points.find((p) => p.dateKey === '2026-08-05')!;
    expect(pointWithFx.investedCost.toString()).toBe('8250'); // 1500 * 5.50
    expect(pointWithFx.marketValue?.toString()).toBe('8800'); // 1600 * 5.50
    expect(pointWithFx.unrealizedPnL?.toString()).toBe('550');
    expect(pointWithFx.quotedPositionsCount).toBe(1);
  });

  it('8. Moeda: rejeita cotação com CURRENCY_MISMATCH em relação à moeda do ativo', () => {
    const events: TimelineEvent[] = [
      {
        id: 'e1',
        portfolioId: dummyPortfolioId,
        assetId: petr4Id, // Ativo em BRL
        type: 'BUY',
        tradeDate: new Date('2026-08-01T12:00:00.000Z'),
        quantity: '100',
        unitPrice: '30.00',
        fees: '0.00',
        currency: 'BRL',
      },
    ];

    // Cotação com moeda USD para ativo em BRL (incompatibilidade)
    const quoteMismatch: MarketQuote = {
      id: 'q1',
      assetId: petr4Id,
      price: new Decimal('6.00'),
      currency: 'USD', // Mismatch!
      quoteDate: new Date('2026-08-01T00:00:00.000Z'),
      source: 'manual',
      delayStatus: 'eod',
      createdBy: '00000000-0000-0000-0000-000000000000',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const summary = calculatePortfolioEvolutionTimeline({
      portfolioId: dummyPortfolioId,
      baseCurrency: 'BRL',
      period: '1M',
      referenceDate: new Date('2026-08-05T18:00:00.000Z'),
      events,
      assetsMap,
      quotes: [quoteMismatch],
    });

    const point = summary.points.find((p) => p.dateKey === '2026-08-05')!;

    // A cotação incompatível deve ser rejeitada, mantendo o ativo como sem cotação
    expect(point.quotedPositionsCount).toBe(0);
    expect(point.unquotedPositionsCount).toBe(1);
    expect(point.marketValue).toBeNull();
    expect(point.hasOnlyUnquotedPositions).toBe(true);
  });

  it('9. Contadores: garante que quoted + stale + unquoted === totalPositionsCount em todas as datas', () => {
    const events: TimelineEvent[] = [
      {
        id: 'e1',
        portfolioId: dummyPortfolioId,
        assetId: petr4Id, // Cotado
        type: 'BUY',
        tradeDate: new Date('2026-08-01T12:00:00.000Z'),
        quantity: '10',
        unitPrice: '30.00',
        fees: '0.00',
      },
      {
        id: 'e2',
        portfolioId: dummyPortfolioId,
        assetId: vale3Id, // Cotação obsoleta (>7d)
        type: 'BUY',
        tradeDate: new Date('2026-08-01T12:00:00.000Z'),
        quantity: '10',
        unitPrice: '60.00',
        fees: '0.00',
      },
      {
        id: 'e3',
        portfolioId: dummyPortfolioId,
        assetId: aaplId, // Sem cotação
        type: 'BUY',
        tradeDate: new Date('2026-08-01T12:00:00.000Z'),
        quantity: '10',
        unitPrice: '150.00',
        fees: '0.00',
        currency: 'USD',
      },
    ];

    const quotes: MarketQuote[] = [
      // PETR4 com cotação recente (10/08)
      {
        id: 'q1',
        assetId: petr4Id,
        price: new Decimal('35.00'),
        currency: 'BRL',
        quoteDate: new Date('2026-08-10T00:00:00.000Z'),
        source: 'manual',
        delayStatus: 'eod',
        createdBy: '00000000-0000-0000-0000-000000000000',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      // VALE3 com cotação antiga (01/08 - avaliada em 15/08 = 14 dias defasada)
      {
        id: 'q2',
        assetId: vale3Id,
        price: new Decimal('65.00'),
        currency: 'BRL',
        quoteDate: new Date('2026-08-01T00:00:00.000Z'),
        source: 'manual',
        delayStatus: 'eod',
        createdBy: '00000000-0000-0000-0000-000000000000',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const summary = calculatePortfolioEvolutionTimeline({
      portfolioId: dummyPortfolioId,
      baseCurrency: 'BRL',
      period: '1M',
      referenceDate: new Date('2026-08-15T18:00:00.000Z'),
      events,
      assetsMap,
      quotes,
    });

    const point = summary.points.find((p) => p.dateKey === '2026-08-15')!;

    expect(point.totalPositionsCount).toBe(3);
    expect(point.quotedPositionsCount).toBe(1); // PETR4
    expect(point.stalePositionsCount).toBe(1); // VALE3
    expect(point.unquotedPositionsCount).toBe(1); // AAPL (sem cotação e sem FX)

    // Invariante estrita
    expect(
      point.quotedPositionsCount +
        point.stalePositionsCount +
        point.unquotedPositionsCount
    ).toBe(point.totalPositionsCount);
  });

  it('10. Período ALL: reporta truncamento explícito quando histórico excede o limite máximo configurado', () => {
    // Evento há 15 anos (5475 dias atrás)
    const eventVeryOld: TimelineEvent = {
      id: 'e1',
      portfolioId: dummyPortfolioId,
      assetId: petr4Id,
      type: 'BUY',
      tradeDate: new Date('2011-08-01T12:00:00.000Z'),
      quantity: '100',
      unitPrice: '10.00',
      fees: '0.00',
    };

    const summary = calculatePortfolioEvolutionTimeline({
      portfolioId: dummyPortfolioId,
      baseCurrency: 'BRL',
      period: 'ALL',
      referenceDate: refDate,
      events: [eventVeryOld],
      assetsMap,
      maxAllPeriodDays: 3650, // 10 anos
    });

    // Período foi truncado de forma explícita com aviso e metadados
    expect(summary.isPeriodTruncated).toBe(true);
    expect(summary.truncatedHistoryStartDate).toBeDefined();

    const serialized = serializePortfolioEvolutionSummary(summary);
    expect(serialized.isPeriodTruncated).toBe(true);
    expect(serialized.truncatedHistoryStartDate).toContain('2011-08-01');
  });

  it('11. Conversão Cambial Genérica: Carteira em USD com ativo em BRL (BRL->USD)', () => {
    // Carteira com baseCurrency = 'USD' e ativo PETR4 em BRL
    const events: TimelineEvent[] = [
      {
        id: 'e1',
        portfolioId: dummyPortfolioId,
        assetId: petr4Id,
        type: 'BUY',
        tradeDate: new Date('2026-08-01T12:00:00.000Z'),
        quantity: '100',
        unitPrice: '30.00', // R$ 3.000,00
        fees: '0.00',
        currency: 'BRL',
      },
    ];

    const quotes: MarketQuote[] = [
      {
        id: 'q1',
        assetId: petr4Id,
        price: new Decimal('35.00'), // R$ 35,00 por ação -> R$ 3.500,00
        currency: 'BRL',
        quoteDate: new Date('2026-08-01T00:00:00.000Z'),
        source: 'manual',
        delayStatus: 'eod',
        createdBy: '00000000-0000-0000-0000-000000000000',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    // Taxa BRL -> USD = 0.20
    const exchangeRates: ExchangeRate[] = [
      {
        id: 'fx1',
        fromCurrency: 'BRL',
        toCurrency: 'USD',
        rate: new Decimal('0.20'),
        rateDate: new Date('2026-08-01T00:00:00.000Z'),
        source: 'manual',
        delayStatus: 'eod',
        createdBy: '00000000-0000-0000-0000-000000000000',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const summary = calculatePortfolioEvolutionTimeline({
      portfolioId: dummyPortfolioId,
      baseCurrency: 'USD',
      period: '1M',
      referenceDate: new Date('2026-08-05T18:00:00.000Z'),
      events,
      assetsMap,
      quotes,
      exchangeRates,
    });

    const point = summary.points.find((p) => p.dateKey === '2026-08-05')!;

    // Custo em USD: 3000 * 0.20 = 600 USD
    expect(point.investedCost.toString()).toBe('600');
    // Mercado em USD: 3500 * 0.20 = 700 USD
    expect(point.marketValue?.toString()).toBe('700');
    // PnL em USD: 700 - 600 = 100 USD
    expect(point.unrealizedPnL?.toString()).toBe('100');
    expect(point.quotedPositionsCount).toBe(1);
    expect(summary.baseCurrency).toBe('USD');
  });

  it('12. Indexação Composta de FX: não confunde pares com mesma fromCurrency (USD_BRL vs USD_EUR)', () => {
    // Carteira em BRL com ativo AAPL em USD
    const events: TimelineEvent[] = [
      {
        id: 'e1',
        portfolioId: dummyPortfolioId,
        assetId: aaplId,
        type: 'BUY',
        tradeDate: new Date('2026-08-01T12:00:00.000Z'),
        quantity: '10',
        unitPrice: '150.00', // 1500 USD
        fees: '0.00',
        currency: 'USD',
      },
    ];

    const quotes: MarketQuote[] = [
      {
        id: 'q1',
        assetId: aaplId,
        price: new Decimal('160.00'), // 1600 USD
        currency: 'USD',
        quoteDate: new Date('2026-08-01T00:00:00.000Z'),
        source: 'manual',
        delayStatus: 'eod',
        createdBy: '00000000-0000-0000-0000-000000000000',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    // Contém AMBOS os pares: USD->EUR e USD->BRL
    const exchangeRates: ExchangeRate[] = [
      {
        id: 'fx-eur',
        fromCurrency: 'USD',
        toCurrency: 'EUR',
        rate: new Decimal('0.92'),
        rateDate: new Date('2026-08-01T00:00:00.000Z'),
        source: 'manual',
        delayStatus: 'eod',
        createdBy: '00000000-0000-0000-0000-000000000000',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'fx-brl',
        fromCurrency: 'USD',
        toCurrency: 'BRL',
        rate: new Decimal('5.50'),
        rateDate: new Date('2026-08-01T00:00:00.000Z'),
        source: 'manual',
        delayStatus: 'eod',
        createdBy: '00000000-0000-0000-0000-000000000000',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const summary = calculatePortfolioEvolutionTimeline({
      portfolioId: dummyPortfolioId,
      baseCurrency: 'BRL',
      period: '1M',
      referenceDate: new Date('2026-08-05T18:00:00.000Z'),
      events,
      assetsMap,
      quotes,
      exchangeRates,
    });

    const point = summary.points.find((p) => p.dateKey === '2026-08-05')!;

    // Deve selecionar estritamente USD->BRL (5.50), nunca USD->EUR (0.92)
    expect(point.investedCost.toString()).toBe('8250'); // 1500 * 5.50
    expect(point.marketValue?.toString()).toBe('8800'); // 1600 * 5.50
    expect(point.quotedPositionsCount).toBe(1);
  });

  it('13. Validação de período: rejeita período inválido lançando erro de domínio controlado', () => {
    expect(() =>
      calculatePortfolioEvolutionTimeline({
        portfolioId: dummyPortfolioId,
        baseCurrency: 'BRL',
        period: '10Y' as any,
        referenceDate: refDate,
        events: [],
      })
    ).toThrow();
  });

  it('14. Validação de referenceDate: aceita data passada e atual, e rejeita data futura', () => {
    // 1. Data passada -> Sucesso
    const summaryPast = calculatePortfolioEvolutionTimeline({
      portfolioId: dummyPortfolioId,
      baseCurrency: 'BRL',
      period: '1M',
      referenceDate: new Date('2026-01-01T12:00:00.000Z'),
      events: [],
    });
    expect(summaryPast.points.length).toBeGreaterThan(0);

    // 2. Data atual -> Sucesso
    const summaryToday = calculatePortfolioEvolutionTimeline({
      portfolioId: dummyPortfolioId,
      baseCurrency: 'BRL',
      period: '1M',
      referenceDate: new Date(),
      events: [],
    });
    expect(summaryToday.points.length).toBeGreaterThan(0);

    // 3. Data futura -> Rejeição estrita com mensagem clara
    const futureDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    expect(() =>
      calculatePortfolioEvolutionTimeline({
        portfolioId: dummyPortfolioId,
        baseCurrency: 'BRL',
        period: '1M',
        referenceDate: futureDate,
        events: [],
      })
    ).toThrow('A data de referência não pode estar no futuro.');
  });

  it('15. Granularidade: discrimina fxMissing, fxStale, currencyMismatch e staleQuotes separadamente', () => {
    const events: TimelineEvent[] = [
      {
        id: 'e1',
        portfolioId: dummyPortfolioId,
        assetId: aaplId, // USD sem FX
        type: 'BUY',
        tradeDate: new Date('2026-08-01T12:00:00.000Z'),
        quantity: '10',
        unitPrice: '150.00',
        fees: '0.00',
        currency: 'USD',
      },
      {
        id: 'e2',
        portfolioId: dummyPortfolioId,
        assetId: petr4Id, // BRL com cotação em USD (CURRENCY_MISMATCH)
        type: 'BUY',
        tradeDate: new Date('2026-08-01T12:00:00.000Z'),
        quantity: '10',
        unitPrice: '30.00',
        fees: '0.00',
        currency: 'BRL',
      },
    ];

    const quotes: MarketQuote[] = [
      {
        id: 'q1',
        assetId: aaplId,
        price: new Decimal('150.00'),
        currency: 'USD',
        quoteDate: new Date('2026-08-01T00:00:00.000Z'),
        source: 'manual',
        delayStatus: 'eod',
        createdBy: '00000000-0000-0000-0000-000000000000',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: 'q2',
        assetId: petr4Id,
        price: new Decimal('6.00'),
        currency: 'USD', // Mismatch!
        quoteDate: new Date('2026-08-01T00:00:00.000Z'),
        source: 'manual',
        delayStatus: 'eod',
        createdBy: '00000000-0000-0000-0000-000000000000',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const summary = calculatePortfolioEvolutionTimeline({
      portfolioId: dummyPortfolioId,
      baseCurrency: 'BRL',
      period: '1M',
      referenceDate: new Date('2026-08-05T18:00:00.000Z'),
      events,
      assetsMap,
      quotes,
      exchangeRates: [], // Sem FX para USD->BRL
    });

    const point = summary.points.find((p) => p.dateKey === '2026-08-05')!;

    expect(point.totalPositionsCount).toBe(2);
    expect(point.fxMissingPositionsCount).toBe(1); // AAPL
    expect(point.currencyMismatchPositionsCount).toBe(1); // PETR4
    expect(point.quotedPositionsCount).toBe(0);
    expect(point.unquotedPositionsCount).toBe(2);
    expect(point.hasMissingFx).toBe(true);

    // Invariante
    expect(
      point.quotedPositionsCount +
        point.stalePositionsCount +
        point.unquotedPositionsCount
    ).toBe(point.totalPositionsCount);
  });

  it('16. Separação: cotação válida com FX obsoleto NÃO marca hasStaleQuotesInPeriod', () => {
    const events: TimelineEvent[] = [
      {
        id: 'e1',
        portfolioId: dummyPortfolioId,
        assetId: aaplId,
        type: 'BUY',
        tradeDate: new Date('2026-08-01T12:00:00.000Z'),
        quantity: '10',
        unitPrice: '150.00',
        fees: '0.00',
        currency: 'USD',
      },
    ];

    const quotes: MarketQuote[] = [
      {
        id: 'q1',
        assetId: aaplId,
        price: new Decimal('160.00'),
        currency: 'USD',
        quoteDate: new Date('2026-08-05T00:00:00.000Z'), // Cotação recente válida (dia 05)
        source: 'manual',
        delayStatus: 'eod',
        createdBy: '00000000-0000-0000-0000-000000000000',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    // Taxa USD->BRL antiga (01/07 em relação a 05/08 = 35 dias defasada)
    const exchangeRates: ExchangeRate[] = [
      {
        id: 'fx1',
        fromCurrency: 'USD',
        toCurrency: 'BRL',
        rate: new Decimal('5.50'),
        rateDate: new Date('2026-07-01T00:00:00.000Z'), // Obsoleta (>7d)
        source: 'manual',
        delayStatus: 'eod',
        createdBy: '00000000-0000-0000-0000-000000000000',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const summary = calculatePortfolioEvolutionTimeline({
      portfolioId: dummyPortfolioId,
      baseCurrency: 'BRL',
      period: '1M',
      referenceDate: new Date('2026-08-05T18:00:00.000Z'),
      events,
      assetsMap,
      quotes,
      exchangeRates,
    });

    const point = summary.points.find((p) => p.dateKey === '2026-08-05')!;

    expect(point.totalPositionsCount).toBe(1);
    expect(point.quotedPositionsCount).toBe(0);
    expect(point.stalePositionsCount).toBe(1);
    expect(point.staleQuotePositionsCount).toBe(0); // Cotação NÃO está obsoleta
    expect(point.fxStalePositionsCount).toBe(1); // FX está obsoleto
    expect(point.hasStaleQuotes).toBe(false);
    expect(point.hasStaleFx).toBe(true);
    expect(point.hasOnlyStaleFx).toBe(true);
    expect(point.hasOnlyStaleQuotes).toBe(false);

    // Resumo: hasStaleQuotesInPeriod deve ser FALSE e hasStaleFxInPeriod deve ser TRUE
    expect(summary.hasStaleQuotesInPeriod).toBe(false);
    expect(summary.hasStaleFxInPeriod).toBe(true);
    expect(summary.hasOnlyStaleFx).toBe(true);
  });

  it('17. Causas mistas: posição estrangeira sem FX e posição BRL sem cotação', () => {
    const events: TimelineEvent[] = [
      {
        id: 'e1',
        portfolioId: dummyPortfolioId,
        assetId: aaplId, // USD sem FX
        type: 'BUY',
        tradeDate: new Date('2026-08-01T12:00:00.000Z'),
        quantity: '10',
        unitPrice: '150.00',
        fees: '0.00',
        currency: 'USD',
      },
      {
        id: 'e2',
        portfolioId: dummyPortfolioId,
        assetId: petr4Id, // BRL sem cotação
        type: 'BUY',
        tradeDate: new Date('2026-08-01T12:00:00.000Z'),
        quantity: '10',
        unitPrice: '30.00',
        fees: '0.00',
        currency: 'BRL',
      },
    ];

    const summary = calculatePortfolioEvolutionTimeline({
      portfolioId: dummyPortfolioId,
      baseCurrency: 'BRL',
      period: '1M',
      referenceDate: new Date('2026-08-05T18:00:00.000Z'),
      events,
      assetsMap,
      quotes: [], // Sem cotações
      exchangeRates: [], // Sem FX
    });

    const point = summary.points.find((p) => p.dateKey === '2026-08-05')!;

    expect(point.totalPositionsCount).toBe(2);
    expect(point.unquotedPositionsCount).toBe(2);
    expect(point.fxMissingPositionsCount).toBe(1); // Somente AAPL precisa de FX
    expect(point.hasOnlyMissingFx).toBe(false); // Nem todas as posições precisam de FX (PETR4 é BRL)
    expect(point.hasMissingFx).toBe(true);
    expect(summary.hasMissingFxInPeriod).toBe(true);
    expect(summary.hasOnlyMissingFx).toBe(false);

    // Invariante
    expect(
      point.quotedPositionsCount +
        point.stalePositionsCount +
        point.unquotedPositionsCount
    ).toBe(point.totalPositionsCount);
  });

  it('18. Isolamento de dados: cotações e pares cambiais irrelevantes não alteram o resultado', () => {
    const events: TimelineEvent[] = [
      {
        id: 'e1',
        portfolioId: dummyPortfolioId,
        assetId: petr4Id,
        type: 'BUY',
        tradeDate: new Date('2026-08-01T12:00:00.000Z'),
        quantity: '100',
        unitPrice: '30.00',
        fees: '0.00',
        currency: 'BRL',
      },
    ];

    const quotes: MarketQuote[] = [
      {
        id: 'q1',
        assetId: petr4Id,
        price: new Decimal('35.00'),
        currency: 'BRL',
        quoteDate: new Date('2026-08-01T00:00:00.000Z'),
        source: 'manual',
        delayStatus: 'eod',
        createdBy: '00000000-0000-0000-0000-000000000000',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      // Cotação de ativo irrelevante (não está na carteira)
      {
        id: 'q-irrelevant',
        assetId: '99999999-9999-9999-9999-999999999999',
        price: new Decimal('999.00'),
        currency: 'BRL',
        quoteDate: new Date('2026-08-01T00:00:00.000Z'),
        source: 'manual',
        delayStatus: 'eod',
        createdBy: '00000000-0000-0000-0000-000000000000',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    // Taxas cambiais de pares irrelevantes
    const exchangeRates: ExchangeRate[] = [
      {
        id: 'fx-eur-gbp',
        fromCurrency: 'EUR',
        toCurrency: 'GBP',
        rate: new Decimal('0.85'),
        rateDate: new Date('2026-08-01T00:00:00.000Z'),
        source: 'manual',
        delayStatus: 'eod',
        createdBy: '00000000-0000-0000-0000-000000000000',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const summary = calculatePortfolioEvolutionTimeline({
      portfolioId: dummyPortfolioId,
      baseCurrency: 'BRL',
      period: '1M',
      referenceDate: new Date('2026-08-05T18:00:00.000Z'),
      events,
      assetsMap,
      quotes,
      exchangeRates,
    });

    const point = summary.points.find((p) => p.dateKey === '2026-08-05')!;
    expect(point.investedCost.toString()).toBe('3000');
    expect(point.marketValue?.toString()).toBe('3500');
    expect(point.totalPositionsCount).toBe(1);
    expect(point.quotedPositionsCount).toBe(1);
  });

  it('19. CURRENCY_MISMATCH: cotação compatível anterior válida (12/08) NÃO é sobrescrita por cotação incompatível posterior (14/08)', () => {
    const events: TimelineEvent[] = [
      {
        id: 'e1',
        portfolioId: dummyPortfolioId,
        assetId: petr4Id, // Ativo em BRL
        type: 'BUY',
        tradeDate: new Date('2026-08-01T12:00:00.000Z'),
        quantity: '100',
        unitPrice: '30.00', // Custo R$ 3.000,00
        fees: '0.00',
        currency: 'BRL',
      },
    ];

    const quotes: MarketQuote[] = [
      // 1. Cotação BRL válida em 12/08 a R$ 38,00
      {
        id: 'q-brl',
        assetId: petr4Id,
        price: new Decimal('38.00'),
        currency: 'BRL',
        quoteDate: new Date('2026-08-12T12:00:00.000Z'),
        source: 'manual',
        delayStatus: 'eod',
        createdBy: '00000000-0000-0000-0000-000000000000',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      // 2. Cotação USD incompatível mais recente em 14/08 a $ 7.50
      {
        id: 'q-usd-mismatch',
        assetId: petr4Id,
        price: new Decimal('7.50'),
        currency: 'USD', // Mismatch!
        quoteDate: new Date('2026-08-14T12:00:00.000Z'),
        source: 'manual',
        delayStatus: 'eod',
        createdBy: '00000000-0000-0000-0000-000000000000',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const summary = calculatePortfolioEvolutionTimeline({
      portfolioId: dummyPortfolioId,
      baseCurrency: 'BRL',
      period: '1M',
      referenceDate: new Date('2026-08-15T18:00:00.000Z'), // 3 dias após 12/08 (dentro dos 7 dias)
      events,
      assetsMap,
      quotes,
    });

    const p15 = summary.points.find((p) => p.dateKey === '2026-08-15')!;

    // A cotação em BRL de 12/08 deve ser utilizada para valuation (100 * 38 = 3800 BRL)
    expect(p15.quotedPositionsCount).toBe(1);
    expect(p15.unquotedPositionsCount).toBe(0);
    expect(p15.stalePositionsCount).toBe(0);
    expect(p15.investedCost.toString()).toBe('3000');
    expect(p15.quotedInvestedCost.toString()).toBe('3000');
    expect(p15.marketValue?.toString()).toBe('3800');
    expect(p15.unrealizedPnL?.toString()).toBe('800');

    // A incompatibilidade da cotação em USD deve ser diagnosticada em currencyMismatchPositionsCount
    expect(p15.currencyMismatchPositionsCount).toBe(1);

    // O preço incompatível de 7.50 USD NUNCA entra em marketValue
    expect(p15.marketValue?.toString()).not.toBe('750');
  });

  it('20. CURRENCY_MISMATCH: cotação incompatível anterior (10/08) seguida de cotação compatível posterior (12/08)', () => {
    const events: TimelineEvent[] = [
      {
        id: 'e1',
        portfolioId: dummyPortfolioId,
        assetId: petr4Id,
        type: 'BUY',
        tradeDate: new Date('2026-08-01T12:00:00.000Z'),
        quantity: '100',
        unitPrice: '30.00',
        fees: '0.00',
        currency: 'BRL',
      },
    ];

    const quotes: MarketQuote[] = [
      // 1. Cotação USD incompatível em 10/08
      {
        id: 'q-usd-old',
        assetId: petr4Id,
        price: new Decimal('7.50'),
        currency: 'USD',
        quoteDate: new Date('2026-08-10T12:00:00.000Z'),
        source: 'manual',
        delayStatus: 'eod',
        createdBy: '00000000-0000-0000-0000-000000000000',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      // 2. Cotação BRL compatível posterior em 12/08
      {
        id: 'q-brl-new',
        assetId: petr4Id,
        price: new Decimal('38.00'),
        currency: 'BRL',
        quoteDate: new Date('2026-08-12T12:00:00.000Z'),
        source: 'manual',
        delayStatus: 'eod',
        createdBy: '00000000-0000-0000-0000-000000000000',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];

    const summary = calculatePortfolioEvolutionTimeline({
      portfolioId: dummyPortfolioId,
      baseCurrency: 'BRL',
      period: '1M',
      referenceDate: new Date('2026-08-15T18:00:00.000Z'),
      events,
      assetsMap,
      quotes,
    });

    const p15 = summary.points.find((p) => p.dateKey === '2026-08-15')!;

    expect(p15.quotedPositionsCount).toBe(1);
    expect(p15.marketValue?.toString()).toBe('3800');
    expect(p15.currencyMismatchPositionsCount).toBe(1);
  });

  it('21. MANUAL_ADJUSTMENT OUT: deve lançar InsufficientPositionError quando quantidade excede saldo disponível (não mascara com Decimal.min)', () => {
    // 10 unidades em carteira
    const events: TimelineEvent[] = [
      {
        id: 'e1',
        portfolioId: dummyPortfolioId,
        assetId: petr4Id,
        type: 'BUY',
        tradeDate: new Date('2026-08-01T12:00:00.000Z'),
        quantity: '10',
        unitPrice: '30.00',
        fees: '0.00',
        currency: 'BRL',
      },
      // Ajuste OUT de 20 unidades (saldo disponível é apenas 10!)
      {
        id: 'e2',
        portfolioId: dummyPortfolioId,
        assetId: petr4Id,
        type: 'MANUAL_ADJUSTMENT',
        direction: 'OUT',
        tradeDate: new Date('2026-08-05T12:00:00.000Z'),
        quantity: '20',
        unitPrice: '0.00',
        fees: '0.00',
        currency: 'BRL',
      },
    ];

    let thrownError: unknown;
    try {
      calculatePortfolioEvolutionTimeline({
        portfolioId: dummyPortfolioId,
        baseCurrency: 'BRL',
        period: '1M',
        referenceDate: new Date('2026-08-15T18:00:00.000Z'),
        events,
        assetsMap,
        quotes: [],
      });
    } catch (err) {
      thrownError = err;
    }

    // 1. Verifica que a exceção é especificamente InsufficientPositionError
    expect(thrownError).toBeInstanceOf(InsufficientPositionError);
    const err = thrownError as InsufficientPositionError;
    // 2. Verifica que availableQuantity e requestedQuantity estão perfeitamente corretos
    expect(err.availableQuantity).toBe('10');
    expect(err.requestedQuantity).toBe('20');
    expect(err.assetId).toBe(petr4Id);
    expect(err.message).toContain('Posição insuficiente para ajuste de saída');
  });

  it('22. MANUAL_ADJUSTMENT OUT válido: deve reduzir quantidade e custo proporcionalmente no replay temporal', () => {
    const events: TimelineEvent[] = [
      // 100 ações a R$ 10.00 = R$ 1000.00
      {
        id: 'e1',
        portfolioId: dummyPortfolioId,
        assetId: petr4Id,
        type: 'BUY',
        tradeDate: new Date('2026-08-01T12:00:00.000Z'),
        quantity: '100',
        unitPrice: '10.00',
        fees: '0.00',
        currency: 'BRL',
      },
      // Ajuste OUT de 30 ações
      {
        id: 'e2',
        portfolioId: dummyPortfolioId,
        assetId: petr4Id,
        type: 'MANUAL_ADJUSTMENT',
        direction: 'OUT',
        tradeDate: new Date('2026-08-05T12:00:00.000Z'),
        quantity: '30',
        unitPrice: '0.00',
        fees: '0.00',
        currency: 'BRL',
      },
    ];

    const quote: MarketQuote = {
      id: 'q1',
      assetId: petr4Id,
      price: new Decimal('15.00'),
      currency: 'BRL',
      quoteDate: new Date('2026-08-10T12:00:00.000Z'),
      source: 'manual',
      delayStatus: 'eod',
      createdBy: '00000000-0000-0000-0000-000000000000',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const summary = calculatePortfolioEvolutionTimeline({
      portfolioId: dummyPortfolioId,
      baseCurrency: 'BRL',
      period: '1M',
      referenceDate: new Date('2026-08-15T18:00:00.000Z'),
      events,
      assetsMap,
      quotes: [quote],
    });

    const p10 = summary.points.find((p) => p.dateKey === '2026-08-10')!;

    // 70 cotas restantes * R$ 10 (CM) = R$ 700 de custo investido
    expect(p10.investedCost.toString()).toBe('700');
    // 70 cotas * R$ 15 (cotação) = R$ 1050 de valor de mercado
    expect(p10.marketValue?.toString()).toBe('1050');
    // PnL não realizado = 1050 - 700 = +350
    expect(p10.unrealizedPnL?.toString()).toBe('350');
  });

  it('23. Consistência entre position-engine e portfolio-evolution-engine com ajustes intermediários na linha do tempo', () => {
    const events: TimelineEvent[] = [
      // 01/08: Compra de 100 a R$ 10 (custo 1000)
      {
        id: 'e1',
        portfolioId: dummyPortfolioId,
        assetId: petr4Id,
        type: 'BUY',
        tradeDate: new Date('2026-08-01T12:00:00.000Z'),
        quantity: '100',
        unitPrice: '10.00',
        fees: '0.00',
        currency: 'BRL',
      },
      // 05/08: Ajuste IN de 50 a R$ 20 + taxas 10 (custo delta = 1010 -> total 2010, CM = 13.40)
      {
        id: 'e2',
        portfolioId: dummyPortfolioId,
        assetId: petr4Id,
        type: 'MANUAL_ADJUSTMENT',
        direction: 'IN',
        tradeDate: new Date('2026-08-05T12:00:00.000Z'),
        quantity: '50',
        unitPrice: '20.00',
        fees: '10.00',
        currency: 'BRL',
      },
      // 08/08: Ajuste OUT de 30 cotas (custo removido = 30 * 13.40 = 402 -> custo restante 1608, 120 cotas)
      {
        id: 'e3',
        portfolioId: dummyPortfolioId,
        assetId: petr4Id,
        type: 'MANUAL_ADJUSTMENT',
        direction: 'OUT',
        tradeDate: new Date('2026-08-08T12:00:00.000Z'),
        quantity: '30',
        unitPrice: '0.00',
        fees: '0.00',
        currency: 'BRL',
      },
      // 12/08: Venda de 20 cotas
      {
        id: 'e4',
        portfolioId: dummyPortfolioId,
        assetId: petr4Id,
        type: 'SELL',
        tradeDate: new Date('2026-08-12T12:00:00.000Z'),
        quantity: '20',
        unitPrice: '25.00',
        fees: '0.00',
        currency: 'BRL',
      },
    ];

    const summary = calculatePortfolioEvolutionTimeline({
      portfolioId: dummyPortfolioId,
      baseCurrency: 'BRL',
      period: '1M',
      referenceDate: new Date('2026-08-15T18:00:00.000Z'),
      events,
      assetsMap,
      quotes: [],
    });

    const p15 = summary.points.find((p) => p.dateKey === '2026-08-15')!;

    // Quantidade final esperada: 100 + 50 - 30 - 20 = 100 cotas
    // Custo médio = 13.40 -> Custo total final = 100 * 13.40 = 1340
    expect(p15.investedCost.toString()).toBe('1340');
  });

  it('24. MANUAL_ADJUSTMENT com direction ausente ou inválida: deve falhar explicitamente no replay temporal', () => {
    const invalidEventsNull: TimelineEvent[] = [
      {
        id: 'e1',
        portfolioId: dummyPortfolioId,
        assetId: petr4Id,
        type: 'MANUAL_ADJUSTMENT',
        direction: null as any,
        tradeDate: new Date('2026-08-05T12:00:00.000Z'),
        quantity: '10',
        unitPrice: '10.00',
        fees: '0.00',
        currency: 'BRL',
      },
    ];

    expect(() =>
      calculatePortfolioEvolutionTimeline({
        portfolioId: dummyPortfolioId,
        baseCurrency: 'BRL',
        period: '1M',
        referenceDate: new Date('2026-08-15T18:00:00.000Z'),
        events: invalidEventsNull,
        assetsMap,
        quotes: [],
      })
    ).toThrowError(/direção deve ser "IN" ou "OUT"/);

    const invalidEventsInvalid: TimelineEvent[] = [
      {
        id: 'e2',
        portfolioId: dummyPortfolioId,
        assetId: petr4Id,
        type: 'MANUAL_ADJUSTMENT',
        direction: 'INVALID' as any,
        tradeDate: new Date('2026-08-05T12:00:00.000Z'),
        quantity: '10',
        unitPrice: '10.00',
        fees: '0.00',
        currency: 'BRL',
      },
    ];

    expect(() =>
      calculatePortfolioEvolutionTimeline({
        portfolioId: dummyPortfolioId,
        baseCurrency: 'BRL',
        period: '1M',
        referenceDate: new Date('2026-08-15T18:00:00.000Z'),
        events: invalidEventsInvalid,
        assetsMap,
        quotes: [],
      })
    ).toThrowError(/direção deve ser "IN" ou "OUT"/);
  });
});



