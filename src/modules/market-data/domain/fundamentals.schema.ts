import { z } from 'zod';

export const statementPeriodTypeSchema = z.enum(['annual', 'quarterly', 'ttm']);
export const statementTypeSchema = z.enum(['CONSOLIDATED', 'INDIVIDUAL']);

const optionalDecimalString = z
  .string()
  .trim()
  .refine(
    (val) => {
      if (!val) return true;
      return /^-?\d+(\.\d+)?$/.test(val);
    },
    { message: 'Valor numérico decimal inválido' }
  )
  .nullable()
  .optional();

const nonNegativeDecimalString = z
  .string()
  .trim()
  .refine(
    (val) => {
      if (!val) return true;
      if (!/^-?\d+(\.\d+)?$/.test(val)) return false;
      return Number(val) >= 0;
    },
    { message: 'Valor deve ser maior ou igual a zero' }
  )
  .nullable()
  .optional();

const strictlyPositiveDecimalString = z
  .string()
  .trim()
  .refine(
    (val) => {
      if (!val) return true;
      if (!/^-?\d+(\.\d+)?$/.test(val)) return false;
      return Number(val) > 0;
    },
    { message: 'Quantidade de ações deve ser estritamente maior que zero' }
  )
  .nullable()
  .optional();

export const assetFundamentalInputSchema = z.object({
  assetId: z.string().uuid({ message: 'assetId deve ser um UUID válido' }),
  referencePeriod: z.string().trim().min(1, { message: 'referencePeriod é obrigatório' }),
  periodType: statementPeriodTypeSchema,
  statementType: statementTypeSchema.default('CONSOLIDATED'),
  referenceDate: z.coerce.date({ message: 'referenceDate deve ser uma data válida' }),
  filingDate: z.coerce.date().nullable().optional(),
  source: z.string().trim().min(1).default('cvm'),
  sourceReference: z.string().trim().nullable().optional(),
  version: z.number().int().min(1, { message: 'version deve ser um inteiro >= 1' }).default(1),
  isRestated: z.boolean().default(false),
  currency: z
    .string()
    .trim()
    .length(3, { message: 'currency deve ter exatamente 3 caracteres' })
    .transform((v) => v.toUpperCase())
    .default('BRL'),

  // Fatos contábeis brutos reportados
  netRevenue: optionalDecimalString,
  ebitda: optionalDecimalString,
  netIncome: optionalDecimalString,
  totalEquity: optionalDecimalString,
  totalAssets: optionalDecimalString,
  grossDebt: optionalDecimalString,
  cashEquivalents: optionalDecimalString,
  sharesCount: strictlyPositiveDecimalString,
  dividendsDeclared: nonNegativeDecimalString,
  notes: z.string().trim().nullable().optional(),
});

export type AssetFundamentalInput = z.input<typeof assetFundamentalInputSchema>;
export type AssetFundamentalParsed = z.output<typeof assetFundamentalInputSchema>;

