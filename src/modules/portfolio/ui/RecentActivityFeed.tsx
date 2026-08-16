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
        className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center space-y-3 shadow-lg"
      >
        <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center text-slate-500 text-xl font-bold mx-auto">
          ⚡
        </div>
        <p className="text-sm font-medium text-slate-300">
          Nenhuma operação recente registrada.
        </p>
        <p className="text-xs text-slate-500 max-w-sm mx-auto">
          Suas compras e vendas manuais aparecerão aqui organizadas cronologicamente por carteira.
        </p>
      </div>
    );
  }

  return (
    <div
      id="dashboard-recent-activity-section"
      className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl"
    >
      <div className="px-6 py-4 border-b border-slate-800/80 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2.5">
            <span>Atividades Recentes</span>
            <span className="text-xs font-normal bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full">
              Últimas {events.length}
            </span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Histórico consolidado de compras e vendas ativas entre todas as suas carteiras.
          </p>
        </div>

        <Link
          id="btn-view-all-history-from-dashboard"
          href="/history"
          className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors"
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
            <tr className="border-b border-slate-800/80 bg-slate-950/40 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              <th className="px-6 py-3.5">Tipo</th>
              <th className="px-4 py-3.5">Carteira</th>
              <th className="px-4 py-3.5">Ativo</th>
              <th className="px-4 py-3.5">Data</th>
              <th className="px-4 py-3.5 text-right">Quantidade</th>
              <th className="px-4 py-3.5 text-right">Preço Unitário</th>
              <th className="px-6 py-3.5 text-right">Taxas</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50 text-slate-300">
            {events.map((event) => {
              const isBuy = event.type === 'BUY';
              const isSell = event.type === 'SELL';
              const isSplit = event.type === 'SPLIT';
              const isGrouping = event.type === 'GROUPING';
              const isBonus = event.type === 'BONUS_SHARE';
              const isDividend = event.type === 'DIVIDEND';
              const isJcp = event.type === 'JCP';

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
                  className="hover:bg-slate-800/30 transition-colors"
                >
                  {/* Tipo */}
                  <td className="px-6 py-3.5 whitespace-nowrap">
                    {isBuy && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-950/80 text-emerald-400 border border-emerald-800/60">
                        🟢 Compra
                      </span>
                    )}
                    {isSell && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-950/80 text-blue-400 border border-blue-800/60">
                        🔵 Venda
                      </span>
                    )}
                    {isSplit && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-purple-950/80 text-purple-400 border border-purple-800/60">
                        🔀 Desdobramento
                      </span>
                    )}
                    {isGrouping && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-950/80 text-amber-400 border border-amber-800/60">
                        🔄 Grupamento
                      </span>
                    )}
                    {isBonus && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-pink-950/80 text-pink-400 border border-pink-800/60">
                        🎁 Bonificação
                      </span>
                    )}
                    {isDividend && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-700/60">
                        💵 Dividendo
                      </span>
                    )}
                    {isJcp && (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-950/80 text-teal-300 border border-teal-700/60">
                        🏛️ JCP
                      </span>
                    )}
                  </td>

                  {/* Carteira */}
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <Link
                      href={`/portfolios/${event.portfolioId}`}
                      className="font-medium text-emerald-400 hover:text-emerald-300 hover:underline transition-colors"
                      id={`recent-event-portfolio-${event.id}`}
                    >
                      {event.portfolioName}
                    </Link>
                  </td>

                  {/* Ativo */}
                  <td className="px-4 py-3.5">
                    <div className="flex flex-col">
                      <span
                        id={`recent-event-ticker-${event.id}`}
                        className="font-bold text-white tracking-wide"
                      >
                        {event.assetTicker}
                      </span>
                      <span className="text-xs text-slate-500 truncate max-w-[160px]">
                        {event.assetName}
                      </span>
                    </div>
                  </td>

                  {/* Data */}
                  <td className="px-4 py-3.5 font-mono text-xs text-slate-300 whitespace-nowrap">
                    {tradeDateFormatted}
                  </td>

                  {/* Quantidade / Fator */}
                  <td className="px-4 py-3.5 text-right font-mono font-medium text-slate-200 whitespace-nowrap">
                    {isSplit && `Fator 1:${formatQuantity(event.quantity)}`}
                    {isGrouping && `Fator ${formatQuantity(event.quantity)}:1`}
                    {isBonus && `+${formatQuantity(event.quantity)}`}
                    {(isDividend || isJcp) && `${formatQuantity(event.quantity)} ações`}
                    {!isSplit && !isGrouping && !isBonus && !isDividend && !isJcp && formatQuantity(event.quantity)}
                  </td>

                  {/* Preço Unitário */}
                  <td className="px-4 py-3.5 text-right font-mono font-medium text-slate-200 whitespace-nowrap">
                    {isSplit || isGrouping ? (
                      '—'
                    ) : isBonus ? (
                      decPrice.greaterThan(0) ? formatMoney(event.unitPrice, event.currency) : 'R$ 0,00'
                    ) : (
                      formatMoney(event.unitPrice, event.currency)
                    )}
                  </td>

                  {/* Taxas */}
                  <td className="px-6 py-3.5 text-right font-mono text-xs text-slate-400 whitespace-nowrap">
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
