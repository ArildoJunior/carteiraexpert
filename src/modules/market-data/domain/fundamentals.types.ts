import type { Decimal } from '@/lib/decimal';

export type StatementPeriodType = 'annual' | 'quarterly' | 'ttm';
export type StatementType = 'CONSOLIDATED' | 'INDIVIDUAL';
export type FundamentalSource = 'cvm' | 'b3' | 'manual' | 'internal' | (string & {});

export interface RawAssetFundamentalStatement {
  id: string;
  assetId: string;
  referencePeriod: string;
  periodType: StatementPeriodType;
  statementType: StatementType;
  referenceDate: Date;
  filingDate: Date | null;
  source: string;
  sourceReference: string | null;
  version: number;
  isRestated: boolean;
  currency: string;
  netRevenue: Decimal | null;
  ebitda: Decimal | null;
  netIncome: Decimal | null;
  totalEquity: Decimal | null;
  totalAssets: Decimal | null;
  grossDebt: Decimal | null;
  cashEquivalents: Decimal | null;
  sharesCount: Decimal | null;
  dividendsDeclared: Decimal | null;
  notes: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface FundamentalQuoteAudit {
  quotePriceUsed: string; // Decimal serializado como string
  quoteDateUsed: string;  // Data civil / timestamp da cotação
  quoteSource: 'market_quotes' | 'cotahist';
  quoteDelayStatus: string; // 'realtime' | 'delayed_15m' | 'eod'
  isQuoteStale: boolean;
  currency: string;
}

export interface CalculatedFundamentalIndicators {
  // Grandeza contábil derivada auxiliar (R$ monetário)
  netDebt: string | null;

  // 10 Indicadores financeiros determinísticos
  netMargin: string | null;        // NetIncome / NetRevenue (4 decimais)
  ebitdaMargin: string | null;     // EBITDA / NetRevenue (4 decimais)
  roe: string | null;              // NetIncome / TotalEquity (4 decimais)
  roa: string | null;              // NetIncome / TotalAssets (4 decimais)
  lpa: string | null;              // NetIncome / SharesCount (4 decimais)
  vpa: string | null;              // TotalEquity / SharesCount (4 decimais)
  netDebtToEbitda: string | null;  // NetDebt / EBITDA (2 decimais)
  peRatio: string | null;          // QuotePrice / LPA (2 decimais)
  pbRatio: string | null;          // QuotePrice / VPA (2 decimais)
  dividendYield: string | null;    // (DividendsDeclared / SharesCount) / QuotePrice (4 decimais)

  // Metadados de auditoria de cotação para múltiplos
  quoteAudit: FundamentalQuoteAudit | null;
  currencyMismatch: boolean;
}

export interface CvmCompanyMetadata {
  cnpj: string;
  cvmCode: string;
  legalName: string;
  tradeName?: string | null;
  industrySector?: string | null;
  marketType?: string | null;
}

export interface AssetFundamentalsViewData {
  statement: {
    referencePeriod: string;
    periodType: StatementPeriodType;
    statementType: StatementType;
    referenceDate: string;
    filingDate: string | null;
    source: string;
    sourceReference: string | null;
    version: number;
    isRestated: boolean;
    currency: string;
    netRevenue: string | null;
    ebitda: string | null;
    netIncome: string | null;
    totalEquity: string | null;
    totalAssets: string | null;
    grossDebt: string | null;
    cashEquivalents: string | null;
    sharesCount: string | null;
    dividendsDeclared: string | null;
    notes: string | null;
  };
  indicators: CalculatedFundamentalIndicators;
  cvmCompany?: CvmCompanyMetadata | null;
}
