import { describe, it, expect } from 'vitest';
import { Decimal } from '@/lib/decimal';
import {
  calculateAssetValuation,
  serializeAssetValuation,
} from '@/modules/market-data/domain/valuation-engine';
import type { MarketQuote, ExchangeRate } from '@/modules/market-data/domain/market-data.types';
import type { AssetPosition } from '@/modules/portfolio/domain/position.types';
import crypto from 'node:crypto';

describe('Unitário: Motor de Valuation e Marcação a Mercado (valuation-engine)', () => {
  const dummyAssetId = crypto.randomUUID();

  const createDummyPosition = (overrides?: Partial<AssetPosition>): AssetPosition => ({
    assetId: dummyAssetId,
    ticker: 'PETR4',
    name: 'Petrobras PN',
    assetType: 'stock',
    market: 'B3',
    currency: 'BRL',
    isCustom: false,
    quantity: new Decimal('100'),
    averagePrice: new Decimal('30.00'),
    totalCost: new Decimal('3000.00'),
    totalFees: new Decimal('10.00'),
    totalRealizedPnL: new Decimal('0'),
    totalIncomeReceived: new Decimal('0'),
    lastTradeDate: new Date('2026-08-10T12:00:00.000Z'),
    hasFractionalShares: false,
    hasQuote: false,
    marketPrice: null,
    marketValue: null,
    unrealizedPnL: null,
    unrealizedPnLPercent: null,
    quoteCurrency: null,
    quoteDate: null,
    quoteSource: null,
    delayStatus: null,
    marketValueBrl: null,
    fxRateUsed: null,
    fxDateUsed: null,
    assetPriceReturnPercent: null,
    ...overrides,
  });

  const createDummyQuote = (overrides?: Partial<MarketQuote>): MarketQuote => ({
    id: crypto.randomUUID(),
    assetId: dummyAssetId,
    price: new Decimal('35.00'),
    currency: 'BRL',
    quoteDate: new Date('2026-08-18T18:00:00.000Z'),
    source: 'internal',
    delayStatus: 'eod',
    notes: 'Fechamento de mercado',
    createdBy: crypto.randomUUID(),
    createdAt: new Date('2026-08-18T18:05:00.000Z'),
    updatedAt: new Date('2026-08-18T18:05:00.000Z'),
    ...overrides,
  });

  const createDummyFxRate = (overrides?: Partial<ExchangeRate>): ExchangeRate => ({
    id: crypto.randomUUID(),
    fromCurrency: 'USD',
    toCurrency: 'BRL',
    rate: new Decimal('5.50'),
    rateDate: new Date('2026-08-18T18:00:00.000Z'),
    source: 'internal',
    delayStatus: 'eod',
    createdBy: crypto.randomUUID(),
    createdAt: new Date('2026-08-18T18:05:00.000Z'),
    updatedAt: new Date('2026-08-18T18:05:00.000Z'),
    ...overrides,
  });

  it('deve calcular corretamente valor de mercado e PnL não realizado positivo para ativo com cotação', () => {
    const position = createDummyPosition({
      quantity: new Decimal('100'),
      averagePrice: new Decimal('30.00'),
      totalCost: new Decimal('3000.00'),
    });
    const quote = createDummyQuote({ price: new Decimal('35.00') });

    const valuation = calculateAssetValuation(position, quote);

    expect(valuation.hasQuote).toBe(true);
    expect(valuation.marketPrice?.toString()).toBe('35');
    expect(valuation.marketValue?.toString()).toBe('3500'); // 100 * 35
    expect(valuation.unrealizedPnL?.toString()).toBe('500'); // 3500 - 3000
    expect(valuation.unrealizedPnLPercent?.toFixed(2)).toBe('16.67'); // 500 / 3000 * 100
    expect(valuation.marketValueBrl?.toString()).toBe('3500');
    expect(valuation.fxRateUsed?.toString()).toBe('1');
    expect(valuation.delayStatus).toBe('eod');
  });

  it('deve calcular corretamente PnL não realizado negativo quando cotação for menor que o custo médio', () => {
    const position = createDummyPosition({
      quantity: new Decimal('100'),
      averagePrice: new Decimal('30.00'),
      totalCost: new Decimal('3000.00'),
    });
    const quote = createDummyQuote({ price: new Decimal('24.00') });

    const valuation = calculateAssetValuation(position, quote);

    expect(valuation.hasQuote).toBe(true);
    expect(valuation.marketPrice?.toString()).toBe('24');
    expect(valuation.marketValue?.toString()).toBe('2400');
    expect(valuation.unrealizedPnL?.toString()).toBe('-600');
    expect(valuation.unrealizedPnLPercent?.toFixed(2)).toBe('-20.00'); // -600 / 3000 * 100
  });

  it('deve aplicar fallback gracioso quando a cotação estiver ausente (null/undefined)', () => {
    const position = createDummyPosition();

    const valuation = calculateAssetValuation(position, null);

    expect(valuation.hasQuote).toBe(false);
    expect(valuation.marketPrice).toBeNull();
    expect(valuation.marketValue).toBeNull();
    expect(valuation.unrealizedPnL).toBeNull();
    expect(valuation.unrealizedPnLPercent).toBeNull();
    expect(valuation.marketValueBrl).toBeNull();
    expect(valuation.delayStatus).toBeNull();
  });

  it('deve tratar posição zerada em custódia com valor de mercado e PnL zerados', () => {
    const position = createDummyPosition({
      quantity: new Decimal('0'),
      totalCost: new Decimal('0'),
      averagePrice: new Decimal('0'),
    });
    const quote = createDummyQuote({ price: new Decimal('50.00') });

    const valuation = calculateAssetValuation(position, quote);

    expect(valuation.hasQuote).toBe(true);
    expect(valuation.marketValue?.toString()).toBe('0');
    expect(valuation.unrealizedPnL?.toString()).toBe('0');
    expect(valuation.unrealizedPnLPercent?.toString()).toBe('0');
    expect(valuation.marketValueBrl?.toString()).toBe('0');
  });

  it('deve lidar com custo zero (ações 100% bonificadas) sem divisão por zero', () => {
    const position = createDummyPosition({
      quantity: new Decimal('50'),
      totalCost: new Decimal('0'),
      averagePrice: new Decimal('0'),
    });
    const quote = createDummyQuote({ price: new Decimal('20.00') });

    const valuation = calculateAssetValuation(position, quote);

    expect(valuation.hasQuote).toBe(true);
    expect(valuation.marketValue?.toString()).toBe('1000');
    expect(valuation.unrealizedPnL?.toString()).toBe('1000');
    expect(valuation.unrealizedPnLPercent).toBeNull(); // Indefinido matematicamente
  });

  it('deve realizar conversão cambial para BRL em ativos internacionais (ex: USD)', () => {
    const position = createDummyPosition({
      ticker: 'AAPL',
      currency: 'USD',
      quantity: new Decimal('10'),
      averagePrice: new Decimal('150.00'),
      totalCost: new Decimal('1500.00'),
    });
    const quote = createDummyQuote({
      price: new Decimal('200.00'),
      currency: 'USD',
    });
    const fxRate = createDummyFxRate({
      fromCurrency: 'USD',
      toCurrency: 'BRL',
      rate: new Decimal('5.50'),
    });

    const valuation = calculateAssetValuation(position, quote, fxRate);

    expect(valuation.hasQuote).toBe(true);
    expect(valuation.quoteCurrency).toBe('USD');
    expect(valuation.marketValue?.toString()).toBe('2000'); // 10 * 200 USD
    expect(valuation.unrealizedPnL?.toString()).toBe('500'); // 2000 - 1500 USD
    expect(valuation.marketValueBrl?.toString()).toBe('11000'); // 2000 USD * 5.50 BRL/USD
    expect(valuation.fxRateUsed?.toString()).toBe('5.5');
  });

  it('deve aplicar fallback seguro quando a taxa cambial for ausente para ativo internacional', () => {
    const position = createDummyPosition({
      ticker: 'AAPL',
      currency: 'USD',
      quantity: new Decimal('10'),
      totalCost: new Decimal('1500.00'),
    });
    const quote = createDummyQuote({
      price: new Decimal('200.00'),
      currency: 'USD',
    });

    const valuation = calculateAssetValuation(position, quote, null);

    expect(valuation.hasQuote).toBe(true);
    expect(valuation.marketValue?.toString()).toBe('2000');
    expect(valuation.marketValueBrl).toBeNull();
    expect(valuation.fxRateUsed).toBeNull();
  });

  it('deve serializar corretamente a estrutura de valuation para formato string/JSON', () => {
    const position = createDummyPosition();
    const quote = createDummyQuote({ price: new Decimal('33.50') });

    const valuation = calculateAssetValuation(position, quote);
    const serialized = serializeAssetValuation(valuation);

    expect(serialized.hasQuote).toBe(true);
    expect(serialized.marketPrice).toBe('33.50000000');
    expect(serialized.marketValue).toBe('3350.00000000');
    expect(serialized.unrealizedPnL).toBe('350.00000000');
    expect(serialized.unrealizedPnLPercent).toBe('11.6667');
    expect(serialized.delayStatus).toBe('eod');
    expect(serialized.quoteSource).toBe('internal');
  });
});
