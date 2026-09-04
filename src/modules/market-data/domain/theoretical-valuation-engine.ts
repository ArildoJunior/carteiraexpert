import { Decimal } from '@/lib/decimal';
import type {
  ValuationFundamentalContext,
  ValuationQuoteContext,
  BazinPremises,
  BazinFactualInputs,
  BazinIntermediates,
  GrahamPremises,
  GrahamFactualInputs,
  GrahamIntermediates,
  DcfPremises,
  DcfFactualInputs,
  DcfCashFlowProjectionYear,
  DcfIntermediates,
  TheoreticalModelResult,
  TheoreticalValuationResultSet,
  SerializedTheoreticalValuationResultSet,
  SerializedTheoreticalModelResult,
  SerializedBazinPremises,
  SerializedGrahamPremises,
  SerializedDcfPremises,
} from './theoretical-valuation.types';

export const BAZIN_DISCLAIMER =
  'O Preço Teto de Bazin indica o preço máximo teórico para obter o Dividend Yield alvo pretendido, sob a premissa de proventos estáveis. Não representa garantia de remuneração futura nem recomendação de compra ou venda.';

export const GRAHAM_DISCLAIMER =
  'O Valor Intrínseco de Benjamin Graham é uma métrica teórica clássica de Value Investing baseada em Lucro e Patrimônio Líquido históricos. Não reflete dinamismo setorial, crescimento futuro nem preço-alvo oficial.';

export const DCF_DISCLAIMER =
  'O Fluxo de Caixa Descontado (DCF) simplificado é uma simulação teórica em dois estágios altamente sensível às premissas de desconto e crescimento adotadas. Não constitui projeção oficial de mercado nem garantia de retorno.';

export const GLOBAL_VALUATION_DISCLAIMER =
  'Finalidade estritamente informativa, organizacional e educacional. Os modelos teóricos apresentados baseiam-se em demonstrações financeiras oficiais divulgadas pela companhia e em premissas selecionadas pelo usuário. O CarteiraExpert não formula recomendações de investimento, não estipula preços-alvo e não garante rentabilidade.';

/**
 * Auxiliar para cálculo de Margem de Segurança:
 * Margem = ((Valor Teórico - Preço de Mercado) / Preço de Mercado) * 100
 */
function calculateMarginOfSafety(
  intrinsicValue: Decimal | null,
  quote: ValuationQuoteContext | null,
  statementCurrency: string
): Decimal | null {
  if (!intrinsicValue || !quote || !quote.price || quote.price.isZero() || quote.price.isNegative()) {
    return null;
  }
  const quoteCurrency = (quote.currency || 'BRL').toUpperCase();
  const stmtCurrency = (statementCurrency || 'BRL').toUpperCase();
  if (quoteCurrency !== stmtCurrency) {
    return null;
  }
  return intrinsicValue
    .minus(quote.price)
    .dividedBy(quote.price)
    .times(100);
}

// ─── 1. Motor Bazin ─────────────────────────────────────────────────────────

