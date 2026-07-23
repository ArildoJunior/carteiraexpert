// lib/providers/adapters/ibge.ts
// IBGEAdapter â€” Indicadores IBGE (IPCA, PIB, INPC, etc.)
// Cap 6 â€” 6L-1 (Indicadores) â€” priority 2
// DocumentaÃ§Ã£o: https://servicodados.ibge.gov.br/api/docs

import type { ProviderAdapter, ProviderCategory } from '../types';
import {
  ProviderAuthError,
  ProviderDataError,
  ProviderTimeout,
  ProviderRateLimit,
} from '../types';

export interface IndicatorInput {
  // ID do agregado no SIDRA. IPCA = 1737, PIB = 1620, INPC = 1693
  agregado: number;
  // ID da variÃ¡vel dentro do agregado. IPCA variaÃ§Ã£o mensal = 63, acumulada 12m = 2265
  variavel: number;
  // CÃ³digo da localidade: 1=Brasil, 2=RegiÃ£o Norte, ..., 6=Centro-Oeste
  // 3550308=SP, 3304557=Rio, etc.
  localidade?: number; // default: 1 (Brasil)
  // PerÃ­odo: -6 (Ãºltimos 6), -12 (Ãºltimos 12), ou YYYYMM especÃ­fico
  periodos?: number | string; // default: -12
}

export interface IndicatorOutput {
  agregado: number;
  variavel: number;
  name: string;
  series: Array<{ date: string; value: number }>;
  source: 'ibge';
}

const IBGE_BASE = 'https://servicodados.ibge.gov.br/api/v3/agregados';

// CatÃ¡logo resumido (variÃ¡veis mais comuns)
const CATALOG: Record<string, { name: string; variavel: number; desc: string }> = {
  '1737:63': { name: 'IPCA - VariaÃ§Ã£o mensal', variavel: 63, desc: 'Brasil' },
  '1737:2265': { name: 'IPCA - Acumulado 12 meses', variavel: 2265, desc: 'Brasil' },
  '1737:3550': { name: 'IPCA - Acumulado ano', variavel: 3550, desc: 'Brasil' },
  '1693:63': { name: 'INPC - VariaÃ§Ã£o mensal', variavel: 63, desc: 'Brasil' },
  '1620:606': { name: 'PIB - VariaÃ§Ã£o trimestral', variavel: 606, desc: 'Brasil' },
  '1620:9319': { name: 'PIB - VariaÃ§Ã£o acumulada 12 meses', variavel: 9319, desc: 'Brasil' },
};

export class IBGEAdapter
  implements ProviderAdapter<IndicatorInput, IndicatorOutput>
{
  readonly name = 'ibge';
  readonly category: ProviderCategory = 'indicator';
  readonly priority = 2; // fallback do BCSgs

  isConfigured(): boolean {
    return true; // API pÃºblica
  }

  async ping(): Promise<boolean> {
    try {
      const r = await fetch(
        `${IBGE_BASE}/1737/periodos/-6/variaveis/63?localidades=1`,
        { signal: AbortSignal.timeout(5000) },
      );
      return r.ok;
    } catch {
      return false;
    }
  }

  async fetch(input: IndicatorInput): Promise<IndicatorOutput> {
    const localidade = input.localidade ?? 1;
    const periodos = input.periodos ?? -12;

    const url = `${IBGE_BASE}/${input.agregado}/periodos/${periodos}/variaveis/${input.variavel}?localidades=${localidade}`;

    let response: Response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(15000) });
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
      variavel: string;
      unidade: string;
      resultados: Array<{
        classificacoes: unknown[];
        series: Array<{
          local: { id: string; nome: string };
          serie: Record<string, string>; // "202401" -> "4.87"
        }>;
      }>;
    }>;

    if (!Array.isArray(json) || json.length === 0) {
      throw new ProviderDataError(
        this.name,
        this.category,
        `IBGE agregado ${input.agregado}/var ${input.variavel} sem dados`,
      );
    }

    const [variable] = json;
    if (!variable) {
      throw new ProviderDataError(
        this.name,
        this.category,
        `IBGE agregado ${input.agregado}/var ${input.variavel} sem resultados`,
      );
    }
    const firstSeries = variable.resultados?.[0]?.series?.[0];
    if (!firstSeries) {
      throw new ProviderDataError(
        this.name,
        this.category,
        `IBGE sem sÃ©rie de dados para ${input.agregado}/${input.variavel}`,
      );
    }

    const series = Object.entries(firstSeries.serie)
      .map(([periodo, valor]) => ({
        date: String(periodo), // formato "YYYYMM" ou "YYYYQ1"
        value: parseFloat(valor),
      }))
      .filter((p) => !isNaN(p.value))
      .sort((a, b) => a.date.localeCompare(b.date));

    const catalogKey = `${input.agregado}:${input.variavel}`;
    const name = CATALOG[catalogKey]?.name ?? variable.variavel;

    return {
      agregado: input.agregado,
      variavel: input.variavel,
      name,
      series,
      source: 'ibge',
    };
  }
}