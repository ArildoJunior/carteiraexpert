import { describe, it, expect } from 'vitest';
import { projectionPremisesInputSchema } from '@/modules/projections/domain/projection.schema';

describe('projectionPremisesInputSchema', () => {
  it('aplica valores default válidos quando objeto vazio é fornecido', () => {
    const result = projectionPremisesInputSchema.safeParse({});
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.initialCapital).toBe('10000.00');
      expect(result.data.monthlyContribution).toBe('1000.00');
      expect(result.data.annualInterestRate).toBe('0.10');
      expect(result.data.annualInflationRate).toBe('0.04');
      expect(result.data.targetDividendYield).toBe('0.06');
      expect(result.data.totalMonths).toBe(120);
      expect(result.data.contributionTiming).toBe('END_OF_PERIOD');
    }
  });

  it('aceita valores customizados válidos em formato string e number transformado', () => {
    const result = projectionPremisesInputSchema.safeParse({
      initialCapital: '50000.00',
      monthlyContribution: 2500, // number transformado para string
      annualInterestRate: '0.125',
      annualInflationRate: '0.045',
      targetDividendYield: '0.08',
      totalMonths: 240,
      contributionTiming: 'BEGINNING_OF_PERIOD',
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.initialCapital).toBe('50000.00');
      expect(result.data.monthlyContribution).toBe('2500');
      expect(result.data.annualInterestRate).toBe('0.125');
      expect(result.data.totalMonths).toBe(240);
      expect(result.data.contributionTiming).toBe('BEGINNING_OF_PERIOD');
    }
  });

  it('aceita aporte zero se houver capital inicial positivo', () => {
    const result = projectionPremisesInputSchema.safeParse({
      initialCapital: '100000.00',
      monthlyContribution: '0',
    });
    expect(result.success).toBe(true);
  });

  it('aceita capital inicial zero se houver aporte positivo', () => {
    const result = projectionPremisesInputSchema.safeParse({
      initialCapital: '0',
      monthlyContribution: '500.00',
    });
    expect(result.success).toBe(true);
  });

  it('rejeita quando capital inicial e aporte mensal são ambos zero', () => {
    const result = projectionPremisesInputSchema.safeParse({
      initialCapital: '0',
      monthlyContribution: '0',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const issue = result.error.issues.find((i) => i.path.includes('monthlyContribution'));
      expect(issue).toBeDefined();
      expect(issue?.message).toContain('maior que zero');
    }
  });

  it('rejeita capital inicial negativo', () => {
    const result = projectionPremisesInputSchema.safeParse({
      initialCapital: '-100.00',
    });
    expect(result.success).toBe(false);
  });

  it('rejeita aporte mensal negativo', () => {
    const result = projectionPremisesInputSchema.safeParse({
      monthlyContribution: '-50.00',
    });
    expect(result.success).toBe(false);
  });

  it('rejeita taxa de juros anual fora dos limites aceitáveis (-50% a +200%)', () => {
    const low = projectionPremisesInputSchema.safeParse({
      annualInterestRate: '-0.60',
    });
    expect(low.success).toBe(false);

    const high = projectionPremisesInputSchema.safeParse({
      annualInterestRate: '2.50',
    });
    expect(high.success).toBe(false);
  });

  it('rejeita taxa de inflação negativa ou superior a 100%', () => {
    const negative = projectionPremisesInputSchema.safeParse({
      annualInflationRate: '-0.01',
    });
    expect(negative.success).toBe(false);

    const excessive = projectionPremisesInputSchema.safeParse({
      annualInflationRate: '1.20',
    });
    expect(excessive.success).toBe(false);
  });

  it('rejeita dividend yield negativo ou superior a 50%', () => {
    const negative = projectionPremisesInputSchema.safeParse({
      targetDividendYield: '-0.01',
    });
    expect(negative.success).toBe(false);

    const excessive = projectionPremisesInputSchema.safeParse({
      targetDividendYield: '0.60',
    });
    expect(excessive.success).toBe(false);
  });

  it('rejeita prazo em meses inválido, não inteiro ou fora dos limites', () => {
    const zeroMonths = projectionPremisesInputSchema.safeParse({ totalMonths: 0 });
    expect(zeroMonths.success).toBe(false);

    const negativeMonths = projectionPremisesInputSchema.safeParse({ totalMonths: -12 });
    expect(negativeMonths.success).toBe(false);

    const fractionalMonths = projectionPremisesInputSchema.safeParse({ totalMonths: 12.5 });
    expect(fractionalMonths.success).toBe(false);

    const excessiveMonths = projectionPremisesInputSchema.safeParse({ totalMonths: 601 });
    expect(excessiveMonths.success).toBe(false);
  });

  it('rejeita strings que não representam valores numéricos válidos', () => {
    const invalidNumber = projectionPremisesInputSchema.safeParse({
      initialCapital: 'invalid_number',
    });
    expect(invalidNumber.success).toBe(false);
  });

  it('rejeita timing de contribuição inválido', () => {
    const invalidTiming = projectionPremisesInputSchema.safeParse({
      contributionTiming: 'MIDDLE_OF_MONTH',
    });
    expect(invalidTiming.success).toBe(false);
  });
});
