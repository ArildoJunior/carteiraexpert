ALTER TABLE "import_jobs" ADD COLUMN "file_hash" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_import_jobs_file_hash" ON "import_jobs" USING btree ("user_id","file_hash");