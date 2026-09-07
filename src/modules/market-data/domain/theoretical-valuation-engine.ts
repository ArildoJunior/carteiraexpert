import { Decimal } from '@/lib/decimal';
import type {
  ValuationFundamentalContext,
  ValuationQuoteContext,
  ValuationModelType,
  ValuationCalculationStatus,
  DataQualityStatus,
  ValuationTraceability,
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
  MultiplesPremises,
  MultiplesFactualInputs,
  MultiplesIntermediates,
  ConsensusValuationResult,
  TheoreticalModelResult,
  TheoreticalValuationResultSet,
  SerializedTheoreticalValuationResultSet,
  SerializedTheoreticalModelResult,
  SerializedBazinPremises,
  SerializedGrahamPremises,
  SerializedDcfPremises,
  SerializedMultiplesPremises,
  SerializedConsensusValuationResult,
} from './theoretical-valuation.types';

export const METHODOLOGY_VERSION = '1.0.0';

export const BAZIN_DISCLAIMER =
  'O Preço Teto de Bazin indica o preço máximo teórico para obter o Dividend Yield alvo pretendido, sob a premissa de proventos estáveis. Não representa garantia de remuneração futura nem recomendação de compra ou venda.';

export const GRAHAM_DISCLAIMER =
  'O Valor Intrínseco de Benjamin Graham é uma métrica teórica clássica de Value Investing baseada em Lucro e Patrimônio Líquido históricos. Não reflete dinamismo setorial, crescimento futuro nem preço-alvo oficial.';

export const DCF_DISCLAIMER =
  'O Fluxo de Caixa Descontado (DCF) simplificado é uma simulação teórica em dois estágios altamente sensível às premissas de desconto e crescimento adotadas. Não constitui projeção oficial de mercado nem garantia de retorno.';

export const MULTIPLES_DISCLAIMER =
  'O Valuation por Múltiplos é um método comparativo determinístico baseado em múltiplos de mercado pretendidos (P/L, EV/EBITDA e P/VP). Não constitui garantia de retorno nem recomendação de compra ou venda.';

export const CONSENSUS_DISCLAIMER =
  'O Consenso Teórico sintetiza a média dos modelos fundamentalistas válidos (Bazin, Graham, DCF e Múltiplos). Trata-se de uma consolidação puramente matemática para fins educacionais, sem constituir recomendação de investimento.';

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

/**
 * Avalia a qualidade dos dados do modelo com base no status e atributos da cotação.
 */
function determineModelDataQualityStatus(
  currencyMismatch: boolean,
  isStale: boolean | undefined,
  calcStatus: ValuationCalculationStatus
): DataQualityStatus {
  if (currencyMismatch || calcStatus === 'INCOMPATIBLE') {
    return 'INCOMPATIBLE';
  }
  if (isStale) {
    return 'STALE';
  }
  if (calcStatus === 'INSUFFICIENT_DATA' || calcStatus === 'INVALID_PREMISES') {
    return 'INCOMPLETE';
  }
  if (calcStatus === 'NOT_APPLICABLE') {
    return 'UNAVAILABLE';
  }
  return 'VALID';
}

// ─── 1. Motor Bazin ─────────────────────────────────────────────────────────

