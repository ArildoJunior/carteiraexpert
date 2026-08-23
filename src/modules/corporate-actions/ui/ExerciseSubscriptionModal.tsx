'use client';

import { useState, useEffect } from 'react';
import {
  exerciseSubscriptionAction,
  type ActionResult,
} from '../server/subscription.actions';
import type {
  SubscriptionRightWithOfferAndAssets,
  ExerciseSubscriptionResult,
} from '../server/subscription.service';

interface ExerciseSubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  subscription: SubscriptionRightWithOfferAndAssets | null;
  onSuccess?: () => void;
}

export function ExerciseSubscriptionModal({
  isOpen,
  onClose,
  subscription,
  onSuccess,
}: ExerciseSubscriptionModalProps) {
  const [quantity, setQuantity] = useState<string>('');
  const [fees, setFees] = useState<string>('0.00');
  const [exerciseDate, setExerciseDate] = useState<string>('');
  const [pending, setPending] = useState(false);
  const [state, setState] = useState<ActionResult<ExerciseSubscriptionResult>>({ success: false });

  // Preenche dados padrão ao abrir o modal
  useEffect(() => {
    if (isOpen && subscription) {
      setQuantity('');
      setFees('0.00');
      const now = new Date();
      // Formato YYYY-MM-DDTHH:mm para input datetime-local
      const isoLocal = new Date(now.getTime() - now.getTimezoneOffset() * 60000)
        .toISOString()
        .slice(0, 16);
      setExerciseDate(isoLocal);
      setState({ success: false });
    }
  }, [isOpen, subscription]);

  if (!isOpen || !subscription) return null;

  const exercisePriceNum = Number(subscription.offer.exercisePrice);
  const remainingNum = Number(subscription.remainingQuantity);
  const quantityNum = Number(quantity) || 0;
  const feesNum = Number(fees) || 0;

  // Estimativa meramente visual no cliente (NÃO enviada para o servidor)
  const estimatedCost = quantityNum > 0 ? (quantityNum * exercisePriceNum + feesNum).toFixed(2) : '0.00';

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    e.stopPropagation();
    setPending(true);
    setState({ success: false });

    try {
      const formData = new FormData();
      formData.set('subscriptionRightId', subscription!.id);
      formData.set('portfolioId', subscription!.portfolioId);
      formData.set('quantity', quantity);
      formData.set('fees', fees || '0.00000000');
      formData.set('exerciseDate', exerciseDate ? new Date(exerciseDate).toISOString() : new Date().toISOString());

      // ANTI-TAMPERING: Nunca injetamos exercisePrice ou totalCost no payload
      const res = await exerciseSubscriptionAction(null, formData);
      setState(res);

      if (res.success) {
        onSuccess?.();
      }
    } catch {
      setState({
        success: false,
        error: 'Falha ao processar exercício de subscrição.',
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      id="exercise-subscription-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="exercise-modal-title"
    >
      <div className="relative w-full max-w-lg bg-surface-elevated border border-border-theme rounded-2xl p-6 shadow-2xl space-y-6 text-text-primary">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-theme pb-4">
          <div className="flex items-center gap-2">
            <span className="text-action-primary text-lg">⚡</span>
            <h2 id="exercise-modal-title" className="text-lg font-semibold text-text-primary">
              Exercer Direito de Subscrição
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-text-secondary hover:text-text-primary p-1 rounded-lg hover:bg-surface transition-colors"
            aria-label="Fechar modal"
            disabled={pending}
          >
            ✕
          </button>
        </div>

        {/* Sucesso Confirmado pelo Servidor */}
        {state.success && state.data ? (
          <div className="space-y-5 animate-in fade-in zoom-in-95 duration-200" data-testid="exercise-success-view">
            <div className="p-4 bg-positive-text/10 border border-positive-text/30 rounded-xl text-positive-text space-y-2 text-sm">
              <div className="flex items-center gap-2 font-semibold text-positive-text text-base">
                <span>✓</span> Exercício Realizado com Sucesso!
              </div>
              <p className="text-xs text-positive-text/90 leading-relaxed">
                A operação de compra (BUY) foi gerada e vinculada à sua custódia com sucesso.
              </p>
            </div>

            <div className="bg-background border border-border-theme rounded-xl p-4 space-y-2.5 text-xs">
              <div className="flex justify-between">
                <span className="text-text-secondary">Ativo Adquirido:</span>
                <span className="font-semibold text-text-primary">{subscription.offer.targetAsset.ticker}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Quantidade Exercida:</span>
                <span className="font-semibold text-text-primary tabular-nums">{Number(state.data.exercise.exercisedQuantity).toLocaleString('pt-BR')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Preço Unitário da Oferta:</span>
                <span className="font-semibold text-text-primary tabular-nums">R$ {Number(state.data.exercise.exercisePrice).toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-secondary">Taxas:</span>
                <span className="font-semibold text-text-primary tabular-nums">R$ {Number(state.data.exercise.fees).toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-t border-border-theme pt-2 text-sm">
                <span className="text-text-secondary font-medium">Custo Total Liquidado:</span>
                <span className="font-bold text-positive-text tabular-nums" data-testid="exercised-total-cost">
                  R$ {Number(state.data.exercise.totalCost).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between pt-1">
                <span className="text-text-secondary">Status do Lote:</span>
                <span className="font-medium text-action-primary">{state.data.subscriptionRight.status}</span>
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 text-sm font-semibold bg-action-primary hover:opacity-90 text-action-primary-text rounded-xl transition-all shadow-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-action-primary"
                data-testid="exercise-close-success-btn"
              >
                Concluir
              </button>
            </div>
          </div>
        ) : (
          /* Formulário de Exercício */
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Feedback Geral de Erro */}
            {!state.success && state.error && (
              <div
                className="p-3 bg-negative-text/10 border border-negative-text/30 rounded-xl text-negative-text text-sm"
                role="alert"
                data-testid="exercise-error-message"
              >
                {state.error}
              </div>
            )}

            {/* Parâmetros Imutáveis da Oferta */}
            <div className="bg-background border border-border-theme rounded-xl p-3.5 grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-text-secondary block">Direito:</span>
                <span className="font-semibold text-text-primary">{subscription.offer.rightAsset.ticker}</span>
              </div>
              <div>
                <span className="text-text-secondary block">Ativo Destino:</span>
                <span className="font-semibold text-text-primary">{subscription.offer.targetAsset.ticker}</span>
              </div>
              <div>
                <span className="text-text-secondary block">Preço de Exercício (Oferta):</span>
                <span className="font-semibold text-positive-text tabular-nums" data-testid="readonly-exercise-price">
                  R$ {exercisePriceNum.toFixed(2)}
                </span>
              </div>
              <div>
                <span className="text-text-secondary block">Saldo Disponível:</span>
                <span className="font-semibold text-action-primary tabular-nums" data-testid="readonly-remaining-qty">
                  {remainingNum.toLocaleString('pt-BR')}
                </span>
              </div>
            </div>

            {/* Quantidade a Exercer */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="exercise-quantity-input" className="text-sm font-medium text-text-secondary">
                  Quantidade a Exercer
                </label>
                <button
                  type="button"
                  onClick={() => setQuantity(subscription.remainingQuantity)}
                  className="text-xs font-semibold text-action-primary hover:underline transition-colors"
                  disabled={pending}
                >
                  Usar Máximo ({remainingNum.toLocaleString('pt-BR')})
                </button>
              </div>
              <input
                id="exercise-quantity-input"
                name="quantity"
                type="number"
                step="any"
                min="0.0000000001"
                max={subscription.remainingQuantity}
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="Ex: 50"
                disabled={pending}
                className="w-full bg-background border border-border-theme rounded-xl px-3 py-2.5 text-sm text-text-primary placeholder:text-text-secondary/60 focus:outline-none focus:ring-2 focus:ring-action-primary font-mono tabular-nums transition-all"
                required
              />
              {state.fieldErrors?.quantity && (
                <p className="text-xs text-negative-text">{state.fieldErrors.quantity[0]}</p>
              )}
            </div>

            {/* Taxas */}
            <div className="space-y-1.5">
              <label htmlFor="exercise-fees-input" className="text-sm font-medium text-text-secondary">
                Taxas / Emolumentos (R$)
              </label>
              <input
                id="exercise-fees-input"
                name="fees"
                type="number"
                step="0.01"
                min="0"
                value={fees}
                onChange={(e) => setFees(e.target.value)}
                placeholder="0.00"
                disabled={pending}
                className="w-full bg-background border border-border-theme rounded-xl px-3 py-2.5 text-sm text-text-primary placeholder:text-text-secondary/60 focus:outline-none focus:ring-2 focus:ring-action-primary font-mono tabular-nums transition-all"
              />
              {state.fieldErrors?.fees && (
                <p className="text-xs text-negative-text">{state.fieldErrors.fees[0]}</p>
              )}
            </div>

            {/* Data do Exercício */}
            <div className="space-y-1.5">
              <label htmlFor="exercise-date-input" className="text-sm font-medium text-text-secondary">
                Data do Exercício
              </label>
              <input
                id="exercise-date-input"
                name="exerciseDate"
                type="datetime-local"
                value={exerciseDate}
                onChange={(e) => setExerciseDate(e.target.value)}
                disabled={pending}
                className="w-full bg-background border border-border-theme rounded-xl px-3 py-2.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-action-primary transition-all"
                required
              />
              {state.fieldErrors?.exerciseDate && (
                <p className="text-xs text-negative-text">{state.fieldErrors.exerciseDate[0]}</p>
              )}
            </div>

            {/* Estimativa Visual do Custo */}
            <div className="bg-background border border-border-theme rounded-xl p-3 text-xs space-y-1">
              <div className="flex items-center justify-between text-text-secondary">
                <span>Estimativa de Custo Total:</span>
                <span className="font-semibold text-text-primary tabular-nums">R$ {Number(estimatedCost).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</span>
              </div>
              <p className="text-[11px] text-text-secondary/70 italic">
                * Estimativa ilustrativa. A liquidação e quantização bancária (8 casas) são processadas exclusivamente pelo servidor.
              </p>
            </div>

            {/* Ações */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-border-theme">
              <button
                type="button"
                onClick={onClose}
                disabled={pending}
                className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary rounded-xl hover:bg-surface transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={pending || !quantity || Number(quantity) <= 0 || Number(quantity) > remainingNum}
                className="px-5 py-2 text-sm font-semibold bg-action-primary hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-action-primary-text rounded-xl shadow-sm transition-all flex items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-action-primary"
                data-testid="exercise-submit-btn"
              >
                {pending ? (
                  <>
                    <span className="w-4 h-4 border-2 border-action-primary-text/30 border-t-action-primary-text rounded-full animate-spin" />
                    Processando...
                  </>
                ) : (
                  'Confirmar Exercício'
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
