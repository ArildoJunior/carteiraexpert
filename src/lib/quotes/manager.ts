// src/lib/quotes/manager.ts
// Cap 6 — Camada dupla:
//  1) refreshQuote — usado pelos jobs Inngest. Chama provider e grava no banco.
//  2) getQuote / getQuotesBatch / getProvidersHealth — shims de leitura que
//     consultam SOMENTE o banco (asset_quotes / provider_breakdown). NUNCA
//     chamam provider externo. As formas de retorno seguem EXATAMENTE o
//     shape de @/lib/quotes/types para que posicoes, dashboard/allocation,
//     dashboard/movers, calculate-portfolio-snapshots e degraded-banner
//     nao precisem ser alterados.

import { providerBreakdown } from "@/db/schema/provider-breakdown";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { gte, sql } from "drizzle-orm";
import {
  type AssetQuoteSnapshot,
  type QuoteCategory,
  getQuoteByCategory,
  upsertQuote,
} from "./repository";
import { selectProvider } from "./select-provider";
import type { ProviderHealth, Quote, QuoteResult, QuoteSource } from "./types";

// --- AssetClass ---------------------------------------------------------

// Internamente o selectProvider so conhece 5 valores.
type RefreshAssetClass = "stock" | "reit" | "etf" | "bdr" | "crypto";

// Os shims de leitura aceitam o enum completo (11 valores) usado no projeto.
export type FullAssetClass =
  | RefreshAssetClass
  | "fixedIncomePublic"
  | "fixedIncomePrivate"
  | "fund"
  | "pension"
  | "treasury"
  | "other";

// --- Categorias / TTLs --------------------------------------------------

const CATEGORY_INTERVAL_KEY: Record<QuoteCategory, keyof typeof env | null> = {
  quote_br: "QUOTE_REFRESH_INTERVAL_BR_SEC",
  quote_us: "QUOTE_REFRESH_INTERVAL_US_SEC",
  crypto: "QUOTE_REFRESH_INTERVAL_CRYPTO_SEC",
  fundamental_br: "QUOTE_REFRESH_INTERVAL_FUNDAMENTAL_SEC",
  fundamental_us: "QUOTE_REFRESH_INTERVAL_FUNDAMENTAL_SEC",
  dividend_br: "QUOTE_REFRESH_INTERVAL_DIVIDEND_SEC",
  dividend_us: "QUOTE_REFRESH_INTERVAL_DIVIDEND_SEC",
  fx: null,
  indicator: null,
};

function mapAssetClassToCategory(c?: FullAssetClass): QuoteCategory {
  if (c === "crypto") return "crypto";
  if (c === "bdr") return "quote_us";
  return "quote_br";
}

function resolveExpiresAt(category: QuoteCategory, now: Date): Date {
  const key = CATEGORY_INTERVAL_KEY[category];
  const defaultSeconds = category === "dividend_br" || category === "dividend_us" ? 3600 : 300;
  const seconds = key ? Number(env[key]) || defaultSeconds : defaultSeconds;
  return new Date(now.getTime() + seconds * 1000);
}

// --- Jobs: refreshQuote -------------------------------------------------

export type RefreshAttempt = {
  provider: string;
  ok: boolean;
  latencyMs: number;
  error?: string;
};

export type RefreshResult = {
  snapshot: AssetQuoteSnapshot;
  providerUsed: string;
  attempts: RefreshAttempt[];
};

export type RefreshInput = {
  ticker: string;
  assetClass: RefreshAssetClass;
  category?: QuoteCategory;
};

export async function refreshQuote(input: RefreshInput): Promise<RefreshResult | null> {
  const upper = input.ticker.toUpperCase();
  const category = input.category ?? mapAssetClassToCategory(input.assetClass);

  const provider = selectProvider(upper, input.assetClass);
  if (!provider) return null;

  const startedAt = Date.now();
  const result = await provider.fetchQuote(upper);
  const latencyMs = Date.now() - startedAt;
  if (!result.ok) return null;

  const now = new Date();
  const expiresAt = resolveExpiresAt(category, now);
  const snapshot: AssetQuoteSnapshot = {
    category,
    ticker: upper,
    price: result.quote.price,
    currency: result.quote.currency,
    change: result.quote.change,
    changePct: result.quote.changePercent,
    volume: result.quote.volume ?? null,
    marketCap: null,
    fetchedAt: now,
    expiresAt,
    provider: result.quote.source,
    status: "fresh",
    delayMs: 0,
  };
  await upsertQuote(snapshot);
  return {
    snapshot,
    providerUsed: result.quote.source,
    attempts: [{ provider: result.quote.source, ok: true, latencyMs }],
  };
}

