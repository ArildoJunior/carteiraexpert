'use client';

import React from 'react';
import Link from 'next/link';
import type { B3HistoricalQuotesResult } from '../domain/b3-historical-quotes.types';

interface B3HistoricalQuotesExplorerProps {
  initialResult: B3HistoricalQuotesResult;
  popularTickers?: string[];
  basePath?: string;
  hideSearchHeader?: boolean;
}

function formatBrlMoney(valueStr: string | null | undefined): string {
  if (!valueStr) return '—';
  try {
    const num = Number(valueStr);
    if (Number.isNaN(num)) return valueStr;
    return `R$ ${num.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  } catch {
    return valueStr;
  }
}

function formatQuantity(valueStr: string | null | undefined): string {
  if (!valueStr) return '0';
  try {
    const num = Number(valueStr);
    if (Number.isNaN(num)) return valueStr;
    return Math.floor(num).toLocaleString('pt-BR');
  } catch {
    return valueStr;
  }
}

export function B3HistoricalQuotesExplorer({
  initialResult,
  popularTickers = ['PETR4', 'VALE3', 'ITUB4', 'BBAS3', 'BBDC4'],
  basePath = '/history',
  hideSearchHeader = false,
}: B3HistoricalQuotesExplorerProps) {
  const { quotes, totalCount, page, limit, totalPages, ticker, startDate, endDate, order } =
    initialResult;

  const buildUrl = (targetPage: number, overrideTicker?: string) => {
    const q = new URLSearchParams();
    if (basePath === '/history') {
      q.set('tab', 'cotahist');
    }
    q.set('ticker', (overrideTicker ?? ticker).toUpperCase());
    if (startDate) q.set('startDate', startDate);
    if (endDate) q.set('endDate', endDate);
    if (order && order !== 'desc') q.set('order', order);
    if (targetPage > 1) q.set('page', String(targetPage));
    if (limit !== 20) q.set('limit', String(limit));

    const qs = q.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  };

  const startRecord = totalCount === 0 ? 0 : (page - 1) * limit + 1;
  const endRecord = Math.min(page * limit, totalCount);

  return (
    <div className="space-y-6 text-text-primary" id="b3-historical-quotes-container">
      {/* Barra de Filtros e Busca */}
      {!hideSearchHeader && (
        <form
          id="b3-search-form"
          method="GET"
          action={basePath}
          className="bg-surface border border-border-theme rounded-2xl p-5 shadow-xs space-y-4"
        >
          {basePath === '/history' && <input type="hidden" name="tab" value="cotahist" />}

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border-theme pb-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-text-secondary">
              Filtro de Séries Históricas B3 (COTAHIST)
            </h3>
            <div className="flex items-center gap-1.5 text-xs text-text-secondary">
              <span>Atalhos:</span>
              {popularTickers.slice(0, 4).map((t) => (
                <Link
                  key={t}
                  id={`shortcut-ticker-${t.toLowerCase()}`}
                  href={buildUrl(1, t)}
                  className={`px-2 py-0.5 rounded-md font-mono font-semibold transition-colors ${
                    ticker === t
                      ? 'bg-action-primary text-action-primary-text'
                      : 'bg-surface-elevated hover:bg-border-theme text-text-primary'
                  }`}
                >
                  {t}
                </Link>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {/* Campo Ticker */}
            <div className="space-y-1">
              <label htmlFor="b3-ticker-input" className="block text-xs font-semibold text-text-secondary">
                Ticker do Ativo
              </label>
              <input
                id="b3-ticker-input"
                type="text"
                name="ticker"
                defaultValue={ticker}
                placeholder="Ex: PETR4, VALE3, ITUB4"
                className="w-full bg-background border border-border-theme rounded-xl px-3 py-2 text-xs font-mono font-bold uppercase text-text-primary focus:outline-none focus:ring-2 focus:ring-action-primary"
              />
            </div>

            {/* Data Inicial */}
            <div className="space-y-1">
              <label htmlFor="b3-start-date" className="block text-xs font-semibold text-text-secondary">
                Data Inicial
              </label>
              <input
                id="b3-start-date"
                type="date"
                name="startDate"
                defaultValue={startDate ?? ''}
                className="w-full bg-background border border-border-theme rounded-xl px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-action-primary"
              />
            </div>

            {/* Data Final */}
            <div className="space-y-1">
              <label htmlFor="b3-end-date" className="block text-xs font-semibold text-text-secondary">
                Data Final
              </label>
              <input
                id="b3-end-date"
                type="date"
                name="endDate"
                defaultValue={endDate ?? ''}
                className="w-full bg-background border border-border-theme rounded-xl px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-action-primary"
              />
            </div>

            {/* Ordenação e Botão Filtrar */}
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1">
                <label htmlFor="b3-order-select" className="block text-xs font-semibold text-text-secondary">
                  Ordenação
                </label>
                <select
                  id="b3-order-select"
                  name="order"
                  defaultValue={order}
                  className="w-full bg-background border border-border-theme rounded-xl px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-action-primary"
                >
                  <option value="desc">Mais recentes primeiro</option>
                  <option value="asc">Mais antigas primeiro</option>
                </select>
              </div>

              <button
                id="btn-b3-filter"
                type="submit"
                className="px-4 py-2 bg-action-primary text-action-primary-text font-semibold text-xs rounded-xl hover:opacity-90 transition-opacity shadow-xs"
              >
                Buscar
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Tabela de Cotações Oficiais */}
      <div
        id="b3-quotes-table-container"
        className="bg-surface border border-border-theme rounded-2xl overflow-hidden shadow-xs"
      >
        <div className="px-6 py-4 border-b border-border-theme flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <h2 className="text-base font-bold text-text-primary">
              Cotações Oficiais B3: <span className="font-mono text-action-primary">{ticker}</span>
            </h2>
            <span
              id="b3-total-count-badge"
              className="text-xs bg-background text-text-secondary border border-border-theme px-2.5 py-0.5 rounded-full font-mono tabular-nums"
            >
              {totalCount} {totalCount === 1 ? 'registro' : 'registros'}
            </span>
          </div>

          {totalCount > 0 && (
            <p id="b3-showing-range" className="text-xs text-text-secondary">
              Exibindo <span className="font-mono font-semibold text-text-primary">{startRecord}</span> a{' '}
              <span className="font-mono font-semibold text-text-primary">{endRecord}</span> de{' '}
              <span className="font-mono font-semibold text-text-primary">{totalCount}</span>
            </p>
          )}
        </div>

        {quotes.length === 0 ? (
          <div id="b3-empty-state" className="p-16 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-background border border-border-theme flex items-center justify-center text-text-secondary text-xl font-bold mx-auto">
              📊
            </div>
            <p className="text-sm font-semibold text-text-primary">
              Nenhuma cotação histórica encontrada para o ticker <span className="font-mono">{ticker}</span>.
            </p>
            <p className="text-xs text-text-secondary max-w-md mx-auto">
              Verifique se o ticker digitado está correto ou tente um dos ativos com histórico homologado (ex: PETR4, VALE3, ITUB4).
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table id="b3-historical-table" className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-border-theme bg-surface-elevated text-text-secondary font-semibold uppercase tracking-wider">
                  <th className="py-3 px-4">Pregão</th>
                  <th className="py-3 px-4">Ticker / BDI</th>
                  <th className="py-3 px-4 text-right">Abertura</th>
                  <th className="py-3 px-4 text-right">Máxima</th>
                  <th className="py-3 px-4 text-right">Mínima</th>
                  <th className="py-3 px-4 text-right">Fechamento</th>
                  <th className="py-3 px-4 text-right">Quantidade</th>
                  <th className="py-3 px-4 text-right">Volume Financeiro</th>
                  <th className="py-3 px-4 text-right">Negócios</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-theme">
                {quotes.map((q) => (
                  <tr
                    key={q.id}
                    className="hover:bg-surface-elevated/50 transition-colors"
                    data-trade-date={q.tradeDate}
                  >
                    <td className="py-3 px-4 font-mono font-medium text-text-primary whitespace-nowrap">
                      {q.tradeDateFormatted}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono font-bold text-text-primary">{q.ticker}</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-background border border-border-theme text-text-muted">
                          BDI {q.bdiCode}
                        </span>
                      </div>
                      <span className="text-[10px] text-text-secondary block truncate max-w-[120px]">
                        {q.shortName}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-text-primary whitespace-nowrap">
                      {formatBrlMoney(q.openPrice)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-status-success whitespace-nowrap">
                      {formatBrlMoney(q.highPrice)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-status-danger whitespace-nowrap">
                      {formatBrlMoney(q.lowPrice)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-text-primary whitespace-nowrap">
                      {formatBrlMoney(q.closePrice)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-text-secondary whitespace-nowrap">
                      {formatQuantity(q.quantity)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-medium text-text-primary whitespace-nowrap">
                      {formatBrlMoney(q.financialVolume)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-text-secondary whitespace-nowrap">
                      {q.tradeCount.toLocaleString('pt-BR')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Paginação */}
        {totalPages > 1 && (
          <div className="px-6 py-4 border-t border-border-theme flex items-center justify-between gap-4 bg-surface-elevated/30">
            <Link
              id="b3-pagination-prev"
              href={buildUrl(Math.max(1, page - 1))}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg border border-border-theme transition-colors ${
                page <= 1
                  ? 'opacity-40 pointer-events-none bg-surface text-text-muted'
                  : 'bg-surface hover:bg-background text-text-primary'
              }`}
            >
              ← Anterior
            </Link>

            <span id="b3-page-info" className="text-xs text-text-secondary font-mono">
              Página <span className="font-semibold text-text-primary">{page}</span> de{' '}
              <span className="font-semibold text-text-primary">{totalPages}</span>
            </span>

            <Link
              id="b3-pagination-next"
              href={buildUrl(Math.min(totalPages, page + 1))}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg border border-border-theme transition-colors ${
                page >= totalPages
                  ? 'opacity-40 pointer-events-none bg-surface text-text-muted'
                  : 'bg-surface hover:bg-background text-text-primary'
              }`}
            >
              Próxima →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
