-- Migração 0011: Adicionar Módulo de Importações Revisáveis (Fase 07)

CREATE TABLE "import_batches" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"portfolio_id" uuid NOT NULL,
	"file_name" text NOT NULL,
	"file_size" integer NOT NULL,
	"file_format" text NOT NULL,
	"status" text DEFAULT 'pending_review' NOT NULL,
	"total_records" integer DEFAULT 0 NOT NULL,
	"valid_records" integer DEFAULT 0 NOT NULL,
	"warning_records" integer DEFAULT 0 NOT NULL,
	"error_records" integer DEFAULT 0 NOT NULL,
	"raw_content_hash" text NOT NULL,
	"error_message" text,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_import_batches_status" CHECK ("status" IN ('pending_review', 'confirmed', 'rejected', 'failed')),
	CONSTRAINT "chk_import_batches_file_size" CHECK ("file_size" > 0),
	CONSTRAINT "chk_import_batches_total_records" CHECK ("total_records" >= 0)
);
--> statement-breakpoint
CREATE TABLE "import_batch_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"batch_id" uuid NOT NULL,
	"line_number" integer NOT NULL,
	"raw_line" text NOT NULL,
	"status" text NOT NULL,
	"action_type" text NOT NULL,
	"direction" text,
	"raw_ticker" text NOT NULL,
	"resolved_asset_id" uuid,
	"trade_date" timestamp with time zone NOT NULL,
	"settlement_date" timestamp with time zone,
	"quantity" numeric(28, 10) NOT NULL,
	"unit_price" numeric(20, 8) NOT NULL,
	"fees" numeric(20, 8) DEFAULT '0.00000000' NOT NULL,
	"currency" text DEFAULT 'BRL' NOT NULL,
	"notes" text,
	"validation_errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_duplicate" boolean DEFAULT false NOT NULL,
	"duplicate_reason" text,
	"is_excluded" boolean DEFAULT false NOT NULL,
	"imported_portfolio_event_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_import_batch_items_status" CHECK ("status" IN ('valid', 'warning', 'error', 'duplicate', 'ignored')),
	CONSTRAINT "chk_import_batch_items_action_type" CHECK ("action_type" IN ('BUY', 'SELL', 'TRANSFER_IN', 'TRANSFER_OUT', 'MANUAL_ADJUSTMENT')),
	CONSTRAINT "chk_import_batch_items_line_number" CHECK ("line_number" >= 1),
	CONSTRAINT "chk_import_batch_items_quantity" CHECK ("quantity" > 0),
	CONSTRAINT "chk_import_batch_items_unit_price" CHECK ("unit_price" >= 0),
	CONSTRAINT "chk_import_batch_items_fees" CHECK ("fees" >= 0),
	CONSTRAINT "chk_import_batch_items_direction" CHECK (("action_type" = 'MANUAL_ADJUSTMENT' AND "direction" IS NOT NULL AND "direction" IN ('IN', 'OUT')) OR ("action_type" <> 'MANUAL_ADJUSTMENT' AND "direction" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_portfolio_id_portfolios_id_fk" FOREIGN KEY ("portfolio_id") REFERENCES "public"."portfolios"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "import_batch_items" ADD CONSTRAINT "import_batch_items_batch_id_import_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."import_batches"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "import_batch_items" ADD CONSTRAINT "import_batch_items_resolved_asset_id_assets_id_fk" FOREIGN KEY ("resolved_asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "import_batch_items" ADD CONSTRAINT "import_batch_items_imported_portfolio_event_id_portfolio_events_id_fk" FOREIGN KEY ("imported_portfolio_event_id") REFERENCES "public"."portfolio_events"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_import_batches_user_portfolio" ON "import_batches" USING btree ("user_id","portfolio_id");
--> statement-breakpoint
CREATE INDEX "idx_import_batches_hash" ON "import_batches" USING btree ("user_id","portfolio_id","raw_content_hash");
--> statement-breakpoint
CREATE INDEX "idx_import_batch_items_batch_id" ON "import_batch_items" USING btree ("batch_id");
--> statement-breakpoint
CREATE INDEX "idx_import_batch_items_status" ON "import_batch_items" USING btree ("batch_id","status");
