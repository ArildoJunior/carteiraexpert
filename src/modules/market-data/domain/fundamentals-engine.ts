import { Decimal } from '@/lib/decimal';
import type {
  RawAssetFundamentalStatement,
  CalculatedFundamentalIndicators,
  FundamentalQuoteAudit,
  IndicatorTraceability,
} from './fundamentals.types';
import type { DataQualityStatus } from './theoretical-valuation.types';

export const FUNDAMENTALS_METHODOLOGY_VERSION = '1.0.0';

export interface FundamentalQuoteContext {
  price: Decimal;
  quoteDate: Date | string;
  source: 'market_quotes' | 'cotahist' | string;
  delayStatus: string;
  isStale?: boolean;
  currency: string;
}

export type FundamentalStatementContext = Pick<
  RawAssetFundamentalStatement,
  | 'currency'
  | 'netRevenue'
  | 'ebitda'
  | 'netIncome'
  | 'totalEquity'
  | 'totalAssets'
  | 'grossDebt'
  | 'cashEquivalents'
  | 'sharesCount'
  | 'dividendsDeclared'
> & {
  ebit?: Decimal | null;
  depreciationAmortization?: Decimal | null;
  referencePeriod?: string;
  referenceDate?: Date | string;
  source?: string;
};

export interface FundamentalEngineOptions {
  /** Alíquota de IR/CSLL para cálculo do NOPAT no ROIC (padrão: 0.34) */
  taxRate?: Decimal;
}

/**
 * Motor puro e determinístico de cálculo de indicadores fundamentais.
 * Utiliza exclusivamente aritmética com Decimal e arredondamento explícito (ROUND_HALF_UP).
 */
