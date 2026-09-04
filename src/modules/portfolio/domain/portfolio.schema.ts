import { z } from 'zod';

export const createPortfolioSchema = z.object({
  name: z
    .string()
    .min(1, 'O nome da carteira é obrigatório.')
    .max(100, 'O nome da carteira não pode exceder 100 caracteres.')
    .transform((val) => val.trim())
    .refine((val) => val.length > 0, { message: 'O nome da carteira não pode ser vazio.' }),
  description: z
    .string()
    .max(500, 'A descrição não pode exceder 500 caracteres.')
    .transform((val) => val.trim())
    .nullable()
    .optional(),
  baseCurrency: z.enum(['BRL', 'USD', 'EUR']).default('BRL'),
  purpose: z.enum(['REAL', 'ESTUDO', 'ANALISE']).default('REAL'),
});

export type CreatePortfolioInput = z.input<typeof createPortfolioSchema>;
export type CreatePortfolioOutput = z.output<typeof createPortfolioSchema>;

export const updatePortfolioSchema = z.object({
  name: z
    .string()
    .min(1, 'O nome da carteira é obrigatório.')
    .max(100, 'O nome da carteira não pode exceder 100 caracteres.')
    .transform((val) => val.trim())
    .refine((val) => val.length > 0, { message: 'O nome da carteira não pode ser vazio.' })
    .optional(),
  description: z
    .string()
    .max(500, 'A descrição não pode exceder 500 caracteres.')
    .transform((val) => val.trim())
    .nullable()
    .optional(),
  status: z.enum(['active', 'archived']).optional(),
  purpose: z.enum(['REAL', 'ESTUDO', 'ANALISE']).optional(),
  confirmPurposeChange: z.boolean().optional(),
});

export type UpdatePortfolioInput = z.input<typeof updatePortfolioSchema>;
export type UpdatePortfolioOutput = z.output<typeof updatePortfolioSchema>;

