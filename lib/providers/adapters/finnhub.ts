// lib/providers/adapters/finnhub.ts
// FinnhubAdapter — cotações US (6I) e fundamentos US (6L-2)
// Aceita category/priority no construtor para reuso entre cascatas

import type { ProviderAdapter, ProviderCategory } from "../types";
import { ProviderAuthError, ProviderDataError, ProviderRateLimit, ProviderTimeout } from "../types";

export interface FinnhubQuoteInput {
  symbol: string;
}

export interface FinnhubQuoteOutput {
  symbol: string;
  price: number;
  currency: "USD";
  change: number;
  changePercent: number;
  volume: number;
  marketTime: string;
  source: "finnhub";
}

export interface FinnhubFundamentalInput {
  symbol: string;
  metric?: "all" | "price" | "valuation" | "growth" | "margin" | "management" | "financialStrength";
}

export interface FinnhubFundamentalOutput {
  symbol: string;
  metrics: Record<string, number | string | null>;
  source: "finnhub";
}

const FINNHUB_BASE = "https://finnhub.io/api/v1";

export class FinnhubAdapter
  implements ProviderAdapter<FinnhubQuoteInput, FinnhubQuoteOutput | FinnhubFundamentalOutput>
{
  readonly name = "finnhub";
  readonly category: ProviderCategory;
  readonly priority: number;

  constructor(category: ProviderCategory = "quote_us", priority = 1) {
    this.category = category;
    this.priority = priority;
  }

  private get token(): string | undefined {
    const t = process.env.FINNHUB_TOKEN;
    return t && t !== "PUBLIC" ? t : undefined;
  }

  isConfigured(): boolean {
    return Boolean(this.token);
  }

  async ping(): Promise<boolean> {
    if (!this.token) return false;
    try {
      const r = await fetch(`${FINNHUB_BASE}/quote?symbol=AAPL&token=${this.token}`, {
        signal: AbortSignal.timeout(5000),
      });
      return r.ok;
    } catch {
      return false;
    }
  }

  async fetch(
    input: FinnhubQuoteInput | FinnhubFundamentalInput
  ): Promise<FinnhubQuoteOutput | FinnhubFundamentalOutput> {
    const token = this.token;
    if (!token) throw new ProviderAuthError(this.name, this.category);

    if (this.category === "fundamental_us") {
      return this.fetchFundamentals(
        (input as FinnhubFundamentalInput).symbol,
        token,
        (input as FinnhubFundamentalInput).metric ?? "all"
      );
    }
    return this.fetchQuote((input as FinnhubQuoteInput).symbol, token);
  }

  private async fetchQuote(symbol: string, token: string): Promise<FinnhubQuoteOutput> {
    const ticker = symbol.toUpperCase();
    const url = `${FINNHUB_BASE}/quote?symbol=${ticker}&token=${token}`;

    let response: Response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    } catch (err) {
      const e = err as Error;
      if (e.name === "AbortError" || e.name === "TimeoutError") {
        throw new ProviderTimeout(this.name, this.category);
      }
      throw new ProviderDataError(this.name, this.category, e.message);
    }

    if (response.status === 401 || response.status === 403) {
      throw new ProviderAuthError(this.name, this.category);
    }
    if (response.status === 429) {
      throw new ProviderRateLimit(this.name, this.category);
    }
    if (!response.ok) {
      throw new ProviderDataError(this.name, this.category, `HTTP ${response.status}`);
    }

    const json = (await response.json()) as {
      c: number; // current
      d: number; // change
      dp: number; // change percent
      h: number; // high
      l: number; // low
      o: number; // open
      pc: number; // previous close
      t: number; // epoch seconds
    };

    if (json.c === 0 || json.c === undefined) {
      throw new ProviderDataError(this.name, this.category, `Ticker "${ticker}" não encontrado`);
    }

    return {
      symbol: ticker,
      price: json.c,
      currency: "USD",
      change: json.d ?? 0,
      changePercent: json.dp ?? 0,
      volume: 0, // Finnhub /quote não retorna volume; /stock/candle tem
      marketTime: new Date(json.t * 1000).toISOString(),
      source: "finnhub",
    };
  }

  private async fetchFundamentals(
    symbol: string,
    token: string,
    metric: string
  ): Promise<FinnhubFundamentalOutput> {
    const ticker = symbol.toUpperCase();
    const url = `${FINNHUB_BASE}/stock/metric?symbol=${ticker}&metric=${metric}&token=${token}`;

    let response: Response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    } catch (err) {
      const e = err as Error;
      if (e.name === "AbortError" || e.name === "TimeoutError") {
        throw new ProviderTimeout(this.name, this.category);
      }
      throw new ProviderDataError(this.name, this.category, e.message);
    }

    if (response.status === 401 || response.status === 403) {
      throw new ProviderAuthError(this.name, this.category);
    }
    if (response.status === 429) {
      throw new ProviderRateLimit(this.name, this.category);
    }
    if (!response.ok) {
      throw new ProviderDataError(this.name, this.category, `HTTP ${response.status}`);
    }

    const json = (await response.json()) as {
      metric: Record<string, number | string | null>;
      series?: Record<string, unknown>;
    };

    if (!json.metric || Object.keys(json.metric).length === 0) {
      throw new ProviderDataError(this.name, this.category, `Sem métricas para "${ticker}"`);
    }

    return {
      symbol: ticker,
      metrics: json.metric,
      source: "finnhub",
    };
  }
}
