import { describe, it, expect } from 'vitest';
import { Decimal } from '@/lib/decimal';
import {
  assertCostInvariant,
  assertExerciseDate,
  assertExercisePeriod,
  calculateRemainingQuantity,
  evaluateSubscriptionStatus,
  isWithinExercisePeriod,
  quantizeTotalCost,
  InvalidCorporateActionError,
  InvalidCostInvariantError,
  InvalidSubscriptionDateError,
  InvalidSubscriptionPeriodError,
  SubscriptionExpiredError,
  InsufficientSubscriptionRightsError,
} from '@/modules/corporate-actions/domain';

describe('subscription-engine (Pure Domain Rules & Math Invariants)', () => {
  describe('quantizeTotalCost & assertCostInvariant', () => {
    // 1. custo com preço positivo e sem taxas
    it('1. calculates cost with positive price and zero/default fees', () => {
      const quantity = new Decimal('100.0000000000');
      const exercisePrice = new Decimal('10.50000000');

      const cost = quantizeTotalCost({ quantity, exercisePrice });
      expect(cost.toFixed(8)).toBe('1050.00000000');
      expect(() =>
        assertCostInvariant(quantity, exercisePrice, '0', '1050.00000000')
      ).not.toThrow();
    });

    // 2. custo com taxas
    it('2. calculates cost with price and fees added to total', () => {
      const quantity = new Decimal('50.0000000000');
      const exercisePrice = new Decimal('25.30000000');
      const fees = new Decimal('4.75000000');

      const cost = quantizeTotalCost({ quantity, exercisePrice, fees });
      // 50 * 25.30 = 1265.00 + 4.75 = 1269.75000000
      expect(cost.toFixed(8)).toBe('1269.75000000');
      expect(() =>
        assertCostInvariant(quantity, exercisePrice, fees, '1269.75000000')
      ).not.toThrow();
    });

    // 3. preço de exercício zero
    it('3. allows zero exercise price (e.g. gratuitous/bonus emissions)', () => {
      const quantity = new Decimal('100.0000000000');
      const exercisePrice = new Decimal('0.00000000');
      const fees = new Decimal('2.50000000');

      const cost = quantizeTotalCost({ quantity, exercisePrice, fees });
      expect(cost.toFixed(8)).toBe('2.50000000');
      expect(() =>
        assertCostInvariant(quantity, exercisePrice, fees, '2.50000000')
      ).not.toThrow();
    });

    // 4. taxa negativa
    it('4. throws InvalidCorporateActionError if fees are negative', () => {
      expect(() => {
        quantizeTotalCost({
          quantity: new Decimal('10'),
          exercisePrice: new Decimal('10'),
          fees: new Decimal('-1.00000000'),
        });
      }).toThrow(InvalidCorporateActionError);
    });

    // 5. quantidade zero
    it('5. throws InvalidCorporateActionError if quantity is zero', () => {
      expect(() => {
        quantizeTotalCost({
          quantity: new Decimal('0'),
          exercisePrice: new Decimal('10'),
        });
      }).toThrow(InvalidCorporateActionError);
    });

    // 6. quantidade negativa
    it('6. throws InvalidCorporateActionError if quantity is negative', () => {
      expect(() => {
        quantizeTotalCost({
          quantity: new Decimal('-5'),
          exercisePrice: new Decimal('10'),
        });
      }).toThrow(InvalidCorporateActionError);
    });

    // 8. arredondamento ROUND_HALF_EVEN (bancário)
    it('8. rounds half even (bankers rounding) correctly at the 8th decimal place', () => {
      // Test rounding down when preceding digit is even: 0.000000005 -> 0.00000000
      // Test rounding up when preceding digit is odd: 0.000000015 -> 0.00000002
      const q1 = new Decimal('1.0000000000');
      const p1 = new Decimal('0.000000005'); // ending in even digit (0) + 5 -> rounds to 0.00000000
      const cost1 = quantizeTotalCost({ quantity: q1, exercisePrice: p1 });
      expect(cost1.toFixed(8)).toBe('0.00000000');

      const p2 = new Decimal('0.000000015'); // ending in odd digit (1) + 5 -> rounds to 0.00000002
      const cost2 = quantizeTotalCost({ quantity: q1, exercisePrice: p2 });
      expect(cost2.toFixed(8)).toBe('0.00000002');
    });

    // 9. custo quantizado em 8 casas
    it('9. strictly quantizes total cost to 8 decimal places', () => {
      const q = new Decimal('3.3333333333');
      const p = new Decimal('10.12345678');
      const fees = new Decimal('0.55555555');

      const cost = quantizeTotalCost({ quantity: q, exercisePrice: p, fees });
      expect(cost.decimalPlaces()).toBeLessThanOrEqual(8);
      // 3.3333333333 * 10.12345678 + 0.55555555 = 34.300411480060934 -> 34.30041148
      expect(cost.toFixed(8)).toBe('34.30041148');
    });

    it('assertCostInvariant throws InvalidCostInvariantError on cost divergence', () => {
      expect(() => {
        assertCostInvariant('10', '10', '0', '105.00000000');
      }).toThrow(InvalidCostInvariantError);
    });
  });

  describe('calculateRemainingQuantity', () => {
    it('calculates remaining quantity correctly', () => {
      const remaining = calculateRemainingQuantity('100.0000000000', '30.0000000000');
      expect(remaining.toFixed(10)).toBe('70.0000000000');
    });

    it('throws InsufficientSubscriptionRightsError if exercised > allocated', () => {
      expect(() => {
        calculateRemainingQuantity('50.0000000000', '50.0000000001');
      }).toThrow(InsufficientSubscriptionRightsError);
    });
  });

  describe('assertExercisePeriod & isWithinExercisePeriod', () => {
    const start = new Date('2026-08-01T00:00:00.000Z');
    const end = new Date('2026-08-15T23:59:59.999Z');

    // 10. janela de exercício válida
    it('10. allows exercise within valid window', () => {
      const validNow = new Date('2026-08-10T12:00:00.000Z');
      expect(isWithinExercisePeriod(validNow, start, end)).toBe(true);
      expect(() => assertExercisePeriod(validNow, start, end)).not.toThrow();
    });

    // 11. exercício antes do início
    it('11. throws InvalidSubscriptionPeriodError if now is before start date', () => {
      const beforeNow = new Date('2026-07-31T23:59:59.999Z');
      expect(isWithinExercisePeriod(beforeNow, start, end)).toBe(false);
      expect(() => assertExercisePeriod(beforeNow, start, end)).toThrow(
        InvalidSubscriptionPeriodError
      );
    });

    // 12. exercício depois do fim
    it('12. throws SubscriptionExpiredError if now is after end date', () => {
      const afterNow = new Date('2026-08-16T00:00:00.000Z');
      expect(isWithinExercisePeriod(afterNow, start, end)).toBe(false);
      expect(() => assertExercisePeriod(afterNow, start, end)).toThrow(
        SubscriptionExpiredError
      );
    });
  });

  describe('assertExerciseDate', () => {
    const cutOffDate = new Date('2026-07-20T00:00:00.000Z');
    const serverNowUtc = new Date('2026-08-10T12:00:00.000Z');

    it('allows valid exerciseDate between cutOffDate and serverNowUtc', () => {
      const validExerciseDate = new Date('2026-08-05T10:00:00.000Z');
      expect(() =>
        assertExerciseDate(validExerciseDate, cutOffDate, serverNowUtc)
      ).not.toThrow();
    });

    // 13. exerciseDate futura
    it('13. throws InvalidSubscriptionDateError if exerciseDate is in the future relative to serverNowUtc', () => {
      const futureDate = new Date('2026-08-10T12:00:01.000Z');
      expect(() =>
        assertExerciseDate(futureDate, cutOffDate, serverNowUtc)
      ).toThrow(InvalidSubscriptionDateError);
    });

    // 14. exerciseDate anterior à cutOffDate
    it('14. throws InvalidSubscriptionDateError if exerciseDate is prior to cutOffDate', () => {
      const priorDate = new Date('2026-07-19T23:59:59.999Z');
      expect(() =>
        assertExerciseDate(priorDate, cutOffDate, serverNowUtc)
      ).toThrow(InvalidSubscriptionDateError);
    });
  });

  describe('evaluateSubscriptionStatus (State Machine & Invariants)', () => {
    const start = new Date('2026-08-01T00:00:00.000Z');
    const end = new Date('2026-08-15T23:59:59.999Z');
    const duringPeriod = new Date('2026-08-10T12:00:00.000Z');
    const afterPeriod = new Date('2026-08-16T12:00:00.000Z');

    // 15. ACTIVE
    it('15. evaluates to ACTIVE when no quantity exercised within validity period', () => {
      const status = evaluateSubscriptionStatus({
        persistedStatus: 'ACTIVE',
        allocatedQuantity: '100',
        exercisedQuantity: '0',
        exerciseStartDate: start,
        exerciseEndDate: end,
        serverNowUtc: duringPeriod,
      });
      expect(status).toBe('ACTIVE');
    });

    // 16. PARTIALLY_EXERCISED
    it('16. evaluates to PARTIALLY_EXERCISED when partial quantity exercised within validity period', () => {
      const status = evaluateSubscriptionStatus({
        persistedStatus: 'PARTIALLY_EXERCISED',
        allocatedQuantity: '100',
        exercisedQuantity: '40',
        exerciseStartDate: start,
        exerciseEndDate: end,
        serverNowUtc: duringPeriod,
      });
      expect(status).toBe('PARTIALLY_EXERCISED');
    });

    // 17. FULLY_EXERCISED terminal
    it('17. FULLY_EXERCISED is terminal and does NOT turn into EXPIRED even after validity end', () => {
      const statusDuring = evaluateSubscriptionStatus({
        persistedStatus: 'ACTIVE',
        allocatedQuantity: '100',
        exercisedQuantity: '100',
        exerciseStartDate: start,
        exerciseEndDate: end,
        serverNowUtc: duringPeriod,
      });
      expect(statusDuring).toBe('FULLY_EXERCISED');

      const statusAfter = evaluateSubscriptionStatus({
        persistedStatus: 'FULLY_EXERCISED',
        allocatedQuantity: '100',
        exercisedQuantity: '100',
        exerciseStartDate: start,
        exerciseEndDate: end,
        serverNowUtc: afterPeriod,
      });
      expect(statusAfter).toBe('FULLY_EXERCISED');
    });

    // 18. EXPIRED
    it('18. evaluates to EXPIRED when unexercised balance remains and validity period has ended', () => {
      const statusTotalLapse = evaluateSubscriptionStatus({
        persistedStatus: 'ACTIVE',
        allocatedQuantity: '100',
        exercisedQuantity: '0',
        exerciseStartDate: start,
        exerciseEndDate: end,
        serverNowUtc: afterPeriod,
      });
      expect(statusTotalLapse).toBe('EXPIRED');

      const statusPartialLapse = evaluateSubscriptionStatus({
        persistedStatus: 'PARTIALLY_EXERCISED',
        allocatedQuantity: '100',
        exercisedQuantity: '50',
        exerciseStartDate: start,
        exerciseEndDate: end,
        serverNowUtc: afterPeriod,
      });
      expect(statusPartialLapse).toBe('EXPIRED');
    });

    // 19. CANCELLED terminal
    it('19. CANCELLED is terminal and never returns to ACTIVE, PARTIALLY_EXERCISED or EXPIRED', () => {
      const statusDuring = evaluateSubscriptionStatus({
        persistedStatus: 'CANCELLED',
        allocatedQuantity: '100',
        exercisedQuantity: '0',
        exerciseStartDate: start,
        exerciseEndDate: end,
        serverNowUtc: duringPeriod,
      });
      expect(statusDuring).toBe('CANCELLED');

      const statusAfter = evaluateSubscriptionStatus({
        persistedStatus: 'CANCELLED',
        allocatedQuantity: '100',
        exercisedQuantity: '30',
        exerciseStartDate: start,
        exerciseEndDate: end,
        serverNowUtc: afterPeriod,
      });
      expect(statusAfter).toBe('CANCELLED');
    });
  });
});
