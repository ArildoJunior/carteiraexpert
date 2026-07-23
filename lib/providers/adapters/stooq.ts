// lib/providers/adapters/stooq.ts
// StooqAdapter ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â fallback para aÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â§ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Âµes globais
// Cap 6 ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â 6K (AÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â§ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Âµes globais) ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â priority 2

import type { ProviderAdapter, ProviderCategory } from '../types';
import {
  ProviderAuthError,
  ProviderDataError,
  ProviderTimeout,
  ProviderRateLimit,
} from '../types';

export interface GlobalQuoteInput {
  ticker: string;
}

export interface GlobalQuoteOutput {
  ticker: string;
  market: string;
  price: number;
  currency: string;
  change: number;
  changePercent: number;
  volume: number;
  marketTime: string;
  source: 'stooq';
}

const STOOQ_BASE = 'https://stooq.com';

const MARKET_CURRENCY: Record<string, string> = {
  US: 'USD', SA: 'BRL', L: 'GBp', DE: 'EUR', F: 'EUR', PA: 'EUR',
  JP: 'JPY', HK: 'HKD', CN: 'CNY', SH: 'CNY', SZ: 'CNY',
  AU: 'AUD', CA: 'CAD', CH: 'CHF', IT: 'EUR', ES: 'EUR',
  NL: 'EUR', BE: 'EUR', AT: 'EUR', MX: 'MXN', AR: 'ARS',
  IN: 'INR', KR: 'KRW', TW: 'TWD', SG: 'SGD', ZA: 'ZAR',
};

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/csv,text/plain;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

export class StooqAdapter
  implements ProviderAdapter<GlobalQuoteInput, GlobalQuoteOutput>
{
  readonly name = 'stooq';
  readonly category: ProviderCategory = 'quote_global';
  readonly priority = 2;

  isConfigured(): boolean {
    return true;
  }

  async ping(): Promise<boolean> {
    try {
      const r = await fetch(`${STOOQ_BASE}/q/l/?s=AAPL.US&i=d`, {
        signal: AbortSignal.timeout(5000),
        headers: BROWSER_HEADERS,
      });
      return r.ok;
    } catch {
      return false;
    }
  }

  async fetch(input: GlobalQuoteInput): Promise<GlobalQuoteOutput> {
    const rawTicker = input.ticker.trim();
    const ticker = rawTicker.includes('.') ? rawTicker.toLowerCase() : `${rawTicker.toLowerCase()}.US`;
    const url = `${STOOQ_BASE}/q/l/?s=${ticker}&i=d`;

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

    const csv = (await response.text()).trim();

    if (!csv || csv.toLowerCase().includes('no data')) {
      throw new ProviderDataError(
        this.name,
        this.category,
        `Ticker "${ticker}" nÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â£o encontrado no Stooq`,
      );
    }

    const lines = csv.split('\n');
    if (lines.length < 2) {
      throw new ProviderDataError(
        this.name,
        this.category,
        `Resposta CSV invÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¡lida do Stooq: ${csv.slice(0, 100)}`,
      );
    }

    const [header, dataLine] = lines;
    if (!dataLine) {
      throw new ProviderDataError(
        this.name,
        this.category,
        `Resposta CSV do Stooq sem linha de dados: ${csv.slice(0, 100)}`,
      );
    }
    const fields = dataLine.split(',');
    if (fields.length < 7) {
      throw new ProviderDataError(
        this.name,
        this.category,
        `CSV do Stooq com colunas insuficientes: ${dataLine.slice(0, 100)}`,
      );
    }

    const fullSymbol = fields[0] ?? '';
    const date = fields[1] ?? '';
    const time = fields[2] ?? '';
    const closeStr = fields[6] ?? '';
    const volumeStr = fields[7] ?? '0';
    const close = parseFloat(closeStr);
    const volume = parseFloat(volumeStr);

    if (isNaN(close) || close === 0) {
      throw new ProviderDataError(
        this.name,
        this.category,
        `PreÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â§o invÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¡lido retornado pelo Stooq para ${ticker}`,
      );
    }

    const market = fullSymbol.split('.').pop()?.toUpperCase() ?? 'US';
    const currency = MARKET_CURRENCY[market] ?? 'USD';

    return {
      ticker: fullSymbol.toUpperCase(),
      market,
      price: close,
      currency,
      change: 0,
      changePercent: 0,
      volume: isNaN(volume) ? 0 : volume,
      marketTime: date && time ? new Date(`${date}T${time}Z`).toISOString() : new Date().toISOString(),
      source: 'stooq',
    };
  }
}