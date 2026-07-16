import type { AssetClass } from "@/lib/db/enums";
import { env } from "@/lib/env";
import type { QuoteProvider } from "../provider";
import type { Quote, QuoteResult } from "../types";

const BASE = "https://brapi.dev/api/quote";

type BrapiResponse = {
  results?: Array<{
    symbol: string;
    regularMarketPrice: number;
    regularMarketChange: number;
    regularMarketChangePercent: number;
    regularMarketVolume?: number;
    regularMarketTime?: string;
  }>;
};

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { signal: ctl.signal, cache: "no-store" });
  } finally {
    clearTimeout(t);
  }
}

export const brapiProvider: QuoteProvider = {
  name: "brapi",
  supports(_ticker: string, assetClass: AssetClass) {
    return ["stock", "reit", "etf", "bdr"].includes(assetClass);
  },
  async fetchQuote(ticker: string): Promise<QuoteResult> {
    try {
      const url = env.BRAPI_TOKEN
        ? `${BASE}/${ticker}?token=${env.BRAPI_TOKEN}`
        : `${BASE}/${ticker}`;
      const res = await fetchWithTimeout(url, 4000);
      if (!res.ok) return { ok: false, error: res.status === 404 ? "not-found" : "provider-down" };
      const data = (await res.json()) as BrapiResponse;
      const r = data.results?.[0];
      if (!r) return { ok: false, error: "not-found" };
      const fetchedAt = r.regularMarketTime
        ? new Date(r.regularMarketTime).toISOString()
        : new Date().toISOString();
      const delaySeconds = Math.floor((Date.now() - new Date(fetchedAt).getTime()) / 1000);
      const quote: Quote = {
        ticker: r.symbol.toUpperCase(),
        price: r.regularMarketPrice,
        change: r.regularMarketChange,
        changePercent: r.regularMarketChangePercent,
        volume: r.regularMarketVolume,
        currency: "BRL",
        source: "brapi",
        fetchedAt,
        delaySeconds: Math.max(0, delaySeconds),
      };
      return { ok: true, quote };
    } catch {
      return { ok: false, error: "provider-down" };
    }
  },
  async healthCheck() {
    const start = Date.now();
    try {
      const url = env.BRAPI_TOKEN ? `${BASE}/PETR4?token=${env.BRAPI_TOKEN}` : `${BASE}/PETR4`;
      const res = await fetchWithTimeout(url, 3000);
      return { ok: res.ok, latencyMs: Date.now() - start };
    } catch (e) {
      return {
        ok: false,
        latencyMs: Date.now() - start,
        error: e instanceof Error ? e.message : "unknown",
      };
    }
  },
};
