'use client';

import { useState } from 'react';
import type { Portfolio } from '../domain/portfolio.types';
import type { PortfolioEvent } from '../domain/portfolio-event.types';
import type { Asset } from '../domain/asset.types';
import { PortfolioHeader } from './PortfolioHeader';
import { PortfolioEventTable } from './PortfolioEventTable';
import { TransactionModal } from './TransactionModal';
import { CancelEventModal } from './CancelEventModal';
import { useRouter } from 'next/navigation';

interface PortfolioDetailViewProps {
  portfolio: Portfolio;
  events: PortfolioEvent[];
  assetsMap: Record<string, Asset>;
}

export function PortfolioDetailView({
  portfolio,
  events,
  assetsMap,
}: PortfolioDetailViewProps) {
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
  const [eventToCancel, setEventToCancel] = useState<PortfolioEvent | null>(null);
  const router = useRouter();

  return (
    <div className="space-y-6">
      {/* Header com ações de carteira */}
      <PortfolioHeader
        portfolio={portfolio}
        eventsCount={events.length}
        onNewTransaction={() => setIsTransactionModalOpen(true)}
      />

      {/* Tabela de Operações Registradas */}
      <div className="space-y-3">
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
