// src/lib/quotes/repository.ts
// Cap 6 — Unica camada que le/escreve em `asset_quotes`.
// A rota do usuario chama `getQuoteByCategory` (e opcionalmente Redis como acelerador).
// Os jobs Inngest chamam `upsertQuote` para gravar o resultado do provider.

import { type AssetQuote, type NewAssetQuote, assetQuotes } from "@/db/schema/asset-quotes";
import { db } from "@/lib/db";
import { and, eq, lt } from "drizzle-orm";

export type QuoteCategory =
  | "quote_br"
  | "quote_us"
  | "crypto"
  | "fundamental_br"
  | "fundamental_us"
  | "dividend_br"
  | "dividend_us"
  | "fx"
  | "indicator";

export const QUOTE_CATEGORIES: QuoteCategory[] = [
  "quote_br",
  "quote_us",
  "crypto",
  "fundamental_br",
  "fundamental_us",
  "dividend_br",
  "dividend_us",
  "fx",
  "indicator",
];

export type AssetQuoteSnapshot = {
  category: QuoteCategory;
  ticker: string;
  price: number | null;
  currency: string;
  change: number | null;
  changePct: number | null;
  volume: number | null;
  marketCap: number | null;
  fetchedAt: Date;
  expiresAt: Date;
  provider: string;
  status: "fresh" | "delayed" | "stale";
  delayMs: number;
  sourceMeta?: unknown;
};

function toSnapshot(row: AssetQuote): AssetQuoteSnapshot {
  return {
    category: row.category as QuoteCategory,
    ticker: row.ticker,
    price: row.price,
    currency: row.currency,
    change: row.change,
    changePct: row.changePct,
    volume: row.volume,
    marketCap: row.marketCap,
    fetchedAt: row.fetchedAt,
    expiresAt: row.expiresAt,
    provider: row.provider,
    status: row.status as "fresh" | "delayed" | "stale",
    delayMs: row.delayMs,
    sourceMeta: row.sourceMeta ?? undefined,
  };
}

function toRow(snapshot: AssetQuoteSnapshot): NewAssetQuote {
  return {
    id: `${snapshot.category}:${snapshot.ticker}`,
    category: snapshot.category,
    ticker: snapshot.ticker,
    price: snapshot.price,
    currency: snapshot.currency,
    change: snapshot.change,
    changePct: snapshot.changePct,
    volume: snapshot.volume,
    marketCap: snapshot.marketCap,
    fetchedAt: snapshot.fetchedAt,
    expiresAt: snapshot.expiresAt,
    provider: snapshot.provider,
    status: snapshot.status,
    delayMs: snapshot.delayMs,
    sourceMeta: snapshot.sourceMeta as never,
  };
}

export async function getQuoteByCategory(
  category: QuoteCategory,
  ticker: string
): Promise<AssetQuoteSnapshot | null> {
  const upper = ticker.toUpperCase();
  const [row] = await db
    .select()
    .from(assetQuotes)
    .where(and(eq(assetQuotes.category, category), eq(assetQuotes.ticker, upper)))
    .limit(1);

  return row ? toSnapshot(row) : null;
}

export async function upsertQuote(snapshot: AssetQuoteSnapshot): Promise<void> {
  const row = toRow(snapshot);
  await db
    .insert(assetQuotes)
    .values(row)
    .onConflictDoUpdate({
      target: assetQuotes.id,
      set: {
        price: row.price,
        currency: row.currency,
        change: row.change,
        changePct: row.changePct,
        volume: row.volume,
        marketCap: row.marketCap,
        fetchedAt: row.fetchedAt,
        expiresAt: row.expiresAt,
        provider: row.provider,
        status: row.status,
        delayMs: row.delayMs,
        sourceMeta: row.sourceMeta,
      },
    });
}

export async function listExpired(
  category: QuoteCategory,
  now: Date = new Date()
): Promise<AssetQuoteSnapshot[]> {
  const rows = await db
    .select()
    .from(assetQuotes)
    .where(and(eq(assetQuotes.category, category), lt(assetQuotes.expiresAt, now)));

  return rows.map(toSnapshot);
}

export async function deleteQuote(category: QuoteCategory, ticker: string): Promise<void> {
  const upper = ticker.toUpperCase();
  await db
    .delete(assetQuotes)
    .where(and(eq(assetQuotes.category, category), eq(assetQuotes.ticker, upper)));
}
