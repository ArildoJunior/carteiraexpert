// db/schema/asset-quotes.ts
// Cap 6 — Tabela global de cotacoes. Chave (category, ticker).
// Publicos compartilhados (PETR4, BBSE3, BTC etc.) ocupam UMA UNICA linha no banco.

import {
  doublePrecision,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const quoteStatusEnum = pgEnum("quote_status", ["fresh", "delayed", "stale"]);

export const assetQuotes = pgTable(
  "asset_quotes",
  {
    // id derivado de `${category}:${ticker}` para evitar composicao e facilitar UPSERT.
    id: text("id").primaryKey(),

    category: text("category").notNull(),
    // Valores: "quote_br" | "quote_us" | "crypto" | "fundamental_br" | "fundamental_us"
    //        | "dividend_br" | "dividend_us" | "fx" | "indicator"

    ticker: text("ticker").notNull(),

    price: doublePrecision("price"),
    currency: text("currency").notNull().default("BRL"),
    change: doublePrecision("change"),
    changePct: doublePrecision("change_pct"),
    volume: doublePrecision("volume"),
    marketCap: doublePrecision("market_cap"),

    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),

    provider: text("provider").notNull(),
    status: quoteStatusEnum("status").notNull(),
    delayMs: integer("delay_ms").notNull().default(0),

    sourceMeta: jsonb("source_meta"),
  },
  (t) => ({
    uniqCategoryTicker: uniqueIndex("asset_quotes_category_ticker_idx").on(t.category, t.ticker),
  })
);

export type AssetQuote = typeof assetQuotes.$inferSelect;
export type NewAssetQuote = typeof assetQuotes.$inferInsert;
