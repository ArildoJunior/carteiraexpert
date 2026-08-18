'use client';

import { useState } from 'react';
import type { Portfolio } from '../domain/portfolio.types';
import type { PortfolioEvent } from '../domain/portfolio-event.types';
import type { Asset } from '../domain/asset.types';
import type { SerializedPortfolioPositionsSummary } from '../domain/position.types';
import type {
  SubscriptionRightWithOfferAndAssets,
  SubscriptionOfferWithAssets,
} from '@/modules/corporate-actions/server/subscription.service';
import { PortfolioHeader } from './PortfolioHeader';
import { PositionTable } from './PositionTable';
import { PortfolioAllocationCharts } from './PortfolioAllocationCharts';
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
  subscriptions?: SubscriptionRightWithOfferAndAssets[];
  availableOffers?: SubscriptionOfferWithAssets[];
}

export function PortfolioDetailView({
  portfolio,
  events,
  assetsMap,
  positionsSummary,
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

      {/* 3. Bloco de Gráficos de Alocação e Composição Patrimonial */}
      {positionsSummary.positions.length > 0 && (
        <PortfolioAllocationCharts
          positions={positionsSummary.positions}
          baseCurrency={portfolio.baseCurrency}
        />
      )}

      {/* 4. Bloco de Direitos de Subscrição Segregados */}
      <SubscriptionPanel
        portfolioId={portfolio.id}
        subscriptions={subscriptions}
        availableOffers={availableOffers}
        onRefresh={() => router.refresh()}
      />

      {/* 4. Bloco de Extrato de Operações Registradas */}
      <div className="space-y-3" id="portfolio-events-section">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white tracking-tight">
            Extrato de Operações
          </h2>
          <span className="text-xs text-slate-400">
            {events.length} {events.length === 1 ? 'registro' : 'registros'}
          </span>
        </div>

        <PortfolioEventTable
          events={events}
          assetsMap={assetsMap}
          onCancelEvent={(event) => setEventToCancel(event)}
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