export function calculateFundamentalIndicators(
  statement: FundamentalStatementContext,
  quote?: FundamentalQuoteContext | null,
  options?: FundamentalEngineOptions
): CalculatedFundamentalIndicators {
  const stmtCurrency = (statement.currency || 'BRL').toUpperCase();
  const quoteCurrency = quote?.currency?.toUpperCase() ?? stmtCurrency;
  const currencyMismatch = quote ? stmtCurrency !== quoteCurrency : false;
  const referencePeriod = statement.referencePeriod || 'N/A';
  const referenceDateStr = statement.referenceDate
    ? statement.referenceDate instanceof Date
      ? statement.referenceDate.toISOString()
      : String(statement.referenceDate)
    : new Date().toISOString();
  const source = statement.source || 'CVM_DFP';

  // 1. Grandeza auxiliar contábil: Dívida Líquida (grossDebt - cashEquivalents)
  let netDebtDecimal: Decimal | null = null;
  if (statement.grossDebt !== null && statement.cashEquivalents !== null) {
    netDebtDecimal = statement.grossDebt.minus(statement.cashEquivalents);
  }

  // 2. Margem Líquida = netIncome / netRevenue (se netRevenue > 0)
  let netMargin: string | null = null;
  if (
    statement.netIncome !== null &&
    statement.netRevenue !== null &&
    statement.netRevenue.greaterThan(0)
  ) {
    netMargin = statement.netIncome
      .dividedBy(statement.netRevenue)
      .toFixed(4, Decimal.ROUND_HALF_UP);
  }

  // 3. Margem EBITDA = ebitda / netRevenue (se netRevenue > 0)
  let ebitdaMargin: string | null = null;
  if (
    statement.ebitda !== null &&
    statement.netRevenue !== null &&
    statement.netRevenue.greaterThan(0)
  ) {
    ebitdaMargin = statement.ebitda
      .dividedBy(statement.netRevenue)
      .toFixed(4, Decimal.ROUND_HALF_UP);
  }

  // 4. ROE = netIncome / totalEquity (se totalEquity > 0)
  let roe: string | null = null;
  if (
    statement.netIncome !== null &&
    statement.totalEquity !== null &&
    statement.totalEquity.greaterThan(0)
  ) {
    roe = statement.netIncome
      .dividedBy(statement.totalEquity)
      .toFixed(4, Decimal.ROUND_HALF_UP);
  }

  // 5. ROA = netIncome / totalAssets (se totalAssets > 0)
  let roa: string | null = null;
  if (
    statement.netIncome !== null &&
    statement.totalAssets !== null &&
    statement.totalAssets.greaterThan(0)
  ) {
    roa = statement.netIncome
      .dividedBy(statement.totalAssets)
      .toFixed(4, Decimal.ROUND_HALF_UP);
  }

  // 6. ROIC = NOPAT / CapitalInvestido
  // CapitalInvestido = TotalEquity + NetDebt
  // NOPAT = EBIT * (1 - taxRate)
  const effectiveTaxRate = options?.taxRate !== undefined ? options.taxRate : new Decimal('0.34');
  let investedCapitalDecimal: Decimal | null = null;
  if (statement.totalEquity !== null && netDebtDecimal !== null) {
    investedCapitalDecimal = statement.totalEquity.plus(netDebtDecimal);
  }

  // Resolução de EBIT: se ebit explícito, usa; senão ebitda - D&A; senão ebitda como aproximação
  let ebitDecimal: Decimal | null = null;
  if (statement.ebit !== undefined && statement.ebit !== null) {
    ebitDecimal = statement.ebit;
  } else if (
    statement.ebitda !== null &&
    statement.depreciationAmortization !== undefined &&
    statement.depreciationAmortization !== null
  ) {
    ebitDecimal = statement.ebitda.minus(statement.depreciationAmortization);
  } else if (statement.ebitda !== null) {
    ebitDecimal = statement.ebitda;
  } else if (statement.netIncome !== null) {
    ebitDecimal = statement.netIncome;
  }

  let roic: string | null = null;
  if (
    ebitDecimal !== null &&
    investedCapitalDecimal !== null &&
    investedCapitalDecimal.greaterThan(0)
  ) {
    const oneMinusTax = new Decimal(1).minus(effectiveTaxRate);
    const nopat = ebitDecimal.times(oneMinusTax);
    const roicDecimal = nopat.dividedBy(investedCapitalDecimal);
    roic = roicDecimal.toFixed(4, Decimal.ROUND_HALF_UP);
  }

  // 7. LPA (Lucro por Ação) = netIncome / sharesCount (se sharesCount > 0)
  let lpaDecimal: Decimal | null = null;
  let lpa: string | null = null;
  if (
    statement.netIncome !== null &&
    statement.sharesCount !== null &&
    statement.sharesCount.greaterThan(0)
  ) {
    lpaDecimal = statement.netIncome.dividedBy(statement.sharesCount);
    lpa = lpaDecimal.toFixed(4, Decimal.ROUND_HALF_UP);
  }

  // 8. VPA (Valor Patrimonial por Ação) = totalEquity / sharesCount (se sharesCount > 0)
  let vpaDecimal: Decimal | null = null;
  let vpa: string | null = null;
  if (
    statement.totalEquity !== null &&
    statement.sharesCount !== null &&
    statement.sharesCount.greaterThan(0)
  ) {
    vpaDecimal = statement.totalEquity.dividedBy(statement.sharesCount);
    vpa = vpaDecimal.toFixed(4, Decimal.ROUND_HALF_UP);
  }

  // 9. Dívida Líquida / EBITDA = netDebt / ebitda (se ebitda > 0 e netDebt disponível)
  let netDebtToEbitda: string | null = null;
  if (
    netDebtDecimal !== null &&
    statement.ebitda !== null &&
    statement.ebitda.greaterThan(0)
  ) {
    netDebtToEbitda = netDebtDecimal
      .dividedBy(statement.ebitda)
      .toFixed(2, Decimal.ROUND_HALF_UP);
  }

  // 10. Alavancagem Patrimonial (Dívida Bruta / PL e Dívida Líquida / PL)
  // Retorna null quando o PL for nulo ou <= 0. Preserva valores negativos de dívida líquida (caixa líquido).
  let grossDebtToEquity: string | null = null;
  let netDebtToEquity: string | null = null;
  if (statement.totalEquity !== null && statement.totalEquity.greaterThan(0)) {
    if (statement.grossDebt !== null) {
      grossDebtToEquity = statement.grossDebt
        .dividedBy(statement.totalEquity)
        .toFixed(2, Decimal.ROUND_HALF_UP);
    }
    if (netDebtDecimal !== null) {
      netDebtToEquity = netDebtDecimal
        .dividedBy(statement.totalEquity)
        .toFixed(2, Decimal.ROUND_HALF_UP);
    }
  }

  // 11. Múltiplos e Métricas com Preço de Mercado (P/L, P/VP, Dividend Yield, EV, EV/EBITDA)
  let peRatio: string | null = null;
  let pbRatio: string | null = null;
  let dividendYield: string | null = null;
  let enterpriseValue: string | null = null;
  let evToEbitda: string | null = null;
  let quoteAudit: FundamentalQuoteAudit | null = null;

  if (quote && quote.price && quote.price.greaterThan(0)) {
    quoteAudit = {
      quotePriceUsed: quote.price.toFixed(4, Decimal.ROUND_HALF_UP),
      quoteDateUsed:
        quote.quoteDate instanceof Date
          ? quote.quoteDate.toISOString()
          : String(quote.quoteDate),
      quoteSource: quote.source === 'cotahist' ? 'cotahist' : 'market_quotes',
      quoteDelayStatus: quote.delayStatus || 'eod',
      isQuoteStale: Boolean(quote.isStale),
      currency: quoteCurrency,
    };

    if (!currencyMismatch) {
      // P/L = QuotePrice / LPA (somente se LPA > 0)
      if (lpaDecimal !== null && lpaDecimal.greaterThan(0)) {
        peRatio = quote.price
          .dividedBy(lpaDecimal)
          .toFixed(2, Decimal.ROUND_HALF_UP);
      }

      // P/VP = QuotePrice / VPA (somente se VPA > 0)
      if (vpaDecimal !== null && vpaDecimal.greaterThan(0)) {
        pbRatio = quote.price
          .dividedBy(vpaDecimal)
          .toFixed(2, Decimal.ROUND_HALF_UP);
      }

      // Dividend Yield = (dividendsDeclared / sharesCount) / QuotePrice
      if (
        statement.dividendsDeclared !== null &&
        statement.dividendsDeclared.greaterThanOrEqualTo(0) &&
        statement.sharesCount !== null &&
        statement.sharesCount.greaterThan(0)
      ) {
        const dpa = statement.dividendsDeclared.dividedBy(statement.sharesCount);
        dividendYield = dpa
          .dividedBy(quote.price)
          .toFixed(4, Decimal.ROUND_HALF_UP);
      }

      // Enterprise Value (EV) = MarketCap + NetDebt
      // EV/EBITDA = EV / EBITDA
      if (
        statement.sharesCount !== null &&
        statement.sharesCount.greaterThan(0) &&
        netDebtDecimal !== null
      ) {
        const marketCap = quote.price.times(statement.sharesCount);
        const evDecimal = marketCap.plus(netDebtDecimal);
        enterpriseValue = evDecimal.toFixed(2, Decimal.ROUND_HALF_UP);

        if (statement.ebitda !== null && statement.ebitda.greaterThan(0)) {
          evToEbitda = evDecimal
            .dividedBy(statement.ebitda)
            .toFixed(2, Decimal.ROUND_HALF_UP);
        }
      }
    }
  }

  // 12. Estado de Qualidade dos Dados (Ajuste 1 e Ajuste 6)
  let dataQualityStatus: DataQualityStatus = 'VALID';
  if (currencyMismatch) {
    dataQualityStatus = 'INCOMPATIBLE';
  } else if (quote?.isStale) {
    dataQualityStatus = 'STALE';
  } else if (
    statement.netIncome === null ||
    statement.totalEquity === null ||
    statement.netRevenue === null
  ) {
    dataQualityStatus = 'INCOMPLETE';
  }

  // 13. Rastreabilidade Individual por Indicador (Ajuste 2)
  const traceability: Record<string, IndicatorTraceability> = {
    ROIC: {
      source,
      referencePeriod,
      currency: stmtCurrency,
      referenceDate: referenceDateStr,
      methodology: 'ROIC',
      formula: 'ROIC = [EBIT * (1 - taxRate)] / (TotalEquity + NetDebt)',
      premises: { taxRate: effectiveTaxRate.toString() },
      methodologyVersion: FUNDAMENTALS_METHODOLOGY_VERSION,
      limitations: [
        'Exige Capital Investido estritamente positivo.',
        'Quando EBIT não está diretamente disponível no demonstrativo, utiliza-se EBITDA como aproximação operacional; o resultado pode diferir do ROIC teórico contábil.',
      ],
    },
    EV_EBITDA: {
      source,
      referencePeriod,
      currency: stmtCurrency,
      referenceDate: referenceDateStr,
      methodology: 'EV_EBITDA',
      formula: 'EV/EBITDA = [(Preço * Ações) + NetDebt] / EBITDA',
      premises: { quoteCurrency, currencyMismatch },
      methodologyVersion: FUNDAMENTALS_METHODOLOGY_VERSION,
      limitations: [
        'Bloqueado integralmente caso haja divergência cambial entre cotação e demonstrativo.',
        'Inaplicável quando EBITDA for nulo ou deficitário.',
      ],
    },
    GROSS_DEBT_TO_EQUITY: {
      source,
      referencePeriod,
      currency: stmtCurrency,
      referenceDate: referenceDateStr,
      methodology: 'ALAVANCAGEM_DIVIDA_BRUTA_PL',
      formula: 'DívidaBruta/PL = GrossDebt / TotalEquity',
      premises: {},
      methodologyVersion: FUNDAMENTALS_METHODOLOGY_VERSION,
      limitations: ['Inaplicável quando Patrimônio Líquido for negativo ou nulo.'],
    },
    NET_DEBT_TO_EQUITY: {
      source,
      referencePeriod,
      currency: stmtCurrency,
      referenceDate: referenceDateStr,
      methodology: 'ALAVANCAGEM_DIVIDA_LIQUIDA_PL',
      formula: 'DívidaLíquida/PL = NetDebt / TotalEquity',
      premises: {},
      methodologyVersion: FUNDAMENTALS_METHODOLOGY_VERSION,
      limitations: [
        'Inaplicável quando Patrimônio Líquido for negativo ou nulo.',
        'Preserva valores negativos quando a empresa se encontra em posição de caixa líquido.',
      ],
    },
    ROE: {
      source,
      referencePeriod,
      currency: stmtCurrency,
      referenceDate: referenceDateStr,
      methodology: 'ROE',
      formula: 'ROE = NetIncome / TotalEquity',
      premises: {},
      methodologyVersion: FUNDAMENTALS_METHODOLOGY_VERSION,
      limitations: ['Exige Patrimônio Líquido positivo.'],
    },
    ROA: {
      source,
      referencePeriod,
      currency: stmtCurrency,
      referenceDate: referenceDateStr,
      methodology: 'ROA',
      formula: 'ROA = NetIncome / TotalAssets',
      premises: {},
      methodologyVersion: FUNDAMENTALS_METHODOLOGY_VERSION,
      limitations: ['Exige Ativo Total positivo.'],
    },
    NET_MARGIN: {
      source,
      referencePeriod,
      currency: stmtCurrency,
      referenceDate: referenceDateStr,
      methodology: 'MARGEM_LIQUIDA',
      formula: 'MargemLíquida = NetIncome / NetRevenue',
      premises: {},
      methodologyVersion: FUNDAMENTALS_METHODOLOGY_VERSION,
      limitations: ['Exige Receita Líquida positiva.'],
    },
    EBITDA_MARGIN: {
      source,
      referencePeriod,
      currency: stmtCurrency,
      referenceDate: referenceDateStr,
      methodology: 'MARGEM_EBITDA',
      formula: 'MargemEBITDA = EBITDA / NetRevenue',
      premises: {},
      methodologyVersion: FUNDAMENTALS_METHODOLOGY_VERSION,
      limitations: ['Exige Receita Líquida positiva.'],
    },
    NET_DEBT_TO_EBITDA: {
      source,
      referencePeriod,
      currency: stmtCurrency,
      referenceDate: referenceDateStr,
      methodology: 'DIVIDA_LIQUIDA_EBITDA',
      formula: 'DívidaLíquida/EBITDA = NetDebt / EBITDA',
      premises: {},
      methodologyVersion: FUNDAMENTALS_METHODOLOGY_VERSION,
      limitations: ['Exige EBITDA positivo.'],
    },
    PE_RATIO: {
      source,
      referencePeriod,
      currency: stmtCurrency,
      referenceDate: referenceDateStr,
      methodology: 'P_L',
      formula: 'P/L = Preço / LPA',
      premises: { quoteCurrency, currencyMismatch },
      methodologyVersion: FUNDAMENTALS_METHODOLOGY_VERSION,
      limitations: ['Exige LPA positivo e paridade de moedas.'],
    },
    PB_RATIO: {
      source,
      referencePeriod,
      currency: stmtCurrency,
      referenceDate: referenceDateStr,
      methodology: 'P_VP',
      formula: 'P/VP = Preço / VPA',
      premises: { quoteCurrency, currencyMismatch },
      methodologyVersion: FUNDAMENTALS_METHODOLOGY_VERSION,
      limitations: ['Exige VPA positivo e paridade de moedas.'],
    },
    DIVIDEND_YIELD: {
      source,
      referencePeriod,
      currency: stmtCurrency,
      referenceDate: referenceDateStr,
      methodology: 'DIVIDEND_YIELD',
      formula: 'DY = (DividendsDeclared / SharesCount) / Preço',
      premises: { quoteCurrency, currencyMismatch },
      methodologyVersion: FUNDAMENTALS_METHODOLOGY_VERSION,
      limitations: ['Exige Proventos Declarados não negativos e paridade de moedas.'],
    },
  };

  return {
    netDebt: netDebtDecimal !== null ? netDebtDecimal.toFixed(4, Decimal.ROUND_HALF_UP) : null,
    enterpriseValue,
    netMargin,
    ebitdaMargin,
    roe,
    roa,
    roic,
    lpa,
    vpa,
    netDebtToEbitda,
    grossDebtToEquity,
    netDebtToEquity,
    peRatio,
    pbRatio,
    evToEbitda,
    dividendYield,
    dataQualityStatus,
    methodologyVersion: FUNDAMENTALS_METHODOLOGY_VERSION,
    traceability,
    quoteAudit,
    currencyMismatch,
  };
}
