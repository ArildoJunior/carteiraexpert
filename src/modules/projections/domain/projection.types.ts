import type { Decimal } from '@/lib/decimal';

export type ContributionTiming = 'BEGINNING_OF_PERIOD' | 'END_OF_PERIOD';

export interface ProjectionPremises {
  /** Capital inicial em moeda corrente (ex: 10000.00) */
  initialCapital: Decimal;
  /** Aporte monetário mensal recorrente (ex: 1000.00) */
  monthlyContribution: Decimal;
  /** Taxa de juros nominal anual em decimal (ex: 0.10 para 10% a.a.) */
  annualInterestRate: Decimal;
  /** Taxa de inflação anual projetada em decimal (ex: 0.04 para 4% a.a.) */
  annualInflationRate: Decimal;
  /** Dividend Yield anual alvo pretendido em decimal (ex: 0.06 para 6% a.a.) */
  targetDividendYield: Decimal;
  /** Prazo total da simulação em meses (ex: 120 para 10 anos) */
  totalMonths: number;
  /** Momento do aporte no mês: início (antecipado) ou fim (postecipado) */
  contributionTiming: ContributionTiming;
}

export interface MonthlyProjectionPoint {
  /** Número do mês ordinal (1 a N) */
  month: number;
  /** Aporte realizado no mês */
  contribution: Decimal;
  /** Rendimento/juros apurados exclusivamente no mês */
  monthlyInterestEarned: Decimal;
  /** Total acumulado aportado pelo investidor até o mês */
  accumulatedContributions: Decimal;
  /** Total acumulado de juros e rendimentos até o mês */
  accumulatedInterest: Decimal;
  /** Saldo patrimonial total acumulado (nominal) */
  nominalBalance: Decimal;
  /** Saldo patrimonial deflacionado pelo poder de compra da data zero (real) */
  realBalance: Decimal;
  /** Fator de inflação acumulado composto: (1 + pi_mes)^m */
  inflationFactor: Decimal;
  /** Proventos mensais teóricos gerados pelo patrimônio acumulado no mês */
  projectedMonthlyDividends: Decimal;
}

export interface ProjectionSummary {
  /** Saldo final nominal ao término do prazo */
  finalNominalBalance: Decimal;
  /** Saldo final real (descontada a inflação) em poder de compra de hoje */
  finalRealBalance: Decimal;
  /** Total de capital efetivamente aportado pelo investidor */
  totalContributed: Decimal;
  /** Total acumulado gerado exclusivamente por rendimentos/juros compostos */
  totalInterestEarned: Decimal;
  /** Participação percentual dos juros no patrimônio final: (juros / total) * 100 */
  interestSharePercentage: Decimal;
  /** Proventos anuais projetados no patrimônio final acumulado */
  projectedAnnualDividends: Decimal;
  /** Proventos mensais projetados no patrimônio final acumulado */
  projectedMonthlyDividends: Decimal;
  /** Mês em que o saldo nominal atingiu ou superou o dobro do capital inicial (2 * C0) */
  timeToDoubleInitialMonths: number | null;
  /** Mês em que o rendimento mensal superou o aporte mensal (ponto de inflexão) */
  crossoverMonth: number | null;
  /** Tempo teórico de duplicação do capital sem novos aportes: ln(2) / ln(1 + i_ano) */
  doublingTimeWithoutContributionsYears: Decimal | null;
}

export interface ProjectionResultSet {
  premises: ProjectionPremises;
  summary: ProjectionSummary;
  timeline: MonthlyProjectionPoint[];
  disclaimer: string;
  calculatedAt: Date;
}

// ─── Tipos Serializados para Client Components, SSR e APIs ──────────────────

export interface SerializedProjectionPremises {
  initialCapital: string;
  monthlyContribution: string;
  annualInterestRate: string;
  annualInflationRate: string;
  targetDividendYield: string;
  totalMonths: number;
  contributionTiming: ContributionTiming;
}

export interface SerializedMonthlyProjectionPoint {
  month: number;
  contribution: string;
  monthlyInterestEarned: string;
  accumulatedContributions: string;
  accumulatedInterest: string;
  nominalBalance: string;
  realBalance: string;
  inflationFactor: string;
  projectedMonthlyDividends: string;
}

export interface SerializedProjectionSummary {
  finalNominalBalance: string;
  finalRealBalance: string;
  totalContributed: string;
  totalInterestEarned: string;
  interestSharePercentage: string;
  projectedAnnualDividends: string;
  projectedMonthlyDividends: string;
  timeToDoubleInitialMonths: number | null;
  crossoverMonth: number | null;
  doublingTimeWithoutContributionsYears: string | null;
}

export interface SerializedProjectionResultSet {
  premises: SerializedProjectionPremises;
  summary: SerializedProjectionSummary;
  timeline: SerializedMonthlyProjectionPoint[];
  disclaimer: string;
  calculatedAt: string;
}
