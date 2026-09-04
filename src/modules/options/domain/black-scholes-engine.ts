import { Decimal, toDecimal } from '@/lib/decimal';
import type {
  BlackScholesInput,
  GreeksResult,
  Moneyness,
  PayoffAnalysis,
  PayoffPoint,
  OptionType,
  OptionDirection,
} from './options.types';

// Constantes matemáticas em alta precisão Decimal (40 dígitos)
const ZERO = new Decimal('0');
const ONE = new Decimal('1');
const TWO = new Decimal('2');
const PI = new Decimal('3.141592653589793238462643383279502884197');
const SQRT_2PI = TWO.mul(PI).sqrt();
const DAYS_PER_YEAR_BUSINESS = new Decimal('252');
const ONE_PERCENT = new Decimal('0.01');

// Constantes da aproximação de Abramowitz & Stegun (7.1.26) para N(x)
const P_CONST = new Decimal('0.2316419');
const A1 = new Decimal('0.319381530');
const A2 = new Decimal('-0.356563782');
const A3 = new Decimal('1.781477937');
const A4 = new Decimal('-1.821255978');
const A5 = new Decimal('1.330274429');

/**
 * Função densidade de probabilidade normal padrão (PDF): N'(x) = (1 / sqrt(2*pi)) * exp(-x^2 / 2)
 */
export function normalPdf(x: Decimal): Decimal {
  const xSquared = x.mul(x);
  const exponent = xSquared.div(TWO).neg();
  return exponent.exp().div(SQRT_2PI);
}

/**
 * Função de distribuição acumulada normal padrão (CDF): N(x)
 * Implementada via aproximação polinomial de Abramowitz & Stegun (precisão |erro| < 1.5e-7).
 */
export function normalCdf(x: Decimal): Decimal {
  if (x.isZero()) {
    return new Decimal('0.5');
  }

  const isNegative = x.isNegative();
  const absX = x.abs();

  // k = 1 / (1 + p * x)
  const k = ONE.div(ONE.add(P_CONST.mul(absX)));

  // Polinômio: a1*k + a2*k^2 + a3*k^3 + a4*k^4 + a5*k^5
  const poly = k.mul(
    A1.add(
      k.mul(
        A2.add(
          k.mul(
            A3.add(
              k.mul(
                A4.add(k.mul(A5))
              )
            )
          )
        )
      )
    )
  );

  const pdf = normalPdf(absX);
  const cdfPositive = ONE.sub(pdf.mul(poly));

  return isNegative ? ONE.sub(cdfPositive) : cdfPositive;
}

/**
 * Validação rigorosa dos parâmetros de entrada do modelo Black-Scholes.
 */
export function validateBlackScholesInput(input: BlackScholesInput): void {
  const s = toDecimal(input.spotPrice);
  const k = toDecimal(input.strikePrice);
  const t = toDecimal(input.timeToExpirationYears);
  const r = toDecimal(input.riskFreeRate);
  const sigma = toDecimal(input.volatility);

  if (s.lessThanOrEqualTo(ZERO)) {
    throw new Error('Preço do ativo-objeto deve ser estritamente maior que zero.');
  }
  if (k.lessThanOrEqualTo(ZERO)) {
    throw new Error('Preço de exercício (strike) deve ser estritamente maior que zero.');
  }
  if (t.isNegative()) {
    throw new Error('Tempo até o vencimento não pode ser negativo.');
  }
  if (r.isNegative()) {
    throw new Error('Taxa livre de risco não pode ser negativa.');
  }
  if (sigma.lessThanOrEqualTo(ZERO)) {
    throw new Error('Volatilidade implícita deve ser estritamente maior que zero.');
  }
  if (sigma.greaterThan(new Decimal('5.0'))) {
    throw new Error('Volatilidade implícita acima de 500% a.a. não é suportada.');
  }
}

/**
 * Calcula o Moneyness da opção.
 */
export function calculateMoneyness(spot: Decimal, strike: Decimal, optionType: OptionType): Moneyness {
  // Margem ATM de +/- 1%
  const lowerAtm = strike.mul(new Decimal('0.99'));
  const upperAtm = strike.mul(new Decimal('1.01'));

  if (spot.greaterThanOrEqualTo(lowerAtm) && spot.lessThanOrEqualTo(upperAtm)) {
    return 'ATM';
  }

  if (optionType === 'CALL') {
    return spot.greaterThan(upperAtm) ? 'ITM' : 'OTM';
  } else {
    return spot.lessThan(lowerAtm) ? 'ITM' : 'OTM';
  }
}

/**
 * Motor puro e determinístico de cálculo de Gregas e Preço Teórico Black-Scholes.
 */
