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
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2">
            <span className="text-red-400 text-lg">⚠️</span>
            <h2 id="cancel-subscription-modal-title" className="text-lg font-semibold text-white">
              Cancelar Saldo de Subscrição
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
            aria-label="Fechar modal"
            disabled={pending}
          >
            ✕
          </button>
        </div>

        {/* Warning info */}
        <div className="bg-amber-950/40 border border-amber-800/60 rounded-xl p-3.5 text-xs text-amber-200/90 leading-relaxed space-y-1">
          <p className="font-medium text-amber-300">Atenção sobre o Cancelamento:</p>
          <p>
            O cancelamento incide exclusivamente sobre o saldo remanescente ({Number(subscription.remainingQuantity).toLocaleString('pt-BR')} direitos) de <strong>{subscription.offer.rightAsset.ticker}</strong>. Operações de compra (BUY) já realizadas anteriormente continuarão íntegras no extrato.
          </p>
        </div>

        {/* Feedback Geral de Erro */}
        {!state.success && state.error && (
          <div
            className="p-3 bg-red-950/40 border border-red-800 rounded-xl text-red-300 text-sm"
            role="alert"
            data-testid="cancel-error-message"
          >
            {state.error}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="cancel-reason-input" className="text-sm font-medium text-slate-200">
              Motivo do Cancelamento <span className="text-red-400">*</span>
            </label>
            <textarea
              id="cancel-reason-input"
              name="reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Descreva a justificativa para auditoria (mínimo 3 caracteres)..."
              disabled={pending}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-red-500 transition-all resize-none"
              required
              minLength={3}
              maxLength={500}
            />
            {state.fieldErrors?.reason && (
              <p className="text-xs text-red-400">{state.fieldErrors.reason[0]}</p>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="px-4 py-2 text-sm text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
            >
              Voltar
            </button>
            <button
              type="submit"
              disabled={pending || reason.trim().length < 3}
              className="px-5 py-2 text-sm font-medium bg-red-600 hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl shadow-lg shadow-red-950/50 transition-all flex items-center gap-2"
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
