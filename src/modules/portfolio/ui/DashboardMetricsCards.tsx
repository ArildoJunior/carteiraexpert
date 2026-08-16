'use client';

import { useState } from 'react';
import { Decimal } from '@/lib/decimal';
import type { SerializedCurrencyGroupSummary } from '../domain/dashboard.types';

interface DashboardMetricsCardsProps {
  currencyGroups: SerializedCurrencyGroupSummary[];
  totalActivePortfolios: number;
}

function formatMoney(value: string | Decimal, currency = 'BRL'): string {
  try {
    const dec = value instanceof Decimal ? value : new Decimal(value || '0');
    const [intPart, fracPart = '00'] = dec.toFixed(2).split('.');
    const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const symbol = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : 'R$';
    return `${symbol} ${formattedInt},${fracPart}`;
  } catch {
    return 'R$ 0,00';
  }
}

export function DashboardMetricsCards({
  currencyGroups,
  totalActivePortfolios,
}: DashboardMetricsCardsProps) {
  const [selectedCurrencyIndex, setSelectedCurrencyIndex] = useState(0);

  const activeGroup =
    currencyGroups[selectedCurrencyIndex] ||
    currencyGroups[0] || {
      currency: 'BRL',
      totalInvestedCost: '0.00000000',
      totalFees: '0.00000000',
      totalRealizedPnL: '0.00000000',
      activePositionsCount: 0,
      portfoliosCount: 0,
    };

  const decRealizedPnL = new Decimal(activeGroup.totalRealizedPnL || '0');
  const isPositivePnL = decRealizedPnL.greaterThan(0);
  const isNegativePnL = decRealizedPnL.lessThan(0);

  return (
    <div className="space-y-4" id="dashboard-consolidated-metrics">
      {/* Seletor de Moeda se houver mais de uma moeda base */}
      {currencyGroups.length > 1 && (
        <div className="flex items-center gap-2 pb-1">
          <span className="text-xs font-semibold text-slate-400">Moeda Base:</span>
          <div className="flex gap-1 bg-slate-900 border border-slate-800 p-1 rounded-xl">
            {currencyGroups.map((group, idx) => (
              <button
                key={group.currency}
                id={`btn-currency-tab-${group.currency}`}
                type="button"
                onClick={() => setSelectedCurrencyIndex(idx)}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all ${
                  selectedCurrencyIndex === idx
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                {group.currency} ({group.portfoliosCount})
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
        {/* Total em Custódia */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-lg space-y-1">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Total em Custódia
          </p>
          <p
            id="dashboard-total-custody"
            className="text-xl sm:text-2xl font-bold text-white tracking-tight"
          >
            {formatMoney(activeGroup.totalInvestedCost, activeGroup.currency)}
          </p>
          <p className="text-[11px] text-slate-500">
            Custo total consolidado
          </p>
        </div>

        {/* Resultado Realizado */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-lg space-y-1">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Resultado Realizado
          </p>
          <p
            id="dashboard-realized-pnl"
            className={`text-xl sm:text-2xl font-bold tracking-tight ${
              isPositivePnL
                ? 'text-emerald-400'
                : isNegativePnL
                ? 'text-red-400'
                : 'text-slate-300'
            }`}
          >
            {isPositivePnL ? '+' : ''}
            {formatMoney(activeGroup.totalRealizedPnL, activeGroup.currency)}
          </p>
          <p className="text-[11px] text-slate-500">
            Lucro/prejuízo de vendas
          </p>
        </div>

        {/* Proventos Recebidos */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-lg space-y-1">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Proventos Recebidos
          </p>
          <p
            id="dashboard-total-income"
            className="text-xl sm:text-2xl font-bold text-amber-400 tracking-tight"
          >
            {formatMoney(activeGroup.totalIncomeReceived || '0', activeGroup.currency)}
          </p>
          <p className="text-[11px] text-slate-500">
            Dividendos e JCP
          </p>
        </div>

        {/* Taxas Acumuladas */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-lg space-y-1">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Taxas Acumuladas
          </p>
          <p
            id="dashboard-total-fees"
            className="text-xl sm:text-2xl font-bold text-slate-200 tracking-tight"
          >
            {formatMoney(activeGroup.totalFees, activeGroup.currency)}
          </p>
          <p className="text-[11px] text-slate-500">
            Corretagens e emolumentos
          </p>
        </div>

        {/* Ativos em Gestão */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-lg space-y-1 col-span-1 sm:col-span-2 lg:col-span-1">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Ativos em Carteira
          </p>
          <p
            id="dashboard-active-assets"
            className="text-xl sm:text-2xl font-bold text-indigo-400 tracking-tight"
          >
            {activeGroup.activePositionsCount}{' '}
            <span className="text-xs sm:text-sm font-normal text-slate-400">
              {activeGroup.activePositionsCount === 1 ? 'ativo' : 'ativos'}
            </span>
          </p>
          <p className="text-[11px] text-slate-500">
            Em {totalActivePortfolios}{' '}
            {totalActivePortfolios === 1 ? 'carteira' : 'carteiras'}
          </p>
        </div>
      </div>
    </div>
  );
}
