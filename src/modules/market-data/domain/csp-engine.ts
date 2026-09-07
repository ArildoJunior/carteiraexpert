/**
 * CSP (Carteira Sugerida de Preços) — Motor puro, determinístico e auditável.
 *
 * Este motor é puramente descritivo, educacional e informativo.
 * NÃO altera carteira real, custódia, eventos, saldos ou posições.
 * NÃO emite recomendação de investimento.
 *
 * Qualquer alteração material nas fórmulas exige bump de methodologyVersion.
 */

import { Decimal } from '@/lib/decimal';
import type { DataQualityStatus } from './theoretical-valuation.types';
import {
  type CspAssetClass,
  type CspWeightingMethod,
  type CspAssetInput,
  type CspEligibilityCriteria,
  type CspConstraints,
  type CspAssetAllocation,
  type CspExclusionRecord,
  type CspSummary,
  type CspTraceability,
  type CspPortfolioResult,
  CspMixedAssetClassError,
  CspInfeasibleConstraintsError,
} from './csp.types';

export const CSP_METHODOLOGY_VERSION = '1.0.0';

export const CSP_DISCLAIMER =
  'Esta sugestão é puramente quantitativa, gerada por algoritmo determinístico a partir de dados públicos. NÃO constitui recomendação de investimento, consultoria financeira ou análise de suitability. A plataforma não mantém custódia, não executa ordens e não se responsabiliza por decisões tomadas com base neste output. Decisões de investimento são de responsabilidade exclusiva do usuário.';

export const DEFAULT_CSP_CRITERIA: CspEligibilityCriteria = {
  minMarginOfSafetyPercent: new Decimal('0.00'), // Margem de segurança positiva
  maxNetDebtToEbitda: new Decimal('3.50'), // Alavancagem máxima de 3.5x
  maxNetDebtToEquity: new Decimal('2.00'), // Dívida Líquida / PL máximo de 2.0x
  minRoe: new Decimal('0.05'), // ROE mínimo de 5%
  maxStaleDays: 5, // Cotação de no máximo 5 dias
};

export const DEFAULT_CSP_CONSTRAINTS: CspConstraints = {
  maxWeightPerAsset: new Decimal('0.20'), // 20% máximo por ativo
  maxWeightPerSector: new Decimal('0.40'), // 40% máximo por setor
};

export interface GenerateSuggestedPortfolioOptions {
  criteria?: Partial<CspEligibilityCriteria>;
  constraints?: Partial<CspConstraints>;
  weightingMethod?: CspWeightingMethod;
  targetAssetClass?: CspAssetClass;
  evaluationDate?: string | Date;
  allowPartialAllocation?: boolean;
}

export interface CalculatePortfolioWeightsOptions {
  allowPartialAllocation?: boolean;
}

/**
 * Converte data em string ('YYYY-MM-DD' ou ISO) ou Date para timestamp UTC meia-noite
 * para contagem determinística de dias corridos sem distorção por fuso horário.
 */
export function parseDateToUtcMidnight(d: string | Date): number {
  if (d instanceof Date) {
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }
  const dateStr = d.split('T')[0];
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const year = Number.parseInt(parts[0], 10);
    const month = Number.parseInt(parts[1], 10) - 1;
    const day = Number.parseInt(parts[2], 10);
    if (!Number.isNaN(year) && !Number.isNaN(month) && !Number.isNaN(day)) {
      return Date.UTC(year, month, day);
    }
  }
  const parsed = new Date(d);
  return Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate());
}

/**
 * 1. Filtragem e saneamento de elegibilidade dos ativos.
 * Rejeita qualquer lote que contenha mais de uma classe de ativos com CspMixedAssetClassError.
 * Aplica cálculo determinístico de defasagem temporal baseado em maxStaleDays e evaluationDate.
 */
