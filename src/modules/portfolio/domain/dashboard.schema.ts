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
