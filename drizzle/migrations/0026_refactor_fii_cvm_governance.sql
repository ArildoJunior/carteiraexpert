-- ==============================================================================
-- Migração 0026: Governança e Desacoplamento de FIIs (CVM x Ativos B3)
--
-- PRÉ-CONDIÇÃO MANDATÓRIA:
-- As tabelas "cvm_fii_registry" e "fii_monthly_fundamentals" devem estar
-- rigorosamente vazias (0 registros). A migração remove colunas de relacionamento
-- ("asset_id") e adiciona "fii_registry_id" com constraint NOT NULL sem valor padrão.
-- Não é universalmente idempotente para tabelas já populadas com dados.
--
-- 1. cvm_fii_registry: Desacopla da tabela assets (remove asset_id, adiciona trade_name).
--    Preserva 100% dos fundos registrados na CVM identificados exclusivamente por CNPJ.
-- 2. cvm_fii_bindings: Nova tabela de vínculos auditáveis entre fundos CVM e ativos B3.
--    Permite apenas 1 vínculo com status 'APPROVED' por asset_id e por fii_registry_id.
-- 3. fii_monthly_fundamentals: Migra chave estrangeira e unicidade de asset_id para fii_registry_id,
--    garantindo que cada fundo contábil tenha seus dados isolados e imutáveis.
-- ==============================================================================

-- ─── 1. cvm_fii_registry ──────────────────────────────────────────────────────
DO $$ BEGIN
	ALTER TABLE "cvm_fii_registry" DROP CONSTRAINT IF EXISTS "fk_cvm_fii_registry_asset";
EXCEPTION
	WHEN undefined_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "cvm_fii_registry" DROP CONSTRAINT IF EXISTS "uq_cvm_fii_registry_asset_id";
EXCEPTION
	WHEN undefined_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "cvm_fii_registry" DROP COLUMN IF EXISTS "asset_id";
--> statement-breakpoint
ALTER TABLE "cvm_fii_registry" ADD COLUMN IF NOT EXISTS "trade_name" text;
--> statement-breakpoint

-- ─── 2. cvm_fii_bindings ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "cvm_fii_bindings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"fii_registry_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"binding_status" text DEFAULT 'PENDING_REVIEW' NOT NULL,
	"binding_method" text DEFAULT 'MANUAL' NOT NULL,
	"confidence_level" text DEFAULT 'MEDIUM' NOT NULL,
	"justification" text,
	"source" text DEFAULT 'cvm' NOT NULL,
	"source_updated_at" timestamp with time zone,
	"reviewed_by" uuid,
	"reviewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fk_cvm_fii_bindings_registry" FOREIGN KEY ("fii_registry_id") REFERENCES "cvm_fii_registry"("id") ON DELETE RESTRICT,
	CONSTRAINT "fk_cvm_fii_bindings_asset" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "cvm_fii_bindings" ADD CONSTRAINT "uq_cvm_fii_bindings_pair" UNIQUE ("fii_registry_id", "asset_id");
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_cvm_fii_bindings_single_active_approved"
	ON "cvm_fii_bindings" ("asset_id")
	WHERE "binding_status" = 'APPROVED';
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_cvm_fii_bindings_single_approved_registry"
	ON "cvm_fii_bindings" ("fii_registry_id")
	WHERE "binding_status" = 'APPROVED';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_cvm_fii_bindings_asset_id" ON "cvm_fii_bindings" ("asset_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_cvm_fii_bindings_registry_id" ON "cvm_fii_bindings" ("fii_registry_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_cvm_fii_bindings_status" ON "cvm_fii_bindings" ("binding_status");
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "cvm_fii_bindings" ADD CONSTRAINT "chk_cvm_fii_bindings_status"
		CHECK ("binding_status" IN ('APPROVED', 'PENDING_REVIEW', 'AMBIGUOUS', 'REJECTED'));
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "cvm_fii_bindings" ADD CONSTRAINT "chk_cvm_fii_bindings_method"
		CHECK ("binding_method" IN ('CANONICAL_DE_PARA', 'EXACT_ISIN', 'ISIN_TICKER_ROOT', 'MANUAL'));
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "cvm_fii_bindings" ADD CONSTRAINT "chk_cvm_fii_bindings_confidence"
		CHECK ("confidence_level" IN ('HIGH', 'MEDIUM', 'LOW'));
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- ─── 3. fii_monthly_fundamentals ─────────────────────────────────────────────
DROP INDEX IF EXISTS "idx_fii_monthly_fundamentals_asset_id";
--> statement-breakpoint
DROP INDEX IF EXISTS "idx_fii_monthly_fundamentals_asset_ref_date";
--> statement-breakpoint
DROP INDEX IF EXISTS "idx_fii_monthly_fundamentals_latest";
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "fii_monthly_fundamentals" DROP CONSTRAINT IF EXISTS "uq_fii_monthly_fundamentals_versioning";
EXCEPTION
	WHEN undefined_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "fii_monthly_fundamentals" DROP CONSTRAINT IF EXISTS "fk_fii_monthly_fundamentals_asset";
EXCEPTION
	WHEN undefined_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "fii_monthly_fundamentals" DROP COLUMN IF EXISTS "asset_id";
--> statement-breakpoint
ALTER TABLE "fii_monthly_fundamentals" ADD COLUMN IF NOT EXISTS "fii_registry_id" uuid NOT NULL;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "fii_monthly_fundamentals" ADD CONSTRAINT "fk_fii_monthly_fundamentals_registry"
		FOREIGN KEY ("fii_registry_id") REFERENCES "cvm_fii_registry"("id") ON DELETE RESTRICT;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "fii_monthly_fundamentals" ADD CONSTRAINT "uq_fii_monthly_fundamentals_versioning"
		UNIQUE ("fii_registry_id", "reference_date", "version", "source");
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_fii_monthly_fundamentals_registry_id" ON "fii_monthly_fundamentals" ("fii_registry_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_fii_monthly_fundamentals_reg_ref_date" ON "fii_monthly_fundamentals" ("fii_registry_id", "reference_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_fii_monthly_fundamentals_latest"
	ON "fii_monthly_fundamentals" ("fii_registry_id", "reference_date" DESC, "version" DESC);
