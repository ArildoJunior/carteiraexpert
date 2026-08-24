import type { SafeUser } from '../../../identity/domain/user.types';
import type { BillingCycle, BillingSubscriptionStatus } from '../../domain/billing.types';
import type { CommercialPlanId } from '../../../plans/domain/plan.types';

export interface CreateCustomerResult {
  providerCustomerId: string;
}

export interface CreateSubscriptionResult {
  providerSubscriptionId: string;
  providerCustomerId: string;
  status: BillingSubscriptionStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
}

export interface CancelSubscriptionResult {
  providerSubscriptionId: string;
  status: BillingSubscriptionStatus;
  canceledAt: Date;
  endedAt?: Date | null;
}

export interface ParsedWebhookEvent {
  idempotencyKey: string;
  eventType: string;
  providerEventId?: string;
  providerSubscriptionId?: string;
  providerCustomerId?: string;
  amount?: string;
  currency?: string;
  payload: Record<string, unknown>;
}

/**
 * Contrato agnóstico para provedores de pagamento e faturamento (Stripe, Asaas, etc.).
 * O sistema central do CarteiraExpert interage unicamente através desta interface.
 */
export interface PaymentGatewayAdapter {
  readonly providerName: string;

  createCustomer(user: SafeUser): Promise<CreateCustomerResult>;

  createSubscription(input: {
    user: SafeUser;
    providerCustomerId: string;
    planId: CommercialPlanId;
    billingCycle: BillingCycle;
  }): Promise<CreateSubscriptionResult>;

  cancelSubscription(
    providerSubscriptionId: string,
    options: { cancelAtPeriodEnd: boolean }
  ): Promise<CancelSubscriptionResult>;

  verifyWebhookSignature(
    rawPayload: string | Buffer,
    signatureHeader: string,
    secret: string
  ): Promise<boolean>;

  parseWebhookEvent(rawPayload: string | Buffer): Promise<ParsedWebhookEvent>;
}
