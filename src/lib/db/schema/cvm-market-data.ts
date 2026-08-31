import { sql } from 'drizzle-orm';
import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  check,
  index,
  unique,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { assets } from './portfolio';

// ─── cvm_companies ────────────────────────────────────────────────────────────
// Cadastro oficial de companhias abertas registradas na CVM (fonte: cad_cia_aberta.csv).
// Entidade corporativa de nível COMPANY, independente de classes ou tickers de negociação.
export const cvmCompanies = pgTable(
  'cvm_companies',
  {
    id: uuid('id').primaryKey(),
    cvmCode: text('cvm_code').notNull(), // Código CVM formatado com 6 dígitos (ex: '009512')
    cnpj: text('cnpj').notNull(),         // CNPJ da companhia normalizado com 14 dígitos numéricos
    legalName: text('legal_name').notNull(), // Razão Social (DENOM_SOCIAL)
    tradeName: text('trade_name'),           // Nome Comercial (DENOM_COMERC)
    industrySector: text('industry_sector'), // Setor de Atividade oficial CVM (SETOR_ATIV)
    marketType: text('market_type'),         // Tipo de mercado (TP_MERC: 'BOLSA', 'BALCÃO ORGANIZADO', etc.)
    status: text('status').notNull().default('ATIVO'), // 'ATIVO' | 'CANCELADA' | 'SUSPENSO(A) - DECISÃO ADM'
    registrationDate: timestamp('registration_date', { withTimezone: true }), // Data de registro na CVM
    cancellationDate: timestamp('cancellation_date', { withTimezone: true }), // Data de cancelamento de registro
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('uq_cvm_companies_cvm_code').on(table.cvmCode),
    unique('uq_cvm_companies_cnpj').on(table.cnpj),
    index('idx_cvm_companies_status').on(table.status),
    index('idx_cvm_companies_industry_sector').on(table.industrySector),
    check(
      'chk_cvm_companies_status',
      sql`${table.status} IN ('ATIVO', 'CANCELADA', 'SUSPENSO(A) - DECISÃO ADM')`
    ),
    check('chk_cvm_companies_cnpj_len', sql`length(${table.cnpj}) = 14`),
    check('chk_cvm_companies_cvm_code_len', sql`length(${table.cvmCode}) = 6`),
  ]
);

