import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '@/modules/identity/server/current-user';
import { getSerializedUserDashboardData } from '@/modules/portfolio/server/dashboard.service';
import { getUserChartPreferences } from '@/modules/portfolio/server/chart-preferences.service';
import { DashboardMetricsCards } from '@/modules/portfolio/ui/DashboardMetricsCards';
import { DashboardAllocationCharts } from '@/modules/portfolio/ui/DashboardAllocationCharts';
import { RecentActivityFeed } from '@/modules/portfolio/ui/RecentActivityFeed';
import { DashboardContextSelector } from '@/modules/portfolio/ui/DashboardContextSelector';
import { DashboardContextBanner } from '@/modules/portfolio/ui/DashboardContextBanner';
import { PortfolioNotFoundError } from '@/modules/portfolio/domain/errors';
import { AuthorizationError } from '@/modules/identity/domain/errors';
import { Decimal } from '@/lib/decimal';

export const metadata: Metadata = {
  title: 'Dashboard — CarteiraExpert',
  description: 'Visão geral patrimonial da carteira selecionada.',
};

function formatMoney(value: string | Decimal, currency = 'BRL'): string {
  try {
    const dec = value instanceof Decimal ? value : new Decimal(value || '0');
    const [intPart, fracPart = '00'] = dec.toFixed(2).split('.');
    const formattedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const symbol = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : 'R$';
    return `${symbol} ${formattedInt},${fracPart}`;
  } catch {
    return 'R$ 0,00';
  }
}

interface DashboardPageProps {
  searchParams?: Promise<{ portfolioId?: string }>;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const { portfolioId } = (await searchParams) || {};

  let data;
  try {
    data = await getSerializedUserDashboardData(user, { portfolioId });
  } catch (err) {
    if (err instanceof PortfolioNotFoundError || err instanceof AuthorizationError) {
      notFound();
    }
    throw err;
  }

  const chartPreferences = await getUserChartPreferences(user);
  const hasRealPortfolio = data.availablePortfolios.some((p) => p.purpose === 'REAL');

