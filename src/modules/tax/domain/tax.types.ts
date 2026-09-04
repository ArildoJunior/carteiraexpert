import type { Decimal } from '@/lib/decimal';

export type TaxCalculationRunStatus = 'RUNNING' | 'COMPLETED' | 'FAILED';
export type ExemptThresholdStatus = 'EXEMPT' | 'TAXABLE';

export interface UserTaxPreferences {
  defaultCapitalGainsRate: Decimal; // e.g. 0.15 (15%)
  exemptThresholdBrl: Decimal;      // e.g. 20000.00
  dayTradeRate: Decimal;            // e.g. 0.20 (20%)
  includeDayTrade: boolean;         // default true
  compensationEnabled: boolean;     // default true
}

export interface SerializedUserTaxPreferences {
  defaultCapitalGainsRate: string;
  exemptThresholdBrl: string;
  dayTradeRate: string;
  includeDayTrade: boolean;
  compensationEnabled: boolean;
}

export interface TaxCalculationRun {
  id: string;
  userId: string;
  referenceYear: number;
  referenceMonth: number | null;
  status: TaxCalculationRunStatus;
  errorMessage?: string | null;
  generatedAt: string;
}

export interface SerializedTaxCalculationRun {
  id: string;
  userId: string;
  referenceYear: number;
  referenceMonth: number | null;
  status: TaxCalculationRunStatus;
  errorMessage?: string | null;
  generatedAt: string;
}

export interface TaxMonthlySummary {
  id: string;
  userId: string;
  portfolioId: string | null;
  year: number;
  month: number;
  totalSales: Decimal;
  totalProceeds: Decimal;
  totalCost: Decimal;
  netGainLoss: Decimal;
  exemptThresholdStatus: ExemptThresholdStatus;
  applicableRate: Decimal;
  estimatedTax: Decimal;
  accumulatedLossCompensated: Decimal;
  generatedAt: string;
}

export interface SerializedTaxMonthlySummary {
  id: string;
  userId: string;
  portfolioId: string | null;
  year: number;
  month: number;
  totalSales: string;
  totalProceeds: string;
  totalCost: string;
  netGainLoss: string;
  exemptThresholdStatus: ExemptThresholdStatus;
  applicableRate: string;
  estimatedTax: string;
  accumulatedLossCompensated: string;
  generatedAt: string;
}

export interface TaxLossCredit {
  id: string;
  userId: string;
  year: number;
  monthOrigin: number;
  assetSymbol: string;
  originalLossAmount: Decimal;
  remainingAmount: Decimal;
  expiresOn: string;
}

export interface SerializedTaxLossCredit {
  id: string;
  userId: string;
  year: number;
  monthOrigin: number;
  assetSymbol: string;
  originalLossAmount: string;
  remainingAmount: string;
  expiresOn: string;
}

export interface TaxTimelineEvent {
  id: string;
  portfolioId: string;
  assetId: string;
  assetSymbol: string;
  assetName: string;
  assetType: string; // 'stock' | 'fii' | 'etf' | 'bdr' | etc.
  type: string;      // 'BUY' | 'SELL' | 'SPLIT' | 'GROUPING' | 'BONUS_SHARE' | 'DIVIDEND' | 'JCP'
  tradeDate: Date;
  settlementDate?: Date | null;
  quantity: Decimal;
  unitPrice: Decimal;
  fees: Decimal;
  currency: string;
  notes?: string | null;
  isDayTrade?: boolean;
}

export interface TaxAssetMonthlyResult {
  assetId: string;
  assetSymbol: string;
  assetName: string;
  assetType: string;
  salesCount: number;
  totalQuantitySold: Decimal;
  totalSalesProceeds: Decimal;
  totalCostOfGoodsSold: Decimal;
  averageCostAtSale: Decimal;
  netGainLoss: Decimal;
  isDayTrade: boolean;
}

export interface SerializedTaxAssetMonthlyResult {
  assetId: string;
  assetSymbol: string;
  assetName: string;
  assetType: string;
  salesCount: number;
  totalQuantitySold: string;
  totalSalesProceeds: string;
  totalCostOfGoodsSold: string;
  averageCostAtSale: string;
  netGainLoss: string;
  isDayTrade: boolean;
}

