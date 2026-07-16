import type { AssetClass } from "@/lib/db/enums";
import type { QuoteProvider } from "../provider";
import type { Quote, QuoteResult } from "../types";

const COINGECKO_IDS: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  USDT: "tether",
  USDC: "usd-coin",
  BNB: "binancecoin",
  XRP: "ripple",
  ADA: "cardano",
  DOGE: "dogecoin",
};

const BASE = "https://api.coingecko.com/api/v3/simple/price";

async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    return await fetch(url, { signal: ctl.signal, cache: "no-store" });
  } finally {
    clearTimeout(t);
  }
}

export const coingeckoProvider: QuoteProvider = {
  name: "coingecko",
  supports(ticker: string, assetClass: AssetClass) {
    return assetClass === "crypto" && ticker.toUpperCase() in COINGECKO_IDS;
  },
  async fetchQuote(ticker: string): Promise<QuoteResult> {
    const upper = ticker.toUpperCase();
    const id = COINGECKO_IDS[upper];
    if (!id) return { ok: false, error: "not-found" };
    try {
      const url = `${BASE}?ids=${id}&vs_currencies=brl&include_24hr_change=true`;
      const res = await fetchWithTimeout(url, 4000);
      if (!res.ok) return { ok: false, error: "provider-down" };
      const data = (await res.json()) as Record<
        string,
        { brl: number; brl_24h_change?: number } | undefined
      >;
      const entry = data[id];
      if (!entry || typeof entry.brl !== "number") return { ok: false, error: "not-found" };
      const fetchedAt = new Date().toISOString();
      const changePercent = entry.brl_24h_change ?? 0;
      const quote: Quote = {
        ticker: upper,
        price: entry.brl,
        change: (entry.brl * changePercent) / 100,
        changePercent,
        currency: "BRL",
        source: "coingecko",
        fetchedAt,
        delaySeconds: 0,
      };
      return { ok: true, quote };
    } catch {
      return { ok: false, error: "provider-down" };
    }
  },
  async healthCheck() {
    const start = Date.now();
    try {
      const res = await fetchWithTimeout(`${BASE}?ids=bitcoin&vs_currencies=brl`, 3000);
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
