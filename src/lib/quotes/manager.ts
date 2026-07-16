import type { AssetClass } from "@/lib/db/enums";
import { cacheGet, cacheGetStale, cacheSet, cacheSetStale } from "@/lib/redis/upstash";
import { brapiProvider } from "./providers/brapi";
import { coingeckoProvider } from "./providers/coingecko";
import { selectProvider } from "./select-provider";
import type { ProviderHealth, Quote, QuoteResult } from "./types";

const FRESH_TTL = 60;
const STALE_TTL = 24 * 60 * 60;

export async function getQuote(ticker: string, assetClass: AssetClass): Promise<QuoteResult> {
  const upper = ticker.toUpperCase();
  const provider = selectProvider(upper, assetClass);
  if (!provider) return { ok: false, error: "not-supported" };

  const cached = await cacheGet<Quote>(`quote:${upper}`);
  if (cached) {
    const age =
      Math.floor(Date.now() / 1000) - Math.floor(new Date(cached.fetchedAt).getTime() / 1000);
    if (age < FRESH_TTL) return { ok: true, quote: { ...cached, delaySeconds: Math.max(0, age) } };
  }

  const result = await provider.fetchQuote(upper);
  if (result.ok) {
    await cacheSet(`quote:${upper}`, result.quote, FRESH_TTL);
    await cacheSetStale(`quote:stale:${upper}`, result.quote, STALE_TTL);
    return result;
  }

  const stale = await cacheGetStale<Quote>(`quote:stale:${upper}`);
  if (stale) {
    const age =
      Math.floor(Date.now() / 1000) - Math.floor(new Date(stale.fetchedAt).getTime() / 1000);
    return {
      ok: false,
      error: result.error,
      staleQuote: { ...stale, source: "stale", delaySeconds: Math.max(0, age) },
    };
  }

  return result;
}

export async function getQuotesBatch(
  items: Array<{ ticker: string; assetClass: AssetClass }>
): Promise<Record<string, QuoteResult>> {
  const settled = await Promise.allSettled(items.map((it) => getQuote(it.ticker, it.assetClass)));
  const out: Record<string, QuoteResult> = {};
  items.forEach((it, i) => {
    const r = settled[i];
    out[it.ticker] =
      r && r.status === "fulfilled" ? r.value : { ok: false, error: "provider-down" };
  });
  return out;
}

export async function getProvidersHealth(): Promise<Record<string, ProviderHealth>> {
  const now = new Date().toISOString();
  const checks = await Promise.allSettled([
    brapiProvider.healthCheck().then((h) => ({ name: "brapi" as const, ...h })),
    coingeckoProvider.healthCheck().then((h) => ({ name: "coingecko" as const, ...h })),
  ]);
  const out: Record<string, ProviderHealth> = {};
  for (const c of checks) {
    if (c.status === "fulfilled") {
      const v = c.value;
      out[v.name] = {
        name: v.name,
        ok: v.ok,
        latencyMs: v.latencyMs,
        lastChecked: now,
        error: v.error,
      };
    }
  }
  return out;
}
