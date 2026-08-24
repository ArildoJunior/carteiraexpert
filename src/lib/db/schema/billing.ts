import { sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  timestamp,
  uuid,
  boolean,
  numeric,
  check,
  uniqueIndex,
  index,
  jsonb,
} from 'drizzle-orm/pg-core';
import { users } from './identity';
import { commercialPlans } from './plans';

// ─── billing_subscriptions ───────────────────────────────────────────────────
// Representa o ciclo de vida e estado contratual de assinaturas pagas.
// Desacoplado de gateways específicos (Stripe, Asaas, etc.).
export const billingSubscriptions = pgTable(
  'billing_subscriptions',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    planId: text('plan_id')
      .notNull()
      .references(() => commercialPlans.id, { onDelete: 'restrict' }),
    // 'incomplete' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid'
    status: text('status').notNull().default('active'),
    // 'monthly' | 'yearly' | 'custom'
    billingCycle: text('billing_cycle').notNull().default('monthly'),
    currentPeriodStart: timestamp('current_period_start', { withTimezone: true }).notNull(),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }).notNull(),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
    canceledAt: timestamp('canceled_at', { withTimezone: true }),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    gracePeriodEndsAt: timestamp('grace_period_ends_at', { withTimezone: true }),
    provider: text('provider').notNull().default('internal'),
    providerSubscriptionId: text('provider_subscription_id'),
    providerCustomerId: text('provider_customer_id'),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'chk_billing_subscriptions_status',
      sql`${table.status} IN ('incomplete', 'trialing', 'active', 'past_due', 'canceled', 'unpaid')`
    ),
    check(
      'chk_billing_subscriptions_cycle',
      sql`${table.billingCycle} IN ('monthly', 'yearly', 'custom')`
    ),
    index('idx_billing_subscriptions_user_id').on(table.userId),
    index('idx_billing_subscriptions_provider_sub_id').on(table.providerSubscriptionId),
  ]
);

// ─── payment_events ───────────────────────────────────────────────────────────
// Registro estruturado e auditável de eventos de faturamento/pagamento recebidos.
// Garante idempotência estrita via idempotency_key único.
export const paymentEvents = pgTable(
  'payment_events',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    subscriptionId: uuid('subscription_id')
      .references(() => billingSubscriptions.id, { onDelete: 'set null' }),
    idempotencyKey: text('idempotency_key')
      .notNull()
      .unique('uq_payment_events_idempotency_key'),
    eventType: text('event_type').notNull(),
    provider: text('provider').notNull().default('internal'),
    providerEventId: text('provider_event_id'),
    amount: numeric('amount', { precision: 18, scale: 4 }),
    currency: text('currency').notNull().default('BRL'),
    // 'received' | 'processed' | 'failed' | 'ignored'
    status: text('status').notNull().default('received'),
    payload: jsonb('payload'),
    errorMessage: text('error_message'),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'chk_payment_events_status',
      sql`${table.status} IN ('received', 'processed', 'failed', 'ignored')`
    ),
    index('idx_payment_events_user_id').on(table.userId),
    index('idx_payment_events_sub_id').on(table.subscriptionId),
  ]
);
