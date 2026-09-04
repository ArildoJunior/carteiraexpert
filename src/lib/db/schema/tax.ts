import { sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  timestamp,
  uuid,
  numeric,
  integer,
  check,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { users } from './identity';
import { portfolios } from './portfolio';

// ─── tax_calculation_runs ───────────────────────────────────────────────────
// Registra as execuções do motor de apuração fiscal pelo usuário.
// Permite auditoria, rastreabilidade e reprocessamento idempotente sem concorrência.
export const taxCalculationRuns = pgTable(
  'tax_calculation_runs',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    portfolioId: uuid('portfolio_id').references(() => portfolios.id, {
      onDelete: 'set null',
    }),
    referenceYear: integer('reference_year').notNull(),
    referenceMonth: integer('reference_month'), // 1..12 ou NULL para ano completo
    // 'RUNNING' | 'COMPLETED' | 'FAILED'
    status: text('status').notNull().default('RUNNING'),
    errorMessage: text('error_message'),
    generatedAt: timestamp('generated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_tax_calculation_runs_user_id').on(table.userId),
    index('idx_tax_calculation_runs_user_year').on(table.userId, table.referenceYear),
    check(
      'chk_tax_calculation_runs_status',
      sql`${table.status} IN ('RUNNING', 'COMPLETED', 'FAILED')`
    ),
    check(
      'chk_tax_calculation_runs_month',
      sql`${table.referenceMonth} IS NULL OR (${table.referenceMonth} >= 1 AND ${table.referenceMonth} <= 12)`
    ),
  ]
);

// ─── tax_monthly_summaries ──────────────────────────────────────────────────
// Armazena o resultado fiscal consolidado apurado por usuário, carteira, ano e mês.
export const taxMonthlySummaries = pgTable(
  'tax_monthly_summaries',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    portfolioId: uuid('portfolio_id').references(() => portfolios.id, {
      onDelete: 'cascade',
    }),
    year: integer('year').notNull(),
    month: integer('month').notNull(),
    totalSales: numeric('total_sales', { precision: 28, scale: 10 }).notNull(),
    totalProceeds: numeric('total_proceeds', { precision: 28, scale: 10 }).notNull(),
    totalCost: numeric('total_cost', { precision: 28, scale: 10 }).notNull(),
    netGainLoss: numeric('net_gain_loss', { precision: 28, scale: 10 }).notNull(),
    // 'EXEMPT' | 'TAXABLE'
    exemptThresholdStatus: text('exempt_threshold_status').notNull(),
    applicableRate: numeric('applicable_rate', { precision: 20, scale: 8 }).notNull(),
    estimatedTax: numeric('estimated_tax', { precision: 28, scale: 10 }).notNull(),
    accumulatedLossCompensated: numeric('accumulated_loss_compensated', {
      precision: 28,
      scale: 10,
    })
      .notNull()
      .default('0.0000000000'),
    generatedAt: timestamp('generated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_tax_monthly_summaries_user_id').on(table.userId),
    index('idx_tax_monthly_summaries_user_year').on(table.userId, table.year),
    unique('uq_tax_monthly_summaries_portfolio').on(
      table.userId,
      table.portfolioId,
      table.year,
      table.month
    ),
    check(
      'chk_tax_monthly_summaries_month',
      sql`${table.month} >= 1 AND ${table.month} <= 12`
    ),
    check(
      'chk_tax_monthly_summaries_status',
      sql`${table.exemptThresholdStatus} IN ('EXEMPT', 'TAXABLE')`
    ),
  ]
);

// ─── tax_loss_credits ───────────────────────────────────────────────────────
// Registra créditos de prejuízo acumulados apurados em meses tributáveis.
// Podem ser compensados com ganhos de meses subsequentes por até 5 anos-calendário.
export const taxLossCredits = pgTable(
  'tax_loss_credits',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    year: integer('year').notNull(),
    monthOrigin: integer('month_origin').notNull(),
    assetSymbol: text('asset_symbol').notNull(),
    originalLossAmount: numeric('original_loss_amount', {
      precision: 28,
      scale: 10,
    }).notNull(),
    remainingAmount: numeric('remaining_amount', {
      precision: 28,
      scale: 10,
    }).notNull(),
    expiresOn: timestamp('expires_on', { withTimezone: true }).notNull(),
  },
  (table) => [
    index('idx_tax_loss_credits_user_id').on(table.userId),
    unique('uq_tax_loss_credits_origin').on(
      table.userId,
      table.year,
      table.monthOrigin,
      table.assetSymbol
    ),
    check(
      'chk_tax_loss_credits_month',
      sql`${table.monthOrigin} >= 1 AND ${table.monthOrigin} <= 12`
    ),
    check(
      'chk_tax_loss_credits_remaining',
      sql`${table.remainingAmount} >= 0 AND ${table.remainingAmount} <= ${table.originalLossAmount}`
    ),
  ]
);