export function filterEligibleAssets(
  inputs: CspAssetInput[],
  criteria: CspEligibilityCriteria,
  targetAssetClass?: CspAssetClass,
  evaluationDate?: string | Date
): { eligible: CspAssetInput[]; excluded: CspExclusionRecord[] } {
  const eligible: CspAssetInput[] = [];
  const excluded: CspExclusionRecord[] = [];

  if (inputs.length === 0) {
    return { eligible, excluded };
  }

  // Validação inegociável de homogeneidade de classe de ativos (Ajuste 5)
  const uniqueClasses = Array.from(new Set(inputs.map((i) => i.assetClass)));
  if (uniqueClasses.length > 1) {
    throw new CspMixedAssetClassError(uniqueClasses);
  }

  const batchClass = uniqueClasses[0];
  if (targetAssetClass && batchClass !== targetAssetClass) {
    throw new CspMixedAssetClassError([batchClass, targetAssetClass]);
  }

  const effectiveEvalDate = evaluationDate ?? criteria.evaluationDate ?? new Date();
  const evalUtcMidnight = parseDateToUtcMidnight(effectiveEvalDate);

  for (const asset of inputs) {
    // 1. Verificação de incompatibilidade ou divergência cambial
    if (asset.dataQualityStatus === 'INCOMPATIBLE') {
      excluded.push({
        ticker: asset.ticker,
        reason: 'CLASSE_INCOMPATIVEL',
        detail: 'Ativo com dados incompatíveis ou divergência cambial bloqueante detectada.',
      });
      continue;
    }

    // 2. Cotação de mercado válida
    if (asset.marketPrice.isZero() || asset.marketPrice.isNegative()) {
      excluded.push({
        ticker: asset.ticker,
        reason: 'COTACAO_INDISPONIVEL',
        detail: `Preço de mercado nulo ou inválido (valor: ${asset.marketPrice.toString()}).`,
      });
      continue;
    }

    // 3. Preço teórico válido
    if (asset.theoreticalPrice.isZero() || asset.theoreticalPrice.isNegative()) {
      excluded.push({
        ticker: asset.ticker,
        reason: 'DADOS_INCOMPLETOS',
        detail: `Preço teórico nulo ou não positivo (valor: ${asset.theoreticalPrice.toString()}).`,
      });
      continue;
    }

    // 4. Margem de segurança mínima
    if (asset.marginOfSafetyPercent.lessThan(criteria.minMarginOfSafetyPercent)) {
      excluded.push({
        ticker: asset.ticker,
        reason: 'MARGEM_NEGATIVA',
        detail: `Margem de segurança (${asset.marginOfSafetyPercent.toFixed(2)}%) inferior ao mínimo exigido (${criteria.minMarginOfSafetyPercent.toFixed(2)}%).`,
      });
      continue;
    }

    // 5. Cotação defasada temporalmente ou marcada com status STALE
    const refUtcMidnight = parseDateToUtcMidnight(asset.referenceDate);
    const diffMs = evalUtcMidnight - refUtcMidnight;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const isExceededStaleDays = diffDays > criteria.maxStaleDays;

    if (asset.dataQualityStatus === 'STALE' || isExceededStaleDays) {
      excluded.push({
        ticker: asset.ticker,
        reason: 'COTACAO_DEFASADA',
        detail: isExceededStaleDays
          ? `Cotação com defasagem temporal de ${diffDays} dias, superior ao limite de ${criteria.maxStaleDays} dias.`
          : `Cotação marcada com status de defasagem (STALE).`,
      });
      continue;
    }

    // 6. Alavancagem: Dívida Líquida / EBITDA
    if (
      criteria.maxNetDebtToEbitda !== null &&
      asset.netDebtToEbitda !== null &&
      asset.netDebtToEbitda.greaterThan(criteria.maxNetDebtToEbitda)
    ) {
      excluded.push({
        ticker: asset.ticker,
        reason: 'DIVIDA_ACIMA_DO_LIMITE',
        detail: `Dívida Líquida / EBITDA (${asset.netDebtToEbitda.toFixed(2)}x) superior ao teto permitido (${criteria.maxNetDebtToEbitda.toFixed(2)}x).`,
      });
      continue;
    }

    // 7. Alavancagem: Dívida Líquida / PL
    if (
      criteria.maxNetDebtToEquity !== null &&
      asset.netDebtToEquity !== null &&
      asset.netDebtToEquity.greaterThan(criteria.maxNetDebtToEquity)
    ) {
      excluded.push({
        ticker: asset.ticker,
        reason: 'DIVIDA_ACIMA_DO_LIMITE',
        detail: `Dívida Líquida / PL (${asset.netDebtToEquity.toFixed(2)}x) superior ao teto permitido (${criteria.maxNetDebtToEquity.toFixed(2)}x).`,
      });
      continue;
    }

    // 8. Rentabilidade: ROE mínimo
    if (
      criteria.minRoe !== null &&
      (asset.roe === null || asset.roe.lessThan(criteria.minRoe))
    ) {
      excluded.push({
        ticker: asset.ticker,
        reason: 'ROE_ABAIXO_DO_MINIMO',
        detail: `ROE (${asset.roe ? asset.roe.toFixed(4) : 'N/A'}) inferior ao mínimo exigido (${criteria.minRoe.toFixed(4)}).`,
      });
      continue;
    }

    // Aprovado em todos os filtros objetivos
    eligible.push(asset);
  }

  return { eligible, excluded };
}

