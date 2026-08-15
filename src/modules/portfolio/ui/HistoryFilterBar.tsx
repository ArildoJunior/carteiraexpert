'use client';

import Link from 'next/link';
import type { Portfolio } from '../domain/portfolio.types';

interface HistoryFilterBarProps {
  portfolios: Portfolio[];
  selectedPortfolioId?: string;
  selectedType?: string;
  selectedTicker?: string;
  selectedStartDate?: string;
  selectedEndDate?: string;
}

export function HistoryFilterBar({
  portfolios,
  selectedPortfolioId = '',
  selectedType = '',
  selectedTicker = '',
  selectedStartDate = '',
  selectedEndDate = '',
}: HistoryFilterBarProps) {
  const hasActiveFilters = Boolean(
    selectedPortfolioId ||
      selectedType ||
      selectedTicker ||
      selectedStartDate ||
      selectedEndDate
  );

  return (
    <form
      id="history-filters-form"
      method="GET"
      action="/history"
      className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-4"
    >
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">
          Filtros de Operações
        </h3>
        {hasActiveFilters && (
          <Link
            id="btn-clear-history-filters"
            href="/history"
            className="text-xs text-emerald-400 hover:text-emerald-300 hover:underline transition-colors"
          >
            Limpar Filtros
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        {/* Carteira */}
        <div className="space-y-1">
          <label
            htmlFor="history-filter-portfolio"
            className="block text-xs font-semibold text-slate-300"
          >
            Carteira
          </label>
          <select
            id="history-filter-portfolio"
            name="portfolioId"
            defaultValue={selectedPortfolioId}
            className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 transition-colors"
          >
            <option value="">Todas as Carteiras</option>
            {portfolios.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.baseCurrency})
              </option>
            ))}
          </select>
        </div>

        {/* Tipo de Operação */}
        <div className="space-y-1">
          <label
            htmlFor="history-filter-type"
            className="block text-xs font-semibold text-slate-300"
          >
            Tipo
          </label>
          <select
            id="history-filter-type"
            name="type"
            defaultValue={selectedType}
            className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 transition-colors"
          >
            <option value="">Todos os Tipos</option>
            <option value="BUY">🟢 Compra</option>
            <option value="SELL">🔵 Venda</option>
          </select>
        </div>

        {/* Ativo / Ticker */}
        <div className="space-y-1">
          <label
            htmlFor="history-filter-ticker"
            className="block text-xs font-semibold text-slate-300"
          >
            Ticker / Ativo
          </label>
          <input
            id="history-filter-ticker"
            type="text"
            name="ticker"
            defaultValue={selectedTicker}
            placeholder="Ex: PETR4"
            className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white uppercase placeholder:normal-case placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 transition-colors"
          />
        </div>

        {/* Data Inicial */}
        <div className="space-y-1">
          <label
            htmlFor="history-filter-start-date"
            className="block text-xs font-semibold text-slate-300"
          >
            Data Inicial
          </label>
          <input
            id="history-filter-start-date"
            type="date"
            name="startDate"
            defaultValue={selectedStartDate}
            className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 transition-colors"
          />
        </div>

        {/* Data Final */}
        <div className="space-y-1">
          <label
            htmlFor="history-filter-end-date"
            className="block text-xs font-semibold text-slate-300"
          >
            Data Final
          </label>
          <input
            id="history-filter-end-date"
            type="date"
            name="endDate"
            defaultValue={selectedEndDate}
            className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 transition-colors"
          />
        </div>
      </div>

      <div className="flex justify-end pt-1">
        <button
          id="btn-apply-history-filters"
          type="submit"
          className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition-all shadow-sm flex items-center gap-1.5"
        >
          <span>🔍</span> Filtrar Operações
        </button>
      </div>
    </form>
  );
}
