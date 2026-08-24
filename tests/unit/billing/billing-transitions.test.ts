import { describe, it, expect } from 'vitest';
import { MockPaymentGatewayAdapter } from '@/modules/billing/server/adapters/mock-gateway.adapter';
import {
  BillingSubscriptionNotFoundError,
  InvalidSubscriptionStatusTransitionError,
  DuplicatePaymentEventError,
  PaymentEventProcessingError,
} from '@/modules/billing/domain/errors';
import type { SafeUser } from '@/modules/identity/domain/user.types';

describe('Billing Transitions & Gateway Adapters (Unit)', () => {
  const dummyUser: SafeUser = {
    id: '11111111-1111-4111-8111-111111111111',
    email: 'test@carteiraexpert.test',
    name: 'Test User',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  describe('MockPaymentGatewayAdapter', () => {
    const adapter = new MockPaymentGatewayAdapter();

    it('deve possuir providerName = mock_provider', () => {
      expect(adapter.providerName).toBe('mock_provider');
    });

    it('deve gerar customerId mock formatado', async () => {
      const res = await adapter.createCustomer(dummyUser);
      expect(res.providerCustomerId).toBe('mock_cus_11111111');
    });

    it('deve gerar assinatura ativa mock com período correspondente ao ciclo', async () => {
      const resMonthly = await adapter.createSubscription({
        user: dummyUser,
        providerCustomerId: 'mock_cus_11111111',
        planId: 'pro',
        billingCycle: 'monthly',
      });

      expect(resMonthly.status).toBe('active');
      expect(resMonthly.providerSubscriptionId).toMatch(/^mock_sub_/);
      expect(resMonthly.currentPeriodEnd.getTime()).toBeGreaterThan(resMonthly.currentPeriodStart.getTime());

      const resYearly = await adapter.createSubscription({
        user: dummyUser,
        providerCustomerId: 'mock_cus_11111111',
        planId: 'pro',
        billingCycle: 'yearly',
      });
      expect(resYearly.currentPeriodEnd.getFullYear()).toBe(resYearly.currentPeriodStart.getFullYear() + 1);
    });

    it('deve cancelar assinatura mock respeitando cancelAtPeriodEnd', async () => {
      const resCancelEnd = await adapter.cancelSubscription('mock_sub_123', {
        cancelAtPeriodEnd: true,
      });
      expect(resCancelEnd.status).toBe('active');
      expect(resCancelEnd.endedAt).toBeNull();

      const resCancelImmediate = await adapter.cancelSubscription('mock_sub_123', {
        cancelAtPeriodEnd: false,
      });
      expect(resCancelImmediate.status).toBe('canceled');
      expect(resCancelImmediate.endedAt).toBeInstanceOf(Date);
    });

    it('deve validar assinatura mock de webhook', async () => {
      const isValid = await adapter.verifyWebhookSignature('payload', 'mock_sig_secret123', 'secret123');
      expect(isValid).toBe(true);

      const isInvalid = await adapter.verifyWebhookSignature('payload', 'invalid_sig', 'secret123');
      expect(isInvalid).toBe(false);
    });

    it('deve fazer parse de webhook mock em JSON', async () => {
      const payload = JSON.stringify({
        idempotencyKey: 'key_123',
        eventType: 'invoice.payment_succeeded',
        amount: '49.90',
      });

      const parsed = await adapter.parseWebhookEvent(payload);
      expect(parsed.idempotencyKey).toBe('key_123');
      expect(parsed.eventType).toBe('invoice.payment_succeeded');
      expect(parsed.amount).toBe('49.90');
    });
  });

  describe('Classes Canônicas de Erro', () => {
    it('deve instanciar BillingSubscriptionNotFoundError com mensagem adequada', () => {
      const err = new BillingSubscriptionNotFoundError();
      expect(err.name).toBe('BillingSubscriptionNotFoundError');
      expect(err.message).toBe('Assinatura não encontrada.');
    });

    it('deve instanciar DuplicatePaymentEventError carregando idempotencyKey', () => {
      const err = new DuplicatePaymentEventError('dup_key_999');
      expect(err.name).toBe('DuplicatePaymentEventError');
      expect(err.idempotencyKey).toBe('dup_key_999');
      expect(err.message).toContain('dup_key_999');
    });

    it('deve instanciar InvalidSubscriptionStatusTransitionError e PaymentEventProcessingError', () => {
      const err1 = new InvalidSubscriptionStatusTransitionError();
      expect(err1.name).toBe('InvalidSubscriptionStatusTransitionError');

      const err2 = new PaymentEventProcessingError('Falha no processador.');
      expect(err2.name).toBe('PaymentEventProcessingError');
      expect(err2.message).toBe('Falha no processador.');
    });
  });
});
