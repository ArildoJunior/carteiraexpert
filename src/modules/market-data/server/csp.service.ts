import { z } from 'zod';
import { db, type DbExecutor } from '@/lib/db';
import { assets } from '@/lib/db/schema/portfolio';
import { cvmCompanies, cvmCompanyAssets } from '@/lib/db/schema/cvm-market-data';
import { eq, and, isNull, asc } from 'drizzle-orm';
import { Decimal } from '@/lib/decimal';
import type {
  CspAssetClass,
  CspWeightingMethod,
  CspAssetInput,
  CspEligibilityCriteria,
  CspConstraints,
  CspPortfolioResult,
  CspExclusionRecord,
} from '../domain/csp.types';
import {
  CspMixedAssetClassError,
  CspInfeasibleConstraintsError,
} from '../domain/csp.types';
import type { DataQualityStatus } from '../domain/theoretical-valuation.types';
import { generateSuggestedPortfolio } from '../domain/csp-engine';
import {
  cspSimulationInputSchema,
  type CspSimulationInput,
} from '../domain/csp.schema';
import { getRepresentativeFundamentals } from './fundamentals.service';
import { getLatestUsableQuote } from './unified-quote.service';
import { getPublicAssetTheoreticalValuation } from './theoretical-valuation.service';
import {
  calculateFundamentalIndicators,
  type FundamentalQuoteContext,
} from '../domain/fundamentals-engine';

export interface CspUniverseAsset {
  id: string;
  ticker: string;
  name: string;
  sector: string;
  currency: string;
  assetClass: CspAssetClass;
}

export interface SerializedCspAssetAllocation {
  ticker: string;
  sector: string;
  marketPrice: string;
  theoreticalPrice: string;
  marginOfSafetyPercent: string;
  weight: string;
  contribution: string;
}

export interface SerializedCspSummary {
  totalEvaluated: number;
  totalEligible: number;
  totalAllocated: number;
  totalWeightAllocated: string;
}

export interface SerializedCspTraceability {
  methodologyVersion: string;
  weightingMethod: CspWeightingMethod;
  criteria: {
    minMarginOfSafetyPercent: string;
    maxNetDebtToEbitda: string | null;
    maxNetDebtToEquity: string | null;
    minRoe: string | null;
    maxStaleDays: number;
    evaluationDate?: string;
  };
  constraints: {
    maxWeightPerAsset: string;
    maxWeightPerSector: string;
  };
  generatedAt: string;
  sources: string[];
}

export interface SerializedCspPortfolioResult {
  assetClass: CspAssetClass;
  weightingMethod: CspWeightingMethod;
  methodologyVersion: '1.0.0';
  dataQualityStatus: DataQualityStatus;
  allocations: SerializedCspAssetAllocation[];
  excludedAssets: CspExclusionRecord[];
  summary: SerializedCspSummary;
  traceability: SerializedCspTraceability;
  disclaimer: string;
}

export type CspSimulationResponse =
  | { success: true; data: SerializedCspPortfolioResult }
  | { success: false; error: { code: string; message: string } };

export function mapCspAssetClassToDb(assetClass: CspAssetClass): string {
  switch (assetClass) {
    case 'STOCK':
      return 'stock';
    case 'FII':
      return 'fii';
    case 'ETF':
      return 'etf';
    case 'CRYPTO':
      return 'crypto';
    default:
      return assetClass.toLowerCase();
  }
}

/**
 * Consulta o catálogo de ativos públicos para compor o universo analisado da CSP.
 */
export async function getCspUniverseAssets(
  assetClass: CspAssetClass = 'STOCK',
  executor: DbExecutor = db
): Promise<CspUniverseAsset[]> {
  const dbAssetType = mapCspAssetClassToDb(assetClass);

  const rows = await executor
    .select({
      id: assets.id,
      ticker: assets.ticker,
      name: assets.name,
      currency: assets.currency,
      industrySector: cvmCompanies.industrySector,
    })
    .from(assets)
    .leftJoin(
      cvmCompanyAssets,
      and(
        eq(cvmCompanyAssets.assetId, assets.id),
        eq(cvmCompanyAssets.status, 'APPROVED')
      )
    )
    .leftJoin(cvmCompanies, eq(cvmCompanyAssets.companyId, cvmCompanies.id))
    .where(
      and(
        eq(assets.assetType, dbAssetType),
        eq(assets.isCustom, false),
        isNull(assets.userId)
      )
    )
    .orderBy(asc(assets.ticker), asc(assets.id));

  const seenTickers = new Set<string>();
  const universe: CspUniverseAsset[] = [];

  for (const r of rows) {
    const normalizedTicker = r.ticker.trim().toUpperCase();
    if (!seenTickers.has(normalizedTicker)) {
      seenTickers.add(normalizedTicker);
      universe.push({
        id: r.id,
        ticker: normalizedTicker,
        name: r.name,
        sector: r.industrySector?.trim() || 'OUTROS',
        currency: r.currency,
        assetClass,
      });
    }
  }

  return universe;
}

