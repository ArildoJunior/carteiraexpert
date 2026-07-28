CREATE TYPE "public"."ai_provider" AS ENUM('openai', 'anthropic');--> statement-breakpoint
CREATE TYPE "public"."editorial_status" AS ENUM('draft', 'review', 'approved', 'published', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."sentiment" AS ENUM('positivo', 'neutro', 'negativo');--> statement-breakpoint
CREATE TYPE "public"."document_status" AS ENUM('uploaded', 'extracting', 'ocr_processing', 'extracted', 'analyzing', 'analyzed', 'error');--> statement-breakpoint
CREATE TYPE "public"."document_type" AS ENUM('informe_rendimento', 'relatorio_fii', 'fato_relevante', 'dre', 'balanco', 'prospecto', 'release_resultados', 'outros');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'editor', 'admin');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_costs" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "user_id" uuid NOT NULL,
    "year_month" text NOT NULL,
    "provider" "ai_provider" NOT NULL,
    "model" text NOT NULL,
    "input_tokens" integer DEFAULT 0 NOT NULL,
    "output_tokens" integer DEFAULT 0 NOT NULL,
    "cost_usd" numeric(10, 6) DEFAULT '0' NOT NULL,
    "documents_count" integer DEFAULT 0 NOT NULL,
    "provider_breakdown" jsonb,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "document_analyses" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "document_id" uuid NOT NULL,
    "version" integer DEFAULT 1 NOT NULL,
    "detected_type" "document_type",
    "key_metrics" jsonb,
    "summary" text,
    "attention_points" jsonb,
    "sentiment" "sentiment",
    "confidence" numeric(4, 3),
    "provider" "ai_provider",
    "model" text,
    "input_tokens" integer,
    "output_tokens" integer,
    "cost_usd" numeric(10, 6),
    "editorial_status" "editorial_status" DEFAULT 'draft' NOT NULL,
    "reviewed_by_user_id" uuid,
    "published_at" timestamp with time zone,
    "error_message" text,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "documents" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
    "uploaded_by_user_id" uuid NOT NULL,
    "original_name" text NOT NULL,
    "mime_type" text NOT NULL,
    "size_bytes" integer NOT NULL,
    "content_hash" text NOT NULL,
    "blob_url" text NOT NULL,
    "document_type" "document_type",
    "ticker" text,
    "asset_id" uuid,
    "status" "document_status" DEFAULT 'uploaded' NOT NULL,
    "error_message" text,
    "extracted_text" text,
    "metadata" jsonb,
    "created_at" timestamp with time zone DEFAULT now() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT "documents_content_hash_unique" UNIQUE("content_hash")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "role" "user_role" DEFAULT 'user' NOT NULL;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "ai_costs" ADD CONSTRAINT "ai_costs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_analyses" ADD CONSTRAINT "document_analyses_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "document_analyses" ADD CONSTRAINT "document_analyses_reviewed_by_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documents" ADD CONSTRAINT "documents_uploaded_by_user_id_users_id_fk" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "documents" ADD CONSTRAINT "documents_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "ai_costs_user_month_provider_model_idx" ON "ai_costs" USING btree ("user_id","year_month","provider","model");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "document_analyses_document_version_idx" ON "document_analyses" USING btree ("document_id","version");