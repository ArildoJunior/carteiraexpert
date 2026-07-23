// lib/providers/adapters/bc-ptax.ts
// BCPtaxAdapter — Dólar comercial (USD/BRL) via PTAX do Banco Central
// Cap 6 — 6L-1 (Câmbio) — priority 1
// Documentação: https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/documentacao

import type { ProviderAdapter, ProviderCategory } from '../types';
import {
  ProviderAuthError,
  ProviderDataError,
  ProviderTimeout,
  ProviderRateLimit,
} from '../types';

export interface FxQuoteInput {
  from: 'USD';
  to: 'BRL';
}

export interface FxQuoteOutput {
  from: string;
  to: string;
  bid: number;          // cotação de compra
  ask: number;          // cotação de venda
  mid: number;          // média (bid+ask)/2
  timestamp: string;    // ISO
  source: 'bc_ptax';
}

const PTAX_BASE = 'https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata';

// formata data como MM-DD-YYYY (exigência do Olinda)
function fmtDate(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${mm}-${dd}-${yyyy}`;
}

// retorna os últimos N dias úteis como range (weekends não importam, o BC pula)
function lastBusinessDays(n: number): { from: string; to: string } {
  const today = new Date();
  const past = new Date();
  past.setDate(today.getDate() - n);
  return { from: fmtDate(past), to: fmtDate(today) };
}

export class BCPtaxAdapter
  implements ProviderAdapter<FxQuoteInput, FxQuoteOutput>
{
  readonly name = 'bc_ptax';
  readonly category: ProviderCategory = 'fx';
  readonly priority = 1; // primário para USD/BRL

  isConfigured(): boolean {
    return true; // API pública do BC
  }

  async ping(): Promise<boolean> {
    try {
      const { from, to } = lastBusinessDays(5);
      const url = `${PTAX_BASE}/CotacaoDolarPeriodo(dataInicial=@di,dataFinal=@df)?@di='${from}'&@df='${to}'&$top=1&$format=json`;
      const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
      return r.ok;
    } catch {
      return false;
    }
  }

  async fetch(_input: FxQuoteInput): Promise<FxQuoteOutput> {
    // Tenta 1, 3, 5 dias úteis (em caso de feriado ou cotação não publicada)
    const ranges = [1, 3, 5, 10];

    for (const days of ranges) {
      const { from, to } = lastBusinessDays(days);
      const url = `${PTAX_BASE}/CotacaoDolarPeriodo(dataInicial=@di,dataFinal=@df)?@di='${from}'&@df='${to}'&$top=1&$orderby=dataHoraCotacao%20desc&$format=json&$select=cotacaoCompra,cotacaoVenda,dataHoraCotacao`;

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
      if (response.status >= 500) {
        // erro do servidor — tenta próximo range
        continue;
      }
      if (!response.ok) {
        throw new ProviderDataError(this.name, this.category, `HTTP ${response.status}`);
      }

      const json = (await response.json()) as {
        value?: Array<{
          cotacaoCompra: number;
          cotacaoVenda: number;
          dataHoraCotacao: string; // "YYYY-MM-DD HH:MM:SS.XXX"
        }>;
      };

      const item = json.value?.[0];
      if (item && item.cotacaoVenda > 0) {
        return {
          from: 'USD',
          to: 'BRL',
          bid: item.cotacaoCompra,
          ask: item.cotacaoVenda,
          mid: (item.cotacaoCompra + item.cotacaoVenda) / 2,
          timestamp: new Date(item.dataHoraCotacao).toISOString(),
          source: 'bc_ptax',
        };
      }
    }

    throw new ProviderDataError(
      this.name,
      this.category,
      'PTAX não retornou cotação em nenhum range (1/3/5/10 dias)',
    );
  }
}