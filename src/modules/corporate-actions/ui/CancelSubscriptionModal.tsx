'use client';

import { useState, useEffect } from 'react';
import {
  cancelSubscriptionRightAction,
  type ActionResult,
} from '../server/subscription.actions';
import type { SubscriptionRightWithOfferAndAssets } from '../server/subscription.service';
import type { SubscriptionRight } from '../domain';

interface CancelSubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  subscription: SubscriptionRightWithOfferAndAssets | null;
  onSuccess?: () => void;
}

export function CancelSubscriptionModal({
  isOpen,
  onClose,
  subscription,
  onSuccess,
}: CancelSubscriptionModalProps) {
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [state, setState] = useState<ActionResult<SubscriptionRight>>({ success: false });

  useEffect(() => {
    if (isOpen) {
      setReason('');
      setState({ success: false });
    }
  }, [isOpen, subscription]);

  if (!isOpen || !subscription) return null;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    e.stopPropagation();
    setPending(true);
    setState({ success: false });

    try {
      const formData = new FormData();
      formData.set('subscriptionRightId', subscription!.id);
      formData.set('portfolioId', subscription!.portfolioId);
      formData.set('reason', reason);

      const res = await cancelSubscriptionRightAction(null, formData);
      setState(res);

      if (res.success) {
        setReason('');
        onSuccess?.();
        onClose();
      }
    } catch {
      setState({
        success: false,
        error: 'Falha ao cancelar direito de subscrição.',
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      id="cancel-subscription-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cancel-subscription-modal-title"
    >
      <div className="relative w-full max-w-md bg-surface-elevated border border-border-theme rounded-2xl p-6 shadow-2xl space-y-5 text-text-primary">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-theme pb-4">
          <div className="flex items-center gap-2">
            <span className="text-negative-text text-lg">⚠️</span>
            <h2 id="cancel-subscription-modal-title" className="text-lg font-semibold text-text-primary">
              Cancelar Saldo de Subscrição
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

        {/* Warning info */}
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3.5 text-xs text-amber-700 dark:text-amber-300 leading-relaxed space-y-1">
          <p className="font-medium text-amber-600 dark:text-amber-300">Atenção sobre o Cancelamento:</p>
          <p>
            O cancelamento incide exclusivamente sobre o saldo remanescente ({Number(subscription.remainingQuantity).toLocaleString('pt-BR')} direitos) de <strong>{subscription.offer.rightAsset.ticker}</strong>. Operações de compra (BUY) já realizadas anteriormente continuarão íntegras no extrato.
          </p>
        </div>

        {/* Feedback Geral de Erro */}
        {!state.success && state.error && (
          <div
            className="p-3 bg-negative-text/10 border border-negative-text/30 rounded-xl text-negative-text text-sm"
            role="alert"
            data-testid="cancel-error-message"
          >
            {state.error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="cancel-reason-input" className="text-sm font-medium text-text-secondary">
              Motivo do Cancelamento <span className="text-negative-text">*</span>
            </label>
            <textarea
              id="cancel-reason-input"
              name="reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Descreva a justificativa para auditoria (mínimo 3 caracteres)..."
              disabled={pending}
              className="w-full bg-background border border-border-theme rounded-xl px-3 py-2.5 text-sm text-text-primary placeholder:text-text-secondary/60 focus:outline-none focus:ring-2 focus:ring-negative-text transition-all resize-none"
              required
              minLength={3}
              maxLength={500}
            />
            {state.fieldErrors?.reason && (
              <p className="text-xs text-negative-text">{state.fieldErrors.reason[0]}</p>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-border-theme">
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="px-4 py-2 text-sm text-text-secondary hover:text-text-primary rounded-xl hover:bg-surface transition-colors"
            >
              Voltar
            </button>
            <button
              type="submit"
              disabled={pending || reason.trim().length < 3}
              className="px-5 py-2 text-sm font-semibold bg-negative-text hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl shadow-sm transition-all flex items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-negative-text"
              data-testid="cancel-submit-btn"
            >
              {pending ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Cancelando...
                </>
              ) : (
                'Confirmar Cancelamento'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
