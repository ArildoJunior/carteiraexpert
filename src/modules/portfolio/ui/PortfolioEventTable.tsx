'use client';

import { Decimal } from '@/lib/decimal';
import type { PortfolioEvent } from '../domain/portfolio-event.types';
import type { Asset } from '../domain/asset.types';

interface PortfolioEventTableProps {
  events: PortfolioEvent[];
  assetsMap?: Record<string, Asset>;
  onCancelEvent: (event: PortfolioEvent) => void;
}

export function PortfolioEventTable({
  events,
  assetsMap = {},
  onCancelEvent,
}: PortfolioEventTableProps) {
  if (events.length === 0) {
    return (
      <div
        id="empty-events-state"
        className="bg-surface border border-border-theme rounded-2xl p-12 text-center space-y-3"
      >
        <div className="w-12 h-12 rounded-full bg-background flex items-center justify-center mx-auto text-xl text-text-secondary">
          📊
        </div>
        <h3 className="text-base font-semibold text-text-primary">
          Nenhuma operação registrada
        </h3>
        <p className="text-sm text-text-secondary max-w-sm mx-auto">
          Esta carteira ainda não possui lançamentos. Clique em &quot;Nova
          Operação&quot; para registrar sua primeira compra ou venda.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-surface border border-border-theme rounded-2xl overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table
          id="portfolio-events-table"
          className="w-full text-left text-sm text-text-primary"
        >
          <thead className="bg-background/60 text-xs uppercase text-text-secondary font-semibold border-b border-border-theme">
            <tr>
              <th scope="col" className="px-4 py-3.5">
                Tipo
              </th>
              <th scope="col" className="px-4 py-3.5">
                Ativo
              </th>
              <th scope="col" className="px-4 py-3.5">
                Data Negócio
              </th>
              <th scope="col" className="px-4 py-3.5 text-right">
                Quantidade
              </th>
              <th scope="col" className="px-4 py-3.5 text-right">
                Preço Unit.
              </th>
              <th scope="col" className="px-4 py-3.5 text-right">
                Taxas
              </th>
              <th scope="col" className="px-4 py-3.5">
                Status
              </th>
              <th scope="col" className="px-4 py-3.5 text-right">
                Ações
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-theme/50">
            {events.map((event) => {
              const isCancelled = Boolean(event.deletedAt);
              const asset = assetsMap[event.assetId];
              const ticker = asset?.ticker || '—';
              const assetName = asset?.name || 'Ativo';

              const formattedTradeDate = new Date(event.tradeDate).toLocaleDateString(
                'pt-BR',
                { timeZone: 'UTC' }
              );

              return (
                <tr
                  key={event.id}
                  id={`event-row-${event.id}`}
                  className={`transition-colors ${
                    isCancelled
                      ? 'bg-background/40 text-text-secondary/50 opacity-60'
                      : 'hover:bg-surface-elevated/50'
                  }`}
                >
                  {/* Tipo */}
                  <td className="px-4 py-3.5">
                    {event.type === 'BUY' ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-positive-text/10 text-positive-text border border-positive-text/30">
                        🟢 Compra
                      </span>
                    ) : event.type === 'SELL' ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-action-primary/10 text-action-primary border border-action-primary/30">
                        🔵 Venda
                      </span>
                    ) : event.type === 'SPLIT' ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-500 border border-indigo-500/30">
                        🔀 Desdobramento
                      </span>
                    ) : event.type === 'GROUPING' ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-300 border border-amber-500/30">
                        🔄 Grupamento
                      </span>
                    ) : event.type === 'BONUS_SHARE' ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-pink-500/10 text-pink-500 border border-pink-500/30">
                        🎁 Bonificação
                      </span>
                    ) : event.type === 'DIVIDEND' ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-positive-text/10 text-positive-text border border-positive-text/30">
                        💵 Dividendo
                      </span>
                    ) : event.type === 'JCP' ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-teal-500/10 text-teal-600 dark:text-teal-300 border border-teal-500/30">
                        🏛️ JCP
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-background text-text-secondary">
                        {event.type}
                      </span>
                    )}
                  </td>

                  {/* Ativo */}
                  <td className="px-4 py-3.5 font-medium text-text-primary">
                    <div className="flex flex-col">
                      <span
                        id={`event-ticker-${event.id}`}
                        className={`font-bold tracking-wide ${
                          isCancelled ? 'line-through text-text-secondary/50' : 'text-action-primary'
                        }`}
                      >
                        {ticker}
                      </span>
                      <span className="text-xs text-text-secondary truncate max-w-[150px]">
                        {assetName}
                      </span>
                    </div>
                  </td>

                  {/* Data */}
                  <td className="px-4 py-3.5 font-mono tabular-nums text-xs text-text-secondary">
                    {formattedTradeDate}
                  </td>

                  {/* Quantidade */}
                  <td
                    className={`px-4 py-3.5 text-right font-mono tabular-nums ${
                      isCancelled ? 'line-through' : 'text-text-primary'
                    }`}
                  >
                    {event.quantity}
                  </td>

                  {/* Preço Unitário */}
                  <td
                    className={`px-4 py-3.5 text-right font-mono tabular-nums ${
                      isCancelled ? 'line-through' : 'text-text-primary'
                    }`}
                  >
                    {event.currency} {event.unitPrice}
                  </td>

                  {/* Taxas */}
                  <td className="px-4 py-3.5 text-right font-mono tabular-nums text-xs text-text-secondary">
                    {event.fees && new Decimal(event.fees).greaterThan(0)
                      ? `${event.currency} ${event.fees}`
                      : '—'}
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3.5">
                    {isCancelled ? (
                      <span
                        id={`event-status-cancelled-${event.id}`}
                        title={event.cancellationReason || 'Operação cancelada'}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-negative-text/10 text-negative-text border border-negative-text/30"
                      >
                        Cancelado
                      </span>
                    ) : (
                      <span
                        id={`event-status-active-${event.id}`}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-positive-text/10 text-positive-text border border-positive-text/30"
                      >
                        Ativo
                      </span>
                    )}
                  </td>

                  {/* Ações */}
                  <td className="px-4 py-3.5 text-right">
                    {!isCancelled ? (
                      <button
                        id={`cancel-event-${event.id}`}
                        type="button"
                        onClick={() => onCancelEvent(event)}
                        className="text-xs text-text-secondary hover:text-negative-text bg-background hover:bg-surface-elevated px-2.5 py-1 rounded-md transition-colors border border-border-theme"
                      >
                        Cancelar
                      </button>
                    ) : (
                      <span
                        className="text-xs text-text-secondary/50 italic"
                        title={event.cancellationReason || undefined}
                      >
                        Justificado
                      </span>
                    )}
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
