import { describe, it, expect } from 'vitest';
import {
  catalogCategorySchema,
  catalogFilterSchema,
  tickerParamSchema,
  catalogHistoryPeriodSchema,
} from '@/modules/catalog/domain/catalog.schema';

describe('Catálogo Público — Schemas Zod', () => {
  it('deve validar e aceitar categorias tradicionais permitidas', () => {
    expect(catalogCategorySchema.parse('stock')).toBe('stock');
    expect(catalogCategorySchema.parse('fii')).toBe('fii');
    expect(catalogCategorySchema.parse('etf')).toBe('etf');
    expect(catalogCategorySchema.parse('bdr')).toBe('bdr');

    expect(() => catalogCategorySchema.parse('crypto')).toThrow();
    expect(() => catalogCategorySchema.parse('invalid')).toThrow();
  });

  it('deve aplicar valores padrão nos filtros de catálogo', () => {
    const parsed = catalogFilterSchema.parse({});
    expect(parsed.page).toBe(1);
    expect(parsed.limit).toBe(20);
    expect(parsed.sortBy).toBe('ticker');
    expect(parsed.sortOrder).toBe('asc');
    expect(parsed.query).toBe('');
    expect(parsed.category).toBeUndefined();
  });

  it('deve sanitizar e normalizar tickers válidos para maiúsculas', () => {
    expect(tickerParamSchema.parse('petr4')).toBe('PETR4');
    expect(tickerParamSchema.parse('  vale3  ')).toBe('VALE3');
    expect(tickerParamSchema.parse('knip11')).toBe('KNIP11');
    expect(tickerParamSchema.parse('ivvb11')).toBe('IVVB11');
    expect(tickerParamSchema.parse('aapl34')).toBe('AAPL34');

    expect(() => tickerParamSchema.parse('')).toThrow();
    expect(() => tickerParamSchema.parse('TICKER@INVALID')).toThrow();
  });

  it('deve validar períodos do histórico gráfico', () => {
    expect(catalogHistoryPeriodSchema.parse('1M')).toBe('1M');
    expect(catalogHistoryPeriodSchema.parse('3M')).toBe('3M');
    expect(catalogHistoryPeriodSchema.parse('6M')).toBe('6M');
    expect(catalogHistoryPeriodSchema.parse('1Y')).toBe('1Y');
    expect(catalogHistoryPeriodSchema.parse('ALL')).toBe('ALL');

    expect(() => catalogHistoryPeriodSchema.parse('10Y')).toThrow();
  });
});
