// lib/providers/adapters/dividend-us.ts
// DividendUSAdapter — dividendos US via SEC XBRL
// Cap 6 — 6M (Dividendos) — priority 1

import type { ProviderAdapter, ProviderCategory } from '../types';
import {
  ProviderAuthError,
  ProviderDataError,
  ProviderTimeout,
  ProviderRateLimit,
} from '../types';
import { SecEdgarAdapter } from './sec-edgar';

export interface DividendInput {
  ticker: string;
}

export interface DividendOutput {
  ticker: string;
  cik: string;
  companyName: string;
  dividends: Array<{
    date: string;
    value: number;
    form: string;
  }>;
  source: 'sec_edgar';
}

const SEC_BASE = 'https://data.sec.gov';

function getHeaders(): Record<string, string> {
  const email = process.env.SEC_CONTACT_EMAIL ?? 'dev@carteiraexpert.local';
  return {
    'User-Agent': `CarteiraExpert/1.0 (${email})`,
    'Accept': 'application/json,text/plain,*/*',
  };
}

export class DividendUSAdapter
  implements ProviderAdapter<DividendInput, DividendOutput>
{
  readonly name = 'dividend_us';
  readonly category: ProviderCategory = 'dividend_us';
  readonly priority = 1;

  private readonly cikResolver = new SecEdgarAdapter('fundamental_us', 1);

  isConfigured(): boolean {
    return this.cikResolver.isConfigured();
  }

  async ping(): Promise<boolean> {
    return this.cikResolver.ping();
  }

  async fetch(input: DividendInput): Promise<DividendOutput> {
    const ticker = (input.ticker ?? '').toUpperCase();
    if (!ticker) {
      throw new ProviderDataError(this.name, this.category, 'Ticker vazio');
    }

    const submissions = await this.cikResolver.fetch({ symbol: ticker });
    const cik = submissions.cik;
    const companyName = submissions.companyName;

    const url = `${SEC_BASE}/api/xbrl/companyconcept/CIK${cik}/us-gaap/CommonStockDividendsPerShareDeclared.json`;

    let response: Response;
    try {
      response = await fetch(url, { headers: getHeaders(), signal: AbortSignal.timeout(15000) });
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
      cik: string;
      entityName: string;
      units?: {
        USD?: Array<{
          end: string;
          val: number;
          form: string;
          filed: string;
          accn: string;
          fp: string;
        }>;
        'USD/shares'?: Array<{
          end: string;
          val: number;
          form: string;
          filed: string;
          accn: string;
          fp: string;
        }>;
      };
    };

    const units = json.units?.['USD/shares'] ?? json.units?.USD ?? [];

    const dividends = units
      .filter((u) => u.val > 0 && (u.form === '10-K' || u.form === '10-Q'))
      .map((u) => ({
        date: u.end,
        value: u.val,
        form: u.form,
      }))
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 20);

    return {
      ticker,
      cik,
      companyName: json.entityName ?? companyName,
      dividends,
      source: 'sec_edgar',
    };
  }
}