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
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Title & Info */}
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <h1
              id="portfolio-title"
              className="text-2xl font-bold text-white tracking-tight"
            >
              {portfolio.name}
            </h1>
            <span
              id="portfolio-currency-badge"
              className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700 font-mono"
            >
              {portfolio.baseCurrency}
            </span>
            {portfolio.status === 'archived' && (
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-950/80 text-amber-400 border border-amber-800">
                Arquivada
              </span>
            )}
          </div>
          {portfolio.description && (
            <p
              id="portfolio-description-text"
              className="text-slate-400 text-sm max-w-2xl"
            >
              {portfolio.description}
            </p>
          )}
          <p className="text-xs text-slate-500">
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
            className="px-3.5 py-2 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl transition-all"
          >
            ✏️ Editar Carteira
          </button>
          <button
            id="btn-delete-portfolio"
            type="button"
            onClick={() => setShowDeleteConfirm(true)}
            className="px-3.5 py-2 text-xs font-semibold text-red-400 hover:text-red-300 bg-red-950/30 hover:bg-red-950/60 border border-red-900/50 rounded-xl transition-all"
          >
            🗑️ Excluir
          </button>
          <button
            id="btn-new-transaction"
            type="button"
            onClick={onNewTransaction}
            className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl shadow-sm transition-all flex items-center gap-1.5"
          >
            <span>+</span> Nova Operação
          </button>
        </div>
      </div>

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
          <div className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-2xl p-6 space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-white">Excluir Carteira</h3>
            <p className="text-sm text-slate-400">
              Tem certeza que deseja excluir logicamente a carteira{' '}
              <strong className="text-white">&quot;{portfolio.name}&quot;</strong>? O histórico
              permanecerá protegido na trilha de auditoria.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={isDeleting}
                className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white bg-slate-800 rounded-lg"
              >
                Cancelar
              </button>
              <button
                id="btn-confirm-delete-portfolio"
                type="button"
                onClick={handleDelete}
                disabled={isDeleting}
                className="px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-500 disabled:bg-red-950 rounded-lg"
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
