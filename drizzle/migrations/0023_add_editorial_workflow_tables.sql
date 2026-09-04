-- ==============================================================================
-- Migração 0023: Tabelas do Módulo de Workflow Editorial e IA Interna (Etapa 10)
-- 
-- Criação de tabelas dedicadas e isoladas para o fluxo editorial interno:
-- 1. editorial_documents (documentos, estado, visibilidade, tipos e metadados)
-- 2. editorial_versions (histórico imutável de versões, hash de integridade e origem)
-- 3. editorial_reviews (decisões humanas de revisão: APPROVE, REJECT, REQUEST_CHANGES)
-- 4. editorial_ai_executions (trilha de auditoria das execuções e sugestões de IA)
-- ==============================================================================

-- 1. Tabela editorial_documents
CREATE TABLE IF NOT EXISTS editorial_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  content TEXT NOT NULL,
  content_format TEXT NOT NULL DEFAULT 'MARKDOWN',
  document_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'DRAFT',
  visibility TEXT NOT NULL DEFAULT 'INTERNAL',
  current_version INTEGER NOT NULL DEFAULT 1,
  created_by TEXT NOT NULL,
  updated_by TEXT NOT NULL,
  approved_by TEXT,
  approved_at TIMESTAMP WITH TIME ZONE,
  published_at TIMESTAMP WITH TIME ZONE,
  archived_at TIMESTAMP WITH TIME ZONE,
  rejection_reason TEXT,
  regulatory_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  deleted_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_editorial_doc_format CHECK (
    content_format IN ('MARKDOWN', 'PLAIN_TEXT')
  ),
  CONSTRAINT chk_editorial_doc_type CHECK (
    document_type IN (
      'EDUCATIONAL_ARTICLE',
      'INSTITUTIONAL_NOTE',
      'PRODUCT_EXPLANATION',
      'INTERNAL_DOC',
      'GLOSSARY',
      'ANNOUNCEMENT',
      'MARKET_ANALYSIS',
      'TAX_GUIDANCE',
      'OPTIONS_DERIVATIVES'
    )
  ),
  CONSTRAINT chk_editorial_doc_status CHECK (
    status IN (
      'DRAFT',
      'IN_REVIEW',
      'CHANGES_REQUESTED',
      'APPROVED',
      'PUBLISHED',
      'ARCHIVED'
    )
  ),
  CONSTRAINT chk_editorial_doc_visibility CHECK (
    visibility IN ('INTERNAL', 'PUBLIC')
  ),
  CONSTRAINT chk_editorial_doc_version CHECK (
    current_version >= 1
  )
);

CREATE INDEX IF NOT EXISTS idx_editorial_documents_owner_status
  ON editorial_documents(owner_user_id, status);

CREATE INDEX IF NOT EXISTS idx_editorial_documents_slug
  ON editorial_documents(slug);

CREATE INDEX IF NOT EXISTS idx_editorial_documents_created_at
  ON editorial_documents(created_at DESC);

-- 2. Tabela editorial_versions
CREATE TABLE IF NOT EXISTS editorial_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES editorial_documents(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  author_id TEXT NOT NULL,
  origin TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_editorial_version_number CHECK (
    version_number >= 1
  ),
  CONSTRAINT chk_editorial_version_origin CHECK (
    origin IN ('MANUAL', 'AI_DRAFT', 'AI_SUGGESTION', 'REVISION')
  ),
  CONSTRAINT uq_editorial_versions_doc_ver UNIQUE (document_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_editorial_versions_doc_ver
  ON editorial_versions(document_id, version_number DESC);

-- 3. Tabela editorial_reviews
CREATE TABLE IF NOT EXISTS editorial_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES editorial_documents(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  reviewer_id TEXT NOT NULL,
  decision TEXT NOT NULL,
  comments TEXT NOT NULL,
  regulatory_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_editorial_review_decision CHECK (
    decision IN ('APPROVE', 'REJECT', 'REQUEST_CHANGES')
  ),
  CONSTRAINT chk_editorial_review_ver CHECK (
    version_number >= 1
  )
);

CREATE INDEX IF NOT EXISTS idx_editorial_reviews_doc_created
  ON editorial_reviews(document_id, created_at DESC);

-- 4. Tabela editorial_ai_executions
CREATE TABLE IF NOT EXISTS editorial_ai_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES editorial_documents(id) ON DELETE SET NULL,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_sanitized TEXT NOT NULL,
  response_sanitized TEXT NOT NULL,
  status TEXT NOT NULL,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_editorial_ai_action CHECK (
    action_type IN (
      'GENERATE_DRAFT',
      'SUGGEST_TITLE',
      'SUMMARIZE',
      'SUGGEST_IMPROVEMENTS',
      'DETECT_REGULATORY_FLAGS',
      'CLASSIFY_CONTENT'
    )
  ),
  CONSTRAINT chk_editorial_ai_status CHECK (
    status IN ('SUCCESS', 'FAILED')
  )
);

CREATE INDEX IF NOT EXISTS idx_editorial_ai_exec_user
  ON editorial_ai_executions(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_editorial_ai_exec_doc
  ON editorial_ai_executions(document_id);
