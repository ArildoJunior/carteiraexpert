import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '@/modules/identity/server/current-user';
import { getSerializedUserDashboardData } from '@/modules/portfolio/server/dashboard.service';
import { DashboardMetricsCards } from '@/modules/portfolio/ui/DashboardMetricsCards';
import { DashboardAllocationCharts } from '@/modules/portfolio/ui/DashboardAllocationCharts';
import { RecentActivityFeed } from '@/modules/portfolio/ui/RecentActivityFeed';
import { Decimal } from '@/lib/decimal';

export const metadata: Metadata = {
  title: 'Dashboard Consolidado — CarteiraExpert',
  description: 'Visão geral patrimonial consolidada das suas carteiras de investimentos.',
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

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const data = await getSerializedUserDashboardData(user);

  return (
    <div className="space-y-8 text-text-primary" id="dashboard-page-container">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">
            Olá, {user.name.split(' ')[0]} 👋
          </h1>
          <p className="text-text-secondary text-sm mt-1">
            Visão consolidada das suas posições patrimoniais e histórico de operações.
          </p>
        </div>

        <Link
          id="dashboard-new-portfolio-btn"
          href="/portfolios"
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-action-primary-text bg-action-primary hover:opacity-90 rounded-xl shadow-sm transition-all self-start sm:self-auto focus:outline-none focus-visible:ring-2 focus-visible:ring-action-primary"
        >
          <span>💼</span> Gerenciar Carteiras
        </Link>
      </div>

      {/* ─── Cards de Resumo Financeiro Consolidado ────────────────────────── */}
      <DashboardMetricsCards
        currencyGroups={data.currencyGroups}
        totalActivePortfolios={data.totalActivePortfolios}
      />

      {/* ─── Gráficos de Alocação Consolidada ──────────────────────────────── */}
      {data.totalActivePositions > 0 && (
        <DashboardAllocationCharts
          portfolioSummaries={data.portfolioSummaries}
        />
      )}

      {/* ─── Seção Minhas Carteiras ────────────────────────────────────────── */}
      <div className="space-y-4" id="dashboard-portfolios-section">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-text-primary tracking-tight">
              Minhas Carteiras
            </h2>
            <p className="text-xs text-text-secondary mt-0.5">
              Carteiras ativas cadastradas na plataforma.
            </p>
          </div>
          <Link
            id="dashboard-view-all-portfolios-link"
            href="/portfolios"
            className="text-xs font-semibold text-action-primary hover:underline transition-colors"
          >
            Ver todas ({data.totalActivePortfolios}) →
          </Link>
        </div>

        {data.totalActivePortfolios === 0 ? (
          <div
            id="empty-portfolios-state"
            className="bg-surface border border-border-theme rounded-2xl p-8 text-center space-y-3 shadow-sm"
          >
            <div className="w-12 h-12 rounded-full bg-background flex items-center justify-center text-text-secondary text-xl font-bold mx-auto border border-border-theme">
              💼
            </div>
            <p className="text-sm font-medium text-text-primary">
              Você ainda não possui carteiras cadastradas.
            </p>
            <Link
              href="/portfolios"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-action-primary hover:underline"
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
                  className="bg-surface border border-border-theme hover:border-action-primary rounded-2xl p-5 transition-all duration-200 hover:-translate-y-0.5 space-y-3 block shadow-sm group focus:outline-none focus-visible:ring-2 focus-visible:ring-action-primary"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-text-primary text-base truncate group-hover:text-action-primary transition-colors">
                      {p.portfolioName}
                    </h3>
                    <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-background text-text-secondary border border-border-theme">
                      {p.baseCurrency}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-border-theme text-xs">
                    <div>
                      <p className="text-[11px] text-text-secondary uppercase font-semibold">
                        Em Custódia
                      </p>
                      <p className="font-mono tabular-nums font-bold text-text-primary text-sm mt-0.5">
                        {formatMoney(p.summary.totalInvestedCost, p.baseCurrency)}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-[11px] text-text-secondary uppercase font-semibold">
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

                  <div className="flex items-center justify-between pt-2 border-t border-border-theme text-xs text-text-secondary">
                    <span>
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

      {/* Aviso institucional sobre limites */}
      <div className="bg-surface border border-border-theme rounded-2xl p-4 flex items-start gap-3 shadow-sm">
        <span className="text-action-primary text-base">ℹ️</span>
        <div className="space-y-0.5 text-xs text-text-secondary">
          <p className="text-text-primary font-semibold">
            Consolidação Patrimonial — CarteiraExpert
          </p>
          <p>
            Os valores consolidados refletem o custo histórico de aquisição e o resultado realizado de vendas encerradas. A plataforma tem finalidade informativa e não constitui recomendação de investimento.
          </p>
        </div>
      </div>
    </div>
  );
}
