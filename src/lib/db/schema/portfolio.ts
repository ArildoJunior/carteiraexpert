import { sql } from 'drizzle-orm';
import { pgTable, text, timestamp, uuid, boolean, numeric, check } from 'drizzle-orm/pg-core';
import { users } from './identity';

// ─── portfolios ───────────────────────────────────────────────────────────────
// Armazena as carteiras patrimoniais pertencentes individualmente a cada usuário.
// O isolamento por usuário é garantido pelo user_id obrigatório com FK.
export const portfolios = pgTable('portfolios', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'restrict' }),
  name: text('name').notNull(),
  description: text('description'),
  baseCurrency: text('base_currency').notNull().default('BRL'),
  // 'active' | 'archived'
  status: text('status').notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

// ─── assets ───────────────────────────────────────────────────────────────────
// Catálogo canônico de ativos. Suporta ativos globais curados pelo sistema (user_id IS NULL)
// e ativos customizados criados por um usuário específico (user_id IS NOT NULL).
export const assets = pgTable(
  'assets',
  {
    id: uuid('id').primaryKey(),
    ticker: text('ticker').notNull(),
    name: text('name').notNull(),
    // 'stock' | 'fii' | 'etf' | 'bdr' | 'crypto' | 'international_stock' | 'option' | 'currency' | 'custom'
    assetType: text('asset_type').notNull(),
    // 'B3' | 'NYSE' | 'NASDAQ' | 'CRYPTO' | 'CUSTOM'
    market: text('market').notNull().default('B3'),
    currency: text('currency').notNull().default('BRL'),
    isCustom: boolean('is_custom').notNull().default(false),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'chk_assets_custom_user',
      sql`(${table.isCustom} = false AND ${table.userId} IS NULL) OR (${table.isCustom} = true AND ${table.userId} IS NOT NULL)`
    ),
  ]
);

// ─── portfolio_events ─────────────────────────────────────────────────────────
// Fatos históricos financeiros e operacionais imutáveis vinculados a uma carteira.
// Quantidades e valores monetários utilizam obrigatoriamente NUMERIC no PostgreSQL.
export const portfolioEvents = pgTable(
  'portfolio_events',
  {
    id: uuid('id').primaryKey(),
    portfolioId: uuid('portfolio_id')
      .notNull()
      .references(() => portfolios.id, { onDelete: 'restrict' }),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'restrict' }),
    // 'BUY' | 'SELL' | 'TRANSFER_IN' | 'TRANSFER_OUT' | 'MANUAL_ADJUSTMENT' | 'REVERSAL'
    type: text('type').notNull(),
    direction: text('direction'), // 'IN' | 'OUT' for MANUAL_ADJUSTMENT
    tradeDate: timestamp('trade_date', { withTimezone: true }).notNull(),
    settlementDate: timestamp('settlement_date', { withTimezone: true }),
    quantity: numeric('quantity', { precision: 28, scale: 10 }).notNull(),
    unitPrice: numeric('unit_price', { precision: 20, scale: 8 }).notNull(),
    fees: numeric('fees', { precision: 20, scale: 8 }).notNull().default('0.00000000'),
    currency: text('currency').notNull().default('BRL'),
    notes: text('notes'),
    source: text('source').notNull().default('manual'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    cancellationReason: text('cancellation_reason'),
  },
  (table) => [
    check('chk_portfolio_events_quantity', sql`${table.quantity} > 0`),
    check('chk_portfolio_events_unit_price', sql`${table.unitPrice} >= 0`),
    check('chk_portfolio_events_fees', sql`${table.fees} >= 0`),
    check('chk_portfolio_events_direction', sql`(${table.type} = 'MANUAL_ADJUSTMENT' AND ${table.direction} IS NOT NULL AND ${table.direction} IN ('IN', 'OUT')) OR (${table.type} <> 'MANUAL_ADJUSTMENT' AND ${table.direction} IS NULL)`),
  ]
);
