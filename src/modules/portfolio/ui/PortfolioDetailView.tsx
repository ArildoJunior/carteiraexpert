'use client';

import { useState } from 'react';
import type { Portfolio } from '../domain/portfolio.types';
import type { PortfolioEvent } from '../domain/portfolio-event.types';
import type { Asset } from '../domain/asset.types';
import type { SerializedPortfolioPositionsSummary } from '../domain/position.types';
import type { SerializedPortfolioEvolutionSummary } from '../domain/portfolio-evolution.types';
import type {
  SubscriptionRightWithOfferAndAssets,
  SubscriptionOfferWithAssets,
} from '@/modules/corporate-actions/server/subscription.service';
import { PortfolioHeader } from './PortfolioHeader';
import { PositionTable } from './PositionTable';
import { PortfolioAllocationCharts } from './PortfolioAllocationCharts';
import { PortfolioEvolutionChart } from './PortfolioEvolutionChart';
import { PortfolioEventTable } from './PortfolioEventTable';
import { SubscriptionPanel } from '@/modules/corporate-actions/ui/SubscriptionPanel';
import { TransactionModal } from './TransactionModal';
import { CancelEventModal } from './CancelEventModal';
import { useRouter } from 'next/navigation';

interface PortfolioDetailViewProps {
  portfolio: Portfolio;
  events: PortfolioEvent[];
  assetsMap: Record<string, Asset>;
  positionsSummary: SerializedPortfolioPositionsSummary;
  evolutionSummary?: SerializedPortfolioEvolutionSummary;
  subscriptions?: SubscriptionRightWithOfferAndAssets[];
  availableOffers?: SubscriptionOfferWithAssets[];
}

export function PortfolioDetailView({
  portfolio,
  events,
  assetsMap,
  positionsSummary,
  evolutionSummary,
  subscriptions = [],
  availableOffers = [],
}: PortfolioDetailViewProps) {
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
  const [eventToCancel, setEventToCancel] = useState<PortfolioEvent | null>(null);
  const router = useRouter();

  return (
    <div className="space-y-8">
      {/* 1. Header com ações de carteira */}
      <PortfolioHeader
        portfolio={portfolio}
        eventsCount={events.length}
        onNewTransaction={() => setIsTransactionModalOpen(true)}
      />

      {/* 2. Bloco de Posições Consolidadas em Custódia */}
      <PositionTable
        summary={positionsSummary}
        baseCurrency={portfolio.baseCurrency}
      />

      {/* 3. Bloco de Gráficos de Evolução Patrimonial Histórica */}
      {evolutionSummary && (positionsSummary.positions.length > 0 || events.length > 0) && (
        <PortfolioEvolutionChart initialSummary={evolutionSummary} />
      )}

      {/* 4. Bloco de Gráficos de Alocação e Composição Patrimonial */}
      {positionsSummary.positions.length > 0 && (
        <PortfolioAllocationCharts
          positions={positionsSummary.positions}
          baseCurrency={portfolio.baseCurrency}
        />
      )}

      {/* 5. Bloco de Direitos de Subscrição Segregados */}
      <SubscriptionPanel
        portfolioId={portfolio.id}
        subscriptions={subscriptions}
        availableOffers={availableOffers}
        onRefresh={() => router.refresh()}
      />

      {/* 6. Bloco de Extrato de Operações Registradas */}
      <div className="space-y-3" id="portfolio-events-section">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-text-primary tracking-tight">
            Extrato de Operações
          </h2>
          <span className="text-xs text-text-secondary">
            {events.length} {events.length === 1 ? 'registro' : 'registros'}
          </span>
        </div>

        <PortfolioEventTable
          events={events}
          assetsMap={assetsMap}
          onCancelEvent={(event) => setEventToCancel(event)}
          isFrozen={portfolio.status === 'frozen'}
        />
      </div>

      {/* Modal de Nova Operação */}
      <TransactionModal
        isOpen={isTransactionModalOpen}
        onClose={() => setIsTransactionModalOpen(false)}
        portfolioId={portfolio.id}
        onSuccess={() => router.refresh()}
      />

      {/* Modal de Cancelamento de Operação */}
      <CancelEventModal
        isOpen={Boolean(eventToCancel)}
        onClose={() => setEventToCancel(null)}
        eventToCancel={eventToCancel}
        onSuccess={() => router.refresh()}
      />
    </div>
  );
}