export interface TaxMonthlyCalculationResult {
  year: number;
  month: number;
  totalSalesOverall: Decimal;
  totalSalesStock: Decimal;
  totalSalesFii: Decimal;
  totalSalesEtfBdr: Decimal;
  isStockExempt: boolean; // totalSalesStock <= exemptThreshold
  exemptGainStock: Decimal;
  taxableGainStock: Decimal;
  taxableLossStock: Decimal;
  fiiGain: Decimal;
  fiiLoss: Decimal;
  etfBdrGain: Decimal;
  etfBdrLoss: Decimal;
  dayTradeGain: Decimal;
  dayTradeLoss: Decimal;
  grossTaxableSwingBase: Decimal;
  grossTaxableDayTradeBase: Decimal;
  lossCompensatedSwing: Decimal;
  lossCompensatedDayTrade: Decimal;
  netTaxableSwingBase: Decimal;
  netTaxableDayTradeBase: Decimal;
  swingTradeTax: Decimal;
  dayTradeTax: Decimal;
  totalEstimatedTax: Decimal;
  assetResults: TaxAssetMonthlyResult[];
  newLossCreditsGenerated: {
    assetSymbol: string;
    amount: Decimal;
    originMonth: number;
  }[];
}

export interface SerializedTaxMonthlyCalculationResult {
  year: number;
  month: number;
  totalSalesOverall: string;
  totalSalesStock: string;
  totalSalesFii: string;
  totalSalesEtfBdr: string;
  isStockExempt: boolean;
  exemptGainStock: string;
  taxableGainStock: string;
  taxableLossStock: string;
  fiiGain: string;
  fiiLoss: string;
  etfBdrGain: string;
  etfBdrLoss: string;
  dayTradeGain: string;
  dayTradeLoss: string;
  grossTaxableSwingBase: string;
  grossTaxableDayTradeBase: string;
  lossCompensatedSwing: string;
  lossCompensatedDayTrade: string;
  netTaxableSwingBase: string;
  netTaxableDayTradeBase: string;
  swingTradeTax: string;
  dayTradeTax: string;
  totalEstimatedTax: string;
  assetResults: SerializedTaxAssetMonthlyResult[];
}

export interface TaxBensEDireitosItem {
  assetId: string;
  assetSymbol: string;
  assetName: string;
  assetType: string;
  cnpj?: string | null;
  quantityAtYearEnd: Decimal;
  averageCostAtYearEnd: Decimal;
  totalCostAtYearEnd: Decimal;
  discrimination: string;
}

export interface SerializedTaxBensEDireitosItem {
  assetId: string;
  assetSymbol: string;
  assetName: string;
  assetType: string;
  cnpj?: string | null;
  quantityAtYearEnd: string;
  averageCostAtYearEnd: string;
  totalCostAtYearEnd: string;
  discrimination: string;
}

export interface TaxRendimentoItem {
  assetSymbol: string;
  assetName: string;
  type: 'DIVIDEND' | 'JCP' | 'FII_INCOME';
  grossAmount: Decimal;
  irrfAmount: Decimal;
  netAmount: Decimal;
  date: string;
}

export interface SerializedTaxRendimentoItem {
  assetSymbol: string;
  assetName: string;
  type: 'DIVIDEND' | 'JCP' | 'FII_INCOME';
  grossAmount: string;
  irrfAmount: string;
  netAmount: string;
  date: string;
}

export interface TaxAnnualReport {
  year: number;
  months: TaxMonthlyCalculationResult[];
  totalAnnualSales: Decimal;
  totalAnnualNetGainLoss: Decimal;
  totalAnnualEstimatedTax: Decimal;
  totalIrrfRetidoJcp: Decimal;
  totalIrrfRetidoDividendos: Decimal;
  totalRendimentosIsentosDividendos: Decimal;
  totalRendimentosIsentosFii: Decimal;
  remainingLossCredits: TaxLossCredit[];
  bensEDireitosSheet: TaxBensEDireitosItem[];
  rendimentosIsentosSheet: TaxRendimentoItem[];
  rendimentosTributaveisSheet: TaxRendimentoItem[];
  tributacaoExclusivaSheet: TaxRendimentoItem[]; // JCP bruto, IRRF retido, líquido
  disclaimer: string;
}

export interface SerializedTaxAnnualReport {
  year: number;
  months: SerializedTaxMonthlyCalculationResult[];
  totalAnnualSales: string;
  totalAnnualNetGainLoss: string;
  totalAnnualEstimatedTax: string;
  totalIrrfRetidoJcp: string;
  totalIrrfRetidoDividendos: string;
  totalRendimentosIsentosDividendos: string;
  totalRendimentosIsentosFii: string;
  remainingLossCredits: SerializedTaxLossCredit[];
  bensEDireitosSheet: SerializedTaxBensEDireitosItem[];
  rendimentosIsentosSheet: SerializedTaxRendimentoItem[];
  rendimentosTributaveisSheet: SerializedTaxRendimentoItem[];
  tributacaoExclusivaSheet: SerializedTaxRendimentoItem[];
  disclaimer: string;
}
