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
      totalIncomeReceived: '0.00000000',
      totalMarketValue: '0.00000000',
      totalUnrealizedPnL: '0.00000000',
      activePositionsCount: 0,
      portfoliosCount: 0,
    };

  const decRealizedPnL = new Decimal(activeGroup.totalRealizedPnL || '0');
  const isPositivePnL = decRealizedPnL.greaterThan(0);
  const isNegativePnL = decRealizedPnL.lessThan(0);

  const decUnrealizedPnL = new Decimal(activeGroup.totalUnrealizedPnL || '0');
  const isPositiveUnrealized = decUnrealizedPnL.greaterThan(0);
  const isNegativeUnrealized = decUnrealizedPnL.lessThan(0);

  return (
    <div className="space-y-4" id="dashboard-consolidated-metrics">
      {/* Seletor de Moeda se houver mais de uma moeda base */}
      {currencyGroups.length > 1 && (
        <div className="flex items-center gap-2.5 pb-1">
          <span className="text-xs font-semibold text-text-secondary">Moeda Base:</span>
          <div className="flex gap-1 bg-surface border border-border-theme p-1 rounded-xl shadow-xs">
            {currencyGroups.map((group, idx) => (
              <button
                key={group.currency}
                id={`btn-currency-tab-${group.currency}`}
                type="button"
                onClick={() => setSelectedCurrencyIndex(idx)}
                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-action-primary ${
                  selectedCurrencyIndex === idx
                    ? 'bg-action-primary text-action-primary-text shadow-xs'
                    : 'text-text-secondary hover:text-text-primary hover:bg-surface-elevated'
                }`}
              >
                {group.currency} ({group.portfoliosCount})
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 sm:gap-4">
        {/* Total em Custódia */}
        <div className="bg-surface border border-border-theme rounded-2xl p-4 sm:p-5 shadow-xs space-y-1.5 hover:border-action-primary/30 transition-colors">
          <p className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider leading-tight">
            Total em Custódia
          </p>
          <p
            id="dashboard-total-custody"
            className="text-lg sm:text-xl font-bold text-text-primary tracking-tight font-mono tabular-nums leading-tight"
          >
            {formatMoney(activeGroup.totalInvestedCost, activeGroup.currency)}
          </p>
          <p className="text-[11px] text-text-secondary leading-tight">
            Custo total consolidado
          </p>
        </div>

        {/* Valor de Mercado */}
        <div className="bg-surface border border-border-theme rounded-2xl p-4 sm:p-5 shadow-xs space-y-1.5 hover:border-action-primary/30 transition-colors">
          <p className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider leading-tight">
            Valor a Mercado
          </p>
          <p
            id="dashboard-total-market-value"
            className="text-lg sm:text-xl font-bold text-action-primary tracking-tight font-mono tabular-nums leading-tight"
          >
            {formatMoney(activeGroup.totalMarketValue || '0', activeGroup.currency)}
          </p>
          <p className="text-[11px] text-text-secondary leading-tight">
            {new Decimal(activeGroup.totalMarketValue || '0').greaterThan(0)
              ? 'Marcação a mercado'
              : 'Sem cotações disponíveis'}
          </p>
        </div>

        {/* PnL Não Realizado */}
        <div className="bg-surface border border-border-theme rounded-2xl p-4 sm:p-5 shadow-xs space-y-1.5 hover:border-action-primary/30 transition-colors">
          <p className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider leading-tight">
            PnL Não Realizado
          </p>
          <p
            id="dashboard-unrealized-pnl"
            className={`text-lg sm:text-xl font-bold tracking-tight font-mono tabular-nums leading-tight ${
              isPositiveUnrealized
                ? 'text-positive-text'
                : isNegativeUnrealized
                ? 'text-negative-text'
                : 'text-text-secondary'
            }`}
          >
            {isPositiveUnrealized ? '+' : ''}
            {formatMoney(activeGroup.totalUnrealizedPnL || '0', activeGroup.currency)}
          </p>
          <p className="text-[11px] text-text-secondary leading-tight">
            Variação patrimonial aberta
          </p>
        </div>

        {/* Resultado Realizado */}
        <div className="bg-surface border border-border-theme rounded-2xl p-4 sm:p-5 shadow-xs space-y-1.5 hover:border-action-primary/30 transition-colors">
          <p className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider leading-tight">
            Resultado Realizado
          </p>
          <p
            id="dashboard-realized-pnl"
            className={`text-lg sm:text-xl font-bold tracking-tight font-mono tabular-nums leading-tight ${
              isPositivePnL
                ? 'text-positive-text'
                : isNegativePnL
                ? 'text-negative-text'
                : 'text-text-secondary'
            }`}
          >
            {isPositivePnL ? '+' : ''}
            {formatMoney(activeGroup.totalRealizedPnL, activeGroup.currency)}
          </p>
          <p className="text-[11px] text-text-secondary leading-tight">
            Lucro/prejuízo de vendas
          </p>
        </div>

        {/* Proventos Recebidos */}
        <div className="bg-surface border border-border-theme rounded-2xl p-4 sm:p-5 shadow-xs space-y-1.5 hover:border-action-primary/30 transition-colors">
          <p className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider leading-tight">
            Proventos Recebidos
          </p>
          <p
            id="dashboard-total-income"
            className="text-lg sm:text-xl font-bold text-positive-text tracking-tight font-mono tabular-nums leading-tight"
          >
            {formatMoney(activeGroup.totalIncomeReceived || '0', activeGroup.currency)}
          </p>
          <p className="text-[11px] text-text-secondary leading-tight">
            Dividendos e JCP
          </p>
        </div>

        {/* Taxas Acumuladas */}
        <div className="bg-surface border border-border-theme rounded-2xl p-4 sm:p-5 shadow-xs space-y-1.5 hover:border-action-primary/30 transition-colors">
          <p className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider leading-tight">
            Taxas Acumuladas
          </p>
          <p
            id="dashboard-total-fees"
            className="text-lg sm:text-xl font-bold text-text-primary tracking-tight font-mono tabular-nums leading-tight"
          >
            {formatMoney(activeGroup.totalFees, activeGroup.currency)}
          </p>
          <p className="text-[11px] text-text-secondary leading-tight">
            Corretagens e taxas
          </p>
        </div>

        {/* Ativos em Carteira */}
        <div className="bg-surface border border-border-theme rounded-2xl p-4 sm:p-5 shadow-xs space-y-1.5 hover:border-action-primary/30 transition-colors">
          <p className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider leading-tight">
            Ativos em Carteira
          </p>
          <p
            id="dashboard-active-assets"
            className="text-lg sm:text-xl font-bold text-action-primary tracking-tight font-mono tabular-nums leading-tight"
          >
            {activeGroup.activePositionsCount}{' '}
            <span className="text-xs font-normal text-text-secondary">
              {activeGroup.activePositionsCount === 1 ? 'ativo' : 'ativos'}
            </span>
          </p>
          <p className="text-[11px] text-text-secondary leading-tight">
            Em {totalActivePortfolios}{' '}
            {totalActivePortfolios === 1 ? 'carteira' : 'carteiras'}
          </p>
        </div>
      </div>
    </div>
  );
}
