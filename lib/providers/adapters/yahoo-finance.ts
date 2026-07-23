// lib/providers/adapters/yahoo-finance.ts
// YahooFinanceAdapter — cotações globais (e US como backup)
// Cap 6 — 6K (Ações globais) — priority 1
// Endpoint público: https://query1.finance.yahoo.com/v8/finance/chart/{TICKER}
// Documentação: https://github.com/ranaroussi/yfinance

import type { ProviderAdapter, ProviderCategory } from '../types';
import {
  ProviderAuthError,
  ProviderDataError,
  ProviderTimeout,
  ProviderRateLimit,
} from '../types';

export interface GlobalQuoteInput {
  ticker: string; // "VOD.L", "SAP.DE", "PETR4.SA", "AAPL"
}

export interface GlobalQuoteOutput {
  ticker: string;
  market: string;       // ex: "LSE", "GER", "SAO", "NMS"
  exchange: string;     // ex: "LSE", "GER", "BVMF", "NASDAQ"
  price: number;
  currency: string;     // ISO 4217 ou "GBp" (pence)
  change: number;
  changePercent: number;
  volume: number;
  marketTime: string;
  source: 'yahoo_finance';
}

const YAHOO_BASE = 'https://query1.finance.yahoo.com/v8/finance/chart';

// Mapear exchange do Yahoo → categoria do registry (caso queiramos rotear depois)
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json,text/plain,*/*',
  'Accept-Language': 'en-US,en;q=0.9',
};

export class YahooFinanceAdapter
  implements ProviderAdapter<GlobalQuoteInput, GlobalQuoteOutput>
{
  readonly name = 'yahoo_finance';
  readonly category: ProviderCategory = 'quote_global';
  readonly priority = 1; // primário (sem fallback necessário — Yahoo cobre quase tudo)

  isConfigured(): boolean {
    return true; // endpoint público, sem token
  }

  async ping(): Promise<boolean> {
    try {
      const r = await fetch(`${YAHOO_BASE}/AAPL?interval=1d&range=5d`, {
        signal: AbortSignal.timeout(5000),
        headers: BROWSER_HEADERS,
      });
      return r.ok;
    } catch {
      return false;
    }
  }

  async fetch(input: GlobalQuoteInput): Promise<GlobalQuoteOutput> {
    const ticker = input.ticker.trim();
    const url = `${YAHOO_BASE}/${encodeURIComponent(ticker)}?interval=1d&range=5d`;

    let response: Response;
    try {
      response = await fetch(url, {
        signal: AbortSignal.timeout(10000),
        headers: BROWSER_HEADERS,
      });
    } catch (err) {
      const e = err as Error;
      if (e.name === 'AbortError' || e.name === 'TimeoutError') {
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
      chart: {
        result?: Array<{
          meta: {
            symbol: string;
            currency: string;          // "GBp", "EUR", "USD", "BRL"
            exchangeName: string;      // "LSE", "GER", "BVMF"
            fullExchangeName: string;  // "London Stock Exchange"
            instrumentType: string;
            regularMarketPrice: number;
            regularMarketChange: number;
            regularMarketChangePercent: number;
            regularMarketVolume: number;
            regularMarketTime: number; // epoch seconds
            previousClose: number;
            scale?: string;            // "3" para pence (divide por 100)
          };
          indicators: {
            quote: Array<{
              close?: (number | null)[];
              volume?: (number | null)[];
            }>;
          };
        }>;
        error: { code: string; description: string } | null;
      };
    };

    if (json.chart.error) {
      throw new ProviderDataError(
        this.name,
        this.category,
        `${json.chart.error.code}: ${json.chart.error.description}`,
      );
    }

    const result = json.chart.result?.[0];
    if (!result) {
      throw new ProviderDataError(
        this.name,
        this.category,
        `Ticker "${ticker}" não retornou dados no Yahoo`,
      );
    }

    const m = result.meta;
    if (!m || m.regularMarketPrice === undefined) {
      throw new ProviderDataError(
        this.name,
        this.category,
        `Yahoo não retornou cotação para "${ticker}"`,
      );
    }

    // Yahoo retorna ações UK em pence (scale=3) → divide por 100
    // Demais mercados já vêm na moeda certa
    const divisor = m.scale === '3' ? 100 : 1;
    const price = m.regularMarketPrice / divisor;
    const previousClose = (m.previousClose ?? price * divisor) / divisor;
    const change = price - previousClose;
    const changePercent = previousClose !== 0 ? (change / previousClose) * 100 : 0;
    const volume = (m.regularMarketVolume ?? 0) * divisor; // volume também é afetado

    return {
      ticker: m.symbol,
      market: m.exchangeName,
      exchange: m.fullExchangeName,
      price,
      currency: m.currency,
      change,
      changePercent,
      volume,
      marketTime: new Date(m.regularMarketTime * 1000).toISOString(),
      source: 'yahoo_finance',
    };
  }
}