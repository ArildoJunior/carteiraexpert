CREATE TABLE IF NOT EXISTS "provider_breakdown" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"category" text NOT NULL,
	"status" text NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"latency_ms" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "provider_breakdown_provider_idx" ON "provider_breakdown" USING btree ("provider","fetched_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "provider_breakdown_category_idx" ON "provider_breakdown" USING btree ("category","fetched_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "provider_breakdown_status_idx" ON "provider_breakdown" USING btree ("status","fetched_at");