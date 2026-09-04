import { z } from 'zod';
import { Decimal } from '@/lib/decimal';

function tryDecimal(val: unknown): Decimal | null {
  try {
    if (typeof val !== 'string' && typeof val !== 'number') return null;
    const d = new Decimal(val);
    return !d.isNaN() && d.isFinite() ? d : null;
  } catch {
    return null;
  }
}

const decimalStringSchema = z
  .string()
  .or(z.number().transform((val) => val.toString()))
  .refine(
    (val) => tryDecimal(val) !== null,
    { message: 'Valor decimal numérico inválido' }
  );

export const projectionPremisesInputSchema = z
  .object({
    initialCapital: decimalStringSchema
      .default('10000.00')
      .refine(
        (val) => {
          const d = tryDecimal(val);
          return d !== null && d.greaterThanOrEqualTo(0);
        },
        { message: 'O capital inicial não pode ser negativo' }
      ),
    monthlyContribution: decimalStringSchema
      .default('1000.00')
      .refine(
        (val) => {
          const d = tryDecimal(val);
          return d !== null && d.greaterThanOrEqualTo(0);
        },
        { message: 'O aporte mensal não pode ser negativo' }
      ),
    annualInterestRate: decimalStringSchema
      .default('0.10')
      .refine(
        (val) => {
          const d = tryDecimal(val);
          return d !== null && d.greaterThanOrEqualTo(-0.5) && d.lessThanOrEqualTo(2.0);
        },
        { message: 'A taxa de rendimento anual deve estar entre -50% e +200% ao ano' }
      ),
    annualInflationRate: decimalStringSchema
      .default('0.04')
      .refine(
        (val) => {
          const d = tryDecimal(val);
          return d !== null && d.greaterThanOrEqualTo(0) && d.lessThanOrEqualTo(1.0);
        },
        { message: 'A taxa de inflação anual não pode ser negativa e deve ser de no máximo 100%' }
      ),
    targetDividendYield: decimalStringSchema
      .default('0.06')
      .refine(
        (val) => {
          const d = tryDecimal(val);
          return d !== null && d.greaterThanOrEqualTo(0) && d.lessThanOrEqualTo(0.5);
        },
        { message: 'O Dividend Yield anual deve estar entre 0% e 50% ao ano' }
      ),
    totalMonths: z
      .number()
      .int('O prazo em meses deve ser um número inteiro')
      .min(1, 'O prazo da simulação deve ser de pelo menos 1 mês')
      .max(600, 'O prazo máximo da simulação é de 600 meses (50 anos)')
      .default(120),
    contributionTiming: z
      .enum(['BEGINNING_OF_PERIOD', 'END_OF_PERIOD'])
      .default('END_OF_PERIOD'),
  })
  .refine(
    (data) => {
      const initial = tryDecimal(data.initialCapital);
      const monthly = tryDecimal(data.monthlyContribution);
      if (!initial || !monthly) return true;
      return initial.greaterThan(0) || monthly.greaterThan(0);
    },
    {
      message: 'O capital inicial ou o aporte mensal deve ser maior que zero para simular a acumulação',
      path: ['monthlyContribution'],
    }
  );

export type ProjectionPremisesInput = z.infer<typeof projectionPremisesInputSchema>;
