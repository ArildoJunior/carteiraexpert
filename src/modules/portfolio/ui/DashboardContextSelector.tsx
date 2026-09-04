'use client';

import { useRouter } from 'next/navigation';
import type { DashboardPortfolioMetadata } from '../domain/dashboard.types';

interface DashboardContextSelectorProps {
  selectedPortfolio: DashboardPortfolioMetadata | null;
  availablePortfolios: DashboardPortfolioMetadata[];
}

export function DashboardContextSelector({
  selectedPortfolio,
  availablePortfolios,
}: DashboardContextSelectorProps) {
  const router = useRouter();

  if (!selectedPortfolio || availablePortfolios.length === 0) {
    return null;
  }

  function handleSelect(portfolioId: string) {
    if (portfolioId === selectedPortfolio?.id) return;
    router.push(`/dashboard?portfolioId=${portfolioId}`);
  }

  const purposeColors: Record<string, string> = {
    REAL: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
    ESTUDO: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30',
    ANALISE: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30',
  };

  const purposeLabels: Record<string, string> = {
    REAL: 'Patrimônio Real',
    ESTUDO: 'Estudo',
    ANALISE: 'Análise',
  };

  return (
    <div
      id="dashboard-context-selector-container"
      className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 bg-surface border border-border-theme p-2.5 sm:px-4 sm:py-2.5 rounded-xl shadow-xs"
    >
      <div className="flex items-center gap-2">
        <label
          htmlFor="dashboard-context-selector"
          className="text-xs font-semibold text-text-secondary uppercase tracking-wider whitespace-nowrap flex items-center gap-1.5"
        >
          <span className="w-2 h-2 rounded-full bg-action-primary" aria-hidden="true" />
          Carteira Ativa:
        </label>
      </div>

      <div className="flex-1 flex items-center gap-2">
        <select
          id="dashboard-context-selector"
          value={selectedPortfolio.id}
          onChange={(e) => handleSelect(e.target.value)}
          aria-label="Selecione a carteira para visualização no Dashboard"
          className="w-full sm:w-auto min-w-[220px] max-w-full bg-background border border-border-theme hover:border-action-primary/50 text-text-primary text-sm font-semibold rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-action-primary transition-all cursor-pointer"
        >
          {availablePortfolios.map((p) => {
            const label = purposeLabels[p.purpose] || p.purpose;
            const statusLabel =
              p.status === 'frozen'
                ? ' [Congelada]'
                : p.status === 'archived'
                  ? ' [Arquivada]'
                  : '';
            return (
              <option key={p.id} value={p.id}>
                {p.name} ({label}){statusLabel}
              </option>
            );
          })}
        </select>

        <span
          id="dashboard-selected-purpose-badge"
          className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border shrink-0 ${
            purposeColors[selectedPortfolio.purpose] || purposeColors.REAL
          }`}
        >
          {purposeLabels[selectedPortfolio.purpose] || selectedPortfolio.purpose}
        </span>

        {selectedPortfolio.status === 'frozen' && (
          <span
            id="dashboard-selected-frozen-badge"
            className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30 shrink-0"
          >
            Somente Leitura
          </span>
        )}

        {selectedPortfolio.status === 'archived' && (
          <span
            id="dashboard-selected-archived-badge"
            className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-surface-elevated text-text-secondary border border-border-theme shrink-0"
          >
            Arquivada
          </span>
        )}
      </div>
    </div>
  );
}
