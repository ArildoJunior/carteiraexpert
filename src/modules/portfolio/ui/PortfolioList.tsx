'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Portfolio } from '../domain/portfolio.types';
import type { PlanQuotaSummary } from '@/modules/plans/domain/plan.types';
import type { UserBillingSummary } from '@/modules/billing/domain/billing.types';
import { PortfolioModal } from './PortfolioModal';
import { useRouter } from 'next/navigation';

interface PortfolioListProps {
  portfolios: Portfolio[];
  quotaSummary?: PlanQuotaSummary;
  billingSummary?: UserBillingSummary;
}

export function PortfolioList({ portfolios, quotaSummary, billingSummary }: PortfolioListProps) {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const router = useRouter();

  const canCreate = quotaSummary ? quotaSummary.canCreateMore : true;
  const hasExistingRealPortfolio = portfolios.some((p) => p.purpose === 'REAL');

  return (
    <div className="space-y-6">
      {/* Top action bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-text-primary tracking-tight">
              Minhas Carteiras
            </h1>
            {quotaSummary && (
              <span
                id="plan-quota-badge"
                className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-surface-elevated text-text-secondary border border-border-theme"
              >
                {quotaSummary.planName}: {quotaSummary.activePortfoliosCount}/{quotaSummary.maxActivePortfolios ?? 'A definir'} ativas
                {quotaSummary.frozenPortfoliosCount > 0 && ` • ${quotaSummary.frozenPortfoliosCount} congelada${quotaSummary.frozenPortfoliosCount > 1 ? 's' : ''}`}
              </span>
            )}
          </div>
          <p className="text-sm text-text-secondary mt-1">
            Gerencie suas carteiras e registre suas operações patrimoniais.
          </p>
        </div>
        <button
          id="btn-create-portfolio"
          type="button"
          disabled={!canCreate}
          onClick={() => setIsCreateModalOpen(true)}
          title={!canCreate ? 'Limite de carteiras ativas para o plano atingido.' : undefined}
          className={`px-4 py-2.5 text-sm font-semibold rounded-xl shadow-sm transition-all flex items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-action-primary ${
            canCreate
              ? 'text-action-primary-text bg-action-primary hover:opacity-90'
              : 'text-text-secondary bg-surface border border-border-theme cursor-not-allowed opacity-60'
          }`}
        >
          <span>+</span> Nova Carteira
        </button>
      </div>

      {/* Seção Informativa de Plano e Assinatura */}
      {billingSummary && (
        <div
          id="billing-summary-card"
          className="bg-surface border border-border-theme rounded-xl p-4 text-xs text-text-secondary flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm"
        >
          <div className="flex items-center gap-2.5">
            <span className="text-base">💳</span>
            <div>
              <span className="font-medium text-text-primary">
                Plano Atual: <strong className="text-action-primary font-semibold">{billingSummary.effectivePlanName}</strong>
              </span>
              {billingSummary.hasSubscription && billingSummary.subscription && (
                <span className="ml-2 font-mono text-[11px] px-2 py-0.5 rounded bg-surface-elevated border border-border-theme">
                  Status: {billingSummary.status === 'active' ? 'Ativa' : billingSummary.status === 'past_due' ? 'Em atraso' : billingSummary.status}
                  {billingSummary.subscription.billingCycle && ` • ${billingSummary.subscription.billingCycle === 'monthly' ? 'Mensal' : 'Anual'}`}
                </span>
              )}
              <p className="text-[11px] text-text-secondary/80 mt-0.5">
                Estrutura de assinaturas comerciais gerenciada internamente. Integração de pagamentos com cartão/Pix em desenvolvimento.
              </p>
            </div>
          </div>
          <Link
            id="link-view-plans"
            href="/plans"
            className="text-xs font-semibold text-action-primary hover:underline flex items-center gap-1 shrink-0"
          >
            Ver Planos e Quotas →
          </Link>
        </div>
      )}


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
              para começar a acompanhar seus ativos e transações.
            </p>
          </div>
          <button
            id="create-first-portfolio-btn"
            type="button"
            disabled={!canCreate}
            onClick={() => setIsCreateModalOpen(true)}
            className="px-5 py-2.5 text-sm font-semibold rounded-xl text-action-primary-text bg-action-primary hover:opacity-90 shadow-sm transition-all inline-flex items-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-action-primary"
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
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span
                      id={`portfolio-purpose-${portfolio.id}`}
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${
                        portfolio.purpose === 'REAL'
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                          : portfolio.purpose === 'ESTUDO'
                            ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30'
                            : 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30'
                      }`}
                    >
                      {portfolio.purpose === 'REAL' ? 'Real' : portfolio.purpose === 'ESTUDO' ? 'Estudo' : 'Análise'}
                    </span>
                    <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-md bg-background text-text-secondary border border-border-theme">
                      {portfolio.baseCurrency}
                    </span>
                  </div>
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
                <span>
                  Status:{' '}
                  {portfolio.status === 'active' ? (
                    <span className="font-semibold text-positive-text">Ativa</span>
                  ) : portfolio.status === 'frozen' ? (
                    <span className="font-semibold text-amber-500">Congelada</span>
                  ) : (
                    <span className="font-semibold text-text-secondary">Arquivada</span>
                  )}
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
        hasExistingRealPortfolio={hasExistingRealPortfolio}
        onSuccess={() => router.refresh()}
      />
    </div>
  );
}
