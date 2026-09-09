import { sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  timestamp,
  date,
  uuid,
  numeric,
  integer,
  check,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { assets } from './portfolio';

// ─── cvm_fii_registry ─────────────────────────────────────────────────────────
// Cadastro e de-para oficial de FIIs registrados na CVM (resolução CNPJ <-> asset_id).
// Garante identificação canônica unívoca por CNPJ e por ativo no catálogo.
export const cvmFiiRegistry = pgTable(
  'cvm_fii_registry',
  {
    id: uuid('id').primaryKey(),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'restrict' }),
    cnpj: text('cnpj').notNull(), // CNPJ normalizado com 14 dígitos numéricos
    legalName: text('legal_name').notNull(), // Razão social oficial na CVM
    ticker: text('ticker'), // Ticker B3 quando disponível (ex: 'HGLG11')
    isin: text('isin'), // Código ISIN oficial quando disponível
    source: text('source').notNull().default('cvm'),
    sourceUpdatedAt: timestamp('source_updated_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('uq_cvm_fii_registry_asset_id').on(table.assetId),
    unique('uq_cvm_fii_registry_cnpj').on(table.cnpj),
    index('idx_cvm_fii_registry_ticker').on(table.ticker),
    index('idx_cvm_fii_registry_isin').on(table.isin),
    check('chk_cvm_fii_registry_cnpj_len', sql`length(${table.cnpj}) = 14`),
  ]
);

// ─── fii_monthly_fundamentals ─────────────────────────────────────────────────
// Demonstrações mensais e dados patrimoniais de FIIs reportados à CVM (inf_mensal_fii).
// Base contábil oficial para cálculo determinístico de P/VP, ágio/desconto e yields.
export const fiiMonthlyFundamentals = pgTable(
  'fii_monthly_fundamentals',
  {
    id: uuid('id').primaryKey(),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'restrict' }),

    // Competência e Versão
    referenceDate: date('reference_date', { mode: 'string' }).notNull(), // Data-base contábil (ex: '2026-07-31')
    filingDate: timestamp('filing_date', { withTimezone: true }),
    version: integer('version').notNull().default(1),
    source: text('source').notNull().default('cvm_inf_mensal'),
    sourceReference: text('source_reference'),

    // Fatos Contábeis e Patrimoniais (NUMERIC determinístico para Decimal)
    netAssetValue: numeric('net_asset_value', { precision: 20, scale: 4 }), // Patrimônio Líquido Total (nullable para informes atípicos/pré-operacionais)
    quotaEquityValue: numeric('quota_equity_value', { precision: 20, scale: 8 }), // Valor Patrimonial por Cota (nullable)
    issuedQuotas: numeric('issued_quotas', { precision: 28, scale: 10 }), // Quantidade de cotas emitidas (nullable)

    // Recursos e Passivos
    totalAssets: numeric('total_assets', { precision: 20, scale: 4 }),
    totalLiabilities: numeric('total_liabilities', { precision: 20, scale: 4 }),
    cashEquivalents: numeric('cash_equivalents', { precision: 20, scale: 4 }),

    // Proventos do Período
    dividendDeclaredPerQuota: numeric('dividend_declared_per_quota', { precision: 20, scale: 8 }),

    // Cotistas
    investorsCount: integer('investors_count'),
    individualInvestorsCount: integer('individual_investors_count'),

    // Auditoria
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('uq_fii_monthly_fundamentals_versioning').on(
      table.assetId,
      table.referenceDate,
      table.version,
      table.source
    ),
    index('idx_fii_monthly_fundamentals_asset_id').on(table.assetId),
    index('idx_fii_monthly_fundamentals_ref_date').on(table.referenceDate),
    index('idx_fii_monthly_fundamentals_asset_ref_date').on(table.assetId, table.referenceDate),
    index('idx_fii_monthly_fundamentals_latest').on(
      table.assetId,
      table.referenceDate.desc(),
      table.version.desc()
    ),
    check('chk_fii_monthly_fundamentals_version', sql`${table.version} >= 1`),
    check(
      'chk_fii_monthly_fundamentals_issued_quotas',
      sql`${table.issuedQuotas} IS NULL OR ${table.issuedQuotas} >= 0`
    ),
    check(
      'chk_fii_monthly_fundamentals_dividend_declared',
      sql`${table.dividendDeclaredPerQuota} IS NULL OR ${table.dividendDeclaredPerQuota} >= 0`
    ),
    check(
      'chk_fii_monthly_fundamentals_investors_count',
      sql`${table.investorsCount} IS NULL OR ${table.investorsCount} >= 0`
    ),
    check(
      'chk_fii_monthly_fundamentals_individual_investors',
      sql`${table.individualInvestorsCount} IS NULL OR ${table.individualInvestorsCount} >= 0`
    ),
  ]
);
