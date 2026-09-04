import { Decimal } from '@/lib/decimal';
import type {
  ProjectionPremises,
  MonthlyProjectionPoint,
  ProjectionSummary,
  ProjectionResultSet,
  SerializedProjectionResultSet,
  SerializedProjectionPremises,
  SerializedMonthlyProjectionPoint,
  SerializedProjectionSummary,
} from './projection.types';

export const PROJECTION_REGULATORY_DISCLAIMER =
  'Simulação com finalidade exclusivamente educacional e organizacional. Os cálculos apresentados são projeções matemáticas teóricas assumindo taxas e inflação constantes ao longo do tempo. Não constituem garantia de rentabilidade, promessa de retorno, nem recomendação de investimento. A simulação não deduz tributos (como IR ou IOF), emolumentos, taxas de administração ou custódia, nem considera a volatilidade de mercado e oscilações cambiais. Rentabilidade passada não representa garantia de rentabilidade futura.';

/**
 * Converte taxa anual composta para taxa equivalente mensal com precisão arbitrária:
 * i_mes = (1 + i_ano)^(1/12) - 1
 */
export function calculateEquivalentMonthlyRate(annualRate: Decimal): Decimal {
  const onePlusAnnual = new Decimal(1).plus(annualRate);
  if (onePlusAnnual.isZero() || onePlusAnnual.isNegative()) {
    throw new Error('A taxa anual não pode resultar em fator menor ou igual a zero.');
  }
  const oneTwelfth = new Decimal(1).dividedBy(12);
  return onePlusAnnual.pow(oneTwelfth).minus(1);
}

/**
 * Calcula o tempo teórico em anos para dobrar o capital inicial sem aportes adicionais:
 * n_anos = ln(2) / ln(1 + i_ano)
 */
export function calculateDoublingTimeWithoutContributions(annualInterestRate: Decimal): Decimal | null {
  if (annualInterestRate.isZero() || annualInterestRate.isNegative()) {
    return null;
  }
  const onePlusI = new Decimal(1).plus(annualInterestRate);
  const ln2 = Decimal.ln(2);
  const lnOnePlusI = Decimal.ln(onePlusI);
  return ln2.dividedBy(lnOnePlusI);
}

/**
 * Motor puro e determinístico de projeção de acumulação de capital com juros compostos.
 */
export function calculateCompoundInterestProjection(
  premises: ProjectionPremises
): ProjectionResultSet {
  const {
    initialCapital,
    monthlyContribution,
    annualInterestRate,
    annualInflationRate,
    targetDividendYield,
    totalMonths,
    contributionTiming,
  } = premises;

  if (initialCapital.isNegative()) {
    throw new Error('O capital inicial não pode ser negativo.');
  }
  if (monthlyContribution.isNegative()) {
    throw new Error('O aporte mensal não pode ser negativo.');
  }
  if (totalMonths < 1) {
    throw new Error('O prazo em meses deve ser de pelo menos 1 mês.');
  }

  // Taxas equivalentes mensais
  const monthlyInterestRate = calculateEquivalentMonthlyRate(annualInterestRate);
  const monthlyInflationRate = calculateEquivalentMonthlyRate(annualInflationRate);
  const monthlyDividendRate = calculateEquivalentMonthlyRate(targetDividendYield);

  const timeline: MonthlyProjectionPoint[] = [];

  let currentNominalBalance = initialCapital;
  let totalContributed = initialCapital;
  const onePlusInflation = new Decimal(1).plus(monthlyInflationRate);

  let timeToDoubleInitialMonths: number | null = null;
  let crossoverMonth: number | null = null;

  const doubleTarget = initialCapital.greaterThan(0) ? initialCapital.times(2) : null;

  for (let m = 1; m <= totalMonths; m++) {
    let monthlyInterestEarned: Decimal;
    let nominalBalanceEnd: Decimal;

    if (contributionTiming === 'BEGINNING_OF_PERIOD') {
      // Aporte no início do mês: capitaliza junto com o saldo anterior
      const baseToYield = currentNominalBalance.plus(monthlyContribution);
      monthlyInterestEarned = baseToYield.times(monthlyInterestRate);
      nominalBalanceEnd = baseToYield.plus(monthlyInterestEarned);
    } else {
      // Aporte no fim do mês: juros incidem sobre o saldo inicial e soma-se o aporte ao fim
      monthlyInterestEarned = currentNominalBalance.times(monthlyInterestRate);
      nominalBalanceEnd = currentNominalBalance.plus(monthlyInterestEarned).plus(monthlyContribution);
    }

    totalContributed = totalContributed.plus(monthlyContribution);
    const accumulatedInterest = nominalBalanceEnd.minus(totalContributed);

    // Fator composto de inflação: (1 + pi_mes)^m
    const inflationFactor = onePlusInflation.pow(m);
    // Saldo real com poder de compra da data zero
    const realBalance = nominalBalanceEnd.dividedBy(inflationFactor);

    // Provento mensal teórico sobre o saldo final do mês
    const projectedMonthlyDividends = nominalBalanceEnd.times(monthlyDividendRate);

    // Marco 1: Duplicação do capital inicial com a estratégia completa de aportes
    if (
      doubleTarget !== null &&
      timeToDoubleInitialMonths === null &&
      nominalBalanceEnd.greaterThanOrEqualTo(doubleTarget)
    ) {
      timeToDoubleInitialMonths = m;
    }

    // Marco 2: Ponto de Inflexão (Crossover) — quando os juros mensais superam o aporte mensal
    if (
      crossoverMonth === null &&
      monthlyContribution.greaterThan(0) &&
      monthlyInterestEarned.greaterThanOrEqualTo(monthlyContribution)
    ) {
      crossoverMonth = m;
    }

    timeline.push({
      month: m,
      contribution: monthlyContribution,
      monthlyInterestEarned,
      accumulatedContributions: totalContributed,
      accumulatedInterest,
      nominalBalance: nominalBalanceEnd,
      realBalance,
      inflationFactor,
      projectedMonthlyDividends,
    });

    currentNominalBalance = nominalBalanceEnd;
  }

  const finalNominalBalance = currentNominalBalance;
  const finalPoint = timeline[timeline.length - 1];
  const finalRealBalance = finalPoint ? finalPoint.realBalance : initialCapital;
  const totalInterestEarned = finalNominalBalance.minus(totalContributed);

  let interestSharePercentage = new Decimal(0);
  if (finalNominalBalance.greaterThan(0)) {
    interestSharePercentage = totalInterestEarned
      .dividedBy(finalNominalBalance)
      .times(100);
  }

  const projectedAnnualDividends = finalNominalBalance.times(targetDividendYield);
  const projectedMonthlyDividends = finalNominalBalance.times(monthlyDividendRate);
  const doublingTimeWithoutContributionsYears = calculateDoublingTimeWithoutContributions(annualInterestRate);

  const summary: ProjectionSummary = {
    finalNominalBalance,
    finalRealBalance,
    totalContributed,
    totalInterestEarned,
    interestSharePercentage,
    projectedAnnualDividends,
    projectedMonthlyDividends,
    timeToDoubleInitialMonths,
    crossoverMonth,
    doublingTimeWithoutContributionsYears,
  };

  return {
    premises,
    summary,
    timeline,
    disclaimer: PROJECTION_REGULATORY_DISCLAIMER,
    calculatedAt: new Date(),
  };
}

