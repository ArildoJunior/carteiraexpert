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
        className="bg-slate-900 border border-slate-800 rounded-2xl p-12 text-center space-y-3"
      >
        <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center mx-auto text-xl">
          📊
        </div>
        <h3 className="text-base font-semibold text-white">
          Nenhuma operação registrada
        </h3>
        <p className="text-sm text-slate-400 max-w-sm mx-auto">
          Esta carteira ainda não possui lançamentos. Clique em &quot;Nova
          Operação&quot; para registrar sua primeira compra ou venda.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
      <div className="overflow-x-auto">
        <table
          id="portfolio-events-table"
          className="w-full text-left text-sm text-slate-300"
        >
          <thead className="bg-slate-950/80 text-xs uppercase text-slate-400 font-semibold border-b border-slate-800">
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
          <tbody className="divide-y divide-slate-800/60">
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
                      ? 'bg-slate-950/40 text-slate-500 opacity-60'
                      : 'hover:bg-slate-800/40'
                  }`}
                >
                  {/* Tipo */}
                  <td className="px-4 py-3.5">
                    {event.type === 'BUY' ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-950/80 text-emerald-400 border border-emerald-800/60">
                        🟢 Compra
                      </span>
                    ) : event.type === 'SELL' ? (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-950/80 text-blue-400 border border-blue-800/60">
                        🔵 Venda
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-slate-300">
                        {event.type}
                      </span>
                    )}
                  </td>

                  {/* Ativo */}
                  <td className="px-4 py-3.5 font-medium text-white">
                    <div className="flex flex-col">
                      <span
                        id={`event-ticker-${event.id}`}
                        className={`font-bold tracking-wide ${
                          isCancelled ? 'line-through text-slate-500' : 'text-emerald-400'
                        }`}
                      >
                        {ticker}
                      </span>
                      <span className="text-xs text-slate-500 truncate max-w-[150px]">
                        {assetName}
                      </span>
                    </div>
                  </td>

                  {/* Data */}
                  <td className="px-4 py-3.5 font-mono text-xs">
                    {formattedTradeDate}
                  </td>

                  {/* Quantidade */}
                  <td
                    className={`px-4 py-3.5 text-right font-mono ${
                      isCancelled ? 'line-through' : 'text-slate-200'
                    }`}
                  >
                    {event.quantity}
                  </td>

                  {/* Preço Unitário */}
                  <td
                    className={`px-4 py-3.5 text-right font-mono ${
                      isCancelled ? 'line-through' : 'text-slate-200'
                    }`}
                  >
                    {event.currency} {event.unitPrice}
                  </td>

                  {/* Taxas */}
                  <td className="px-4 py-3.5 text-right font-mono text-xs text-slate-400">
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
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-red-950/80 text-red-400 border border-red-800/60"
                      >
                        Cancelado
                      </span>
                    ) : (
                      <span
                        id={`event-status-active-${event.id}`}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-950/40 text-emerald-400 border border-emerald-800/40"
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
                        className="text-xs text-slate-400 hover:text-red-400 bg-slate-800/60 hover:bg-slate-800 px-2.5 py-1 rounded-md transition-colors"
                      >
                        Cancelar
                      </button>
                    ) : (
                      <span
                        className="text-xs text-slate-600 italic"
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