export function calculateBlackScholesGreeks(input: BlackScholesInput): GreeksResult {
  validateBlackScholesInput(input);

  const s = toDecimal(input.spotPrice);
  const k = toDecimal(input.strikePrice);
  const t = toDecimal(input.timeToExpirationYears);
  const r = toDecimal(input.riskFreeRate);
  const sigma = toDecimal(input.volatility);
  const type = input.optionType;
  const premium = input.premium ? toDecimal(input.premium) : ZERO;

  const moneyness = calculateMoneyness(s, k, type);

  // Caso degenerado: Vencimento imediato (T = 0 ou infinitesimal < 1e-6 anos)
  if (t.lessThan(new Decimal('0.000001'))) {
    let intrinsicValue = ZERO;
    let theoreticalPrice = ZERO;
    let delta = ZERO;

    if (type === 'CALL') {
      intrinsicValue = Decimal.max(ZERO, s.sub(k));
      theoreticalPrice = intrinsicValue;
      delta = s.greaterThan(k) ? ONE : (s.equals(k) ? new Decimal('0.5') : ZERO);
    } else {
      intrinsicValue = Decimal.max(ZERO, k.sub(s));
      theoreticalPrice = intrinsicValue;
      delta = s.lessThan(k) ? ONE.neg() : (s.equals(k) ? new Decimal('-0.5') : ZERO);
    }

    const breakevenPrice = type === 'CALL' ? k.add(premium) : Decimal.max(ZERO, k.sub(premium));

    return {
      theoreticalPrice,
      delta,
      gamma: ZERO,
      theta: ZERO,
      vega: ZERO,
      rho: ZERO,
      moneyness,
      intrinsicValue,
      extrinsicValue: ZERO,
      breakevenPrice,
    };
  }

  // d1 = [ln(S / K) + (r + sigma^2 / 2) * T] / (sigma * sqrt(T))
  const sqrtT = t.sqrt();
  const sigmaSqrtT = sigma.mul(sqrtT);
  const lnSOverK = s.div(k).ln();
  const halfSigmaSq = sigma.mul(sigma).div(TWO);
  const drift = r.add(halfSigmaSq).mul(t);
  const numeratorD1 = lnSOverK.add(drift);
  const d1 = numeratorD1.div(sigmaSqrtT);
  const d2 = d1.sub(sigmaSqrtT);

  const nd1 = normalCdf(d1);
  const nd2 = normalCdf(d2);
  const nPrimeD1 = normalPdf(d1);
  const discountFactor = r.mul(t).neg().exp(); // e^(-rT)

  let theoreticalPrice: Decimal;
  let delta: Decimal;
  let intrinsicValue: Decimal;
  let thetaAnnual: Decimal;
  let rhoAnnual: Decimal;

  // Gamma é idêntico para Call e Put: N'(d1) / (S * sigma * sqrt(T))
  const gamma = nPrimeD1.div(s.mul(sigmaSqrtT));

  // Vega é idêntico para Call e Put: S * sqrt(T) * N'(d1)
  // Expressamos o resultado em variação por 1% (0.01) de volatilidade
  const vegaUnitary = s.mul(sqrtT).mul(nPrimeD1);
  const vega = vegaUnitary.mul(ONE_PERCENT);

  if (type === 'CALL') {
    // Preço Call: S * N(d1) - K * e^(-rT) * N(d2)
    theoreticalPrice = s.mul(nd1).sub(k.mul(discountFactor).mul(nd2));
    if (theoreticalPrice.isNegative()) {
      theoreticalPrice = ZERO;
    }

    delta = nd1;
    intrinsicValue = Decimal.max(ZERO, s.sub(k));

    // Theta Call: - [S * N'(d1) * sigma] / (2 * sqrt(T)) - r * K * e^(-rT) * N(d2)
    const term1 = s.mul(nPrimeD1).mul(sigma).div(TWO.mul(sqrtT)).neg();
    const term2 = r.mul(k).mul(discountFactor).mul(nd2);
    thetaAnnual = term1.sub(term2);

    // Rho Call: K * T * e^(-rT) * N(d2)
    rhoAnnual = k.mul(t).mul(discountFactor).mul(nd2);
  } else {
    // Put: N(-d1) = 1 - N(d1), N(-d2) = 1 - N(d2)
    const nMinusD1 = ONE.sub(nd1);
    const nMinusD2 = ONE.sub(nd2);

    // Preço Put: K * e^(-rT) * N(-d2) - S * N(-d1)
    theoreticalPrice = k.mul(discountFactor).mul(nMinusD2).sub(s.mul(nMinusD1));
    if (theoreticalPrice.isNegative()) {
      theoreticalPrice = ZERO;
    }

    delta = nMinusD1.neg(); // Delta Put negativo: [-1, 0]
    intrinsicValue = Decimal.max(ZERO, k.sub(s));

    // Theta Put: - [S * N'(d1) * sigma] / (2 * sqrt(T)) + r * K * e^(-rT) * N(-d2)
    const term1 = s.mul(nPrimeD1).mul(sigma).div(TWO.mul(sqrtT)).neg();
    const term2 = r.mul(k).mul(discountFactor).mul(nMinusD2);
    thetaAnnual = term1.add(term2);

    // Rho Put: - K * T * e^(-rT) * N(-d2)
    rhoAnnual = k.mul(t).mul(discountFactor).mul(nMinusD2).neg();
  }

  // Theta diário (base 252 dias úteis B3)
  const theta = thetaAnnual.div(DAYS_PER_YEAR_BUSINESS);

  // Rho para variação de 1% (0.01) na taxa de juros
  const rho = rhoAnnual.mul(ONE_PERCENT);

  // Valor extrínseco (valor tempo) = max(0, preço teórico - intrínseco)
  const extrinsicValue = Decimal.max(ZERO, theoreticalPrice.sub(intrinsicValue));

  // Preço de equilíbrio (breakeven) no vencimento
  const effectivePremium = premium.greaterThan(ZERO) ? premium : theoreticalPrice;
  const breakevenPrice = type === 'CALL'
    ? k.add(effectivePremium)
    : Decimal.max(ZERO, k.sub(effectivePremium));

  return {
    theoreticalPrice,
    delta,
    gamma,
    theta,
    vega,
    rho,
    moneyness,
    intrinsicValue,
    extrinsicValue,
    breakevenPrice,
  };
}

