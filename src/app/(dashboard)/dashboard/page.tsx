import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getCurrentUser } from '@/modules/identity/server/current-user';
import { listPortfolios } from '@/modules/portfolio/server/portfolio.service';

export const metadata: Metadata = {
  title: 'Dashboard — CarteiraExpert',
  description: 'Visão geral da sua carteira de investimentos.',
};

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  const portfolios = await listPortfolios(user);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Olá, {user.name.split(' ')[0]} 👋
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Bem-vindo ao CarteiraExpert. Sua plataforma de consolidação patrimonial.
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

      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-1">
          <p className="text-xs font-medium text-slate-400">Carteiras Ativas</p>
          <p id="dashboard-portfolio-count" className="text-3xl font-bold text-white">
            {portfolios.length}
          </p>
          <p className="text-xs text-slate-500">
            {portfolios.length === 1
              ? '1 carteira cadastrada'
              : `${portfolios.length} carteiras cadastradas`}
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-1">
          <p className="text-xs font-medium text-slate-400">Patrimônio Consolidado</p>
          <p className="text-3xl font-bold text-slate-600">—</p>
          <p className="text-xs text-slate-500">
            Disponível no Pacote 03.02 (Motor de Posição)
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg space-y-1">
          <p className="text-xs font-medium text-slate-400">Rentabilidade</p>
          <p className="text-3xl font-bold text-slate-600">—</p>
          <p className="text-xs text-slate-500">
            Disponível em fases futuras
          </p>
        </div>
      </div>

      {/* Seção Minhas Carteiras Recentes */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white tracking-tight">
            Minhas Carteiras
          </h2>
          <Link
            href="/portfolios"
            className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 transition-colors"
          >
            Ver todas ({portfolios.length}) →
          </Link>
        </div>

        {portfolios.length === 0 ? (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center space-y-3">
            <p className="text-sm text-slate-400">
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {portfolios.slice(0, 3).map((portfolio) => (
              <Link
                key={portfolio.id}
                href={`/portfolios/${portfolio.id}`}
                className="bg-slate-900 border border-slate-800 hover:border-emerald-500/50 rounded-2xl p-4 transition-all duration-200 hover:-translate-y-0.5 space-y-2 block"
              >
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-white text-base truncate">
                    {portfolio.name}
                  </h3>
                  <span className="text-[11px] font-mono font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                    {portfolio.baseCurrency}
                  </span>
                </div>
                {portfolio.description && (
                  <p className="text-xs text-slate-400 line-clamp-1">
                    {portfolio.description}
                  </p>
                )}
                <div className="pt-2 text-right text-xs text-emerald-400 font-semibold">
                  Acessar carteira →
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Aviso informativo de fase */}
      <div className="bg-emerald-950/30 border border-emerald-900/40 rounded-2xl p-4 flex items-start gap-3">
        <span className="text-emerald-400 text-base">ℹ️</span>
        <div className="space-y-0.5 text-xs">
          <p className="text-emerald-300 font-semibold">
            Pacote 03.01-D — Operações Manuais e Carteiras Ativas
          </p>
          <p className="text-emerald-500/80">
            Você pode criar carteiras e registrar operações manuais de compra e venda com taxas e datas. O cálculo determinístico de posição e custo médio será disponibilizado no Pacote 03.02.
          </p>
        </div>
      </div>
    </div>
  );
}
