import { describe, it, expect } from 'vitest';
import {
  createCorporateActionEventSchema,
  createBonusEventSchema,
  createIncomeEventSchema,
  corporateActionFactorSchema,
  incomeUnitPriceSchema,
} from '@/modules/corporate-actions/domain';

describe('corporate-action schemas (Domain Schema Validation)', () => {
  const validUuid1 = '11111111-1111-4111-8111-111111111111';
  const validUuid2 = '22222222-2222-4222-8222-222222222222';
  const validDateStr = '2025-08-14T10:00:00Z';

  describe('corporateActionFactorSchema', () => {
    it('accepts strictly positive Decimal factors', () => {
      expect(corporateActionFactorSchema.parse('2')).toBe('2');
      expect(corporateActionFactorSchema.parse('0.5')).toBe('0.5');
      expect(corporateActionFactorSchema.parse('10')).toBe('10');
    });

    it('rejects zero or negative factors', () => {
      expect(() => corporateActionFactorSchema.parse('0')).toThrow();
      expect(() => corporateActionFactorSchema.parse('-2')).toThrow();
    });
  });

  describe('createCorporateActionEventSchema', () => {
    it('validates a valid SPLIT input', () => {
      const parsed = createCorporateActionEventSchema.parse({
        portfolioId: validUuid1,
        assetId: validUuid2,
        type: 'SPLIT',
        tradeDate: validDateStr,
        factor: '2',
        notes: 'Desdobramento 1 para 2',
      });

      expect(parsed.type).toBe('SPLIT');
      expect(parsed.factor).toBe('2');
      expect(parsed.notes).toBe('Desdobramento 1 para 2');
      expect(parsed.source).toBe('corporate_action');
    });

    it('validates a valid GROUPING input', () => {
      const parsed = createCorporateActionEventSchema.parse({
        portfolioId: validUuid1,
        assetId: validUuid2,
        type: 'GROUPING',
        tradeDate: validDateStr,
        factor: '10',
      });

      expect(parsed.type).toBe('GROUPING');
      expect(parsed.factor).toBe('10');
    });

    it('rejects invalid types', () => {
      expect(() =>
        createCorporateActionEventSchema.parse({
          portfolioId: validUuid1,
          assetId: validUuid2,
          type: 'INVALID_TYPE',
          tradeDate: validDateStr,
          factor: '2',
        })
      ).toThrow();
    });
  });

  describe('createBonusEventSchema', () => {
    it('validates a valid BONUS_SHARE input with attributed unit price', () => {
      const parsed = createBonusEventSchema.parse({
        portfolioId: validUuid1,
        assetId: validUuid2,
        tradeDate: validDateStr,
        quantity: '10',
        unitPrice: '15.50',
      });

      expect(parsed.type).toBe('BONUS_SHARE');
      expect(parsed.quantity).toBe('10');
      expect(parsed.unitPrice).toBe('15.5');
    });

    it('defaults unitPrice to 0 when omitted', () => {
      const parsed = createBonusEventSchema.parse({
        portfolioId: validUuid1,
        assetId: validUuid2,
        tradeDate: validDateStr,
        quantity: '10',
      });

      expect(parsed.unitPrice).toBe('0');
    });
  });

  describe('createIncomeEventSchema', () => {
    it('validates a valid DIVIDEND input', () => {
      const parsed = createIncomeEventSchema.parse({
        portfolioId: validUuid1,
        assetId: validUuid2,
        type: 'DIVIDEND',
        tradeDate: validDateStr,
        settlementDate: '2025-08-20T10:00:00Z',
        quantity: '100',
        unitPrice: '0.85',
      });

      expect(parsed.type).toBe('DIVIDEND');
      expect(parsed.quantity).toBe('100');
      expect(parsed.unitPrice).toBe('0.85');
      expect(parsed.fees).toBe('0');
    });

    it('validates a valid JCP input with IRRF fees less than gross', () => {
      const parsed = createIncomeEventSchema.parse({
        portfolioId: validUuid1,
        assetId: validUuid2,
        type: 'JCP',
        tradeDate: validDateStr,
        settlementDate: '2025-08-20T10:00:00Z',
        quantity: '100',
        unitPrice: '1.00',
        fees: '15.00',
      });

      expect(parsed.type).toBe('JCP');
      expect(parsed.fees).toBe('15');
    });

    it('rejects JCP when IRRF fees is >= gross', () => {
      expect(() =>
        createIncomeEventSchema.parse({
          portfolioId: validUuid1,
          assetId: validUuid2,
          type: 'JCP',
          tradeDate: validDateStr,
          settlementDate: '2025-08-20T10:00:00Z',
          quantity: '100',
          unitPrice: '1.00',
          fees: '100.00',
        })
      ).toThrow();
    });

    it('rejects when settlementDate is prior to tradeDate', () => {
      expect(() =>
        createIncomeEventSchema.parse({
          portfolioId: validUuid1,
          assetId: validUuid2,
          type: 'DIVIDEND',
          tradeDate: '2025-08-20T10:00:00Z',
          settlementDate: '2025-08-10T10:00:00Z',
          quantity: '100',
          unitPrice: '0.85',
        })
      ).toThrow();
    });
  });
});
