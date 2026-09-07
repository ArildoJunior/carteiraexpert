import type { Decimal } from '@/lib/decimal';
import type { DataQualityStatus } from './theoretical-valuation.types';

export type CspAssetClass = 'STOCK' | 'FII' | 'ETF' | 'FUND' | 'CRYPTO' | 'OTHER';

export type CspWeightingMethod = 'EQUIPONDERADA' | 'MARGEM_SEGURANCA';

export type CspExclusionReason =
  | 'MARGEM_NEGATIVA'
  | 'DIVIDA_ACIMA_DO_LIMITE'
  | 'COTACAO_DEFASADA'
  | 'COTACAO_INDISPONIVEL'
  | 'ROE_ABAIXO_DO_MINIMO'
  | 'LIQUIDEZ_INSUFICIENTE'
  | 'CLASSE_INCOMPATIVEL'
  | 'DADOS_INCOMPLETOS';

export interface CspAssetInput {
  ticker: string;
  assetClass: CspAssetClass;
  sector: string;
  marketPrice: Decimal;
  theoreticalPrice: Decimal;
  marginOfSafetyPercent: Decimal;
  roe: Decimal | null;
  netDebtToEbitda: Decimal | null;
  netDebtToEquity: Decimal | null;
  referenceDate: string;
  dataQualityStatus: DataQualityStatus;
}

export interface CspEligibilityCriteria {
  minMarginOfSafetyPercent: Decimal;
  maxNetDebtToEbitda: Decimal | null;
  maxNetDebtToEquity: Decimal | null;
  minRoe: Decimal | null;
  maxStaleDays: number;
  evaluationDate?: string | Date;
}

export interface CspConstraints {
  maxWeightPerAsset: Decimal;
  maxWeightPerSector: Decimal;
}

export interface CspAssetAllocation {
  ticker: string;
  sector: string;
  marketPrice: Decimal;
  theoreticalPrice: Decimal;
  marginOfSafetyPercent: Decimal;
  weight: Decimal;
  contribution: Decimal;
}

export interface CspExclusionRecord {
  ticker: string;
  reason: CspExclusionReason;
  detail: string;
}

export interface CspSummary {
  totalEvaluated: number;
  totalEligible: number;
  totalAllocated: number;
  totalWeightAllocated: Decimal;
}

export interface CspTraceability {
  methodologyVersion: string;
  weightingMethod: CspWeightingMethod;
  criteria: CspEligibilityCriteria;
  constraints: CspConstraints;
  generatedAt: string;
  sources: string[];
}

export interface CspPortfolioResult {
  assetClass: CspAssetClass;
  weightingMethod: CspWeightingMethod;
  methodologyVersion: '1.0.0';
  dataQualityStatus: DataQualityStatus;
  allocations: CspAssetAllocation[];
  excludedAssets: CspExclusionRecord[];
  summary: CspSummary;
  traceability: CspTraceability;
  disclaimer: string;
}

export class CspError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CspError';
  }
}

export class CspMixedAssetClassError extends CspError {
  readonly classes: CspAssetClass[];

  constructor(classes: CspAssetClass[]) {
    super(`CSP não admite mistura de classes de ativos. Recebido: ${classes.join(', ')}`);
    this.name = 'CspMixedAssetClassError';
    this.classes = classes;
  }
}

export class CspInfeasibleConstraintsError extends CspError {
  readonly maxFeasibleCapacity: Decimal;
  readonly constraints: CspConstraints;

  constructor(maxFeasibleCapacity: Decimal, constraints: CspConstraints) {
    super(
      `Capacidade máxima combinada dos ativos (${maxFeasibleCapacity.times(100).toFixed(2)}%) é inferior a 100,00% sob os limites de concentração configurados (maxWeightPerAsset: ${constraints.maxWeightPerAsset.times(100).toFixed(2)}%, maxWeightPerSector: ${constraints.maxWeightPerSector.times(100).toFixed(2)}%).`
    );
    this.name = 'CspInfeasibleConstraintsError';
    this.maxFeasibleCapacity = maxFeasibleCapacity;
    this.constraints = constraints;
  }
}
