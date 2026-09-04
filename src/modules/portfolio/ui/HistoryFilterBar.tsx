'use client';

import Link from 'next/link';
import type { Portfolio } from '../domain/portfolio.types';

export interface HistoryCustodyAccountOption {
  id: string;
  name: string;
  institutionName: string;
  portfolioId: string;
}

interface HistoryFilterBarProps {
  portfolios: Portfolio[];
  custodyAccounts?: HistoryCustodyAccountOption[];
  selectedPortfolioId?: string;
  selectedCustodyAccountId?: string;
  selectedType?: string;
  selectedTicker?: string;
  selectedStartDate?: string;
  selectedEndDate?: string;
}

export function HistoryFilterBar({
  portfolios,
  custodyAccounts = [],
  selectedPortfolioId = '',
  selectedCustodyAccountId = '',
  selectedType = '',
  selectedTicker = '',
  selectedStartDate = '',
  selectedEndDate = '',
}: HistoryFilterBarProps) {
  const hasActiveFilters = Boolean(
    selectedPortfolioId ||
      selectedCustodyAccountId ||
      selectedType ||
      selectedTicker ||
      selectedStartDate ||
      selectedEndDate
  );

  const filteredCustodyAccounts = selectedPortfolioId
    ? custodyAccounts.filter((acc) => acc.portfolioId === selectedPortfolioId)
    : custodyAccounts;

  return (
    <form
      id="history-filters-form"
      method="GET"
      action="/history"
      className="bg-surface border border-border-theme rounded-2xl p-5 shadow-sm space-y-4 text-text-primary"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wider text-text-secondary">
          Filtros de Operações
        </h3>
        {hasActiveFilters && (
          <Link
            id="btn-clear-history-filters"
            href="/history"
            className="text-xs text-action-primary hover:underline transition-colors font-semibold"
          >
            Limpar Filtros
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5">
        {/* Carteira */}
        <div className="space-y-1">
          <label
            htmlFor="history-filter-portfolio"
            className="block text-xs font-semibold text-text-secondary"
          >
            Carteira
          </label>
          <select
            id="history-filter-portfolio"
            name="portfolioId"
            defaultValue={selectedPortfolioId}
            className="w-full bg-background border border-border-theme rounded-xl px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-action-primary transition-colors"
          >
            <option value="">Todas as Carteiras</option>
            {portfolios.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.baseCurrency})
              </option>
            ))}
          </select>
        </div>

        {/* Conta de Custódia / Instituição */}
        <div className="space-y-1">
          <label
            htmlFor="history-filter-custody-account"
            className="block text-xs font-semibold text-text-secondary"
          >
            Instituição / Custódia
          </label>
          <select
            id="history-filter-custody-account"
            name="custodyAccountId"
            defaultValue={selectedCustodyAccountId}
            className="w-full bg-background border border-border-theme rounded-xl px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-action-primary transition-colors"
          >
            <option value="">Todas as Instituições</option>
            {filteredCustodyAccounts.map((acc) => (
              <option key={acc.id} value={acc.id}>
                {acc.institutionName} — {acc.name}
              </option>
            ))}
          </select>
        </div>

        {/* Tipo de Operação */}
        <div className="space-y-1">
          <label
            htmlFor="history-filter-type"
            className="block text-xs font-semibold text-text-secondary"
          >
            Tipo
          </label>
          <select
            id="history-filter-type"
            name="type"
            defaultValue={selectedType}
            className="w-full bg-background border border-border-theme rounded-xl px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-action-primary transition-colors"
          >
            <option value="">Todos os Tipos</option>
            <option value="BUY">🟢 Compra</option>
            <option value="SELL">🔵 Venda</option>
            <option value="SPLIT">🔀 Desdobramento (Split)</option>
            <option value="GROUPING">🔄 Grupamento</option>
            <option value="BONUS_SHARE">🎁 Bonificação</option>
            <option value="DIVIDEND">💵 Dividendo</option>
            <option value="JCP">🏛️ JCP</option>
          </select>
        </div>

        {/* Ativo / Ticker */}
        <div className="space-y-1">
          <label
            htmlFor="history-filter-ticker"
            className="block text-xs font-semibold text-text-secondary"
          >
            Ticker / Ativo
          </label>
          <input
            id="history-filter-ticker"
            type="text"
            name="ticker"
            defaultValue={selectedTicker}
            placeholder="Ex: PETR4"
            className="w-full bg-background border border-border-theme rounded-xl px-3 py-2 text-xs text-text-primary uppercase placeholder:normal-case placeholder:text-text-secondary/50 focus:outline-none focus:ring-2 focus:ring-action-primary transition-colors"
          />
        </div>

        {/* Data Inicial */}
        <div className="space-y-1">
          <label
            htmlFor="history-filter-start-date"
            className="block text-xs font-semibold text-text-secondary"
          >
            Data Inicial
          </label>
          <input
            id="history-filter-start-date"
            type="date"
            name="startDate"
            defaultValue={selectedStartDate}
            className="w-full bg-background border border-border-theme rounded-xl px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-action-primary transition-colors"
          />
        </div>

        {/* Data Final */}
        <div className="space-y-1">
          <label
            htmlFor="history-filter-end-date"
            className="block text-xs font-semibold text-text-secondary"
          >
            Data Final
          </label>
          <input
            id="history-filter-end-date"
            type="date"
            name="endDate"
            defaultValue={selectedEndDate}
            className="w-full bg-background border border-border-theme rounded-xl px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-action-primary transition-colors"
          />
        </div>
      </div>

      <div className="flex justify-end pt-1">
        <button
          id="btn-apply-history-filters"
          type="submit"
          className="px-5 py-2 text-xs font-bold text-action-primary-text bg-action-primary hover:opacity-90 rounded-xl transition-all shadow-sm flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-action-primary"
        >
          <span>🔍</span> Filtrar Operações
        </button>
      </div>
    </form>
  );
}