// --- Shims de leitura (consultam banco, NAO provider) ------------------

// provider (text no banco) -> QuoteSource (literal do types.ts)
function toQuoteSource(provider: string): QuoteSource {
  if (provider === "brapi") return "brapi";
  if (provider === "coingecko") return "coingecko";
  if (provider === "manual") return "manual";
  return "stale";
}

function toQuote(snap: AssetQuoteSnapshot, originalTicker: string): Quote {
  const delaySeconds = Math.max(0, Math.round((Date.now() - snap.fetchedAt.getTime()) / 1000));
  const quote: Quote = {
    ticker: originalTicker,
    price: Number(snap.price ?? 0),
    change: snap.change ?? 0,
    changePercent: snap.changePct ?? 0,
    currency: "BRL",
    source: toQuoteSource(snap.provider),
    fetchedAt: snap.fetchedAt.toISOString(),
    delaySeconds,
  };
  if (snap.volume !== null && snap.volume !== undefined) {
    quote.volume = snap.volume;
  }
  return quote;
}

// getQuote: le UMA cotacao do banco. NUNCA chama provider.
// Retorna QuoteResult no formato de @/lib/quotes/types.
export async function getQuote(ticker: string, assetClass?: FullAssetClass): Promise<QuoteResult> {
  const upper = ticker.toUpperCase();
  const category = mapAssetClassToCategory(assetClass);
  const snap = await getQuoteByCategory(category, upper);
  if (!snap) {
    return { ok: false, error: "not-found" };
  }
  const quote = toQuote(snap, ticker);
  const isFresh = snap.expiresAt.getTime() > Date.now();
  if (isFresh) {
    return { ok: true, quote };
  }
  return { ok: false, error: "provider-down", staleQuote: quote };
}

// getQuotesBatch: le N cotacoes em paralelo. Retorna Record indexado pelo
// ticker ORIGINAL (mesmo case que veio do banco) para o consumidor acessar
// via `result[r.assetTicker]`.
export async function getQuotesBatch(
  items: { ticker: string; assetClass?: FullAssetClass }[]
): Promise<Record<string, QuoteResult>> {
  const out: Record<string, QuoteResult> = {};
  await Promise.all(
    items.map(async (item) => {
      out[item.ticker] = await getQuote(item.ticker, item.assetClass);
    })
  );
  return out;
}

// getProvidersHealth: agrega provider_breakdown (ultimos 15 min). NUNCA
// chama provider. Retorna Record<string, ProviderHealth> no formato
// de @/lib/quotes/types (name: QuoteSource, ok, latencyMs?, lastChecked, error?).
export async function getProvidersHealth(): Promise<Record<string, ProviderHealth>> {
  const since = new Date(Date.now() - 15 * 60 * 1000);
  const rows = await db
    .select({
      provider: providerBreakdown.provider,
      okCount: sql<number>`SUM(CASE WHEN ${providerBreakdown.status} = 'ok' THEN 1 ELSE 0 END)`,
      totalCount: sql<number>`COUNT(*)`,
      lastFetchedAt: sql<Date | null>`MAX(${providerBreakdown.fetchedAt})`,
    })
    .from(providerBreakdown)
    .where(gte(providerBreakdown.fetchedAt, since))
    .groupBy(providerBreakdown.provider);

  const out: Record<string, ProviderHealth> = {};
  for (const row of rows) {
    const total = Number(row.totalCount) || 0;
    const ok = Number(row.okCount) || 0;
    const source = toQuoteSource(row.provider);
    const lastChecked = (row.lastFetchedAt ?? new Date()).toISOString();
    out[source] = {
      name: source,
      ok: total > 0 && ok / total > 0.5,
      lastChecked,
    };
  }
  return out;
}
