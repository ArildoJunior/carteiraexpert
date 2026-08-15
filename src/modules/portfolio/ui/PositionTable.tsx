'use client';

import { useState } from 'react';
import { Decimal } from '@/lib/decimal';
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

export function PositionTable({ summary, baseCurrency = 'BRL' }: PositionTableProps) {
  const [showClosed, setShowClosed] = useState(false);

  const decRealizedPnL = new Decimal(summary.totalRealizedPnL || '0');
  const isTotalPnLPositive = decRealizedPnL.greaterThan(0);
  const isTotalPnLNegative = decRealizedPnL.lessThan(0);
  const activeCount = summary.positions.length;

  return (
    <div className="space-y-6" id="portfolio-positions-section">
      {/* ─── Cards de Resumo Financeiro ────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" id="position-metrics-cards">
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Total em Custódia
          </p>
          <p
            id="metric-total-invested"
            className="text-xl font-bold text-white mt-1 tracking-tight"
          >
            {formatMoney(summary.totalInvestedCost, baseCurrency)}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Custo total de aquisição
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Resultado Realizado (PnL)
          </p>
          <p
            id="metric-total-realized-pnl"
            className={`text-xl font-bold mt-1 tracking-tight ${
              isTotalPnLPositive
                ? 'text-emerald-400'
                : isTotalPnLNegative
                ? 'text-red-400'
                : 'text-slate-300'
            }`}
          >
            {isTotalPnLPositive ? '+' : ''}
            {formatMoney(summary.totalRealizedPnL, baseCurrency)}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Lucro/prejuízo de vendas encerradas
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Taxas Acumuladas
          </p>
          <p
            id="metric-total-fees"
            className="text-xl font-bold text-amber-400 mt-1 tracking-tight"
          >
            {formatMoney(summary.totalFees, baseCurrency)}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Custos operacionais e emolumentos
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Ativos em Carteira
          </p>
          <p
            id="metric-active-assets-count"
            className="text-xl font-bold text-indigo-400 mt-1 tracking-tight"
          >
            {activeCount} {activeCount === 1 ? 'ativo' : 'ativos'}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Com quantidade &gt; 0
          </p>
        </div>
      </div>

      {/* ─── Tabela de Posições Ativas em Custódia ─────────────────────────── */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="px-6 py-4 border-b border-slate-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2.5">
              <span>Posições em Custódia</span>
              <span className="text-xs font-normal bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full">
                {activeCount} {activeCount === 1 ? 'posição' : 'posições'}
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Quantidade acumulada e custo médio ponderado por ativo.
            </p>
          </div>

          {summary.closedPositions.length > 0 && (
            <button
              id="btn-toggle-closed-positions"
              type="button"
              onClick={() => setShowClosed(!showClosed)}
              className="text-xs text-slate-400 hover:text-emerald-400 transition-colors border border-slate-700/60 rounded-lg px-3 py-1.5 self-start sm:self-auto"
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
            <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center text-slate-500 text-xl font-bold">
              📊
            </div>
            <p className="text-sm font-medium text-slate-300">
              Nenhuma posição ativa em custódia.
            </p>
            <p className="text-xs text-slate-500 max-w-sm">
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
                <tr className="border-b border-slate-800/80 bg-slate-950/40 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  <th className="px-6 py-3.5">Ativo</th>
                  <th className="px-4 py-3.5 text-right">Quantidade</th>
                  <th className="px-4 py-3.5 text-right">Custo Médio</th>
                  <th className="px-4 py-3.5 text-right">Total Investido</th>
                  <th className="px-4 py-3.5 text-right">Taxas Totais</th>
                  <th className="px-6 py-3.5 text-right">PnL Realizado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50 text-slate-300">
                {summary.positions.map((pos) => {
                  const rowPnL = new Decimal(pos.totalRealizedPnL || '0');
                  const isRowPositive = rowPnL.greaterThan(0);
                  const isRowNegative = rowPnL.lessThan(0);

                  return (
                    <tr
                      key={pos.assetId}
                      id={`position-row-${pos.ticker}`}
                      className="hover:bg-slate-800/30 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <span
                            id={`position-ticker-${pos.ticker}`}
                            className="font-bold text-white text-base tracking-wide"
                          >
                            {pos.ticker}
                          </span>
                          {pos.isCustom && (
                            <span className="text-[10px] uppercase font-bold text-amber-400 bg-amber-950/60 border border-amber-800/60 px-1.5 py-0.2 rounded">
                              Customizado
                            </span>
                          )}
                          <span className="text-[11px] text-slate-500 font-mono">
                            {pos.market}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 truncate max-w-[220px]">
                          {pos.name}
                        </p>
                      </td>

                      <td
                        id={`position-qty-${pos.ticker}`}
                        className="px-4 py-4 text-right font-mono font-medium text-white"
                      >
                        {formatQuantity(pos.quantity)}
                      </td>

                      <td
                        id={`position-avg-price-${pos.ticker}`}
                        className="px-4 py-4 text-right font-mono font-medium text-slate-200"
                      >
                        {formatMoney(pos.averagePrice, pos.currency)}
                      </td>

                      <td
                        id={`position-total-cost-${pos.ticker}`}
                        className="px-4 py-4 text-right font-mono font-semibold text-emerald-400"
                      >
                        {formatMoney(pos.totalCost, pos.currency)}
                      </td>

                      <td
                        id={`position-total-fees-${pos.ticker}`}
                        className="px-4 py-4 text-right font-mono text-xs text-slate-400"
                      >
                        {formatMoney(pos.totalFees, pos.currency)}
                      </td>

                      <td
                        id={`position-realized-pnl-${pos.ticker}`}
                        className={`px-6 py-4 text-right font-mono font-semibold ${
                          isRowPositive
                            ? 'text-emerald-400'
                            : isRowNegative
                            ? 'text-red-400'
                            : 'text-slate-400'
                        }`}
                      >
                        {isRowPositive ? '+' : ''}
                        {formatMoney(pos.totalRealizedPnL, pos.currency)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─── Tabela de Posições Encerradas (Zeradas com PnL) ──────────────── */}
      {showClosed && summary.closedPositions.length > 0 && (
        <div
          id="closed-positions-section"
          className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-lg animate-in fade-in duration-200"
        >
          <div className="px-6 py-4 border-b border-slate-800/80">
            <h3 className="text-md font-bold text-slate-300 flex items-center gap-2">
              <span>Posições Encerradas (Quantidade Zerada)</span>
              <span className="text-xs font-normal bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full">
                {summary.closedPositions.length}
              </span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Ativos com posição totalmente liquidada e histórico de resultado financeiro.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table
              id="closed-positions-table"
              className="w-full text-left border-collapse text-sm"
            >
              <thead>
                <tr className="border-b border-slate-800/80 bg-slate-950/40 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="px-6 py-3">Ativo</th>
                  <th className="px-4 py-3 text-right">Taxas Totais</th>
                  <th className="px-6 py-3 text-right">Resultado Realizado Final</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40 text-slate-400">
                {summary.closedPositions.map((pos) => {
                  const rowClosedPnL = new Decimal(pos.totalRealizedPnL || '0');
                  const isClosedPositive = rowClosedPnL.greaterThan(0);
                  const isClosedNegative = rowClosedPnL.lessThan(0);

                  return (
                    <tr
                      key={pos.assetId}
                      id={`closed-position-row-${pos.ticker}`}
                      className="hover:bg-slate-800/20"
                    >
                      <td className="px-6 py-3.5">
                        <span className="font-bold text-slate-300">
                          {pos.ticker}
                        </span>
                        <span className="text-xs text-slate-500 ml-2">
                          {pos.name}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right font-mono text-xs">
                        {formatMoney(pos.totalFees, pos.currency)}
                      </td>
                      <td
                        className={`px-6 py-3.5 text-right font-mono font-semibold ${
                          isClosedPositive
                            ? 'text-emerald-400'
                            : isClosedNegative
                            ? 'text-red-400'
                            : 'text-slate-400'
                        }`}
                      >
                        {isClosedPositive ? '+' : ''}
                        {formatMoney(pos.totalRealizedPnL, pos.currency)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
