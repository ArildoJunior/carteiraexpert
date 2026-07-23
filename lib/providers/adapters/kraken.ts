// lib/providers/adapters/kraken.ts
// KrakenAdapter — fallback final de cotações cripto
// Cap 6 — 6J (Cripto) — priority 3
// Documentação: https://docs.kraken.com/api/docs/rest-api/get-ticker-information

import type { ProviderAdapter, ProviderCategory } from '../types';
import {
  ProviderAuthError,
  ProviderDataError,
  ProviderTimeout,
  ProviderRateLimit,
} from '../types';

export interface CryptoQuoteInput {
  symbol: string; // ex: "BTC" → mapeia para XBTUSD
}

export interface CryptoQuoteOutput {
  symbol: string;
  price: number;
  currency: 'USD';
  change24h: number;
  changePercent24h: number;
  volume24h: number;
  marketTime: string;
  source: 'kraken';
}

const KRAKEN_BASE = 'https://api.kraken.com/0/public';

// Kraken tem naming próprio: BTC = XBT, USD = ZUSD
const KRAKEN_PAIRS: Record<string, string> = {
  BTC: 'XBTUSD',
  ETH: 'ETHUSD',
  SOL: 'SOLUSD',
  XRP: 'XRPUSD',
  ADA: 'ADAUSD',
  DOGE: 'DOGEUSD',
  AVAX: 'AVAXUSD',
  DOT: 'DOTUSD',
  LINK: 'LINKUSD',
  LTC: 'LTCUSD',
  ATOM: 'ATOMUSD',
};

export class KrakenAdapter
  implements ProviderAdapter<CryptoQuoteInput, CryptoQuoteOutput>
{
  readonly name = 'kraken';
  readonly category: ProviderCategory = 'crypto';
  readonly priority = 3; // fallback 2

  isConfigured(): boolean {
    return true; // endpoint público, sem token
  }

  async ping(): Promise<boolean> {
    try {
      const r = await fetch(`${KRAKEN_BASE}/SystemStatus`, {
        signal: AbortSignal.timeout(5000),
      });
      return r.ok;
    } catch {
      return false;
    }
  }

  async fetch(input: CryptoQuoteInput): Promise<CryptoQuoteOutput> {
    const symbol = input.symbol.toUpperCase();
    const pair = KRAKEN_PAIRS[symbol] ?? `${symbol}USD`;
    const url = `${KRAKEN_BASE}/Ticker?pair=${pair}`;

    let response: Response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(10000) });
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
      error: string[];
      result: Record<
        string,
        {
          c: [string, string]; // last trade closed [price, lot]
          o: string; // open today
          h: [string, string]; // high today [price, lot]
          l: [string, string]; // low today [price, lot]
          v: [string, string]; // volume today [today, 24h]
        }
      >;
    };

    if (json.error && json.error.length > 0) {
      throw new ProviderDataError(
        this.name,
        this.category,
        json.error.join(', '),
      );
    }

    const entries = Object.values(json.result ?? {});
    const ticker = entries[0];
    if (!ticker) {
      throw new ProviderDataError(
        this.name,
        this.category,
        `Par "${pair}" não encontrado na Kraken`,
      );
    }

    const lastPrice = parseFloat(ticker.c[0]);
    const openPrice = parseFloat(ticker.o);
    const change = lastPrice - openPrice;
    const changePercent = openPrice !== 0 ? (change / openPrice) * 100 : 0;

    return {
      symbol,
      price: lastPrice,
      currency: 'USD',
      change24h: change,
      changePercent24h: changePercent,
      volume24h: parseFloat(ticker.v[1] ?? '0'),
      marketTime: new Date().toISOString(),
      source: 'kraken',
    };
  }
}