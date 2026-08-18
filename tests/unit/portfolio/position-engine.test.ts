import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import {
  calculateAssetPosition,
  calculatePortfolioPositionsSummary,
  validateTimelineConsistency,
  sortEventsChronologically,
  type TimelineEvent,
} from '../../../src/modules/portfolio/domain/position-engine';
import {
  InsufficientPositionError,
  RetroactiveInconsistencyError,
} from '../../../src/modules/portfolio/domain/errors';
import type { Asset } from '../../../src/modules/portfolio/domain/asset.types';

describe('Unidade: Motor de Posição, Custo Médio e PnL (Domain Engine)', () => {
  const assetId = 'asset-uuid-1';
  const portfolioId = 'portfolio-uuid-1';

  const mockAsset: Asset = {
    id: assetId,
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

  it('deve calcular posição para compra única simples', () => {
    const events: TimelineEvent[] = [
      {
        id: 'ev-1',
        portfolioId,
        assetId,
        type: 'BUY',
        tradeDate: new Date('2026-01-10T12:00:00Z'),
        quantity: '100',
        unitPrice: '25.00',
        fees: '0.00',
      },
    ];

    const { position, realizedTrades } = calculateAssetPosition(assetId, events, mockAsset);

    expect(position.quantity.toString()).toBe('100');
    expect(position.averagePrice.toString()).toBe('25');
    expect(position.totalCost.toString()).toBe('2500');
    expect(position.totalFees.toString()).toBe('0');
    expect(position.totalRealizedPnL.toString()).toBe('0');
    expect(realizedTrades).toHaveLength(0);
  });

  it('deve calcular custo médio ponderado para múltiplas compras', () => {
    const events: TimelineEvent[] = [
      {
        id: 'ev-1',
        portfolioId,
        assetId,
        type: 'BUY',
        tradeDate: new Date('2026-01-10T12:00:00Z'),
        quantity: '100',
        unitPrice: '20.00',
        fees: '0.00',
      },
      {
        id: 'ev-2',
        portfolioId,
        assetId,
        type: 'BUY',
        tradeDate: new Date('2026-01-15T12:00:00Z'),
        quantity: '100',
        unitPrice: '40.00',
        fees: '0.00',
      },
    ];

    const { position } = calculateAssetPosition(assetId, events, mockAsset);

    // Total: 200 ações a (2000 + 4000) = 6000 / 200 = 30.00
    expect(position.quantity.toString()).toBe('200');
    expect(position.averagePrice.toString()).toBe('30');
    expect(position.totalCost.toString()).toBe('6000');
  });

  it('deve incluir taxas no custo de aquisição da compra', () => {
    const events: TimelineEvent[] = [
      {
        id: 'ev-1',
        portfolioId,
        assetId,
        type: 'BUY',
        tradeDate: new Date('2026-01-10T12:00:00Z'),
        quantity: '100',
        unitPrice: '25.00',
        fees: '10.00', // Custo total = 2500 + 10 = 2510 -> CM = 25.10
      },
    ];

    const { position } = calculateAssetPosition(assetId, events, mockAsset);

    expect(position.quantity.toString()).toBe('100');
    expect(position.totalCost.toString()).toBe('2510');
    expect(position.averagePrice.toString()).toBe('25.1');
    expect(position.totalFees.toString()).toBe('10');
  });

  it('deve calcular venda parcial mantendo o custo médio unitário e apurando PnL realizado', () => {
    const events: TimelineEvent[] = [
      {
        id: 'ev-1',
        portfolioId,
        assetId,
        type: 'BUY',
        tradeDate: new Date('2026-01-10T12:00:00Z'),
        quantity: '100',
        unitPrice: '25.00',
        fees: '0.00',
      },
      {
        id: 'ev-2',
        portfolioId,
        assetId,
        type: 'SELL',
        tradeDate: new Date('2026-01-20T12:00:00Z'),
        quantity: '40',
        unitPrice: '30.00',
        fees: '5.00',
      },
    ];

    const { position, realizedTrades } = calculateAssetPosition(assetId, events, mockAsset);

    // Q restaste: 60
    expect(position.quantity.toString()).toBe('60');
    // Custo médio unitário preservado: 25.00
    expect(position.averagePrice.toString()).toBe('25');
    // Custo total remanescente: 60 * 25 = 1500
    expect(position.totalCost.toString()).toBe('1500');
    expect(position.totalFees.toString()).toBe('5');

    // PnL Realizado: (40 * 30 - 5) - (40 * 25) = 1195 - 1000 = +195
    expect(position.totalRealizedPnL.toString()).toBe('195');

    expect(realizedTrades).toHaveLength(1);
    expect(realizedTrades[0].quantity.toString()).toBe('40');
    expect(realizedTrades[0].costBasisPrice.toString()).toBe('25');
    expect(realizedTrades[0].realizedPnL.toString()).toBe('195');
  });

  it('deve zerar custo total quando a posição for 100% vendida', () => {
    const events: TimelineEvent[] = [
      {
        id: 'ev-1',
        portfolioId,
        assetId,
        type: 'BUY',
        tradeDate: new Date('2026-01-10T12:00:00Z'),
        quantity: '100',
        unitPrice: '25.00',
        fees: '0.00',
      },
      {
        id: 'ev-2',
        portfolioId,
        assetId,
        type: 'SELL',
        tradeDate: new Date('2026-01-20T12:00:00Z'),
        quantity: '100',
        unitPrice: '35.00',
        fees: '0.00',
      },
    ];

    const { position } = calculateAssetPosition(assetId, events, mockAsset);

    expect(position.quantity.toString()).toBe('0');
    expect(position.totalCost.toString()).toBe('0');
    expect(position.averagePrice.toString()).toBe('0');
    expect(position.totalRealizedPnL.toString()).toBe('1000'); // Lucro de 100 * (35 - 25)
  });

  it('deve reiniciar novo custo médio após recompra de posição zerada', () => {
    const events: TimelineEvent[] = [
      {
        id: 'ev-1',
        portfolioId,
        assetId,
        type: 'BUY',
        tradeDate: new Date('2026-01-10T12:00:00Z'),
        quantity: '100',
        unitPrice: '25.00',
        fees: '0.00',
      },
      {
        id: 'ev-2',
        portfolioId,
        assetId,
        type: 'SELL',
        tradeDate: new Date('2026-01-20T12:00:00Z'),
        quantity: '100',
        unitPrice: '35.00',
        fees: '0.00',
      },
      {
        id: 'ev-3',
        portfolioId,
        assetId,
        type: 'BUY',
        tradeDate: new Date('2026-02-01T12:00:00Z'),
        quantity: '50',
        unitPrice: '40.00',
        fees: '0.00',
      },
    ];

    const { position } = calculateAssetPosition(assetId, events, mockAsset);

    expect(position.quantity.toString()).toBe('50');
    expect(position.averagePrice.toString()).toBe('40');
    expect(position.totalCost.toString()).toBe('2000');
    expect(position.totalRealizedPnL.toString()).toBe('1000');
  });

  it('deve calcular PnL com prejuízo operacional', () => {
    const events: TimelineEvent[] = [
      {
        id: 'ev-1',
        portfolioId,
        assetId,
        type: 'BUY',
        tradeDate: new Date('2026-01-10T12:00:00Z'),
        quantity: '100',
        unitPrice: '50.00',
        fees: '0.00',
      },
      {
        id: 'ev-2',
        portfolioId,
        assetId,
        type: 'SELL',
        tradeDate: new Date('2026-01-20T12:00:00Z'),
        quantity: '50',
        unitPrice: '30.00',
        fees: '10.00',
      },
    ];

    const { position } = calculateAssetPosition(assetId, events, mockAsset);

    // Receita: (50 * 30) - 10 = 1490
    // Custo base: 50 * 50 = 2500
    // PnL = 1490 - 2500 = -1010
    expect(position.totalRealizedPnL.toString()).toBe('-1010');
  });

  it('deve rejeitar venda com quantidade superior à posição acumulada', () => {
    const events: TimelineEvent[] = [
      {
        id: 'ev-1',
        portfolioId,
        assetId,
        type: 'BUY',
        tradeDate: new Date('2026-01-10T12:00:00Z'),
        quantity: '100',
        unitPrice: '25.00',
        fees: '0.00',
      },
      {
        id: 'ev-2',
        portfolioId,
        assetId,
        type: 'SELL',
        tradeDate: new Date('2026-01-20T12:00:00Z'),
        quantity: '150', // Acima de 100!
        unitPrice: '30.00',
        fees: '0.00',
      },
    ];

    expect(() => calculateAssetPosition(assetId, events, mockAsset)).toThrow(
      InsufficientPositionError
    );
  });

  it('deve validar consistência temporal e rejeitar venda retroativa sem saldo na data', () => {
    const existingEvents: TimelineEvent[] = [
      {
        id: 'ev-1',
        portfolioId,
        assetId,
        type: 'BUY',
        tradeDate: new Date('2026-02-10T12:00:00Z'),
        quantity: '100',
        unitPrice: '25.00',
        fees: '0.00',
      },
    ];

    // Tentativa de vender no passado (antes da compra)
    const prospectiveSale: TimelineEvent = {
      id: 'ev-2',
      portfolioId,
      assetId,
      type: 'SELL',
      tradeDate: new Date('2026-01-10T12:00:00Z'), // Data anterior!
      quantity: '50',
      unitPrice: '30.00',
      fees: '0.00',
    };

    expect(() =>
      validateTimelineConsistency(existingEvents, prospectiveSale)
    ).toThrow(InsufficientPositionError);
  });

  it('deve permitir compra retroativa válida que não cause inconsistências', () => {
    const existingEvents: TimelineEvent[] = [
      {
        id: 'ev-2',
        portfolioId,
        assetId,
        type: 'SELL',
        tradeDate: new Date('2026-02-10T12:00:00Z'),
        quantity: '50',
        unitPrice: '30.00',
        fees: '0.00',
      },
    ];

    // Inserção retroativa de compra prévia
    const prospectiveBuy: TimelineEvent = {
      id: 'ev-1',
      portfolioId,
      assetId,
      type: 'BUY',
      tradeDate: new Date('2026-01-10T12:00:00Z'), // Compra antes da venda
      quantity: '100',
      unitPrice: '20.00',
      fees: '0.00',
    };

    expect(() =>
      validateTimelineConsistency(existingEvents, prospectiveBuy)
    ).not.toThrow();
  });

  it('deve rejeitar cancelamento de compra que serviu de lastro para vendas posteriores', () => {
    const existingEvents: TimelineEvent[] = [
      {
        id: 'buy-1',
        portfolioId,
        assetId,
        type: 'BUY',
        tradeDate: new Date('2026-01-10T12:00:00Z'),
        quantity: '100',
        unitPrice: '25.00',
        fees: '0.00',
      },
      {
        id: 'sell-1',
        portfolioId,
        assetId,
        type: 'SELL',
        tradeDate: new Date('2026-01-20T12:00:00Z'),
        quantity: '80',
        unitPrice: '30.00',
        fees: '0.00',
      },
    ];

    // Se tentar cancelar buy-1, a venda sell-1 ficaria com -80
    expect(() =>
      validateTimelineConsistency(existingEvents, undefined, 'buy-1')
    ).toThrow(RetroactiveInconsistencyError);
  });

  it('deve permitir cancelamento de venda ou compra sem dependências', () => {
    const existingEvents: TimelineEvent[] = [
      {
        id: 'buy-1',
        portfolioId,
        assetId,
        type: 'BUY',
        tradeDate: new Date('2026-01-10T12:00:00Z'),
        quantity: '100',
        unitPrice: '25.00',
        fees: '0.00',
      },
      {
        id: 'sell-1',
        portfolioId,
        assetId,
        type: 'SELL',
        tradeDate: new Date('2026-01-20T12:00:00Z'),
        quantity: '80',
        unitPrice: '30.00',
        fees: '0.00',
      },
    ];

    // Cancelar a venda não deixa nada negativo
    expect(() =>
      validateTimelineConsistency(existingEvents, undefined, 'sell-1')
    ).not.toThrow();
  });

  it('deve ignorar eventos cancelados (deletedAt presente)', () => {
    const events: TimelineEvent[] = [
      {
        id: 'ev-1',
        portfolioId,
        assetId,
        type: 'BUY',
        tradeDate: new Date('2026-01-10T12:00:00Z'),
        quantity: '100',
        unitPrice: '25.00',
        fees: '0.00',
      },
      {
        id: 'ev-2',
        portfolioId,
        assetId,
        type: 'BUY',
        tradeDate: new Date('2026-01-15T12:00:00Z'),
        quantity: '1000',
        unitPrice: '10.00',
        fees: '0.00',
        deletedAt: new Date('2026-01-16T12:00:00Z'), // Cancelado!
      },
    ];

    const { position } = calculateAssetPosition(assetId, events, mockAsset);

    expect(position.quantity.toString()).toBe('100');
    expect(position.totalCost.toString()).toBe('2500');
  });

  it('deve suportar alta precisão decimal para criptoativos sem perda por ponto flutuante', () => {
    const cryptoAsset: Asset = {
      id: 'btc-id',
      ticker: 'BTC',
      name: 'Bitcoin',
      assetType: 'crypto',
      market: 'CRYPTO',
      currency: 'BRL',
      isCustom: false,
      userId: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const events: TimelineEvent[] = [
      {
        id: 'ev-1',
        portfolioId,
        assetId: 'btc-id',
        type: 'BUY',
        tradeDate: new Date('2026-01-10T12:00:00Z'),
        quantity: '0.0543210000',
        unitPrice: '350000.00',
        fees: '15.50',
      },
      {
        id: 'ev-2',
        portfolioId,
        assetId: 'btc-id',
        type: 'SELL',
        tradeDate: new Date('2026-01-20T12:00:00Z'),
        quantity: '0.0200000000',
        unitPrice: '400000.00',
        fees: '10.00',
      },
    ];

    const { position, realizedTrades } = calculateAssetPosition(
      'btc-id',
      events,
      cryptoAsset
    );

    // Q: 0.054321 - 0.02 = 0.0343210000
    expect(position.quantity.toFixed(10)).toBe('0.0343210000');
    expect(realizedTrades).toHaveLength(1);
    expect(position.totalRealizedPnL.greaterThan(0)).toBe(true);
  });

  describe('Valuation em calculatePortfolioPositionsSummary', () => {
    it('deve retornar totalMarketValue = 0 e totalUnrealizedPnL = 0 quando nenhuma posição tiver cotação, preservando totalInvestedCost', () => {
      const events: TimelineEvent[] = [
        {
          id: 'ev-1',
          portfolioId,
          assetId,
          type: 'BUY',
          tradeDate: new Date('2026-01-10T12:00:00Z'),
          quantity: '100',
          unitPrice: '25.00',
          fees: '0.00',
        },
      ];

      const assetsMap = new Map<string, Asset>([[assetId, mockAsset]]);
      const summary = calculatePortfolioPositionsSummary(portfolioId, events, assetsMap);

      expect(summary.totalInvestedCost.toString()).toBe('2500');
      expect(summary.totalMarketValue.toString()).toBe('0');
      expect(summary.totalUnrealizedPnL.toString()).toBe('0');
      expect(summary.totalUnrealizedPnLPercent).toBeNull();
      expect(summary.positions[0].hasQuote).toBe(false);
      expect(summary.positions[0].marketValue).toBeNull();
      expect(summary.positions[0].unrealizedPnL).toBeNull();
    });

    it('deve somar apenas ativos cotados em totalMarketValue em carteira mista', () => {
      const asset2Id = 'asset-uuid-2';
      const mockAsset2: Asset = {
        id: asset2Id,
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

      const events: TimelineEvent[] = [
        // Ativo 1: 100 * 25 = 2500 (sem cotação)
        {
          id: 'ev-1',
          portfolioId,
          assetId,
          type: 'BUY',
          tradeDate: new Date('2026-01-10T12:00:00Z'),
          quantity: '100',
          unitPrice: '25.00',
          fees: '0.00',
        },
        // Ativo 2: 50 * 60 = 3000 (com cotação a 70.00 -> VM = 3500, PnL = +500)
        {
          id: 'ev-2',
          portfolioId,
          assetId: asset2Id,
          type: 'BUY',
          tradeDate: new Date('2026-01-12T12:00:00Z'),
          quantity: '50',
          unitPrice: '60.00',
          fees: '0.00',
        },
      ];

      const assetsMap = new Map<string, Asset>([
        [assetId, mockAsset],
        [asset2Id, mockAsset2],
      ]);

      const quotesMap = new Map([
        [
          asset2Id,
          {
            id: 'quote-2',
            assetId: asset2Id,
            price: new Decimal('70.00'),
            currency: 'BRL',
            quoteDate: new Date('2026-08-18T18:00:00Z'),
            source: 'internal',
            delayStatus: 'eod' as const,
            notes: null,
            createdBy: 'user-1',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      ]);

      const summary = calculatePortfolioPositionsSummary(
        portfolioId,
        events,
        assetsMap,
        quotesMap
      );

      // Custo Total = 2500 + 3000 = 5500
      expect(summary.totalInvestedCost.toString()).toBe('5500');
      // Apenas Ativo 2 entra no totalMarketValue: 3500 (não soma os 2500 do ativo 1!)
      expect(summary.totalMarketValue.toString()).toBe('3500');
      // PnL Não realizado soma apenas Ativo 2: +500
      expect(summary.totalUnrealizedPnL.toString()).toBe('500');
      // Ativo 1 permanece com hasQuote: false
      const pos1 = summary.positions.find((p) => p.assetId === assetId);
      expect(pos1?.hasQuote).toBe(false);
      expect(pos1?.marketValue).toBeNull();
      expect(pos1?.unrealizedPnL).toBeNull();

      // Ativo 2 possui hasQuote: true e valores apurados
      const pos2 = summary.positions.find((p) => p.assetId === asset2Id);
      expect(pos2?.hasQuote).toBe(true);
      expect(pos2?.marketValue?.toString()).toBe('3500');
      expect(pos2?.unrealizedPnL?.toString()).toBe('500');

      // Percentual total deve ser null pois nem todas as posições ativas possuem cotação
      expect(summary.totalUnrealizedPnLPercent).toBeNull();
    });

    it('deve consolidar PnL de posição BRL com percentual calculado', () => {
      const events: TimelineEvent[] = [
        {
          id: 'ev-1',
          portfolioId,
          assetId,
          type: 'BUY',
          tradeDate: new Date('2026-01-10T12:00:00Z'),
          quantity: '100',
          unitPrice: '20.00',
          fees: '0.00',
        },
      ];

      const assetsMap = new Map<string, Asset>([[assetId, mockAsset]]);
      const quotesMap = new Map([
        [
          assetId,
          {
            id: 'quote-1',
            assetId,
            price: new Decimal('25.00'),
            currency: 'BRL',
            quoteDate: new Date('2026-08-18T18:00:00Z'),
            source: 'internal',
            delayStatus: 'eod' as const,
            notes: null,
            createdBy: 'user-1',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      ]);

      const summary = calculatePortfolioPositionsSummary(
        portfolioId,
        events,
        assetsMap,
        quotesMap
      );

      expect(summary.totalInvestedCost.toString()).toBe('2000');
      expect(summary.totalMarketValue.toString()).toBe('2500');
      expect(summary.totalUnrealizedPnL.toString()).toBe('500');
      expect(summary.totalUnrealizedPnLPercent?.toFixed(2)).toBe('25.00');
    });

    it('deve converter PnL de posição USD para BRL usando taxa cambial válida', () => {
      const usAssetId = 'us-asset-1';
      const mockUsAsset: Asset = {
        id: usAssetId,
        ticker: 'AAPL',
        name: 'Apple Inc.',
        assetType: 'stock',
        market: 'NASDAQ',
        currency: 'USD',
        isCustom: false,
        userId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const events: TimelineEvent[] = [
        {
          id: 'ev-us-1',
          portfolioId,
          assetId: usAssetId,
          type: 'BUY',
          tradeDate: new Date('2026-01-10T12:00:00Z'),
          quantity: '10',
          unitPrice: '150.00', // Custo = 1500 USD
          fees: '0.00',
        },
      ];

      const assetsMap = new Map<string, Asset>([[usAssetId, mockUsAsset]]);
      const quotesMap = new Map([
        [
          usAssetId,
          {
            id: 'quote-us-1',
            assetId: usAssetId,
            price: new Decimal('200.00'), // VM = 2000 USD, PnL = +500 USD
            currency: 'USD',
            quoteDate: new Date('2026-08-18T18:00:00Z'),
            source: 'internal',
            delayStatus: 'eod' as const,
            notes: null,
            createdBy: 'user-1',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      ]);

      const fxMap = new Map([
        [
          'USD',
          {
            id: 'fx-usd-1',
            fromCurrency: 'USD',
            toCurrency: 'BRL',
            rate: new Decimal('5.50'),
            rateDate: new Date('2026-08-18T18:00:00Z'),
            source: 'internal',
            delayStatus: 'eod' as const,
            createdBy: 'user-1',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      ]);

      const summary = calculatePortfolioPositionsSummary(
        portfolioId,
        events,
        assetsMap,
        quotesMap,
        fxMap
      );

      const pos = summary.positions[0];
      // Posição individual mantém valores em USD
      expect(pos.currency).toBe('USD');
      expect(pos.unrealizedPnL?.toString()).toBe('500'); // 500 USD
      expect(pos.marketValue?.toString()).toBe('2000'); // 2000 USD
      expect(pos.marketValueBrl?.toString()).toBe('11000'); // 2000 * 5.50 = 11000 BRL

      // Total consolidado BRL: 2000 * 5.50 = 11000 VM, 500 * 5.50 = 2750 PnL
      expect(summary.totalMarketValue.toString()).toBe('11000');
      expect(summary.totalUnrealizedPnL.toString()).toBe('2750');
      // Percentual consolidado retorna null pois a moeda não é puramente BRL
      expect(summary.totalUnrealizedPnLPercent).toBeNull();
    });

    it('não deve incluir no total BRL a posição USD quando o câmbio estiver ausente', () => {
      const usAssetId = 'us-asset-1';
      const mockUsAsset: Asset = {
        id: usAssetId,
        ticker: 'AAPL',
        name: 'Apple Inc.',
        assetType: 'stock',
        market: 'NASDAQ',
        currency: 'USD',
        isCustom: false,
        userId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const events: TimelineEvent[] = [
        {
          id: 'ev-us-1',
          portfolioId,
          assetId: usAssetId,
          type: 'BUY',
          tradeDate: new Date('2026-01-10T12:00:00Z'),
          quantity: '10',
          unitPrice: '150.00',
          fees: '0.00',
        },
      ];

      const assetsMap = new Map<string, Asset>([[usAssetId, mockUsAsset]]);
      const quotesMap = new Map([
        [
          usAssetId,
          {
            id: 'quote-us-1',
            assetId: usAssetId,
            price: new Decimal('200.00'),
            currency: 'USD',
            quoteDate: new Date('2026-08-18T18:00:00Z'),
            source: 'internal',
            delayStatus: 'eod' as const,
            notes: null,
            createdBy: 'user-1',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      ]);

      // Sem mapa de câmbio
      const summary = calculatePortfolioPositionsSummary(
        portfolioId,
        events,
        assetsMap,
        quotesMap
      );

      const pos = summary.positions[0];
      expect(pos.unrealizedPnL?.toString()).toBe('500'); // Em USD
      expect(pos.marketValueBrl).toBeNull();

      // Sem câmbio, totalMarketValue BRL e totalUnrealizedPnL BRL não recebem os valores em USD
      expect(summary.totalMarketValue.toString()).toBe('0');
      expect(summary.totalUnrealizedPnL.toString()).toBe('0');
      expect(summary.totalUnrealizedPnLPercent).toBeNull();
    });

    it('em carteira mista BRL/USD, nunca deve somar PnL em USD diretamente ao total BRL', () => {
      const usAssetId = 'us-asset-1';
      const mockUsAsset: Asset = {
        id: usAssetId,
        ticker: 'MSFT',
        name: 'Microsoft Corp.',
        assetType: 'stock',
        market: 'NASDAQ',
        currency: 'USD',
        isCustom: false,
        userId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const events: TimelineEvent[] = [
        // Ativo BRL: Compra 100 @ 10 = 1000 BRL. Cotação = 15 BRL -> PnL = +500 BRL
        {
          id: 'ev-brl',
          portfolioId,
          assetId,
          type: 'BUY',
          tradeDate: new Date('2026-01-10T12:00:00Z'),
          quantity: '100',
          unitPrice: '10.00',
          fees: '0.00',
        },
        // Ativo USD: Compra 10 @ 100 = 1000 USD. Cotação = 150 USD -> PnL = +500 USD
        {
          id: 'ev-usd',
          portfolioId,
          assetId: usAssetId,
          type: 'BUY',
          tradeDate: new Date('2026-01-10T12:00:00Z'),
          quantity: '10',
          unitPrice: '100.00',
          fees: '0.00',
        },
      ];

      const assetsMap = new Map<string, Asset>([
        [assetId, mockAsset],
        [usAssetId, mockUsAsset],
      ]);

      const quotesMap = new Map([
        [
          assetId,
          {
            id: 'quote-brl',
            assetId,
            price: new Decimal('15.00'),
            currency: 'BRL',
            quoteDate: new Date('2026-08-18T18:00:00Z'),
            source: 'internal',
            delayStatus: 'eod' as const,
            notes: null,
            createdBy: 'user-1',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        [
          usAssetId,
          {
            id: 'quote-usd',
            assetId: usAssetId,
            price: new Decimal('150.00'),
            currency: 'USD',
            quoteDate: new Date('2026-08-18T18:00:00Z'),
            source: 'internal',
            delayStatus: 'eod' as const,
            notes: null,
            createdBy: 'user-1',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      ]);

      const fxMap = new Map([
        [
          'USD',
          {
            id: 'fx-usd',
            fromCurrency: 'USD',
            toCurrency: 'BRL',
            rate: new Decimal('5.00'), // Taxa USD/BRL = 5.00
            rateDate: new Date('2026-08-18T18:00:00Z'),
            source: 'internal',
            delayStatus: 'eod' as const,
            createdBy: 'user-1',
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      ]);

      const summary = calculatePortfolioPositionsSummary(
        portfolioId,
        events,
        assetsMap,
        quotesMap,
        fxMap
      );

      // PnL BRL = 500 BRL
      // PnL USD convertido = 500 USD * 5.00 = 2500 BRL
      // Total Unreallized PnL BRL = 500 + 2500 = 3000 BRL (NÃO 500 + 500 = 1000!)
      expect(summary.totalUnrealizedPnL.toString()).toBe('3000');
      // Total Market Value BRL = 1500 (BRL) + (1500 USD * 5.00 = 7500 BRL) = 9000 BRL
      expect(summary.totalMarketValue.toString()).toBe('9000');
      // Percentual total é null por se tratar de carteira multi-moeda
      expect(summary.totalUnrealizedPnLPercent).toBeNull();
    });
  });
});
