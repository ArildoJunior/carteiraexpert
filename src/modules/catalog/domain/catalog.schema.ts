import { z } from 'zod';

export const catalogCategorySchema = z.enum(['stock', 'fii', 'etf', 'bdr']);

export const catalogSortBySchema = z.enum(['ticker', 'name', 'price', 'variation']);
export const catalogSortOrderSchema = z.enum(['asc', 'desc']);

export const catalogFilterSchema = z.object({
  category: catalogCategorySchema.optional(),
  query: z.string().optional().default(''),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sortBy: catalogSortBySchema.default('ticker'),
  sortOrder: catalogSortOrderSchema.default('asc'),
});

export const tickerParamSchema = z
  .string()
  .trim()
  .min(1, 'Ticker não pode ser vazio')
  .max(20, 'Ticker inválido')
  .regex(/^[A-Za-z0-9._-]+$/, 'Formato de ticker inválido')
  .transform((v) => v.toUpperCase());

export const catalogHistoryPeriodSchema = z.enum(['1M', '3M', '6M', '1Y', 'ALL']).default('1M');
export type CatalogHistoryPeriod = z.infer<typeof catalogHistoryPeriodSchema>;
