CREATE TABLE IF NOT EXISTS "options_contracts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"portfolio_id" uuid NOT NULL,
	"underlying_asset_id" uuid NOT NULL,
	"custody_account_id" uuid,
	"ticker" text NOT NULL,
	"option_type" text NOT NULL,
	"option_style" text DEFAULT 'AMERICAN' NOT NULL,
	"direction" text NOT NULL,
	"strike_price" numeric(20, 8) NOT NULL,
	"premium_paid_received" numeric(20, 8) NOT NULL,
	"quantity" numeric(20, 8) NOT NULL,
	"expiration_date" date NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "fk_options_contracts_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
	CONSTRAINT "fk_options_contracts_portfolio" FOREIGN KEY ("portfolio_id") REFERENCES "portfolios"("id") ON DELETE CASCADE,
	CONSTRAINT "fk_options_contracts_underlying_asset" FOREIGN KEY ("underlying_asset_id") REFERENCES "assets"("id") ON DELETE RESTRICT,
	CONSTRAINT "fk_options_contracts_custody_account" FOREIGN KEY ("custody_account_id") REFERENCES "custody_accounts"("id") ON DELETE SET NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "options_contracts" ADD CONSTRAINT "chk_options_contracts_type" CHECK ("option_type" IN ('CALL', 'PUT'));
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "options_contracts" ADD CONSTRAINT "chk_options_contracts_style" CHECK ("option_style" IN ('AMERICAN', 'EUROPEAN'));
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "options_contracts" ADD CONSTRAINT "chk_options_contracts_direction" CHECK ("direction" IN ('BUY', 'SELL'));
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "options_contracts" ADD CONSTRAINT "chk_options_contracts_status" CHECK ("status" IN ('OPEN', 'CLOSED', 'EXPIRED'));
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "options_contracts" ADD CONSTRAINT "chk_options_contracts_strike" CHECK ("strike_price" > 0);
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "options_contracts" ADD CONSTRAINT "chk_options_contracts_premium" CHECK ("premium_paid_received" >= 0);
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "options_contracts" ADD CONSTRAINT "chk_options_contracts_quantity" CHECK ("quantity" > 0);
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_options_contracts_user_id" ON "options_contracts" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_options_contracts_portfolio_id" ON "options_contracts" ("portfolio_id") WHERE "deleted_at" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_options_contracts_underlying_asset_id" ON "options_contracts" ("underlying_asset_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_options_contracts_custody_account_id" ON "options_contracts" ("custody_account_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_options_contracts_expiration_date" ON "options_contracts" ("expiration_date");
