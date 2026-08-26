/**
 * Tipagens canônicas do Catálogo Público de Ativos (Fase 06.5).
 */

export type CatalogAssetCategory = 'stock' | 'fii' | 'etf' | 'bdr';

export type DelayStatus = 'realtime' | 'delayed_15m' | 'eod' | 'manual' | 'unknown';

export type DerivedFreshnessStatus = DelayStatus | 'stale' | 'unquoted';

export type VariationStatus = 'available' | 'insufficient_history' | 'unavailable';

export interface PublicAssetSummary {
  id: string;
  ticker: string;
  name: string;
  assetType: string;
  market: string;
  currency: string;
  latestPrice: string | null;
  quoteDate: string | null;
  delayStatus: DelayStatus | null;
  freshnessStatus: DerivedFreshnessStatus;
  dailyVariation: string | null; // Percentual com 2 casas decimais (ex: "1.45" ou "-0.82")
  variationStatus: VariationStatus;
}

export interface PublicAssetDetail extends PublicAssetSummary {
  previousClosePrice: string | null;
  previousCloseDate: string | null;
}

export interface PublicQuoteHistoryPoint {
  date: string; // YYYY-MM-DD no fuso do mercado
  price: string;
  quoteDate: string; // ISO
}

export interface CatalogFilterParams {
  category?: CatalogAssetCategory;
  query?: string;
  page?: number;
  limit?: number;
  sortBy?: 'ticker' | 'name' | 'price' | 'variation';
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedCatalogResult {
  items: PublicAssetSummary[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
