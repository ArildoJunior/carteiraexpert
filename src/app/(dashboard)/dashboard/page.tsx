import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '@/modules/identity/server/current-user';
import { getSerializedUserDashboardData } from '@/modules/portfolio/server/dashboard.service';
import { DashboardMetricsCards } from '@/modules/portfolio/ui/DashboardMetricsCards';
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
    <div className="space-y-8" id="dashboard-page-container">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Olá, {user.name.split(' ')[0]} 👋
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Visão consolidada das suas posições patrimoniais e histórico de operações.
          </p>
        </div>

        <Link
          id="dashboard-new-portfolio-btn"
          href="/portfolios"
          className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl shadow-sm transition-all self-start sm:self-auto"
        >
          <span>💼</span> Gerenciar Carteiras
        </Link>
      </div>

      {/* ─── Cards de Resumo Financeiro Consolidado ────────────────────────── */}
      <DashboardMetricsCards
        currencyGroups={data.currencyGroups}
        totalActivePortfolios={data.totalActivePortfolios}
      />

      {/* ─── Seção Minhas Carteiras ────────────────────────────────────────── */}
      <div className="space-y-4" id="dashboard-portfolios-section">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight">
              Minhas Carteiras
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Carteiras ativas cadastradas na plataforma.
            </p>
          </div>
          <Link
            id="dashboard-view-all-portfolios-link"
            href="/portfolios"
            className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors"
          >
            Ver todas ({data.totalActivePortfolios}) →
          </Link>
        </div>

        {data.totalActivePortfolios === 0 ? (
          <div
            id="empty-portfolios-state"
            className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center space-y-3 shadow-lg"
          >
            <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center text-slate-500 text-xl font-bold mx-auto">
              💼
            </div>
            <p className="text-sm font-medium text-slate-300">
              Você ainda não possui carteiras cadastradas.
            </p>
            <Link
              href="/portfolios"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400 hover:underline"
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
                  className="bg-slate-900 border border-slate-800 hover:border-emerald-500/50 rounded-2xl p-5 transition-all duration-200 hover:-translate-y-0.5 space-y-3 block shadow-md group"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-white text-base truncate group-hover:text-emerald-400 transition-colors">
                      {p.portfolioName}
                    </h3>
                    <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                      {p.baseCurrency}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800/60 text-xs">
                    <div>
                      <p className="text-[11px] text-slate-500 uppercase font-semibold">
                        Em Custódia
                      </p>
                      <p className="font-mono font-bold text-white text-sm mt-0.5">
                        {formatMoney(p.summary.totalInvestedCost, p.baseCurrency)}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-[11px] text-slate-500 uppercase font-semibold">
                        PnL Realizado
                      </p>
                      <p
                        className={`font-mono font-bold text-sm mt-0.5 ${
                          isPositivePnL
                            ? 'text-emerald-400'
                            : isNegativePnL
                            ? 'text-red-400'
                            : 'text-slate-300'
                        }`}
                      >
                        {isPositivePnL ? '+' : ''}
                        {formatMoney(p.summary.totalRealizedPnL, p.baseCurrency)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-800/40 text-xs text-slate-400">
                    <span>
                      {activeAssetsCount}{' '}
                      {activeAssetsCount === 1 ? 'ativo' : 'ativos'}
                    </span>
                    <span className="text-emerald-400 font-semibold flex items-center gap-1 group-hover:translate-x-0.5 transition-transform">
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
      <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 flex items-start gap-3">
        <span className="text-slate-400 text-base">ℹ️</span>
        <div className="space-y-0.5 text-xs text-slate-400">
          <p className="text-slate-300 font-semibold">
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
