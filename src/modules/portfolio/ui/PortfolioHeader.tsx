'use client';

import { useState } from 'react';
import type { Portfolio } from '../domain/portfolio.types';
import { PortfolioModal } from './PortfolioModal';
import { deletePortfolioAction } from '../server/portfolio.actions';
import { useRouter } from 'next/navigation';

interface PortfolioHeaderProps {
  portfolio: Portfolio;
  eventsCount: number;
  onNewTransaction: () => void;
}

export function PortfolioHeader({
  portfolio,
  eventsCount,
  onNewTransaction,
}: PortfolioHeaderProps) {
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const router = useRouter();

  async function handleDelete() {
    setIsDeleting(true);
    try {
      const formData = new FormData();
      formData.set('id', portfolio.id);
      const res = await deletePortfolioAction(null, formData);
      if (res.success) {
        router.push('/portfolios');
      }
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <div className="bg-surface border border-border-theme rounded-2xl p-6 shadow-sm space-y-4 text-text-primary">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Title & Info */}
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1
              id="portfolio-title"
              className="text-2xl font-bold text-text-primary tracking-tight"
            >
              {portfolio.name}
            </h1>
            <span
              id="portfolio-currency-badge"
              className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-background text-text-secondary border border-border-theme font-mono"
            >
              {portfolio.baseCurrency}
            </span>
            {portfolio.status === 'archived' && (
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-300 border border-amber-500/30">
                Arquivada
              </span>
            )}
            {portfolio.status === 'frozen' && (
              <span
                id="portfolio-status-badge-frozen"
                className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/30"
              >
                Congelada (Somente Leitura)
              </span>
            )}
          </div>
          {portfolio.description && (
            <p
              id="portfolio-description-text"
              className="text-text-secondary text-sm max-w-2xl"
            >
              {portfolio.description}
            </p>
          )}
          <p className="text-xs text-text-secondary">
            {eventsCount === 1
              ? '1 operação registrada'
              : `${eventsCount} operações registradas`}
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            id="btn-edit-portfolio"
            type="button"
            onClick={() => setIsEditModalOpen(true)}
            className="px-3.5 py-2 text-xs font-semibold text-text-primary hover:bg-border-theme/40 bg-surface-elevated border border-border-theme rounded-xl transition-all"
          >
            ✏️ Editar Carteira
          </button>
          <button
            id="btn-delete-portfolio"
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="px-3.5 py-2 text-xs font-semibold text-negative-text hover:bg-negative-text/20 bg-negative-text/10 border border-negative-text/30 rounded-xl transition-all"
          >
            🗑️ Excluir
          </button>
          <button
            id="btn-new-transaction"
            type="button"
            disabled={portfolio.status === 'frozen'}
            onClick={onNewTransaction}
            title={portfolio.status === 'frozen' ? 'Operação não permitida: carteira congelada' : undefined}
            className={`px-4 py-2 text-xs font-semibold rounded-xl shadow-sm transition-all flex items-center gap-1.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-action-primary ${
              portfolio.status === 'frozen'
                ? 'text-text-secondary bg-surface border border-border-theme cursor-not-allowed opacity-50'
                : 'text-action-primary-text bg-action-primary hover:opacity-90'
            }`}
          >
            <span>+</span> Nova Operação
          </button>
        </div>
      </div>

      {/* Frozen Alert Banner */}
      {portfolio.status === 'frozen' && (
        <div
          id="portfolio-frozen-banner"
          role="alert"
          className="bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-400 text-xs sm:text-sm rounded-xl p-3.5 flex items-start gap-2.5"
        >
          <span className="text-base">⚠️</span>
          <div>
            <strong className="font-semibold block">Carteira Congelada (Somente Leitura)</strong>
            <span>
              Esta carteira está congelada devido ao limite de quota do seu plano atual. O histórico permanece protegido e disponível para consulta, mas novas operações e edições estão bloqueadas no servidor.
            </span>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      <PortfolioModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        portfolioToEdit={portfolio}
        onSuccess={() => router.refresh()}
      />

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm bg-surface-elevated border border-border-theme rounded-2xl p-6 space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-text-primary">Excluir Carteira</h3>
            <p className="text-sm text-text-secondary">
              Tem certeza que deseja excluir logicamente a carteira{' '}
              <strong className="text-text-primary">&quot;{portfolio.name}&quot;</strong>? O histórico
              permanecerá protegido na trilha de auditoria.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
                className="px-4 py-2 text-xs font-medium text-text-secondary hover:text-text-primary bg-background border border-border-theme rounded-lg"
              >
                Cancelar
              </button>
              <button
                id="btn-confirm-delete-portfolio"
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="px-4 py-2 text-xs font-semibold text-white bg-negative-text hover:opacity-90 disabled:opacity-50 rounded-lg"
              >
                {isDeleting ? 'Excluindo...' : 'Sim, Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
