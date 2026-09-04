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

// ─── editorial_documents ────────────────────────────────────────────────────
// Documentos do fluxo editorial interno assistido por IA.
// Mantém o estado atual do documento, metadados de auditoria e aprovação.
export const editorialDocuments = pgTable(
  'editorial_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ownerUserId: uuid('owner_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    slug: text('slug').notNull(),
    content: text('content').notNull(),
    contentFormat: text('content_format').notNull().default('MARKDOWN'),
    documentType: text('document_type').notNull(),
    status: text('status').notNull().default('DRAFT'),
    visibility: text('visibility').notNull().default('INTERNAL'),
    currentVersion: integer('current_version').notNull().default(1),
    createdBy: text('created_by').notNull(),
    updatedBy: text('updated_by').notNull(),
    approvedBy: text('approved_by'),
    approvedAt: timestamp('approved_at', { withTimezone: true }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
    rejectionReason: text('rejection_reason'),
    regulatoryFlags: jsonb('regulatory_flags').notNull().default(sql`'[]'::jsonb`),
    metadata: jsonb('metadata').notNull().default(sql`'{}'::jsonb`),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_editorial_documents_owner_status').on(table.ownerUserId, table.status),
    index('idx_editorial_documents_slug').on(table.slug),
    index('idx_editorial_documents_created_at').on(table.createdAt),
    check(
      'chk_editorial_doc_format',
      sql`${table.contentFormat} IN ('MARKDOWN', 'PLAIN_TEXT')`
    ),
    check(
      'chk_editorial_doc_type',
      sql`${table.documentType} IN (
        'EDUCATIONAL_ARTICLE',
        'INSTITUTIONAL_NOTE',
        'PRODUCT_EXPLANATION',
        'INTERNAL_DOC',
        'GLOSSARY',
        'ANNOUNCEMENT',
        'MARKET_ANALYSIS',
        'TAX_GUIDANCE',
        'OPTIONS_DERIVATIVES'
      )`
    ),
    check(
      'chk_editorial_doc_status',
      sql`${table.status} IN (
        'DRAFT',
        'IN_REVIEW',
        'CHANGES_REQUESTED',
        'APPROVED',
        'PUBLISHED',
        'ARCHIVED'
      )`
    ),
    check(
      'chk_editorial_doc_visibility',
      sql`${table.visibility} IN ('INTERNAL', 'PUBLIC')`
    ),
    check(
      'chk_editorial_doc_version',
      sql`${table.currentVersion} >= 1`
    ),
  ]
);

// ─── editorial_versions ─────────────────────────────────────────────────────
// Histórico imutável de todas as versões do documento editorial.
// Preserva autoria, conteúdo, hash de integridade e classificação de origem.
export const editorialVersions = pgTable(
  'editorial_versions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => editorialDocuments.id, { onDelete: 'cascade' }),
    versionNumber: integer('version_number').notNull(),
    title: text('title').notNull(),
    content: text('content').notNull(),
    authorId: text('author_id').notNull(),
    origin: text('origin').notNull(),
    contentHash: text('content_hash').notNull(),
    notes: text('notes'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_editorial_versions_doc_ver').on(table.documentId, table.versionNumber),
    unique('uq_editorial_versions_doc_ver').on(table.documentId, table.versionNumber),
    check(
      'chk_editorial_version_number',
      sql`${table.versionNumber} >= 1`
    ),
    check(
      'chk_editorial_version_origin',
      sql`${table.origin} IN ('MANUAL', 'AI_DRAFT', 'AI_SUGGESTION', 'REVISION')`
    ),
  ]
);

// ─── editorial_reviews ──────────────────────────────────────────────────────
// Decisões humanas explícitas de aprovação, solicitação de ajustes ou reprovação.
export const editorialReviews = pgTable(
  'editorial_reviews',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => editorialDocuments.id, { onDelete: 'cascade' }),
    versionNumber: integer('version_number').notNull(),
    reviewerId: text('reviewer_id').notNull(),
    decision: text('decision').notNull(),
    comments: text('comments').notNull(),
    regulatoryFlags: jsonb('regulatory_flags').notNull().default(sql`'[]'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_editorial_reviews_doc_created').on(table.documentId, table.createdAt),
    check(
      'chk_editorial_review_decision',
      sql`${table.decision} IN ('APPROVE', 'REJECT', 'REQUEST_CHANGES')`
    ),
    check(
      'chk_editorial_review_ver',
      sql`${table.versionNumber} >= 1`
    ),
  ]
);

// ─── editorial_ai_executions ────────────────────────────────────────────────
// Trilha de auditoria das interações com a camada de IA interna.
export const editorialAiExecutions = pgTable(
  'editorial_ai_executions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    documentId: uuid('document_id').references(() => editorialDocuments.id, {
      onDelete: 'set null',
    }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    actionType: text('action_type').notNull(),
    model: text('model').notNull(),
    promptSanitized: text('prompt_sanitized').notNull(),
    responseSanitized: text('response_sanitized').notNull(),
    status: text('status').notNull(),
    errorMessage: text('error_message'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_editorial_ai_exec_user').on(table.userId, table.createdAt),
    index('idx_editorial_ai_exec_doc').on(table.documentId),
    check(
      'chk_editorial_ai_action',
      sql`${table.actionType} IN (
        'GENERATE_DRAFT',
        'SUGGEST_TITLE',
        'SUMMARIZE',
        'SUGGEST_IMPROVEMENTS',
        'DETECT_REGULATORY_FLAGS',
        'CLASSIFY_CONTENT'
      )`
    ),
    check(
      'chk_editorial_ai_status',
      sql`${table.status} IN ('SUCCESS', 'FAILED')`
    ),
  ]
);