/**
 * 2. Ranqueamento determinístico por margem de segurança decrescente.
 * Desempate secundário por ordem alfabética de ticker.
 */
export function rankAssetsByMarginOfSafety(eligible: CspAssetInput[]): CspAssetInput[] {
  return [...eligible].sort((a, b) => {
    if (b.marginOfSafetyPercent.greaterThan(a.marginOfSafetyPercent)) return 1;
    if (a.marginOfSafetyPercent.greaterThan(b.marginOfSafetyPercent)) return -1;
    return a.ticker.localeCompare(b.ticker);
  });
}

/**
 * 3. Cálculo determinístico de alocação de pesos.
 * Aplica travas paramétricas de concentração máxima por ativo e por setor.
 * Detecta e rejeita capacidade máxima inviável (< 100,00%) com CspInfeasibleConstraintsError.
 * Garante que NENHUM peso individual e NENHUM peso setorial ultrapasse os tetos após arredondamento.
 */
export function calculatePortfolioWeights(
  ranked: CspAssetInput[],
  constraints: CspConstraints,
  method: CspWeightingMethod,
  options?: CalculatePortfolioWeightsOptions
): CspAssetAllocation[] {
  if (ranked.length === 0) {
    return [];
  }

  const n = ranked.length;
  const maxAssetCap = constraints.maxWeightPerAsset;
  const maxSectorCap = constraints.maxWeightPerSector;

  // 1. Cálculo da capacidade máxima teórica combinada da carteira
  // Cada setor S tem k_S ativos. A capacidade máxima de S é min(k_S * maxAssetCap, maxSectorCap).
  // A capacidade máxima total é a soma das capacidades dos setores.
  const sectorCountMap = new Map<string, number>();
  for (const asset of ranked) {
    sectorCountMap.set(asset.sector, (sectorCountMap.get(asset.sector) ?? 0) + 1);
  }

  let maxFeasibleCapacity = new Decimal(0);
  for (const [_, count] of sectorCountMap.entries()) {
    const sectorAssetSumCap = maxAssetCap.times(new Decimal(count));
    const effectiveSectorCap = sectorAssetSumCap.lessThan(maxSectorCap)
      ? sectorAssetSumCap
      : maxSectorCap;
    maxFeasibleCapacity = maxFeasibleCapacity.plus(effectiveSectorCap);
  }

  const targetTotal = new Decimal('1.0000');
  if (maxFeasibleCapacity.lessThan(targetTotal)) {
    if (!options?.allowPartialAllocation) {
      throw new CspInfeasibleConstraintsError(maxFeasibleCapacity, constraints);
    }
  }

  const effectiveTargetWeight = maxFeasibleCapacity.lessThan(targetTotal)
    ? maxFeasibleCapacity
    : targetTotal;

  let rawWeights: Decimal[] = [];

  if (method === 'EQUIPONDERADA') {
    const equalWeight = effectiveTargetWeight.dividedBy(new Decimal(n));
    rawWeights = ranked.map(() => equalWeight);
  } else {
    // Ponderação proporcional à margem de segurança positiva
    const sumMargins = ranked.reduce(
      (acc, a) => acc.plus(a.marginOfSafetyPercent),
      new Decimal(0)
    );

    if (sumMargins.isZero() || sumMargins.isNegative()) {
      const fallbackEqual = effectiveTargetWeight.dividedBy(new Decimal(n));
      rawWeights = ranked.map(() => fallbackEqual);
    } else {
      rawWeights = ranked.map((a) =>
        effectiveTargetWeight.times(a.marginOfSafetyPercent).dividedBy(sumMargins)
      );
    }
  }

  // Aplicação iterativa de travas de concentração (Cap por Ativo e Cap por Setor)
  let weights = [...rawWeights];

  // Passadas de redistribuição de excesso
  for (let iter = 0; iter < 20; iter++) {
    let excessToRedistribute = new Decimal(0);

    // 1. Aplica teto individual por ativo
    for (let i = 0; i < n; i++) {
      if (weights[i].greaterThan(maxAssetCap)) {
        excessToRedistribute = excessToRedistribute.plus(weights[i].minus(maxAssetCap));
        weights[i] = maxAssetCap;
      }
    }

    // 2. Aplica teto por setor
    const sectorWeights = new Map<string, Decimal>();
    for (let i = 0; i < n; i++) {
      const sector = ranked[i].sector;
      const current = sectorWeights.get(sector) ?? new Decimal(0);
      sectorWeights.set(sector, current.plus(weights[i]));
    }

    for (const [sector, totalSectorWeight] of sectorWeights.entries()) {
      if (totalSectorWeight.greaterThan(maxSectorCap)) {
        const sectorRatio = maxSectorCap.dividedBy(totalSectorWeight);
        for (let i = 0; i < n; i++) {
          if (ranked[i].sector === sector) {
            const cappedWeight = weights[i].times(sectorRatio);
            excessToRedistribute = excessToRedistribute.plus(weights[i].minus(cappedWeight));
            weights[i] = cappedWeight;
          }
        }
      }
    }

    // Recalcula totais setoriais após aplicação de tetos
    sectorWeights.clear();
    for (let i = 0; i < n; i++) {
      const current = sectorWeights.get(ranked[i].sector) ?? new Decimal(0);
      sectorWeights.set(ranked[i].sector, current.plus(weights[i]));
    }

    if (excessToRedistribute.isZero() || excessToRedistribute.lessThan(new Decimal('0.000001'))) {
      break;
    }

    // Identifica ativos com capacidade restante tanto individual quanto setorial
    const availableCapacities: { index: number; remainingCap: Decimal }[] = [];
    for (let i = 0; i < n; i++) {
      const remainingAssetCap = maxAssetCap.minus(weights[i]);
      const currentSectorSum = sectorWeights.get(ranked[i].sector) ?? new Decimal(0);
      const remainingSectorCap = maxSectorCap.minus(currentSectorSum);

      const minCap = remainingAssetCap.lessThan(remainingSectorCap)
        ? remainingAssetCap
        : remainingSectorCap;

      if (minCap.greaterThan(new Decimal('0.000001'))) {
        availableCapacities.push({ index: i, remainingCap: minCap });
      }
    }

    if (availableCapacities.length === 0) {
      break;
    }

    const share = excessToRedistribute.dividedBy(new Decimal(availableCapacities.length));
    for (const item of availableCapacities) {
      const addition = share.lessThan(item.remainingCap) ? share : item.remainingCap;
      weights[item.index] = weights[item.index].plus(addition);
    }
  }

  // Truncamento conservador (ROUND_DOWN) em 4 casas decimais.
  // Garante matematicamente que w[i] <= maxAssetCap e sum(w in S) <= maxSectorCap.
  const finalWeights: Decimal[] = weights.map((w) =>
    w.toDecimalPlaces(4, Decimal.ROUND_DOWN)
  );

  let currentTotal = finalWeights.reduce((acc, w) => acc.plus(w), new Decimal(0));
  let diff = effectiveTargetWeight.minus(currentTotal);

  // Redistribuição determinística dos centésimos (passos de 0.0001) estritamente entre ativos
  // que possuam capacidade disponível (sem violar maxAssetCap e sem violar maxSectorCap)
  const step = new Decimal('0.0001');

  // Recalcula totais setoriais dos pesos truncados
  const finalSectorWeights = new Map<string, Decimal>();
  for (let i = 0; i < n; i++) {
    const s = ranked[i].sector;
    finalSectorWeights.set(s, (finalSectorWeights.get(s) ?? new Decimal(0)).plus(finalWeights[i]));
  }

  // Enquanto houver sobra a redistribuir (diff >= 0.0001)
  while (diff.greaterThanOrEqualTo(step)) {
    let allocated = false;

    // Percorre os ativos ordenados por margem de segurança decrescente
    for (let i = 0; i < n; i++) {
      const asset = ranked[i];
      const nextWeight = finalWeights[i].plus(step);
      const nextSectorWeight = (finalSectorWeights.get(asset.sector) ?? new Decimal(0)).plus(step);

      // Verifica estritamente AMBOS os limites: individual e setorial
      if (
        nextWeight.lessThanOrEqualTo(maxAssetCap) &&
        nextSectorWeight.lessThanOrEqualTo(maxSectorCap)
      ) {
        finalWeights[i] = nextWeight;
        finalSectorWeights.set(asset.sector, nextSectorWeight);
        diff = diff.minus(step);
        allocated = true;
        break; // Volta ao topo para favorecer ativos de maior margem com capacidade disponível
      }
    }

    if (!allocated) {
      break;
    }
  }

  return ranked.map((asset, i) => {
    const weight = finalWeights[i];
    const contribution = weight.times(asset.marginOfSafetyPercent);
    return {
      ticker: asset.ticker,
      sector: asset.sector,
      marketPrice: asset.marketPrice,
      theoreticalPrice: asset.theoreticalPrice,
      marginOfSafetyPercent: asset.marginOfSafetyPercent,
      weight,
      contribution: new Decimal(contribution.toFixed(4, Decimal.ROUND_HALF_UP)),
    };
  });
}

