import { sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  timestamp,
  uuid,
  boolean,
  numeric,
  integer,
  jsonb,
  check,
  index,
} from 'drizzle-orm/pg-core';
import { users } from './identity';
import { portfolios, assets, portfolioEvents } from './portfolio';

// ─── import_batches ───────────────────────────────────────────────────────────
// Lotes de importação de arquivos enviados pelos usuários.
// Todo lote pertence obrigatoriamente a um usuário e a uma carteira.
export const importBatches = pgTable(
  'import_batches',
  {
    id: uuid('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    portfolioId: uuid('portfolio_id')
      .notNull()
      .references(() => portfolios.id, { onDelete: 'restrict' }),
    fileName: text('file_name').notNull(),
    fileSize: integer('file_size').notNull(),
    fileFormat: text('file_format').notNull(), // 'carteiraexpert_csv' | 'b3_trades_csv' | 'b3_movements_csv'
    status: text('status').notNull().default('pending_review'), // 'pending_review' | 'confirmed' | 'rejected' | 'failed'
    totalRecords: integer('total_records').notNull().default(0),
    validRecords: integer('valid_records').notNull().default(0),
    warningRecords: integer('warning_records').notNull().default(0),
    errorRecords: integer('error_records').notNull().default(0),
    rawContentHash: text('raw_content_hash').notNull(),
    errorMessage: text('error_message'),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_import_batches_user_portfolio').on(table.userId, table.portfolioId),
    index('idx_import_batches_hash').on(table.userId, table.portfolioId, table.rawContentHash),
    check(
      'chk_import_batches_status',
      sql`${table.status} IN ('pending_review', 'confirmed', 'rejected', 'failed')`
    ),
    check('chk_import_batches_file_size', sql`${table.fileSize} > 0`),
    check('chk_import_batches_total_records', sql`${table.totalRecords} >= 0`),
  ]
);

// ─── import_batch_items ───────────────────────────────────────────────────────
// Linhas individuais extraídas do lote. Mantém status, erros e opções de edição/exclusão.
export const importBatchItems = pgTable(
  'import_batch_items',
  {
    id: uuid('id').primaryKey(),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => importBatches.id, { onDelete: 'cascade' }),
    lineNumber: integer('line_number').notNull(),
    rawLine: text('raw_line').notNull(),
    status: text('status').notNull(), // 'valid' | 'warning' | 'error' | 'duplicate' | 'ignored'
    actionType: text('action_type').notNull(), // 'BUY' | 'SELL' | 'TRANSFER_IN' | 'TRANSFER_OUT' | 'MANUAL_ADJUSTMENT'
    direction: text('direction'), // 'IN' | 'OUT' para MANUAL_ADJUSTMENT
    rawTicker: text('raw_ticker').notNull(),
    resolvedAssetId: uuid('resolved_asset_id').references(() => assets.id, {
      onDelete: 'restrict',
    }),
    tradeDate: timestamp('trade_date', { withTimezone: true }).notNull(),
    settlementDate: timestamp('settlement_date', { withTimezone: true }),
    quantity: numeric('quantity', { precision: 28, scale: 10 }).notNull(),
    unitPrice: numeric('unit_price', { precision: 20, scale: 8 }).notNull(),
    fees: numeric('fees', { precision: 20, scale: 8 }).notNull().default('0.00000000'),
    currency: text('currency').notNull().default('BRL'),
    notes: text('notes'),
    validationErrors: jsonb('validation_errors').notNull().default(sql`'[]'::jsonb`),
    isDuplicate: boolean('is_duplicate').notNull().default(false),
    duplicateReason: text('duplicate_reason'),
    isExcluded: boolean('is_excluded').notNull().default(false),
    importedPortfolioEventId: uuid('imported_portfolio_event_id').references(
      () => portfolioEvents.id,
      { onDelete: 'set null' }
    ),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_import_batch_items_batch_id').on(table.batchId),
    index('idx_import_batch_items_status').on(table.batchId, table.status),
    check(
      'chk_import_batch_items_status',
      sql`${table.status} IN ('valid', 'warning', 'error', 'duplicate', 'ignored')`
    ),
    check(
      'chk_import_batch_items_action_type',
      sql`${table.actionType} IN ('BUY', 'SELL', 'TRANSFER_IN', 'TRANSFER_OUT', 'MANUAL_ADJUSTMENT')`
    ),
    check('chk_import_batch_items_line_number', sql`${table.lineNumber} >= 1`),
    check('chk_import_batch_items_quantity', sql`${table.quantity} > 0`),
    check('chk_import_batch_items_unit_price', sql`${table.unitPrice} >= 0`),
    check('chk_import_batch_items_fees', sql`${table.fees} >= 0`),
    check(
      'chk_import_batch_items_direction',
      sql`(${table.actionType} = 'MANUAL_ADJUSTMENT' AND ${table.direction} IS NOT NULL AND ${table.direction} IN ('IN', 'OUT')) OR (${table.actionType} <> 'MANUAL_ADJUSTMENT' AND ${table.direction} IS NULL)`
    ),
  ]
);