export function calculateBazinValuation(
  statement: ValuationFundamentalContext,
  quote: ValuationQuoteContext | null,
  customPremises?: Partial<BazinPremises>
): TheoreticalModelResult<BazinPremises, BazinFactualInputs, BazinIntermediates> {
  const targetDividendYield = customPremises?.targetDividendYield ?? new Decimal('0.06');
  const currency = statement.currency || 'BRL';

  const factualInputs: BazinFactualInputs = {
    dividendsDeclared: statement.dividendsDeclared ? statement.dividendsDeclared.toFixed(4) : null,
    sharesCount: statement.sharesCount ? statement.sharesCount.toFixed(4) : null,
    dpa: null,
    currency,
  };

  const premisesUsed: BazinPremises = {
    targetDividendYield,
  };

  // Validação das Premissas
  if (targetDividendYield.isZero() || targetDividendYield.isNegative()) {
    return {
      model: 'BAZIN',
      modelName: 'Preço Teto de Bazin',
      status: 'INVALID_PREMISES',
      statusReason: 'O Dividend Yield alvo deve ser estritamente maior que zero.',
      intrinsicValue: null,
      marginOfSafetyPercent: null,
      marketPriceUsed: quote?.price ?? null,
      currency,
      premisesUsed,
      factualInputs,
      intermediates: { dpaDecimal: null },
      disclaimer: BAZIN_DISCLAIMER,
    };
  }

  // Validação de Dados Factuais
  if (statement.dividendsDeclared === null || statement.sharesCount === null) {
    return {
      model: 'BAZIN',
      modelName: 'Preço Teto de Bazin',
      status: 'INSUFFICIENT_DATA',
      statusReason: 'Dados contábeis insuficientes: proventos declarados ou total de ações não informados.',
      intrinsicValue: null,
      marginOfSafetyPercent: null,
      marketPriceUsed: quote?.price ?? null,
      currency,
      premisesUsed,
      factualInputs,
      intermediates: { dpaDecimal: null },
      disclaimer: BAZIN_DISCLAIMER,
    };
  }

  if (statement.sharesCount.isZero() || statement.sharesCount.isNegative()) {
    return {
      model: 'BAZIN',
      modelName: 'Preço Teto de Bazin',
      status: 'INSUFFICIENT_DATA',
      statusReason: 'Número total de ações informado é nulo ou negativo.',
      intrinsicValue: null,
      marginOfSafetyPercent: null,
      marketPriceUsed: quote?.price ?? null,
      currency,
      premisesUsed,
      factualInputs,
      intermediates: { dpaDecimal: null },
      disclaimer: BAZIN_DISCLAIMER,
    };
  }

  if (statement.dividendsDeclared.isZero() || statement.dividendsDeclared.isNegative()) {
    return {
      model: 'BAZIN',
      modelName: 'Preço Teto de Bazin',
      status: 'NOT_APPLICABLE',
      statusReason:
        'A companhia não declarou proventos brutos positivos no período de referência. O método Bazin exige remuneração positiva aos acionistas.',
      intrinsicValue: null,
      marginOfSafetyPercent: null,
      marketPriceUsed: quote?.price ?? null,
      currency,
      premisesUsed,
      factualInputs,
      intermediates: { dpaDecimal: null },
      disclaimer: BAZIN_DISCLAIMER,
    };
  }

  // DPA = Proventos / Ações
  const dpaDecimal = statement.dividendsDeclared.dividedBy(statement.sharesCount);
  factualInputs.dpa = dpaDecimal.toFixed(4);

  // Preço Teto = DPA / DY
  const intrinsicValue = dpaDecimal.dividedBy(targetDividendYield);
  const marginOfSafetyPercent = calculateMarginOfSafety(intrinsicValue, quote, currency);

  return {
    model: 'BAZIN',
    modelName: 'Preço Teto de Bazin',
    status: 'VALID',
    statusReason: null,
    intrinsicValue,
    marginOfSafetyPercent,
    marketPriceUsed: quote?.price ?? null,
    currency,
    premisesUsed,
    factualInputs,
    intermediates: {
      dpaDecimal: dpaDecimal.toFixed(6),
    },
    disclaimer: BAZIN_DISCLAIMER,
  };
}

// ─── 2. Motor Graham ────────────────────────────────────────────────────────

