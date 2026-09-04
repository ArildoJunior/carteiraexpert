import { sql, relations } from 'drizzle-orm';
import { pgTable, text, timestamp, uuid, numeric, check, index } from 'drizzle-orm/pg-core';
import { portfolios, portfolioEvents } from './portfolio';

// ─── cash_accounts ───────────────────────────────────────────────────────────
// Contas de caixa monetário vinculadas a uma carteira específica.
// O isolamento por carteira garante que o caixa pertença estritamente à carteira associada.
export const cashAccounts = pgTable(
  'cash_accounts',
  {
    id: uuid('id').primaryKey(),
    portfolioId: uuid('portfolio_id')
      .notNull()
      .references(() => portfolios.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    currency: text('currency').notNull().default('BRL'),
    // 'active' | 'archived'
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    check(
      'chk_cash_accounts_status',
      sql`${table.status} IN ('active', 'archived')`
    ),
    index('idx_cash_accounts_portfolio_id')
      .on(table.portfolioId)
      .where(sql`${table.deletedAt} IS NULL`),
  ]
);

// ─── cash_transactions ───────────────────────────────────────────────────────
// Movimentações financeiras de caixa (depósitos e retiradas) em moeda nativa.
// Os valores monetários utilizam obrigatoriamente NUMERIC(20, 8).
export const cashTransactions = pgTable(
  'cash_transactions',
  {
    id: uuid('id').primaryKey(),
    cashAccountId: uuid('cash_account_id')
      .notNull()
      .references(() => cashAccounts.id, { onDelete: 'cascade' }),
    // 'DEPOSIT' | 'WITHDRAWAL'
    type: text('type').notNull(),
    amount: numeric('amount', { precision: 20, scale: 8 }).notNull(),
    transactionDate: timestamp('transaction_date', { withTimezone: true }).notNull(),
    description: text('description'),
    portfolioEventId: uuid('portfolio_event_id')
      .references(() => portfolioEvents.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'chk_cash_transactions_type',
      sql`${table.type} IN ('DEPOSIT', 'WITHDRAWAL')`
    ),
    check('chk_cash_transactions_amount', sql`${table.amount} > 0`),
    index('idx_cash_transactions_account_date')
      .on(table.cashAccountId, table.transactionDate),
  ]
);

// ─── Relações Drizzle ────────────────────────────────────────────────────────
export const cashAccountsRelations = relations(cashAccounts, ({ one, many }) => ({
  portfolio: one(portfolios, {
    fields: [cashAccounts.portfolioId],
    references: [portfolios.id],
  }),
  transactions: many(cashTransactions),
}));

export const cashTransactionsRelations = relations(cashTransactions, ({ one }) => ({
  account: one(cashAccounts, {
    fields: [cashTransactions.cashAccountId],
    references: [cashAccounts.id],
  }),
  portfolioEvent: one(portfolioEvents, {
    fields: [cashTransactions.portfolioEventId],
    references: [portfolioEvents.id],
  }),
}));
