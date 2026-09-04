import Link from 'next/link';
import type { DashboardPortfolioMetadata } from '../domain/dashboard.types';

interface DashboardContextBannerProps {
  selectedPortfolio: DashboardPortfolioMetadata;
  hasRealPortfolio: boolean;
}

export function DashboardContextBanner({
  selectedPortfolio,
  hasRealPortfolio,
}: DashboardContextBannerProps) {
  const isHypothetical =
    selectedPortfolio.purpose === 'ESTUDO' || selectedPortfolio.purpose === 'ANALISE';
  const isFrozen = selectedPortfolio.status === 'frozen';
  const isArchived = selectedPortfolio.status === 'archived';

  if (!isHypothetical && !isFrozen && !isArchived) {
    return null;
  }

  return (
    <div className="space-y-3" id="dashboard-context-banners">
      {/* Banner de Ambiente Hipotético (Estudo ou Análise) */}
      {isHypothetical && (
        <div
          id="dashboard-hypothetical-context-banner"
          className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm shadow-xs ${
            selectedPortfolio.purpose === 'ESTUDO'
              ? 'bg-blue-500/10 border-blue-500/30 text-blue-900 dark:text-blue-100'
              : 'bg-purple-500/10 border-purple-500/30 text-purple-900 dark:text-purple-100'
          }`}
          role="region"
          aria-label="Aviso de ambiente hipotético"
        >
          <div className="flex items-start gap-3">
            <span className="text-xl shrink-0" aria-hidden="true">
              {selectedPortfolio.purpose === 'ESTUDO' ? '📚' : '🔬'}
            </span>
            <div className="space-y-0.5">
              <p className="font-semibold text-text-primary">
                Ambiente de {selectedPortfolio.purpose === 'ESTUDO' ? 'Estudo' : 'Análise'}{' '}
                (Hipotético)
              </p>
              <p className="text-xs text-text-secondary leading-relaxed">
                Esta carteira é destinada a simulações, modelagem de teses e aprendizado. Suas
                operações e resultados <strong>não compõem o seu patrimônio real</strong> nem
                distorcem cálculos fiscais.
              </p>
              {!hasRealPortfolio && (
                <p className="text-xs font-medium text-amber-600 dark:text-amber-400 mt-1">
                  ⚠️ Você não possui uma carteira de Patrimônio Real ativa no momento.
                </p>
              )}
            </div>
          </div>

          {!hasRealPortfolio && (
            <Link
              id="dashboard-create-real-portfolio-btn"
              href="/portfolios"
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-action-primary-text bg-action-primary hover:bg-action-primary-hover rounded-lg transition-all shrink-0 self-start sm:self-auto"
            >
              <span>+</span> Criar Carteira Real
            </Link>
          )}
        </div>
      )}

      {/* Banner de Carteira Congelada por Quota */}
      {isFrozen && (
        <div
          id="dashboard-frozen-context-banner"
          className="p-3.5 rounded-xl border bg-amber-500/10 border-amber-500/30 text-amber-900 dark:text-amber-100 flex items-center justify-between gap-3 text-sm shadow-xs"
          role="region"
          aria-label="Aviso de carteira congelada"
        >
          <div className="flex items-center gap-2.5">
            <span className="text-lg" aria-hidden="true">
              ❄️
            </span>
            <p className="text-xs text-text-secondary">
              <strong className="text-amber-600 dark:text-amber-400">Carteira Congelada:</strong>{' '}
              Esta carteira está em modo <em>somente leitura</em> devido ao limite de carteiras ativas
              do seu plano atual.
            </p>
          </div>
          <Link
            id="dashboard-upgrade-plan-link"
            href="/plans"
            className="text-xs font-semibold text-action-primary hover:underline shrink-0"
          >
            Fazer Upgrade →
          </Link>
        </div>
      )}

      {/* Banner de Carteira Arquivada */}
      {isArchived && !isFrozen && (
        <div
          id="dashboard-archived-context-banner"
          className="p-3.5 rounded-xl border bg-surface border-border-theme text-text-secondary flex items-center gap-2.5 text-sm shadow-xs"
          role="region"
          aria-label="Aviso de carteira arquivada"
        >
          <span className="text-lg" aria-hidden="true">
            📦
          </span>
          <p className="text-xs">
            <strong className="text-text-primary">Carteira Arquivada:</strong> Esta carteira está
            arquivada para consulta histórica. Novas operações estão bloqueadas.
          </p>
        </div>
      )}
    </div>
  );
}
