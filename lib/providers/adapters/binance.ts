// lib/providers/adapters/binance.ts
// BinanceAdapter — fallback de cotações cripto
// Cap 6 — 6J (Cripto) — priority 2
// Documentação: https://developers.binance.com/docs/binance-spot-api/rest-api

import type { ProviderAdapter, ProviderCategory } from '../types';
import {
  ProviderAuthError,
  ProviderDataError,
  ProviderTimeout,
  ProviderRateLimit,
} from '../types';

export interface CryptoQuoteInput {
  symbol: string; // ex: "BTC" → mapeia para BTCUSDT
}

export interface CryptoQuoteOutput {
  symbol: string;
  price: number;
  currency: 'USD';
  change24h: number;
  changePercent24h: number;
  volume24h: number;
  marketTime: string;
  source: 'binance';
}

const BINANCE_BASE = 'https://api.binance.com/api/v3';

// Símbolos cotados em USDT (stable). Cobre os top 20 por market cap.
const USDT_PAIRS: Record<string, string> = {
  BTC: 'BTCUSDT',
  ETH: 'ETHUSDT',
  SOL: 'SOLUSDT',
  BNB: 'BNBUSDT',
  XRP: 'XRPUSDT',
  ADA: 'ADAUSDT',
  DOGE: 'DOGEUSDT',
  AVAX: 'AVAXUSDT',
  MATIC: 'MATICUSDT',
  DOT: 'DOTUSDT',
  LINK: 'LINKUSDT',
  UNI: 'UNIUSDT',
  LTC: 'LTCUSDT',
  ATOM: 'ATOMUSDT',
  XLM: 'XLMUSDT',
};

export class BinanceAdapter
  implements ProviderAdapter<CryptoQuoteInput, CryptoQuoteOutput>
{
  readonly name = 'binance';
  readonly category: ProviderCategory = 'crypto';
  readonly priority = 2; // fallback 1

  isConfigured(): boolean {
    return true; // endpoint público, sem token
  }

  async ping(): Promise<boolean> {
    try {
      const r = await fetch(`${BINANCE_BASE}/ping`, {
        signal: AbortSignal.timeout(5000),
      });
      return r.ok;
    } catch {
      return false;
    }
  }

  async fetch(input: CryptoQuoteInput): Promise<CryptoQuoteOutput> {
    const symbol = input.symbol.toUpperCase();
    const pair = USDT_PAIRS[symbol] ?? `${symbol}USDT`;
    const url = `${BINANCE_BASE}/ticker/24hr?symbol=${pair}`;

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
      symbol: string;
      lastPrice: string;
      priceChange: string;
      priceChangePercent: string;
      volume: string;
      closeTime?: number;
    };

    if (!json.lastPrice) {
      throw new ProviderDataError(
        this.name,
        this.category,
        `Par "${pair}" não encontrado na Binance`,
      );
    }

    return {
      symbol,
      price: parseFloat(json.lastPrice),
      currency: 'USD',
      change24h: parseFloat(json.priceChange ?? '0'),
      changePercent24h: parseFloat(json.priceChangePercent ?? '0'),
      volume24h: parseFloat(json.volume ?? '0'),
      marketTime: json.closeTime
        ? new Date(json.closeTime).toISOString()
        : new Date().toISOString(),
      source: 'binance',
    };
  }
}