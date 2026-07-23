// lib/providers/adapters/bc-sgs.ts
// BCSgsAdapter — Sistema Gerenciador de Séries Temporais do Banco Central
// Cap 6 — 6L-1 (Indicadores) — priority 1
// Documentação: https://www3.bcb.gov.br/sgspub/

import type { ProviderAdapter, ProviderCategory } from "../types";
import { ProviderAuthError, ProviderDataError, ProviderRateLimit, ProviderTimeout } from "../types";

export interface IndicatorInput {
  // Código da série no SGS. Catálogo: https://www3.bcb.gov.br/sgspub/
  // 11 = Selic diária, 432 = IPCA mensal, 433 = IPCA 12m, 188 = Meta Selic, 4390 = CDI
  code: number;
  last?: number; // últimos N valores (default 12)
}

export interface IndicatorDataPoint {
  date: string; // YYYY-MM-DD
  value: number;
}

export interface IndicatorOutput {
  code: number;
  name: string;
  unit: string;
  series: IndicatorDataPoint[];
  source: "bc_sgs";
}

const SGS_BASE = "https://api.bcb.gov.br/dados/serie/bcdata.sgs";

// Nomes amigáveis para os códigos mais comuns (catálogo resumido)
const SERIES_META: Record<number, { name: string; unit: string }> = {
  11: { name: "Taxa Selic (% a.a.)", unit: "% a.a." },
  188: { name: "Meta Selic (% a.a.)", unit: "% a.a." },
  432: { name: "IPCA - Variação mensal", unit: "%" },
  433: { name: "IPCA - Acumulado 12 meses", unit: "%" },
  4389: { name: "IPCA - Variação 12 meses (núcleo)", unit: "%" },
  4390: { name: "CDI - Taxa acumulada 12 meses", unit: "%" },
  12: { name: "Selic - Taxa diária", unit: "% a.d." },
  1178: { name: "Selic - Over", unit: "% a.a." },
  4189: { name: "IGP-M - Variação 12 meses", unit: "%" },
  13521: { name: "Taxa de câmbio - Livre (R$/US$)", unit: "R$/US$" },
};

export class BCSgsAdapter implements ProviderAdapter<IndicatorInput, IndicatorOutput> {
  readonly name = "bc_sgs";
  readonly category: ProviderCategory = "indicator";
  readonly priority = 1; // primário para indicadores BR

  isConfigured(): boolean {
    return true; // API pública
  }

  async ping(): Promise<boolean> {
    try {
      const r = await fetch(`${SGS_BASE}.11/dados/ultimos/1?formato=json`, {
        signal: AbortSignal.timeout(5000),
      });
      return r.ok;
    } catch {
      return false;
    }
  }

  async fetch(input: IndicatorInput): Promise<IndicatorOutput> {
    const last = input.last ?? 12;
    const url = `${SGS_BASE}.${input.code}/dados/ultimos/${last}?formato=json`;

    let response: Response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(10000) });
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

    const json = (await response.json()) as Array<{
      data: string; // DD/MM/YYYY
      valor: string; // número como string
    }>;

    if (!Array.isArray(json) || json.length === 0) {
      throw new ProviderDataError(this.name, this.category, `SGS código ${input.code} sem dados`);
    }

    const series: IndicatorDataPoint[] = json.map((p) => {
      // converte DD/MM/YYYY → YYYY-MM-DD
      const [dd, mm, yyyy] = p.data.split("/");
      return {
        date: `${yyyy}-${mm}-${dd}`,
        value: Number.parseFloat(p.valor),
      };
    });

    const meta = SERIES_META[input.code] ?? { name: `SGS ${input.code}`, unit: "" };

    return {
      code: input.code,
      name: meta.name,
      unit: meta.unit,
      series,
      source: "bc_sgs",
    };
  }
}
