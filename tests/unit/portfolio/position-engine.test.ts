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
});
