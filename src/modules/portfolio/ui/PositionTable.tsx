'use client';

import { useState } from 'react';
import { Decimal } from '@/lib/decimal';
import { AssetPositionDetailModal } from './AssetPositionDetailModal';
import type {
  SerializedAssetPosition,
  SerializedPortfolioPositionsSummary,
} from '../domain/position.types';

interface PositionTableProps {
  summary: SerializedPortfolioPositionsSummary;
  baseCurrency?: string;
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

function renderDelayBadge(delayStatus: string | null, hasQuote: boolean, ticker: string) {
  if (!hasQuote || !delayStatus) {
    return (
      <span
        id={`delay-badge-${ticker}`}
        title="Sem cotação cadastrada no banco interno"
        className="text-[10px] font-sans font-medium text-text-secondary bg-background border border-border-theme px-1.5 py-0.5 rounded"
      >
        S/ Cotação
      </span>
    );
  }

  switch (delayStatus) {
    case 'realtime':
      return (
        <span
          id={`delay-badge-${ticker}`}
          title="Cotação em tempo real"
          className="text-[10px] font-sans font-medium text-positive-text bg-positive-text/10 border border-positive-text/30 px-1.5 py-0.5 rounded"
        >
          Tempo Real
        </span>
      );
    case 'delayed_15m':
      return (
        <span
          id={`delay-badge-${ticker}`}
          title="Cotação com atraso de 15 minutos"
          className="text-[10px] font-sans font-medium text-amber-600 dark:text-amber-300 bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 rounded"
        >
          15m atraso
        </span>
      );
    case 'eod':
    case 'end_of_day':
      return (
        <span
          id={`delay-badge-${ticker}`}
          title="Fonte: COTAHIST B3 • Fechamento oficial"
          className="text-[10px] font-sans font-medium text-text-secondary bg-surface-elevated border border-border-theme px-1.5 py-0.5 rounded"
        >
          COTAHIST B3
        </span>
      );
    case 'manual':
      return (
        <span
          id={`delay-badge-${ticker}`}
          title="Cotação informada manualmente"
          className="text-[10px] font-sans font-medium text-action-primary bg-action-primary/10 border border-action-primary/30 px-1.5 py-0.5 rounded"
        >
          Manual
        </span>
      );
    default:
      return (
        <span
          id={`delay-badge-${ticker}`}
          className="text-[10px] font-sans font-medium text-text-secondary bg-background border border-border-theme px-1.5 py-0.5 rounded"
        >
          {delayStatus}
        </span>
      );
  }
}

export function PositionTable({ summary, baseCurrency = 'BRL' }: PositionTableProps) {
  const [showClosed, setShowClosed] = useState(false);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);

  const decRealizedPnL = new Decimal(summary.totalRealizedPnL || '0');
  const isTotalPnLPositive = decRealizedPnL.greaterThan(0);
  const isTotalPnLNegative = decRealizedPnL.lessThan(0);

  const decUnrealizedPnL = new Decimal(summary.totalUnrealizedPnL || '0');
  const isTotalUnrealizedPositive = decUnrealizedPnL.greaterThan(0);
  const isTotalUnrealizedNegative = decUnrealizedPnL.lessThan(0);

  const activeCount = summary.positions.length;

