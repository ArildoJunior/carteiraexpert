CREATE TABLE IF NOT EXISTS "document_evidence" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "document_id" uuid NOT NULL,
  "analysis_id" uuid,
  "evidence_type" text NOT NULL,
  "source_kind" text NOT NULL,
  "field_name" text NOT NULL,
  "claim" text NOT NULL,
  "source_text" text NOT NULL,
  "document_hash" text NOT NULL,
  "source_text_hash" text NOT NULL,
  "evidence_hash" text NOT NULL,
  "page_number" integer,
  "section" text,
  "start_offset" integer,
  "end_offset" integer,
  "sequence" integer DEFAULT 0 NOT NULL,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "document_evidence"
    ADD CONSTRAINT "document_evidence_document_id_documents_id_fk"
    FOREIGN KEY ("document_id") REFERENCES "public"."documents"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "document_evidence"
    ADD CONSTRAINT "document_evidence_analysis_id_document_analyses_id_fk"
    FOREIGN KEY ("analysis_id") REFERENCES "public"."document_analyses"("id")
    ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_evidence_document_idx"
  ON "document_evidence" USING btree ("document_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_evidence_analysis_idx"
  ON "document_evidence" USING btree ("analysis_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_evidence_type_idx"
  ON "document_evidence" USING btree ("evidence_type");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "document_evidence_hash_idx"
  ON "document_evidence" USING btree ("evidence_hash");
