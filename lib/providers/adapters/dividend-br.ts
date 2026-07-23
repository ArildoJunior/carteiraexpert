// lib/providers/adapters/dividend-br.ts
// DividendBRAdapter — wrapper do Brapi para dividendos BR
// Cap 6 — 6M (Dividendos) — priority 1

import type { ProviderAdapter, ProviderCategory } from '../types';
import { ProviderDataError } from '../types';
import { BrapiAdapter } from './brapi';

export interface DividendInput {
  ticker: string;
}

export interface DividendOutput {
  ticker: string;
  dividends: Array<{ date: string; type: string; value: number }>;
  source: 'brapi';
}

export class DividendBRAdapter
  implements ProviderAdapter<DividendInput, DividendOutput>
{
  readonly name = 'dividend_br';
  readonly category: ProviderCategory = 'dividend_br';
  readonly priority = 1;

  private readonly inner: BrapiAdapter;

  constructor() {
    this.inner = new BrapiAdapter('dividend_br', 1);
  }

  isConfigured(): boolean {
    return this.inner.isConfigured();
  }

  async ping(): Promise<boolean> {
    return this.inner.ping();
  }

  async fetch(input: DividendInput): Promise<DividendOutput> {
    const ticker = (input.ticker ?? '').toUpperCase();
    if (!ticker) {
      throw new ProviderDataError(this.name, this.category, 'Ticker vazio');
    }
    const result = await this.inner.fetch({ ticker });
    if (!('dividends' in result)) {
      throw new ProviderDataError(this.name, this.category, 'Brapi não retornou dividends');
    }
    return result as DividendOutput;
  }
}