export function calculateGrahamValuation(
  statement: ValuationFundamentalContext,
  quote: ValuationQuoteContext | null,
  customPremises?: Partial<GrahamPremises>
): TheoreticalModelResult<GrahamPremises, GrahamFactualInputs, GrahamIntermediates> {
  const grahamMultiplier = customPremises?.grahamMultiplier ?? new Decimal('22.5');
  const currency = statement.currency || 'BRL';

  const factualInputs: GrahamFactualInputs = {
    netIncome: statement.netIncome ? statement.netIncome.toFixed(4) : null,
    totalEquity: statement.totalEquity ? statement.totalEquity.toFixed(4) : null,
    sharesCount: statement.sharesCount ? statement.sharesCount.toFixed(4) : null,
    lpa: null,
    vpa: null,
    currency,
  };

  const premisesUsed: GrahamPremises = {
    grahamMultiplier,
  };

  // Validação das Premissas
  if (grahamMultiplier.isZero() || grahamMultiplier.isNegative()) {
    return {
      model: 'GRAHAM',
      modelName: 'Fórmula de Graham',
      status: 'INVALID_PREMISES',
      statusReason: 'O multiplicador de Graham deve ser estritamente maior que zero.',
      intrinsicValue: null,
      marginOfSafetyPercent: null,
      marketPriceUsed: quote?.price ?? null,
      currency,
      premisesUsed,
      factualInputs,
      intermediates: { lpaDecimal: null, vpaDecimal: null, productLpaVpa: null },
      disclaimer: GRAHAM_DISCLAIMER,
    };
  }

  // Validação de Dados Factuais
  if (
    statement.netIncome === null ||
    statement.totalEquity === null ||
    statement.sharesCount === null
  ) {
    return {
      model: 'GRAHAM',
      modelName: 'Fórmula de Graham',
      status: 'INSUFFICIENT_DATA',
      statusReason:
        'Demonstrações contábeis incompletas: Lucro Líquido, Patrimônio Líquido ou Ações não informados.',
      intrinsicValue: null,
      marginOfSafetyPercent: null,
      marketPriceUsed: quote?.price ?? null,
      currency,
      premisesUsed,
      factualInputs,
      intermediates: { lpaDecimal: null, vpaDecimal: null, productLpaVpa: null },
      disclaimer: GRAHAM_DISCLAIMER,
    };
  }

  if (statement.sharesCount.isZero() || statement.sharesCount.isNegative()) {
    return {
      model: 'GRAHAM',
      modelName: 'Fórmula de Graham',
      status: 'INSUFFICIENT_DATA',
      statusReason: 'Número total de ações informado é nulo ou negativo.',
      intrinsicValue: null,
      marginOfSafetyPercent: null,
      marketPriceUsed: quote?.price ?? null,
      currency,
      premisesUsed,
      factualInputs,
      intermediates: { lpaDecimal: null, vpaDecimal: null, productLpaVpa: null },
      disclaimer: GRAHAM_DISCLAIMER,
    };
  }

  // LPA e VPA
  const lpaDecimal = statement.netIncome.dividedBy(statement.sharesCount);
  const vpaDecimal = statement.totalEquity.dividedBy(statement.sharesCount);

  factualInputs.lpa = lpaDecimal.toFixed(4);
  factualInputs.vpa = vpaDecimal.toFixed(4);

  // Graham exige LPA > 0 e VPA > 0
  if (lpaDecimal.isZero() || lpaDecimal.isNegative()) {
    return {
      model: 'GRAHAM',
      modelName: 'Fórmula de Graham',
      status: 'NOT_APPLICABLE',
      statusReason:
        'Lucro por Ação (LPA) negativo ou nulo (prejuízo contábil apurado). A fórmula de Graham exige lucratividade consistente.',
      intrinsicValue: null,
      marginOfSafetyPercent: null,
      marketPriceUsed: quote?.price ?? null,
      currency,
      premisesUsed,
      factualInputs,
      intermediates: {
        lpaDecimal: lpaDecimal.toFixed(6),
        vpaDecimal: vpaDecimal.toFixed(6),
        productLpaVpa: null,
      },
      disclaimer: GRAHAM_DISCLAIMER,
    };
  }

  if (vpaDecimal.isZero() || vpaDecimal.isNegative()) {
    return {
      model: 'GRAHAM',
      modelName: 'Fórmula de Graham',
      status: 'NOT_APPLICABLE',
      statusReason:
        'Valor Patrimonial por Ação (VPA) negativo ou nulo (passivo a descoberto). A fórmula de Graham exige patrimônio líquido positivo.',
      intrinsicValue: null,
      marginOfSafetyPercent: null,
      marketPriceUsed: quote?.price ?? null,
      currency,
      premisesUsed,
      factualInputs,
      intermediates: {
        lpaDecimal: lpaDecimal.toFixed(6),
        vpaDecimal: vpaDecimal.toFixed(6),
        productLpaVpa: null,
      },
      disclaimer: GRAHAM_DISCLAIMER,
    };
  }

  // Raiz quadrada de (multiplicador * LPA * VPA)
  const product = grahamMultiplier.times(lpaDecimal).times(vpaDecimal);
  const intrinsicValue = product.sqrt();
  const marginOfSafetyPercent = calculateMarginOfSafety(intrinsicValue, quote, currency);

  return {
    model: 'GRAHAM',
    modelName: 'Fórmula de Graham',
    status: 'VALID',
    statusReason: null,
    intrinsicValue,
    marginOfSafetyPercent,
    marketPriceUsed: quote?.price ?? null,
    currency,
    premisesUsed,
    factualInputs,
    intermediates: {
      lpaDecimal: lpaDecimal.toFixed(6),
      vpaDecimal: vpaDecimal.toFixed(6),
      productLpaVpa: product.toFixed(6),
    },
    disclaimer: GRAHAM_DISCLAIMER,
  };
}

// ─── 3. Motor DCF Simplificado ──────────────────────────────────────────────

