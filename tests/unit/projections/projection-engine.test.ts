import { describe, it, expect } from 'vitest';
import { Decimal } from '@/lib/decimal';
import {
  calculateEquivalentMonthlyRate,
  calculateDoublingTimeWithoutContributions,
  calculateCompoundInterestProjection,
  serializeProjectionResultSet,
  PROJECTION_REGULATORY_DISCLAIMER,
} from '@/modules/projections/domain/projection-engine';
import type { ProjectionPremises } from '@/modules/projections/domain/projection.types';

describe('Projection Engine — Simulador de Juros Compostos (Etapa 7)', () => {
  describe('calculateEquivalentMonthlyRate', () => {
    it('calcula a taxa mensal equivalente composta para 10% a.a.', () => {
      // (1 + 0.10)^(1/12) - 1 = 0.0079741404...
      const annualRate = new Decimal('0.10');
      const monthlyRate = calculateEquivalentMonthlyRate(annualRate);
      expect(monthlyRate.toFixed(8)).toBe('0.00797414');
    });

    it('retorna 0 quando a taxa anual for 0%', () => {
      const annualRate = new Decimal('0.00');
      const monthlyRate = calculateEquivalentMonthlyRate(annualRate);
      expect(monthlyRate.toFixed(4)).toBe('0.0000');
    });

    it('lança erro se 1 + taxa_anual for menor ou igual a zero', () => {
      const invalidRate = new Decimal('-1.00'); // -100%
      expect(() => calculateEquivalentMonthlyRate(invalidRate)).toThrow();
    });
  });

  describe('calculateDoublingTimeWithoutContributions', () => {
    it('calcula o tempo de duplicação exato para taxa de 10% a.a.', () => {
      // ln(2) / ln(1.10) = 0.69314718 / 0.09531018 = ~7.2725 anos
      const annualRate = new Decimal('0.10');
      const years = calculateDoublingTimeWithoutContributions(annualRate);
      expect(years).not.toBeNull();
      expect(years?.toFixed(2)).toBe('7.27');
    });

    it('retorna null para taxa zero ou negativa', () => {
      expect(calculateDoublingTimeWithoutContributions(new Decimal('0'))).toBeNull();
      expect(calculateDoublingTimeWithoutContributions(new Decimal('-0.05'))).toBeNull();
    });
  });

  describe('calculateCompoundInterestProjection', () => {
    const basePremises: ProjectionPremises = {
      initialCapital: new Decimal('10000.00'), // R$ 10.000,00
      monthlyContribution: new Decimal('1000.00'), // R$ 1.000,00/mês
      annualInterestRate: new Decimal('0.10'), // 10% a.a.
      annualInflationRate: new Decimal('0.04'), // 4% a.a.
      targetDividendYield: new Decimal('0.06'), // 6% a.a.
      totalMonths: 12, // 1 ano (12 meses)
      contributionTiming: 'END_OF_PERIOD',
    };

    it('executa a projeção nominal de 12 meses com aportes no fim do período', () => {
      const result = calculateCompoundInterestProjection(basePremises);

      expect(result.timeline).toHaveLength(12);
      expect(result.disclaimer).toBe(PROJECTION_REGULATORY_DISCLAIMER);

      // Total aportado após 12 meses: 10.000 + 12 * 1.000 = 22.000,00
      expect(result.summary.totalContributed.toFixed(2)).toBe('22000.00');

      // Mês 1:
      // i_mes = 0.0079741404
      // Juros mes 1 = 10.000 * i_mes = 79.74
      // Saldo final mes 1 = 10.000 + 79.74 + 1.000 = 11.079,74
      const m1 = result.timeline[0];
      expect(m1.month).toBe(1);
      expect(m1.monthlyInterestEarned.toFixed(2)).toBe('79.74');
      expect(m1.nominalBalance.toFixed(2)).toBe('11079.74');
      expect(m1.accumulatedContributions.toFixed(2)).toBe('11000.00');
      expect(m1.accumulatedInterest.toFixed(2)).toBe('79.74');

      // Saldo final é maior que o total aportado devido aos juros
      expect(result.summary.finalNominalBalance.greaterThan(result.summary.totalContributed)).toBe(true);
      // Saldo real é menor que o saldo nominal devido à inflação de 4%
      expect(result.summary.finalRealBalance.lessThan(result.summary.finalNominalBalance)).toBe(true);
      // Proventos anuais projetados sobre o saldo final
      expect(result.summary.projectedAnnualDividends.toFixed(2)).toBe(
        result.summary.finalNominalBalance.times(new Decimal('0.06')).toFixed(2)
      );
    });

    it('calcula corretamente a capitalização exata de montante único com aporte zero (PMT = 0)', () => {
      // 50.000 a 10% a.a. por 2 anos (24 meses)
      // Saldo final exato deve ser 50.000 * (1.10)^2 = 60.500,00
      const lumpSumPremises: ProjectionPremises = {
        ...basePremises,
        initialCapital: new Decimal('50000.00'),
        monthlyContribution: new Decimal('0.00'),
        annualInterestRate: new Decimal('0.10'),
        totalMonths: 24,
      };

      const result = calculateCompoundInterestProjection(lumpSumPremises);

      expect(result.summary.totalContributed.toFixed(2)).toBe('50000.00');
      expect(result.summary.finalNominalBalance.toFixed(2)).toBe('60500.00');
      expect(result.summary.totalInterestEarned.toFixed(2)).toBe('10500.00');
    });

    it('calcula corretamente partindo de capital inicial zero (C0 = 0)', () => {
      const zeroStartPremises: ProjectionPremises = {
        ...basePremises,
        initialCapital: new Decimal('0.00'),
        monthlyContribution: new Decimal('500.00'),
        totalMonths: 6,
      };

      const result = calculateCompoundInterestProjection(zeroStartPremises);

      expect(result.summary.totalContributed.toFixed(2)).toBe('3000.00');
      expect(result.summary.finalNominalBalance.greaterThan(new Decimal('3000.00'))).toBe(true);
      // Mês 1: saldo inicial zero -> juros mês 1 = 0 -> saldo = 500
      expect(result.timeline[0].monthlyInterestEarned.toFixed(2)).toBe('0.00');
      expect(result.timeline[0].nominalBalance.toFixed(2)).toBe('500.00');
    });

    it('calcula com aportes no início do período (BEGINNING_OF_PERIOD)', () => {
      const begPremises: ProjectionPremises = {
        ...basePremises,
        contributionTiming: 'BEGINNING_OF_PERIOD',
      };

      const result = calculateCompoundInterestProjection(begPremises);

      // Mês 1: (10.000 + 1.000) * i_mes = 11.000 * 0.00797414 = 87.72
      // Saldo = 11.000 + 87.72 = 11.087,72
      expect(result.timeline[0].monthlyInterestEarned.toFixed(2)).toBe('87.72');
      expect(result.timeline[0].nominalBalance.toFixed(2)).toBe('11087.72');
    });

    it('identifica o mês de duplicação do capital inicial e o ponto de crossover', () => {
      const longTermPremises: ProjectionPremises = {
        initialCapital: new Decimal('10000.00'),
        monthlyContribution: new Decimal('500.00'),
        annualInterestRate: new Decimal('0.12'), // 12% a.a.
        annualInflationRate: new Decimal('0.04'),
        targetDividendYield: new Decimal('0.06'),
        totalMonths: 120, // 10 anos
        contributionTiming: 'END_OF_PERIOD',
      };

      const result = calculateCompoundInterestProjection(longTermPremises);

      // Dobrar capital inicial (chegar a 20.000) com 10.000 inicial e 500/mês
      expect(result.summary.timeToDoubleInitialMonths).not.toBeNull();
      expect(result.summary.timeToDoubleInitialMonths).toBeGreaterThan(0);
      expect(result.summary.timeToDoubleInitialMonths).toBeLessThan(30);

      // Ponto de crossover: juros mensais >= 500 (aporte mensal)
      expect(result.summary.crossoverMonth).not.toBeNull();
      expect(result.summary.crossoverMonth).toBeGreaterThan(0);
    });

    it('lança erro se capital inicial for negativo', () => {
      expect(() =>
        calculateCompoundInterestProjection({
          ...basePremises,
          initialCapital: new Decimal('-100.00'),
        })
      ).toThrow('O capital inicial não pode ser negativo.');
    });

    it('lança erro se aporte mensal for negativo', () => {
      expect(() =>
        calculateCompoundInterestProjection({
          ...basePremises,
          monthlyContribution: new Decimal('-50.00'),
        })
      ).toThrow('O aporte mensal não pode ser negativo.');
    });

    it('lança erro se totalMonths for menor que 1', () => {
      expect(() =>
        calculateCompoundInterestProjection({
          ...basePremises,
          totalMonths: 0,
        })
      ).toThrow('O prazo em meses deve ser de pelo menos 1 mês.');
    });

    it('serializa perfeitamente o resultado para SSR e client component', () => {
      const result = calculateCompoundInterestProjection(basePremises);
      const serialized = serializeProjectionResultSet(result);

      expect(typeof serialized.calculatedAt).toBe('string');
      expect(serialized.premises.initialCapital).toBe('10000.00');
      expect(serialized.premises.monthlyContribution).toBe('1000.00');
      expect(serialized.summary.totalContributed).toBe('22000.00');
      expect(serialized.timeline).toHaveLength(12);
      expect(serialized.disclaimer).toBe(PROJECTION_REGULATORY_DISCLAIMER);
    });
  });
});
