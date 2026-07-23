// lib/providers/adapters/sec-edgar.ts
// SecEdgarAdapter â€” fundamentals US (10-K/10-Q) + dividendos US
// Cap 6 â€” 6L-2 (Fundamentos) â€” priority 1
// Cap 6 â€” 6M (Dividendos) â€” priority 2
// DocumentaÃ§Ã£o: https://www.sec.gov/edgar/sec-api-documentation
// IMPORTANTE: SEC exige User-Agent com email de contato. Define SEC_CONTACT_EMAIL no .env.

import type { ProviderAdapter, ProviderCategory } from "../types";
import { ProviderAuthError, ProviderDataError, ProviderRateLimit, ProviderTimeout } from "../types";

export interface FundamentalInput {
  symbol: string; // "AAPL", "MSFT", "GOOGL"
  form?: "10-K" | "10-Q"; // default '10-K' (anual)
}

export interface FundamentalOutput {
  symbol: string;
  cik: string;
  companyName: string;
  filings: Array<{
    form: string; // "10-K", "10-Q"
    filedAt: string; // YYYY-MM-DD
    periodOfReport?: string;
    accessionNumber: string;
    primaryDocument: string;
  }>;
  source: "sec_edgar";
}

const SEC_BASE = "https://data.sec.gov";

// Cache CIK â†’ companyName (tickers podem ser consultados vÃ¡rias vezes)
const cikCache = new Map<string, { cik: string; name: string }>();

function getHeaders(): Record<string, string> {
  const email = process.env.SEC_CONTACT_EMAIL ?? "dev@carteiraexpert.local";
  return {
    "User-Agent": `CarteiraExpert/1.0 (${email})`,
    Accept: "application/json,text/plain,*/*",
    Host: "data.sec.gov",
  };
}

async function resolveCIK(ticker: string): Promise<{ cik: string; name: string }> {
  const t = ticker.toUpperCase();
  const cached = cikCache.get(t);
  if (cached) return cached;

  // Endpoint: /submissions/CIK{10digits}.json â€” mas a gente nÃ£o tem CIK ainda.
  // Usa o endpoint de tickerâ†’CIK: https://www.sec.gov/files/company_tickers.json
  const url = "https://www.sec.gov/files/company_tickers.json";
  const r = await fetch(url, { headers: getHeaders(), signal: AbortSignal.timeout(10000) });
  if (!r.ok) {
    throw new ProviderDataError("sec_edgar", "fundamental_us", `HTTP ${r.status} ao buscar CIK`);
  }
  const data = (await r.json()) as Record<
    string,
    { cik_str: number; ticker: string; title: string }
  >;

  const found = Object.values(data).find((e) => e.ticker === t);
  if (!found) {
    throw new ProviderDataError(
      "sec_edgar",
      "fundamental_us",
      `Ticker "${ticker}" nÃ£o encontrado na SEC`
    );
  }

  const cikPadded = String(found.cik_str).padStart(10, "0");
  const result = { cik: cikPadded, name: found.title };
  cikCache.set(t, result);
  return result;
}

export class SecEdgarAdapter implements ProviderAdapter<FundamentalInput, FundamentalOutput> {
  readonly name = "sec_edgar";
  readonly category: ProviderCategory;
  readonly priority: number;

  constructor(category: ProviderCategory = "fundamental_us", priority = 1) {
    this.category = category;
    this.priority = priority;
  }

  isConfigured(): boolean {
    return Boolean(process.env.SEC_CONTACT_EMAIL);
  }

  async ping(): Promise<boolean> {
    try {
      const r = await fetch(`${SEC_BASE}/submissions/CIK0000320193.json`, {
        headers: getHeaders(),
        signal: AbortSignal.timeout(5000),
      });
      return r.ok;
    } catch {
      return false;
    }
  }

  async fetch(input: FundamentalInput): Promise<FundamentalOutput> {
    const { cik, name } = await resolveCIK(input.symbol);
    const form = input.form ?? "10-K";

    const url = `${SEC_BASE}/submissions/CIK${cik}.json`;

    let response: Response;
    try {
      response = await fetch(url, { headers: getHeaders(), signal: AbortSignal.timeout(10000) });
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
      cik: string;
      name: string;
      filings: {
        recent: {
          form: string[];
          filingDate: string[];
          reportDate: string[];
          accessionNumber: string[];
          primaryDocument: string[];
        };
        files?: string[];
      };
    };

    const recent = json.filings.recent;
    const matches: FundamentalOutput["filings"] = [];

    for (let i = 0; i < recent.form.length; i++) {
      const f = recent.form[i];
      const filedAt = recent.filingDate[i];
      const accessionNumber = recent.accessionNumber[i];
      const primaryDocument = recent.primaryDocument[i];
      if (f !== form || !filedAt || !accessionNumber || !primaryDocument) continue;
      matches.push({
        form: f,
        filedAt,
        periodOfReport: recent.reportDate?.[i] ?? "",
        accessionNumber,
        primaryDocument,
      });
      if (matches.length >= 5) break; // últimos 5
    }

    return {
      symbol: input.symbol.toUpperCase(),
      cik,
      companyName: json.name ?? name,
      filings: matches,
      source: "sec_edgar",
    };
  }
}