export function calculateSimplifiedDcfValuation(
  statement: ValuationFundamentalContext,
  quote: ValuationQuoteContext | null,
  customPremises?: Partial<DcfPremises>
): TheoreticalModelResult<DcfPremises, DcfFactualInputs, DcfIntermediates> {
  const discountRate = customPremises?.discountRate ?? new Decimal('0.12');
  const growthRateStage1 = customPremises?.growthRateStage1 ?? new Decimal('0.08');
  const terminalGrowthRate = customPremises?.terminalGrowthRate ?? new Decimal('0.03');
  const projectionYears = customPremises?.projectionYears ?? 5;
  const currency = statement.currency || 'BRL';

  const factualInputs: DcfFactualInputs = {
    netIncome: statement.netIncome ? statement.netIncome.toFixed(4) : null,
    sharesCount: statement.sharesCount ? statement.sharesCount.toFixed(4) : null,
    baseCashFlowPerShare: null,
    currency,
  };

  const premisesUsed: DcfPremises = {
    discountRate,
    growthRateStage1,
    terminalGrowthRate,
    projectionYears,
  };

  const emptyIntermediates: DcfIntermediates = {
    baseFlowPerShare: null,
    yearlyProjections: [],
    presentValueOfExplicitPeriod: null,
    terminalValueYearN: null,
    presentValueOfTerminalValue: null,
  };

  // Validação das Premissas
  if (discountRate.isZero() || discountRate.isNegative()) {
    return {
      model: 'DCF_SIMPLIFIED',
      modelName: 'DCF Simplificado (2 Estágios)',
      status: 'INVALID_PREMISES',
      statusReason: 'A taxa de desconto (r) deve ser estritamente maior que zero.',
      intrinsicValue: null,
      marginOfSafetyPercent: null,
      marketPriceUsed: quote?.price ?? null,
      currency,
      premisesUsed,
      factualInputs,
      intermediates: emptyIntermediates,
      disclaimer: DCF_DISCLAIMER,
    };
  }

  if (terminalGrowthRate.isNegative()) {
    return {
      model: 'DCF_SIMPLIFIED',
      modelName: 'DCF Simplificado (2 Estágios)',
      status: 'INVALID_PREMISES',
      statusReason: 'A taxa de crescimento terminal (g_t) não pode ser negativa.',
      intrinsicValue: null,
      marginOfSafetyPercent: null,
      marketPriceUsed: quote?.price ?? null,
      currency,
      premisesUsed,
      factualInputs,
      intermediates: emptyIntermediates,
      disclaimer: DCF_DISCLAIMER,
    };
  }

  if (discountRate.lessThanOrEqualTo(terminalGrowthRate)) {
    return {
      model: 'DCF_SIMPLIFIED',
      modelName: 'DCF Simplificado (2 Estágios)',
      status: 'INVALID_PREMISES',
      statusReason:
        'A taxa de desconto (r) deve ser estritamente maior que a taxa de crescimento terminal (g_t) para convergência matemática da perpetuidade de Gordon.',
      intrinsicValue: null,
      marginOfSafetyPercent: null,
      marketPriceUsed: quote?.price ?? null,
      currency,
      premisesUsed,
      factualInputs,
      intermediates: emptyIntermediates,
      disclaimer: DCF_DISCLAIMER,
    };
  }

  if (projectionYears < 1 || projectionYears > 15) {
    return {
      model: 'DCF_SIMPLIFIED',
      modelName: 'DCF Simplificado (2 Estágios)',
      status: 'INVALID_PREMISES',
      statusReason: 'O horizonte de projeção explícita deve ser entre 1 e 15 anos.',
      intrinsicValue: null,
      marginOfSafetyPercent: null,
      marketPriceUsed: quote?.price ?? null,
      currency,
      premisesUsed,
      factualInputs,
      intermediates: emptyIntermediates,
      disclaimer: DCF_DISCLAIMER,
    };
  }

  // Validação de Dados Factuais
  if (statement.netIncome === null || statement.sharesCount === null) {
    return {
      model: 'DCF_SIMPLIFIED',
      modelName: 'DCF Simplificado (2 Estágios)',
      status: 'INSUFFICIENT_DATA',
      statusReason:
        'Dados contábeis insuficientes: Lucro Líquido base ou total de ações não informados.',
      intrinsicValue: null,
      marginOfSafetyPercent: null,
      marketPriceUsed: quote?.price ?? null,
      currency,
      premisesUsed,
      factualInputs,
      intermediates: emptyIntermediates,
      disclaimer: DCF_DISCLAIMER,
    };
  }

  if (statement.sharesCount.isZero() || statement.sharesCount.isNegative()) {
    return {
      model: 'DCF_SIMPLIFIED',
      modelName: 'DCF Simplificado (2 Estágios)',
      status: 'INSUFFICIENT_DATA',
      statusReason: 'Número total de ações informado é nulo ou negativo.',
      intrinsicValue: null,
      marginOfSafetyPercent: null,
      marketPriceUsed: quote?.price ?? null,
      currency,
      premisesUsed,
      factualInputs,
      intermediates: emptyIntermediates,
      disclaimer: DCF_DISCLAIMER,
    };
  }

  // Fluxo Base por Ação (LPA base)
  const baseFlow = statement.netIncome.dividedBy(statement.sharesCount);
  factualInputs.baseCashFlowPerShare = baseFlow.toFixed(4);

  if (baseFlow.isZero() || baseFlow.isNegative()) {
    return {
      model: 'DCF_SIMPLIFIED',
      modelName: 'DCF Simplificado (2 Estágios)',
      status: 'NOT_APPLICABLE',
      statusReason:
        'Fluxo de caixa base por ação negativo ou nulo. O modelo de desconto de fluxos com perpetuidade não é aplicável a empresas deficitárias.',
      intrinsicValue: null,
      marginOfSafetyPercent: null,
      marketPriceUsed: quote?.price ?? null,
      currency,
      premisesUsed,
      factualInputs,
      intermediates: {
        ...emptyIntermediates,
        baseFlowPerShare: baseFlow.toFixed(6),
      },
      disclaimer: DCF_DISCLAIMER,
    };
  }

  // Estágio 1: Projeção Explícita de N anos
  const onePlusG1 = new Decimal(1).plus(growthRateStage1);
  const onePlusR = new Decimal(1).plus(discountRate);

  const yearlyProjections: DcfCashFlowProjectionYear[] = [];
  let sumPvExplicit = new Decimal(0);
  let lastYearFlow = baseFlow;

  for (let y = 1; y <= projectionYears; y++) {
    // Flow_y = Flow_{y-1} * (1 + g1)
    const projectedFlow = lastYearFlow.times(onePlusG1);
    lastYearFlow = projectedFlow;

    // DiscountFactor_y = (1 + r)^y
    const discountFactor = onePlusR.pow(y);

    // PV_y = Flow_y / DiscountFactor_y
    const presentValue = projectedFlow.dividedBy(discountFactor);
    sumPvExplicit = sumPvExplicit.plus(presentValue);

    yearlyProjections.push({
      year: y,
      projectedFlow: projectedFlow.toFixed(4),
      discountFactor: discountFactor.toFixed(4),
      presentValue: presentValue.toFixed(4),
    });
  }

  // Estágio 2: Valor Terminal perpétuo (Perpetuidade de Gordon no ano N)
  // Flow_{N+1} = Flow_N * (1 + gt)
  const onePlusGt = new Decimal(1).plus(terminalGrowthRate);
  const flowYearNPlus1 = lastYearFlow.times(onePlusGt);

  // TV_N = Flow_{N+1} / (r - gt)
  const denominator = discountRate.minus(terminalGrowthRate);
  const terminalValueYearN = flowYearNPlus1.dividedBy(denominator);

  // Desconto do TV para o valor presente: TV_0 = TV_N / (1 + r)^N
  const terminalDiscountFactor = onePlusR.pow(projectionYears);
  const presentValueOfTerminal = terminalValueYearN.dividedBy(terminalDiscountFactor);

  // Valor Intrínseco por ação = PV(Estágio 1) + PV(Terminal)
  const intrinsicValue = sumPvExplicit.plus(presentValueOfTerminal);
  const marginOfSafetyPercent = calculateMarginOfSafety(intrinsicValue, quote, currency);

  return {
    model: 'DCF_SIMPLIFIED',
    modelName: 'DCF Simplificado (2 Estágios)',
    status: 'VALID',
    statusReason: null,
    intrinsicValue,
    marginOfSafetyPercent,
    marketPriceUsed: quote?.price ?? null,
    currency,
    premisesUsed,
    factualInputs,
    intermediates: {
      baseFlowPerShare: baseFlow.toFixed(6),
      yearlyProjections,
      presentValueOfExplicitPeriod: sumPvExplicit.toFixed(4),
      terminalValueYearN: terminalValueYearN.toFixed(4),
      presentValueOfTerminalValue: presentValueOfTerminal.toFixed(4),
    },
    disclaimer: DCF_DISCLAIMER,
  };
}

