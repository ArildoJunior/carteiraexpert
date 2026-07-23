// lib/providers/adapters/fmp-fundamental.ts
// FMPFundamentalAdapter — apenas profile (income statement do FMP é deprecado)
// Cap 6 — 6L-2 (Fundamentos) — priority 3

import type { ProviderAdapter, ProviderCategory } from '../types';
import {
  ProviderAuthError,
  ProviderDataError,
  ProviderTimeout,
  ProviderRateLimit,
} from '../types';

export interface FundamentalInput {
  symbol: string;
}

export interface FundamentalOutput {
  symbol: string;
  profile: {
    companyName: string;
    industry: string;
    sector: string;
    country: string;
    exchange: string;
    marketCap: number;
    currency: string;
    description: string;
    ceo: string;
    website: string;
    beta: number;
    price: number;
    changes: number;
  };
  source: 'fmp_fundamental';
}

const FMP_BASE = 'https://financialmodelingprep.com/api/v3';

export class FMPFundamentalAdapter
  implements ProviderAdapter<FundamentalInput, FundamentalOutput>
{
  readonly name = 'fmp_fundamental';
  readonly category: ProviderCategory = 'fundamental_us';
  readonly priority = 3; // fallback

  private get token(): string | undefined {
    const t = process.env.FMP_API_KEY;
    return t && t !== 'PUBLIC' ? t : undefined;
  }

  isConfigured(): boolean {
    return Boolean(this.token);
  }

  async ping(): Promise<boolean> {
    if (!this.token) return false;
    try {
      const r = await fetch(`${FMP_BASE}/profile/AAPL?apikey=${this.token}`, {
        signal: AbortSignal.timeout(5000),
      });
      return r.ok;
    } catch {
      return false;
    }
  }

  async fetch(input: FundamentalInput): Promise<FundamentalOutput> {
    const token = this.token;
    if (!token) throw new ProviderAuthError(this.name, this.category);

    const symbol = input.symbol.toUpperCase();
    const url = `${FMP_BASE}/profile/${symbol}?apikey=${token}`;

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
      companyName: string;
      industry: string;
      sector: string;
      country: string;
      exchange: string;
      mktCap: number;
      currency: string;
      description: string;
      ceo: string;
      website: string;
      beta: number;
      price: number;
      changes: number;
    }>;

    const p = json?.[0];
    if (!p) {
      throw new ProviderDataError(this.name, this.category, `Ticker "${symbol}" não encontrado no FMP`);
    }

    return {
      symbol,
      profile: {
        companyName: p.companyName,
        industry: p.industry,
        sector: p.sector,
        country: p.country,
        exchange: p.exchange,
        marketCap: p.mktCap ?? 0,
        currency: p.currency,
        description: p.description,
        ceo: p.ceo,
        website: p.website,
        beta: p.beta ?? 0,
        price: p.price ?? 0,
        changes: p.changes ?? 0,
      },
      source: 'fmp_fundamental',
    };
  }
}