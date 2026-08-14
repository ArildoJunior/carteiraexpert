import type { assets } from '@/lib/db/schema/portfolio';
import type { InferSelectModel } from 'drizzle-orm';

export type Asset = InferSelectModel<typeof assets>;

export type AssetType =
  | 'stock'
  | 'fii'
  | 'etf'
  | 'bdr'
  | 'crypto'
  | 'international_stock'
  | 'option'
  | 'currency'
  | 'custom';

export type Market = 'B3' | 'NYSE' | 'NASDAQ' | 'CRYPTO' | 'CUSTOM';

export type AssetCurrency = 'BRL' | 'USD' | 'EUR';
