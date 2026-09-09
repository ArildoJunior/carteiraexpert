-- ==============================================================================
-- Migração 0025: Tabelas de Fundamentos e Cadastro de FIIs (CVM)
--
-- Criação de tabelas dedicadas para fundamentos de Fundos Imobiliários:
-- 1. cvm_fii_registry (de-para oficial CNPJ <-> asset_id, tickers e dados cadastrais CVM)
-- 2. fii_monthly_fundamentals (demonstrações mensais estruturadas, PL, VP/cota, cotas emitidas, cotistas)
-- ==============================================================================

CREATE TABLE IF NOT EXISTS "cvm_fii_registry" (
	"id" uuid PRIMARY KEY NOT NULL,
	"asset_id" uuid NOT NULL,
	"cnpj" text NOT NULL,
	"legal_name" text NOT NULL,
	"ticker" text,
	"isin" text,
	"source" text DEFAULT 'cvm' NOT NULL,
	"source_updated_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fk_cvm_fii_registry_asset" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "cvm_fii_registry" ADD CONSTRAINT "uq_cvm_fii_registry_asset_id" UNIQUE ("asset_id");
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "cvm_fii_registry" ADD CONSTRAINT "uq_cvm_fii_registry_cnpj" UNIQUE ("cnpj");
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_cvm_fii_registry_ticker" ON "cvm_fii_registry" ("ticker");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_cvm_fii_registry_isin" ON "cvm_fii_registry" ("isin");
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "cvm_fii_registry" ADD CONSTRAINT "chk_cvm_fii_registry_cnpj_len" CHECK (length("cnpj") = 14);
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fii_monthly_fundamentals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"asset_id" uuid NOT NULL,
	"reference_date" date NOT NULL,
	"filing_date" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"source" text DEFAULT 'cvm_inf_mensal' NOT NULL,
	"source_reference" text,
	"net_asset_value" numeric(20, 4),
	"quota_equity_value" numeric(20, 8),
	"issued_quotas" numeric(28, 10),
	"total_assets" numeric(20, 4),
	"total_liabilities" numeric(20, 4),
	"cash_equivalents" numeric(20, 4),
	"dividend_declared_per_quota" numeric(20, 8),
	"investors_count" integer,
	"individual_investors_count" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fk_fii_monthly_fundamentals_asset" FOREIGN KEY ("asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "fii_monthly_fundamentals" ADD CONSTRAINT "uq_fii_monthly_fundamentals_versioning" UNIQUE ("asset_id", "reference_date", "version", "source");
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_fii_monthly_fundamentals_asset_id" ON "fii_monthly_fundamentals" ("asset_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_fii_monthly_fundamentals_ref_date" ON "fii_monthly_fundamentals" ("reference_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_fii_monthly_fundamentals_asset_ref_date" ON "fii_monthly_fundamentals" ("asset_id", "reference_date");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_fii_monthly_fundamentals_latest" ON "fii_monthly_fundamentals" ("asset_id", "reference_date" DESC, "version" DESC);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "fii_monthly_fundamentals" ADD CONSTRAINT "chk_fii_monthly_fundamentals_version" CHECK ("version" >= 1);
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "fii_monthly_fundamentals" ADD CONSTRAINT "chk_fii_monthly_fundamentals_issued_quotas" CHECK ("issued_quotas" IS NULL OR "issued_quotas" >= 0);
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "fii_monthly_fundamentals" ADD CONSTRAINT "chk_fii_monthly_fundamentals_dividend_declared" CHECK ("dividend_declared_per_quota" IS NULL OR "dividend_declared_per_quota" >= 0);
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "fii_monthly_fundamentals" ADD CONSTRAINT "chk_fii_monthly_fundamentals_investors_count" CHECK ("investors_count" IS NULL OR "investors_count" >= 0);
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "fii_monthly_fundamentals" ADD CONSTRAINT "chk_fii_monthly_fundamentals_individual_investors" CHECK ("individual_investors_count" IS NULL OR "individual_investors_count" >= 0);
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
