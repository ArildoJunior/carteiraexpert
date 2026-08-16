import type { portfolioEvents } from '@/lib/db/schema/portfolio';
import type { InferSelectModel } from 'drizzle-orm';

export type PortfolioEvent = InferSelectModel<typeof portfolioEvents>;

export type PortfolioEventType =
  | 'BUY'
  | 'SELL'
  | 'TRANSFER_IN'
  | 'TRANSFER_OUT'
  | 'MANUAL_ADJUSTMENT'
  | 'REVERSAL'
  | 'SPLIT'
  | 'GROUPING'
  | 'BONUS_SHARE'
  | 'DIVIDEND'
  | 'JCP';

export type EventSource = 'manual' | 'import' | 'corporate_action';
