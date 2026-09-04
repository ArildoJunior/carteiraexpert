import { sql, relations } from 'drizzle-orm';
import { pgTable, text, timestamp, uuid, check, index } from 'drizzle-orm/pg-core';
import { portfolios, portfolioEvents } from './portfolio';
import { cashAccounts } from './cash';

// ─── custody_institutions ───────────────────────────────────────────────────
// Catálogo canônico de instituições de custódia (corretoras, bancos de investimento e exchanges).
export const custodyInstitutions = pgTable(
  'custody_institutions',
  {
    id: uuid('id').primaryKey(),
    name: text('name').notNull(),
    code: text('code').unique(),
    country: text('country').notNull().default('BR'),
    // 'active' | 'inactive'
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      'chk_custody_institutions_status',
      sql`${table.status} IN ('active', 'inactive')`
    ),
  ]
);

// ─── custody_accounts ───────────────────────────────────────────────────────
// Contas de custódia do usuário vinculadas formalmente a uma carteira patrimonial.
export const custodyAccounts = pgTable(
  'custody_accounts',
  {
    id: uuid('id').primaryKey(),
    portfolioId: uuid('portfolio_id')
      .notNull()
      .references(() => portfolios.id, { onDelete: 'cascade' }),
    institutionId: uuid('institution_id')
      .notNull()
      .references(() => custodyInstitutions.id, { onDelete: 'restrict' }),
    name: text('name').notNull(),
    accountNumber: text('account_number'),
    // 'active' | 'archived'
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    check(
      'chk_custody_accounts_status',
      sql`${table.status} IN ('active', 'archived')`
    ),
    index('idx_custody_accounts_portfolio_id')
      .on(table.portfolioId)
      .where(sql`${table.deletedAt} IS NULL`),
    index('idx_custody_accounts_institution_id').on(table.institutionId),
  ]
);

// ─── Relações Drizzle ────────────────────────────────────────────────────────
export const custodyInstitutionsRelations = relations(custodyInstitutions, ({ many }) => ({
  accounts: many(custodyAccounts),
}));

export const custodyAccountsRelations = relations(custodyAccounts, ({ one, many }) => ({
  institution: one(custodyInstitutions, {
    fields: [custodyAccounts.institutionId],
    references: [custodyInstitutions.id],
  }),
  portfolio: one(portfolios, {
    fields: [custodyAccounts.portfolioId],
    references: [portfolios.id],
  }),
  portfolioEvents: many(portfolioEvents),
  cashAccounts: many(cashAccounts),
}));
