import { z } from 'zod';
import { createDecimalValidator, Decimal } from '@/lib/decimal';

// Validadores estritos de valores financeiros em Decimal para opções
export const strikePriceSchema = createDecimalValidator({
  minExclusive: new Decimal('0'),
  max: new Decimal('1000000'),
  maxPrecision: 20,
  maxScale: 8,
  fieldName: 'Preço de exercício (strike)',
});

export const premiumSchema = createDecimalValidator({
  min: new Decimal('0'),
  max: new Decimal('1000000'),
  maxPrecision: 20,
  maxScale: 8,
  fieldName: 'Prêmio da opção',
});

export const quantitySchema = createDecimalValidator({
  minExclusive: new Decimal('0'),
  max: new Decimal('1000000000'),
  maxPrecision: 20,
  maxScale: 8,
  fieldName: 'Quantidade de contratos',
});

export const spotPriceSchema = createDecimalValidator({
  minExclusive: new Decimal('0'),
  max: new Decimal('1000000'),
  maxPrecision: 20,
  maxScale: 8,
  fieldName: 'Preço do ativo-objeto',
});

export const riskFreeRateSchema = createDecimalValidator({
  min: new Decimal('0'),
  max: new Decimal('2.0'), // Até 200% a.a.
  maxPrecision: 10,
  maxScale: 6,
  fieldName: 'Taxa livre de risco',
});

export const volatilitySchema = createDecimalValidator({
  minExclusive: new Decimal('0'),
  max: new Decimal('5.0'), // Até 500% a.a.
  maxPrecision: 10,
  maxScale: 6,
  fieldName: 'Volatilidade implícita',
});

export const timeToExpirationYearsSchema = createDecimalValidator({
  min: new Decimal('0'),
  max: new Decimal('100'),
  maxPrecision: 10,
  maxScale: 6,
  fieldName: 'Tempo até o vencimento em anos',
});

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export const expirationDateSchema = z
  .string()
  .regex(DATE_REGEX, { message: 'Data de vencimento deve estar no formato AAAA-MM-DD.' })
  .refine(
    (dateStr) => {
      const parts = dateStr.split('-').map(Number);
      const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
      return (
        d.getUTCFullYear() === parts[0] &&
        d.getUTCMonth() === parts[1] - 1 &&
        d.getUTCDate() === parts[2]
      );
    },
    { message: 'Data de vencimento inválida no calendário gregoriano.' }
  );

export const OPTION_TYPES = ['CALL', 'PUT'] as const;
export const OPTION_STYLES = ['AMERICAN', 'EUROPEAN'] as const;
export const OPTION_DIRECTIONS = ['BUY', 'SELL'] as const;
export const OPTION_STATUSES = ['OPEN', 'CLOSED', 'EXPIRED'] as const;

export const createOptionContractSchema = z
  .object({
    portfolioId: z.string().uuid({ message: 'portfolioId deve ser um UUID válido.' }),
    underlyingAssetId: z.string().uuid({ message: 'underlyingAssetId deve ser um UUID válido.' }),
    custodyAccountId: z
      .string()
      .uuid({ message: 'custodyAccountId deve ser um UUID válido.' })
      .nullable()
      .optional(),
    ticker: z
      .string()
      .trim()
      .min(3, { message: 'Ticker deve ter no mínimo 3 caracteres.' })
      .max(20, { message: 'Ticker deve ter no máximo 20 caracteres.' })
      .regex(/^[A-Za-z0-9_.-]+$/, {
        message: 'Ticker contém caracteres inválidos. Utilize apenas letras, números e símbolos comuns.',
      })
      .transform((t) => t.toUpperCase()),
    optionType: z.enum(OPTION_TYPES),
    optionStyle: z.enum(OPTION_STYLES).default('AMERICAN'),
    direction: z.enum(OPTION_DIRECTIONS),
    strikePrice: strikePriceSchema,
    premiumPaidReceived: premiumSchema,
    quantity: quantitySchema,
    expirationDate: expirationDateSchema,
    notes: z
      .string()
      .max(500, { message: 'Anotações devem ter no máximo 500 caracteres.' })
      .nullable()
      .optional(),
  });

export type CreateOptionContractInput = z.input<typeof createOptionContractSchema>;
export type CreateOptionContractOutput = z.output<typeof createOptionContractSchema>;

export const updateOptionContractSchema = z.object({
  contractId: z.string().uuid({ message: 'contractId deve ser um UUID válido.' }),
  status: z.enum(OPTION_STATUSES).optional(),
  notes: z
    .string()
    .max(500, { message: 'Anotações devem ter no máximo 500 caracteres.' })
    .nullable()
    .optional(),
});

export type UpdateOptionContractInput = z.infer<typeof updateOptionContractSchema>;

export const calculateGreeksInputSchema = z.object({
  spotPrice: spotPriceSchema,
  strikePrice: strikePriceSchema,
  timeToExpirationYears: timeToExpirationYearsSchema,
  riskFreeRate: riskFreeRateSchema,
  volatility: volatilitySchema,
  optionType: z.enum(OPTION_TYPES),
  direction: z.enum(OPTION_DIRECTIONS).default('BUY').optional(),
  premium: premiumSchema.optional(),
});

export type CalculateGreeksInput = z.infer<typeof calculateGreeksInputSchema>;

export const payoffSimulationInputSchema = z.object({
  strikePrice: strikePriceSchema,
  premium: premiumSchema,
  quantity: quantitySchema,
  optionType: z.enum(OPTION_TYPES),
  direction: z.enum(OPTION_DIRECTIONS),
  currentSpotPrice: spotPriceSchema.optional(),
  stepsCount: z.number().int().min(5).max(100).default(21).optional(),
});

export type PayoffSimulationInput = z.infer<typeof payoffSimulationInputSchema>;
