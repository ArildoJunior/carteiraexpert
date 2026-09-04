CREATE TABLE IF NOT EXISTS "tax_calculation_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"portfolio_id" uuid,
	"reference_year" integer NOT NULL,
	"reference_month" integer,
	"status" text DEFAULT 'RUNNING' NOT NULL,
	"error_message" text,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fk_tax_calculation_runs_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
	CONSTRAINT "fk_tax_calculation_runs_portfolio" FOREIGN KEY ("portfolio_id") REFERENCES "portfolios"("id") ON DELETE SET NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tax_calculation_runs_user_id" ON "tax_calculation_runs" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tax_calculation_runs_user_year" ON "tax_calculation_runs" ("user_id", "reference_year");
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "tax_calculation_runs" ADD CONSTRAINT "chk_tax_calculation_runs_status" CHECK ("status" IN ('RUNNING', 'COMPLETED', 'FAILED'));
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "tax_calculation_runs" ADD CONSTRAINT "chk_tax_calculation_runs_month" CHECK ("reference_month" IS NULL OR ("reference_month" >= 1 AND "reference_month" <= 12));
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tax_monthly_summaries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"portfolio_id" uuid,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"total_sales" numeric(28, 10) NOT NULL,
	"total_proceeds" numeric(28, 10) NOT NULL,
	"total_cost" numeric(28, 10) NOT NULL,
	"net_gain_loss" numeric(28, 10) NOT NULL,
	"exempt_threshold_status" text NOT NULL,
	"applicable_rate" numeric(20, 8) NOT NULL,
	"estimated_tax" numeric(28, 10) NOT NULL,
	"accumulated_loss_compensated" numeric(28, 10) DEFAULT '0.0000000000' NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fk_tax_monthly_summaries_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
	CONSTRAINT "fk_tax_monthly_summaries_portfolio" FOREIGN KEY ("portfolio_id") REFERENCES "portfolios"("id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tax_monthly_summaries_user_id" ON "tax_monthly_summaries" ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tax_monthly_summaries_user_year" ON "tax_monthly_summaries" ("user_id", "year");
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "tax_monthly_summaries" ADD CONSTRAINT "uq_tax_monthly_summaries_portfolio" UNIQUE ("user_id", "portfolio_id", "year", "month");
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "tax_monthly_summaries" ADD CONSTRAINT "chk_tax_monthly_summaries_month" CHECK ("month" >= 1 AND "month" <= 12);
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "tax_monthly_summaries" ADD CONSTRAINT "chk_tax_monthly_summaries_status" CHECK ("exempt_threshold_status" IN ('EXEMPT', 'TAXABLE'));
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tax_loss_credits" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"year" integer NOT NULL,
	"month_origin" integer NOT NULL,
	"asset_symbol" text NOT NULL,
	"original_loss_amount" numeric(28, 10) NOT NULL,
	"remaining_amount" numeric(28, 10) NOT NULL,
	"expires_on" timestamp with time zone NOT NULL,
	CONSTRAINT "fk_tax_loss_credits_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_tax_loss_credits_user_id" ON "tax_loss_credits" ("user_id");
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "tax_loss_credits" ADD CONSTRAINT "uq_tax_loss_credits_origin" UNIQUE ("user_id", "year", "month_origin", "asset_symbol");
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "tax_loss_credits" ADD CONSTRAINT "chk_tax_loss_credits_month" CHECK ("month_origin" >= 1 AND "month_origin" <= 12);
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "tax_loss_credits" ADD CONSTRAINT "chk_tax_loss_credits_remaining" CHECK ("remaining_amount" >= 0 AND "remaining_amount" <= "original_loss_amount");
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "user_chart_preferences" ADD COLUMN IF NOT EXISTS "user_tax_preferences" jsonb;
--> statement-breakpoint
ALTER TABLE "user_chart_preferences" DROP CONSTRAINT IF EXISTS "chk_user_chart_preferences_area";
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "user_chart_preferences" ADD CONSTRAINT "chk_user_chart_preferences_area" CHECK ("chart_area" IN ('portfolio_evolution', 'dashboard_allocation', 'portfolio_allocation', 'tax_preferences'));
EXCEPTION
	WHEN duplicate_object THEN null;
END $$;
