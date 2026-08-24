import crypto from 'node:crypto';
import type {
  PaymentGatewayAdapter,
  CreateCustomerResult,
  CreateSubscriptionResult,
  CancelSubscriptionResult,
  ParsedWebhookEvent,
} from './gateway-adapter.interface';
import type { SafeUser } from '../../../identity/domain/user.types';
import type { BillingCycle } from '../../domain/billing.types';
import type { CommercialPlanId } from '../../../plans/domain/plan.types';

/**
 * Adaptador Mock / No-Op de Gateway de Pagamento para testes e desenvolvimento isolado.
 * Não realiza nenhuma chamada de rede ou processamento de cartão.
 */
export class MockPaymentGatewayAdapter implements PaymentGatewayAdapter {
  public readonly providerName = 'mock_provider';

  async createCustomer(user: SafeUser): Promise<CreateCustomerResult> {
    return {
      providerCustomerId: `mock_cus_${user.id.slice(0, 8)}`,
    };
  }

  async createSubscription(input: {
    user: SafeUser;
    providerCustomerId: string;
    planId: CommercialPlanId;
    billingCycle: BillingCycle;
  }): Promise<CreateSubscriptionResult> {
    const now = new Date();
    const periodEnd = new Date(now);
    if (input.billingCycle === 'yearly') {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    } else {
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    }

    return {
      providerSubscriptionId: `mock_sub_${crypto.randomUUID().slice(0, 8)}`,
      providerCustomerId: input.providerCustomerId,
      status: 'active',
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
    };
  }

  async cancelSubscription(
    providerSubscriptionId: string,
    options: { cancelAtPeriodEnd: boolean }
  ): Promise<CancelSubscriptionResult> {
    const now = new Date();
    return {
      providerSubscriptionId,
      status: options.cancelAtPeriodEnd ? 'active' : 'canceled',
      canceledAt: now,
      endedAt: options.cancelAtPeriodEnd ? null : now,
    };
  }

  async verifyWebhookSignature(
    _rawPayload: string | Buffer,
    signatureHeader: string,
    secret: string
  ): Promise<boolean> {
    return signatureHeader === `mock_sig_${secret}`;
  }

  async parseWebhookEvent(rawPayload: string | Buffer): Promise<ParsedWebhookEvent> {
    const str = typeof rawPayload === 'string' ? rawPayload : rawPayload.toString('utf-8');
    const parsed = JSON.parse(str);
    return {
      idempotencyKey: parsed.idempotencyKey || `mock_event_${crypto.randomUUID()}`,
      eventType: parsed.eventType || 'invoice.payment_succeeded',
      providerEventId: parsed.providerEventId,
      providerSubscriptionId: parsed.providerSubscriptionId,
      providerCustomerId: parsed.providerCustomerId,
      amount: parsed.amount,
      currency: parsed.currency || 'BRL',
      payload: parsed,
    };
  }
}
