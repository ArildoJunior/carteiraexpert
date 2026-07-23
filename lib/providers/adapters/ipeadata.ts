// lib/providers/adapters/ipeadata.ts
// IpeaDataAdapter ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â Indicadores IPEA (IPCA, Selic, PIB, cÃƒÆ’Ã‚Â¢mbio, etc.)
// Cap 6 ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â 6L-1 (Indicadores) ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â priority 3
// DocumentaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o: http://www.ipeadata.gov.br/api/

import type { ProviderAdapter, ProviderCategory } from "../types";
import { ProviderAuthError, ProviderDataError, ProviderRateLimit, ProviderTimeout } from "../types";

export interface IndicatorInput {
  // SERCODIGO da sÃƒÆ’Ã‚Â©rie no IPEADATA. Lista: http://www.ipeadata.gov.br/Default.aspx
  // 'PAN12_IPCAG12' = IPCA 12m, 'BM12_TJOVER12' = Taxa Over 12m, 'PAN12_IGPMG12' = IGP-M 12m
  code: string;
  // Quantos ÃƒÆ’Ã‚Âºltimos valores trazer (default 12)
  last?: number;
}

export interface IndicatorOutput {
  code: string;
  name: string;
  unit: string;
  series: Array<{ date: string; value: number }>;
  source: "ipeadata";
}

const IPEA_BASE = "http://www.ipeadata.gov.br/api/odata4";

const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "application/json,text/plain,*/*",
};

// CatÃƒÆ’Ã‚Â¡logo resumido
const CATALOG: Record<string, { name: string; unit: string }> = {
  PAN12_IPCAG12: { name: "IPCA - Acumulado 12 meses", unit: "%" },
  PAN12_IGPMG12: { name: "IGP-M - Acumulado 12 meses", unit: "%" },
  PAN12_INPCAG12: { name: "INPC - Acumulado 12 meses", unit: "%" },
  BM12_TJOVER12: { name: "Taxa de juros Over (CDI/Selic) 12m", unit: "% a.a." },
  PAN_PIBPMV4: { name: "PIB - VariaÃƒÆ’Ã‚Â§ÃƒÆ’Ã‚Â£o 12 meses", unit: "%" },
  GM12_ERC12: { name: "CÃƒÆ’Ã‚Â¢mbio - R$/US$ (mÃƒÆ’Ã‚Â©dia mensal)", unit: "R$/US$" },
};

export class IpeaDataAdapter implements ProviderAdapter<IndicatorInput, IndicatorOutput> {
  readonly name = "ipeadata";
  readonly category: ProviderCategory = "indicator";
  readonly priority = 3; // fallback 2

  isConfigured(): boolean {
    return true; // API pÃƒÆ’Ã‚Âºblica
  }

  async ping(): Promise<boolean> {
    try {
      const r = await fetch(
        `${IPEA_BASE}/ValoresSerie(SERCODIGO='PAN12_IPCAG12')?$top=1&$format=json`,
        { signal: AbortSignal.timeout(5000), headers: BROWSER_HEADERS }
      );
      return r.ok;
    } catch {
      return false;
    }
  }

  async fetch(input: IndicatorInput): Promise<IndicatorOutput> {
    const last = input.last ?? 12;
    const url = `${IPEA_BASE}/ValoresSerie(SERCODIGO='${input.code}')?$top=${last}&$orderby=VALDATA%20desc&$format=json`;

    let response: Response;
    try {
      response = await fetch(url, {
        signal: AbortSignal.timeout(15000),
        headers: BROWSER_HEADERS,
      });
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
      value?: Array<{
        SERCODIGO: string;
        VALDATA: string; // "YYYY-MM-DD"
        VALVALOR: number;
        SERNOME?: string;
        SERUNIDADE?: string;
      }>;
    };

    if (!json.value || json.value.length === 0) {
      throw new ProviderDataError(
        this.name,
        this.category,
        `IPEADATA cÃƒÆ’Ã‚Â³digo ${input.code} sem dados`
      );
    }

    const series = json.value
      .map((p) => ({
        date: p.VALDATA.split("T")[0] ?? "",
        value: typeof p.VALVALOR === "number" ? p.VALVALOR : Number.parseFloat(String(p.VALVALOR)),
      }))
      .filter((p) => p.date !== "" && !Number.isNaN(p.value))
      .reverse(); // do mais antigo para o mais recente

    const [first] = json.value;
    if (!first) {
      throw new ProviderDataError(
        this.name,
        this.category,
        `IPEADATA cÃƒÂ³digo ${input.code} sem dados`
      );
    }
    const meta = CATALOG[input.code];

    return {
      code: input.code,
      name: meta?.name ?? first.SERNOME ?? input.code,
      unit: meta?.unit ?? first.SERUNIDADE ?? "",
      series,
      source: "ipeadata",
    };
  }
}