  return (
    <div className="space-y-6" id="portfolio-positions-section">
      {/* Modal de Detalhamento de Histórico por Ativo */}
      {selectedAssetId && (
        <AssetPositionDetailModal
          portfolioId={summary.portfolioId}
          assetId={selectedAssetId}
          onClose={() => setSelectedAssetId(null)}
        />
      )}

      {/* ─── Cards de Resumo Financeiro ────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7 gap-3.5" id="position-metrics-cards">
        <div className="bg-surface border border-border-theme rounded-xl p-4 shadow-sm">
          <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
            Total em Custódia
          </p>
          <p
            id="metric-total-invested"
            className="text-lg sm:text-xl font-bold text-text-primary mt-1 tracking-tight font-mono tabular-nums"
          >
            {formatMoney(summary.totalInvestedCost, baseCurrency)}
          </p>
          <p className="text-[11px] text-text-secondary mt-0.5">
            Custo de aquisição
          </p>
        </div>

        <div className="bg-surface border border-border-theme rounded-xl p-4 shadow-sm">
          <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
            Valor a Mercado
          </p>
          <p
            id="metric-total-market-value"
            className="text-lg sm:text-xl font-bold text-action-primary mt-1 tracking-tight font-mono tabular-nums"
          >
            {formatMoney(summary.totalMarketValue || '0', baseCurrency)}
          </p>
          <p className="text-[11px] text-text-secondary mt-0.5">
            {summary.positions.length === 0
              ? 'Marcação a mercado'
              : summary.positions.every((p) => p.hasQuote)
              ? 'Marcação a mercado'
              : summary.positions.some((p) => p.hasQuote)
              ? 'Marcação parcial (ativos cotados)'
              : 'Sem cotações disponíveis'}
          </p>
        </div>

        <div className="bg-surface border border-border-theme rounded-xl p-4 shadow-sm">
          <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
            PnL Não Realizado
          </p>
          <p
            id="metric-total-unrealized-pnl"
            className={`text-lg sm:text-xl font-bold mt-1 tracking-tight font-mono tabular-nums ${
              isTotalUnrealizedPositive
                ? 'text-positive-text'
                : isTotalUnrealizedNegative
                ? 'text-negative-text'
                : 'text-text-secondary'
            }`}
          >
            {isTotalUnrealizedPositive ? '+' : ''}
            {formatMoney(summary.totalUnrealizedPnL || '0', baseCurrency)}
          </p>
          <p className="text-[11px] text-text-secondary mt-0.5 font-mono tabular-nums">
            {summary.totalUnrealizedPnLPercent
              ? `${isTotalUnrealizedPositive ? '+' : ''}${new Decimal(summary.totalUnrealizedPnLPercent).toFixed(2)}% em aberto`
              : summary.positions.some((p) => p.hasQuote)
              ? 'Variação aberta'
              : 'Sem cotações disponíveis'}
          </p>
        </div>

        <div className="bg-surface border border-border-theme rounded-xl p-4 shadow-sm">
          <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
            Resultado Realizado
          </p>
          <p
            id="metric-total-realized-pnl"
            className={`text-lg sm:text-xl font-bold mt-1 tracking-tight font-mono tabular-nums ${
              isTotalPnLPositive
                ? 'text-positive-text'
                : isTotalPnLNegative
                ? 'text-negative-text'
                : 'text-text-secondary'
            }`}
          >
            {isTotalPnLPositive ? '+' : ''}
            {formatMoney(summary.totalRealizedPnL, baseCurrency)}
          </p>
          <p className="text-[11px] text-text-secondary mt-0.5">
            Lucro/prejuízo de vendas
          </p>
        </div>

        <div className="bg-surface border border-border-theme rounded-xl p-4 shadow-sm">
          <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
            Proventos Recebidos
          </p>
          <p
            id="metric-total-income"
            className="text-lg sm:text-xl font-bold text-positive-text mt-1 tracking-tight font-mono tabular-nums"
          >
            {formatMoney(summary.totalIncomeReceived || '0', baseCurrency)}
          </p>
          <p className="text-[11px] text-text-secondary mt-0.5">
            Dividendos e JCP
          </p>
        </div>

        <div className="bg-surface border border-border-theme rounded-xl p-4 shadow-sm">
          <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
            Taxas Acumuladas
          </p>
          <p
            id="metric-total-fees"
            className="text-lg sm:text-xl font-bold text-text-primary mt-1 tracking-tight font-mono tabular-nums"
          >
            {formatMoney(summary.totalFees, baseCurrency)}
          </p>
          <p className="text-[11px] text-text-secondary mt-0.5">
            Corretagens e taxas
          </p>
        </div>

        <div className="bg-surface border border-border-theme rounded-xl p-4 shadow-sm">
          <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
            Ativos em Custódia
          </p>
          <p
            id="metric-active-assets"
            className="text-lg sm:text-xl font-bold text-action-primary mt-1 tracking-tight font-mono tabular-nums"
          >
            {activeCount}{' '}
            <span className="text-xs font-normal text-text-secondary">
              {activeCount === 1 ? 'posição' : 'posições'}
            </span>
          </p>
          <p className="text-[11px] text-text-secondary mt-0.5">
            {summary.closedPositions.length > 0
              ? `${summary.closedPositions.length} encerradas`
              : 'Sem posições encerradas'}
          </p>
        </div>
      </div>

      {/* ─── Tabela de Posições Ativas em Custódia ─────────────────────────── */}
      <div className="bg-surface border border-border-theme rounded-2xl overflow-hidden shadow-sm">
        <div className="px-6 py-4 border-b border-border-theme flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-text-primary flex items-center gap-2.5">
              <span>Posições em Custódia</span>
              <span className="text-xs font-normal bg-background text-text-secondary px-2 py-0.5 rounded-full border border-border-theme">
                {activeCount} {activeCount === 1 ? 'posição' : 'posições'}
              </span>
            </h2>
            <p className="text-xs text-text-secondary mt-0.5">
              Quantidade acumulada, custo médio e marcação a mercado por ativo.
            </p>
          </div>

          {summary.closedPositions.length > 0 && (
            <button
              id="btn-toggle-closed-positions"
              type="button"
              onClick={() => setShowClosed(!showClosed)}
              className="text-xs text-text-secondary hover:text-action-primary transition-colors border border-border-theme rounded-lg px-3 py-1.5 self-start sm:self-auto bg-surface-elevated"
            >
              {showClosed
                ? 'Ocultar Posições Encerradas'
                : `Ver Encerradas (${summary.closedPositions.length})`}
            </button>
          )}
        </div>

        {activeCount === 0 ? (
          <div
            id="empty-positions-state"
            className="p-12 text-center flex flex-col items-center justify-center space-y-3"
          >
            <div className="w-12 h-12 rounded-full bg-background flex items-center justify-center text-text-secondary text-xl font-bold">
              📊
            </div>
            <p className="text-sm font-medium text-text-primary">
              Nenhuma posição ativa em custódia.
            </p>
            <p className="text-xs text-text-secondary max-w-sm">
              Registre operações de compra para começar a acompanhar a posição consolidada e o custo médio dos seus ativos.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table
              id="portfolio-positions-table"
              className="w-full text-left border-collapse text-sm"
            >
              <thead>
                <tr className="border-b border-border-theme bg-background/50 text-[11px] font-semibold text-text-secondary uppercase tracking-wider">
                  <th className="px-6 py-3.5">Ativo</th>
                  <th className="px-4 py-3.5 text-right">Quantidade</th>
                  <th className="px-4 py-3.5 text-right">Custo Médio</th>
                  <th className="px-4 py-3.5 text-right">Cotação Atual</th>
                  <th className="px-4 py-3.5 text-right">Total Investido</th>
                  <th className="px-4 py-3.5 text-right">Valor a Mercado</th>
                  <th className="px-4 py-3.5 text-right">PnL Não Realizado</th>
                  <th className="px-4 py-3.5 text-right">Taxas Totais</th>
                  <th className="px-6 py-3.5 text-right">PnL Realizado</th>
                  <th className="px-4 py-3.5 text-center">Histórico</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-theme/50 text-text-primary">
                {summary.positions.map((pos) => {
                  const rowPnL = new Decimal(pos.totalRealizedPnL || '0');
                  const isRowPositive = rowPnL.greaterThan(0);
                  const isRowNegative = rowPnL.lessThan(0);

                  const rowUnrealized = pos.unrealizedPnL ? new Decimal(pos.unrealizedPnL) : null;
                  const isUnrealizedPositive = rowUnrealized?.greaterThan(0) ?? false;
                  const isUnrealizedNegative = rowUnrealized?.lessThan(0) ?? false;

                  return (
                    <tr
                      key={pos.assetId}
                      id={`position-row-${pos.ticker}`}
                      className="hover:bg-surface-elevated/50 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedAssetId(pos.assetId)}
                            className="font-bold text-text-primary text-base tracking-wide hover:text-action-primary hover:underline text-left transition-colors"
                            id={`position-ticker-${pos.ticker}`}
                          >
                            {pos.ticker}
                          </button>
                          {pos.isCustom && (
                            <span className="text-[10px] uppercase font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.2 rounded">
                              Customizado
                            </span>
                          )}
                          <span className="text-[11px] text-text-secondary font-mono">
                            {pos.market}
                          </span>
                        </div>
                        <p className="text-xs text-text-secondary truncate max-w-[200px]">
                          {pos.name}
                        </p>
                      </td>

                      <td
                        id={`position-qty-${pos.ticker}`}
                        className="px-4 py-4 text-right font-mono tabular-nums font-medium text-text-primary"
                      >
                        <div className="flex items-center justify-end gap-1.5">
                          {pos.hasFractionalShares && (
                            <span
                              id={`fractional-badge-${pos.ticker}`}
                              title="Quantidade com fração residual decorrente de grupamento"
                              className="text-[10px] font-sans font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.2 rounded"
                            >
                              Fração
                            </span>
                          )}
                          <span>{formatQuantity(pos.quantity)}</span>
                        </div>
                      </td>

                      <td
                        id={`position-avg-price-${pos.ticker}`}
                        className="px-4 py-4 text-right font-mono tabular-nums font-medium text-text-primary"
                      >
                        {formatMoney(pos.averagePrice, pos.currency)}
                      </td>

                      {/* Cotação de Mercado com Badge de Defasagem */}
                      <td
                        id={`position-market-price-${pos.ticker}`}
                        className="px-4 py-4 text-right font-mono tabular-nums"
                      >
                        {pos.hasQuote && pos.marketPrice ? (
                          <div className="flex flex-col items-end gap-0.5">
                            <span className="font-medium text-text-primary">
                              {formatMoney(pos.marketPrice, pos.quoteCurrency || pos.currency)}
                            </span>
                            <div className="flex items-center gap-1">
                              {renderDelayBadge(pos.delayStatus, pos.hasQuote, pos.ticker)}
                            </div>
                            {pos.quoteDate && (
                              <span className="text-[10px] text-text-secondary">
                                Pregão: {new Date(pos.quoteDate).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}
                              </span>
                            )}
                          </div>
                        ) : (
                          <div className="flex justify-end">
                            {renderDelayBadge(null, false, pos.ticker)}
                          </div>
                        )}
                      </td>

                      <td
                        id={`position-total-cost-${pos.ticker}`}
                        className="px-4 py-4 text-right font-mono tabular-nums font-semibold text-text-secondary"
                      >
                        {formatMoney(pos.totalCost, pos.currency)}
                      </td>

                      {/* Valor a Mercado com conversão cambial se aplicável */}
                      <td
                        id={`position-market-value-${pos.ticker}`}
                        className="px-4 py-4 text-right font-mono tabular-nums font-semibold text-action-primary"
                      >
                        {pos.hasQuote && pos.marketValue ? (
                          <div className="flex flex-col items-end gap-0.5">
                            <span>{formatMoney(pos.marketValue, pos.quoteCurrency || pos.currency)}</span>
                            {pos.marketValueBrl && pos.quoteCurrency !== 'BRL' && (
                              <span className="text-[10px] text-text-secondary">
                                ≈ {formatMoney(pos.marketValueBrl, 'BRL')}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-text-secondary/50">-</span>
                        )}
                      </td>

                      {/* PnL Não Realizado */}
                      <td
                        id={`position-unrealized-pnl-${pos.ticker}`}
                        className={`px-4 py-4 text-right font-mono tabular-nums font-semibold ${
                          isUnrealizedPositive
                            ? 'text-positive-text'
                            : isUnrealizedNegative
                            ? 'text-negative-text'
                            : 'text-text-secondary'
                        }`}
                      >
                        {pos.hasQuote && pos.unrealizedPnL ? (
                          <div className="flex flex-col items-end gap-0.5">
                            <span>
                              {isUnrealizedPositive ? '+' : ''}
                              {formatMoney(pos.unrealizedPnL, pos.quoteCurrency || pos.currency)}
                            </span>
                            {pos.unrealizedPnLPercent && (
                              <span className="text-[10px]">
                                {isUnrealizedPositive ? '+' : ''}
                                {new Decimal(pos.unrealizedPnLPercent).toFixed(2)}%
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-text-secondary/50">-</span>
                        )}
                      </td>

                      <td
                        id={`position-total-fees-${pos.ticker}`}
                        className="px-4 py-4 text-right font-mono tabular-nums text-xs text-text-secondary"
                      >
                        {formatMoney(pos.totalFees, pos.currency)}
                      </td>

                      <td
                        id={`position-realized-pnl-${pos.ticker}`}
                        className={`px-6 py-4 text-right font-mono tabular-nums font-semibold ${
                          isRowPositive
                            ? 'text-positive-text'
                            : isRowNegative
                            ? 'text-negative-text'
                            : 'text-text-secondary'
                        }`}
                      >
                        {isRowPositive ? '+' : ''}
                        {formatMoney(pos.totalRealizedPnL, pos.currency)}
                      </td>

                      <td className="px-4 py-4 text-center">
                        <button
                          id={`btn-detail-asset-${pos.ticker}`}
                          type="button"
                          onClick={() => setSelectedAssetId(pos.assetId)}
                          className="px-2.5 py-1 text-xs font-semibold text-text-primary hover:bg-border-theme/40 bg-surface-elevated rounded-lg transition-colors border border-border-theme"
                        >
                          Ver Trades
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
