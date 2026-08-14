CREATE TABLE "portfolios" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"base_currency" text DEFAULT 'BRL' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "idx_portfolios_user_id" ON "portfolios" ("user_id") WHERE "deleted_at" IS NULL;
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"ticker" text NOT NULL,
	"name" text NOT NULL,
	"asset_type" text NOT NULL,
	"market" text DEFAULT 'B3' NOT NULL,
	"currency" text DEFAULT 'BRL' NOT NULL,
	"is_custom" boolean DEFAULT false NOT NULL,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_assets_ticker" ON "assets" ("ticker");
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_assets_global_ticker_market" ON "assets" ("ticker", "market") WHERE "user_id" IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "idx_assets_user_ticker_market" ON "assets" ("user_id", "ticker", "market") WHERE "user_id" IS NOT NULL;
--> statement-breakpoint
CREATE TABLE "portfolio_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"portfolio_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"type" text NOT NULL,
	"trade_date" timestamp with time zone NOT NULL,
	"settlement_date" timestamp with time zone,
	"quantity" numeric(28, 10) NOT NULL,
	"unit_price" numeric(20, 8) NOT NULL,
	"fees" numeric(20, 8) DEFAULT '0.00000000' NOT NULL,
	"currency" text DEFAULT 'BRL' NOT NULL,
	"notes" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"cancellation_reason" text
);
--> statement-breakpoint
CREATE INDEX "idx_portfolio_events_portfolio_id" ON "portfolio_events" ("portfolio_id") WHERE "deleted_at" IS NULL;
--> statement-breakpoint
CREATE INDEX "idx_portfolio_events_asset_id" ON "portfolio_events" ("asset_id");
--> statement-breakpoint
CREATE INDEX "idx_portfolio_events_trade_date" ON "portfolio_events" ("trade_date" DESC);
--> statement-breakpoint
ALTER TABLE "portfolios" ADD CONSTRAINT "portfolios_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "portfolio_events" ADD CONSTRAINT "portfolio_events_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "portfolio_events" ADD CONSTRAINT "portfolio_events_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "portfolio_events" ADD CONSTRAINT "portfolio_events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "chk_assets_custom_user" CHECK (("is_custom" = false AND "user_id" IS NULL) OR ("is_custom" = true AND "user_id" IS NOT NULL));
--> statement-breakpoint
ALTER TABLE "portfolio_events" ADD CONSTRAINT "chk_portfolio_events_quantity" CHECK ("quantity" > 0);
--> statement-breakpoint
ALTER TABLE "portfolio_events" ADD CONSTRAINT "chk_portfolio_events_unit_price" CHECK ("unit_price" >= 0);
--> statement-breakpoint
ALTER TABLE "portfolio_events" ADD CONSTRAINT "chk_portfolio_events_fees" CHECK ("fees" >= 0);