/**
 * Constrói um objeto CspAssetInput a partir do demonstrativo CVM, cotação e valuation de consenso.
 * Retorna null caso cotação ou demonstrativo estejam ausentes ou inválidos.
 */
export async function buildCspAssetInput(
  asset: CspUniverseAsset,
  executor: DbExecutor = db,
  maxStaleDays: number = 5
): Promise<CspAssetInput | null> {
  const [statement, usableQuote, valuation] = await Promise.all([
    getRepresentativeFundamentals(asset.id, executor),
    getLatestUsableQuote(asset.ticker, executor),
    getPublicAssetTheoreticalValuation(asset.ticker, undefined, executor),
  ]);

  if (!statement || !usableQuote || !valuation) {
    return null;
  }

  if (!usableQuote.closePrice || usableQuote.closePrice.lessThanOrEqualTo(0)) {
    return null;
  }

  if (!valuation.consensus?.weightedTargetPrice) {
    return null;
  }

  let theoreticalPrice: Decimal;
  try {
    theoreticalPrice = new Decimal(valuation.consensus.weightedTargetPrice);
    if (theoreticalPrice.isZero() || theoreticalPrice.isNegative() || theoreticalPrice.isNaN()) {
      return null;
    }
  } catch {
    return null;
  }

  const marketPrice = usableQuote.closePrice;
  const marginOfSafetyPercent = theoreticalPrice
    .minus(marketPrice)
    .dividedBy(marketPrice)
    .times(100);

  const quoteContext: FundamentalQuoteContext = {
    price: usableQuote.closePrice,
    quoteDate: usableQuote.tradeDate,
    source: usableQuote.source,
    delayStatus: usableQuote.delayStatus,
    isStale: usableQuote.dataAgeDays > maxStaleDays || usableQuote.isOutdated,
    currency: usableQuote.currency,
  };

  const indicators = calculateFundamentalIndicators(statement, quoteContext);
  const roe = indicators.roe ? new Decimal(indicators.roe) : null;
  const netDebtToEbitda = indicators.netDebtToEbitda ? new Decimal(indicators.netDebtToEbitda) : null;
  const netDebtToEquity = indicators.netDebtToEquity ? new Decimal(indicators.netDebtToEquity) : null;

  const refDate = usableQuote.tradeDate || statement.referenceDate;
  const referenceDate = refDate.toISOString().slice(0, 10);

  let dataQualityStatus: DataQualityStatus = valuation.consensus.dataQualityStatus || 'VALID';
  if (
    statement.currency !== usableQuote.currency ||
    valuation.consensus.dataQualityStatus === 'INCOMPATIBLE'
  ) {
    dataQualityStatus = 'INCOMPATIBLE';
  } else if (usableQuote.dataAgeDays > maxStaleDays || usableQuote.isOutdated) {
    dataQualityStatus = 'STALE';
  } else if (
    dataQualityStatus === 'STALE' &&
    usableQuote.dataAgeDays <= maxStaleDays &&
    !usableQuote.isOutdated
  ) {
    dataQualityStatus = 'VALID';
  }

  return {
    ticker: asset.ticker,
    assetClass: asset.assetClass,
    sector: asset.sector,
    marketPrice,
    theoreticalPrice,
    marginOfSafetyPercent,
    roe,
    netDebtToEbitda,
    netDebtToEquity,
    referenceDate,
    dataQualityStatus,
  };
}

/**
 * Constrói a lista de entradas CspAssetInput[] para a classe de ativos solicitada.
 */
export async function buildCspAssetInputs(
  assetClass: CspAssetClass,
  criteria: CspEligibilityCriteria,
  executor: DbExecutor = db
): Promise<CspAssetInput[]> {
  const universe = await getCspUniverseAssets(assetClass, executor);
  const maxStaleDays = criteria?.maxStaleDays ?? 5;
  const results = await Promise.all(
    universe.map((asset) => buildCspAssetInput(asset, executor, maxStaleDays))
  );

  return results.filter((item): item is CspAssetInput => item !== null);
}

/**
 * Converte todos os Decimals em string para transmissão segura ao client-side.
 */
