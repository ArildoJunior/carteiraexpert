'use client';

import { useState, useEffect } from 'react';
import { Decimal } from '@/lib/decimal';
import { getAssetPositionAction } from '../server/portfolio.actions';
import type { SerializedAssetPositionDetail } from '../domain/position.types';

interface AssetPositionDetailModalProps {
  portfolioId: string;
  assetId: string;
  onClose: () => void;
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

export function AssetPositionDetailModal({
  portfolioId,
  assetId,
  onClose,
}: AssetPositionDetailModalProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<SerializedAssetPositionDetail | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function loadData() {
      setLoading(true);
      setError(null);
      const res = await getAssetPositionAction(portfolioId, assetId);
      if (!isMounted) return;

      if (res.success && res.data) {
        setDetail(res.data);
      } else {
        setError(res.error || 'Não foi possível carregar os detalhes do ativo.');
      }
      setLoading(false);
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, [portfolioId, assetId]);

  const pos = detail?.position;
  const decPnL = new Decimal(pos?.totalRealizedPnL || '0');
  const isPositivePnL = decPnL.greaterThan(0);
  const isNegativePnL = decPnL.lessThan(0);

  return (
    <div
      id="asset-detail-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        id="asset-detail-modal-content"
        className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-3xl overflow-hidden shadow-2xl space-y-6 p-6 sm:p-8 max-h-[90vh] flex flex-col"
      >
        {/* Cabeçalho */}
        <div className="flex items-start justify-between border-b border-slate-800 pb-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h2
                id="asset-detail-modal-title"
                className="text-2xl font-bold text-white tracking-tight"
              >
                {pos ? pos.ticker : 'Carregando Ativo...'}
              </h2>
              {pos?.isCustom && (
                <span className="text-[11px] uppercase font-bold text-amber-400 bg-amber-950/60 border border-amber-800/60 px-2 py-0.5 rounded-md">
                  Customizado
                </span>
              )}
              {pos && (
                <span className="text-xs text-slate-400 font-mono bg-slate-800 px-2 py-0.5 rounded-md">
                  {pos.market} • {pos.currency}
                </span>
              )}
            </div>
            {pos && (
              <p className="text-sm text-slate-400 mt-1">{pos.name}</p>
            )}
          </div>

          <button
            id="btn-close-asset-detail-modal"
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-slate-800 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Corpo do Modal */}
        <div className="flex-1 overflow-y-auto space-y-6 pr-1">
          {loading ? (
            <div className="py-16 text-center space-y-3">
              <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-sm text-slate-400">
                Carregando histórico e posições do ativo...
              </p>
            </div>
          ) : error || !pos ? (
            <div className="bg-red-950/40 border border-red-800/60 rounded-2xl p-6 text-center text-red-300 text-sm">
              {error || 'Dados do ativo não encontrados.'}
            </div>
          ) : (
            <>
              {/* Cards de Métricas do Ativo */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-4 space-y-1">
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    Quantidade
                  </p>
                  <p
                    id="asset-detail-qty"
                    className="text-lg font-bold font-mono text-white"
                  >
                    {formatQuantity(pos.quantity)}
                  </p>
                  <p className="text-[10px] text-slate-500">Em custódia ativa</p>
                </div>

                <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-4 space-y-1">
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    Custo Médio
                  </p>
                  <p
                    id="asset-detail-avg-price"
                    className="text-lg font-bold font-mono text-slate-200"
                  >
                    {formatMoney(pos.averagePrice, pos.currency)}
                  </p>
                  <p className="text-[10px] text-slate-500">Com taxas inclusas</p>
                </div>

                <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-4 space-y-1">
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    Total Investido
                  </p>
                  <p
                    id="asset-detail-total-cost"
                    className="text-lg font-bold font-mono text-emerald-400"
                  >
                    {formatMoney(pos.totalCost, pos.currency)}
                  </p>
                  <p className="text-[10px] text-slate-500">Custo de aquisição</p>
                </div>

                <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-4 space-y-1">
                  <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    PnL Realizado
                  </p>
                  <p
                    id="asset-detail-realized-pnl"
                    className={`text-lg font-bold font-mono ${
                      isPositivePnL
                        ? 'text-emerald-400'
                        : isNegativePnL
                        ? 'text-red-400'
                        : 'text-slate-300'
                    }`}
                  >
                    {isPositivePnL ? '+' : ''}
                    {formatMoney(pos.totalRealizedPnL, pos.currency)}
                  </p>
                  <p className="text-[10px] text-slate-500">Lucro/prejuízo de vendas</p>
                </div>
              </div>

              {/* Tabela de Vendas Realizadas e Apuração de Lucro */}
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-white flex items-center justify-between">
                  <span>Histórico de Vendas e PnL Realizado</span>
                  <span className="text-xs font-normal text-slate-400 bg-slate-800 px-2 py-0.5 rounded-full">
                    {detail.realizedTrades.length}{' '}
                    {detail.realizedTrades.length === 1 ? 'venda' : 'vendas'}
                  </span>
                </h3>

                {detail.realizedTrades.length === 0 ? (
                  <div className="bg-slate-950/40 border border-slate-800/60 rounded-2xl p-6 text-center space-y-1 text-xs text-slate-400">
                    <p className="font-semibold text-slate-300">
                      Nenhuma venda realizada para este ativo.
                    </p>
                    <p>
                      Quando você registrar operações de venda (`SELL`), o lucro ou prejuízo apurado aparecerá discriminado aqui.
                    </p>
                  </div>
                ) : (
                  <div className="border border-slate-800 rounded-2xl overflow-hidden shadow-inner">
                    <table
                      id="asset-realized-trades-table"
                      className="w-full text-left border-collapse text-xs"
                    >
                      <thead>
                        <tr className="border-b border-slate-800 bg-slate-950/80 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                          <th className="px-4 py-3">Data</th>
                          <th className="px-3 py-3 text-right">Qtd</th>
                          <th className="px-3 py-3 text-right">Preço Venda</th>
                          <th className="px-3 py-3 text-right">Custo Base</th>
                          <th className="px-4 py-3 text-right">PnL Apurado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/50 text-slate-300">
                        {detail.realizedTrades.map((trade) => {
                          const tradePnL = new Decimal(trade.realizedPnL || '0');
                          const isTradePos = tradePnL.greaterThan(0);
                          const isTradeNeg = tradePnL.lessThan(0);
                          const tradeDateFormatted = new Date(
                            trade.tradeDate
                          ).toLocaleDateString('pt-BR', { timeZone: 'UTC' });

                          return (
                            <tr
                              key={trade.eventId}
                              className="hover:bg-slate-800/30 transition-colors"
                            >
                              <td className="px-4 py-3 font-mono text-slate-300 whitespace-nowrap">
                                {tradeDateFormatted}
                              </td>
                              <td className="px-3 py-3 text-right font-mono font-medium text-white whitespace-nowrap">
                                {formatQuantity(trade.quantity)}
                              </td>
                              <td className="px-3 py-3 text-right font-mono text-slate-300 whitespace-nowrap">
                                {formatMoney(trade.salePrice, pos.currency)}
                              </td>
                              <td className="px-3 py-3 text-right font-mono text-slate-400 whitespace-nowrap">
                                {formatMoney(trade.costBasisPrice, pos.currency)}
                              </td>
                              <td
                                className={`px-4 py-3 text-right font-mono font-bold whitespace-nowrap ${
                                  isTradePos
                                    ? 'text-emerald-400'
                                    : isTradeNeg
                                    ? 'text-red-400'
                                    : 'text-slate-300'
                                }`}
                              >
                                {isTradePos ? '+' : ''}
                                {formatMoney(trade.realizedPnL, pos.currency)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Rodapé */}
        <div className="border-t border-slate-800 pt-4 flex justify-end">
          <button
            id="btn-asset-detail-close-bottom"
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 text-xs font-semibold text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
