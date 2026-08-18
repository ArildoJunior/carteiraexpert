import { sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  timestamp,
  uuid,
  numeric,
  check,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { users } from './identity';
import { assets } from './portfolio';

// ─── market_quotes ───────────────────────────────────────────────────────────
// Cotações históricas e diárias de ativos armazenadas no banco interno.
// Permite que as consultas da plataforma sejam 100% atendidas pelo banco local
// sem dependência síncrona de provedores externos durante o carregamento de tela.
export const marketQuotes = pgTable(
  'market_quotes',
  {
    id: uuid('id').primaryKey(),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'restrict' }),
    price: numeric('price', { precision: 20, scale: 8 }).notNull(),
    currency: text('currency').notNull().default('BRL'),
    quoteDate: timestamp('quote_date', { withTimezone: true }).notNull(),
    source: text('source').notNull().default('internal'),
    // 'realtime' | 'delayed_15m' | 'eod' | 'manual' | 'unknown'
    delayStatus: text('delay_status').notNull().default('eod'),
    notes: text('notes'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_market_quotes_asset_id').on(table.assetId),
    index('idx_market_quotes_quote_date').on(table.quoteDate),
    unique('uq_market_quotes_asset_date').on(table.assetId, table.quoteDate),
    check('chk_market_quotes_price', sql`${table.price} >= 0`),
  ]
);

// ─── exchange_rates ───────────────────────────────────────────────────────────
// Taxas de câmbio históricas e diárias para conversão patrimonial consolidada.
// Permite avaliação em BRL de ativos cotados em USD, EUR, etc.
export const exchangeRates = pgTable(
  'exchange_rates',
  {
    id: uuid('id').primaryKey(),
    fromCurrency: text('from_currency').notNull(),
    toCurrency: text('to_currency').notNull().default('BRL'),
    rate: numeric('rate', { precision: 20, scale: 8 }).notNull(),
    rateDate: timestamp('rate_date', { withTimezone: true }).notNull(),
    source: text('source').notNull().default('internal'),
    // 'realtime' | 'delayed_15m' | 'eod' | 'manual' | 'unknown'
    delayStatus: text('delay_status').notNull().default('eod'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_exchange_rates_from_to').on(table.fromCurrency, table.toCurrency),
    index('idx_exchange_rates_rate_date').on(table.rateDate),
    unique('uq_exchange_rates_pair_date').on(
      table.fromCurrency,
      table.toCurrency,
      table.rateDate
    ),
    check('chk_exchange_rates_rate', sql`${table.rate} > 0`),
  ]
);
