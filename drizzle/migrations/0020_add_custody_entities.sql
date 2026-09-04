CREATE TABLE IF NOT EXISTS "custody_institutions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"code" text,
	"country" text DEFAULT 'BR' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "custody_institutions_code_unique" UNIQUE("code")
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "custody_institutions" ADD CONSTRAINT "chk_custody_institutions_status" CHECK ("status" IN ('active', 'inactive'));
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "custody_accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"portfolio_id" uuid NOT NULL,
	"institution_id" uuid NOT NULL,
	"name" text NOT NULL,
	"account_number" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "fk_custody_accounts_portfolio" FOREIGN KEY ("portfolio_id") REFERENCES "portfolios"("id") ON DELETE CASCADE,
	CONSTRAINT "fk_custody_accounts_institution" FOREIGN KEY ("institution_id") REFERENCES "custody_institutions"("id") ON DELETE RESTRICT
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "custody_accounts" ADD CONSTRAINT "chk_custody_accounts_status" CHECK ("status" IN ('active', 'archived'));
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_custody_accounts_portfolio_id" ON "custody_accounts" ("portfolio_id") WHERE "deleted_at" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_custody_accounts_institution_id" ON "custody_accounts" ("institution_id");
--> statement-breakpoint
ALTER TABLE "portfolio_events" ADD COLUMN IF NOT EXISTS "custody_account_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "portfolio_events" ADD CONSTRAINT "fk_portfolio_events_custody_account" FOREIGN KEY ("custody_account_id") REFERENCES "custody_accounts"("id") ON DELETE SET NULL;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_portfolio_events_custody_account" ON "portfolio_events" ("custody_account_id") WHERE "custody_account_id" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "cash_accounts" ADD COLUMN IF NOT EXISTS "custody_account_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "cash_accounts" ADD CONSTRAINT "fk_cash_accounts_custody_account" FOREIGN KEY ("custody_account_id") REFERENCES "custody_accounts"("id") ON DELETE SET NULL;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_cash_accounts_custody_account" ON "cash_accounts" ("custody_account_id") WHERE "custody_account_id" IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "import_batches" ADD COLUMN IF NOT EXISTS "custody_account_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "import_batches" ADD CONSTRAINT "fk_import_batches_custody_account" FOREIGN KEY ("custody_account_id") REFERENCES "custody_accounts"("id") ON DELETE SET NULL;
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_import_batches_custody_account" ON "import_batches" ("custody_account_id") WHERE "custody_account_id" IS NOT NULL;
--> statement-breakpoint
-- Seed inicial do catálogo canônico de instituições de custódia
INSERT INTO "custody_institutions" ("id", "name", "code", "country", "status", "created_at", "updated_at") VALUES
	(gen_random_uuid(), 'XP Investimentos', '102', 'BR', 'active', now(), now()),
	(gen_random_uuid(), 'BTG Pactual', '208', 'BR', 'active', now(), now()),
	(gen_random_uuid(), 'NuInvest / Nubank', '260', 'BR', 'active', now(), now()),
	(gen_random_uuid(), 'Clear Corretora', '003', 'BR', 'active', now(), now()),
	(gen_random_uuid(), 'Rico Investimentos', '386', 'BR', 'active', now(), now()),
	(gen_random_uuid(), 'Banco Inter', '077', 'BR', 'active', now(), now()),
	(gen_random_uuid(), 'Itaú Corretora', '341', 'BR', 'active', now(), now()),
	(gen_random_uuid(), 'Bradesco Corretora / Ágora', '237', 'BR', 'active', now(), now()),
	(gen_random_uuid(), 'Santander Corretora', '033', 'BR', 'active', now(), now()),
	(gen_random_uuid(), 'C6 Bank', '336', 'BR', 'active', now(), now()),
	(gen_random_uuid(), 'Genial Investimentos', '125', 'BR', 'active', now(), now()),
	(gen_random_uuid(), 'Guide Investimentos', '173', 'BR', 'active', now(), now()),
	(gen_random_uuid(), 'Órama Investimentos', '325', 'BR', 'active', now(), now()),
	(gen_random_uuid(), 'Avenue Securities', 'AVENUE', 'US', 'active', now(), now()),
	(gen_random_uuid(), 'Interactive Brokers', 'IBKR', 'US', 'active', now(), now()),
	(gen_random_uuid(), 'Charles Schwab', 'SCHW', 'US', 'active', now(), now()),
	(gen_random_uuid(), 'Binance', 'BINANCE', 'GLOBAL', 'active', now(), now()),
	(gen_random_uuid(), 'Mercado Bitcoin', 'MB', 'BR', 'active', now(), now()),
	(gen_random_uuid(), 'Coinbase', 'COINBASE', 'US', 'active', now(), now()),
	(gen_random_uuid(), 'Outra Instituição', 'OTHER', 'GLOBAL', 'active', now(), now())
ON CONFLICT ("code") DO NOTHING;
