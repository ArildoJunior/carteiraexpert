export interface B3HistoricalQuoteItem {
  id: string;
  batchId: string;
  tradeDate: string; // Formato YYYY-MM-DD
  tradeDateFormatted: string; // Formato DD/MM/YYYY
  ticker: string;
  bdiCode: string;
  marketType: number;
  marketTypeDescription: string;
  shortName: string;
  specification: string;
  forwardTermDays: string | null;
  currency: string;
  openPrice: string;
  highPrice: string;
  lowPrice: string;
  averagePrice: string;
  closePrice: string;
  bestBidPrice: string | null;
  bestAskPrice: string | null;
  tradeCount: number;
  quantity: string;
  financialVolume: string;
  strikePrice: string | null;
  expirationDate: string | null;
  quotationFactor: number;
  isin: string | null;
  distributionNumber: number | null;
  assetId: string | null;
}

export interface B3HistoricalQuotesFilter {
  ticker?: string;
  startDate?: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
  order?: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface B3HistoricalQuotesResult {
  quotes: B3HistoricalQuoteItem[];
  totalCount: number;
  page: number;
  limit: number;
  totalPages: number;
  ticker: string;
  startDate?: string;
  endDate?: string;
  order: 'asc' | 'desc';
}
