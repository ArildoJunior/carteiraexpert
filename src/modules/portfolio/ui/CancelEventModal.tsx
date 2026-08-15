'use client';

import { useState, useEffect } from 'react';
import {
  cancelPortfolioEventAction,
  type ActionResult,
} from '../server/portfolio.actions';
import type { PortfolioEvent } from '../domain/portfolio-event.types';

interface CancelEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  eventToCancel: PortfolioEvent | null;
  onSuccess?: () => void;
}

export function CancelEventModal({
  isOpen,
  onClose,
  eventToCancel,
  onSuccess,
}: CancelEventModalProps) {
  const [reason, setReason] = useState('');
  const [pending, setPending] = useState(false);
  const [state, setState] = useState<ActionResult>({ success: false });

  useEffect(() => {
    setReason('');
    setState({ success: false });
  }, [eventToCancel, isOpen]);

  if (!isOpen || !eventToCancel) return null;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setState({ success: false });

    try {
      const formData = new FormData();
      formData.set('id', eventToCancel?.id || '');
      formData.set('portfolioId', eventToCancel?.portfolioId || '');
      formData.set('cancellationReason', reason);

      const res = await cancelPortfolioEventAction(null, formData);
      setState(res);

      if (res.success) {
        setReason('');
        onSuccess?.();
        onClose();
      }
    } catch {
      setState({
        success: false,
        error: 'Falha ao cancelar operação.',
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      id="cancel-event-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cancel-event-modal-title"
    >
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2">
            <span className="text-red-400 text-lg">⚠️</span>
            <h2
              id="cancel-event-modal-title"
              className="text-lg font-semibold text-white"
            >
              Cancelar Operação
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
            aria-label="Fechar modal"
          >
            ✕
          </button>
        </div>

        {/* Warning info */}
        <div className="bg-amber-950/40 border border-amber-800/60 rounded-xl p-3 text-xs text-amber-200/90 leading-relaxed">
          <strong>Atenção:</strong> Eventos patrimoniais são registros
          históricos e nunca são apagados fisicamente. O cancelamento registrará
          uma exclusão lógica com auditoria e justificativa obrigatória.
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {/* Erro global */}
          {state.error && !state.success && (
            <div
              id="cancel-event-error-alert"
              role="alert"
              className="bg-red-950/60 border border-red-800 text-red-300 text-sm rounded-lg px-4 py-3"
            >
              {state.error}
            </div>
          )}

          {/* Justificativa */}
          <div>
            <label
              htmlFor="cancellation-reason"
              className="block text-sm font-medium text-slate-300 mb-1.5"
            >
              Justificativa do Cancelamento{' '}
              <span className="text-red-400">*</span>
            </label>
            <textarea
              id="cancellation-reason"
              name="cancellationReason"
              required
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Descreva detalhadamente o motivo do cancelamento (mínimo 5 caracteres)..."
              aria-describedby={
                state.fieldErrors?.cancellationReason
                  ? 'cancellation-reason-error'
                  : undefined
              }
              className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3.5 py-2.5 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all resize-none"
            />
            {state.fieldErrors?.cancellationReason && (
              <p
                id="cancellation-reason-error"
                className="text-red-400 text-xs mt-1"
              >
                {state.fieldErrors.cancellationReason[0]}
              </p>
            )}
            <p className="text-xs text-slate-500 mt-1 text-right">
              {reason.length}/500 caracteres (mínimo 5)
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
            >
              Voltar
            </button>
            <button
              id="confirm-cancel-event-submit"
              type="submit"
              disabled={pending || reason.trim().length < 5}
              className="px-5 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-500 disabled:bg-red-900/50 disabled:text-slate-400 disabled:cursor-not-allowed rounded-lg shadow-sm transition-all"
            >
              {pending ? 'Cancelando...' : 'Confirmar Cancelamento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
