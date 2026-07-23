// lib/providers/adapters/coingecko.ts
// CoinGeckoAdapter — primário de cotações cripto
// Cap 6 — 6J (Cripto) — priority 1
// Documentação: https://docs.coingecko.com/reference/introduction

import type { ProviderAdapter, ProviderCategory } from '../types';
import {
  ProviderAuthError,
  ProviderDataError,
  ProviderTimeout,
  ProviderRateLimit,
} from '../types';

export interface CryptoQuoteInput {
  symbol: string; // ex: "BTC", "ETH", "SOL"
}

export interface CryptoQuoteOutput {
  symbol: string;
  price: number;
  currency: 'USD';
  change24h: number;
  changePercent24h: number;
  volume24h: number;
  marketTime: string;
  source: 'coingecko';
}

const COINGECKO_BASE = 'https://api.coingecko.com/api/v3';

export class CoinGeckoAdapter
  implements ProviderAdapter<CryptoQuoteInput, CryptoQuoteOutput>
{
  readonly name = 'coingecko';
  readonly category: ProviderCategory = 'crypto';
  readonly priority = 1; // primário

  private get token(): string | undefined {
    const t = process.env.COINGECKO_DEMO_API_KEY;
    return t && t !== 'PUBLIC' ? t : undefined;
  }

  isConfigured(): boolean {
    return Boolean(this.token);
  }

  async ping(): Promise<boolean> {
    if (!this.token) return false;
    try {
      const r = await fetch(
        `${COINGECKO_BASE}/ping?x_cg_demo_api_key=${this.token}`,
        { signal: AbortSignal.timeout(5000) },
      );
      return r.ok;
    } catch {
      return false;
    }
  }

  async fetch(input: CryptoQuoteInput): Promise<CryptoQuoteOutput> {
    const token = this.token;
    if (!token) throw new ProviderAuthError(this.name, this.category);

    const symbol = input.symbol.toUpperCase();
    const url = `${COINGECKO_BASE}/coins/markets?vs_currency=usd&symbols=${symbol}&x_cg_demo_api_key=${token}`;

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

    const json = (await response.json()) as Array<{
      id: string;
      symbol: string;
      current_price: number;
      price_change_24h: number;
      price_change_percentage_24h: number;
      total_volume: number;
      last_updated: string;
    }>;

    const coin = json?.[0];
    if (!coin) {
      throw new ProviderDataError(
        this.name,
        this.category,
        `Cripto "${symbol}" não encontrada`,
      );
    }

    return {
      symbol: coin.symbol.toUpperCase(),
      price: coin.current_price,
      currency: 'USD',
      change24h: coin.price_change_24h ?? 0,
      changePercent24h: coin.price_change_percentage_24h ?? 0,
      volume24h: coin.total_volume ?? 0,
      marketTime: coin.last_updated ?? new Date().toISOString(),
      source: 'coingecko',
    };
  }
}