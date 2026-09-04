import { sql, relations } from 'drizzle-orm';
import { pgTable, text, timestamp, uuid, numeric, check, index, date } from 'drizzle-orm/pg-core';
import { users } from './identity';
import { portfolios, assets } from './portfolio';
import { custodyAccounts } from './custody';

// ─── options_contracts ───────────────────────────────────────────────────────
// Registro de contratos de opções do usuário para controle, acompanhamento,
// cálculo de gregas informativas (Black-Scholes), curvas de payoff e alertas de vencimento B3.
export const optionsContracts = pgTable(
  'options_contracts',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    portfolioId: uuid('portfolio_id')
      .notNull()
      .references(() => portfolios.id, { onDelete: 'cascade' }),
    underlyingAssetId: uuid('underlying_asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'restrict' }),
    custodyAccountId: uuid('custody_account_id')
      .references(() => custodyAccounts.id, { onDelete: 'set null' }),
    // Código de negociação ou ticker de identificação (ex: 'PETRH380')
    ticker: text('ticker').notNull(),
    // Tipo: 'CALL' | 'PUT'
    optionType: text('option_type').notNull(),
    // Estilo descritivo: 'AMERICAN' | 'EUROPEAN'
    optionStyle: text('option_style').notNull().default('AMERICAN'),
    // Direção da posição: 'BUY' (Titular / Comprada) | 'SELL' (Lançador / Vendida)
    direction: text('direction').notNull(),
    // Preço de exercício da opção
    strikePrice: numeric('strike_price', { precision: 20, scale: 8 }).notNull(),
    // Prêmio unitário pago (se BUY) ou recebido (se SELL)
    premiumPaidReceived: numeric('premium_paid_received', { precision: 20, scale: 8 }).notNull(),
    // Quantidade de opções do contrato
    quantity: numeric('quantity', { precision: 20, scale: 8 }).notNull(),
    // Data de vencimento no formato YYYY-MM-DD
    expirationDate: date('expiration_date', { mode: 'string' }).notNull(),
    // Status operacional: 'OPEN' | 'CLOSED' | 'EXPIRED'
    status: text('status').notNull().default('OPEN'),
    // Anotações operacionais do usuário
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    check(
      'chk_options_contracts_type',
      sql`${table.optionType} IN ('CALL', 'PUT')`
    ),
    check(
      'chk_options_contracts_style',
      sql`${table.optionStyle} IN ('AMERICAN', 'EUROPEAN')`
    ),
    check(
      'chk_options_contracts_direction',
      sql`${table.direction} IN ('BUY', 'SELL')`
    ),
    check(
      'chk_options_contracts_status',
      sql`${table.status} IN ('OPEN', 'CLOSED', 'EXPIRED')`
    ),
    check('chk_options_contracts_strike', sql`${table.strikePrice} > 0`),
    check('chk_options_contracts_premium', sql`${table.premiumPaidReceived} >= 0`),
    check('chk_options_contracts_quantity', sql`${table.quantity} > 0`),
    index('idx_options_contracts_user_id').on(table.userId),
    index('idx_options_contracts_portfolio_id')
      .on(table.portfolioId)
      .where(sql`${table.deletedAt} IS NULL`),
    index('idx_options_contracts_underlying_asset_id').on(table.underlyingAssetId),
    index('idx_options_contracts_custody_account_id').on(table.custodyAccountId),
    index('idx_options_contracts_expiration_date').on(table.expirationDate),
  ]
);

// ─── Relações Drizzle ────────────────────────────────────────────────────────
export const optionsContractsRelations = relations(optionsContracts, ({ one }) => ({
  user: one(users, {
    fields: [optionsContracts.userId],
    references: [users.id],
  }),
  portfolio: one(portfolios, {
    fields: [optionsContracts.portfolioId],
    references: [portfolios.id],
  }),
  underlyingAsset: one(assets, {
    fields: [optionsContracts.underlyingAssetId],
    references: [assets.id],
  }),
  custodyAccount: one(custodyAccounts, {
    fields: [optionsContracts.custodyAccountId],
    references: [custodyAccounts.id],
  }),
}));
