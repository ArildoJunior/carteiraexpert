CREATE TABLE "b3_cotahist_batches" (
	"id" uuid PRIMARY KEY NOT NULL,
	"file_name" text NOT NULL,
	"file_type" text NOT NULL,
	"reference_date" timestamp with time zone,
	"reference_year" integer,
	"file_size" integer NOT NULL,
	"sha256" text NOT NULL,
	"storage_path" text NOT NULL,
	"status" text DEFAULT 'RECEIVED' NOT NULL,
	"parser_name" text DEFAULT 'CotahistFixedLengthParser' NOT NULL,
	"parser_version" text DEFAULT '1.0.0' NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"error_message" text,
	"total_lines" integer DEFAULT 0 NOT NULL,
	"header_count" integer DEFAULT 0 NOT NULL,
	"quote_count" integer DEFAULT 0 NOT NULL,
	"trailer_count" integer DEFAULT 0 NOT NULL,
	"accepted_records" integer DEFAULT 0 NOT NULL,
	"rejected_records" integer DEFAULT 0 NOT NULL,
	"unknown_records" integer DEFAULT 0 NOT NULL,
	"associated_instruments" integer DEFAULT 0 NOT NULL,
	"unassociated_instruments" integer DEFAULT 0 NOT NULL,
	"duplicate_records" integer DEFAULT 0 NOT NULL,
	"trailer_discrepancy" boolean DEFAULT false NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_b3_cotahist_batches_status" ON "b3_cotahist_batches" ("status");
--> statement-breakpoint
CREATE INDEX "idx_b3_cotahist_batches_sha256" ON "b3_cotahist_batches" ("sha256");
--> statement-breakpoint
CREATE INDEX "idx_b3_cotahist_batches_ref_date" ON "b3_cotahist_batches" ("reference_date");
--> statement-breakpoint
CREATE TABLE "b3_historical_quotes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"batch_id" uuid NOT NULL,
	"trade_date" timestamp with time zone NOT NULL,
	"bdi_code" text NOT NULL,
	"ticker" text NOT NULL,
	"market_type" integer NOT NULL,
	"short_name" text NOT NULL,
	"specification" text NOT NULL,
	"forward_term_days" text,
	"currency" text DEFAULT 'BRL' NOT NULL,
	"open_price" numeric(20, 8) NOT NULL,
	"high_price" numeric(20, 8) NOT NULL,
	"low_price" numeric(20, 8) NOT NULL,
	"average_price" numeric(20, 8) NOT NULL,
	"close_price" numeric(20, 8) NOT NULL,
	"best_bid_price" numeric(20, 8),
	"best_ask_price" numeric(20, 8),
	"trade_count" integer DEFAULT 0 NOT NULL,
	"quantity" numeric(28, 10) NOT NULL,
	"financial_volume" numeric(28, 10) NOT NULL,
	"strike_price" numeric(20, 8),
	"correction_indicator" integer,
	"expiration_date" timestamp with time zone,
	"quotation_factor" integer DEFAULT 1 NOT NULL,
	"strike_points" numeric(20, 8),
	"isin" text,
	"distribution_number" integer,
	"asset_id" uuid,
	"record_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_b3_quotes_trade_date" ON "b3_historical_quotes" ("trade_date");
--> statement-breakpoint
CREATE INDEX "idx_b3_quotes_ticker_date" ON "b3_historical_quotes" ("ticker", "trade_date");
--> statement-breakpoint
CREATE INDEX "idx_b3_quotes_batch_id" ON "b3_historical_quotes" ("batch_id");
--> statement-breakpoint
CREATE INDEX "idx_b3_quotes_asset_id" ON "b3_historical_quotes" ("asset_id");
--> statement-breakpoint
CREATE INDEX "idx_b3_quotes_isin" ON "b3_historical_quotes" ("isin");
--> statement-breakpoint
ALTER TABLE "b3_cotahist_batches" ADD CONSTRAINT "b3_cotahist_batches_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "b3_historical_quotes" ADD CONSTRAINT "b3_historical_quotes_batch_id_b3_cotahist_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."b3_cotahist_batches"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "b3_historical_quotes" ADD CONSTRAINT "b3_historical_quotes_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "b3_cotahist_batches" ADD CONSTRAINT "b3_cotahist_batches_sha256_unique" UNIQUE ("sha256");
--> statement-breakpoint
ALTER TABLE "b3_historical_quotes" ADD CONSTRAINT "uq_b3_historical_quotes_record_hash" UNIQUE ("record_hash");
--> statement-breakpoint
ALTER TABLE "b3_cotahist_batches" ADD CONSTRAINT "chk_b3_cotahist_batches_status" CHECK ("status" IN ('RECEIVED', 'VALIDATING', 'PROCESSING', 'COMPLETED', 'FAILED', 'DUPLICATE'));
--> statement-breakpoint
ALTER TABLE "b3_cotahist_batches" ADD CONSTRAINT "chk_b3_cotahist_batches_file_type" CHECK ("file_type" IN ('daily', 'annual'));
--> statement-breakpoint
ALTER TABLE "b3_cotahist_batches" ADD CONSTRAINT "chk_b3_cotahist_batches_file_size" CHECK ("file_size" > 0);
--> statement-breakpoint
ALTER TABLE "b3_cotahist_batches" ADD CONSTRAINT "chk_b3_cotahist_batches_total_lines" CHECK ("total_lines" >= 0);
--> statement-breakpoint
ALTER TABLE "b3_historical_quotes" ADD CONSTRAINT "chk_b3_quotes_open_price" CHECK ("open_price" >= 0);
--> statement-breakpoint
ALTER TABLE "b3_historical_quotes" ADD CONSTRAINT "chk_b3_quotes_high_price" CHECK ("high_price" >= 0);
--> statement-breakpoint
ALTER TABLE "b3_historical_quotes" ADD CONSTRAINT "chk_b3_quotes_low_price" CHECK ("low_price" >= 0);
--> statement-breakpoint
ALTER TABLE "b3_historical_quotes" ADD CONSTRAINT "chk_b3_quotes_average_price" CHECK ("average_price" >= 0);
--> statement-breakpoint
ALTER TABLE "b3_historical_quotes" ADD CONSTRAINT "chk_b3_quotes_close_price" CHECK ("close_price" >= 0);
--> statement-breakpoint
ALTER TABLE "b3_historical_quotes" ADD CONSTRAINT "chk_b3_quotes_quantity" CHECK ("quantity" >= 0);
--> statement-breakpoint
ALTER TABLE "b3_historical_quotes" ADD CONSTRAINT "chk_b3_quotes_financial_volume" CHECK ("financial_volume" >= 0);
--> statement-breakpoint
ALTER TABLE "b3_historical_quotes" ADD CONSTRAINT "chk_b3_quotes_quotation_factor" CHECK ("quotation_factor" >= 1);