// ─── cvm_source_files ─────────────────────────────────────────────────────────
// Rastreabilidade, integridade física e auditoria de arquivos de dados abertos baixados da CVM.
// O status reflete unicamente a integridade binária do arquivo em disco (DOWNLOADED, AVAILABLE, INVALID).
export const cvmSourceFiles = pgTable(
  'cvm_source_files',
  {
    id: uuid('id').primaryKey(),
    fileName: text('file_name').notNull(), // Nome físico do arquivo (ex: 'dfp_cia_aberta_2024.zip', 'cad_cia_aberta.csv')
    documentType: text('document_type').notNull(), // 'CAD' | 'DFP' | 'ITR' | 'FCA' | 'META'
    referenceYear: integer('reference_year'),      // Ano de referência do pacote (ex: 2024)
    sourceUrl: text('source_url').notNull(),       // URL oficial de origem na CVM
    sha256: text('sha256').notNull(),              // Hash SHA-256 para garantia de integridade e idempotência
    fileSize: integer('file_size').notNull(),      // Tamanho físico em bytes
    storagePath: text('storage_path').notNull(),   // Caminho local de persistência do arquivo bruto
    status: text('status').notNull().default('DOWNLOADED'), // 'DOWNLOADED' | 'AVAILABLE' | 'INVALID'
    httpEtag: text('http_etag'),
    httpLastModified: text('http_last_modified'),
    downloadedAt: timestamp('downloaded_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('uq_cvm_source_files_sha256').on(table.sha256),
    index('idx_cvm_source_files_doc_year').on(table.documentType, table.referenceYear),
    index('idx_cvm_source_files_status').on(table.status),
    check(
      'chk_cvm_source_files_status',
      sql`${table.status} IN ('DOWNLOADED', 'AVAILABLE', 'INVALID')`
    ),
    check(
      'chk_cvm_source_files_doc_type',
      sql`${table.documentType} IN ('CAD', 'DFP', 'ITR', 'FCA', 'META')`
    ),
    check('chk_cvm_source_files_size', sql`${table.fileSize} > 0`),
  ]
);

// ─── cvm_ingestion_runs ───────────────────────────────────────────────────────
// Registro operacional de cada execução/processamento de parser sobre um arquivo da CVM.
// Controla concorrência, locks transacionais, heartbeats de lease e métricas do pipeline.
export const cvmIngestionRuns = pgTable(
  'cvm_ingestion_runs',
  {
    id: uuid('id').primaryKey(),
    fileId: uuid('file_id')
      .notNull()
      .references(() => cvmSourceFiles.id, { onDelete: 'restrict' }),
    workerId: uuid('worker_id').notNull(),         // Identificador único da instância do processo/worker
    parserVersion: text('parser_version').notNull().default('1.0.0'),
    executionMode: text('execution_mode').notNull().default('CLI_MANUAL'), // 'CLI_MANUAL' | 'CLI_SCHEDULED' | 'DRY_RUN'
    // Status do ciclo de vida da execução:
    status: text('status').notNull().default('PENDING'), // 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'ABANDONED' | 'CANCELLED' | 'DRY_RUN_SUCCESS' | 'DRY_RUN_FAILED'
    heartbeatAt: timestamp('heartbeat_at', { withTimezone: true }).notNull().defaultNow(),
    lockExpiresAt: timestamp('lock_expires_at', { withTimezone: true }).notNull(), // Data/hora de expiração do lease
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp('completed_at', { withTimezone: true }),
    companiesRead: integer('companies_read').notNull().default(0),
    statementsInserted: integer('statements_inserted').notNull().default(0),
    statementsUpdated: integer('statements_updated').notNull().default(0),
    statementsSkipped: integer('statements_skipped').notNull().default(0),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('idx_cvm_ingestion_runs_file_id').on(table.fileId),
    index('idx_cvm_ingestion_runs_status').on(table.status),
    check(
      'chk_cvm_ingestion_runs_status',
      sql`${table.status} IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'ABANDONED', 'CANCELLED', 'DRY_RUN_SUCCESS', 'DRY_RUN_FAILED')`
    ),
    check(
      'chk_cvm_ingestion_runs_mode',
      sql`${table.executionMode} IN ('CLI_MANUAL', 'CLI_SCHEDULED', 'DRY_RUN')`
    ),
    check(
      'chk_cvm_ingestion_runs_counters',
      sql`${table.companiesRead} >= 0 AND ${table.statementsInserted} >= 0 AND ${table.statementsUpdated} >= 0 AND ${table.statementsSkipped} >= 0`
    ),
  ]
);

// ─── cvm_company_assets ───────────────────────────────────────────────────────
// De-Para explícito, controlado e auditável entre Companhias CVM e Ativos do CarteiraExpert.
// Garante isolamento estrito: nenhum dado contábil corporativo é vinculado a ativos sem aprovação formal.
export const cvmCompanyAssets = pgTable(
  'cvm_company_assets',
  {
    id: uuid('id').primaryKey(),
    companyId: uuid('company_id')
      .notNull()
      .references(() => cvmCompanies.id, { onDelete: 'restrict' }),
    assetId: uuid('asset_id')
      .notNull()
      .references(() => assets.id, { onDelete: 'restrict' }),
    shareClass: text('share_class'), // Classe representativa de ação: 'ON' | 'PN' | 'PNA' | 'PNB' | 'UNT'
    status: text('status').notNull().default('PENDING_REVIEW'), // 'APPROVED' | 'PENDING_REVIEW' | 'REJECTED'
    matchMethod: text('match_method').notNull().default('MANUAL'), // 'CURATED_SEED' | 'CNPJ_EXACT' | 'MANUAL' | 'HEURISTIC'
    justification: text('justification'), // Evidência documental / justificativa da associação
    source: text('source').notNull().default('manual'), // Origem do vínculo (ex: 'cvm_seed_2024', 'admin_review')
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    unique('uq_cvm_company_assets_pair').on(table.companyId, table.assetId),
    uniqueIndex('uq_cvm_company_assets_single_active_approved')
      .on(table.assetId)
      .where(sql`${table.status} = 'APPROVED'`),
    index('idx_cvm_company_assets_status').on(table.status),
    index('idx_cvm_company_assets_asset_id').on(table.assetId),
    check(
      'chk_cvm_company_assets_status',
      sql`${table.status} IN ('APPROVED', 'PENDING_REVIEW', 'REJECTED')`
    ),
    check(
      'chk_cvm_company_assets_method',
      sql`${table.matchMethod} IN ('CURATED_SEED', 'CNPJ_EXACT', 'MANUAL', 'HEURISTIC')`
    ),
  ]
);
