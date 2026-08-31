import { sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  timestamp,
  uuid,
  numeric,
  integer,
  boolean,
  check,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { users } from './identity';
import { assets } from './portfolio';

// ─── asset_fundamentals ───────────────────────────────────────────────────────
// Demonstrações financeiras e dados fundamentais reportados por ativo e período.
// Base factual para análise e cálculo determinístico de indicadores contábeis e múltiplos.
export const assetFundamentals = pgTable(
  'asset_fundamentals',
  {
    id: uuid('id').primaryKey(),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'restrict' }),

    // Identificação do Período Contábil
    referencePeriod: text('reference_period').notNull(), // ex: '2025-4Q', '2025-FY', '2025-TTM'
    periodType: text('period_type').notNull(), // 'annual' | 'quarterly' | 'ttm'
    statementType: text('statement_type').notNull().default('CONSOLIDATED'), // 'CONSOLIDATED' | 'INDIVIDUAL'
    referenceDate: timestamp('reference_date', { withTimezone: true }).notNull(), // Data-base contábil (ex: 2025-12-31)
    filingDate: timestamp('filing_date', { withTimezone: true }), // Data do protocolo na CVM/B3

    // Proveniência, Rastreabilidade e Versionamento
    source: text('source').notNull().default('cvm'), // 'cvm' | 'b3' | 'manual' | 'internal'
    sourceReference: text('source_reference'), // Protocolo ITR/DFP ou identificador único do documento-fonte
    version: integer('version').notNull().default(1), // Versão do reporte contábil
    isRestated: boolean('is_restated').notNull().default(false), // Flag indicando retificação/reapresentação

    currency: text('currency').notNull().default('BRL'),

    // Fatos Contábeis Brutos Reportados (NUMERIC(20, 4) para moeda base, NUMERIC(28, 10) para ações)
    netRevenue: numeric('net_revenue', { precision: 20, scale: 4 }), // Receita Líquida
    ebitda: numeric('ebitda', { precision: 20, scale: 4 }),          // EBITDA
    netIncome: numeric('net_income', { precision: 20, scale: 4 }),    // Lucro Líquido
    totalEquity: numeric('total_equity', { precision: 20, scale: 4 }),// Patrimônio Líquido
    totalAssets: numeric('total_assets', { precision: 20, scale: 4 }),// Ativo Total
    grossDebt: numeric('gross_debt', { precision: 20, scale: 4 }),    // Dívida Bruta
    cashEquivalents: numeric('cash_equivalents', { precision: 20, scale: 4 }), // Caixa e Equivalentes de Caixa
    sharesCount: numeric('shares_count', { precision: 28, scale: 10 }),// Total de Ações emitidas
    dividendsDeclared: numeric('dividends_declared', { precision: 20, scale: 4 }), // Proventos brutos declarados (Dividendos + JCP)

    notes: text('notes'),

    // createdBy opcional para permitir ingestão pública desacoplada de sessão de usuário
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_asset_fundamentals_asset_id').on(table.assetId),
    index('idx_asset_fundamentals_ref_date').on(table.referenceDate),
    unique('uq_asset_fundamentals_versioning').on(
      table.assetId,
      table.referencePeriod,
      table.periodType,
      table.statementType,
      table.source,
      table.version
    ),
    check(
      'chk_asset_fundamentals_period_type',
      sql`${table.periodType} IN ('annual', 'quarterly', 'ttm')`
    ),
    check(
      'chk_asset_fundamentals_stmt_type',
      sql`${table.statementType} IN ('CONSOLIDATED', 'INDIVIDUAL')`
    ),
    check(
      'chk_asset_fundamentals_shares_count',
      sql`${table.sharesCount} IS NULL OR ${table.sharesCount} > 0`
    ),
    check(
      'chk_asset_fundamentals_dividends_declared',
      sql`${table.dividendsDeclared} IS NULL OR ${table.dividendsDeclared} >= 0`
    ),
    check('chk_asset_fundamentals_version', sql`${table.version} >= 1`),
  ]
);
