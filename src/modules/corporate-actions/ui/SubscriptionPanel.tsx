'use client';

import { useState } from 'react';
import type {
  SubscriptionRightWithOfferAndAssets,
  SubscriptionOfferWithAssets,
} from '../server/subscription.service';
import { SubscriptionStatusBadge } from './SubscriptionStatusBadge';
import { AllocateSubscriptionModal } from './AllocateSubscriptionModal';
import { ExerciseSubscriptionModal } from './ExerciseSubscriptionModal';
import { CancelSubscriptionModal } from './CancelSubscriptionModal';

interface SubscriptionPanelProps {
  portfolioId: string;
  subscriptions: SubscriptionRightWithOfferAndAssets[];
  availableOffers?: SubscriptionOfferWithAssets[];
  onRefresh?: () => void;
}

export function SubscriptionPanel({
  portfolioId,
  subscriptions,
  availableOffers = [],
  onRefresh,
}: SubscriptionPanelProps) {
  const [isAllocateOpen, setIsAllocateOpen] = useState(false);
  const [exerciseTarget, setExerciseTarget] = useState<SubscriptionRightWithOfferAndAssets | null>(null);
  const [cancelTarget, setCancelTarget] = useState<SubscriptionRightWithOfferAndAssets | null>(null);
  const [showOffersSection, setShowOffersSection] = useState(false);

  return (
    <div className="space-y-4 text-text-primary" id="subscription-panel-section" data-testid="subscription-panel">
      {/* 1. Header com Título, Badge e Ação */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-lg font-bold text-text-primary tracking-tight">
              Direitos de Subscrição
            </h2>
            <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-surface text-text-secondary border border-border-theme tabular-nums">
              {subscriptions.length} {subscriptions.length === 1 ? 'lote' : 'lotes'}
            </span>
          </div>
          <p className="text-xs text-text-secondary mt-0.5">
            Custódia segregada e gestão determinística de direitos de subscrição.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setIsAllocateOpen(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold bg-action-primary hover:opacity-90 text-action-primary-text rounded-xl shadow-sm transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-action-primary"
            data-testid="open-allocate-modal-btn"
          >
            <span>+</span> Atribuir Direitos
          </button>
        </div>
      </div>

      {/* 2. Mensagem Regulatória e Finalidade Obrigatória */}
      <div className="bg-surface border border-border-theme rounded-xl p-3 text-[11px] text-text-secondary leading-relaxed flex items-center gap-2">
        <span className="text-action-primary text-sm">ℹ️</span>
        <span>
          <strong>Finalidade:</strong> A plataforma organiza e alerta; não recomenda estratégias, não executa rolagens e não envia ordens para corretoras.
        </span>
      </div>

      {/* 3. Tabela de Lotes de Direitos */}
      {subscriptions.length === 0 ? (
        <div
          className="bg-surface border border-border-theme rounded-2xl p-8 text-center space-y-3"
          data-testid="subscriptions-empty-state"
        >
          <div className="w-12 h-12 rounded-2xl bg-background border border-border-theme flex items-center justify-center mx-auto text-xl text-text-secondary">
            📑
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-text-primary">Nenhum direito de subscrição na custódia</h3>
            <p className="text-xs text-text-secondary max-w-sm mx-auto">
              Quando você receber avisos de subscrição das suas emissões, clique em &ldquo;Atribuir Direitos&rdquo; para registrar a custódia com custo contábil zero.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsAllocateOpen(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold bg-surface hover:bg-background text-action-primary border border-border-theme rounded-xl transition-all"
          >
            + Atribuir Direitos de Subscrição
          </button>
        </div>
      ) : (
        <div className="bg-surface border border-border-theme rounded-2xl overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-background/60 border-b border-border-theme text-text-secondary uppercase tracking-wider font-semibold">
                <tr>
                  <th className="px-4 py-3">Direito / Ativo</th>
                  <th className="px-4 py-3">Destino</th>
                  <th className="px-4 py-3 text-right">Preço Oferta</th>
                  <th className="px-4 py-3 text-right">Atribuído</th>
                  <th className="px-4 py-3 text-right">Exercido</th>
                  <th className="px-4 py-3 text-right">Saldo Disponível</th>
                  <th className="px-4 py-3">Vigência</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-theme">
                {subscriptions.map((item) => {
                  const isActionable =
                    item.projectedStatus === 'ACTIVE' ||
                    item.projectedStatus === 'PARTIALLY_EXERCISED';

                  return (
                    <tr
                      key={item.id}
                      className="hover:bg-background/40 transition-colors"
                      data-testid={`subscription-row-${item.id}`}
                    >
                      <td className="px-4 py-3">
                        <div className="font-bold text-text-primary text-sm">
                          {item.offer.rightAsset.ticker}
                        </div>
                        <div className="text-[11px] text-text-secondary truncate max-w-[150px]">
                          Origem: {item.offer.originAsset.ticker}
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        <span className="font-semibold text-text-primary">
                          {item.offer.targetAsset.ticker}
                        </span>
                      </td>

                      <td className="px-4 py-3 text-right font-medium tabular-nums text-positive-text whitespace-nowrap">
                        R$ {Number(item.offer.exercisePrice).toFixed(2)}
                      </td>

                      <td className="px-4 py-3 text-right text-text-secondary font-mono tabular-nums">
                        {Number(item.allocatedQuantity).toLocaleString('pt-BR')}
                      </td>

                      <td className="px-4 py-3 text-right text-text-secondary font-mono tabular-nums">
                        {Number(item.exercisedQuantity).toLocaleString('pt-BR')}
                      </td>

                      <td className="px-4 py-3 text-right font-bold text-action-primary font-mono tabular-nums" data-testid={`remaining-qty-${item.id}`}>
                        {Number(item.remainingQuantity).toLocaleString('pt-BR')}
                      </td>

                      <td className="px-4 py-3 text-text-secondary text-[11px] whitespace-nowrap">
                        <div>Até {new Date(item.offer.exerciseEndDate).toLocaleDateString('pt-BR')}</div>
                        <div className="text-[10px] text-text-secondary/70">Data-Com: {new Date(item.offer.cutOffDate).toLocaleDateString('pt-BR')}</div>
                      </td>

                      <td className="px-4 py-3 text-center">
                        <SubscriptionStatusBadge status={item.projectedStatus} />
                      </td>

                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {isActionable ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setExerciseTarget(item)}
                              className="px-2.5 py-1 text-xs font-semibold bg-action-primary/10 hover:bg-action-primary hover:text-action-primary-text text-action-primary border border-action-primary/30 rounded-lg transition-all"
                              data-testid={`exercise-btn-${item.id}`}
                            >
                              Exercer
                            </button>
                            <button
                              type="button"
                              onClick={() => setCancelTarget(item)}
                              className="px-2 py-1 text-xs font-medium text-text-secondary hover:text-negative-text hover:bg-negative-text/10 border border-transparent hover:border-negative-text/30 rounded-lg transition-all"
                              data-testid={`cancel-btn-${item.id}`}
                            >
                              Cancelar
                            </button>
                          </div>
                        ) : (
                          <span className="text-text-secondary/50 text-[11px]">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. Seção Colapsável de Ofertas Disponíveis */}
      {availableOffers.length > 0 && (
        <div className="pt-2">
          <button
            type="button"
            data-testid="toggle-available-offers-btn"
            onClick={() => setShowOffersSection((prev) => !prev)}
            className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary transition-colors"
          >
            <span>{showOffersSection ? '▼' : '▶'}</span>
            <span>Ofertas de Subscrição Disponíveis no Mercado ({availableOffers.length})</span>
          </button>

          {showOffersSection && (
            <div className="mt-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 animate-in fade-in duration-200">
              {availableOffers.map((offer) => (
                <div
                  key={offer.id}
                  className="bg-surface border border-border-theme rounded-xl p-3.5 space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-text-primary text-sm">{offer.rightAsset.ticker}</span>
                    <span className="text-positive-text font-semibold tabular-nums">
                      R$ {Number(offer.exercisePrice).toFixed(2)}
                    </span>
                  </div>
                  <div className="text-text-secondary text-[11px] leading-tight">
                    {offer.originAsset.name}
                  </div>
                  <div className="pt-1.5 border-t border-border-theme text-[11px] text-text-secondary flex justify-between">
                    <span>Destino: <strong>{offer.targetAsset.ticker}</strong></span>
                    <span>Vigência: <strong>{new Date(offer.exerciseEndDate).toLocaleDateString('pt-BR')}</strong></span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Modal de Atribuição */}
      <AllocateSubscriptionModal
        isOpen={isAllocateOpen}
        onClose={() => setIsAllocateOpen(false)}
        portfolioId={portfolioId}
        onSuccess={onRefresh}
      />

      {/* Modal de Exercício */}
      <ExerciseSubscriptionModal
        isOpen={Boolean(exerciseTarget)}
        onClose={() => setExerciseTarget(null)}
        subscription={exerciseTarget}
        onSuccess={onRefresh}
      />

      {/* Modal de Cancelamento */}
      <CancelSubscriptionModal
        isOpen={Boolean(cancelTarget)}
        onClose={() => setCancelTarget(null)}
        subscription={cancelTarget}
        onSuccess={onRefresh}
      />
    </div>
  );
}
