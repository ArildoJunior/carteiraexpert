// lib/providers/adapters/brapi.ts
// BrapiAdapter â€” cotaÃ§Ãµes BR (6H) e dividendos BR (6M)

import type { ProviderAdapter, ProviderCategory } from "../types";
import { ProviderAuthError, ProviderDataError, ProviderRateLimit, ProviderTimeout } from "../types";

export interface BrapiQuoteInput {
  ticker: string;
}

export interface BrapiQuoteOutput {
  ticker: string;
  price: number;
  currency: "BRL";
  change: number;
  changePercent: number;
  volume: number;
  marketTime: string;
  source: "brapi";
}

export interface BrapiDividendInput {
  ticker: string;
}

export interface BrapiDividendOutput {
  ticker: string;
  dividends: Array<{
    date: string; // lastDatePrior (data-com) â€” YYYY-MM-DD
    paymentDate: string; // data em que foi pago
    type: string; // "JCP", "RENDIMENTO", "DIVIDENDO"
    value: number; // valor por aÃ§Ã£o (R$)
  }>;
  source: "brapi";
}

const BRAPI_BASE = "https://brapi.dev/api";

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json,text/plain,*/*",
};

export class BrapiAdapter
  implements ProviderAdapter<BrapiQuoteInput, BrapiQuoteOutput | BrapiDividendOutput>
{
  readonly name = "brapi";
  readonly category: ProviderCategory;
  readonly priority: number;

  constructor(category: ProviderCategory = "quote_br", priority = 1) {
    this.category = category;
    this.priority = priority;
  }

  private get token(): string | undefined {
    const t = process.env.BRAPI_TOKEN;
    return t && t !== "PUBLIC" ? t : undefined;
  }

  isConfigured(): boolean {
    return Boolean(this.token);
  }

  async ping(): Promise<boolean> {
    if (!this.token) return false;
    try {
      const r = await fetch(`${BRAPI_BASE}/quote/PETR4?token=${this.token}`, {
        signal: AbortSignal.timeout(5000),
        headers: BROWSER_HEADERS,
      });
      return r.ok;
    } catch {
      return false;
    }
  }

  async fetch(
    input: BrapiQuoteInput | BrapiDividendInput
  ): Promise<BrapiQuoteOutput | BrapiDividendOutput> {
    const token = this.token;
    if (!token) throw new ProviderAuthError(this.name, this.category);

    const ticker = (input.ticker ?? "").toUpperCase();
    if (!ticker) throw new ProviderDataError(this.name, this.category, "Ticker vazio");

    if (this.category === "dividend_br") {
      return this.fetchDividends(ticker, token);
    }
    return this.fetchQuote(ticker, token);
  }

  private async fetchQuote(ticker: string, token: string): Promise<BrapiQuoteOutput> {
    const url = `${BRAPI_BASE}/quote/${ticker}?token=${token}`;

    let response: Response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(10000), headers: BROWSER_HEADERS });
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
      results?: Array<{
        symbol: string;
        regularMarketPrice: number;
        regularMarketChange: number;
        regularMarketChangePercent: number;
        regularMarketVolume: number;
        regularMarketTime: string;
      }>;
    };

    const r = json.results?.[0];
    if (!r) {
      throw new ProviderDataError(this.name, this.category, `Ticker "${ticker}" nÃ£o encontrado`);
    }

    return {
      ticker: r.symbol,
      price: r.regularMarketPrice,
      currency: "BRL",
      change: r.regularMarketChange ?? 0,
      changePercent: r.regularMarketChangePercent ?? 0,
      volume: r.regularMarketVolume ?? 0,
      marketTime: r.regularMarketTime ?? new Date().toISOString(),
      source: "brapi",
    };
  }

  private async fetchDividends(ticker: string, token: string): Promise<BrapiDividendOutput> {
    const url = `${BRAPI_BASE}/quote/${ticker}?dividends=true&token=${token}`;

    let response: Response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(10000), headers: BROWSER_HEADERS });
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

    // Brapi retorna: results[0].dividendsData.cashDividends[]
    const json = (await response.json()) as {
      results?: Array<{
        symbol: string;
        dividendsData?: {
          cashDividends?: Array<{
            paymentDate: string; // ISO "YYYY-MM-DDTHH:mm:ss.sssZ"
            rate: number;
            label: string; // "JCP", "RENDIMENTO", "DIVIDENDO"
            lastDatePrior: string; // ISO â€” data-com (ex-dividend)
            approvedOn?: string | null;
          }>;
        };
      }>;
    };

    const r = json.results?.[0];
    if (!r) {
      throw new ProviderDataError(this.name, this.category, `Ticker "${ticker}" nÃ£o encontrado`);
    }

    const cashDividends = r.dividendsData?.cashDividends ?? [];

    return {
      ticker: r.symbol,
      dividends: cashDividends
        .map((d) => {
          const date = d.lastDatePrior?.split("T")[0] ?? d.paymentDate.split("T")[0] ?? "";
          const paymentDate = d.paymentDate.split("T")[0] ?? "";
          return { date, paymentDate, type: d.label, value: d.rate };
        })
        .filter((d) => d.date !== "") // descarta entradas sem data
        .sort((a, b) => b.date.localeCompare(a.date)), // mais recente primeiro
      source: "brapi",
    };
  }
}
