import type { Metadata } from 'next';
import { getCurrentUser } from '@/modules/identity/server/current-user';
import { PublicNavbar } from '@/modules/catalog/ui/PublicNavbar';
import { PublicFooter } from '@/modules/catalog/ui/PublicFooter';

export const metadata: Metadata = {
  title: 'CarteiraExpert — Consolidação e Gestão Patrimonial Inteligente',
  description:
    'Plataforma brasileira para consolidação patrimonial, cotações de mercado, acompanhamento de ações, FIIs, ETFs e BDRs.',
  openGraph: {
    title: 'CarteiraExpert — Consolidação e Gestão Patrimonial Inteligente',
    description:
      'Plataforma brasileira para consolidação patrimonial, cotações de mercado, acompanhamento de ações, FIIs, ETFs e BDRs.',
  },
};

export default async function HomePage() {
  const user = await getCurrentUser();

  const categories = [
    {
      title: 'Ações Brasileiras',
      tag: 'B3',
      description: 'Acompanhe cotações, variações e histórico de negociação de empresas listadas na bolsa.',
      href: '/acoes',
      badgeClass: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
    },
    {
      title: 'Fundos Imobiliários',
      tag: 'FIIs',
      description: 'Cotações de cotas e dados cadastrais de fundos imobiliários negociados no mercado.',
      href: '/fiis',
      badgeClass: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
    },
    {
      title: 'Fundos de Índice',
      tag: 'ETFs',
      description: 'Índices nacionais e globais com acompanhamento de preços e variações diárias.',
      href: '/etfs',
      badgeClass: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20',
    },
    {
      title: 'BDRs Globais',
      tag: 'BDRs',
      description: 'Certificados de empresas internacionais cotados em reais no mercado brasileiro.',
      href: '/bdrs',
      badgeClass: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20',
    },
  ];

  const pillars = [
    {
      title: 'Precisão Financeira',
      description: 'Motor financeiro determinístico construído com Decimal, garantindo precisão matemática absoluta.',
    },
    {
      title: 'Privacidade e Isolamento',
      description: 'Dados patrimoniais rigorosamente privados por usuário, mesmo em planos com faturamento compartilhado.',
    },
    {
      title: 'Histórico Imutável',
      description: 'Eventos e operações tratados como fatos históricos auditáveis, sem exclusões silenciosas.',
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background text-text-primary">
      <PublicNavbar currentUser={user} activePath="/" />

      <main className="flex-1 w-full">
        {/* Hero Section */}
        <section className="relative overflow-hidden py-20 lg:py-28 border-b border-border-theme bg-surface/30">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center sm:text-left">
            <div className="max-w-3xl space-y-6">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-action-primary/10 text-action-primary border border-action-primary/20">
                <span>Consolidação Patrimonial Independente</span>
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-text-primary leading-[1.1]">
                Gestão Patrimonial com{' '}
                <span className="text-action-primary">Precisão e Clareza</span>
              </h1>

              <p className="text-base sm:text-lg text-text-secondary leading-relaxed">
                Consolide seus investimentos em ações, fundos imobiliários, ETFs e BDRs. Acompanhe cotações de mercado, evolução patrimonial e tome decisões com base em dados transparentes.
              </p>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <a
                  id="btn-hero-catalog"
                  href="/ativos"
                  className="px-6 py-3 rounded-lg bg-action-primary text-action-primary-text font-medium text-sm hover:opacity-90 transition-opacity shadow-sm"
                >
                  Explorar Catálogo de Ativos
                </a>
                {user ? (
                  <a
                    id="btn-hero-dashboard"
                    href="/dashboard"
                    className="px-6 py-3 rounded-lg bg-surface-elevated border border-border-theme text-text-primary font-medium text-sm hover:border-action-primary/50 transition-colors"
                  >
                    Ir para o Dashboard
                  </a>
                ) : (
                  <a
                    id="btn-hero-register"
                    href="/register"
                    className="px-6 py-3 rounded-lg bg-surface-elevated border border-border-theme text-text-primary font-medium text-sm hover:border-action-primary/50 transition-colors"
                  >
                    Criar Conta Gratuita
                  </a>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Categorias do Catálogo */}
        <section className="py-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-text-primary">
                Catálogo de Ativos por Categoria
              </h2>
              <p className="text-xs text-text-muted mt-1">
                Consulte cotações e histórico de preços organizados por classe de ativo.
              </p>
            </div>
            <a
              href="/ativos"
              className="text-xs font-semibold text-action-primary hover:underline self-start sm:self-auto"
            >
              Ver todos os ativos &rarr;
            </a>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {categories.map((cat) => (
              <a
                key={cat.title}
                id={`card-category-${cat.tag.toLowerCase()}`}
                href={cat.href}
                className="group rounded-xl border border-border-theme bg-surface p-5 hover:border-action-primary/40 hover:shadow-md transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-3">
                    <span
                      className={`px-2.5 py-0.5 rounded-md text-[11px] font-semibold border ${cat.badgeClass}`}
                    >
                      {cat.tag}
                    </span>
                    <span className="text-xs text-text-muted group-hover:text-action-primary transition-colors">
                      &rarr;
                    </span>
                  </div>
                  <h3 className="font-semibold text-text-primary text-sm group-hover:text-action-primary transition-colors">
                    {cat.title}
                  </h3>
                  <p className="text-xs text-text-muted mt-1.5 leading-relaxed">
                    {cat.description}
                  </p>
                </div>

                <div className="mt-4 pt-3 border-t border-border-theme/60 text-[11px] font-medium text-action-primary">
                  Consultar {cat.tag}
                </div>
              </a>
            ))}
          </div>
        </section>

        {/* Pilares da Plataforma */}
        <section className="py-16 border-t border-border-theme bg-surface/30">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="max-w-2xl mb-10">
              <h2 className="text-xl font-bold tracking-tight text-text-primary">
                Construído com Princípios Sólidos
              </h2>
              <p className="text-xs text-text-muted mt-1">
                Uma arquitetura desenvolvida para garantir integridade, determinismo e segurança.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {pillars.map((pillar) => (
                <div
                  key={pillar.title}
                  className="rounded-xl border border-border-theme bg-surface p-6 shadow-xs"
                >
                  <h3 className="text-sm font-semibold text-text-primary mb-2">
                    {pillar.title}
                  </h3>
                  <p className="text-xs text-text-muted leading-relaxed">
                    {pillar.description}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
