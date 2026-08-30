import { sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  timestamp,
  date,
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

// ─── b3_cotahist_batches ──────────────────────────────────────────────────────
// Controle, rastreabilidade e auditoria de lotes de arquivos COTAHIST da B3.
export const b3CotahistBatches = pgTable(
  'b3_cotahist_batches',
  {
    id: uuid('id').primaryKey(),
    fileName: text('file_name').notNull(),
    fileType: text('file_type').notNull(), // 'daily' | 'annual'
    referenceDate: date('reference_date', { mode: 'string' }),
    referenceYear: integer('reference_year'),
    fileSize: integer('file_size').notNull(),
    sha256: text('sha256').notNull().unique(),
    storagePath: text('storage_path').notNull(),
    // 'RECEIVED' | 'VALIDATING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'DUPLICATE'
    status: text('status').notNull().default('RECEIVED'),
    parserName: text('parser_name').notNull().default('CotahistFixedLengthParser'),
    parserVersion: text('parser_version').notNull().default('1.0.0'),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    errorMessage: text('error_message'),
    totalLines: integer('total_lines').notNull().default(0),
    headerCount: integer('header_count').notNull().default(0),
    quoteCount: integer('quote_count').notNull().default(0),
    trailerCount: integer('trailer_count').notNull().default(0),
    acceptedRecords: integer('accepted_records').notNull().default(0),
    rejectedRecords: integer('rejected_records').notNull().default(0),
    unknownRecords: integer('unknown_records').notNull().default(0),
    associatedInstruments: integer('associated_instruments').notNull().default(0),
    unassociatedInstruments: integer('unassociated_instruments').notNull().default(0),
    duplicateRecords: integer('duplicate_records').notNull().default(0),
    trailerDiscrepancy: boolean('trailer_discrepancy').notNull().default(false),
    recordsRead: integer('records_read').notNull().default(0),
    recordsAccepted: integer('records_accepted').notNull().default(0),
    recordsInserted: integer('records_inserted').notNull().default(0),
    recordsConflicted: integer('records_conflicted').notNull().default(0),
    recordsRejected: integer('records_rejected').notNull().default(0),
    errorCount: integer('error_count').notNull().default(0),
    skippedAsDuplicate: boolean('skipped_as_duplicate').notNull().default(false),
    ingestionRunId: uuid('ingestion_run_id'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'restrict' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_b3_cotahist_batches_status').on(table.status),
    index('idx_b3_cotahist_batches_sha256').on(table.sha256),
    index('idx_b3_cotahist_batches_ref_date').on(table.referenceDate),
    check(
      'chk_b3_cotahist_batches_status',
      sql`${table.status} IN ('RECEIVED', 'VALIDATING', 'PROCESSING', 'COMPLETED', 'FAILED', 'DUPLICATE')`
    ),
    check(
      'chk_b3_cotahist_batches_file_type',
      sql`${table.fileType} IN ('daily', 'annual')`
    ),
    check('chk_b3_cotahist_batches_file_size', sql`${table.fileSize} > 0`),
    check('chk_b3_cotahist_batches_total_lines', sql`${table.totalLines} >= 0`),
    check('chk_b3_cotahist_batches_records_read', sql`${table.recordsRead} >= 0`),
    check('chk_b3_cotahist_batches_records_accepted', sql`${table.recordsAccepted} >= 0`),
    check('chk_b3_cotahist_batches_records_inserted', sql`${table.recordsInserted} >= 0`),
    check('chk_b3_cotahist_batches_records_conflicted', sql`${table.recordsConflicted} >= 0`),
    check('chk_b3_cotahist_batches_records_rejected', sql`${table.recordsRejected} >= 0`),
    check('chk_b3_cotahist_batches_error_count', sql`${table.errorCount} >= 0`),
  ]
);

// ─── b3_historical_quotes ─────────────────────────────────────────────────────
// Base histórica própria de cotações de pregão da B3 (formato oficial COTAHIST).
// Preserva a granularidade original do pregão, permitindo múltiplos BDIs e mercados no mesmo dia.
export const b3HistoricalQuotes = pgTable(
  'b3_historical_quotes',
  {
    id: uuid('id').primaryKey(),
    batchId: uuid('batch_id')
      .notNull()
      .references(() => b3CotahistBatches.id, { onDelete: 'cascade' }),
    tradeDate: date('trade_date', { mode: 'string' }).notNull(),
    bdiCode: text('bdi_code').notNull(), // ex: '02', '12', '96'
    ticker: text('ticker').notNull(), // ex: 'PETR4', 'VALE3'
    marketType: integer('market_type').notNull(), // ex: 10 (Vista), 20 (Fracionário), 70/80 (Opções)
    shortName: text('short_name').notNull(), // ex: 'PETROBRAS'
    specification: text('specification').notNull(), // ex: 'PN N2', 'ON ED'
    forwardTermDays: text('forward_term_days'),
    currency: text('currency').notNull().default('BRL'),
    openPrice: numeric('open_price', { precision: 20, scale: 8 }).notNull(),
    highPrice: numeric('high_price', { precision: 20, scale: 8 }).notNull(),
    lowPrice: numeric('low_price', { precision: 20, scale: 8 }).notNull(),
    averagePrice: numeric('average_price', { precision: 20, scale: 8 }).notNull(),
    closePrice: numeric('close_price', { precision: 20, scale: 8 }).notNull(),
    bestBidPrice: numeric('best_bid_price', { precision: 20, scale: 8 }),
    bestAskPrice: numeric('best_ask_price', { precision: 20, scale: 8 }),
    tradeCount: integer('trade_count').notNull().default(0),
    quantity: numeric('quantity', { precision: 28, scale: 10 }).notNull(),
    financialVolume: numeric('financial_volume', { precision: 28, scale: 10 }).notNull(),
    strikePrice: numeric('strike_price', { precision: 20, scale: 8 }),
    correctionIndicator: integer('correction_indicator'),
    expirationDate: date('expiration_date', { mode: 'string' }),
    quotationFactor: integer('quotation_factor').notNull().default(1),
    strikePoints: numeric('strike_points', { precision: 20, scale: 8 }),
    isin: text('isin'),
    distributionNumber: integer('distribution_number'),
    assetId: uuid('asset_id').references(() => assets.id, { onDelete: 'set null' }),
    recordHash: text('record_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_b3_quotes_trade_date').on(table.tradeDate),
    index('idx_b3_quotes_ticker_date').on(table.ticker, table.tradeDate),
    index('idx_b3_quotes_batch_id').on(table.batchId),
    index('idx_b3_quotes_asset_id').on(table.assetId),
    index('idx_b3_quotes_isin').on(table.isin),
    unique('uq_b3_historical_quotes_record_hash').on(table.recordHash),
    check('chk_b3_quotes_open_price', sql`${table.openPrice} >= 0`),
    check('chk_b3_quotes_high_price', sql`${table.highPrice} >= 0`),
    check('chk_b3_quotes_low_price', sql`${table.lowPrice} >= 0`),
    check('chk_b3_quotes_average_price', sql`${table.averagePrice} >= 0`),
    check('chk_b3_quotes_close_price', sql`${table.closePrice} >= 0`),
    check('chk_b3_quotes_quantity', sql`${table.quantity} >= 0`),
    check('chk_b3_quotes_financial_volume', sql`${table.financialVolume} >= 0`),
    check('chk_b3_quotes_quotation_factor', sql`${table.quotationFactor} >= 1`),
  ]
);
