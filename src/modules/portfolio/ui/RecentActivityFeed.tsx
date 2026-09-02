'use client';

import Link from 'next/link';
import { Decimal } from '@/lib/decimal';
import type { SerializedUserRecentEventItem } from '../domain/dashboard.types';

interface RecentActivityFeedProps {
  events: SerializedUserRecentEventItem[];
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

function formatQuantity(quantity: string | Decimal): string {
  try {
    const dec = quantity instanceof Decimal ? quantity : new Decimal(quantity || '0');
    const str = dec.toString();
    if (!str.includes('.')) {
      return str.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    }
    const [intPart, fracPart] = str.split('.');
    const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return `${formattedInt},${fracPart}`;
  } catch {
    return '0';
  }
}

export function RecentActivityFeed({ events }: RecentActivityFeedProps) {
  if (events.length === 0) {
    return (
      <div
        id="empty-recent-activities"
        className="bg-surface border border-border-theme rounded-2xl p-8 sm:p-10 text-center space-y-4 shadow-xs"
      >
        <div className="w-12 h-12 rounded-2xl bg-surface-elevated border border-border-theme flex items-center justify-center text-text-secondary mx-auto shadow-xs">
          <svg
            className="w-6 h-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="1.5"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13 10V3L4 14h7v7l9-11h-7z"
            />
          </svg>
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold text-text-primary">
            Nenhuma operação recente registrada.
          </p>
          <p className="text-xs text-text-secondary max-w-sm mx-auto">
            Suas compras e vendas manuais aparecerão aqui organizadas cronologicamente por carteira.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      id="dashboard-recent-activity-section"
      className="bg-surface border border-border-theme rounded-2xl overflow-hidden shadow-xs"
    >
      <div className="px-5 sm:px-6 py-4 border-b border-border-theme/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="space-y-0.5">
          <h2 className="text-lg font-bold text-text-primary flex items-center gap-2.5 tracking-tight">
            <span>Atividades Recentes</span>
            <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-surface-elevated text-text-secondary border border-border-theme">
              Últimas {events.length}
            </span>
          </h2>
          <p className="text-xs text-text-secondary">
            Histórico consolidado de compras e vendas ativas entre todas as suas carteiras.
          </p>
        </div>

        <Link
          id="btn-view-all-history-from-dashboard"
          href="/history"
          className="text-xs font-semibold text-action-primary hover:text-action-primary-hover hover:underline transition-colors self-start sm:self-auto focus:outline-none focus-visible:ring-2 focus-visible:ring-action-primary rounded-md px-1 py-0.5"
        >
          Ver extrato completo →
        </Link>
      </div>

      <div className="overflow-x-auto">
        <table
          id="recent-activities-table"
          className="w-full text-left border-collapse text-sm"
        >
          <thead>
            <tr className="border-b border-border-theme/60 bg-background/50 text-[10px] font-semibold text-text-secondary uppercase tracking-wider">
              <th className="px-5 sm:px-6 py-3.5">Tipo</th>
              <th className="px-4 py-3.5">Carteira</th>
              <th className="px-4 py-3.5">Ativo</th>
              <th className="px-4 py-3.5">Data</th>
              <th className="px-4 py-3.5 text-right">Quantidade</th>
              <th className="px-4 py-3.5 text-right">Preço Unitário</th>
              <th className="px-5 sm:px-6 py-3.5 text-right">Taxas</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-theme/40 text-text-primary">
            {events.map((event) => {
              const isBuy = event.type === 'BUY';
              const isSell = event.type === 'SELL';
              const isSplit = event.type === 'SPLIT';
              const isGrouping = event.type === 'GROUPING';
              const isBonus = event.type === 'BONUS_SHARE';
              const isDividend = event.type === 'DIVIDEND';
              const isJcp = event.type === 'JCP';
              const isAdjustment = event.type === 'MANUAL_ADJUSTMENT';

              const tradeDateFormatted = new Date(event.tradeDate).toLocaleDateString(
                'pt-BR',
                { timeZone: 'UTC' }
              );
              const decPrice = new Decimal(event.unitPrice || '0');
              const decFees = new Decimal(event.fees || '0');
              const hasFees = decFees.greaterThan(0);

              return (
                <tr
                  key={event.id}
                  id={`recent-event-row-${event.id}`}
                  className="hover:bg-surface-elevated/40 transition-colors"
                >
                  {/* Tipo */}
                  <td className="px-5 sm:px-6 py-3.5 whitespace-nowrap">
                    {isBuy && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        Compra
                      </span>
                    )}
                    {isSell && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
                        Venda
                      </span>
                    )}
                    {isSplit && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />
                        Desdobramento
                      </span>
                    )}
                    {isGrouping && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                        Grupamento
                      </span>
                    )}
                    {isBonus && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-pink-500/10 text-pink-600 dark:text-pink-400 border border-pink-500/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-pink-500" />
                        Bonificação
                      </span>
                    )}
                    {isDividend && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        Dividendo
                      </span>
                    )}
                    {isJcp && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-500/10 text-teal-600 dark:text-teal-400 border border-teal-500/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-teal-500" />
                        JCP
                      </span>
                    )}
                    {isAdjustment && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20">
                        <span className="w-1.5 h-1.5 rounded-full bg-violet-500" />
                        {event.direction === 'OUT' ? 'Ajuste (Saída)' : 'Ajuste (Entrada)'}
                      </span>
                    )}
                  </td>

                  {/* Carteira */}
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <Link
                      href={`/portfolios/${event.portfolioId}`}
                      className="font-medium text-action-primary hover:underline transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-action-primary rounded"
                      id={`recent-event-portfolio-${event.id}`}
                    >
                      {event.portfolioName}
                    </Link>
                  </td>

                  {/* Ativo */}
                  <td className="px-4 py-3.5">
                    <div className="flex flex-col min-w-0">
                      <span
                        id={`recent-event-ticker-${event.id}`}
                        className="font-bold text-text-primary tracking-wide"
                      >
                        {event.assetTicker}
                      </span>
                      <span className="text-xs text-text-secondary truncate max-w-[180px]">
                        {event.assetName}
                      </span>
                    </div>
                  </td>

                  {/* Data */}
                  <td className="px-4 py-3.5 font-mono text-xs text-text-secondary whitespace-nowrap">
                    {tradeDateFormatted}
                  </td>

                  {/* Quantidade / Fator */}
                  <td className="px-4 py-3.5 text-right font-mono tabular-nums font-semibold text-text-primary whitespace-nowrap">
                    {isSplit && `Fator 1:${formatQuantity(event.quantity)}`}
                    {isGrouping && `Fator ${formatQuantity(event.quantity)}:1`}
                    {isBonus && `+${formatQuantity(event.quantity)}`}
                    {(isDividend || isJcp) && `${formatQuantity(event.quantity)} ações`}
                    {!isSplit && !isGrouping && !isBonus && !isDividend && !isJcp && formatQuantity(event.quantity)}
                  </td>

                  {/* Preço Unitário */}
                  <td className="px-4 py-3.5 text-right font-mono tabular-nums font-semibold text-text-primary whitespace-nowrap">
                    {isSplit || isGrouping ? (
                      '—'
                    ) : isBonus ? (
                      decPrice.greaterThan(0) ? formatMoney(event.unitPrice, event.currency) : 'R$ 0,00'
                    ) : (
                      formatMoney(event.unitPrice, event.currency)
                    )}
                  </td>

                  {/* Taxas */}
                  <td className="px-5 sm:px-6 py-3.5 text-right font-mono tabular-nums text-xs text-text-secondary whitespace-nowrap">
                    {isJcp
                      ? `IRRF ${formatMoney(event.fees, event.currency)}`
                      : isSplit || isGrouping || isBonus
                      ? '—'
                      : hasFees
                      ? formatMoney(event.fees, event.currency)
                      : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
