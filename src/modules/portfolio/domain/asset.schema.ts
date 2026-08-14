import { z } from 'zod';

export const ASSET_TYPES = [
  'stock',
  'fii',
  'etf',
  'bdr',
  'crypto',
  'international_stock',
  'option',
  'currency',
  'custom',
] as const;

export const MARKETS = ['B3', 'NYSE', 'NASDAQ', 'CRYPTO', 'CUSTOM'] as const;

export const CURRENCIES = ['BRL', 'USD', 'EUR'] as const;

export const tickerSchema = z
  .string()
  .transform((val) => val.trim().toUpperCase())
  .refine((val) => val.length >= 1, {
    message: 'O ticker do ativo é obrigatório.',
  })
  .refine((val) => val.length <= 20, {
    message: 'O ticker não pode exceder 20 caracteres.',
  })
  .refine((val) => /^[A-Z0-9._-]+$/.test(val), {
    message: 'O ticker deve conter apenas letras maiúsculas, números, pontos, hifens ou underscores.',
  });

export const createAssetSchema = z
  .object({
    ticker: tickerSchema,
    name: z
      .string()
      .min(1, 'O nome do ativo é obrigatório.')
      .max(150, 'O nome do ativo não pode exceder 150 caracteres.')
      .transform((val) => val.trim())
      .refine((val) => val.length > 0, { message: 'O nome do ativo não pode ser vazio.' }),
    assetType: z.enum(ASSET_TYPES, {
      message: 'Tipo de ativo inválido.',
    }),
    market: z.enum(MARKETS).default('B3'),
    currency: z.enum(CURRENCIES).default('BRL'),
    isCustom: z.boolean().default(false),
    userId: z.string().uuid('ID do usuário deve ser um UUID válido.').nullable().optional(),
  })
  .refine(
    (data) => {
      if (data.isCustom) {
        return (
          data.assetType === 'custom' &&
          data.market === 'CUSTOM' &&
          typeof data.userId === 'string' &&
          data.userId.length > 0
        );
      }
      return (
        data.assetType !== 'custom' &&
        data.market !== 'CUSTOM' &&
        (data.userId === null || data.userId === undefined)
      );
    },
    {
      message:
        'Incoerência na definição de ativo: ativos customizados (isCustom = true) exigem assetType "custom", market "CUSTOM" e userId válido; ativos globais (isCustom = false) não podem ter assetType "custom", market "CUSTOM" nem userId.',
      path: ['isCustom'],
    }
  );

export type CreateAssetInput = z.infer<typeof createAssetSchema>;

export const createCustomAssetSchema = z.object({
  ticker: tickerSchema,
  name: z
    .string()
    .min(1, 'O nome do ativo é obrigatório.')
    .max(150, 'O nome do ativo não pode exceder 150 caracteres.')
    .transform((val) => val.trim())
    .refine((val) => val.length > 0, { message: 'O nome do ativo não pode ser vazio.' }),
  assetType: z
    .literal('custom', {
      message: 'Ativos customizados devem ter assetType estritamente "custom".',
    })
    .default('custom'),
  market: z
    .literal('CUSTOM', {
      message: 'Ativos customizados devem ter market estritamente "CUSTOM".',
    })
    .default('CUSTOM'),
  currency: z.enum(CURRENCIES).default('BRL'),
  userId: z.string().uuid('ID do usuário deve ser um UUID válido.'),
});

export type CreateCustomAssetInput = z.infer<typeof createCustomAssetSchema>;

export const updateCustomAssetSchema = z.object({
  name: z
    .string()
    .min(1, 'O nome do ativo é obrigatório.')
    .max(150, 'O nome do ativo não pode exceder 150 caracteres.')
    .transform((val) => val.trim())
    .refine((val) => val.length > 0, { message: 'O nome do ativo não pode ser vazio.' })
    .optional(),
  assetType: z.literal('custom').optional(),
  currency: z.enum(CURRENCIES).optional(),
});

export type UpdateCustomAssetInput = z.infer<typeof updateCustomAssetSchema>;
