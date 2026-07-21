CREATE TABLE IF NOT EXISTS "benchmarks_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"benchmark" text NOT NULL,
	"date" date NOT NULL,
	"value" numeric(20, 8) NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unq_benchmarks_history_benchmark_date" UNIQUE("benchmark","date")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "portfolio_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"date" date NOT NULL,
	"total_value" numeric(20, 2) NOT NULL,
	"total_cost" numeric(20, 2) NOT NULL,
	"unrealized_pnl" numeric(20, 2) NOT NULL,
	"realized_pnl" numeric(20, 2) NOT NULL,
	"twr_daily" numeric(20, 8) NOT NULL,
	"twr_cumulative" numeric(20, 8) NOT NULL,
	"allocation_by_class" text DEFAULT '{}' NOT NULL,
	"positions_count" numeric(10, 0) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "unq_portfolio_snapshots_user_date" UNIQUE("user_id","date")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "portfolio_snapshots" ADD CONSTRAINT "portfolio_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_benchmarks_history_benchmark_date" ON "benchmarks_history" USING btree ("benchmark","date");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_portfolio_snapshots_user_date" ON "portfolio_snapshots" USING btree ("user_id","date");