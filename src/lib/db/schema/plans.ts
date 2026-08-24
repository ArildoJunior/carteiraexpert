import { sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  timestamp,
  uuid,
  boolean,
  integer,
  check,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { users } from './identity';

// ─── commercial_plans ─────────────────────────────────────────────────────────
// Catálogo de planos comerciais do CarteiraExpert.
// A coluna max_active_portfolios é a fonte única da quota numérica de carteiras ativas.
export const commercialPlans = pgTable(
  'commercial_plans',
  {
    id: text('id').primaryKey(), // 'free' | 'pro'
    name: text('name').notNull(),
    description: text('description'),
    maxActivePortfolios: integer('max_active_portfolios'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'chk_commercial_plans_max_portfolios',
      sql`${table.maxActivePortfolios} IS NULL OR ${table.maxActivePortfolios} > 0`
    ),
  ]
);

// ─── plan_entitlements ─────────────────────────────────────────────────────────
// Permissões atômicas ou limites por feature associados a cada plano comercial.
export const planEntitlements = pgTable(
  'plan_entitlements',
  {
    id: uuid('id').primaryKey(),
    planId: text('plan_id')
      .notNull()
      .references(() => commercialPlans.id, { onDelete: 'restrict' }),
    featureCode: text('feature_code').notNull(),
    featureValue: text('feature_value').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_plan_entitlements_plan_feature').on(table.planId, table.featureCode),
  ]
);

// ─── user_plans ───────────────────────────────────────────────────────────────
// Associação vigente única entre um usuário e seu plano comercial ativo.
export const userPlans = pgTable(
  'user_plans',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: 'restrict' }),
    planId: text('plan_id')
      .notNull()
      .references(() => commercialPlans.id, { onDelete: 'restrict' }),
    // 'active' | 'cancelled' | 'past_due'
    status: text('status').notNull().default('active'),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'chk_user_plans_status',
      sql`${table.status} IN ('active', 'cancelled', 'past_due')`
    ),
  ]
);
