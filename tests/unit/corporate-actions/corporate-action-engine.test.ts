import { describe, it, expect } from 'vitest';
import { Decimal } from '@/lib/decimal';
import {
  applySplit,
  applyGrouping,
  applyBonusShare,
  calculateDividend,
  calculateJcp,
  InvalidCorporateActionError,
} from '@/modules/corporate-actions/domain';

describe('corporate-action-engine (Pure Domain Rules)', () => {
  describe('applySplit', () => {
    it('multiplies quantity by split factor and preserves total cost invariantly', () => {
      const runningQty = new Decimal('100');
      const runningCost = new Decimal('2500');
      const factor = new Decimal('2');

      const result = applySplit(runningQty, factor, runningCost);

      expect(result.quantity.toString()).toBe('200');
      expect(result.totalCost.toString()).toBe('2500');
    });

    it('handles fractional splits with high precision', () => {
      const runningQty = new Decimal('33.33333333');
      const runningCost = new Decimal('1000');
      const factor = new Decimal('1.5');

      const result = applySplit(runningQty, factor, runningCost);

      expect(result.quantity.toString()).toBe('49.999999995');
      expect(result.totalCost.toString()).toBe('1000');
    });

    it('throws InvalidCorporateActionError if factor is <= 0', () => {
      expect(() => {
        applySplit(new Decimal('100'), new Decimal('0'), new Decimal('1000'));
      }).toThrow(InvalidCorporateActionError);

      expect(() => {
        applySplit(new Decimal('100'), new Decimal('-2'), new Decimal('1000'));
      }).toThrow(InvalidCorporateActionError);
    });
  });

  describe('applyGrouping', () => {
    it('divides quantity by grouping factor and preserves total cost invariantly', () => {
      const runningQty = new Decimal('1000');
      const runningCost = new Decimal('5000');
      const factor = new Decimal('10');

      const result = applyGrouping(runningQty, factor, runningCost);

      expect(result.quantity.toString()).toBe('100');
      expect(result.totalCost.toString()).toBe('5000');
    });

    it('throws InvalidCorporateActionError if factor is <= 0', () => {
      expect(() => {
        applyGrouping(new Decimal('100'), new Decimal('0'), new Decimal('1000'));
      }).toThrow(InvalidCorporateActionError);
    });
  });

  describe('applyBonusShare', () => {
    it('adds bonus quantity with zero attributed unit price without altering prior total cost', () => {
      const runningQty = new Decimal('100');
      const runningCost = new Decimal('2000');
      const bonusQty = new Decimal('10');

      const result = applyBonusShare(runningQty, runningCost, bonusQty, new Decimal('0'));

      expect(result.quantity.toString()).toBe('110');
      expect(result.totalCost.toString()).toBe('2000');
    });

    it('adds bonus quantity with non-zero attributed unit price and increases total cost by bonus delta', () => {
      const runningQty = new Decimal('100');
      const runningCost = new Decimal('2000');
      const bonusQty = new Decimal('10');
      const unitPrice = new Decimal('15'); // 10 * 15 = 150

      const result = applyBonusShare(runningQty, runningCost, bonusQty, unitPrice);

      expect(result.quantity.toString()).toBe('110');
      expect(result.totalCost.toString()).toBe('2150');
    });

    it('throws InvalidCorporateActionError if bonus quantity is <= 0', () => {
      expect(() => {
        applyBonusShare(new Decimal('100'), new Decimal('1000'), new Decimal('0'), new Decimal('0'));
      }).toThrow(InvalidCorporateActionError);
    });

    it('throws InvalidCorporateActionError if attributed unit price is negative', () => {
      expect(() => {
        applyBonusShare(new Decimal('100'), new Decimal('1000'), new Decimal('10'), new Decimal('-5'));
      }).toThrow(InvalidCorporateActionError);
    });
  });

  describe('calculateDividend', () => {
    it('calculates exempt dividend income as eligible quantity multiplied by unit price', () => {
      const eligibleQty = new Decimal('500');
      const unitPrice = new Decimal('1.25');

      const result = calculateDividend(eligibleQty, unitPrice);

      expect(result.incomeAmount.toString()).toBe('625');
    });

    it('throws InvalidCorporateActionError if unit price is <= 0', () => {
      expect(() => {
        calculateDividend(new Decimal('100'), new Decimal('0'));
      }).toThrow(InvalidCorporateActionError);
    });
  });

  describe('calculateJcp', () => {
    it('calculates gross JCP, withheld IRRF and net income correctly', () => {
      const eligibleQty = new Decimal('1000');
      const unitPrice = new Decimal('0.50'); // Gross = 500
      const irrfFees = new Decimal('75'); // 15% IRRF

      const result = calculateJcp(eligibleQty, unitPrice, irrfFees);

      expect(result.grossAmount.toString()).toBe('500');
      expect(result.irrfFees.toString()).toBe('75');
      expect(result.netIncomeAmount.toString()).toBe('425');
    });

    it('throws InvalidCorporateActionError if IRRF is >= gross amount', () => {
      expect(() => {
        calculateJcp(new Decimal('100'), new Decimal('1.00'), new Decimal('100'));
      }).toThrow(InvalidCorporateActionError);

      expect(() => {
        calculateJcp(new Decimal('100'), new Decimal('1.00'), new Decimal('120'));
      }).toThrow(InvalidCorporateActionError);
    });
  });
});
