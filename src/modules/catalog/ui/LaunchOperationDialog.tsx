'use client';

import { useState } from 'react';
import { TransactionModal } from '@/modules/portfolio/ui/TransactionModal';
import type { Asset } from '@/modules/portfolio/domain/asset.types';

export interface UserPortfolioItem {
  id: string;
  name: string;
  baseCurrency: string;
  status: string;
}

interface LaunchOperationDialogProps {
  asset: {
    id: string;
    ticker: string;
    name: string;
    assetType: string;
    market: string;
    currency: string;
  };
  userPortfolios: UserPortfolioItem[];
  isAuthenticated: boolean;
  callbackUrl: string;
}

export function LaunchOperationDialog({
  asset,
  userPortfolios,
  isAuthenticated,
  callbackUrl,
}: LaunchOperationDialogProps) {
  const [isSelectPortfolioOpen, setIsSelectPortfolioOpen] = useState(false);
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<string>(
    userPortfolios[0]?.id ?? ''
  );
  const [isTransactionModalOpen, setIsTransactionModalOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Se não autenticado, redireciona para login com retorno seguro
  if (!isAuthenticated) {
    return (
      <a
        id="btn-launch-operation-unauth"
        href={`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`}
        className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-action-primary text-action-primary-text font-medium text-sm hover:opacity-90 transition-opacity shadow-sm"
      >
        <span>Lançar em Carteira</span>
      </a>
    );
  }

  const activePortfolios = userPortfolios.filter((p) => p.status === 'active');

  const assetForModal: Asset = {
    id: asset.id,
    ticker: asset.ticker,
    name: asset.name,
    assetType: asset.assetType as any,
    market: asset.market as any,
    currency: asset.currency,
    isCustom: false,
    userId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  return (
    <>
      <button
        id="btn-open-launch-dialog"
        type="button"
        onClick={() => {
          setSuccessMessage(null);
          setIsSelectPortfolioOpen(true);
        }}
        className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-action-primary text-action-primary-text font-medium text-sm hover:opacity-90 transition-opacity shadow-sm"
      >
        <span>Lançar em Carteira</span>
      </button>

      {successMessage && (
        <div
          id="launch-success-banner"
          className="mt-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-sm flex items-center justify-between"
        >
          <span>{successMessage}</span>
          <button
            type="button"
            onClick={() => setSuccessMessage(null)}
            className="text-xs text-text-muted hover:text-text-primary ml-2"
          >
            Fechar
          </button>
        </div>
      )}

      {/* Modal de Seleção de Carteira */}
      {isSelectPortfolioOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-surface border border-border-theme rounded-xl shadow-xl max-w-md w-full p-6 text-text-primary">
            <h3 className="text-lg font-semibold text-text-primary">
              Lançar {asset.ticker} em Carteira
            </h3>
            <p className="text-sm text-text-secondary mt-1">
              Selecione a carteira de destino para abrir o formulário de operação.
            </p>

            {activePortfolios.length === 0 ? (
              <div className="my-6 p-4 rounded-lg bg-surface-elevated border border-border-theme text-center">
                <p className="text-sm text-text-secondary">
                  Você ainda não possui carteiras ativas disponíveis.
                </p>
                <a
                  href="/portfolios"
                  className="mt-3 inline-block text-sm font-medium text-action-primary hover:underline"
                >
                  Criar uma carteira agora &rarr;
                </a>
              </div>
            ) : (
              <div className="my-5 space-y-3">
                <label className="block text-xs font-semibold text-text-secondary uppercase tracking-wider">
                  Carteira de Destino
                </label>
                <select
                  id="select-portfolio-for-launch"
                  value={selectedPortfolioId}
                  onChange={(e) => setSelectedPortfolioId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-border-theme bg-surface-elevated text-text-primary text-sm focus:outline-none focus:ring-2 focus:ring-action-primary/30"
                >
                  {activePortfolios.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.baseCurrency})
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-border-theme">
              <button
                type="button"
                onClick={() => setIsSelectPortfolioOpen(false)}
                className="px-4 py-2 rounded-lg text-sm text-text-secondary hover:text-text-primary hover:bg-surface-elevated transition-colors"
              >
                Cancelar
              </button>
              {activePortfolios.length > 0 && (
                <button
                  id="btn-confirm-portfolio-and-open-form"
                  type="button"
                  onClick={() => {
                    setIsSelectPortfolioOpen(false);
                    setIsTransactionModalOpen(true);
                  }}
                  className="px-4 py-2 rounded-lg text-sm bg-action-primary text-action-primary-text font-medium hover:opacity-90 transition-opacity"
                >
                  Continuar para Lançamento
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Padrão de Transação Reutilizado com o ativo pré-selecionado */}
      {isTransactionModalOpen && selectedPortfolioId && (
        <TransactionModal
          isOpen={isTransactionModalOpen}
          portfolioId={selectedPortfolioId}
          initialAsset={assetForModal}
          onClose={() => setIsTransactionModalOpen(false)}
          onSuccess={() => {
            setIsTransactionModalOpen(false);
            setSuccessMessage(`Operação com ${asset.ticker} registrada com sucesso na carteira!`);
          }}
        />
      )}
    </>
  );
}
