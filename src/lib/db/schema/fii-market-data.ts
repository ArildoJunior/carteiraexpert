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
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { assets } from './portfolio';

// ─── cvm_fii_registry ─────────────────────────────────────────────────────────
// Entidade regulatória CVM independente. Preserva 100% dos fundos imobiliários
// registrados na CVM identificados unicamente por CNPJ (14 dígitos numéricos).
export const cvmFiiRegistry = pgTable(
  'cvm_fii_registry',
  {
    id: uuid('id').primaryKey(),
    cnpj: text('cnpj').notNull(), // CNPJ normalizado com 14 dígitos numéricos
    legalName: text('legal_name').notNull(), // Razão social oficial na CVM
    tradeName: text('trade_name'), // Denominação comercial / Nome Fantasia
    ticker: text('ticker'), // Ticker B3 referenciado (quando aplicável)
    isin: text('isin'), // Código ISIN oficial (sem unique: múltiplos fundos/classes podem compartilhar)
    source: text('source').notNull().default('cvm'),
    sourceUpdatedAt: timestamp('source_updated_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('uq_cvm_fii_registry_cnpj').on(table.cnpj),
    index('idx_cvm_fii_registry_ticker').on(table.ticker),
    index('idx_cvm_fii_registry_isin').on(table.isin),
    check('chk_cvm_fii_registry_cnpj_len', sql`length(${table.cnpj}) = 14`),
  ]
);

// ─── cvm_fii_bindings ─────────────────────────────────────────────────────────
// De-Para explícito, controlado e auditável entre Fundos CVM e Ativos do Catálogo B3.
// Garante isolamento estrito: apenas um vínculo APPROVED é permitido por ativo B3.
export const cvmFiiBindings = pgTable(
  'cvm_fii_bindings',
  {
    id: uuid('id').primaryKey(),
    fiiRegistryId: uuid('fii_registry_id')
      .notNull()
      .references(() => cvmFiiRegistry.id, { onDelete: 'restrict' }),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'restrict' }),
    bindingStatus: text('binding_status').notNull().default('PENDING_REVIEW'), // 'APPROVED' | 'PENDING_REVIEW' | 'AMBIGUOUS' | 'REJECTED'
    bindingMethod: text('binding_method').notNull().default('MANUAL'), // 'CANONICAL_DE_PARA' | 'EXACT_ISIN' | 'ISIN_TICKER_ROOT' | 'MANUAL'
    confidenceLevel: text('confidence_level').notNull().default('MEDIUM'), // 'HIGH' | 'MEDIUM' | 'LOW'
    justification: text('justification'),
    source: text('source').notNull().default('cvm'),
    sourceUpdatedAt: timestamp('source_updated_at', { withTimezone: true }),
    reviewedBy: uuid('reviewed_by'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('uq_cvm_fii_bindings_pair').on(table.fiiRegistryId, table.assetId),
    uniqueIndex('uq_cvm_fii_bindings_single_active_approved')
      .on(table.assetId)
      .where(sql`${table.bindingStatus} = 'APPROVED'`),
    uniqueIndex('uq_cvm_fii_bindings_single_approved_registry')
      .on(table.fiiRegistryId)
      .where(sql`${table.bindingStatus} = 'APPROVED'`),
    index('idx_cvm_fii_bindings_asset_id').on(table.assetId),
    index('idx_cvm_fii_bindings_registry_id').on(table.fiiRegistryId),
    index('idx_cvm_fii_bindings_status').on(table.bindingStatus),
    check(
      'chk_cvm_fii_bindings_status',
      sql`${table.bindingStatus} IN ('APPROVED', 'PENDING_REVIEW', 'AMBIGUOUS', 'REJECTED')`
    ),
    check(
      'chk_cvm_fii_bindings_method',
      sql`${table.bindingMethod} IN ('CANONICAL_DE_PARA', 'EXACT_ISIN', 'ISIN_TICKER_ROOT', 'MANUAL')`
    ),
    check(
      'chk_cvm_fii_bindings_confidence',
      sql`${table.confidenceLevel} IN ('HIGH', 'MEDIUM', 'LOW')`
    ),
  ]
);

// ─── fii_monthly_fundamentals ─────────────────────────────────────────────────
// Demonstrações mensais e dados patrimoniais de FIIs reportados à CVM (inf_mensal_fii).
// Identificada unicamente pela entidade CVM (fii_registry_id), competência, versão e fonte,
// blindando o motor financeiro contra sobrescrita ou mistura de dados de entidades distintas.
export const fiiMonthlyFundamentals = pgTable(
  'fii_monthly_fundamentals',
  {
    id: uuid('id').primaryKey(),
    fiiRegistryId: uuid('fii_registry_id')
      .notNull()
      .references(() => cvmFiiRegistry.id, { onDelete: 'restrict' }),

    // Competência e Versão
    referenceDate: date('reference_date', { mode: 'string' }).notNull(), // Data-base contábil (ex: '2026-07-31')
    filingDate: timestamp('filing_date', { withTimezone: true }),
    version: integer('version').notNull().default(1),
    source: text('source').notNull().default('cvm_inf_mensal'),
    sourceReference: text('source_reference'),

    // Fatos Contábeis e Patrimoniais (NUMERIC determinístico para Decimal)
    netAssetValue: numeric('net_asset_value', { precision: 20, scale: 4 }), // Patrimônio Líquido Total
    quotaEquityValue: numeric('quota_equity_value', { precision: 20, scale: 8 }), // Valor Patrimonial por Cota
    issuedQuotas: numeric('issued_quotas', { precision: 28, scale: 10 }), // Quantidade de cotas emitidas

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
      table.fiiRegistryId,
      table.referenceDate,
      table.version,
      table.source
    ),
    index('idx_fii_monthly_fundamentals_registry_id').on(table.fiiRegistryId),
    index('idx_fii_monthly_fundamentals_ref_date').on(table.referenceDate),
    index('idx_fii_monthly_fundamentals_reg_ref_date').on(table.fiiRegistryId, table.referenceDate),
    index('idx_fii_monthly_fundamentals_latest').on(
      table.fiiRegistryId,
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
