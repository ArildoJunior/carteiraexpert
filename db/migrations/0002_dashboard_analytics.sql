-- 0002_dashboard_analytics.sql
-- Capítulo 8 — Dashboard analítico com benchmarks e TWR.

CREATE TABLE IF NOT EXISTS "benchmarks_history" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "benchmark" text NOT NULL,
  "date" date NOT NULL,
  "value" numeric(20, 8) NOT NULL,
  "source" text NOT NULL DEFAULT 'manual',
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "portfolio_snapshots" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL,
  "date" date NOT NULL,
  "total_value" numeric(20, 2) NOT NULL,
  "total_cost" numeric(20, 2) NOT NULL,
  "unrealized_pnl" numeric(20, 2) NOT NULL,
  "realized_pnl" numeric(20, 2) NOT NULL,
  "twr_daily" numeric(20, 8) NOT NULL,
  "twr_cumulative" numeric(20, 8) NOT NULL,
  "allocation_by_class" text NOT NULL DEFAULT '{}',
  "positions_count" numeric(10, 0) NOT NULL DEFAULT '0',
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- Indexes benchmarks_history
CREATE UNIQUE INDEX IF NOT EXISTS "unq_benchmarks_history_benchmark_date"
  ON "benchmarks_history" ("benchmark", "date");
CREATE INDEX IF NOT EXISTS "idx_benchmarks_history_benchmark_date"
  ON "benchmarks_history" ("benchmark", "date");

-- Indexes portfolio_snapshots
CREATE UNIQUE INDEX IF NOT EXISTS "unq_portfolio_snapshots_user_date"
  ON "portfolio_snapshots" ("user_id", "date");
CREATE INDEX IF NOT EXISTS "idx_portfolio_snapshots_user_date"
  ON "portfolio_snapshots" ("user_id", "date");

-- Foreign key portfolio_snapshots -> users
DO $$ BEGIN
  ALTER TABLE "portfolio_snapshots"
    ADD CONSTRAINT "portfolio_snapshots_user_id_fkey"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;