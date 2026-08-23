'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Portfolio } from '../domain/portfolio.types';
import { PortfolioModal } from './PortfolioModal';
import { useRouter } from 'next/navigation';

interface PortfolioListProps {
  portfolios: Portfolio[];
}

export function PortfolioList({ portfolios }: PortfolioListProps) {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const router = useRouter();

  return (
    <div className="space-y-6">
      {/* Top action bar */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">
            Minhas Carteiras
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Gerencie suas carteiras e registre suas operações patrimoniais.
          </p>
        </div>
        <button
          id="btn-create-portfolio"
          type="button"
          onClick={() => setIsCreateModalOpen(true)}
          className="px-4 py-2.5 text-sm font-semibold text-action-primary-text bg-action-primary hover:opacity-90 rounded-xl shadow-sm transition-all flex items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-action-primary"
        >
          <span>+</span> Nova Carteira
        </button>
      </div>

      {/* Grid of portfolios */}
      {portfolios.length === 0 ? (
        <div
          id="empty-portfolios-state"
          className="bg-surface border border-border-theme rounded-2xl p-12 text-center space-y-4 shadow-sm"
        >
          <div className="w-14 h-14 rounded-2xl bg-action-primary/10 border border-action-primary/20 flex items-center justify-center mx-auto text-2xl">
            💼
          </div>
          <div className="space-y-1">
            <h3 className="text-lg font-semibold text-text-primary">
              Nenhuma carteira cadastrada
            </h3>
            <p className="text-sm text-text-secondary max-w-md mx-auto">
              Você ainda não possui nenhuma carteira. Crie sua primeira carteira
              para começar a registrar suas compras e vendas.
            </p>
          </div>
          <button
            id="create-first-portfolio-btn"
            type="button"
            onClick={() => setIsCreateModalOpen(true)}
            className="px-5 py-2.5 text-sm font-semibold text-action-primary-text bg-action-primary hover:opacity-90 rounded-xl shadow-sm transition-all inline-flex items-center gap-2"
          >
            <span>+</span> Criar Minha Primeira Carteira
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {portfolios.map((portfolio) => (
            <Link
              key={portfolio.id}
              id={`portfolio-card-${portfolio.id}`}
              href={`/portfolios/${portfolio.id}`}
              className="group bg-surface border border-border-theme hover:border-action-primary/50 rounded-2xl p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 flex flex-col justify-between"
            >
              <div className="space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <h3
                    id={`portfolio-name-${portfolio.id}`}
                    className="text-lg font-bold text-text-primary group-hover:text-action-primary transition-colors line-clamp-1"
                  >
                    {portfolio.name}
                  </h3>
                  <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-md bg-background text-text-secondary border border-border-theme">
                    {portfolio.baseCurrency}
                  </span>
                </div>

                {portfolio.description ? (
                  <p className="text-xs text-text-secondary line-clamp-2">
                    {portfolio.description}
                  </p>
                ) : (
                  <p className="text-xs text-text-secondary/50 italic">
                    Sem descrição informada
                  </p>
                )}
              </div>

              <div className="pt-4 mt-4 border-t border-border-theme flex items-center justify-between text-xs text-text-secondary">
                <span className="capitalize">
                  Status: {portfolio.status === 'active' ? 'Ativa' : 'Arquivada'}
                </span>
                <span className="font-semibold text-action-primary group-hover:translate-x-0.5 transition-transform">
                  Ver operações →
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Modal de criação */}
      <PortfolioModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={() => router.refresh()}
      />
    </div>
  );
}
