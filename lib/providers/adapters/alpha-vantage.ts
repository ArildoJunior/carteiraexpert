// lib/providers/adapters/alpha-vantage.ts
// AlphaVantageAdapter — fallback final de cotações EUA
// Cap 6 — 6I (Ações EUA) — priority 3
// Documentação: https://www.alphavantage.co/documentation/#latestprice

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
  source: "alpha_vantage";
}

const AV_BASE = "https://www.alphavantage.co/query";

export class AlphaVantageAdapter implements ProviderAdapter<UsQuoteInput, UsQuoteOutput> {
  readonly name = "alpha_vantage";
  readonly category: ProviderCategory = "quote_us";
  readonly priority = 3; // fallback 2

  private get token(): string | undefined {
    const t = process.env.ALPHA_VANTAGE_TOKEN;
    return t && t !== "PUBLIC" ? t : undefined;
  }

  isConfigured(): boolean {
    return Boolean(this.token);
  }

  async ping(): Promise<boolean> {
    if (!this.token) return false;
    try {
      const r = await fetch(`${AV_BASE}?function=GLOBAL_QUOTE&symbol=AAPL&apikey=${this.token}`, {
        signal: AbortSignal.timeout(5000),
      });
      return r.ok;
    } catch {
      return false;
    }
  }

  async fetch(input: UsQuoteInput): Promise<UsQuoteOutput> {
    const token = this.token;
    if (!token) throw new ProviderAuthError(this.name, this.category);

    const ticker = input.ticker.toUpperCase();
    const url = `${AV_BASE}?function=GLOBAL_QUOTE&symbol=${ticker}&apikey=${token}`;

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
      "Global Quote"?: {
        "01. symbol": string;
        "05. price": string;
        "09. change": string;
        "10. change percent": string;
        "06. volume": string;
        "07. latest trading day": string;
      };
      Note?: string;
      Information?: string;
      "Error Message"?: string;
    };

    if (json["Error Message"] || json.Note || json.Information) {
      const msg = json["Error Message"] ?? json.Note ?? json.Information ?? "rate limit";
      throw new ProviderRateLimit(this.name, this.category, msg);
    }

    const gq = json["Global Quote"];
    if (!gq || !gq["05. price"]) {
      throw new ProviderDataError(this.name, this.category, `Ticker "${ticker}" não encontrado`);
    }

    const changePercentStr = (gq["10. change percent"] ?? "0%").replace("%", "").trim();
    return {
      ticker: gq["01. symbol"],
      price: Number.parseFloat(gq["05. price"]),
      currency: "USD",
      change: Number.parseFloat(gq["09. change"] ?? "0"),
      changePercent: Number.parseFloat(changePercentStr),
      volume: Number.parseFloat(gq["06. volume"] ?? "0"),
      marketTime: gq["07. latest trading day"]
        ? new Date(gq["07. latest trading day"]).toISOString()
        : new Date().toISOString(),
      source: "alpha_vantage",
    };
  }
}
