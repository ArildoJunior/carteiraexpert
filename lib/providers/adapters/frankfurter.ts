// lib/providers/adapters/frankfurter.ts
// FrankfurterAdapter — câmbio geral (EUR, GBP, JPY, etc.)
// Cap 6 — 6L-1 (Câmbio) — priority 2
// Documentação: https://frankfurter.dev/

import type { ProviderAdapter, ProviderCategory } from '../types';
import {
  ProviderAuthError,
  ProviderDataError,
  ProviderTimeout,
  ProviderRateLimit,
} from '../types';

export interface FxQuoteInput {
  from: string; // ISO 4217: "USD", "EUR", "GBP", "JPY", "BRL"
  to: string;
}

export interface FxQuoteOutput {
  from: string;
  to: string;
  bid: number; // Frankfurter retorna só mid
  ask: number;
  mid: number;
  date: string; // data da cotação
  source: 'frankfurter';
}

const FRANKFURTER_BASE = 'https://api.frankfurter.app';

const SUPPORTED = new Set([
  'AUD', 'BGN', 'BRL', 'CAD', 'CHF', 'CNY', 'CZK', 'DKK', 'EUR',
  'GBP', 'HKD', 'HUF', 'IDR', 'ILS', 'INR', 'ISK', 'JPY', 'KRW',
  'MXN', 'MYR', 'NOK', 'NZD', 'PHP', 'PLN', 'RON', 'SEK', 'SGD',
  'THB', 'TRY', 'USD', 'ZAR',
]);

export class FrankfurterAdapter
  implements ProviderAdapter<FxQuoteInput, FxQuoteOutput>
{
  readonly name = 'frankfurter';
  readonly category: ProviderCategory = 'fx';
  readonly priority = 2; // fallback do BCPtax + primário para pares sem PTAX

  isConfigured(): boolean {
    return true; // API pública
  }

  async ping(): Promise<boolean> {
    try {
      const r = await fetch(`${FRANKFURTER_BASE}/latest?from=EUR&to=USD`, {
        signal: AbortSignal.timeout(5000),
      });
      return r.ok;
    } catch {
      return false;
    }
  }

  async fetch(input: FxQuoteInput): Promise<FxQuoteOutput> {
    const from = input.from.toUpperCase();
    const to = input.to.toUpperCase();

    if (!SUPPORTED.has(from) || !SUPPORTED.has(to)) {
      throw new ProviderDataError(
        this.name,
        this.category,
        `Par ${from}/${to} não suportado pelo Frankfurter`,
      );
    }

    // Se o par é USD/BRL, redireciona mentalmente — mas Frankfurter tem BRL,
    // então não precisa. Mantém genérico.
    const url = `${FRANKFURTER_BASE}/latest?from=${from}&to=${to}`;

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
      amount: number;
      base: string;
      date: string; // YYYY-MM-DD
      rates: Record<string, number>;
    };

    const rate = json.rates?.[to];
    if (!rate) {
      throw new ProviderDataError(
        this.name,
        this.category,
        `Frankfurter não retornou taxa ${from}/${to}`,
      );
    }

    return {
      from,
      to,
      bid: rate,
      ask: rate, // Frankfurter não retorna bid/ask separados
      mid: rate,
      date: json.date,
      source: 'frankfurter',
    };
  }
}