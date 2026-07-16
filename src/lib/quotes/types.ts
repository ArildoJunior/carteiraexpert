export type QuoteSource = "brapi" | "coingecko" | "manual" | "stale";

export type Quote = {
  ticker: string;
  price: number;
  change: number;
  changePercent: number;
  volume?: number;
  currency: "BRL";
  source: QuoteSource;
  fetchedAt: string;
  delaySeconds: number;
};

export type ProviderHealth = {
  name: QuoteSource;
  ok: boolean;
  latencyMs?: number;
  lastChecked: string;
  error?: string;
};

export type QuoteResult =
  | { ok: true; quote: Quote }
  | { ok: false; error: "not-supported" | "provider-down" | "not-found"; staleQuote?: Quote };
