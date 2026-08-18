CREATE TABLE "market_quotes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"asset_id" uuid NOT NULL,
	"price" numeric(20, 8) NOT NULL,
	"currency" text DEFAULT 'BRL' NOT NULL,
	"quote_date" timestamp with time zone NOT NULL,
	"source" text DEFAULT 'internal' NOT NULL,
	"delay_status" text DEFAULT 'eod' NOT NULL,
	"notes" text,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_market_quotes_asset_id" ON "market_quotes" ("asset_id");
--> statement-breakpoint
CREATE INDEX "idx_market_quotes_quote_date" ON "market_quotes" ("quote_date");
--> statement-breakpoint
CREATE TABLE "exchange_rates" (
	"id" uuid PRIMARY KEY NOT NULL,
	"from_currency" text NOT NULL,
	"to_currency" text DEFAULT 'BRL' NOT NULL,
	"rate" numeric(20, 8) NOT NULL,
	"rate_date" timestamp with time zone NOT NULL,
	"source" text DEFAULT 'internal' NOT NULL,
	"delay_status" text DEFAULT 'eod' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_exchange_rates_from_to" ON "exchange_rates" ("from_currency", "to_currency");
--> statement-breakpoint
CREATE INDEX "idx_exchange_rates_rate_date" ON "exchange_rates" ("rate_date");
--> statement-breakpoint
ALTER TABLE "market_quotes" ADD CONSTRAINT "market_quotes_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "market_quotes" ADD CONSTRAINT "market_quotes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "market_quotes" ADD CONSTRAINT "uq_market_quotes_asset_date" UNIQUE ("asset_id", "quote_date");
--> statement-breakpoint
ALTER TABLE "exchange_rates" ADD CONSTRAINT "uq_exchange_rates_pair_date" UNIQUE ("from_currency", "to_currency", "rate_date");
--> statement-breakpoint
ALTER TABLE "market_quotes" ADD CONSTRAINT "chk_market_quotes_price" CHECK ("price" >= 0);
--> statement-breakpoint
ALTER TABLE "exchange_rates" ADD CONSTRAINT "chk_exchange_rates_rate" CHECK ("rate" > 0);