// ─── Serialização para Componentes de Interface, SSR e JSON ──────────────────

export function serializeProjectionResultSet(
  result: ProjectionResultSet
): SerializedProjectionResultSet {
  const { premises, summary, timeline, disclaimer, calculatedAt } = result;

  const serializedPremises: SerializedProjectionPremises = {
    initialCapital: premises.initialCapital.toFixed(2),
    monthlyContribution: premises.monthlyContribution.toFixed(2),
    annualInterestRate: premises.annualInterestRate.toFixed(4),
    annualInflationRate: premises.annualInflationRate.toFixed(4),
    targetDividendYield: premises.targetDividendYield.toFixed(4),
    totalMonths: premises.totalMonths,
    contributionTiming: premises.contributionTiming,
  };

  const serializedSummary: SerializedProjectionSummary = {
    finalNominalBalance: summary.finalNominalBalance.toFixed(2),
    finalRealBalance: summary.finalRealBalance.toFixed(2),
    totalContributed: summary.totalContributed.toFixed(2),
    totalInterestEarned: summary.totalInterestEarned.toFixed(2),
    interestSharePercentage: summary.interestSharePercentage.toFixed(2),
    projectedAnnualDividends: summary.projectedAnnualDividends.toFixed(2),
    projectedMonthlyDividends: summary.projectedMonthlyDividends.toFixed(2),
    timeToDoubleInitialMonths: summary.timeToDoubleInitialMonths,
    crossoverMonth: summary.crossoverMonth,
    doublingTimeWithoutContributionsYears: summary.doublingTimeWithoutContributionsYears
      ? summary.doublingTimeWithoutContributionsYears.toFixed(2)
      : null,
  };

  const serializedTimeline: SerializedMonthlyProjectionPoint[] = timeline.map((p) => ({
    month: p.month,
    contribution: p.contribution.toFixed(2),
    monthlyInterestEarned: p.monthlyInterestEarned.toFixed(2),
    accumulatedContributions: p.accumulatedContributions.toFixed(2),
    accumulatedInterest: p.accumulatedInterest.toFixed(2),
    nominalBalance: p.nominalBalance.toFixed(2),
    realBalance: p.realBalance.toFixed(2),
    inflationFactor: p.inflationFactor.toFixed(6),
    projectedMonthlyDividends: p.projectedMonthlyDividends.toFixed(2),
  }));

  return {
    premises: serializedPremises,
    summary: serializedSummary,
    timeline: serializedTimeline,
    disclaimer,
    calculatedAt: calculatedAt.toISOString(),
  };
}
export { calculateCompoundInterestProjection as calculateProjections };
