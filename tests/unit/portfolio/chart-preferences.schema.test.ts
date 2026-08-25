import { describe, it, expect } from 'vitest';
import {
  saveChartPreferenceSchema,
  chartAreaSchema,
  chartPeriodSchema,
  chartViewModeSchema,
  chartGroupingTypeSchema,
  chartBasisSchema,
} from '../../../src/modules/portfolio/domain/chart-preferences.schema';

describe('Unit: Schemas de Preferências de Gráficos (Zod)', () => {
  it('deve validar áreas suportadas', () => {
    expect(chartAreaSchema.safeParse('portfolio_evolution').success).toBe(true);
    expect(chartAreaSchema.safeParse('dashboard_allocation').success).toBe(true);
    expect(chartAreaSchema.safeParse('portfolio_allocation').success).toBe(true);
    expect(chartAreaSchema.safeParse('invalid_area').success).toBe(false);
  });

  it('deve validar períodos de evolução suportados', () => {
    const validPeriods = ['1M', '3M', '6M', '1Y', 'YTD', 'ALL'];
    for (const p of validPeriods) {
      expect(chartPeriodSchema.safeParse(p).success).toBe(true);
    }
    expect(chartPeriodSchema.safeParse('5Y').success).toBe(false);
    expect(chartPeriodSchema.safeParse('MAX').success).toBe(false);
  });

  it('deve validar modos de exibição de evolução suportados', () => {
    const validModes = ['comparison', 'market_value', 'cost_basis', 'pnl'];
    for (const m of validModes) {
      expect(chartViewModeSchema.safeParse(m).success).toBe(true);
    }
    expect(chartViewModeSchema.safeParse('candlestick').success).toBe(false);
  });

  it('deve validar tipos de agrupamento de alocação suportados', () => {
    const validGroupings = ['asset', 'asset_type', 'portfolio', 'currency'];
    for (const g of validGroupings) {
      expect(chartGroupingTypeSchema.safeParse(g).success).toBe(true);
    }
    expect(chartGroupingTypeSchema.safeParse('sector').success).toBe(false);
  });

  it('deve validar bases de alocação suportadas', () => {
    expect(chartBasisSchema.safeParse('market_value').success).toBe(true);
    expect(chartBasisSchema.safeParse('cost_basis').success).toBe(true);
    expect(chartBasisSchema.safeParse('nominal').success).toBe(false);
  });

  it('deve aceitar payload válido para portfolio_evolution', () => {
    const parsed = saveChartPreferenceSchema.safeParse({
      chartArea: 'portfolio_evolution',
      period: '6M',
      viewMode: 'market_value',
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.chartArea).toBe('portfolio_evolution');
      expect(parsed.data.period).toBe('6M');
      expect(parsed.data.viewMode).toBe('market_value');
    }
  });

  it('deve rejeitar groupingType ou basis na área portfolio_evolution', () => {
    const res1 = saveChartPreferenceSchema.safeParse({
      chartArea: 'portfolio_evolution',
      period: '1Y',
      groupingType: 'asset_type',
    });
    expect(res1.success).toBe(false);

    const res2 = saveChartPreferenceSchema.safeParse({
      chartArea: 'portfolio_evolution',
      period: '1Y',
      basis: 'market_value',
    });
    expect(res2.success).toBe(false);
  });

  it('deve aceitar payload válido para dashboard_allocation', () => {
    const parsed = saveChartPreferenceSchema.safeParse({
      chartArea: 'dashboard_allocation',
      groupingType: 'portfolio',
      basis: 'cost_basis',
    });

    expect(parsed.success).toBe(true);
  });

  it('deve rejeitar groupingType "asset" ou period na área dashboard_allocation', () => {
    const res1 = saveChartPreferenceSchema.safeParse({
      chartArea: 'dashboard_allocation',
      groupingType: 'asset',
      basis: 'market_value',
    });
    expect(res1.success).toBe(false);

    const res2 = saveChartPreferenceSchema.safeParse({
      chartArea: 'dashboard_allocation',
      period: '1M',
      basis: 'market_value',
    });
    expect(res2.success).toBe(false);
  });

  it('deve aceitar payload válido para portfolio_allocation', () => {
    const parsed = saveChartPreferenceSchema.safeParse({
      chartArea: 'portfolio_allocation',
      groupingType: 'asset',
      basis: 'market_value',
    });

    expect(parsed.success).toBe(true);
  });

  it('deve rejeitar groupingType "portfolio" na área portfolio_allocation', () => {
    const parsed = saveChartPreferenceSchema.safeParse({
      chartArea: 'portfolio_allocation',
      groupingType: 'portfolio',
      basis: 'market_value',
    });

    expect(parsed.success).toBe(false);
  });
});
