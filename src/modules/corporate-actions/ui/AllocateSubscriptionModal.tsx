'use client';

import { useState, useEffect } from 'react';
import {
  allocateSubscriptionRightAction,
  listAvailableOffersAction,
  type ActionResult,
} from '../server/subscription.actions';
import type { SubscriptionOfferWithAssets } from '../server/subscription.service';
import type { SubscriptionRight } from '../domain';

interface AllocateSubscriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  portfolioId: string;
  onSuccess?: () => void;
}

export function AllocateSubscriptionModal({
  isOpen,
  onClose,
  portfolioId,
  onSuccess,
}: AllocateSubscriptionModalProps) {
  const [offers, setOffers] = useState<SubscriptionOfferWithAssets[]>([]);
  const [selectedOfferId, setSelectedOfferId] = useState<string>('');
  const [allocatedQuantity, setAllocatedQuantity] = useState<string>('');
  const [loadingOffers, setLoadingOffers] = useState(false);
  const [pending, setPending] = useState(false);
  const [state, setState] = useState<ActionResult<SubscriptionRight>>({ success: false });

  // Carrega ofertas disponíveis quando o modal abre
  useEffect(() => {
    if (!isOpen) {
      setSelectedOfferId('');
      setAllocatedQuantity('');
      setState({ success: false });
      return;
    }

    let active = true;
    async function loadOffers() {
      setLoadingOffers(true);
      try {
        const res = await listAvailableOffersAction();
        if (active && res.success && res.data) {
          setOffers(res.data);
          if (res.data.length > 0 && !selectedOfferId) {
            setSelectedOfferId(res.data[0].id);
          }
        }
      } catch {
        // Trata erro de carregamento silenciosamente
      } finally {
        if (active) setLoadingOffers(false);
      }
    }

    loadOffers();

    return () => {
      active = false;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const selectedOffer = offers.find((o) => o.id === selectedOfferId);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    e.stopPropagation();
    setPending(true);
    setState({ success: false });

    try {
      const formData = new FormData();
      formData.set('portfolioId', portfolioId);
      formData.set('offerId', selectedOfferId);
      formData.set('allocatedQuantity', allocatedQuantity);

      const res = await allocateSubscriptionRightAction(null, formData);
      setState(res);

      if (res.success) {
        onSuccess?.();
        onClose();
      }
    } catch {
      setState({
        success: false,
        error: 'Falha ao registrar atribuição de subscrição.',
      });
    } finally {
      setPending(false);
    }
  }

  return (
    <div
      id="allocate-subscription-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
      role="dialog"
      aria-modal="true"
      aria-labelledby="allocate-modal-title"
    >
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl p-6 shadow-2xl space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2">
            <span className="text-emerald-400 text-lg">📝</span>
            <h2 id="allocate-modal-title" className="text-lg font-semibold text-white">
              Atribuir Direitos de Subscrição
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

        {/* Informação Contábil / Regulatória */}
        <div className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-3.5 text-xs text-slate-300 leading-relaxed space-y-1">
          <p className="font-medium text-emerald-400">Atribuição com Custo Zero</p>
          <p>
            Informe a quantidade exata de direitos atribuídos à sua custódia conforme o informe oficial da sua corretora. A atribuição de direitos não altera o saldo financeiro da carteira.
          </p>
        </div>

        {/* Feedback Geral de Erro */}
        {!state.success && state.error && (
          <div
            className="p-3 bg-red-950/40 border border-red-800 rounded-xl text-red-300 text-sm"
            role="alert"
            data-testid="allocate-error-message"
          >
            {state.error}
          </div>
        )}

        {/* Formulário */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Seleção de Oferta */}
          <div className="space-y-1.5">
            <label htmlFor="offer-select" className="text-sm font-medium text-slate-200">
              Oferta de Subscrição Disponível
            </label>
            {loadingOffers ? (
              <div className="p-3 text-xs text-slate-400 bg-slate-800/40 rounded-xl border border-slate-700 animate-pulse">
                Carregando ofertas disponíveis...
              </div>
            ) : offers.length === 0 ? (
              <div className="p-3 text-xs text-amber-300/90 bg-amber-950/30 rounded-xl border border-amber-800/40">
                Nenhuma oferta ativa de subscrição encontrada no catálogo.
              </div>
            ) : (
              <select
                id="offer-select"
                name="offerId"
                value={selectedOfferId}
                onChange={(e) => setSelectedOfferId(e.target.value)}
                disabled={pending || offers.length === 0}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                required
              >
                {offers.map((offer) => (
                  <option key={offer.id} value={offer.id}>
                    {offer.rightAsset.ticker} — {offer.originAsset.name} (Exercício: R$ {Number(offer.exercisePrice).toFixed(2)})
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Detalhes da Oferta Selecionada */}
          {selectedOffer && (
            <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-3.5 grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-slate-400 block">Ativo Originador:</span>
                <span className="font-semibold text-white">{selectedOffer.originAsset.ticker}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Ativo de Destino:</span>
                <span className="font-semibold text-white">{selectedOffer.targetAsset.ticker}</span>
              </div>
              <div>
                <span className="text-slate-400 block">Preço de Exercício:</span>
                <span className="font-semibold text-emerald-400">
                  R$ {Number(selectedOffer.exercisePrice).toFixed(2)}
                </span>
              </div>
              <div>
                <span className="text-slate-400 block">Fim da Vigência:</span>
                <span className="font-semibold text-slate-200">
                  {new Date(selectedOffer.exerciseEndDate).toLocaleDateString('pt-BR')}
                </span>
              </div>
            </div>
          )}

          {/* Quantidade Atribuída */}
          <div className="space-y-1.5">
            <label htmlFor="allocated-quantity-input" className="text-sm font-medium text-slate-200">
              Quantidade de Direitos Atribuída
            </label>
            <input
              id="allocated-quantity-input"
              name="allocatedQuantity"
              type="number"
              step="any"
              min="0.0000000001"
              value={allocatedQuantity}
              onChange={(e) => setAllocatedQuantity(e.target.value)}
              placeholder="Ex: 100"
              disabled={pending || offers.length === 0}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
              required
            />
            {state.fieldErrors?.allocatedQuantity && (
              <p className="text-xs text-red-400">{state.fieldErrors.allocatedQuantity[0]}</p>
            )}
          </div>

          {/* Ações */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={pending}
              className="px-4 py-2 text-sm text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={pending || offers.length === 0 || !allocatedQuantity}
              className="px-5 py-2 text-sm font-medium bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl shadow-lg shadow-emerald-950/50 transition-all flex items-center gap-2"
              data-testid="allocate-submit-btn"
            >
              {pending ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Atribuindo...
                </>
              ) : (
                'Confirmar Atribuição'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
