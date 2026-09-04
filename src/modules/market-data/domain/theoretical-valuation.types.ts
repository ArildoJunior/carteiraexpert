import type { Decimal } from '@/lib/decimal';
import type { FundamentalQuoteAudit } from './fundamentals.types';

export type ValuationModelType = 'BAZIN' | 'GRAHAM' | 'DCF_SIMPLIFIED';

export type ValuationCalculationStatus =
  | 'VALID'
  | 'NOT_APPLICABLE'
  | 'INSUFFICIENT_DATA'
  | 'INVALID_PREMISES';

export interface ValuationQuoteContext {
  price: Decimal;
  quoteDate: Date | string;
  source: string;
  delayStatus: string;
  isStale?: boolean;
  currency: string;
}

export interface ValuationFundamentalContext {
  netRevenue: Decimal | null;
  ebitda: Decimal | null;
  netIncome: Decimal | null;
  totalEquity: Decimal | null;
  totalAssets: Decimal | null;
  grossDebt: Decimal | null;
  cashEquivalents: Decimal | null;
  sharesCount: Decimal | null;
  dividendsDeclared: Decimal | null;
  currency: string;
  referencePeriod: string;
  referenceDate: Date | string;
  statementType: string;
}

// ─── 1. Bazin Model Types ───────────────────────────────────────────────────

export interface BazinPremises {
  /** Dividend Yield alvo anual em decimal (ex: 0.06 para 6.0%) */
  targetDividendYield: Decimal;
}

export interface BazinFactualInputs {
  dividendsDeclared: string | null;
  sharesCount: string | null;
  dpa: string | null; // Proventos por ação
  currency: string;
}

export interface BazinIntermediates {
  dpaDecimal: string | null;
}

// ─── 2. Graham Model Types ──────────────────────────────────────────────────

export interface GrahamPremises {
  /** Multiplicador clássico de Graham: 15 (P/L) * 1.5 (P/VP) = 22.5 */
  grahamMultiplier: Decimal;
}

export interface GrahamFactualInputs {
  netIncome: string | null;
  totalEquity: string | null;
  sharesCount: string | null;
  lpa: string | null; // Lucro por Ação
  vpa: string | null; // Valor Patrimonial por Ação
  currency: string;
}

export interface GrahamIntermediates {
  lpaDecimal: string | null;
  vpaDecimal: string | null;
  productLpaVpa: string | null;
}

// ─── 3. Simplified DCF Model Types ──────────────────────────────────────────

export interface DcfPremises {
  /** Taxa de desconto anual WACC / Custo de capital próprio em decimal (ex: 0.12 para 12%) */
  discountRate: Decimal;
  /** Taxa anual de crescimento da fase explícita (Estágio 1) em decimal (ex: 0.08 para 8%) */
  growthRateStage1: Decimal;
  /** Taxa de crescimento perpétuo na fase terminal (Estágio 2) em decimal (ex: 0.03 para 3%) */
  terminalGrowthRate: Decimal;
  /** Quantidade de anos da projeção explícita (Estágio 1, padrão 5) */
  projectionYears: number;
}

export interface DcfFactualInputs {
  netIncome: string | null;
  sharesCount: string | null;
  baseCashFlowPerShare: string | null; // LPA ou FCF por ação
  currency: string;
}

export interface DcfCashFlowProjectionYear {
  year: number;
  projectedFlow: string;
  discountFactor: string;
  presentValue: string;
}

export interface DcfIntermediates {
  baseFlowPerShare: string | null;
  yearlyProjections: DcfCashFlowProjectionYear[];
  presentValueOfExplicitPeriod: string | null;
  terminalValueYearN: string | null;
  presentValueOfTerminalValue: string | null;
}

// ─── Generic Model Result Interface ─────────────────────────────────────────

export interface TheoreticalModelResult<TPremises, TFactual, TIntermediates> {
  model: ValuationModelType;
  modelName: string;
  status: ValuationCalculationStatus;
  statusReason: string | null;
  intrinsicValue: Decimal | null;
  marginOfSafetyPercent: Decimal | null; // ((intrinsicValue - marketPrice) / marketPrice) * 100
  marketPriceUsed: Decimal | null;
  currency: string;
  premisesUsed: TPremises;
  factualInputs: TFactual;
  intermediates: TIntermediates;
  disclaimer: string;
}

export interface SerializedTheoreticalModelResult<TPremisesSerialized, TFactual, TIntermediates> {
  model: ValuationModelType;
  modelName: string;
  status: ValuationCalculationStatus;
  statusReason: string | null;
  intrinsicValue: string | null;
  marginOfSafetyPercent: string | null;
  marketPriceUsed: string | null;
  currency: string;
  premisesUsed: TPremisesSerialized;
  factualInputs: TFactual;
  intermediates: TIntermediates;
  disclaimer: string;
}

// ─── Aggregate Valuation Result Set ─────────────────────────────────────────

export interface TheoreticalValuationResultSet {
  assetId: string;
  ticker: string;
  referencePeriod: string;
  currency: string;
  statementType: string;
  quoteAudit: FundamentalQuoteAudit | null;
  currencyMismatch: boolean;
  bazin: TheoreticalModelResult<BazinPremises, BazinFactualInputs, BazinIntermediates>;
  graham: TheoreticalModelResult<GrahamPremises, GrahamFactualInputs, GrahamIntermediates>;
  dcf: TheoreticalModelResult<DcfPremises, DcfFactualInputs, DcfIntermediates>;
  globalDisclaimer: string;
  calculatedAt: Date;
}

export interface SerializedBazinPremises {
  targetDividendYield: string;
}

export interface SerializedGrahamPremises {
  grahamMultiplier: string;
}

export interface SerializedDcfPremises {
  discountRate: string;
  growthRateStage1: string;
  terminalGrowthRate: string;
  projectionYears: number;
}

export interface SerializedTheoreticalValuationResultSet {
  assetId: string;
  ticker: string;
  referencePeriod: string;
  currency: string;
  statementType: string;
  quoteAudit: FundamentalQuoteAudit | null;
  currencyMismatch: boolean;
  bazin: SerializedTheoreticalModelResult<
    SerializedBazinPremises,
    BazinFactualInputs,
    BazinIntermediates
  >;
  graham: SerializedTheoreticalModelResult<
    SerializedGrahamPremises,
    GrahamFactualInputs,
    GrahamIntermediates
  >;
  dcf: SerializedTheoreticalModelResult<
    SerializedDcfPremises,
    DcfFactualInputs,
    DcfIntermediates
  >;
  globalDisclaimer: string;
  calculatedAt: string;
}
