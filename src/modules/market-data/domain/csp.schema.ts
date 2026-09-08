import { z } from 'zod';
import { Decimal } from '@/lib/decimal';

export const decimalStringSchema = z
  .string()
  .refine(
    (val) => {
      try {
        const d = new Decimal(val);
        return !d.isNaN() && d.isFinite();
      } catch {
        return false;
      }
    },
    { message: 'Valor decimal inválido' }
  );

export const cspAssetClassSchema = z.enum([
  'STOCK',
  'FII',
  'ETF',
  'FUND',
  'CRYPTO',
  'OTHER',
]);

export const cspWeightingMethodSchema = z.enum([
  'EQUIPONDERADA',
  'MARGEM_SEGURANCA',
]);

export const DEFAULT_CSP_CRITERIA_INPUT = {
  minMarginOfSafetyPercent: '0.00',
  maxNetDebtToEbitda: '3.50',
  maxNetDebtToEquity: '2.00',
  minRoe: '0.05',
  maxStaleDays: 5,
};

export const DEFAULT_CSP_CONSTRAINTS_INPUT = {
  maxWeightPerAsset: '0.20',
  maxWeightPerSector: '0.40',
};

export const cspCriteriaInputSchema = z.object({
  minMarginOfSafetyPercent: decimalStringSchema.default(DEFAULT_CSP_CRITERIA_INPUT.minMarginOfSafetyPercent),
  maxNetDebtToEbitda: decimalStringSchema.nullable().default(DEFAULT_CSP_CRITERIA_INPUT.maxNetDebtToEbitda),
  maxNetDebtToEquity: decimalStringSchema.nullable().default(DEFAULT_CSP_CRITERIA_INPUT.maxNetDebtToEquity),
  minRoe: decimalStringSchema.nullable().default(DEFAULT_CSP_CRITERIA_INPUT.minRoe),
  maxStaleDays: z.number().int().min(0).max(365).default(DEFAULT_CSP_CRITERIA_INPUT.maxStaleDays),
  evaluationDate: z.string().optional(),
});

export const cspConstraintsInputSchema = z.object({
  maxWeightPerAsset: decimalStringSchema.default(DEFAULT_CSP_CONSTRAINTS_INPUT.maxWeightPerAsset),
  maxWeightPerSector: decimalStringSchema.default(DEFAULT_CSP_CONSTRAINTS_INPUT.maxWeightPerSector),
});

export const cspSimulationInputSchema = z.object({
  assetClass: cspAssetClassSchema.default('STOCK'),
  weightingMethod: cspWeightingMethodSchema.default('EQUIPONDERADA'),
  criteria: cspCriteriaInputSchema.default(DEFAULT_CSP_CRITERIA_INPUT),
  constraints: cspConstraintsInputSchema.default(DEFAULT_CSP_CONSTRAINTS_INPUT),
  allowPartialAllocation: z.boolean().default(false),
  evaluationDate: z.string().optional(),
});

export type CspSimulationInput = z.input<typeof cspSimulationInputSchema>;
export type CspSimulationParsed = z.output<typeof cspSimulationInputSchema>;
export type CspCriteriaInput = z.input<typeof cspCriteriaInputSchema>;
export type CspConstraintsInput = z.input<typeof cspConstraintsInputSchema>;
