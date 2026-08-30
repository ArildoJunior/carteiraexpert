ALTER TABLE "b3_cotahist_batches" ALTER COLUMN "reference_date" TYPE date USING ("reference_date" AT TIME ZONE 'UTC')::date;
--> statement-breakpoint
ALTER TABLE "b3_historical_quotes" ALTER COLUMN "trade_date" TYPE date USING ("trade_date" AT TIME ZONE 'UTC')::date;
--> statement-breakpoint
ALTER TABLE "b3_historical_quotes" ALTER COLUMN "expiration_date" TYPE date USING ("expiration_date" AT TIME ZONE 'UTC')::date;
--> statement-breakpoint
ALTER TABLE "b3_cotahist_batches" ADD COLUMN "records_read" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "b3_cotahist_batches" ADD COLUMN "records_accepted" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "b3_cotahist_batches" ADD COLUMN "records_inserted" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "b3_cotahist_batches" ADD COLUMN "records_conflicted" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "b3_cotahist_batches" ADD COLUMN "records_rejected" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "b3_cotahist_batches" ADD COLUMN "error_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "b3_cotahist_batches" ADD COLUMN "skipped_as_duplicate" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "b3_cotahist_batches" ADD COLUMN "ingestion_run_id" uuid;
--> statement-breakpoint
ALTER TABLE "b3_cotahist_batches" ADD CONSTRAINT "chk_b3_cotahist_batches_records_read" CHECK ("records_read" >= 0);
--> statement-breakpoint
ALTER TABLE "b3_cotahist_batches" ADD CONSTRAINT "chk_b3_cotahist_batches_records_accepted" CHECK ("records_accepted" >= 0);
--> statement-breakpoint
ALTER TABLE "b3_cotahist_batches" ADD CONSTRAINT "chk_b3_cotahist_batches_records_inserted" CHECK ("records_inserted" >= 0);
--> statement-breakpoint
ALTER TABLE "b3_cotahist_batches" ADD CONSTRAINT "chk_b3_cotahist_batches_records_conflicted" CHECK ("records_conflicted" >= 0);
--> statement-breakpoint
ALTER TABLE "b3_cotahist_batches" ADD CONSTRAINT "chk_b3_cotahist_batches_records_rejected" CHECK ("records_rejected" >= 0);
--> statement-breakpoint
ALTER TABLE "b3_cotahist_batches" ADD CONSTRAINT "chk_b3_cotahist_batches_error_count" CHECK ("error_count" >= 0);
--> statement-breakpoint
UPDATE "b3_cotahist_batches"
SET 
  "records_read" = "quote_count",
  "records_accepted" = "accepted_records",
  "records_inserted" = "accepted_records",
  "records_conflicted" = 0,
  "records_rejected" = "rejected_records",
  "error_count" = 0,
  "skipped_as_duplicate" = false
WHERE "status" = 'COMPLETED';
