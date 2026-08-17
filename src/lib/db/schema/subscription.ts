import { sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  timestamp,
  uuid,
  numeric,
  check,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { users } from './identity';
import { assets, portfolios, portfolioEvents } from './portfolio';

// ─── subscription_offers ───────────────────────────────────────────────────────
// Ofertas/emissões públicas ou controladas de subscrição de ativos.
// Reúne parâmetros de vigência (datas em UTC), preço de exercício e relacionamento entre ativos.
export const subscriptionOffers = pgTable(
  'subscription_offers',
  {
    id: uuid('id').primaryKey(),
    originAssetId: uuid('origin_asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'restrict' }),
    rightAssetId: uuid('right_asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'restrict' }),
    targetAssetId: uuid('target_asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'restrict' }),
    cutOffDate: timestamp('cut_off_date', { withTimezone: true }).notNull(),
    exerciseStartDate: timestamp('exercise_start_date', { withTimezone: true }).notNull(),
    exerciseEndDate: timestamp('exercise_end_date', { withTimezone: true }).notNull(),
    exercisePrice: numeric('exercise_price', { precision: 20, scale: 8 }).notNull(),
    currency: text('currency').notNull().default('BRL'),
    notes: text('notes'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_subscription_offers_origin_asset_id').on(table.originAssetId),
    index('idx_subscription_offers_right_asset_id').on(table.rightAssetId),
    index('idx_subscription_offers_target_asset_id').on(table.targetAssetId),
    index('idx_subscription_offers_exercise_end_date').on(table.exerciseEndDate),
    check(
      'chk_subscription_offers_dates',
      sql`${table.exerciseStartDate} <= ${table.exerciseEndDate}`
    ),
    check('chk_subscription_offers_price', sql`${table.exercisePrice} >= 0`),
  ]
);

// ─── subscription_rights ───────────────────────────────────────────────────────
// Lotes de direitos de subscrição atribuídos individualmente a uma carteira.
// A quantidade atribuída é informada diretamente pelo usuário com custo contábil zero.
export const subscriptionRights = pgTable(
  'subscription_rights',
  {
    id: uuid('id').primaryKey(),
    portfolioId: uuid('portfolio_id')
      .notNull()
      .references(() => portfolios.id, { onDelete: 'restrict' }),
    offerId: uuid('offer_id')
      .notNull()
      .references(() => subscriptionOffers.id, { onDelete: 'restrict' }),
    // 'ACTIVE' | 'PARTIALLY_EXERCISED' | 'FULLY_EXERCISED' | 'EXPIRED' | 'CANCELLED'
    status: text('status').notNull().default('ACTIVE'),
    allocatedQuantity: numeric('allocated_quantity', { precision: 28, scale: 10 }).notNull(),
    exercisedQuantity: numeric('exercised_quantity', { precision: 28, scale: 10 })
      .notNull()
      .default('0.0000000000'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    cancellationReason: text('cancellation_reason'),
  },
  (table) => [
    index('idx_subscription_rights_portfolio_status').on(table.portfolioId, table.status),
    index('idx_subscription_rights_offer_id').on(table.offerId),
    check(
      'chk_subscription_rights_status',
      sql`${table.status} IN ('ACTIVE', 'PARTIALLY_EXERCISED', 'FULLY_EXERCISED', 'EXPIRED', 'CANCELLED')`
    ),
    check('chk_subscription_rights_allocated_quantity', sql`${table.allocatedQuantity} > 0`),
    check(
      'chk_subscription_rights_exercised_quantity',
      sql`${table.exercisedQuantity} >= 0 AND ${table.exercisedQuantity} <= ${table.allocatedQuantity}`
    ),
  ]
);

// ─── subscription_exercises ───────────────────────────────────────────────────
// Execuções atômicas de exercício de direitos de subscrição.
// Vincula o lote do direito ao evento BUY em portfolio_events garantindo idempotência estrita.
export const subscriptionExercises = pgTable(
  'subscription_exercises',
  {
    id: uuid('id').primaryKey(),
    subscriptionRightId: uuid('subscription_right_id')
      .notNull()
      .references(() => subscriptionRights.id, { onDelete: 'restrict' }),
    portfolioEventId: uuid('portfolio_event_id')
      .notNull()
      .references(() => portfolioEvents.id, { onDelete: 'restrict' }),
    idempotencyKey: uuid('idempotency_key').notNull(),
    exercisedQuantity: numeric('exercised_quantity', { precision: 28, scale: 10 }).notNull(),
    exercisePrice: numeric('exercise_price', { precision: 20, scale: 8 }).notNull(),
    fees: numeric('fees', { precision: 20, scale: 8 }).notNull().default('0.00000000'),
    totalCost: numeric('total_cost', { precision: 20, scale: 8 }).notNull(),
    exerciseDate: timestamp('exercise_date', { withTimezone: true }).notNull(),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('uq_subscription_exercises_idempotency').on(
      table.subscriptionRightId,
      table.idempotencyKey
    ),
    index('idx_subscription_exercises_subscription_right_id').on(table.subscriptionRightId),
    index('idx_subscription_exercises_portfolio_event_id').on(table.portfolioEventId),
    check('chk_subscription_exercises_quantity', sql`${table.exercisedQuantity} > 0`),
    check('chk_subscription_exercises_price', sql`${table.exercisePrice} >= 0`),
    check('chk_subscription_exercises_fees', sql`${table.fees} >= 0`),
    check('chk_subscription_exercises_total_cost', sql`${table.totalCost} >= 0`),
  ]
);
