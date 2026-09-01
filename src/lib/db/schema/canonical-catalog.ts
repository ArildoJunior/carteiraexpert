import { sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  jsonb,
  check,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { users } from './identity';

// ─── canonical_sync_runs ──────────────────────────────────────────────────────
// Rastreamento operacional de execuções do sincronizador do Catálogo Canônico (ADR-011).
// Controla integridade de lote, modo (DRY_RUN vs APPLY), idempotência e chave de rollback.
export const canonicalSyncRuns = pgTable(
  'canonical_sync_runs',
  {
    id: uuid('id').primaryKey(),
    workerId: uuid('worker_id').notNull(), // Identificador da instância do processo/worker
    environment: text('environment').notNull().default('development'),
    executionMode: text('execution_mode').notNull().default('DRY_RUN'), // 'DRY_RUN' | 'APPLY'
    parserVersion: text('parser_version').notNull().default('1.0.0'),
    batchHash: text('batch_hash').notNull(), // Hash do conjunto de dados de entrada para garantia de idempotência
    status: text('status').notNull().default('PENDING'), // 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'REVERTED' | 'ABANDONED'
    totalCandidates: integer('total_candidates').notNull().default(0),
    insertedAssets: integer('inserted_assets').notNull().default(0),
    updatedAssets: integer('updated_assets').notNull().default(0),
    preservedAssets: integer('preserved_assets').notNull().default(0),
    linkedQuotes: integer('linked_quotes').notNull().default(0),
    conflictsDetected: integer('conflicts_detected').notNull().default(0),
    rejectedRecords: integer('rejected_records').notNull().default(0),
    errorMessage: text('error_message'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('uq_canonical_sync_runs_hash_mode').on(
      table.batchHash,
      table.executionMode,
      table.environment,
      table.parserVersion
    ),
    index('idx_canonical_sync_runs_status').on(table.status),
    index('idx_canonical_sync_runs_worker').on(table.workerId),
    check(
      'chk_sync_runs_status',
      sql`${table.status} IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'REVERTED', 'ABANDONED')`
    ),
    check(
      'chk_sync_runs_mode',
      sql`${table.executionMode} IN ('DRY_RUN', 'APPLY')`
    ),
  ]
);

// ─── canonical_sync_run_items ─────────────────────────────────────────────────
// Log transacional atômico e imutável de cada mutação efetuada em uma execução.
// Fonte oficial e determinística da verdade para auditoria e rollback cirúrgico.
export const canonicalSyncRunItems = pgTable(
  'canonical_sync_run_items',
  {
    id: uuid('id').primaryKey(),
    syncRunId: uuid('sync_run_id')
      .notNull()
      .references(() => canonicalSyncRuns.id, { onDelete: 'cascade' }),
    entityType: text('entity_type').notNull(), // 'asset' | 'b3_quote_link' | 'cvm_binding' | 'fundamental'
    recordId: text('record_id').notNull(),     // Identificador da linha afetada (UUID ou record_id em texto)
    action: text('action').notNull(),          // 'INSERT' | 'UPDATE' | 'NO_OP' | 'REJECT' | 'LINK_QUOTE' | 'UNLINK_QUOTE'
    oldState: jsonb('old_state'),              // Snapshot do estado anterior antes da mutação
    newState: jsonb('new_state'),              // Snapshot do estado posterior após a mutação
    resultStatus: text('result_status').notNull(), // 'SUCCESS' | 'FAILED' | 'CONFLICT' | 'SKIPPED'
    errorDetail: text('error_detail'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('uq_canonical_sync_run_items_entry').on(
      table.syncRunId,
      table.entityType,
      table.recordId,
      table.action
    ),
    index('idx_sync_run_items_query').on(
      table.syncRunId,
      table.entityType,
      table.resultStatus
    ),
    index('idx_sync_run_items_record').on(table.entityType, table.recordId),
    check(
      'chk_sync_run_items_entity',
      sql`${table.entityType} IN ('asset', 'b3_quote_link', 'cvm_binding', 'fundamental')`
    ),
    check(
      'chk_sync_run_items_action',
      sql`${table.action} IN ('INSERT', 'UPDATE', 'NO_OP', 'REJECT', 'LINK_QUOTE', 'UNLINK_QUOTE')`
    ),
    check(
      'chk_sync_run_items_result',
      sql`${table.resultStatus} IN ('SUCCESS', 'FAILED', 'CONFLICT', 'SKIPPED')`
    ),
  ]
);

// ─── canonical_catalog_conflicts ──────────────────────────────────────────────
// Armazena conflitos cadastrais de conciliação B3/ISIN/CVM direcionados para revisão (PENDING_REVIEW).
export const canonicalCatalogConflicts = pgTable(
  'canonical_catalog_conflicts',
  {
    id: uuid('id').primaryKey(),
    syncRunId: uuid('sync_run_id')
      .notNull()
      .references(() => canonicalSyncRuns.id, { onDelete: 'cascade' }),
    ticker: text('ticker').notNull(),
    conflictType: text('conflict_type').notNull(), // 'ISIN_MISMATCH' | 'CLASS_AMBIGUITY' | 'DUPLICATE_TICKER_ISIN' | 'DUPLICATE_NAME' | 'CVM_CODE_MISMATCH'
    detectedData: jsonb('detected_data').notNull(), // Dados brutos conflitantes detectados no COTAHIST / CVM
    proposedResolution: jsonb('proposed_resolution'),
    status: text('status').notNull().default('OPEN'), // 'OPEN' | 'RESOLVED' | 'IGNORED'
    resolutionNotes: text('resolution_notes'),
    resolvedBy: uuid('resolved_by').references(() => users.id, { onDelete: 'restrict' }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_catalog_conflicts_status').on(table.status),
    index('idx_catalog_conflicts_ticker').on(table.ticker),
    check(
      'chk_catalog_conflicts_status',
      sql`${table.status} IN ('OPEN', 'RESOLVED', 'IGNORED')`
    ),
    check(
      'chk_catalog_conflicts_type',
      sql`${table.conflictType} IN ('ISIN_MISMATCH', 'CLASS_AMBIGUITY', 'DUPLICATE_TICKER_ISIN', 'DUPLICATE_NAME', 'CVM_CODE_MISMATCH')`
    ),
  ]
);
