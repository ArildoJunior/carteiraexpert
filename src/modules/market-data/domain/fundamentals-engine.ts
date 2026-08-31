import { Decimal } from '@/lib/decimal';
import type {
  RawAssetFundamentalStatement,
  CalculatedFundamentalIndicators,
  FundamentalQuoteAudit,
} from './fundamentals.types';

export interface FundamentalQuoteContext {
  price: Decimal;
  quoteDate: Date | string;
  source: 'market_quotes' | 'cotahist' | string;
  delayStatus: string;
  isStale?: boolean;
  currency: string;
}

/**
 * Motor puro e determinístico de cálculo de indicadores fundamentais.
 * Utiliza exclusivamente aritmética com Decimal e arredondamento explícito (ROUND_HALF_UP).
 */
export function calculateFundamentalIndicators(
  statement: Pick<
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
  >,
  quote?: FundamentalQuoteContext | null
): CalculatedFundamentalIndicators {
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

  // 6. LPA (Lucro por Ação) = netIncome / sharesCount (se sharesCount > 0)
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

  // 7. VPA (Valor Patrimonial por Ação) = totalEquity / sharesCount (se sharesCount > 0)
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

  // 8. Dívida Líquida / EBITDA = netDebt / ebitda (se ebitda > 0 e netDebt disponível)
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

  // 9. Múltiplos com Preço de Mercado (P/L, P/VP, Dividend Yield)
  let peRatio: string | null = null;
  let pbRatio: string | null = null;
  let dividendYield: string | null = null;
  let quoteAudit: FundamentalQuoteAudit | null = null;
  let currencyMismatch = false;

  if (quote && quote.price && quote.price.greaterThan(0)) {
    const stmtCurrency = (statement.currency || 'BRL').toUpperCase();
    const quoteCurrency = (quote.currency || 'BRL').toUpperCase();

    if (stmtCurrency !== quoteCurrency) {
      currencyMismatch = true;
    } else {
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
    }

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
  }

  return {
    netDebt: netDebtDecimal !== null ? netDebtDecimal.toFixed(4, Decimal.ROUND_HALF_UP) : null,
    netMargin,
    ebitdaMargin,
    roe,
    roa,
    lpa,
    vpa,
    netDebtToEbitda,
    peRatio,
    pbRatio,
    dividendYield,
    quoteAudit,
    currencyMismatch,
  };
}