  return (
    <div className="space-y-6 text-text-primary" id="dashboard-page-container">
      {/* ─── Header da Página ────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-border-theme/40">
        <div className="space-y-1">
          <h1 className="text-2xl sm:text-3xl font-bold text-text-primary tracking-tight">
            Olá, {user.name.split(' ')[0]} 👋
          </h1>
          <p className="text-text-secondary text-sm">
            Visão patrimonial da sua carteira selecionada e histórico de operações.
          </p>
        </div>

        <Link
          id="dashboard-new-portfolio-btn"
          href="/portfolios"
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-action-primary-text bg-action-primary hover:bg-action-primary-hover active:scale-[0.98] rounded-xl shadow-xs transition-all self-start sm:self-auto focus:outline-none focus-visible:ring-2 focus-visible:ring-action-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        >
          <svg
            className="w-4 h-4 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
            />
          </svg>
          <span>Gerenciar Carteiras</span>
        </Link>
      </div>

      {/* ─── Seletor de Contexto da Carteira ──────────────────────────────── */}
      {data.selectedPortfolio && (
        <div className="space-y-3">
          <DashboardContextSelector
            selectedPortfolio={data.selectedPortfolio}
            availablePortfolios={data.availablePortfolios}
          />
          <DashboardContextBanner
            selectedPortfolio={data.selectedPortfolio}
            hasRealPortfolio={hasRealPortfolio}
          />
        </div>
      )}

      {/* ─── Cards de Resumo Financeiro da Carteira ────────────────────────── */}
      <DashboardMetricsCards
        currencyGroups={data.currencyGroups}
        totalActivePortfolios={data.totalActivePortfolios}
      />

      {/* ─── Gráficos de Alocação da Carteira ──────────────────────────────── */}
      {data.totalActivePositions > 0 && (
        <DashboardAllocationCharts
          portfolioSummaries={data.portfolioSummaries}
          initialPreference={chartPreferences.dashboard_allocation}
        />
      )}

      {/* ─── Seção Minhas Carteiras ────────────────────────────────────────── */}
      <div className="space-y-4" id="dashboard-portfolios-section">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <h2 className="text-lg font-bold text-text-primary tracking-tight">
              Minhas Carteiras
            </h2>
            <p className="text-xs text-text-secondary">
              Carteiras ativas cadastradas na plataforma.
            </p>
          </div>
          <Link
            id="dashboard-view-all-portfolios-link"
            href="/portfolios"
            className="text-xs font-semibold text-action-primary hover:text-action-primary-hover hover:underline transition-colors inline-flex items-center gap-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-action-primary rounded-md px-1.5 py-0.5"
          >
            Ver todas ({data.totalActivePortfolios}) →
          </Link>
        </div>

        {data.totalActivePortfolios === 0 ? (
          <div
            id="empty-portfolios-state"
            className="bg-surface border border-border-theme rounded-2xl p-8 sm:p-10 text-center space-y-4 shadow-xs"
          >
            <div className="w-12 h-12 rounded-2xl bg-surface-elevated border border-border-theme flex items-center justify-center text-text-secondary mx-auto shadow-xs">
              <svg
                className="w-6 h-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="1.5"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                />
              </svg>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-text-primary">
                Você ainda não possui carteiras cadastradas.
              </p>
              <p className="text-xs text-text-secondary max-w-sm mx-auto">
                Crie sua primeira carteira para começar a consolidar posições, aportes e proventos.
              </p>
            </div>
            <Link
              href="/portfolios"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-action-primary hover:text-action-primary-hover hover:underline transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-action-primary rounded-md px-2 py-1"
            >
              Criar minha primeira carteira →
            </Link>
          </div>
        ) : (
          <div
            id="dashboard-portfolios-grid"
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
          >
            {data.portfolioSummaries.map((p) => {
              const activeAssetsCount = p.summary.positions.length;
              const decPnL = new Decimal(p.summary.totalRealizedPnL || '0');
              const isPositivePnL = decPnL.greaterThan(0);
              const isNegativePnL = decPnL.lessThan(0);

              return (
                <Link
                  key={p.portfolioId}
                  id={`dashboard-portfolio-card-${p.portfolioId}`}
                  href={`/portfolios/${p.portfolioId}`}
                  className="bg-surface border border-border-theme hover:border-action-primary/60 rounded-2xl p-5 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md space-y-4 block shadow-xs group focus:outline-none focus-visible:ring-2 focus-visible:ring-action-primary"
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-bold text-text-primary text-base truncate group-hover:text-action-primary transition-colors">
                      {p.portfolioName}
                    </h3>
                    <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full bg-surface-elevated text-text-secondary border border-border-theme shrink-0">
                      {p.baseCurrency}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-3 border-t border-border-theme/60 text-xs">
                    <div>
                      <p className="text-[10px] text-text-secondary uppercase font-semibold tracking-wider">
                        Em Custódia
                      </p>
                      <p className="font-mono tabular-nums font-bold text-text-primary text-sm mt-0.5">
                        {formatMoney(p.summary.totalInvestedCost, p.baseCurrency)}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-[10px] text-text-secondary uppercase font-semibold tracking-wider">
                        PnL Realizado
                      </p>
                      <p
                        className={`font-mono tabular-nums font-bold text-sm mt-0.5 ${
                          isPositivePnL
                            ? 'text-positive-text'
                            : isNegativePnL
                            ? 'text-negative-text'
                            : 'text-text-secondary'
                        }`}
                      >
                        {isPositivePnL ? '+' : ''}
                        {formatMoney(p.summary.totalRealizedPnL, p.baseCurrency)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-3 border-t border-border-theme/60 text-xs text-text-secondary">
                    <span className="font-medium">
                      {activeAssetsCount}{' '}
                      {activeAssetsCount === 1 ? 'ativo' : 'ativos'}
                    </span>
                    <span className="text-action-primary font-semibold flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
                      Acessar →
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── Feed de Atividades Recentes ───────────────────────────────────── */}
      <div className="space-y-4">
        <RecentActivityFeed events={data.recentEvents} />
      </div>

      {/* ─── Aviso Institucional sobre Limites ──────────────────────────────── */}
      <div className="bg-surface border border-border-theme rounded-2xl p-4 sm:p-5 flex items-start gap-3.5 shadow-xs">
        <div className="w-8 h-8 rounded-xl bg-action-primary/10 border border-action-primary/20 flex items-center justify-center text-action-primary shrink-0 mt-0.5">
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
        <div className="space-y-1 text-xs text-text-secondary">
          <p className="text-text-primary font-semibold text-xs sm:text-sm">
            Consolidação Patrimonial — CarteiraExpert
          </p>
          <p className="leading-relaxed">
            Os valores consolidados refletem o custo histórico de aquisição e o resultado realizado de vendas encerradas. A plataforma tem finalidade estritamente informativa, organizacional e educacional, não constituindo recomendação de investimento.
          </p>
        </div>
      </div>
    </div>
  );
}
