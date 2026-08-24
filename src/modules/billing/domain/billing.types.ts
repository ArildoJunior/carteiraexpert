import type { Decimal } from '../../../lib/decimal';
import type { CommercialPlanId } from '../../plans/domain/plan.types';

export type BillingSubscriptionStatus =
  | 'incomplete'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'unpaid';

export type BillingCycle = 'monthly' | 'yearly' | 'custom';

export type PaymentEventType =
  | 'invoice.payment_succeeded'
  | 'invoice.payment_failed'
  | 'subscription.created'
  | 'subscription.updated'
  | 'subscription.canceled';

export type PaymentEventStatus = 'received' | 'processed' | 'failed' | 'ignored';

export interface BillingSubscription {
  id: string;
  userId: string;
  planId: CommercialPlanId;
  status: BillingSubscriptionStatus;
  billingCycle: BillingCycle;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  canceledAt: Date | null;
  endedAt: Date | null;
  gracePeriodEndsAt: Date | null;
  provider: string;
  providerSubscriptionId: string | null;
  providerCustomerId: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PaymentEvent {
  id: string;
  userId: string;
  subscriptionId: string | null;
  idempotencyKey: string;
  eventType: string;
  provider: string;
  providerEventId: string | null;
  amount: Decimal | null;
  currency: string;
  status: PaymentEventStatus;
  payload: Record<string, unknown> | null;
  errorMessage: string | null;
  processedAt: Date | null;
  createdAt: Date;
}

export interface UserBillingSummary {
  hasSubscription: boolean;
  subscription: BillingSubscription | null;
  effectivePlanId: CommercialPlanId;
  effectivePlanName: string;
  maxActivePortfolios: number | null;
  status: BillingSubscriptionStatus | 'no_subscription';
  isPastDue: boolean;
  isCanceled: boolean;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date | null;
  gracePeriodEndsAt: Date | null;
  provider: string | null;
}

export interface CreateBillingSubscriptionInput {
  userId: string;
  planId: CommercialPlanId;
  status?: BillingSubscriptionStatus;
  billingCycle?: BillingCycle;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  cancelAtPeriodEnd?: boolean;
  gracePeriodEndsAt?: Date | null;
  provider?: string;
  providerSubscriptionId?: string | null;
  providerCustomerId?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface UpdateBillingSubscriptionInput {
  status?: BillingSubscriptionStatus;
  billingCycle?: BillingCycle;
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  cancelAtPeriodEnd?: boolean;
  canceledAt?: Date | null;
  endedAt?: Date | null;
  gracePeriodEndsAt?: Date | null;
  metadata?: Record<string, unknown> | null;
}

export interface CancelBillingSubscriptionInput {
  cancelAtPeriodEnd?: boolean;
  reason?: string;
}

export interface ProcessPaymentEventInput {
  userId: string;
  subscriptionId?: string | null;
  idempotencyKey: string;
  eventType: string;
  provider?: string;
  providerEventId?: string | null;
  amount?: Decimal | string | number | null;
  currency?: string;
  payload?: Record<string, unknown> | null;
}
