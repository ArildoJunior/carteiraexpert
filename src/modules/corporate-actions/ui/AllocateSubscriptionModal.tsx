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
      <div className="relative w-full max-w-lg bg-surface-elevated border border-border-theme rounded-2xl p-6 shadow-2xl space-y-6 text-text-primary">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border-theme pb-4">
          <div className="flex items-center gap-2">
            <span className="text-action-primary text-lg">📝</span>
            <h2 id="allocate-modal-title" className="text-lg font-semibold text-text-primary">
              Atribuir Direitos de Subscrição
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

        {/* Informação Contábil / Regulatória */}
        <div className="bg-background border border-border-theme rounded-xl p-3.5 text-xs text-text-secondary leading-relaxed space-y-1">
          <p className="font-medium text-action-primary">Atribuição com Custo Zero</p>
          <p>
            Informe a quantidade exata de direitos atribuídos à sua custódia conforme o informe oficial da sua corretora. A atribuição de direitos não altera o saldo financeiro da carteira.
          </p>
        </div>

        {/* Feedback Geral de Erro */}
        {!state.success && state.error && (
          <div
            className="p-3 bg-negative-text/10 border border-negative-text/30 rounded-xl text-negative-text text-sm"
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
            <label htmlFor="offer-select" className="text-sm font-medium text-text-secondary">
              Oferta de Subscrição Disponível
            </label>
            {loadingOffers ? (
              <div className="p-3 text-xs text-text-secondary bg-surface rounded-xl border border-border-theme animate-pulse">
                Carregando ofertas disponíveis...
              </div>
            ) : offers.length === 0 ? (
              <div className="p-3 text-xs text-amber-600 dark:text-amber-300 bg-amber-500/10 rounded-xl border border-amber-500/30">
                Nenhuma oferta ativa de subscrição encontrada no catálogo.
              </div>
            ) : (
              <select
                id="offer-select"
                name="offerId"
                value={selectedOfferId}
                onChange={(e) => setSelectedOfferId(e.target.value)}
                disabled={pending || offers.length === 0}
                className="w-full bg-background border border-border-theme rounded-xl px-3 py-2.5 text-sm text-text-primary focus:outline-none focus:ring-2 focus:ring-action-primary transition-all"
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
            <div className="bg-background border border-border-theme rounded-xl p-3.5 grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-text-secondary block">Ativo Originador:</span>
                <span className="font-semibold text-text-primary">{selectedOffer.originAsset.ticker}</span>
              </div>
              <div>
                <span className="text-text-secondary block">Ativo de Destino:</span>
                <span className="font-semibold text-text-primary">{selectedOffer.targetAsset.ticker}</span>
              </div>
              <div>
                <span className="text-text-secondary block">Preço de Exercício:</span>
                <span className="font-semibold text-positive-text tabular-nums">
                  R$ {Number(selectedOffer.exercisePrice).toFixed(2)}
                </span>
              </div>
              <div>
                <span className="text-text-secondary block">Fim da Vigência:</span>
                <span className="font-semibold text-text-primary">
                  {new Date(selectedOffer.exerciseEndDate).toLocaleDateString('pt-BR')}
                </span>
              </div>
            </div>
          )}

          {/* Quantidade Atribuída */}
          <div className="space-y-1.5">
            <label htmlFor="allocated-quantity-input" className="text-sm font-medium text-text-secondary">
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
              className="w-full bg-background border border-border-theme rounded-xl px-3 py-2.5 text-sm text-text-primary placeholder:text-text-secondary/60 focus:outline-none focus:ring-2 focus:ring-action-primary font-mono tabular-nums transition-all"
              required
            />
            {state.fieldErrors?.allocatedQuantity && (
              <p className="text-xs text-negative-text">{state.fieldErrors.allocatedQuantity[0]}</p>
            )}
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
              disabled={pending || offers.length === 0 || !allocatedQuantity}
              className="px-5 py-2 text-sm font-semibold bg-action-primary hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed text-action-primary-text rounded-xl shadow-sm transition-all flex items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-action-primary"
              data-testid="allocate-submit-btn"
            >
              {pending ? (
                <>
                  <span className="w-4 h-4 border-2 border-action-primary-text/30 border-t-action-primary-text rounded-full animate-spin" />
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
