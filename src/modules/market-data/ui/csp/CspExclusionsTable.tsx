'use client';

import React, { useState, useMemo } from 'react';
import type { CspExclusionReason, CspExclusionRecord } from '@/modules/market-data/domain/csp.types';

export interface CspExclusionsTableProps {
  exclusions: CspExclusionRecord[];
  className?: string;
}

function getReasonBadge(reason: CspExclusionReason) {
  switch (reason) {
    case 'MARGEM_NEGATIVA':
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
          Margem Negativa
        </span>
      );
    case 'DIVIDA_ACIMA_DO_LIMITE':
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
          Dívida Excessiva
        </span>
      );
    case 'COTACAO_DEFASADA':
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
          Cotação Defasada
        </span>
      );
    case 'COTACAO_INDISPONIVEL':
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-surface-elevated text-text-muted border border-border-theme">
          Sem Cotação
        </span>
      );
    case 'ROE_ABAIXO_DO_MINIMO':
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
          ROE Insuficiente
        </span>
      );
    case 'LIQUIDEZ_INSUFICIENTE':
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
          Baixa Liquidez
        </span>
      );
    case 'CLASSE_INCOMPATIVEL':
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20">
          Classe Incompatível
        </span>
      );
    case 'DADOS_INCOMPLETOS':
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-surface-elevated text-text-muted border border-border-theme">
          Dados Incompletos
        </span>
      );
  }
}

export function CspExclusionsTable({
  exclusions,
  className = '',
}: CspExclusionsTableProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedReason, setSelectedReason] = useState<string>('ALL');

  const filteredExclusions = useMemo(() => {
    return exclusions.filter((item) => {
      const matchesSearch =
        searchTerm.trim() === '' ||
        item.ticker.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.detail.toLowerCase().includes(searchTerm.toLowerCase());

      const matchesReason =
        selectedReason === 'ALL' || item.reason === selectedReason;

      return matchesSearch && matchesReason;
    });
  }, [exclusions, searchTerm, selectedReason]);

  if (!exclusions || exclusions.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border-theme bg-surface-elevated/40 p-8 text-center text-xs text-text-muted">
        Nenhum ativo excluído na simulação. Todos os avaliados foram considerados elegíveis.
      </div>
    );
  }

  return (
    <div className={`rounded-xl border border-border-theme bg-surface overflow-hidden shadow-xs space-y-3 ${className}`}>
      {/* Cabeçalho com Filtros */}
      <div className="p-4 border-b border-border-theme flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-bold text-text-primary">
            Rastreabilidade de Ativos Descartados
          </h4>
          <p className="text-xs text-text-muted">
            Transparência contábil: {exclusions.length} {exclusions.length === 1 ? 'ativo não atendeu' : 'ativos não atenderam'} aos filtros objetivos da CSP.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="text"
            placeholder="Filtrar por ticker..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="px-2.5 py-1 rounded-md bg-surface-elevated border border-border-theme text-xs text-text-primary placeholder:text-text-muted focus:ring-1 focus:ring-brand focus:border-brand"
          />
          <select
            value={selectedReason}
            onChange={(e) => setSelectedReason(e.target.value)}
            className="px-2.5 py-1 rounded-md bg-surface-elevated border border-border-theme text-xs text-text-secondary focus:ring-1 focus:ring-brand focus:border-brand"
          >
            <option value="ALL">Todos os Motivos</option>
            <option value="MARGEM_NEGATIVA">Margem Negativa</option>
            <option value="DIVIDA_ACIMA_DO_LIMITE">Dívida Excessiva</option>
            <option value="COTACAO_DEFASADA">Cotação Defasada</option>
            <option value="COTACAO_INDISPONIVEL">Sem Cotação</option>
            <option value="ROE_ABAIXO_DO_MINIMO">ROE Insuficiente</option>
            <option value="DADOS_INCOMPLETOS">Dados Incompletos</option>
          </select>
        </div>
      </div>

      {/* Tabela de Exclusões */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-surface-elevated/60 text-text-secondary uppercase text-[10px] tracking-wider border-b border-border-theme">
            <tr>
              <th scope="col" className="py-2.5 px-4 font-bold">Ticker</th>
              <th scope="col" className="py-2.5 px-4 font-bold">Motivo de Exclusão</th>
              <th scope="col" className="py-2.5 px-4 font-bold">Nota de Auditoria e Critério Violado</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-theme/60">
            {filteredExclusions.map((item, idx) => (
              <tr
                key={`excl-${item.ticker}-${idx}`}
                className="hover:bg-surface-elevated/40 transition-colors"
              >
                <td className="py-2.5 px-4 font-bold text-text-primary whitespace-nowrap">
                  <span className="px-2 py-0.5 rounded bg-surface-elevated border border-border-theme font-mono">
                    {item.ticker}
                  </span>
                </td>
                <td className="py-2.5 px-4 whitespace-nowrap">
                  {getReasonBadge(item.reason)}
                </td>
                <td className="py-2.5 px-4 text-text-muted leading-relaxed">
                  {item.detail}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filteredExclusions.length === 0 && (
        <div className="p-6 text-center text-xs text-text-muted">
          Nenhum ativo corresponde aos filtros de busca aplicados.
        </div>
      )}
    </div>
  );
}