export function calculateBazinValuation(
  statement: ValuationFundamentalContext,
  quote: ValuationQuoteContext | null,
  customPremises?: Partial<BazinPremises>
): TheoreticalModelResult<BazinPremises, BazinFactualInputs, BazinIntermediates> {
  const targetDividendYield = customPremises?.targetDividendYield ?? new Decimal('0.06');
  const currency = statement.currency || 'BRL';
  const quoteCurrency = quote?.currency?.toUpperCase() ?? currency.toUpperCase();
  const currencyMismatch = quoteCurrency !== currency.toUpperCase();

  const factualInputs: BazinFactualInputs = {
    dividendsDeclared: statement.dividendsDeclared ? statement.dividendsDeclared.toFixed(4) : null,
    sharesCount: statement.sharesCount ? statement.sharesCount.toFixed(4) : null,
    dpa: null,
    currency,
  };

  const premisesUsed: BazinPremises = {
    targetDividendYield,
  };

  const baseTraceability: ValuationTraceability = {
    source: statement.source || 'CVM_DFP',
    referencePeriod: statement.referencePeriod,
    currency,
    referenceDate:
      statement.referenceDate instanceof Date
        ? statement.referenceDate.toISOString()
        : String(statement.referenceDate),
    methodology: 'PRECO_TETO_BAZIN',
    formula: 'Preço Teto = (DividendsDeclared / SharesCount) / TargetDividendYield',
    premises: { targetDividendYield: targetDividendYield.toString() },
    methodologyVersion: METHODOLOGY_VERSION,
    limitations: [
      'Assume perpetuidade e estabilidade dos proventos declarados passados.',
      'Não considera reinvestimento de lucros ou expansão operacional da companhia.',
      'Inaplicável para companhias em fase inicial ou sem histórico de remuneração a acionistas.',
    ],
  };

  // Validação das Premissas
  if (targetDividendYield.isZero() || targetDividendYield.isNegative()) {
    return {
      model: 'BAZIN',
      modelName: 'Preço Teto de Bazin',
      status: 'INVALID_PREMISES',
      statusReason: 'O Dividend Yield alvo deve ser estritamente maior que zero.',
      dataQualityStatus: determineModelDataQualityStatus(
        currencyMismatch,
        quote?.isStale,
        'INVALID_PREMISES'
      ),
      methodologyVersion: METHODOLOGY_VERSION,
      traceability: baseTraceability,
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
      statusReason:
        'Dados contábeis insuficientes: proventos declarados ou total de ações não informados.',
      dataQualityStatus: determineModelDataQualityStatus(
        currencyMismatch,
        quote?.isStale,
        'INSUFFICIENT_DATA'
      ),
      methodologyVersion: METHODOLOGY_VERSION,
      traceability: baseTraceability,
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
      dataQualityStatus: determineModelDataQualityStatus(
        currencyMismatch,
        quote?.isStale,
        'INSUFFICIENT_DATA'
      ),
      methodologyVersion: METHODOLOGY_VERSION,
      traceability: baseTraceability,
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
      dataQualityStatus: determineModelDataQualityStatus(
        currencyMismatch,
        quote?.isStale,
        'NOT_APPLICABLE'
      ),
      methodologyVersion: METHODOLOGY_VERSION,
      traceability: baseTraceability,
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
    dataQualityStatus: determineModelDataQualityStatus(currencyMismatch, quote?.isStale, 'VALID'),
    methodologyVersion: METHODOLOGY_VERSION,
    traceability: baseTraceability,
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
  const quoteCurrency = quote?.currency?.toUpperCase() ?? currency.toUpperCase();
  const currencyMismatch = quoteCurrency !== currency.toUpperCase();

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

  const baseTraceability: ValuationTraceability = {
    source: statement.source || 'CVM_DFP',
    referencePeriod: statement.referencePeriod,
    currency,
    referenceDate:
      statement.referenceDate instanceof Date
        ? statement.referenceDate.toISOString()
        : String(statement.referenceDate),
    methodology: 'FORMULA_DE_GRAHAM',
    formula: 'Valor Intrínseco = sqrt(GrahamMultiplier * LPA * VPA)',
    premises: { grahamMultiplier: grahamMultiplier.toString() },
    methodologyVersion: METHODOLOGY_VERSION,
    limitations: [
      'Exige Lucro Líquido e Patrimônio Líquido estritamente positivos.',
      'Não reflete diferenciais de intensidade de capital ou ativos intangíveis.',
      'Multiplicador clássico de 22.5 corresponde a P/L 15.0 e P/VP 1.5 normativos do mercado original.',
    ],
  };

  // Validação das Premissas
  if (grahamMultiplier.isZero() || grahamMultiplier.isNegative()) {
    return {
      model: 'GRAHAM',
      modelName: 'Fórmula de Graham',
      status: 'INVALID_PREMISES',
      statusReason: 'O multiplicador de Graham deve ser estritamente maior que zero.',
      dataQualityStatus: determineModelDataQualityStatus(
        currencyMismatch,
        quote?.isStale,
        'INVALID_PREMISES'
      ),
      methodologyVersion: METHODOLOGY_VERSION,
      traceability: baseTraceability,
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
      dataQualityStatus: determineModelDataQualityStatus(
        currencyMismatch,
        quote?.isStale,
        'INSUFFICIENT_DATA'
      ),
      methodologyVersion: METHODOLOGY_VERSION,
      traceability: baseTraceability,
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
      dataQualityStatus: determineModelDataQualityStatus(
        currencyMismatch,
        quote?.isStale,
        'INSUFFICIENT_DATA'
      ),
      methodologyVersion: METHODOLOGY_VERSION,
      traceability: baseTraceability,
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
      dataQualityStatus: determineModelDataQualityStatus(
        currencyMismatch,
        quote?.isStale,
        'NOT_APPLICABLE'
      ),
      methodologyVersion: METHODOLOGY_VERSION,
      traceability: baseTraceability,
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
      dataQualityStatus: determineModelDataQualityStatus(
        currencyMismatch,
        quote?.isStale,
        'NOT_APPLICABLE'
      ),
      methodologyVersion: METHODOLOGY_VERSION,
      traceability: baseTraceability,
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
    dataQualityStatus: determineModelDataQualityStatus(currencyMismatch, quote?.isStale, 'VALID'),
    methodologyVersion: METHODOLOGY_VERSION,
    traceability: baseTraceability,
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
  const quoteCurrency = quote?.currency?.toUpperCase() ?? currency.toUpperCase();
  const currencyMismatch = quoteCurrency !== currency.toUpperCase();

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

  const baseTraceability: ValuationTraceability = {
    source: statement.source || 'CVM_DFP',
    referencePeriod: statement.referencePeriod,
    currency,
    referenceDate:
      statement.referenceDate instanceof Date
        ? statement.referenceDate.toISOString()
        : String(statement.referenceDate),
    methodology: 'DCF_SIMPLIFICADO_2_ESTAGIOS',
    formula:
      'VI = sum_{t=1}^N [FCF_t / (1+r)^t] + [FCF_{N+1} / (r - g_t)] / (1+r)^N',
    premises: {
      discountRate: discountRate.toString(),
      growthRateStage1: growthRateStage1.toString(),
      terminalGrowthRate: terminalGrowthRate.toString(),
      projectionYears,
    },
    methodologyVersion: METHODOLOGY_VERSION,
    limitations: [
      'Sensibilidade extrema a variações na taxa de desconto e no crescimento perpétuo.',
      'Projeção linear baseada no LPA inicial constante sem considerar dinâmicas de capital de giro.',
      'Perpetuidade de Gordon requer taxa de desconto estritamente maior que o crescimento terminal.',
    ],
  };

  // Validação das Premissas
  if (discountRate.isZero() || discountRate.isNegative()) {
    return {
      model: 'DCF_SIMPLIFIED',
      modelName: 'DCF Simplificado (2 Estágios)',
      status: 'INVALID_PREMISES',
      statusReason: 'A taxa de desconto (r) deve ser estritamente maior que zero.',
      dataQualityStatus: determineModelDataQualityStatus(
        currencyMismatch,
        quote?.isStale,
        'INVALID_PREMISES'
      ),
      methodologyVersion: METHODOLOGY_VERSION,
      traceability: baseTraceability,
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
      dataQualityStatus: determineModelDataQualityStatus(
        currencyMismatch,
        quote?.isStale,
        'INVALID_PREMISES'
      ),
      methodologyVersion: METHODOLOGY_VERSION,
      traceability: baseTraceability,
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
      dataQualityStatus: determineModelDataQualityStatus(
        currencyMismatch,
        quote?.isStale,
        'INVALID_PREMISES'
      ),
      methodologyVersion: METHODOLOGY_VERSION,
      traceability: baseTraceability,
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
      dataQualityStatus: determineModelDataQualityStatus(
        currencyMismatch,
        quote?.isStale,
        'INVALID_PREMISES'
      ),
      methodologyVersion: METHODOLOGY_VERSION,
      traceability: baseTraceability,
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
      dataQualityStatus: determineModelDataQualityStatus(
        currencyMismatch,
        quote?.isStale,
        'INSUFFICIENT_DATA'
      ),
      methodologyVersion: METHODOLOGY_VERSION,
      traceability: baseTraceability,
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
      dataQualityStatus: determineModelDataQualityStatus(
        currencyMismatch,
        quote?.isStale,
        'INSUFFICIENT_DATA'
      ),
      methodologyVersion: METHODOLOGY_VERSION,
      traceability: baseTraceability,
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
      dataQualityStatus: determineModelDataQualityStatus(
        currencyMismatch,
        quote?.isStale,
        'NOT_APPLICABLE'
      ),
      methodologyVersion: METHODOLOGY_VERSION,
      traceability: baseTraceability,
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
    dataQualityStatus: determineModelDataQualityStatus(currencyMismatch, quote?.isStale, 'VALID'),
    methodologyVersion: METHODOLOGY_VERSION,
    traceability: baseTraceability,
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

// ─── 4. Motor de Múltiplos ──────────────────────────────────────────────────

export function calculateMultiplesValuation(
  statement: ValuationFundamentalContext,
  quote: ValuationQuoteContext | null,
  customPremises?: Partial<MultiplesPremises>
): TheoreticalModelResult<MultiplesPremises, MultiplesFactualInputs, MultiplesIntermediates> {
  const targetPe = customPremises?.targetPe !== undefined ? customPremises.targetPe : new Decimal('10.0');
  const targetEvToEbitda =
    customPremises?.targetEvToEbitda !== undefined
      ? customPremises.targetEvToEbitda
      : new Decimal('6.0');
  const targetPb = customPremises?.targetPb !== undefined ? customPremises.targetPb : new Decimal('1.5');
  const selectedMultipleMethod = customPremises?.selectedMultipleMethod ?? 'AVERAGE';
  const currency = statement.currency || 'BRL';

  const quoteCurrency = quote?.currency?.toUpperCase() ?? currency.toUpperCase();
  const currencyMismatch = quoteCurrency !== currency.toUpperCase();

  // Dívida Líquida contábil
  const netDebtDecimal =
    statement.grossDebt !== null && statement.cashEquivalents !== null
      ? statement.grossDebt.minus(statement.cashEquivalents)
      : null;

  const factualInputs: MultiplesFactualInputs = {
    netIncome: statement.netIncome ? statement.netIncome.toFixed(4) : null,
    totalEquity: statement.totalEquity ? statement.totalEquity.toFixed(4) : null,
    ebitda: statement.ebitda ? statement.ebitda.toFixed(4) : null,
    grossDebt: statement.grossDebt ? statement.grossDebt.toFixed(4) : null,
    cashEquivalents: statement.cashEquivalents ? statement.cashEquivalents.toFixed(4) : null,
    netDebt: netDebtDecimal ? netDebtDecimal.toFixed(4) : null,
    sharesCount: statement.sharesCount ? statement.sharesCount.toFixed(4) : null,
    lpa: null,
    vpa: null,
    currency,
  };

  const premisesUsed: MultiplesPremises = {
    targetPe,
    targetEvToEbitda,
    targetPb,
    selectedMultipleMethod,
  };

  const emptyIntermediates: MultiplesIntermediates = {
    lpaDecimal: null,
    vpaDecimal: null,
    netDebtDecimal: netDebtDecimal ? netDebtDecimal.toFixed(4) : null,
    fairPricePe: null,
    fairPriceEvToEbitda: null,
    fairPricePb: null,
    methodApplied: selectedMultipleMethod,
    modelsUsedCount: 0,
  };

  const baseTraceability: ValuationTraceability = {
    source: statement.source || 'CVM_DFP',
    referencePeriod: statement.referencePeriod,
    currency,
    referenceDate:
      statement.referenceDate instanceof Date
        ? statement.referenceDate.toISOString()
        : String(statement.referenceDate),
    methodology: 'VALUATION_POR_MULTIPLOS',
    formula:
      'Preço Justo P/L = TargetPE * LPA; Preço Justo EV/EBITDA = (TargetEV_EBITDA * EBITDA - NetDebt) / SharesCount; Preço Justo P/VP = TargetPB * VPA',
    premises: {
      targetPe: targetPe ? targetPe.toString() : null,
      targetEvToEbitda: targetEvToEbitda ? targetEvToEbitda.toString() : null,
      targetPb: targetPb ? targetPb.toString() : null,
      selectedMultipleMethod,
    },
    methodologyVersion: METHODOLOGY_VERSION,
    limitations: [
      'Múltiplos teóricos fixos ignoram particularidades de ciclo econômico e crescimento futuro.',
      'Inaplicável quando as métricas fundamentais associadas são nulas ou negativas.',
      'Sensível à estimativa contábil de dívida líquida no modelo de EV/EBITDA.',
    ],
  };

  // Ajuste 6 — Bloqueio estrito por divergência cambial
  if (currencyMismatch) {
    return {
      model: 'MULTIPLES',
      modelName: 'Valuation por Múltiplos',
      status: 'INCOMPATIBLE',
      statusReason: `Divergência cambial bloqueante: cotação em ${quoteCurrency} e demonstrativo em ${currency.toUpperCase()}. O modelo de múltiplos não calcula preço-alvo sem paridade cambial homologada.`,
      dataQualityStatus: 'INCOMPATIBLE',
      methodologyVersion: METHODOLOGY_VERSION,
      traceability: baseTraceability,
      intrinsicValue: null,
      marginOfSafetyPercent: null,
      marketPriceUsed: quote?.price ?? null,
      currency,
      premisesUsed,
      factualInputs,
      intermediates: emptyIntermediates,
      disclaimer: MULTIPLES_DISCLAIMER,
    };
  }

  // Validação das premissas numéricas
  if (
    (targetPe !== null && (targetPe.isZero() || targetPe.isNegative())) ||
    (targetEvToEbitda !== null && (targetEvToEbitda.isZero() || targetEvToEbitda.isNegative())) ||
    (targetPb !== null && (targetPb.isZero() || targetPb.isNegative()))
  ) {
    return {
      model: 'MULTIPLES',
      modelName: 'Valuation por Múltiplos',
      status: 'INVALID_PREMISES',
      statusReason: 'Os múltiplos alvo devem ser estritamente maiores que zero.',
      dataQualityStatus: determineModelDataQualityStatus(
        currencyMismatch,
        quote?.isStale,
        'INVALID_PREMISES'
      ),
      methodologyVersion: METHODOLOGY_VERSION,
      traceability: baseTraceability,
      intrinsicValue: null,
      marginOfSafetyPercent: null,
      marketPriceUsed: quote?.price ?? null,
      currency,
      premisesUsed,
      factualInputs,
      intermediates: emptyIntermediates,
      disclaimer: MULTIPLES_DISCLAIMER,
    };
  }

  // Validação de número de ações
  if (!statement.sharesCount || statement.sharesCount.isZero() || statement.sharesCount.isNegative()) {
    return {
      model: 'MULTIPLES',
      modelName: 'Valuation por Múltiplos',
      status: 'INSUFFICIENT_DATA',
      statusReason: 'Número total de ações informado é nulo ou negativo.',
      dataQualityStatus: determineModelDataQualityStatus(
        currencyMismatch,
        quote?.isStale,
        'INSUFFICIENT_DATA'
      ),
      methodologyVersion: METHODOLOGY_VERSION,
      traceability: baseTraceability,
      intrinsicValue: null,
      marginOfSafetyPercent: null,
      marketPriceUsed: quote?.price ?? null,
      currency,
      premisesUsed,
      factualInputs,
      intermediates: emptyIntermediates,
      disclaimer: MULTIPLES_DISCLAIMER,
    };
  }

  const sharesCount = statement.sharesCount;

  // Derivação de LPA e VPA
  const lpaDecimal = statement.netIncome ? statement.netIncome.dividedBy(sharesCount) : null;
  const vpaDecimal = statement.totalEquity ? statement.totalEquity.dividedBy(sharesCount) : null;

  factualInputs.lpa = lpaDecimal ? lpaDecimal.toFixed(4) : null;
  factualInputs.vpa = vpaDecimal ? vpaDecimal.toFixed(4) : null;

  // 1. Preço Justo P/L: TargetPE * LPA
  let fairPricePe: Decimal | null = null;
  if (targetPe && lpaDecimal && lpaDecimal.greaterThan(0)) {
    fairPricePe = targetPe.times(lpaDecimal);
  }

  // 2. Preço Justo P/VP: TargetPB * VPA
  let fairPricePb: Decimal | null = null;
  if (targetPb && vpaDecimal && vpaDecimal.greaterThan(0)) {
    fairPricePb = targetPb.times(vpaDecimal);
  }

  // 3. Preço Justo EV/EBITDA: (TargetEV_EBITDA * EBITDA - NetDebt) / SharesCount
  let fairPriceEvToEbitda: Decimal | null = null;
  if (targetEvToEbitda && statement.ebitda && statement.ebitda.greaterThan(0) && netDebtDecimal !== null) {
    const targetEV = targetEvToEbitda.times(statement.ebitda);
    const equityValue = targetEV.minus(netDebtDecimal);
    if (equityValue.greaterThan(0)) {
      fairPriceEvToEbitda = equityValue.dividedBy(sharesCount);
    } else {
      fairPriceEvToEbitda = new Decimal(0);
    }
  }

  // Seleção e consolidação do valor intrínseco
  let intrinsicValue: Decimal | null = null;
  let modelsUsedCount = 0;

  if (selectedMultipleMethod === 'PE') {
    intrinsicValue = fairPricePe;
    if (fairPricePe) modelsUsedCount = 1;
  } else if (selectedMultipleMethod === 'EV_EBITDA') {
    intrinsicValue = fairPriceEvToEbitda;
    if (fairPriceEvToEbitda) modelsUsedCount = 1;
  } else if (selectedMultipleMethod === 'PB') {
    intrinsicValue = fairPricePb;
    if (fairPricePb) modelsUsedCount = 1;
  } else {
    // AVERAGE de todos os múltiplos válidos e positivos
    const availablePrices: Decimal[] = [];
    if (fairPricePe && fairPricePe.greaterThan(0)) availablePrices.push(fairPricePe);
    if (fairPriceEvToEbitda && fairPriceEvToEbitda.greaterThan(0)) availablePrices.push(fairPriceEvToEbitda);
    if (fairPricePb && fairPricePb.greaterThan(0)) availablePrices.push(fairPricePb);

    if (availablePrices.length > 0) {
      const sum = availablePrices.reduce((acc, p) => acc.plus(p), new Decimal(0));
      intrinsicValue = sum.dividedBy(availablePrices.length);
      modelsUsedCount = availablePrices.length;
    }
  }

  const intermediates: MultiplesIntermediates = {
    lpaDecimal: lpaDecimal ? lpaDecimal.toFixed(6) : null,
    vpaDecimal: vpaDecimal ? vpaDecimal.toFixed(6) : null,
    netDebtDecimal: netDebtDecimal ? netDebtDecimal.toFixed(4) : null,
    fairPricePe: fairPricePe ? fairPricePe.toFixed(4) : null,
    fairPriceEvToEbitda: fairPriceEvToEbitda ? fairPriceEvToEbitda.toFixed(4) : null,
    fairPricePb: fairPricePb ? fairPricePb.toFixed(4) : null,
    methodApplied: selectedMultipleMethod,
    modelsUsedCount,
  };

  if (!intrinsicValue || intrinsicValue.isZero() || intrinsicValue.isNegative()) {
    return {
      model: 'MULTIPLES',
      modelName: 'Valuation por Múltiplos',
      status: 'NOT_APPLICABLE',
      statusReason:
        'Não foi possível derivar preço justo por múltiplos. Métricas contábeis (Lucro Líquido, EBITDA ou Patrimônio Líquido) são deficitárias ou insuficientes.',
      dataQualityStatus: determineModelDataQualityStatus(
        currencyMismatch,
        quote?.isStale,
        'NOT_APPLICABLE'
      ),
      methodologyVersion: METHODOLOGY_VERSION,
      traceability: baseTraceability,
      intrinsicValue: null,
      marginOfSafetyPercent: null,
      marketPriceUsed: quote?.price ?? null,
      currency,
      premisesUsed,
      factualInputs,
      intermediates,
      disclaimer: MULTIPLES_DISCLAIMER,
    };
  }

  const marginOfSafetyPercent = calculateMarginOfSafety(intrinsicValue, quote, currency);

  return {
    model: 'MULTIPLES',
    modelName: 'Valuation por Múltiplos',
    status: 'VALID',
    statusReason: null,
    dataQualityStatus: determineModelDataQualityStatus(currencyMismatch, quote?.isStale, 'VALID'),
    methodologyVersion: METHODOLOGY_VERSION,
    traceability: baseTraceability,
    intrinsicValue,
    marginOfSafetyPercent,
    marketPriceUsed: quote?.price ?? null,
    currency,
    premisesUsed,
    factualInputs,
    intermediates,
    disclaimer: MULTIPLES_DISCLAIMER,
  };
}

// ─── 5. Motor de Consenso Teórico ───────────────────────────────────────────

export function calculateConsensusValuation(
  statement: ValuationFundamentalContext,
  quote: ValuationQuoteContext | null,
  models: Array<TheoreticalModelResult<unknown, unknown, unknown>>
): ConsensusValuationResult {
  const currency = statement.currency || 'BRL';
  const quoteCurrency = quote?.currency?.toUpperCase() ?? currency.toUpperCase();
  const currencyMismatch = quoteCurrency !== currency.toUpperCase();

  const baseTraceability: ValuationTraceability = {
    source: 'CARTEIRAEXPERT_CONSENSUS_ENGINE',
    referencePeriod: statement.referencePeriod,
    currency,
    referenceDate:
      statement.referenceDate instanceof Date
        ? statement.referenceDate.toISOString()
        : String(statement.referenceDate),
    methodology: 'CONSENSO_TEORICO_PONDERADO',
    formula:
      'Preço Consenso = sum_{m in V} (Preço_m * Peso_m), onde V é o conjunto de modelos com status VALID',
    premises: {
      candidateModels: models.map((m) => m.model),
    },
    methodologyVersion: METHODOLOGY_VERSION,
    limitations: [
      'O Consenso Teórico sintetiza exclusivamente modelos que alcançaram status VALID.',
      'Não substitui análise de mercado e não deve ser interpretado como recomendação de investimento.',
    ],
  };

  // Ajuste 6 — Bloqueio estrito por divergência cambial
  if (currencyMismatch) {
    return {
      model: 'CONSENSUS',
      modelName: 'Consenso Teórico de Preços',
      status: 'INCOMPATIBLE',
      statusReason: `Consenso bloqueado por divergência cambial entre cotação (${quoteCurrency}) e demonstrativo (${currency.toUpperCase()}).`,
      dataQualityStatus: 'INCOMPATIBLE',
      methodologyVersion: METHODOLOGY_VERSION,
      traceability: baseTraceability,
      weightedTargetPrice: null,
      marginOfSafetyPercent: null,
      marketPriceUsed: quote?.price ?? null,
      currency,
      modelsIncluded: [],
      modelWeights: [],
      disclaimer: CONSENSUS_DISCLAIMER,
      calculatedAt: new Date(),
    };
  }

  // Filtra apenas modelos com status VALID e preço intrínseco positivo
  const validModels = models.filter(
    (m) => m.status === 'VALID' && m.intrinsicValue !== null && m.intrinsicValue.greaterThan(0)
  );

  if (validModels.length === 0) {
    return {
      model: 'CONSENSUS',
      modelName: 'Consenso Teórico de Preços',
      status: 'INSUFFICIENT_DATA',
      statusReason:
        'Nenhum modelo fundamentalista individual atingiu status VALID para compor o consenso.',
      dataQualityStatus: 'INCOMPLETE',
      methodologyVersion: METHODOLOGY_VERSION,
      traceability: baseTraceability,
      weightedTargetPrice: null,
      marginOfSafetyPercent: null,
      marketPriceUsed: quote?.price ?? null,
      currency,
      modelsIncluded: [],
      modelWeights: [],
      disclaimer: CONSENSUS_DISCLAIMER,
      calculatedAt: new Date(),
    };
  }

  // Equiponderação: Peso = 1 / N
  const count = new Decimal(validModels.length);
  const weightPerModel = new Decimal(1).dividedBy(count);

  let sumWeightedPrices = new Decimal(0);
  const modelWeights = validModels.map((m) => {
    sumWeightedPrices = sumWeightedPrices.plus(m.intrinsicValue!);
    return {
      model: m.model,
      modelName: m.modelName,
      targetPrice: m.intrinsicValue!,
      weight: weightPerModel,
      status: m.status,
    };
  });

  const weightedTargetPrice = sumWeightedPrices.dividedBy(count);
  const marginOfSafetyPercent = calculateMarginOfSafety(weightedTargetPrice, quote, currency);

  return {
    model: 'CONSENSUS',
    modelName: 'Consenso Teórico de Preços',
    status: 'VALID',
    statusReason: null,
    dataQualityStatus: quote?.isStale ? 'STALE' : 'VALID',
    methodologyVersion: METHODOLOGY_VERSION,
    traceability: baseTraceability,
    weightedTargetPrice,
    marginOfSafetyPercent,
    marketPriceUsed: quote?.price ?? null,
    currency,
    modelsIncluded: validModels.map((m) => m.model),
    modelWeights,
    disclaimer: CONSENSUS_DISCLAIMER,
    calculatedAt: new Date(),
  };
}

// ─── 6. Motor Agregado de Valuations ────────────────────────────────────────

export function calculateTheoreticalValuations(
  assetId: string,
  ticker: string,
  statement: ValuationFundamentalContext,
  quote: ValuationQuoteContext | null,
  customPremises?: {
    bazin?: Partial<BazinPremises>;
    graham?: Partial<GrahamPremises>;
    dcf?: Partial<DcfPremises>;
    multiples?: Partial<MultiplesPremises>;
  }
): TheoreticalValuationResultSet {
  const currency = statement.currency || 'BRL';
  const quoteCurrency = quote?.currency?.toUpperCase() ?? currency.toUpperCase();
  const currencyMismatch = quoteCurrency !== currency.toUpperCase();

  const bazin = calculateBazinValuation(statement, quote, customPremises?.bazin);
  const graham = calculateGrahamValuation(statement, quote, customPremises?.graham);
  const dcf = calculateSimplifiedDcfValuation(statement, quote, customPremises?.dcf);
  const multiples = calculateMultiplesValuation(statement, quote, customPremises?.multiples);

  const consensus = calculateConsensusValuation(statement, quote, [
    bazin,
    graham,
    dcf,
    multiples,
  ]);

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

  // Determina status global de qualidade de dados
  let dataQualityStatus: DataQualityStatus = 'VALID';
  if (currencyMismatch) {
    dataQualityStatus = 'INCOMPATIBLE';
  } else if (quote?.isStale) {
    dataQualityStatus = 'STALE';
  } else if (consensus.status !== 'VALID') {
    dataQualityStatus = 'INCOMPLETE';
  }

  return {
    assetId,
    ticker: ticker.toUpperCase(),
    referencePeriod: statement.referencePeriod,
    currency,
    statementType: statement.statementType,
    quoteAudit,
    currencyMismatch,
    dataQualityStatus,
    bazin,
    graham,
    dcf,
    multiples,
    consensus,
    globalDisclaimer: GLOBAL_VALUATION_DISCLAIMER,
    calculatedAt: new Date(),
  };
}

// ─── 7. Serialização para SSR e Client-Side ─────────────────────────────────

function serializeModelResult<TPremises, TFactual, TIntermediates, TPremisesSerialized>(
  res: TheoreticalModelResult<TPremises, TFactual, TIntermediates>,
  serializePremises: (p: TPremises) => TPremisesSerialized
): SerializedTheoreticalModelResult<TPremisesSerialized, TFactual, TIntermediates> {
  return {
    model: res.model,
    modelName: res.modelName,
    status: res.status,
    statusReason: res.statusReason,
    dataQualityStatus: res.dataQualityStatus,
    methodologyVersion: res.methodologyVersion,
    traceability: res.traceability,
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
    dataQualityStatus: resultSet.dataQualityStatus,
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
    multiples: serializeModelResult<
      MultiplesPremises,
      MultiplesFactualInputs,
      MultiplesIntermediates,
      SerializedMultiplesPremises
    >(resultSet.multiples, (p) => ({
      targetPe: p.targetPe ? p.targetPe.toFixed(2) : null,
      targetEvToEbitda: p.targetEvToEbitda ? p.targetEvToEbitda.toFixed(2) : null,
      targetPb: p.targetPb ? p.targetPb.toFixed(2) : null,
      selectedMultipleMethod: p.selectedMultipleMethod ?? 'AVERAGE',
    })),
    consensus: {
      model: resultSet.consensus.model,
      modelName: resultSet.consensus.modelName,
      status: resultSet.consensus.status,
      statusReason: resultSet.consensus.statusReason,
      dataQualityStatus: resultSet.consensus.dataQualityStatus,
      methodologyVersion: resultSet.consensus.methodologyVersion,
      traceability: resultSet.consensus.traceability,
      weightedTargetPrice: resultSet.consensus.weightedTargetPrice
        ? resultSet.consensus.weightedTargetPrice.toFixed(4)
        : null,
      marginOfSafetyPercent: resultSet.consensus.marginOfSafetyPercent
        ? resultSet.consensus.marginOfSafetyPercent.toFixed(2)
        : null,
      marketPriceUsed: resultSet.consensus.marketPriceUsed
        ? resultSet.consensus.marketPriceUsed.toFixed(4)
        : null,
      currency: resultSet.consensus.currency,
      modelsIncluded: resultSet.consensus.modelsIncluded,
      modelWeights: resultSet.consensus.modelWeights.map((w) => ({
        model: w.model,
        modelName: w.modelName,
        targetPrice: w.targetPrice.toFixed(4),
        weight: w.weight.toFixed(4),
        status: w.status,
      })),
      disclaimer: resultSet.consensus.disclaimer,
      calculatedAt: resultSet.consensus.calculatedAt.toISOString(),
    },
    globalDisclaimer: resultSet.globalDisclaimer,
    calculatedAt: resultSet.calculatedAt.toISOString(),
  };
}