/**
 * 4. Função principal de geração da Carteira Sugerida de Preços (CSP).
 * Função pura, sem efeito colateral e isolada de qualquer sistema de custódia ou ordens.
 */
export function generateSuggestedPortfolio(
  inputs: CspAssetInput[],
  options?: GenerateSuggestedPortfolioOptions
): CspPortfolioResult {
  const criteria: CspEligibilityCriteria = {
    ...DEFAULT_CSP_CRITERIA,
    ...options?.criteria,
  };

  const constraints: CspConstraints = {
    ...DEFAULT_CSP_CONSTRAINTS,
    ...options?.constraints,
  };

  const weightingMethod: CspWeightingMethod = options?.weightingMethod ?? 'EQUIPONDERADA';

  if (inputs.length === 0) {
    const assetClass: CspAssetClass = options?.targetAssetClass ?? 'STOCK';
    return {
      assetClass,
      weightingMethod,
      methodologyVersion: '1.0.0',
      dataQualityStatus: 'UNAVAILABLE',
      allocations: [],
      excludedAssets: [],
      summary: {
        totalEvaluated: 0,
        totalEligible: 0,
        totalAllocated: 0,
        totalWeightAllocated: new Decimal(0),
      },
      traceability: {
        methodologyVersion: '1.0.0',
        weightingMethod,
        criteria,
        constraints,
        generatedAt: new Date().toISOString(),
        sources: ['CVM_DFP', 'B3_COTAHIST'],
      },
      disclaimer: CSP_DISCLAIMER,
    };
  }

  // Validação de homogeneidade de classe e filtragem
  const targetClass = options?.targetAssetClass ?? inputs[0].assetClass;
  const evaluationDate = options?.evaluationDate ?? criteria.evaluationDate ?? new Date();

  const { eligible, excluded } = filterEligibleAssets(
    inputs,
    criteria,
    targetClass,
    evaluationDate
  );

  // Ranqueamento
  const ranked = rankAssetsByMarginOfSafety(eligible);

  // Ponderação com garantia de limites
  const allocations = calculatePortfolioWeights(ranked, constraints, weightingMethod, {
    allowPartialAllocation: options?.allowPartialAllocation,
  });

  const totalWeightAllocated = allocations.reduce(
    (acc, a) => acc.plus(a.weight),
    new Decimal(0)
  );

  let dataQualityStatus: DataQualityStatus = 'VALID';
  if (allocations.length === 0) {
    dataQualityStatus = excluded.some((e) => e.reason === 'CLASSE_INCOMPATIVEL')
      ? 'INCOMPATIBLE'
      : 'INCOMPLETE';
  } else if (totalWeightAllocated.lessThan(new Decimal('1.0000'))) {
    dataQualityStatus = 'INCOMPLETE';
  } else if (inputs.some((i) => i.dataQualityStatus === 'STALE')) {
    dataQualityStatus = 'STALE';
  }

  const summary: CspSummary = {
    totalEvaluated: inputs.length,
    totalEligible: eligible.length,
    totalAllocated: allocations.length,
    totalWeightAllocated,
  };

  const traceability: CspTraceability = {
    methodologyVersion: '1.0.0',
    weightingMethod,
    criteria,
    constraints,
    generatedAt: new Date().toISOString(),
    sources: ['CVM_DFP', 'B3_COTAHIST'],
  };

  return {
    assetClass: targetClass,
    weightingMethod,
    methodologyVersion: '1.0.0',
    dataQualityStatus,
    allocations,
    excludedAssets: excluded,
    summary,
    traceability,
    disclaimer: CSP_DISCLAIMER,
  };
}