// ─── 4. Motor Agregado ──────────────────────────────────────────────────────

export function calculateTheoreticalValuations(
  assetId: string,
  ticker: string,
  statement: ValuationFundamentalContext,
  quote: ValuationQuoteContext | null,
  customPremises?: {
    bazin?: Partial<BazinPremises>;
    graham?: Partial<GrahamPremises>;
    dcf?: Partial<DcfPremises>;
  }
): TheoreticalValuationResultSet {
  const currency = statement.currency || 'BRL';
  const quoteCurrency = quote?.currency?.toUpperCase() ?? currency.toUpperCase();
  const currencyMismatch = quoteCurrency !== currency.toUpperCase();

  const bazin = calculateBazinValuation(statement, quote, customPremises?.bazin);
  const graham = calculateGrahamValuation(statement, quote, customPremises?.graham);
  const dcf = calculateSimplifiedDcfValuation(statement, quote, customPremises?.dcf);

  const quoteAudit = quote
    ? {
        quotePriceUsed: quote.price.toFixed(4),
        quoteDateUsed:
          quote.quoteDate instanceof Date ? quote.quoteDate.toISOString() : String(quote.quoteDate),
        quoteSource:
          quote.source === 'cotahist' ? ('cotahist' as const) : ('market_quotes' as const),
        quoteDelayStatus: quote.delayStatus,
        isQuoteStale: Boolean(quote.isStale),
        currency: quoteCurrency,
      }
    : null;

  return {
    assetId,
    ticker: ticker.toUpperCase(),
    referencePeriod: statement.referencePeriod,
    currency,
    statementType: statement.statementType,
    quoteAudit,
    currencyMismatch,
    bazin,
    graham,
    dcf,
    globalDisclaimer: GLOBAL_VALUATION_DISCLAIMER,
    calculatedAt: new Date(),
  };
}

