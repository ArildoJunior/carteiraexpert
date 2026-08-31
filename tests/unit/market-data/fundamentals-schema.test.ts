import { describe, it, expect } from 'vitest';
import { assetFundamentalInputSchema } from '@/modules/market-data/domain/fundamentals.schema';

describe('fundamentals.schema', () => {
  const validPayload = {
    assetId: '123e4567-e89b-12d3-a456-426614174000',
    referencePeriod: '2025-4Q',
    periodType: 'quarterly',
    statementType: 'CONSOLIDATED',
    referenceDate: '2025-12-31T00:00:00.000Z',
    filingDate: '2026-02-15T18:00:00.000Z',
    source: 'cvm',
    sourceReference: 'DFP-2025-PETR4-V1',
    version: 1,
    isRestated: false,
    currency: 'BRL',
    netRevenue: '1000000000.00',
    ebitda: '300000000.00',
    netIncome: '150000000.00',
    totalEquity: '800000000.00',
    totalAssets: '2000000000.00',
    grossDebt: '400000000.00',
    cashEquivalents: '100000000.00',
    sharesCount: '50000000.0000000000',
    dividendsDeclared: '50000000.00',
    notes: 'Demonstração anual auditada',
  };

  it('valida com sucesso payload completo e correto', () => {
    const parsed = assetFundamentalInputSchema.parse(validPayload);
    expect(parsed.assetId).toBe(validPayload.assetId);
    expect(parsed.periodType).toBe('quarterly');
    expect(parsed.statementType).toBe('CONSOLIDATED');
    expect(parsed.currency).toBe('BRL');
    expect(parsed.sharesCount).toBe('50000000.0000000000');
  });

  it('rejeita dividendsDeclared < 0', () => {
    const invalidPayload = {
      ...validPayload,
      dividendsDeclared: '-100.00',
    };
    expect(() => assetFundamentalInputSchema.parse(invalidPayload)).toThrow(
      'Valor deve ser maior ou igual a zero'
    );
  });

  it('rejeita sharesCount <= 0', () => {
    const invalidPayload = {
      ...validPayload,
      sharesCount: '0',
    };
    expect(() => assetFundamentalInputSchema.parse(invalidPayload)).toThrow(
      'Quantidade de ações deve ser estritamente maior que zero'
    );
  });

  it('rejeita periodType inválido', () => {
    const invalidPayload = {
      ...validPayload,
      periodType: 'monthly',
    };
    expect(() => assetFundamentalInputSchema.parse(invalidPayload)).toThrow();
  });

  it('rejeita version < 1', () => {
    const invalidPayload = {
      ...validPayload,
      version: 0,
    };
    expect(() => assetFundamentalInputSchema.parse(invalidPayload)).toThrow();
  });

  it('normaliza currency para maiúsculas e aceita valores nulos opcionais', () => {
    const minimalPayload = {
      assetId: '123e4567-e89b-12d3-a456-426614174000',
      referencePeriod: '2025-FY',
      periodType: 'annual',
      referenceDate: new Date('2025-12-31'),
      currency: 'brl',
    };
    const parsed = assetFundamentalInputSchema.parse(minimalPayload);
    expect(parsed.currency).toBe('BRL');
    expect(parsed.statementType).toBe('CONSOLIDATED');
    expect(parsed.version).toBe(1);
    expect(parsed.isRestated).toBe(false);
    expect(parsed.netRevenue).toBeUndefined();
  });
});
