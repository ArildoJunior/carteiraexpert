-- db/migrations/0005_asset_quotes.sql
-- Cap 6 — Criacao da tabela `asset_quotes` e do enum `quote_status`.
-- Roda com o drizzle-kit apply / push no seu fluxo normal de migrations.

CREATE TYPE "quote_status" AS ENUM ('fresh', 'delayed', 'stale');

CREATE TABLE IF NOT EXISTS "asset_quotes" (
  "id"          TEXT PRIMARY KEY,
  "category"    TEXT NOT NULL,
  "ticker"      TEXT NOT NULL,
  "price"       DOUBLE PRECISION,
  "currency"    TEXT NOT NULL DEFAULT 'BRL',
  "change"      DOUBLE PRECISION,
  "change_pct"  DOUBLE PRECISION,
  "volume"      DOUBLE PRECISION,
  "market_cap"  DOUBLE PRECISION,
  "fetched_at"  TIMESTAMPTZ NOT NULL,
  "expires_at"  TIMESTAMPTZ NOT NULL,
  "provider"    TEXT NOT NULL,
  "status"      "quote_status" NOT NULL,
  "delay_ms"    INTEGER NOT NULL DEFAULT 0,
  "source_meta" JSONB
);

CREATE UNIQUE INDEX IF NOT EXISTS "asset_quotes_category_ticker_idx"
  ON "asset_quotes" ("category", "ticker");

CREATE INDEX IF NOT EXISTS "asset_quotes_expires_at_idx"
  ON "asset_quotes" ("expires_at");

CREATE INDEX IF NOT EXISTS "asset_quotes_status_idx"
  ON "asset_quotes" ("status");