export function serializeCspPortfolioResult(
  result: CspPortfolioResult
): SerializedCspPortfolioResult {
  return {
    assetClass: result.assetClass,
    weightingMethod: result.weightingMethod,
    methodologyVersion: result.methodologyVersion,
    dataQualityStatus: result.dataQualityStatus,
    allocations: result.allocations.map((a) => ({
      ticker: a.ticker,
      sector: a.sector,
      marketPrice: a.marketPrice.toFixed(2),
      theoreticalPrice: a.theoreticalPrice.toFixed(2),
      marginOfSafetyPercent: a.marginOfSafetyPercent.toFixed(2),
      weight: a.weight.toFixed(4),
      contribution: a.contribution.toFixed(4),
    })),
    excludedAssets: result.excludedAssets,
    summary: {
      totalEvaluated: result.summary.totalEvaluated,
      totalEligible: result.summary.totalEligible,
      totalAllocated: result.summary.totalAllocated,
      totalWeightAllocated: result.summary.totalWeightAllocated.toFixed(4),
    },
    traceability: {
      methodologyVersion: result.traceability.methodologyVersion,
      weightingMethod: result.traceability.weightingMethod,
      criteria: {
        minMarginOfSafetyPercent: result.traceability.criteria.minMarginOfSafetyPercent.toFixed(2),
        maxNetDebtToEbitda: result.traceability.criteria.maxNetDebtToEbitda
          ? result.traceability.criteria.maxNetDebtToEbitda.toFixed(2)
          : null,
        maxNetDebtToEquity: result.traceability.criteria.maxNetDebtToEquity
          ? result.traceability.criteria.maxNetDebtToEquity.toFixed(2)
          : null,
        minRoe: result.traceability.criteria.minRoe
          ? result.traceability.criteria.minRoe.toFixed(4)
          : null,
        maxStaleDays: result.traceability.criteria.maxStaleDays,
        evaluationDate: result.traceability.criteria.evaluationDate
          ? (result.traceability.criteria.evaluationDate instanceof Date
              ? result.traceability.criteria.evaluationDate.toISOString()
              : String(result.traceability.criteria.evaluationDate))
          : undefined,
      },
      constraints: {
        maxWeightPerAsset: result.traceability.constraints.maxWeightPerAsset.toFixed(4),
        maxWeightPerSector: result.traceability.constraints.maxWeightPerSector.toFixed(4),
      },
      generatedAt: result.traceability.generatedAt,
      sources: result.traceability.sources,
    },
    disclaimer: result.disclaimer,
  };
}

/**
 * Orquestra a execução da simulação da Carteira Sugerida de Preços (CSP).
 * Função protegida e estritamente determinística.
 */
export async function runCspSimulation(
  input: CspSimulationInput,
  executor: DbExecutor = db
): Promise<CspSimulationResponse> {
  try {
    const parsed = cspSimulationInputSchema.parse(input);

    const criteria: CspEligibilityCriteria = {
      minMarginOfSafetyPercent: new Decimal(parsed.criteria.minMarginOfSafetyPercent),
      maxNetDebtToEbitda: parsed.criteria.maxNetDebtToEbitda
        ? new Decimal(parsed.criteria.maxNetDebtToEbitda)
        : null,
      maxNetDebtToEquity: parsed.criteria.maxNetDebtToEquity
        ? new Decimal(parsed.criteria.maxNetDebtToEquity)
        : null,
      minRoe: parsed.criteria.minRoe ? new Decimal(parsed.criteria.minRoe) : null,
      maxStaleDays: parsed.criteria.maxStaleDays,
      evaluationDate: parsed.criteria.evaluationDate || parsed.evaluationDate,
    };

    const constraints: CspConstraints = {
      maxWeightPerAsset: new Decimal(parsed.constraints.maxWeightPerAsset),
      maxWeightPerSector: new Decimal(parsed.constraints.maxWeightPerSector),
    };

    const inputs = await buildCspAssetInputs(parsed.assetClass, criteria, executor);

    const result = generateSuggestedPortfolio(inputs, {
      criteria,
      constraints,
      weightingMethod: parsed.weightingMethod,
      targetAssetClass: parsed.assetClass,
      evaluationDate: criteria.evaluationDate,
      allowPartialAllocation: parsed.allowPartialAllocation,
    });

    return {
      success: true,
      data: serializeCspPortfolioResult(result),
    };
  } catch (err: unknown) {
    if (err instanceof CspMixedAssetClassError) {
      return {
        success: false,
        error: {
          code: 'MIXED_ASSET_CLASS',
          message: err.message,
        },
      };
    }

    if (err instanceof CspInfeasibleConstraintsError) {
      return {
        success: false,
        error: {
          code: 'INFEASIBLE_CONSTRAINTS',
          message: err.message,
        },
      };
    }

    if (err instanceof z.ZodError) {
      return {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
        },
      };
    }

    console.error('[runCspSimulation] Internal error during CSP simulation:', err);

    return {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Não foi possível concluir a simulação da CSP.',
      },
    };
  }
}
