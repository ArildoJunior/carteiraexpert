import { z } from 'zod';
import { Decimal } from '@/lib/decimal';

const decimalStringSchema = z
  .string()
  .or(z.number().transform((val) => val.toString()))
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

export const bazinPremisesSchema = z.object({
  targetDividendYield: decimalStringSchema
    .default('0.06')
    .refine(
      (val) => {
        const d = new Decimal(val);
        return d.greaterThan(0) && d.lessThanOrEqualTo(1);
      },
      { message: 'Dividend Yield alvo deve ser maior que 0% e menor ou igual a 100%' }
    ),
});

export type BazinPremisesInput = z.infer<typeof bazinPremisesSchema>;

export const grahamPremisesSchema = z.object({
  grahamMultiplier: decimalStringSchema
    .default('22.5')
    .refine(
      (val) => {
        const d = new Decimal(val);
        return d.greaterThan(0) && d.lessThanOrEqualTo(100);
      },
      { message: 'Multiplicador de Graham deve ser maior que 0 e menor ou igual a 100' }
    ),
});

export type GrahamPremisesInput = z.infer<typeof grahamPremisesSchema>;

export const dcfPremisesSchema = z
  .object({
    discountRate: decimalStringSchema
      .default('0.12')
      .refine(
        (val) => {
          const d = new Decimal(val);
          return d.greaterThan(0) && d.lessThanOrEqualTo(1);
        },
        { message: 'Taxa de desconto (r) deve ser maior que 0% e menor ou igual a 100%' }
      ),
    growthRateStage1: decimalStringSchema
      .default('0.08')
      .refine(
        (val) => {
          const d = new Decimal(val);
          return d.greaterThanOrEqualTo(-0.5) && d.lessThanOrEqualTo(2.0);
        },
        { message: 'Taxa de crescimento do Estágio 1 deve estar entre -50% e +200%' }
      ),
    terminalGrowthRate: decimalStringSchema
      .default('0.03')
      .refine(
        (val) => {
          const d = new Decimal(val);
          return d.greaterThanOrEqualTo(0) && d.lessThanOrEqualTo(0.2);
        },
        { message: 'Taxa de crescimento terminal (g_t) deve estar entre 0% e 20%' }
      ),
    projectionYears: z
      .number()
      .int()
      .min(1, 'Horizonte de projeção deve ser de pelo menos 1 ano')
      .max(15, 'Horizonte de projeção não deve exceder 15 anos')
      .default(5),
  })
  .refine(
    (data) => {
      try {
        const r = new Decimal(data.discountRate);
        const gt = new Decimal(data.terminalGrowthRate);
        return r.greaterThan(gt);
      } catch {
        return false;
      }
    },
    {
      message:
        'A taxa de desconto (r) deve ser estritamente maior que a taxa de crescimento terminal (g_t)',
      path: ['discountRate'],
    }
  );

export type DcfPremisesInput = z.infer<typeof dcfPremisesSchema>;

export const valuationSimulationOptionsSchema = z.object({
  bazin: bazinPremisesSchema.optional(),
  graham: grahamPremisesSchema.optional(),
  dcf: dcfPremisesSchema.optional(),
});

export type ValuationSimulationOptions = z.infer<typeof valuationSimulationOptionsSchema>;
