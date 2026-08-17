import { describe, it, expect } from 'vitest';
import {
  allocateSubscriptionRightSchema,
  exerciseSubscriptionInputSchema,
  cancelSubscriptionRightSchema,
  subscriptionQuantitySchema,
  subscriptionFeesSchema,
} from '@/modules/corporate-actions/domain';

describe('subscription.schema (Strict Zod Schemas & Anti-Tampering)', () => {
  const validUUID1 = '123e4567-e89b-12d3-a456-426614174001';
  const validUUID2 = '123e4567-e89b-12d3-a456-426614174002';
  const validUUID3 = '123e4567-e89b-12d3-a456-426614174003';
  const validIsoDate = '2026-08-10T12:00:00.000Z';

  describe('allocateSubscriptionRightSchema', () => {
    it('accepts valid allocation payload', () => {
      const payload = {
        portfolioId: validUUID1,
        offerId: validUUID2,
        allocatedQuantity: '100.0000000000',
      };
      const result = allocateSubscriptionRightSchema.safeParse(payload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.allocatedQuantity).toBe('100');
      }
    });

    it('rejects invalid portfolioId or offerId', () => {
      const result = allocateSubscriptionRightSchema.safeParse({
        portfolioId: 'invalid-uuid',
        offerId: validUUID2,
        allocatedQuantity: '100',
      });
      expect(result.success).toBe(false);
    });

    it('rejects allocation quantity <= 0', () => {
      const result = allocateSubscriptionRightSchema.safeParse({
        portfolioId: validUUID1,
        offerId: validUUID2,
        allocatedQuantity: '0.0000000000',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('exerciseSubscriptionInputSchema (Anti-Tampering & Validation)', () => {
    it('accepts valid exercise payload without client price or totalCost', () => {
      const payload = {
        subscriptionRightId: validUUID1,
        portfolioId: validUUID2,
        quantity: '25.0000000000',
        fees: '3.50000000',
        exerciseDate: validIsoDate,
        idempotencyKey: validUUID3,
      };
      const result = exerciseSubscriptionInputSchema.safeParse(payload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.quantity).toBe('25');
        expect(result.data.fees).toBe('3.5');
        expect(result.data.exerciseDate).toBe(validIsoDate);
        expect(result.data.idempotencyKey).toBe(validUUID3);
      }
    });

    it('applies default fees of 0.00000000 when fees is omitted', () => {
      const payload = {
        subscriptionRightId: validUUID1,
        portfolioId: validUUID2,
        quantity: '10.0000000000',
        exerciseDate: validIsoDate,
        idempotencyKey: validUUID3,
      };
      const result = exerciseSubscriptionInputSchema.safeParse(payload);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.fees).toBe('0.00000000');
      }
    });

    // 20. rejeição de exercisePrice e totalCost no input público
    it('20. strictly rejects any attempt to inject exercisePrice in input payload', () => {
      const payload = {
        subscriptionRightId: validUUID1,
        portfolioId: validUUID2,
        quantity: '25.0000000000',
        exercisePrice: '10.00000000', // Injected!
        exerciseDate: validIsoDate,
        idempotencyKey: validUUID3,
      };
      const result = exerciseSubscriptionInputSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('20b. strictly rejects any attempt to inject totalCost in input payload', () => {
      const payload = {
        subscriptionRightId: validUUID1,
        portfolioId: validUUID2,
        quantity: '25.0000000000',
        totalCost: '250.00000000', // Injected!
        exerciseDate: validIsoDate,
        idempotencyKey: validUUID3,
      };
      const result = exerciseSubscriptionInputSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    // 21. rejeição de number em valores financeiros
    it('21. strictly rejects JavaScript number type for quantity', () => {
      const payload = {
        subscriptionRightId: validUUID1,
        portfolioId: validUUID2,
        quantity: 25, // JS Number forbidden!
        exerciseDate: validIsoDate,
        idempotencyKey: validUUID3,
      };
      const result = exerciseSubscriptionInputSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('21b. strictly rejects JavaScript number type for fees', () => {
      const payload = {
        subscriptionRightId: validUUID1,
        portfolioId: validUUID2,
        quantity: '25.0000000000',
        fees: 3.5, // JS Number forbidden!
        exerciseDate: validIsoDate,
        idempotencyKey: validUUID3,
      };
      const result = exerciseSubscriptionInputSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    // 22. rejeição de idempotencyKey inválida
    it('22. strictly rejects non-UUID idempotencyKey', () => {
      const payload = {
        subscriptionRightId: validUUID1,
        portfolioId: validUUID2,
        quantity: '25.0000000000',
        exerciseDate: validIsoDate,
        idempotencyKey: 'not-a-valid-uuid',
      };
      const result = exerciseSubscriptionInputSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    // 7. excesso de escala (> 10 em quantidade, > 8 em taxas)
    it('7. rejects quantity with more than 10 decimal places', () => {
      const result = subscriptionQuantitySchema.safeParse('10.12345678901');
      expect(result.success).toBe(false);
    });

    it('7b. rejects fees with more than 8 decimal places', () => {
      const result = subscriptionFeesSchema.safeParse('5.123456789');
      expect(result.success).toBe(false);
    });
  });

  describe('cancelSubscriptionRightSchema', () => {
    it('accepts valid cancellation payload', () => {
      const payload = {
        subscriptionRightId: validUUID1,
        portfolioId: validUUID2,
        reason: 'Cancelamento de saldo solicitado pelo usuário.',
      };
      const result = cancelSubscriptionRightSchema.safeParse(payload);
      expect(result.success).toBe(true);
    });

    it('rejects empty or whitespace reason', () => {
      const payload = {
        subscriptionRightId: validUUID1,
        portfolioId: validUUID2,
        reason: '   ',
      };
      const result = cancelSubscriptionRightSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });

    it('rejects excessively long reason (> 500 chars)', () => {
      const payload = {
        subscriptionRightId: validUUID1,
        portfolioId: validUUID2,
        reason: 'a'.repeat(501),
      };
      const result = cancelSubscriptionRightSchema.safeParse(payload);
      expect(result.success).toBe(false);
    });
  });
});
