import type { portfolios } from '@/lib/db/schema/portfolio';
import type { InferSelectModel } from 'drizzle-orm';

export type Portfolio = InferSelectModel<typeof portfolios>;

export type PortfolioStatus = 'active' | 'archived' | 'frozen';

export type PortfolioPurpose = 'REAL' | 'ESTUDO' | 'ANALISE';

export type BaseCurrency = 'BRL' | 'USD' | 'EUR';
