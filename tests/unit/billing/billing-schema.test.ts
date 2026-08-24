import { describe, it, expect } from 'vitest';
import {
  billingSubscriptionStatusEnum,
  billingCycleEnum,
  paymentEventStatusEnum,
  createBillingSubscriptionSchema,
  updateBillingSubscriptionSchema,
  cancelBillingSubscriptionSchema,
  processPaymentEventSchema,
} from '@/modules/billing/domain/billing.schema';
import { Decimal } from '@/lib/decimal';

describe('Billing Schemas (Unit)', () => {
  describe('billingSubscriptionStatusEnum', () => {
    it('deve aceitar os status canônicos de assinatura', () => {
      expect(billingSubscriptionStatusEnum.parse('incomplete')).toBe('incomplete');
      expect(billingSubscriptionStatusEnum.parse('trialing')).toBe('trialing');
      expect(billingSubscriptionStatusEnum.parse('active')).toBe('active');
      expect(billingSubscriptionStatusEnum.parse('past_due')).toBe('past_due');
      expect(billingSubscriptionStatusEnum.parse('canceled')).toBe('canceled');
      expect(billingSubscriptionStatusEnum.parse('unpaid')).toBe('unpaid');
    });

    it('deve rejeitar status desconhecidos ou inválidos', () => {
      expect(() => billingSubscriptionStatusEnum.parse('frozen')).toThrow();
      expect(() => billingSubscriptionStatusEnum.parse('pending')).toThrow();
      expect(() => billingSubscriptionStatusEnum.parse('active_trial')).toThrow();
      expect(() => billingSubscriptionStatusEnum.parse('')).toThrow();
    });
  });

  describe('billingCycleEnum', () => {
    it('deve aceitar monthly, yearly e custom', () => {
      expect(billingCycleEnum.parse('monthly')).toBe('monthly');
      expect(billingCycleEnum.parse('yearly')).toBe('yearly');
      expect(billingCycleEnum.parse('custom')).toBe('custom');
    });

    it('deve rejeitar ciclos inválidos', () => {
      expect(() => billingCycleEnum.parse('weekly')).toThrow();
      expect(() => billingCycleEnum.parse('daily')).toThrow();
    });
  });

  describe('paymentEventStatusEnum', () => {
    it('deve aceitar received, processed, failed, ignored', () => {
      expect(paymentEventStatusEnum.parse('received')).toBe('received');
      expect(paymentEventStatusEnum.parse('processed')).toBe('processed');
      expect(paymentEventStatusEnum.parse('failed')).toBe('failed');
      expect(paymentEventStatusEnum.parse('ignored')).toBe('ignored');
    });
  });

  describe('createBillingSubscriptionSchema', () => {
    it('deve aceitar payload válido com valores default', () => {
      const parsed = createBillingSubscriptionSchema.parse({
        userId: '11111111-1111-4111-8111-111111111111',
        planId: 'pro',
      });

      expect(parsed.userId).toBe('11111111-1111-4111-8111-111111111111');
      expect(parsed.planId).toBe('pro');
      expect(parsed.status).toBe('active');
      expect(parsed.billingCycle).toBe('monthly');
      expect(parsed.cancelAtPeriodEnd).toBe(false);
      expect(parsed.provider).toBe('internal');
    });

    it('deve rejeitar userId que não seja UUID válido', () => {
      expect(() =>
        createBillingSubscriptionSchema.parse({
          userId: 'not-a-uuid',
          planId: 'pro',
        })
      ).toThrow();
    });

    it('deve aceitar datas de início e fim de período', () => {
      const now = new Date();
      const end = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      const parsed = createBillingSubscriptionSchema.parse({
        userId: '11111111-1111-4111-8111-111111111111',
        planId: 'pro',
        currentPeriodStart: now,
        currentPeriodEnd: end,
      });

      expect(parsed.currentPeriodStart).toBeInstanceOf(Date);
      expect(parsed.currentPeriodEnd).toBeInstanceOf(Date);
    });
  });

  describe('updateBillingSubscriptionSchema', () => {
    it('deve aceitar alterações parciais de status e cancelAtPeriodEnd', () => {
      const parsed = updateBillingSubscriptionSchema.parse({
        status: 'canceled',
        cancelAtPeriodEnd: true,
      });

      expect(parsed.status).toBe('canceled');
      expect(parsed.cancelAtPeriodEnd).toBe(true);
    });
  });

  describe('cancelBillingSubscriptionSchema', () => {
    it('deve aplicar cancelAtPeriodEnd = true por padrão', () => {
      const parsed = cancelBillingSubscriptionSchema.parse({});
      expect(parsed.cancelAtPeriodEnd).toBe(true);
    });

    it('deve aceitar motivo opcional com limite de caracteres', () => {
      const parsed = cancelBillingSubscriptionSchema.parse({
        cancelAtPeriodEnd: false,
        reason: 'Mudança de estratégia',
      });
      expect(parsed.cancelAtPeriodEnd).toBe(false);
      expect(parsed.reason).toBe('Mudança de estratégia');
    });
  });

  describe('processPaymentEventSchema', () => {
    it('deve converter amount string, number ou Decimal para Decimal estrito', () => {
      const parsedString = processPaymentEventSchema.parse({
        userId: '11111111-1111-4111-8111-111111111111',
        idempotencyKey: 'evt_123',
        eventType: 'invoice.payment_succeeded',
        amount: '49.90',
      });
      expect(parsedString.amount).toBeInstanceOf(Decimal);
      expect(parsedString.amount?.toString()).toBe('49.9');

      const parsedNum = processPaymentEventSchema.parse({
        userId: '11111111-1111-4111-8111-111111111111',
        idempotencyKey: 'evt_124',
        eventType: 'invoice.payment_succeeded',
        amount: 49.9,
      });
      expect(parsedNum.amount).toBeInstanceOf(Decimal);

      const parsedNull = processPaymentEventSchema.parse({
        userId: '11111111-1111-4111-8111-111111111111',
        idempotencyKey: 'evt_125',
        eventType: 'subscription.created',
        amount: null,
      });
      expect(parsedNull.amount).toBeNull();
    });

    it('deve rejeitar idempotencyKey vazia', () => {
      expect(() =>
        processPaymentEventSchema.parse({
          userId: '11111111-1111-4111-8111-111111111111',
          idempotencyKey: '',
          eventType: 'invoice.payment_succeeded',
        })
      ).toThrow();
    });
  });
});
