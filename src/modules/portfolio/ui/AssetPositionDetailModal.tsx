'use client';

import { useState, useEffect, useCallback } from 'react';
import { Decimal } from '@/lib/decimal';
import {
  getAssetPositionAction,
  createCorporateActionEventAction,
} from '../server/portfolio.actions';
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

  // Estado do formulário de evento corporativo (Split / Grupamento)
  const [showActionForm, setShowActionForm] = useState(false);
  const [actionType, setActionType] = useState<'SPLIT' | 'GROUPING'>('SPLIT');
  const [actionTradeDate, setActionTradeDate] = useState(() => {
    return new Date().toISOString().slice(0, 10);
  });
  const [actionFactor, setActionFactor] = useState('2');
  const [actionNotes, setActionNotes] = useState('');
  const [actionSubmitting, setActionSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await getAssetPositionAction(portfolioId, assetId);

    if (res.success && res.data) {
      setDetail(res.data);
    } else {
      setError(res.error || 'Não foi possível carregar os detalhes do ativo.');
    }
    setLoading(false);
  }, [portfolioId, assetId]);

  useEffect(() => {
    let isMounted = true;
    loadData().then(() => {
      if (!isMounted) return;
    });

    return () => {
      isMounted = false;
    };
  }, [loadData]);

  async function handleCorporateActionSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setActionError(null);
    setActionSuccess(null);
    setActionSubmitting(true);

    try {
      const formData = new FormData();
      formData.set('portfolioId', portfolioId);
      formData.set('assetId', assetId);
      formData.set('type', actionType);
      formData.set('tradeDate', actionTradeDate);
      formData.set('factor', actionFactor);
      if (actionNotes.trim()) {
        formData.set('notes', actionNotes.trim());
      }

      const res = await createCorporateActionEventAction(null, formData);

      if (res.success) {
        setActionSuccess(
          `Evento corporativo (${actionType === 'SPLIT' ? 'Desdobramento' : 'Grupamento'}) registrado com sucesso!`
        );
        setShowActionForm(false);
        setActionNotes('');
        await loadData();
      } else {
        setActionError(res.error || 'Falha ao registrar evento corporativo.');
      }
    } catch {
      setActionError('Erro inesperado ao registrar evento corporativo.');
    } finally {
      setActionSubmitting(false);
    }
  }

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
            <div className="flex items-center gap-2.5 flex-wrap">
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
              {pos?.hasFractionalShares && (
                <span
                  id="asset-detail-fractional-badge"
                  className="text-[11px] font-semibold text-amber-400 bg-amber-950/60 border border-amber-800/60 px-2 py-0.5 rounded-md flex items-center gap-1"
                  title="A quantidade em custódia contém fração residual resultante de grupamento."
                >
                  ⚠️ Fração Residual
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

        {/* Mensagens de Sucesso ou Erro da Ação Corporativa */}
        {actionSuccess && (
          <div
            id="corporate-action-success-msg"
            className="bg-emerald-950/50 border border-emerald-800/80 rounded-xl p-3.5 text-xs text-emerald-300 flex items-center justify-between"
          >
            <span>{actionSuccess}</span>
            <button
              type="button"
              onClick={() => setActionSuccess(null)}
              className="text-emerald-400 hover:text-white font-bold ml-2"
            >
              ✕
            </button>
          </div>
        )}

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
                  <p className="text-[10px] text-slate-500">
                    {pos.hasFractionalShares ? 'Com fração residual' : 'Em custódia ativa'}
                  </p>
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

              {/* Botão e Formulário de Lançamento de Evento Corporativo */}
              <div className="bg-slate-950/50 border border-slate-800/80 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300">
                      Eventos Corporativos (Split / Grupamento)
                    </h3>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Ajusta a quantidade e o custo médio unitário mantendo o valor investido invariante.
                    </p>
                  </div>

                  <button
                    id="btn-toggle-corporate-action-form"
                    type="button"
                    onClick={() => {
                      setShowActionForm(!showActionForm);
                      setActionError(null);
                    }}
                    className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 bg-emerald-950/60 border border-emerald-800/60 px-3 py-1.5 rounded-xl transition-colors"
                  >
                    {showActionForm ? 'Cancelar' : '+ Lançar Split / Grupamento'}
                  </button>
                </div>

                {showActionForm && (
                  <form
                    id="corporate-action-form"
                    onSubmit={handleCorporateActionSubmit}
                    className="pt-3 border-t border-slate-800/80 space-y-3"
                  >
                    {actionError && (
                      <div
                        id="corporate-action-error-msg"
                        className="bg-red-950/50 border border-red-800/80 rounded-xl p-3 text-xs text-red-300"
                      >
                        {actionError}
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label
                          htmlFor="input-corporate-action-type"
                          className="block text-[11px] font-semibold text-slate-300 mb-1"
                        >
                          Tipo de Evento
                        </label>
                        <select
                          id="input-corporate-action-type"
                          value={actionType}
                          onChange={(e) => setActionType(e.target.value as any)}
                          className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                        >
                          <option value="SPLIT">🔀 Desdobramento (Split)</option>
                          <option value="GROUPING">🔄 Grupamento</option>
                        </select>
                      </div>

                      <div>
                        <label
                          htmlFor="input-corporate-action-trade-date"
                          className="block text-[11px] font-semibold text-slate-300 mb-1"
                        >
                          Data de Corte (Data Ex)
                        </label>
                        <input
                          id="input-corporate-action-trade-date"
                          type="date"
                          required
                          value={actionTradeDate}
                          onChange={(e) => setActionTradeDate(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                        />
                      </div>

                      <div>
                        <label
                          htmlFor="input-corporate-action-factor"
                          className="block text-[11px] font-semibold text-slate-300 mb-1"
                        >
                          Fator de Proporção (ex: 2, 4, 10)
                        </label>
                        <input
                          id="input-corporate-action-factor"
                          type="number"
                          step="any"
                          min="0.0000000001"
                          required
                          placeholder="Ex: 10"
                          value={actionFactor}
                          onChange={(e) => setActionFactor(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 font-mono"
                        />
                      </div>
                    </div>

                    <div>
                      <label
                        htmlFor="input-corporate-action-notes"
                        className="block text-[11px] font-semibold text-slate-300 mb-1"
                      >
                        Observações (Opcional)
                      </label>
                      <input
                        id="input-corporate-action-notes"
                        type="text"
                        maxLength={500}
                        placeholder="Ex: Desdobramento 1:10 aprovado em AGE"
                        value={actionNotes}
                        onChange={(e) => setActionNotes(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700/80 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500"
                      />
                    </div>

                    <div className="flex justify-end pt-1">
                      <button
                        id="btn-submit-corporate-action"
                        type="submit"
                        disabled={actionSubmitting}
                        className="text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-4 py-2 rounded-xl transition-colors shadow-sm flex items-center gap-1.5"
                      >
                        {actionSubmitting ? 'Registrando...' : 'Confirmar Evento Corporativo'}
                      </button>
                    </div>
                  </form>
                )}
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
