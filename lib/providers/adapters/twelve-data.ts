// lib/providers/adapters/twelve-data.ts
// TwelveDataAdapter — cotações US (6I) e globais (6K)
// Em quote_global, converte "VOD.L" → symbol=VOD, exchange=LSE

import type { ProviderAdapter, ProviderCategory } from "../types";
import { ProviderAuthError, ProviderDataError, ProviderRateLimit, ProviderTimeout } from "../types";

export interface UsQuoteInput {
  ticker: string;
}

export interface UsQuoteOutput {
  ticker: string;
  price: number;
  currency: "USD";
  change: number;
  changePercent: number;
  volume: number;
  marketTime: string;
  source: "twelve_data";
}

const TWELVE_BASE = "https://api.twelvedata.com";

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
};

const SUFFIX_TO_EXCHANGE: Record<string, string> = {
  ".L": "LSE",
  ".DE": "XETR",
  ".PA": "EURONEXT",
  ".F": "FWB",
  ".MI": "MIL",
  ".MC": "MCE",
  ".JP": "TSE",
  ".HK": "HKEX",
  ".AU": "ASX",
  ".CA": "TSX",
  ".CH": "SIX",
  ".SG": "SGX",
  ".IN": "NSE",
  ".KR": "KRX",
  ".TW": "TWSE",
  ".NZ": "NZX",
  ".IL": "TASE",
  ".SA": "BVMF",
};

export class TwelveDataAdapter implements ProviderAdapter<UsQuoteInput, UsQuoteOutput> {
  readonly name = "twelve_data";
  readonly category: ProviderCategory;
  readonly priority: number;

  constructor(category: ProviderCategory = "quote_us", priority = 2) {
    this.category = category;
    this.priority = priority;
  }

  private get token(): string | undefined {
    const t = process.env.TWELVE_DATA_TOKEN;
    return t && t !== "PUBLIC" ? t : undefined;
  }

  isConfigured(): boolean {
    return Boolean(this.token);
  }

  async ping(): Promise<boolean> {
    if (!this.token) return false;
    try {
      const r = await fetch(`${TWELVE_BASE}/price?symbol=AAPL&apikey=${this.token}`, {
        signal: AbortSignal.timeout(5000),
        headers: BROWSER_HEADERS,
      });
      return r.ok;
    } catch {
      return false;
    }
  }

  async fetch(input: UsQuoteInput): Promise<UsQuoteOutput> {
    const token = this.token;
    if (!token) throw new ProviderAuthError(this.name, this.category);

    const rawTicker = input.ticker.toUpperCase();
    let symbol = rawTicker;
    let exchange: string | undefined;

    if (this.category === "quote_global" && rawTicker.includes(".")) {
      for (const [suffix, ex] of Object.entries(SUFFIX_TO_EXCHANGE)) {
        if (rawTicker.endsWith(suffix)) {
          symbol = rawTicker.slice(0, -suffix.length);
          exchange = ex;
          break;
        }
      }
    }

    let url = `${TWELVE_BASE}/time_series?symbol=${symbol}&interval=1day&outputsize=1&apikey=${token}`;
    if (exchange) url += `&exchange=${exchange}`;

    let response: Response;
    try {
      response = await fetch(url, {
        signal: AbortSignal.timeout(10000),
        headers: BROWSER_HEADERS,
      });
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
      status?: string;
      message?: string;
      values?: Array<{
        datetime: string;
        open: string;
        high: string;
        low: string;
        close: string;
        volume: string;
      }>;
      meta?: { previous_close?: string };
    };

    if (json.status === "error" || !json.values?.[0]) {
      throw new ProviderDataError(
        this.name,
        this.category,
        json.message ??
          `Ticker "${rawTicker}" (${symbol}${exchange ? `/${exchange}` : ""}) não encontrado`
      );
    }

    const v = json.values[0];
    const close = Number.parseFloat(v.close);
    const prevClose = json.meta?.previous_close
      ? Number.parseFloat(json.meta.previous_close)
      : close;
    const change = close - prevClose;
    const changePercent = prevClose !== 0 ? (change / prevClose) * 100 : 0;

    return {
      ticker: rawTicker,
      price: close,
      currency: "USD",
      change,
      changePercent,
      volume: Number.parseFloat(v.volume) || 0,
      marketTime: new Date(v.datetime).toISOString(),
      source: "twelve_data",
    };
  }
}
