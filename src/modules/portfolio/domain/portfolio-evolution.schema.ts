import { z } from 'zod';

export const EVOLUTION_PERIODS = [
  '1M',
  '3M',
  '6M',
  'YTD',
  '1Y',
  'ALL',
] as const;

export const evolutionPeriodSchema = z.enum(
  ['1M', '3M', '6M', 'YTD', '1Y', 'ALL'],
  {
    message:
      'Período de evolução inválido. Valores aceitos: 1M, 3M, 6M, YTD, 1Y, ALL.',
  }
);

export const getPortfolioEvolutionSchema = z.object({
  portfolioId: z.string().uuid('ID de carteira inválido.'),
  period: evolutionPeriodSchema.default('YTD'),
  referenceDate: z.coerce.date().optional(),
});

export type GetPortfolioEvolutionInput = z.infer<
  typeof getPortfolioEvolutionSchema
>;
