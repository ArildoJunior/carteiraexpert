'use client';

import { useState } from 'react';
import type { Portfolio } from '../domain/portfolio.types';
import type { PortfolioEvent } from '../domain/portfolio-event.types';
import type { Asset } from '../domain/asset.types';
import type { SerializedPortfolioPositionsSummary } from '../domain/position.types';
import type { SerializedPortfolioEvolutionSummary } from '../domain/portfolio-evolution.types';
import type { UserChartPreferencesMap } from '../domain/chart-preferences.types';
import type { SerializedCashSummary, SerializedCashTransaction } from '../domain/cash.types';
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
import { CashSummaryCard } from './CashSummaryCard';
import { CashTransactionList } from './CashTransactionList';
import { CashTransactionModal } from './CashTransactionModal';
import { useRouter } from 'next/navigation';

interface PortfolioDetailViewProps {
  portfolio: Portfolio;
  events: PortfolioEvent[];
  assetsMap: Record<string, Asset>;
  positionsSummary: SerializedPortfolioPositionsSummary;
  evolutionSummary?: SerializedPortfolioEvolutionSummary;
  subscriptions?: SubscriptionRightWithOfferAndAssets[];
  availableOffers?: SubscriptionOfferWithAssets[];
  chartPreferences?: UserChartPreferencesMap;
  cashSummary?: SerializedCashSummary;
  cashTransactions?: SerializedCashTransaction[];
}

export function PortfolioDetailView({
  portfolio,
  events,
  assetsMap,
  positionsSummary,
  evolutionSummary,
  subscriptions = [],
  availableOffers = [],
  chartPreferences,
  cashSummary,
  cashTransactions = [],
}: PortfolioDetailViewProps) {
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
  const [eventToCancel, setEventToCancel] = useState<PortfolioEvent | null>(null);

  // Estados para modal de caixa
  const [isCashModalOpen, setIsCashModalOpen] = useState(false);
  const [cashModalMode, setCashModalMode] = useState<'DEPOSIT' | 'WITHDRAWAL' | 'NEW_ACCOUNT'>('DEPOSIT');
  const [selectedCashAccountId, setSelectedCashAccountId] = useState<string | undefined>(undefined);

  const router = useRouter();

  function handleOpenDeposit(accountId?: string) {
    setSelectedCashAccountId(accountId);
    setCashModalMode('DEPOSIT');
    setIsCashModalOpen(true);
  }

  function handleOpenWithdraw(accountId?: string) {
    setSelectedCashAccountId(accountId);
    setCashModalMode('WITHDRAWAL');
    setIsCashModalOpen(true);
  }

  function handleOpenNewAccount() {
    setCashModalMode('NEW_ACCOUNT');
    setIsCashModalOpen(true);
  }

  return (
    <div className="space-y-8">
      {/* 1. Header com ações de carteira */}
      <PortfolioHeader
        portfolio={portfolio}
        eventsCount={events.length}
        onNewTransaction={() => setIsTransactionModalOpen(true)}
      />

      {/* 2. Bloco de Caixa e Saldo Disponível */}
      {cashSummary && (
        <CashSummaryCard
          portfolioId={portfolio.id}
          cashSummary={cashSummary}
          portfolioStatus={portfolio.status}
          onOpenDeposit={handleOpenDeposit}
          onOpenWithdraw={handleOpenWithdraw}
          onOpenNewAccount={handleOpenNewAccount}
        />
      )}

      {/* 3. Bloco de Posições Consolidadas em Custódia */}
      <PositionTable
        summary={positionsSummary}
        baseCurrency={portfolio.baseCurrency}
      />

      {/* 4. Bloco de Gráficos de Evolução Patrimonial Histórica */}
      {evolutionSummary && (
        <PortfolioEvolutionChart
          initialSummary={evolutionSummary}
          initialPreference={chartPreferences?.portfolio_evolution}
        />
      )}

      {/* 5. Bloco de Gráficos de Alocação e Composição Patrimonial */}
      {positionsSummary.positions.length > 0 && (
        <PortfolioAllocationCharts
          positions={positionsSummary.positions}
          baseCurrency={portfolio.baseCurrency}
          initialPreference={chartPreferences?.portfolio_allocation}
        />
      )}

      {/* 6. Bloco de Direitos de Subscrição Segregados */}
      <SubscriptionPanel
        portfolioId={portfolio.id}
        subscriptions={subscriptions}
        availableOffers={availableOffers}
        onRefresh={() => router.refresh()}
      />

      {/* 7. Bloco de Extrato de Movimentações de Caixa */}
      {cashSummary && (
        <div className="space-y-3" id="cash-transactions-section">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-text-primary tracking-tight">
              Movimentações de Caixa
            </h2>
            <span className="text-xs text-text-secondary">
              {cashTransactions.length} {cashTransactions.length === 1 ? 'registro' : 'registros'}
            </span>
          </div>

          <CashTransactionList
            transactions={cashTransactions}
            currency={portfolio.baseCurrency}
            isFrozen={portfolio.status === 'frozen'}
          />
        </div>
      )}

      {/* 8. Bloco de Extrato de Operações Registradas */}
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

      {/* Modal de Nova Operação com Ativo */}
      <TransactionModal
        isOpen={isTransactionModalOpen}
        onClose={() => setIsTransactionModalOpen(false)}
        portfolioId={portfolio.id}
        onSuccess={() => router.refresh()}
      />

      {/* Modal de Cancelamento de Operação com Ativo */}
      <CancelEventModal
        isOpen={Boolean(eventToCancel)}
        onClose={() => setEventToCancel(null)}
        eventToCancel={eventToCancel}
        onSuccess={() => router.refresh()}
      />

      {/* Modal de Transação de Caixa */}
      {cashSummary && (
        <CashTransactionModal
          portfolioId={portfolio.id}
          accounts={cashSummary.accounts}
          initialAccountId={selectedCashAccountId}
          initialMode={cashModalMode}
          isOpen={isCashModalOpen}
          onClose={() => setIsCashModalOpen(false)}
          onSuccess={() => router.refresh()}
        />
      )}
    </div>
  );
}
