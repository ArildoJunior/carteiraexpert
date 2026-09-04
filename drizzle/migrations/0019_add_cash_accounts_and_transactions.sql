CREATE TABLE IF NOT EXISTS "cash_accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"portfolio_id" uuid NOT NULL,
	"name" text NOT NULL,
	"currency" text DEFAULT 'BRL' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "fk_cash_accounts_portfolio" FOREIGN KEY ("portfolio_id") REFERENCES "portfolios"("id") ON DELETE CASCADE
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "cash_accounts" ADD CONSTRAINT "chk_cash_accounts_status" CHECK ("status" IN ('active', 'archived'));
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "cash_accounts" ADD CONSTRAINT "chk_cash_accounts_currency" CHECK ("currency" IN ('BRL', 'USD', 'EUR'));
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_cash_accounts_portfolio_id" ON "cash_accounts" ("portfolio_id") WHERE "deleted_at" IS NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "cash_transactions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"cash_account_id" uuid NOT NULL,
	"type" text NOT NULL,
	"amount" numeric(20, 8) NOT NULL,
	"transaction_date" timestamp with time zone NOT NULL,
	"description" text,
	"portfolio_event_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fk_cash_transactions_cash_account" FOREIGN KEY ("cash_account_id") REFERENCES "cash_accounts"("id") ON DELETE CASCADE,
	CONSTRAINT "fk_cash_transactions_portfolio_event" FOREIGN KEY ("portfolio_event_id") REFERENCES "portfolio_events"("id") ON DELETE SET NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "cash_transactions" ADD CONSTRAINT "chk_cash_transactions_type" CHECK ("type" IN ('DEPOSIT', 'WITHDRAWAL'));
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "cash_transactions" ADD CONSTRAINT "chk_cash_transactions_amount_positive" CHECK ("amount" > 0);
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_cash_transactions_account_date" ON "cash_transactions" ("cash_account_id", "transaction_date" DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_cash_transactions_portfolio_event" ON "cash_transactions" ("portfolio_event_id") WHERE "portfolio_event_id" IS NOT NULL;
--> statement-breakpoint
-- Backfill idempotente: cria Conta Corrente Principal para carteiras existentes e ativas que ainda não possuem nenhuma conta de caixa
INSERT INTO "cash_accounts" ("id", "portfolio_id", "name", "currency", "status", "created_at", "updated_at")
SELECT 
	gen_random_uuid(),
	p."id",
	'Conta Corrente Principal',
	p."base_currency",
	'active',
	now(),
	now()
FROM "portfolios" p
WHERE p."deleted_at" IS NULL
AND NOT EXISTS (
	SELECT 1 FROM "cash_accounts" ca 
	WHERE ca."portfolio_id" = p."id" 
	AND ca."deleted_at" IS NULL
);
