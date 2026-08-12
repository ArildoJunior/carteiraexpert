CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"table_name" text NOT NULL,
	"record_id" text NOT NULL,
	"action" text NOT NULL,
	"actor_id" text,
	"actor_type" text,
	"correlation_id" uuid,
	"old_value" jsonb,
	"new_value" jsonb,
	"reason" text,
	"source" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
