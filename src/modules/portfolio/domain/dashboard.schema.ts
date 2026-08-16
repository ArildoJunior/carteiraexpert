import { z } from 'zod';
import { PORTFOLIO_EVENT_TYPES } from './portfolio-event.schema';

export const listUserRecentEventsSchema = z.object({
  portfolioId: z.string().uuid().optional(),
  type: z.enum(PORTFOLIO_EVENT_TYPES).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  limit: z.number().int().min(1).max(50).default(10),
  offset: z.number().int().min(0).default(0),
});

export type ListUserRecentEventsInput = z.input<typeof listUserRecentEventsSchema>;
export type ListUserRecentEventsOutput = z.output<typeof listUserRecentEventsSchema>;

export const listUserHistorySchema = z.object({
  portfolioId: z.string().uuid().optional(),
  assetId: z.string().uuid().optional(),
  ticker: z.string().max(20).transform((v) => v?.trim().toUpperCase()).optional(),
  type: z.enum(PORTFOLIO_EVENT_TYPES).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export type ListUserHistoryInput = z.input<typeof listUserHistorySchema>;
export type ListUserHistoryOutput = z.output<typeof listUserHistorySchema>;