/**
 * Calcula a curva de Payoff de uma posição em opção no vencimento em múltiplos cenários de preço.
 */
export function calculatePayoffAnalysis(params: {
  strikePrice: Decimal | string;
  premium: Decimal | string;
  quantity: Decimal | string;
  optionType: OptionType;
  direction: OptionDirection;
  currentSpotPrice?: Decimal | string;
  stepsCount?: number;
}): PayoffAnalysis {
  const strike = toDecimal(params.strikePrice);
  const premium = toDecimal(params.premium);
  const quantity = toDecimal(params.quantity);
  const type = params.optionType;
  const direction = params.direction;
  const steps = params.stepsCount ?? 21;

  if (strike.lessThanOrEqualTo(ZERO)) {
    throw new Error('Strike deve ser maior que zero para cálculo de payoff.');
  }
  if (premium.isNegative()) {
    throw new Error('Prêmio não pode ser negativo.');
  }
  if (quantity.lessThanOrEqualTo(ZERO)) {
    throw new Error('Quantidade deve ser maior que zero.');
  }

  const breakevenPrice = type === 'CALL'
    ? strike.add(premium)
    : Decimal.max(ZERO, strike.sub(premium));

  // Faixa de preços para a curva: de 50% do strike a 150% do strike
  const minSpot = strike.mul(new Decimal('0.50'));
  const maxSpot = strike.mul(new Decimal('1.50'));
  const stepSize = maxSpot.sub(minSpot).div(new Decimal(steps - 1));

  const points: PayoffPoint[] = [];

  for (let i = 0; i < steps; i++) {
    const spot = minSpot.add(stepSize.mul(new Decimal(i)));

    let grossPayoffUnitary = ZERO;
    if (type === 'CALL') {
      grossPayoffUnitary = Decimal.max(ZERO, spot.sub(strike));
    } else {
      grossPayoffUnitary = Decimal.max(ZERO, strike.sub(spot));
    }

    let netProfitLossUnitary = ZERO;
    if (direction === 'BUY') {
      // Titular: pagou o prêmio, recebe o payoff bruto no exercício
      netProfitLossUnitary = grossPayoffUnitary.sub(premium);
    } else {
      // Lançador: recebeu o prêmio, obrigado a pagar o payoff bruto se exercido
      netProfitLossUnitary = premium.sub(grossPayoffUnitary);
    }

    const netProfitLossTotal = netProfitLossUnitary.mul(quantity);

    points.push({
      spotPrice: spot,
      spotPriceFormatted: spot.toFixed(2),
      grossPayoff: grossPayoffUnitary,
      netProfitLossUnitary,
      netProfitLoss: netProfitLossTotal,
    });
  }

  // Lucro máximo e prejuízo máximo
  let maximumProfit: Decimal | 'UNLIMITED' = ZERO;
  let maximumLoss: Decimal | 'UNLIMITED' = ZERO;

  if (type === 'CALL') {
    if (direction === 'BUY') {
      maximumProfit = 'UNLIMITED'; // Call comprada tem ganho ilimitado
      maximumLoss = premium.mul(quantity); // Prejuízo máximo é o prêmio pago
    } else {
      maximumProfit = premium.mul(quantity); // Call vendida tem ganho limitado ao prêmio
      maximumLoss = 'UNLIMITED'; // Call vendida a descoberto tem prejuízo ilimitado
    }
  } else {
    // PUT
    if (direction === 'BUY') {
      maximumProfit = strike.sub(premium).mul(quantity); // Se ação for a zero
      maximumLoss = premium.mul(quantity); // Prejuízo máximo é o prêmio pago
    } else {
      maximumProfit = premium.mul(quantity); // Ganho máximo é o prêmio recebido
      maximumLoss = strike.sub(premium).mul(quantity); // Se ação for a zero
    }
  }

  return {
    strikePrice: strike,
    breakevenPrice,
    maximumProfit,
    maximumLoss,
    points,
  };
}