// ─── 5. Serialização para SSR e Client-Side ─────────────────────────────────

function serializeModelResult<TPremises, TFactual, TIntermediates, TPremisesSerialized>(
  res: TheoreticalModelResult<TPremises, TFactual, TIntermediates>,
  serializePremises: (p: TPremises) => TPremisesSerialized
): SerializedTheoreticalModelResult<TPremisesSerialized, TFactual, TIntermediates> {
  return {
    model: res.model,
    modelName: res.modelName,
    status: res.status,
    statusReason: res.statusReason,
    intrinsicValue: res.intrinsicValue ? res.intrinsicValue.toFixed(4) : null,
    marginOfSafetyPercent: res.marginOfSafetyPercent ? res.marginOfSafetyPercent.toFixed(2) : null,
    marketPriceUsed: res.marketPriceUsed ? res.marketPriceUsed.toFixed(4) : null,
    currency: res.currency,
    premisesUsed: serializePremises(res.premisesUsed),
    factualInputs: res.factualInputs,
    intermediates: res.intermediates,
    disclaimer: res.disclaimer,
  };
}

export function serializeTheoreticalValuationResultSet(
  resultSet: TheoreticalValuationResultSet
): SerializedTheoreticalValuationResultSet {
  return {
    assetId: resultSet.assetId,
    ticker: resultSet.ticker,
    referencePeriod: resultSet.referencePeriod,
    currency: resultSet.currency,
    statementType: resultSet.statementType,
    quoteAudit: resultSet.quoteAudit,
    currencyMismatch: resultSet.currencyMismatch,
    bazin: serializeModelResult<
      BazinPremises,
      BazinFactualInputs,
      BazinIntermediates,
      SerializedBazinPremises
    >(resultSet.bazin, (p) => ({
      targetDividendYield: p.targetDividendYield.toFixed(4),
    })),
    graham: serializeModelResult<
      GrahamPremises,
      GrahamFactualInputs,
      GrahamIntermediates,
      SerializedGrahamPremises
    >(resultSet.graham, (p) => ({
      grahamMultiplier: p.grahamMultiplier.toFixed(2),
    })),
    dcf: serializeModelResult<
      DcfPremises,
      DcfFactualInputs,
      DcfIntermediates,
      SerializedDcfPremises
    >(resultSet.dcf, (p) => ({
      discountRate: p.discountRate.toFixed(4),
      growthRateStage1: p.growthRateStage1.toFixed(4),
      terminalGrowthRate: p.terminalGrowthRate.toFixed(4),
      projectionYears: p.projectionYears,
    })),
    globalDisclaimer: resultSet.globalDisclaimer,
    calculatedAt: resultSet.calculatedAt.toISOString(),
  };
}
