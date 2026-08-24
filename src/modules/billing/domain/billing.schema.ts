import { z } from 'zod';
import { Decimal } from '../../../lib/decimal';

export const billingSubscriptionStatusEnum = z.enum([
  'incomplete',
  'trialing',
  'active',
  'past_due',
  'canceled',
  'unpaid',
]);

export const billingCycleEnum = z.enum(['monthly', 'yearly', 'custom']);

export const paymentEventStatusEnum = z.enum([
  'received',
  'processed',
  'failed',
  'ignored',
]);

export const createBillingSubscriptionSchema = z.object({
  userId: z.string().uuid({ message: 'userId deve ser um UUID válido.' }),
  planId: z.enum(['free', 'pro', 'shared']),
  status: billingSubscriptionStatusEnum.default('active'),
  billingCycle: billingCycleEnum.default('monthly'),
  currentPeriodStart: z.coerce.date().optional(),
  currentPeriodEnd: z.coerce.date().optional(),
  cancelAtPeriodEnd: z.boolean().default(false),
  gracePeriodEndsAt: z.coerce.date().nullable().optional(),
  provider: z.string().min(1).default('internal'),
  providerSubscriptionId: z.string().nullable().optional(),
  providerCustomerId: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const updateBillingSubscriptionSchema = z.object({
  status: billingSubscriptionStatusEnum.optional(),
  billingCycle: billingCycleEnum.optional(),
  currentPeriodStart: z.coerce.date().optional(),
  currentPeriodEnd: z.coerce.date().optional(),
  cancelAtPeriodEnd: z.boolean().optional(),
  canceledAt: z.coerce.date().nullable().optional(),
  endedAt: z.coerce.date().nullable().optional(),
  gracePeriodEndsAt: z.coerce.date().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
});

export const cancelBillingSubscriptionSchema = z.object({
  cancelAtPeriodEnd: z.boolean().default(true),
  reason: z.string().max(255).optional(),
});

export const processPaymentEventSchema = z.object({
  userId: z.string().uuid({ message: 'userId deve ser um UUID válido.' }),
  subscriptionId: z.string().uuid().nullable().optional(),
  idempotencyKey: z.string().min(1, { message: 'idempotencyKey é obrigatória.' }),
  eventType: z.string().min(1, { message: 'eventType é obrigatório.' }),
  provider: z.string().min(1).default('internal'),
  providerEventId: z.string().nullable().optional(),
  amount: z
    .union([z.string(), z.number(), z.instanceof(Decimal)])
    .nullable()
    .optional()
    .transform((val) => {
      if (val === null || val === undefined) return null;
      if (val instanceof Decimal) return val;
      return new Decimal(val);
    }),
  currency: z.string().length(3).default('BRL'),
  payload: z.record(z.string(), z.unknown()).nullable().optional(),
});
