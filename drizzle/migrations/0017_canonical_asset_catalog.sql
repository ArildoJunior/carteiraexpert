-- ============================================================================
-- MIGRATION 0017: CANONICAL ASSET CATALOG INFRASTRUCTURE (ESTRUTURAL ESTREITA)
-- ============================================================================
-- Descrição: Cria as tabelas de rastreamento operacional e auditoria de conflitos
-- do Catálogo Canônico de Ativos (ADR-011) e adiciona colunas estruturais em
-- public.assets em modo NULLABLE (sem backfill e sem defaults semânticos cegos).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Pré-validações de compatibilidade estrutural
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  -- 1.1. Verifica a existência da tabela mestre public.assets
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'assets'
  ) THEN
    RAISE EXCEPTION 'MIGRATION_0017_ABORTED: Tabela public.assets inexistente no banco.';
  END IF;

  -- 1.2. Verifica compatibilidade de colunas caso já existam parcialmente
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'assets' AND column_name = 'is_visible_catalog' AND data_type <> 'boolean'
  ) THEN
    RAISE EXCEPTION 'MIGRATION_0017_ABORTED: Coluna is_visible_catalog existe com tipo incompativel em public.assets.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'assets' AND column_name = 'is_tradeable' AND data_type <> 'boolean'
  ) THEN
    RAISE EXCEPTION 'MIGRATION_0017_ABORTED: Coluna is_tradeable existe com tipo incompativel em public.assets.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'assets' AND column_name = 'status' AND data_type <> 'text'
  ) THEN
    RAISE EXCEPTION 'MIGRATION_0017_ABORTED: Coluna status existe com tipo incompativel em public.assets.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'assets' AND column_name = 'isin' AND data_type <> 'text'
  ) THEN
    RAISE EXCEPTION 'MIGRATION_0017_ABORTED: Coluna isin existe com tipo incompativel em public.assets.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'assets' AND column_name = 'provenance' AND data_type <> 'text'
  ) THEN
    RAISE EXCEPTION 'MIGRATION_0017_ABORTED: Coluna provenance existe com tipo incompativel em public.assets.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'assets' AND column_name = 'last_sync_run_id' AND data_type <> 'uuid'
  ) THEN
    RAISE EXCEPTION 'MIGRATION_0017_ABORTED: Coluna last_sync_run_id existe com tipo incompativel em public.assets.';
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. Criação das Tabelas de Rastreamento Operacional e Conflitos
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.canonical_sync_runs (
  id uuid PRIMARY KEY,
  worker_id uuid NOT NULL,
  environment text NOT NULL DEFAULT 'development',
  execution_mode text NOT NULL DEFAULT 'DRY_RUN',
  parser_version text NOT NULL DEFAULT '1.0.0',
  batch_hash text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING',
  total_candidates integer NOT NULL DEFAULT 0,
  inserted_assets integer NOT NULL DEFAULT 0,
  updated_assets integer NOT NULL DEFAULT 0,
  preserved_assets integer NOT NULL DEFAULT 0,
  linked_quotes integer NOT NULL DEFAULT 0,
  conflicts_detected integer NOT NULL DEFAULT 0,
  rejected_records integer NOT NULL DEFAULT 0,
  error_message text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_sync_runs_status CHECK (status IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'REVERTED', 'ABANDONED')),
  CONSTRAINT chk_sync_runs_mode CHECK (execution_mode IN ('DRY_RUN', 'APPLY')),
  CONSTRAINT uq_canonical_sync_runs_hash_mode UNIQUE (batch_hash, execution_mode, environment, parser_version)
);

CREATE TABLE IF NOT EXISTS public.canonical_sync_run_items (
  id uuid PRIMARY KEY,
  sync_run_id uuid NOT NULL REFERENCES public.canonical_sync_runs(id) ON DELETE CASCADE,
  entity_type text NOT NULL,
  record_id text NOT NULL,
  action text NOT NULL,
  old_state jsonb,
  new_state jsonb,
  result_status text NOT NULL,
  error_detail text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_sync_run_items_entity CHECK (entity_type IN ('asset', 'b3_quote_link', 'cvm_binding', 'fundamental')),
  CONSTRAINT chk_sync_run_items_action CHECK (action IN ('INSERT', 'UPDATE', 'NO_OP', 'REJECT', 'LINK_QUOTE', 'UNLINK_QUOTE')),
  CONSTRAINT chk_sync_run_items_result CHECK (result_status IN ('SUCCESS', 'FAILED', 'CONFLICT', 'SKIPPED')),
  CONSTRAINT uq_canonical_sync_run_items_entry UNIQUE (sync_run_id, entity_type, record_id, action)
);

CREATE TABLE IF NOT EXISTS public.canonical_catalog_conflicts (
  id uuid PRIMARY KEY,
  sync_run_id uuid NOT NULL REFERENCES public.canonical_sync_runs(id) ON DELETE CASCADE,
  ticker text NOT NULL,
  conflict_type text NOT NULL,
  detected_data jsonb NOT NULL,
  proposed_resolution jsonb,
  status text NOT NULL DEFAULT 'OPEN',
  resolution_notes text,
  resolved_by uuid REFERENCES public.users(id) ON DELETE RESTRICT,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_catalog_conflicts_status CHECK (status IN ('OPEN', 'RESOLVED', 'IGNORED')),
  CONSTRAINT chk_catalog_conflicts_type CHECK (conflict_type IN ('ISIN_MISMATCH', 'CLASS_AMBIGUITY', 'DUPLICATE_TICKER_ISIN', 'DUPLICATE_NAME', 'CVM_CODE_MISMATCH'))
);

-- ----------------------------------------------------------------------------
-- 3. Adição Estrutural em public.assets (Colunas NULLABLE sem defaults semânticos)
-- ----------------------------------------------------------------------------
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS is_visible_catalog boolean;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS is_tradeable boolean;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS status text;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS isin text;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS provenance text;
ALTER TABLE public.assets ADD COLUMN IF NOT EXISTS last_sync_run_id uuid REFERENCES public.canonical_sync_runs(id) ON DELETE SET NULL;

-- ----------------------------------------------------------------------------
-- 4. Constraints Estruturais Idempotentes
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_assets_status') THEN
    ALTER TABLE public.assets ADD CONSTRAINT chk_assets_status CHECK (status IS NULL OR status IN ('active', 'delisted', 'suspended'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_assets_provenance') THEN
    ALTER TABLE public.assets ADD CONSTRAINT chk_assets_provenance CHECK (provenance IS NULL OR provenance IN ('curated_seed', 'b3_cotahist', 'user_custom', 'manual_admin'));
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 5. Criação Idempotente de Índices de Busca e Performance
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_assets_isin ON public.assets (isin) WHERE isin IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_assets_catalog_visibility ON public.assets (is_visible_catalog, status) WHERE is_custom = false;
CREATE INDEX IF NOT EXISTS idx_canonical_sync_runs_status ON public.canonical_sync_runs (status);
CREATE INDEX IF NOT EXISTS idx_canonical_sync_runs_worker ON public.canonical_sync_runs (worker_id);
CREATE INDEX IF NOT EXISTS idx_sync_run_items_query ON public.canonical_sync_run_items (sync_run_id, entity_type, result_status);
CREATE INDEX IF NOT EXISTS idx_sync_run_items_record ON public.canonical_sync_run_items (entity_type, record_id);
CREATE INDEX IF NOT EXISTS idx_catalog_conflicts_status ON public.canonical_catalog_conflicts (status);
CREATE INDEX IF NOT EXISTS idx_catalog_conflicts_ticker ON public.canonical_catalog_conflicts (ticker);
