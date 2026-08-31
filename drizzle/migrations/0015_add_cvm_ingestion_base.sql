CREATE TABLE "cvm_companies" (
	"id" uuid PRIMARY KEY NOT NULL,
	"cvm_code" text NOT NULL,
	"cnpj" text NOT NULL,
	"legal_name" text NOT NULL,
	"trade_name" text,
	"industry_sector" text,
	"market_type" text,
	"status" text DEFAULT 'ATIVO' NOT NULL,
	"registration_date" timestamp with time zone,
	"cancellation_date" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_cvm_companies_cvm_code" UNIQUE("cvm_code"),
	CONSTRAINT "uq_cvm_companies_cnpj" UNIQUE("cnpj")
);
--> statement-breakpoint
CREATE INDEX "idx_cvm_companies_status" ON "cvm_companies" USING btree ("status");
--> statement-breakpoint
CREATE INDEX "idx_cvm_companies_industry_sector" ON "cvm_companies" USING btree ("industry_sector");
--> statement-breakpoint
ALTER TABLE "cvm_companies" ADD CONSTRAINT "chk_cvm_companies_status" CHECK ("status" IN ('ATIVO', 'CANCELADA', 'SUSPENSO(A) - DECISÃO ADM'));
--> statement-breakpoint
ALTER TABLE "cvm_companies" ADD CONSTRAINT "chk_cvm_companies_cnpj_len" CHECK (length("cnpj") = 14);
--> statement-breakpoint
ALTER TABLE "cvm_companies" ADD CONSTRAINT "chk_cvm_companies_cvm_code_len" CHECK (length("cvm_code") = 6);
--> statement-breakpoint

CREATE TABLE "cvm_source_files" (
	"id" uuid PRIMARY KEY NOT NULL,
	"file_name" text NOT NULL,
	"document_type" text NOT NULL,
	"reference_year" integer,
	"source_url" text NOT NULL,
	"sha256" text NOT NULL,
	"file_size" integer NOT NULL,
	"storage_path" text NOT NULL,
	"status" text DEFAULT 'DOWNLOADED' NOT NULL,
	"http_etag" text,
	"http_last_modified" text,
	"downloaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_cvm_source_files_sha256" UNIQUE("sha256")
);
--> statement-breakpoint
CREATE INDEX "idx_cvm_source_files_doc_year" ON "cvm_source_files" USING btree ("document_type", "reference_year");
--> statement-breakpoint
CREATE INDEX "idx_cvm_source_files_status" ON "cvm_source_files" USING btree ("status");
--> statement-breakpoint
ALTER TABLE "cvm_source_files" ADD CONSTRAINT "chk_cvm_source_files_status" CHECK ("status" IN ('DOWNLOADED', 'AVAILABLE', 'INVALID'));
--> statement-breakpoint
ALTER TABLE "cvm_source_files" ADD CONSTRAINT "chk_cvm_source_files_doc_type" CHECK ("document_type" IN ('CAD', 'DFP', 'ITR', 'FCA', 'META'));
--> statement-breakpoint
ALTER TABLE "cvm_source_files" ADD CONSTRAINT "chk_cvm_source_files_size" CHECK ("file_size" > 0);
--> statement-breakpoint

CREATE TABLE "cvm_ingestion_runs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"file_id" uuid NOT NULL,
	"worker_id" uuid NOT NULL,
	"parser_version" text DEFAULT '1.0.0' NOT NULL,
	"execution_mode" text DEFAULT 'CLI_MANUAL' NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"heartbeat_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lock_expires_at" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"companies_read" integer DEFAULT 0 NOT NULL,
	"statements_inserted" integer DEFAULT 0 NOT NULL,
	"statements_updated" integer DEFAULT 0 NOT NULL,
	"statements_skipped" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "cvm_ingestion_runs" ADD CONSTRAINT "cvm_ingestion_runs_file_id_cvm_source_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."cvm_source_files"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_cvm_ingestion_runs_file_id" ON "cvm_ingestion_runs" USING btree ("file_id");
--> statement-breakpoint
CREATE INDEX "idx_cvm_ingestion_runs_status" ON "cvm_ingestion_runs" USING btree ("status");
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_cvm_ingestion_runs_active_file" ON "cvm_ingestion_runs" USING btree ("file_id") WHERE "status" = 'RUNNING';
--> statement-breakpoint
ALTER TABLE "cvm_ingestion_runs" ADD CONSTRAINT "chk_cvm_ingestion_runs_status" CHECK ("status" IN ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'ABANDONED', 'CANCELLED', 'DRY_RUN_SUCCESS', 'DRY_RUN_FAILED'));
--> statement-breakpoint
ALTER TABLE "cvm_ingestion_runs" ADD CONSTRAINT "chk_cvm_ingestion_runs_mode" CHECK ("execution_mode" IN ('CLI_MANUAL', 'CLI_SCHEDULED', 'DRY_RUN'));
--> statement-breakpoint
ALTER TABLE "cvm_ingestion_runs" ADD CONSTRAINT "chk_cvm_ingestion_runs_counters" CHECK ("companies_read" >= 0 AND "statements_inserted" >= 0 AND "statements_updated" >= 0 AND "statements_skipped" >= 0);
--> statement-breakpoint

CREATE TABLE "cvm_company_assets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"share_class" text,
	"status" text DEFAULT 'PENDING_REVIEW' NOT NULL,
	"match_method" text DEFAULT 'MANUAL' NOT NULL,
	"justification" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_cvm_company_assets_pair" UNIQUE("company_id","asset_id")
);
--> statement-breakpoint
ALTER TABLE "cvm_company_assets" ADD CONSTRAINT "cvm_company_assets_company_id_cvm_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."cvm_companies"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "cvm_company_assets" ADD CONSTRAINT "cvm_company_assets_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "idx_cvm_company_assets_status" ON "cvm_company_assets" USING btree ("status");
--> statement-breakpoint
CREATE INDEX "idx_cvm_company_assets_asset_id" ON "cvm_company_assets" USING btree ("asset_id");
--> statement-breakpoint
ALTER TABLE "cvm_company_assets" ADD CONSTRAINT "chk_cvm_company_assets_status" CHECK ("status" IN ('APPROVED', 'PENDING_REVIEW', 'REJECTED'));
--> statement-breakpoint
ALTER TABLE "cvm_company_assets" ADD CONSTRAINT "chk_cvm_company_assets_method" CHECK ("match_method" IN ('CURATED_SEED', 'CNPJ_EXACT', 'MANUAL', 'HEURISTIC'));
