'use client';

import { useState, useEffect, useCallback } from 'react';
import { Decimal } from '@/lib/decimal';
import {
  getAssetPositionAction,
  createCorporateActionEventAction,
  createBonusEventAction,
  createIncomeEventAction,
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

export type ActionFormType = 'SPLIT' | 'GROUPING' | 'BONUS_SHARE' | 'DIVIDEND' | 'JCP';

export function AssetPositionDetailModal({
  portfolioId,
  assetId,
  onClose,
}: AssetPositionDetailModalProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<SerializedAssetPositionDetail | null>(null);

  // Estado do formulário de eventos corporativos e proventos
  const [showActionForm, setShowActionForm] = useState(false);
  const [actionType, setActionType] = useState<ActionFormType>('SPLIT');
  const [actionTradeDate, setActionTradeDate] = useState(() => {
    return new Date().toISOString().slice(0, 10);
  });
  const [actionSettlementDate, setActionSettlementDate] = useState(() => {
    return new Date().toISOString().slice(0, 10);
  });

  // Campos específicos
  const [actionFactor, setActionFactor] = useState('2');
  const [bonusQuantity, setBonusQuantity] = useState('10');
  const [bonusUnitPrice, setBonusUnitPrice] = useState('0');
  const [incomeQuantity, setIncomeQuantity] = useState('100');
  const [incomeUnitPrice, setIncomeUnitPrice] = useState('0.50');
  const [incomeFees, setIncomeFees] = useState('0');
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
      if (res.data.position.quantity && new Decimal(res.data.position.quantity).greaterThan(0)) {
        setIncomeQuantity(res.data.position.quantity);
      }
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

  // Auxiliar para calcular 15% de IRRF para JCP
  function handleCalculateJcpIrrf() {
    try {
      const q = new Decimal(incomeQuantity || '0');
      const p = new Decimal(incomeUnitPrice || '0');
      const gross = q.times(p);
      const irrf = gross.times('0.15');
      setIncomeFees(irrf.toFixed(2));
    } catch {
      // no-op
    }
  }

  async function handleEventSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setActionError(null);
    setActionSuccess(null);
    setActionSubmitting(true);

    try {
      if (actionType === 'SPLIT' || actionType === 'GROUPING') {
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
      } else if (actionType === 'BONUS_SHARE') {
        const formData = new FormData();
        formData.set('portfolioId', portfolioId);
        formData.set('assetId', assetId);
        formData.set('type', 'BONUS_SHARE');
        formData.set('tradeDate', actionTradeDate);
        formData.set('quantity', bonusQuantity);
        formData.set('unitPrice', bonusUnitPrice || '0');
        if (actionNotes.trim()) {
          formData.set('notes', actionNotes.trim());
        }

        const res = await createBonusEventAction(null, formData);

        if (res.success) {
          setActionSuccess('Bonificação de ações registrada com sucesso!');
          setShowActionForm(false);
          setActionNotes('');
          await loadData();
        } else {
          setActionError(res.error || 'Falha ao registrar bonificação de ações.');
        }
      } else if (actionType === 'DIVIDEND' || actionType === 'JCP') {
        const formData = new FormData();
        formData.set('portfolioId', portfolioId);
        formData.set('assetId', assetId);
        formData.set('type', actionType);
        formData.set('tradeDate', actionTradeDate);
        formData.set('settlementDate', actionSettlementDate);
        formData.set('quantity', incomeQuantity);
        formData.set('unitPrice', incomeUnitPrice);
        formData.set('fees', actionType === 'JCP' ? incomeFees || '0' : '0');
        if (actionNotes.trim()) {
          formData.set('notes', actionNotes.trim());
        }

        const res = await createIncomeEventAction(null, formData);

        if (res.success) {
          setActionSuccess(
            `Provento (${actionType === 'DIVIDEND' ? 'Dividendo' : 'JCP'}) registrado com sucesso!`
          );
          setShowActionForm(false);
          setActionNotes('');
          await loadData();
        } else {
          setActionError(res.error || 'Falha ao registrar provento.');
        }
      }
    } catch {
      setActionError('Erro inesperado ao registrar operação.');
    } finally {
      setActionSubmitting(false);
    }
  }

  const pos = detail?.position;
  const decPnL = new Decimal(pos?.totalRealizedPnL || '0');
  const isPositivePnL = decPnL.greaterThan(0);
  const isNegativePnL = decPnL.lessThan(0);

  // Estimativa de provento em tempo real
  let estimatedIncomeNet: string | null = null;
  if (actionType === 'DIVIDEND') {
    try {
      const q = new Decimal(incomeQuantity || '0');
      const p = new Decimal(incomeUnitPrice || '0');
      estimatedIncomeNet = formatMoney(q.times(p), pos?.currency || 'BRL');
    } catch {
      estimatedIncomeNet = null;
    }
  } else if (actionType === 'JCP') {
    try {
      const q = new Decimal(incomeQuantity || '0');
      const p = new Decimal(incomeUnitPrice || '0');
      const f = new Decimal(incomeFees || '0');
      const gross = q.times(p);
      const net = gross.minus(f);
      estimatedIncomeNet = formatMoney(net.greaterThan(0) ? net : new Decimal(0), pos?.currency || 'BRL');
    } catch {
      estimatedIncomeNet = null;
    }
  }

  return (
    <div
      id="asset-detail-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        id="asset-detail-modal-content"
        className="bg-surface-elevated border border-border-theme rounded-3xl w-full max-w-4xl overflow-hidden shadow-2xl space-y-6 p-6 sm:p-8 max-h-[90vh] flex flex-col text-text-primary"
      >
        {/* Cabeçalho */}
        <div className="flex items-start justify-between border-b border-border-theme pb-4">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h2
                id="asset-detail-modal-title"
                className="text-2xl font-bold text-text-primary tracking-tight"
              >
                {pos ? pos.ticker : 'Carregando Ativo...'}
              </h2>
              {pos?.isCustom && (
                <span className="text-[11px] uppercase font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-md">
                  Customizado
                </span>
              )}
              {pos?.hasFractionalShares && (
                <span
                  id="asset-detail-fractional-badge"
                  className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-md flex items-center gap-1"
                  title="A quantidade em custódia contém fração residual resultante de evento corporativo."
                >
                  ⚠️ Fração Residual
                </span>
              )}
              {pos && (
                <span className="text-xs text-text-secondary font-mono bg-background border border-border-theme px-2 py-0.5 rounded-md">
                  {pos.market} • {pos.currency}
                </span>
              )}
            </div>
            {pos && (
              <p className="text-sm text-text-secondary mt-1">{pos.name}</p>
            )}
          </div>

          <button
            id="btn-close-asset-detail-modal"
            type="button"
            onClick={onClose}
            className="text-text-secondary hover:text-text-primary p-2 rounded-xl hover:bg-surface transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Mensagens de Sucesso ou Erro */}
        {actionSuccess && (
          <div
            id="corporate-action-success-msg"
            className="bg-positive-text/10 border border-positive-text/30 rounded-xl p-3.5 text-xs text-positive-text flex items-center justify-between"
          >
            <span>{actionSuccess}</span>
            <button
              type="button"
              onClick={() => setActionSuccess(null)}
              className="text-positive-text hover:underline font-bold ml-2"
            >
              ✕
            </button>
          </div>
        )}

        {/* Corpo do Modal */}
        <div className="flex-1 overflow-y-auto space-y-6 pr-1">
          {loading ? (
            <div className="py-16 text-center space-y-3">
              <div className="w-8 h-8 border-2 border-action-primary border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-sm text-text-secondary">
                Carregando histórico e posições do ativo...
              </p>
            </div>
          ) : error || !pos ? (
            <div className="bg-negative-text/10 border border-negative-text/30 rounded-2xl p-6 text-center text-negative-text text-sm">
              {error || 'Dados do ativo não encontrados.'}
            </div>
          ) : (
            <>
              {/* Cards de Métricas do Ativo (5 Colunas) */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="bg-background border border-border-theme rounded-2xl p-3.5 space-y-1">
                  <p className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider">
                    Quantidade
                  </p>
                  <p
                    id="asset-detail-qty"
                    className="text-base sm:text-lg font-bold font-mono tabular-nums text-text-primary"
                  >
                    {formatQuantity(pos.quantity)}
                  </p>
                  <p className="text-[10px] text-text-secondary">
                    {pos.hasFractionalShares ? 'Com fração residual' : 'Em custódia ativa'}
                  </p>
                </div>

                <div className="bg-background border border-border-theme rounded-2xl p-3.5 space-y-1">
                  <p className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider">
                    Custo Médio
                  </p>
                  <p
                    id="asset-detail-avg-price"
                    className="text-base sm:text-lg font-bold font-mono tabular-nums text-text-primary"
                  >
                    {formatMoney(pos.averagePrice, pos.currency)}
                  </p>
                  <p className="text-[10px] text-text-secondary">Com taxas inclusas</p>
                </div>

                <div className="bg-background border border-border-theme rounded-2xl p-3.5 space-y-1">
                  <p className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider">
                    Total Investido
                  </p>
                  <p
                    id="asset-detail-total-cost"
                    className="text-base sm:text-lg font-bold font-mono tabular-nums text-action-primary"
                  >
                    {formatMoney(pos.totalCost, pos.currency)}
                  </p>
                  <p className="text-[10px] text-text-secondary">Custo de aquisição</p>
                </div>

                <div className="bg-background border border-border-theme rounded-2xl p-3.5 space-y-1">
                  <p className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider">
                    PnL Realizado
                  </p>
                  <p
                    id="asset-detail-realized-pnl"
                    className={`text-base sm:text-lg font-bold font-mono tabular-nums ${
                      isPositivePnL
                        ? 'text-positive-text'
                        : isNegativePnL
                        ? 'text-negative-text'
                        : 'text-text-secondary'
                    }`}
                  >
                    {isPositivePnL ? '+' : ''}
                    {formatMoney(pos.totalRealizedPnL, pos.currency)}
                  </p>
                  <p className="text-[10px] text-text-secondary">Lucro de vendas</p>
                </div>

                <div className="bg-background border border-border-theme rounded-2xl p-3.5 space-y-1 col-span-2 sm:col-span-1">
                  <p className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider">
                    Proventos
                  </p>
                  <p
                    id="asset-detail-income-received"
                    className="text-base sm:text-lg font-bold font-mono tabular-nums text-positive-text"
                  >
                    {formatMoney(pos.totalIncomeReceived || '0', pos.currency)}
                  </p>
                  <p className="text-[10px] text-text-secondary">Dividendos e JCP</p>
                </div>
              </div>

              {/* Seção de Lançamento de Eventos Corporativos e Proventos */}
              <div className="bg-background border border-border-theme rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-text-primary">
                      Eventos Corporativos & Proventos
                    </h3>
                    <p className="text-[11px] text-text-secondary mt-0.5">
                      Registre desdobramentos, grupamentos, bonificações de ações, dividendos e JCP.
                    </p>
                  </div>

                  <button
                    id="btn-toggle-corporate-action-form"
                    type="button"
                    onClick={() => {
                      setShowActionForm(!showActionForm);
                      setActionError(null);
                    }}
                    className="text-xs font-semibold text-action-primary hover:underline bg-action-primary/10 border border-action-primary/30 px-3 py-1.5 rounded-xl transition-colors"
                  >
                    {showActionForm ? 'Cancelar' : '+ Lançar Evento / Provento'}
                  </button>
                </div>

                {showActionForm && (
                  <form
                    id="corporate-action-form"
                    onSubmit={handleEventSubmit}
                    className="pt-3 border-t border-border-theme space-y-4"
                  >
                    {actionError && (
                      <div
                        id="corporate-action-error-msg"
                        className="bg-negative-text/10 border border-negative-text/30 rounded-xl p-3 text-xs text-negative-text"
                      >
                        {actionError}
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {/* Tipo de Evento */}
                      <div>
                        <label
                          htmlFor="input-corporate-action-type"
                          className="block text-[11px] font-semibold text-text-secondary mb-1"
                        >
                          Tipo de Operação
                        </label>
                        <select
                          id="input-corporate-action-type"
                          value={actionType}
                          onChange={(e) => setActionType(e.target.value as ActionFormType)}
                          className="w-full bg-surface border border-border-theme rounded-xl px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-action-primary"
                        >
                          <option value="SPLIT">🔀 Desdobramento (Split)</option>
                          <option value="GROUPING">🔄 Grupamento</option>
                          <option value="BONUS_SHARE">🎁 Bonificação de Ações</option>
                          <option value="DIVIDEND">💵 Dividendo em Dinheiro</option>
                          <option value="JCP">🏛️ Juros sobre Capital Próprio (JCP)</option>
                        </select>
                      </div>

                      {/* Data-Com / Data de Corte */}
                      <div>
                        <label
                          htmlFor="input-corporate-action-trade-date"
                          className="block text-[11px] font-semibold text-text-secondary mb-1"
                        >
                          {actionType === 'SPLIT' || actionType === 'GROUPING'
                            ? 'Data de Corte (Data Ex)'
                            : 'Data de Corte (Data-Com)'}
                        </label>
                        <input
                          id="input-corporate-action-trade-date"
                          type="date"
                          required
                          value={actionTradeDate}
                          onChange={(e) => setActionTradeDate(e.target.value)}
                          className="w-full bg-surface border border-border-theme rounded-xl px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-action-primary"
                        />
                      </div>

                      {/* Data de Pagamento (para DIVIDEND e JCP) */}
                      {(actionType === 'DIVIDEND' || actionType === 'JCP') && (
                        <div>
                          <label
                            htmlFor="input-corporate-action-settlement-date"
                            className="block text-[11px] font-semibold text-text-secondary mb-1"
                          >
                            Data de Pagamento *
                          </label>
                          <input
                            id="input-corporate-action-settlement-date"
                            type="date"
                            required
                            value={actionSettlementDate}
                            onChange={(e) => setActionSettlementDate(e.target.value)}
                            className="w-full bg-surface border border-border-theme rounded-xl px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-action-primary"
                          />
                        </div>
                      )}

                      {/* Fator de Proporção (para SPLIT e GROUPING) */}
                      {(actionType === 'SPLIT' || actionType === 'GROUPING') && (
                        <div>
                          <label
                            htmlFor="input-corporate-action-factor"
                            className="block text-[11px] font-semibold text-text-secondary mb-1"
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
                            className="w-full bg-surface border border-border-theme rounded-xl px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-action-primary font-mono tabular-nums"
                          />
                        </div>
                      )}

                      {/* Campos para BONUS_SHARE */}
                      {actionType === 'BONUS_SHARE' && (
                        <>
                          <div>
                            <label
                              htmlFor="input-bonus-quantity"
                              className="block text-[11px] font-semibold text-text-secondary mb-1"
                            >
                              Qtd de Ações Bonificadas *
                            </label>
                            <input
                              id="input-bonus-quantity"
                              type="number"
                              step="any"
                              min="0.0000000001"
                              required
                              placeholder="Ex: 10"
                              value={bonusQuantity}
                              onChange={(e) => setBonusQuantity(e.target.value)}
                              className="w-full bg-surface border border-border-theme rounded-xl px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-action-primary font-mono tabular-nums"
                            />
                          </div>

                          <div>
                            <label
                              htmlFor="input-bonus-unit-price"
                              className="block text-[11px] font-semibold text-text-secondary mb-1"
                            >
                              Custo Unitário Atribuído (R$)
                            </label>
                            <input
                              id="input-bonus-unit-price"
                              type="number"
                              step="any"
                              min="0"
                              required
                              placeholder="Ex: 15.40 (ou 0 se sem custo)"
                              value={bonusUnitPrice}
                              onChange={(e) => setBonusUnitPrice(e.target.value)}
                              className="w-full bg-surface border border-border-theme rounded-xl px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-action-primary font-mono tabular-nums"
                            />
                          </div>
                        </>
                      )}

                      {/* Campos para DIVIDEND e JCP */}
                      {(actionType === 'DIVIDEND' || actionType === 'JCP') && (
                        <>
                          <div>
                            <label
                              htmlFor="input-income-quantity"
                              className="block text-[11px] font-semibold text-text-secondary mb-1"
                            >
                              Qtd de Ações Elegíveis *
                            </label>
                            <input
                              id="input-income-quantity"
                              type="number"
                              step="any"
                              min="0.0000000001"
                              required
                              placeholder="Ex: 100"
                              value={incomeQuantity}
                              onChange={(e) => setIncomeQuantity(e.target.value)}
                              className="w-full bg-surface border border-border-theme rounded-xl px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-action-primary font-mono tabular-nums"
                            />
                          </div>

                          <div>
                            <label
                              htmlFor="input-income-unit-price"
                              className="block text-[11px] font-semibold text-text-secondary mb-1"
                            >
                              {actionType === 'DIVIDEND' ? 'Valor por Ação (R$) *' : 'Valor Bruto por Ação (R$) *'}
                            </label>
                            <input
                              id="input-income-unit-price"
                              type="number"
                              step="any"
                              min="0.00000001"
                              required
                              placeholder="Ex: 0.55"
                              value={incomeUnitPrice}
                              onChange={(e) => setIncomeUnitPrice(e.target.value)}
                              className="w-full bg-surface border border-border-theme rounded-xl px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-action-primary font-mono tabular-nums"
                            />
                          </div>

                          {actionType === 'JCP' && (
                            <div>
                              <div className="flex items-center justify-between mb-1">
                                <label
                                  htmlFor="input-income-fees"
                                  className="block text-[11px] font-semibold text-text-secondary"
                                >
                                  IRRF Retido Total (R$)
                                </label>
                                <button
                                  type="button"
                                  onClick={handleCalculateJcpIrrf}
                                  className="text-[10px] text-action-primary hover:underline font-semibold"
                                  title="Calcula 15% sobre o valor bruto"
                                >
                                  Calcular 15%
                                </button>
                              </div>
                              <input
                                id="input-income-fees"
                                type="number"
                                step="any"
                                min="0"
                                required
                                placeholder="Ex: 7.50"
                                value={incomeFees}
                                onChange={(e) => setIncomeFees(e.target.value)}
                                className="w-full bg-surface border border-border-theme rounded-xl px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-action-primary font-mono tabular-nums"
                              />
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    {/* Feedback de Estimativa Líquida para Proventos */}
                    {estimatedIncomeNet && (
                      <div className="bg-surface border border-border-theme rounded-xl p-2.5 text-xs text-text-primary flex items-center justify-between">
                        <span className="text-text-secondary">Total Líquido Estimado:</span>
                        <span className="font-mono tabular-nums font-bold text-positive-text">
                          {estimatedIncomeNet}
                        </span>
                      </div>
                    )}

                    {/* Observações */}
                    <div>
                      <label
                        htmlFor="input-corporate-action-notes"
                        className="block text-[11px] font-semibold text-text-secondary mb-1"
                      >
                        Observações (Opcional)
                      </label>
                      <input
                        id="input-corporate-action-notes"
                        type="text"
                        maxLength={500}
                        placeholder="Ex: Aprovado em Assembleia Geral Ordinária"
                        value={actionNotes}
                        onChange={(e) => setActionNotes(e.target.value)}
                        className="w-full bg-surface border border-border-theme rounded-xl px-3 py-2 text-xs text-text-primary focus:outline-none focus:ring-2 focus:ring-action-primary"
                      />
                    </div>

                    <div className="flex justify-end pt-1">
                      <button
                        id="btn-submit-corporate-action"
                        type="submit"
                        disabled={actionSubmitting}
                        className="text-xs font-semibold text-action-primary-text bg-action-primary hover:opacity-90 disabled:opacity-50 px-4 py-2 rounded-xl transition-colors shadow-sm flex items-center gap-1.5"
                      >
                        {actionSubmitting ? 'Registrando...' : 'Confirmar Lançamento'}
                      </button>
                    </div>
                  </form>
                )}
              </div>

              {/* Tabela de Vendas Realizadas e Apuração de Lucro */}
              <div className="space-y-3">
                <h3 className="text-sm font-bold text-text-primary flex items-center justify-between">
                  <span>Histórico de Vendas e PnL Realizado</span>
                  <span className="text-xs font-normal text-text-secondary bg-background border border-border-theme px-2 py-0.5 rounded-full">
                    {detail.realizedTrades.length}{' '}
                    {detail.realizedTrades.length === 1 ? 'venda' : 'vendas'}
                  </span>
                </h3>

                {detail.realizedTrades.length === 0 ? (
                  <div className="bg-background border border-border-theme rounded-2xl p-6 text-center space-y-1 text-xs text-text-secondary">
                    <p className="font-semibold text-text-primary">
                      Nenhuma venda realizada para este ativo.
                    </p>
                    <p>
                      Quando você registrar operações de venda (`SELL`), o lucro ou prejuízo apurado aparecerá discriminado aqui.
                    </p>
                  </div>
                ) : (
                  <div className="border border-border-theme rounded-2xl overflow-hidden shadow-inner">
                    <table
                      id="asset-realized-trades-table"
                      className="w-full text-left border-collapse text-xs"
                    >
                      <thead>
                        <tr className="border-b border-border-theme bg-background/60 text-[11px] font-semibold text-text-secondary uppercase tracking-wider">
                          <th className="px-4 py-3">Data</th>
                          <th className="px-3 py-3 text-right">Qtd</th>
                          <th className="px-3 py-3 text-right">Preço Venda</th>
                          <th className="px-3 py-3 text-right">Custo Base</th>
                          <th className="px-4 py-3 text-right">PnL Apurado</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border-theme/50 text-text-primary">
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
                              className="hover:bg-surface/50 transition-colors"
                            >
                              <td className="px-4 py-3 font-mono tabular-nums text-text-secondary whitespace-nowrap">
                                {tradeDateFormatted}
                              </td>
                              <td className="px-3 py-3 text-right font-mono tabular-nums font-medium text-text-primary whitespace-nowrap">
                                {formatQuantity(trade.quantity)}
                              </td>
                              <td className="px-3 py-3 text-right font-mono tabular-nums text-text-secondary whitespace-nowrap">
                                {formatMoney(trade.salePrice, pos.currency)}
                              </td>
                              <td className="px-3 py-3 text-right font-mono tabular-nums text-text-secondary whitespace-nowrap">
                                {formatMoney(trade.costBasisPrice, pos.currency)}
                              </td>
                              <td
                                className={`px-4 py-3 text-right font-mono tabular-nums font-bold whitespace-nowrap ${
                                  isTradePos
                                    ? 'text-positive-text'
                                    : isTradeNeg
                                    ? 'text-negative-text'
                                    : 'text-text-secondary'
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
        <div className="border-t border-border-theme pt-4 flex justify-end">
          <button
            id="btn-asset-detail-close-bottom"
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 text-xs font-semibold text-text-primary bg-surface hover:bg-border-theme/40 rounded-xl transition-colors border border-border-theme"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
