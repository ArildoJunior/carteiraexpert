import { describe, it, expect } from 'vitest';
import { Decimal } from '@/lib/decimal';
import {
  calculateBlackScholesGreeks,
  calculatePayoffAnalysis,
  calculateMoneyness,
  normalCdf,
  normalPdf,
} from '@/modules/options/domain/black-scholes-engine';

describe('Black-Scholes Mathematical Engine', () => {
  describe('Funções de Distribuição Normal (CDF e PDF)', () => {
    it('normalPdf deve calcular a densidade corretamente para x = 0', () => {
      // 1 / sqrt(2*pi) ≈ 0.39894228
      const pdf0 = normalPdf(new Decimal('0'));
      expect(pdf0.toFixed(6)).toBe('0.398942');
    });

    it('normalCdf deve retornar 0.5 para x = 0', () => {
      const cdf0 = normalCdf(new Decimal('0'));
      expect(cdf0.equals(new Decimal('0.5'))).toBe(true);
    });

    it('normalCdf deve ter simetria N(-x) = 1 - N(x)', () => {
      const x = new Decimal('1.96'); // 95% interval
      const cdfPos = normalCdf(x);
      const cdfNeg = normalCdf(x.neg());
      expect(cdfPos.add(cdfNeg).toFixed(7)).toBe('1.0000000');
      // N(1.96) ≈ 0.975002
      expect(cdfPos.toFixed(4)).toBe('0.9750');
    });
  });

  describe('Cálculo Canônico de Preço e Gregas Black-Scholes', () => {
    // Benchmark clássico: S=100, K=100, T=1 ano, r=5% (0.05), sigma=20% (0.20)
    // Valores de referência conhecidos:
    // Call ≈ 10.4506, Put ≈ 5.5735
    // Delta Call ≈ 0.6368, Delta Put ≈ -0.3632
    // Gamma ≈ 0.0188
    // Vega ≈ 0.3752 (por 1% de vol)
    // Theta Call ≈ -0.0254 / dia (em 252 dias úteis)
    const benchmarkInput = {
      spotPrice: new Decimal('100.00'),
      strikePrice: new Decimal('100.00'),
      timeToExpirationYears: new Decimal('1.00'),
      riskFreeRate: new Decimal('0.05'),
      volatility: new Decimal('0.20'),
      premium: new Decimal('10.45'),
    };

    it('deve calcular preço e gregas de CALL próximo aos benchmarks clássicos', () => {
      const result = calculateBlackScholesGreeks({
        ...benchmarkInput,
        optionType: 'CALL',
      });

      expect(result.theoreticalPrice.toFixed(2)).toBe('10.45');
      expect(result.delta.toFixed(3)).toBe('0.637');
      expect(result.gamma.toFixed(4)).toBe('0.0188');
      expect(result.vega.toFixed(3)).toBe('0.375');
      expect(result.moneyness).toBe('ATM');
      expect(result.intrinsicValue.toFixed(2)).toBe('0.00');
      expect(result.extrinsicValue.toFixed(2)).toBe('10.45');
      expect(result.breakevenPrice.toFixed(2)).toBe('110.45'); // Strike 100 + Premium 10.45
      expect(result.theta.isNegative()).toBe(true); // Decaimento temporal negativo
    });

    it('deve calcular preço e gregas de PUT próximo aos benchmarks clássicos', () => {
      const result = calculateBlackScholesGreeks({
        ...benchmarkInput,
        optionType: 'PUT',
        premium: new Decimal('5.57'),
      });

      expect(result.theoreticalPrice.toFixed(2)).toBe('5.57');
      expect(result.delta.toFixed(3)).toBe('-0.363');
      expect(result.gamma.toFixed(4)).toBe('0.0188'); // Gamma idêntico para Call e Put
      expect(result.vega.toFixed(3)).toBe('0.375'); // Vega idêntico para Call e Put
      expect(result.moneyness).toBe('ATM');
      expect(result.intrinsicValue.toFixed(2)).toBe('0.00');
      expect(result.extrinsicValue.toFixed(2)).toBe('5.57');
      expect(result.breakevenPrice.toFixed(2)).toBe('94.43'); // Strike 100 - Premium 5.57
    });

    it('deve satisfazer a paridade Call-Put (C - P = S - K * e^(-rT))', () => {
      const call = calculateBlackScholesGreeks({
        ...benchmarkInput,
        optionType: 'CALL',
      });
      const put = calculateBlackScholesGreeks({
        ...benchmarkInput,
        optionType: 'PUT',
      });

      const s = benchmarkInput.spotPrice;
      const k = benchmarkInput.strikePrice;
      const r = benchmarkInput.riskFreeRate;
      const t = benchmarkInput.timeToExpirationYears;

      const discount = r.mul(t).neg().exp();
      const rhs = s.sub(k.mul(discount));
      const lhs = call.theoreticalPrice.sub(put.theoreticalPrice);

      // Diferença menor que 0.0001
      expect(lhs.sub(rhs).abs().lessThan(new Decimal('0.0001'))).toBe(true);
    });

    it('deve lidar corretamente com opções Deep In-The-Money (ITM)', () => {
      const deepItmCall = calculateBlackScholesGreeks({
        spotPrice: new Decimal('150.00'),
        strikePrice: new Decimal('100.00'),
        timeToExpirationYears: new Decimal('0.5'),
        riskFreeRate: new Decimal('0.10'),
        volatility: new Decimal('0.20'),
        optionType: 'CALL',
      });

      expect(deepItmCall.moneyness).toBe('ITM');
      expect(deepItmCall.delta.greaterThan(new Decimal('0.95'))).toBe(true);
      expect(deepItmCall.intrinsicValue.toFixed(2)).toBe('50.00');
      expect(deepItmCall.theoreticalPrice.greaterThan(new Decimal('50.00'))).toBe(true);
    });

    it('deve lidar corretamente com opções Deep Out-Of-The-Money (OTM)', () => {
      const deepOtmCall = calculateBlackScholesGreeks({
        spotPrice: new Decimal('50.00'),
        strikePrice: new Decimal('100.00'),
        timeToExpirationYears: new Decimal('0.2'),
        riskFreeRate: new Decimal('0.10'),
        volatility: new Decimal('0.20'),
        optionType: 'CALL',
      });

      expect(deepOtmCall.moneyness).toBe('OTM');
      expect(deepOtmCall.delta.lessThan(new Decimal('0.01'))).toBe(true);
      expect(deepOtmCall.intrinsicValue.toFixed(2)).toBe('0.00');
      expect(deepOtmCall.theoreticalPrice.lessThan(new Decimal('0.01'))).toBe(true);
    });

    it('deve tratar vencimento imediato T=0 (degenerado)', () => {
      const expiredCall = calculateBlackScholesGreeks({
        spotPrice: new Decimal('105.00'),
        strikePrice: new Decimal('100.00'),
        timeToExpirationYears: new Decimal('0'),
        riskFreeRate: new Decimal('0.10'),
        volatility: new Decimal('0.20'),
        optionType: 'CALL',
      });

      expect(expiredCall.theoreticalPrice.toFixed(2)).toBe('5.00');
      expect(expiredCall.intrinsicValue.toFixed(2)).toBe('5.00');
      expect(expiredCall.extrinsicValue.toFixed(2)).toBe('0.00');
      expect(expiredCall.gamma.toFixed(2)).toBe('0.00');
      expect(expiredCall.theta.toFixed(2)).toBe('0.00');
      expect(expiredCall.vega.toFixed(2)).toBe('0.00');
    });
  });

  describe('Validações de Entrada e Robustez Numérica', () => {
    it('deve rejeitar preço do ativo-objeto menor ou igual a zero', () => {
      expect(() =>
        calculateBlackScholesGreeks({
          spotPrice: new Decimal('0'),
          strikePrice: new Decimal('100'),
          timeToExpirationYears: new Decimal('0.5'),
          riskFreeRate: new Decimal('0.10'),
          volatility: new Decimal('0.20'),
          optionType: 'CALL',
        })
      ).toThrow('Preço do ativo-objeto deve ser estritamente maior que zero.');
    });

    it('deve rejeitar strike menor ou igual a zero', () => {
      expect(() =>
        calculateBlackScholesGreeks({
          spotPrice: new Decimal('100'),
          strikePrice: new Decimal('-10'),
          timeToExpirationYears: new Decimal('0.5'),
          riskFreeRate: new Decimal('0.10'),
          volatility: new Decimal('0.20'),
          optionType: 'CALL',
        })
      ).toThrow('Preço de exercício (strike) deve ser estritamente maior que zero.');
    });

    it('deve rejeitar volatilidade menor ou igual a zero', () => {
      expect(() =>
        calculateBlackScholesGreeks({
          spotPrice: new Decimal('100'),
          strikePrice: new Decimal('100'),
          timeToExpirationYears: new Decimal('0.5'),
          riskFreeRate: new Decimal('0.10'),
          volatility: new Decimal('0'),
          optionType: 'CALL',
        })
      ).toThrow('Volatilidade implícita deve ser estritamente maior que zero.');
    });

    it('deve rejeitar volatilidade acima de 500% a.a.', () => {
      expect(() =>
        calculateBlackScholesGreeks({
          spotPrice: new Decimal('100'),
          strikePrice: new Decimal('100'),
          timeToExpirationYears: new Decimal('0.5'),
          riskFreeRate: new Decimal('0.10'),
          volatility: new Decimal('5.01'),
          optionType: 'CALL',
        })
      ).toThrow('Volatilidade implícita acima de 500% a.a. não é suportada.');
    });
  });

  describe('Classificação de Moneyness', () => {
    it('deve classificar ATM dentro de 1% do strike', () => {
      expect(calculateMoneyness(new Decimal('100.50'), new Decimal('100.00'), 'CALL')).toBe('ATM');
      expect(calculateMoneyness(new Decimal('99.50'), new Decimal('100.00'), 'CALL')).toBe('ATM');
      expect(calculateMoneyness(new Decimal('100.00'), new Decimal('100.00'), 'PUT')).toBe('ATM');
    });

    it('deve classificar CALL como ITM quando S > 1.01 * K e OTM quando S < 0.99 * K', () => {
      expect(calculateMoneyness(new Decimal('102.00'), new Decimal('100.00'), 'CALL')).toBe('ITM');
      expect(calculateMoneyness(new Decimal('98.00'), new Decimal('100.00'), 'CALL')).toBe('OTM');
    });

    it('deve classificar PUT como ITM quando S < 0.99 * K e OTM quando S > 1.01 * K', () => {
      expect(calculateMoneyness(new Decimal('98.00'), new Decimal('100.00'), 'PUT')).toBe('ITM');
      expect(calculateMoneyness(new Decimal('102.00'), new Decimal('100.00'), 'PUT')).toBe('OTM');
    });
  });

  describe('Análise e Curvas de Payoff no Vencimento', () => {
    it('deve calcular payoff de CALL Comprada (Titular)', () => {
      const payoff = calculatePayoffAnalysis({
        strikePrice: new Decimal('40.00'),
        premium: new Decimal('2.00'),
        quantity: new Decimal('100.00'),
        optionType: 'CALL',
        direction: 'BUY',
        stepsCount: 11,
      });

      expect(payoff.breakevenPrice.toFixed(2)).toBe('42.00'); // Strike 40 + Premium 2
      expect(payoff.maximumProfit).toBe('UNLIMITED');
      expect((payoff.maximumLoss as Decimal).toFixed(2)).toBe('200.00'); // 2.00 * 100

      // Ponto no strike (40.00): prejuízo do prêmio integral (-R$ 200,00)
      const atStrike = payoff.points.find((p) => p.spotPrice.equals(new Decimal('40.00')));
      if (atStrike) {
        expect(atStrike.grossPayoff.toFixed(2)).toBe('0.00');
        expect(atStrike.netProfitLoss.toFixed(2)).toBe('-200.00');
      }

      // Ponto acima do breakeven (45.00): lucro de (45 - 40 - 2) * 100 = R$ 300,00
      const aboveBreakeven = payoff.points.find((p) => p.spotPrice.equals(new Decimal('45.00')));
      if (aboveBreakeven) {
        expect(aboveBreakeven.grossPayoff.toFixed(2)).toBe('5.00');
        expect(aboveBreakeven.netProfitLoss.toFixed(2)).toBe('300.00');
      }
    });

    it('deve calcular payoff de CALL Vendida (Lançador)', () => {
      const payoff = calculatePayoffAnalysis({
        strikePrice: new Decimal('40.00'),
        premium: new Decimal('2.00'),
        quantity: new Decimal('100.00'),
        optionType: 'CALL',
        direction: 'SELL',
        stepsCount: 11,
      });

      expect(payoff.breakevenPrice.toFixed(2)).toBe('42.00');
      expect((payoff.maximumProfit as Decimal).toFixed(2)).toBe('200.00'); // Ganho limitado ao prêmio
      expect(payoff.maximumLoss).toBe('UNLIMITED');
    });

    it('deve calcular payoff de PUT Comprada (Titular)', () => {
      const payoff = calculatePayoffAnalysis({
        strikePrice: new Decimal('30.00'),
        premium: new Decimal('1.50'),
        quantity: new Decimal('100.00'),
        optionType: 'PUT',
        direction: 'BUY',
        stepsCount: 11,
      });

      expect(payoff.breakevenPrice.toFixed(2)).toBe('28.50'); // Strike 30 - Premium 1.50
      expect((payoff.maximumLoss as Decimal).toFixed(2)).toBe('150.00'); // Prêmio pago
      expect((payoff.maximumProfit as Decimal).toFixed(2)).toBe('2850.00'); // (30 - 1.50) * 100
    });

    it('deve calcular payoff de PUT Vendida (Lançador)', () => {
      const payoff = calculatePayoffAnalysis({
        strikePrice: new Decimal('30.00'),
        premium: new Decimal('1.50'),
        quantity: new Decimal('100.00'),
        optionType: 'PUT',
        direction: 'SELL',
        stepsCount: 11,
      });

      expect(payoff.breakevenPrice.toFixed(2)).toBe('28.50');
      expect((payoff.maximumProfit as Decimal).toFixed(2)).toBe('150.00'); // Prêmio recebido
      expect((payoff.maximumLoss as Decimal).toFixed(2)).toBe('2850.00'); // Prejuízo máximo se ação for a zero
    });
  });
});
