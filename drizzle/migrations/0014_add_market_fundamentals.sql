CREATE TABLE "asset_fundamentals" (
	"id" uuid PRIMARY KEY NOT NULL,
	"asset_id" uuid NOT NULL,
	"reference_period" text NOT NULL,
	"period_type" text NOT NULL,
	"statement_type" text DEFAULT 'CONSOLIDATED' NOT NULL,
	"reference_date" timestamp with time zone NOT NULL,
	"filing_date" timestamp with time zone,
	"source" text DEFAULT 'cvm' NOT NULL,
	"source_reference" text,
	"version" integer DEFAULT 1 NOT NULL,
	"is_restated" boolean DEFAULT false NOT NULL,
	"currency" text DEFAULT 'BRL' NOT NULL,
	"net_revenue" numeric(20, 4),
	"ebitda" numeric(20, 4),
	"net_income" numeric(20, 4),
	"total_equity" numeric(20, 4),
	"total_assets" numeric(20, 4),
	"gross_debt" numeric(20, 4),
	"cash_equivalents" numeric(20, 4),
	"shares_count" numeric(28, 10),
	"dividends_declared" numeric(20, 4),
	"notes" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_asset_fundamentals_versioning" UNIQUE("asset_id","reference_period","period_type","statement_type","source","version")
);
--> statement-breakpoint
ALTER TABLE "asset_fundamentals" ADD CONSTRAINT "asset_fundamentals_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "asset_fundamentals" ADD CONSTRAINT "asset_fundamentals_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_asset_fundamentals_asset_id" ON "asset_fundamentals" USING btree ("asset_id");
--> statement-breakpoint
CREATE INDEX "idx_asset_fundamentals_ref_date" ON "asset_fundamentals" USING btree ("reference_date");
--> statement-breakpoint
ALTER TABLE "asset_fundamentals" ADD CONSTRAINT "chk_asset_fundamentals_period_type" CHECK ("period_type" IN ('annual', 'quarterly', 'ttm'));
--> statement-breakpoint
ALTER TABLE "asset_fundamentals" ADD CONSTRAINT "chk_asset_fundamentals_stmt_type" CHECK ("statement_type" IN ('CONSOLIDATED', 'INDIVIDUAL'));
--> statement-breakpoint
ALTER TABLE "asset_fundamentals" ADD CONSTRAINT "chk_asset_fundamentals_shares_count" CHECK ("shares_count" IS NULL OR "shares_count" > 0);
--> statement-breakpoint
ALTER TABLE "asset_fundamentals" ADD CONSTRAINT "chk_asset_fundamentals_dividends_declared" CHECK ("dividends_declared" IS NULL OR "dividends_declared" >= 0);
--> statement-breakpoint
ALTER TABLE "asset_fundamentals" ADD CONSTRAINT "chk_asset_fundamentals_version" CHECK ("version" >= 1);
