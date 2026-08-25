import { z } from 'zod';

export const chartAreaSchema = z.enum([
  'portfolio_evolution',
  'dashboard_allocation',
  'portfolio_allocation',
]);

export const chartPeriodSchema = z.enum([
  '1M',
  '3M',
  '6M',
  '1Y',
  'YTD',
  'ALL',
]);

export const chartViewModeSchema = z.enum([
  'comparison',
  'market_value',
  'cost_basis',
  'pnl',
]);

export const chartGroupingTypeSchema = z.enum([
  'asset',
  'asset_type',
  'portfolio',
  'currency',
]);

export const chartBasisSchema = z.enum([
  'market_value',
  'cost_basis',
]);

export const saveChartPreferenceSchema = z
  .object({
    chartArea: chartAreaSchema,
    period: chartPeriodSchema.nullable().optional(),
    viewMode: chartViewModeSchema.nullable().optional(),
    groupingType: chartGroupingTypeSchema.nullable().optional(),
    basis: chartBasisSchema.nullable().optional(),
  })
  .superRefine((data, ctx) => {
    // Valida que apenas preferências pertinentes à área sejam salvas
    if (data.chartArea === 'portfolio_evolution') {
      if (data.groupingType) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'groupingType não é suportado na área portfolio_evolution',
          path: ['groupingType'],
        });
      }
      if (data.basis) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'basis não é suportado na área portfolio_evolution',
          path: ['basis'],
        });
      }
    }

    if (data.chartArea === 'dashboard_allocation') {
      if (data.period) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'period não é suportado na área dashboard_allocation',
          path: ['period'],
        });
      }
      if (data.viewMode) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'viewMode não é suportado na área dashboard_allocation',
          path: ['viewMode'],
        });
      }
      if (data.groupingType === 'asset') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'groupingType "asset" não é suportado no dashboard consolidado',
          path: ['groupingType'],
        });
      }
    }

    if (data.chartArea === 'portfolio_allocation') {
      if (data.period) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'period não é suportado na área portfolio_allocation',
          path: ['period'],
        });
      }
      if (data.viewMode) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'viewMode não é suportado na área portfolio_allocation',
          path: ['viewMode'],
        });
      }
      if (data.groupingType === 'portfolio') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'groupingType "portfolio" não é suportado em uma carteira individual',
          path: ['groupingType'],
        });
      }
    }
  });

export type SaveChartPreferenceInput = z.infer<typeof saveChartPreferenceSchema>;
