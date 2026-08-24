'use client';

import Link from 'next/link';
import type { CommercialPlan, PlanQuotaSummary } from '../domain/plan.types';
import type { UserBillingSummary } from '@/modules/billing/domain/billing.types';

interface PlansViewProps {
  plans: CommercialPlan[];
  quotaSummary: PlanQuotaSummary;
  billingSummary: UserBillingSummary;
}

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(d);
}

export function PlansView({ plans, quotaSummary, billingSummary }: PlansViewProps) {
  const isPro = quotaSummary.planId === 'pro';
  const hasSubscription = billingSummary.hasSubscription && billingSummary.subscription !== null;
  const status = billingSummary.status;

  // Formatação descritiva de status e vigência
  let statusBadgeColor = 'bg-surface-elevated text-text-secondary border-border-theme';
  let statusLabel = 'Sem assinatura ativa (Plano Free padrão)';
  let statusDetail = 'Você está utilizando a estrutura gratuita padrão do CarteiraExpert.';

  if (hasSubscription) {
    if (status === 'active') {
      statusBadgeColor = 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20';
      statusLabel = 'Assinatura Ativa (Vigente)';
      statusDetail = billingSummary.currentPeriodEnd
        ? `Ciclo vigente com renovação/expiração prevista para ${formatDate(billingSummary.currentPeriodEnd)}.`
        : 'Assinatura ativa e operando normalmente.';
    } else if (status === 'trialing') {
      statusBadgeColor = 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20';
      statusLabel = 'Período de Avaliação (Trial)';
      statusDetail = billingSummary.currentPeriodEnd
        ? `Período de testes válido até ${formatDate(billingSummary.currentPeriodEnd)}.`
        : 'Período de avaliação em andamento.';
    } else if (status === 'past_due') {
      statusBadgeColor = 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20';
      statusLabel = 'Pagamento Pendente / Em Carência';
      statusDetail = billingSummary.gracePeriodEndsAt
        ? `Período de tolerância concedido até ${formatDate(billingSummary.gracePeriodEndsAt)}. Seus recursos continuam ativos temporariamente.`
        : 'Aguardando confirmação de faturamento.';
    } else if (status === 'canceled') {
      if (billingSummary.cancelAtPeriodEnd && billingSummary.currentPeriodEnd) {
        statusBadgeColor = 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20';
        statusLabel = 'Cancelamento Agendado';
        statusDetail = `Sua assinatura foi cancelada, mas os benefícios permanecem ativos até o fim do período em ${formatDate(billingSummary.currentPeriodEnd)}.`;
      } else {
        statusBadgeColor = 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20';
        statusLabel = 'Assinatura Encerrada';
        statusDetail = 'Sua assinatura foi cancelada e sua conta rebaixada para o Plano Free com segurança.';
      }
    } else if (status === 'unpaid') {
      statusBadgeColor = 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20';
      statusLabel = 'Inadimplente (Downgrade Aplicado)';
      statusDetail = 'Assinatura suspensa por falta de pagamento. Carteiras excedentes foram congeladas em modo somente leitura.';
    }
  }

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-12">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border-theme pb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold text-text-primary tracking-tight">
              Planos e Quotas Comerciais
            </h1>
            <span
              id="effective-plan-badge"
              className="text-xs font-semibold px-3 py-1 rounded-full bg-action-primary/10 text-action-primary border border-action-primary/20"
            >
              {quotaSummary.planName}
            </span>
          </div>
          <p className="text-sm text-text-secondary mt-1 max-w-2xl">
            Gerencie seus limites patrimoniais e conheça a capacidade dos planos. O CarteiraExpert opera com controle server-side estrito e preservação integral de dados.
          </p>
        </div>

        <Link
          id="link-back-to-portfolios"
          href="/portfolios"
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-text-secondary hover:text-text-primary bg-surface border border-border-theme rounded-xl hover:bg-surface-elevated transition-colors self-start md:self-auto shadow-sm"
        >
          ← Voltar para Carteiras
        </Link>
      </div>

      {/* Resumo do Status Atual do Usuário */}
      <div
        id="user-plan-status-card"
        className="bg-surface border border-border-theme rounded-2xl p-6 shadow-sm space-y-5"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border-theme">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-action-primary/10 border border-action-primary/20 flex items-center justify-center text-lg">
              📊
            </div>
            <div>
              <span className="text-xs font-medium text-text-secondary uppercase tracking-wider">
                Visão Geral da Conta
              </span>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-base font-bold text-text-primary">
                  {quotaSummary.planName}
                </span>
                <span
                  id="subscription-status-tag"
                  className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${statusBadgeColor}`}
                >
                  {statusLabel}
                </span>
              </div>
            </div>
          </div>

          <div className="text-left sm:text-right">
            <span className="text-xs text-text-secondary">Uso da Quota de Carteiras</span>
            <div id="quota-usage-indicator" className="text-sm font-bold text-text-primary">
              {quotaSummary.activePortfoliosCount} de {quotaSummary.maxActivePortfolios} ativas ({quotaSummary.availableSlots} {quotaSummary.availableSlots === 1 ? 'disponível' : 'disponíveis'})
            </div>
          </div>
        </div>

        {/* Detalhe do Status e Alertas */}
        <div className="text-xs text-text-secondary leading-relaxed space-y-2">
          <p id="subscription-status-detail">
            <strong>Condição de Assinatura:</strong> {statusDetail}
          </p>

          {quotaSummary.frozenPortfoliosCount > 0 && (
            <div
              id="frozen-portfolios-alert"
              className="bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-300 rounded-xl p-3.5 flex items-start gap-2.5 mt-3"
            >
              <span className="text-base">❄️</span>
              <div>
                <p className="font-semibold text-xs">
                  {quotaSummary.frozenPortfoliosCount} carteira(s) em estado congelado (somente leitura)
                </p>
                <p className="text-[11px] mt-0.5 opacity-90">
                  Suas carteiras excedentes foram preservadas com segurança após um downgrade. Elas não aceitam novos lançamentos, mas permanecem disponíveis para auditoria histórica e serão reativadas ao assinar o Plano Pro.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Grid Comparativo de Planos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        {/* Card Plano Free */}
        <div
          id="card-plan-free"
          className={`bg-surface border rounded-2xl p-7 flex flex-col justify-between shadow-sm transition-all relative ${
            !isPro ? 'border-action-primary/40 ring-1 ring-action-primary/20' : 'border-border-theme'
          }`}
        >
          {!isPro && (
            <span className="absolute -top-3 left-6 text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-action-primary text-action-primary-text shadow-sm">
              Plano Atual
            </span>
          )}

          <div className="space-y-5">
            <div>
              <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                Individual & Essencial
              </span>
              <h2 className="text-2xl font-bold text-text-primary mt-1">
                Plano Free
              </h2>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-3xl font-extrabold text-text-primary">R$ 0</span>
                <span className="text-xs text-text-secondary font-medium">/ para sempre</span>
              </div>
              <p className="text-xs text-text-secondary mt-2">
                Ideal para investidores individuais que desejam consolidar e controlar suas carteiras com precisão matemática.
              </p>
            </div>

            <div className="pt-4 border-t border-border-theme space-y-3">
              <span className="text-xs font-semibold text-text-primary">Recursos inclusos:</span>
              <ul className="space-y-2.5 text-xs text-text-secondary">
                <li className="flex items-start gap-2">
                  <span className="text-emerald-500 font-bold">✓</span>
                  <span><strong>Até 2 carteiras ativas</strong> estruturadas</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-500 font-bold">✓</span>
                  <span>Lançamentos manuais ilimitados (Compra, Venda, Transferências e Ajustes)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-500 font-bold">✓</span>
                  <span>Cálculo determinístico de Posição, Custo Médio e PnL Realizado</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-500 font-bold">✓</span>
                  <span>Ações Corporativas completas (Split, Grupamento, Bonificação, Dividendos, JCP e Subscrições)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-500 font-bold">✓</span>
                  <span>Cotações e taxas de câmbio multi-moeda</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-500 font-bold">✓</span>
                  <span>Gráficos de alocação por ativo/classe e evolução histórica temporal</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-500 font-bold">✓</span>
                  <span>Preservação total de dados (sem exclusão automática em downgrade)</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="pt-6 mt-6 border-t border-border-theme">
            {!isPro ? (
              <div className="w-full py-2.5 px-4 text-center text-xs font-semibold text-text-secondary bg-surface-elevated border border-border-theme rounded-xl">
                ✓ Plano Atualmente Ativo
              </div>
            ) : (
              <div className="w-full py-2.5 px-4 text-center text-xs text-text-secondary/70 italic">
                Plano base incluído
              </div>
            )}
          </div>
        </div>

        {/* Card Plano Pro */}
        <div
          id="card-plan-pro"
          className={`bg-surface border rounded-2xl p-7 flex flex-col justify-between shadow-sm transition-all relative ${
            isPro ? 'border-action-primary/50 ring-1 ring-action-primary/30' : 'border-border-theme'
          }`}
        >
          {isPro && (
            <span className="absolute -top-3 left-6 text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-action-primary text-action-primary-text shadow-sm">
              Plano Atual
            </span>
          )}

          <div className="space-y-5">
            <div>
              <span className="text-xs font-semibold text-action-primary uppercase tracking-wider">
                Profissional & Avançado
              </span>
              <h2 className="text-2xl font-bold text-text-primary mt-1">
                Plano Pro
              </h2>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-2xl font-extrabold text-text-primary">Preço a definir</span>
                <span className="text-xs text-text-secondary font-medium">(Disponível futuramente)</span>
              </div>
              <p className="text-xs text-text-secondary mt-2">
                Para investidores com múltiplas estratégias que necessitam de maior capacidade operacional e isolamento patrimonial.
              </p>
            </div>

            <div className="pt-4 border-t border-border-theme space-y-3">
              <span className="text-xs font-semibold text-text-primary">Todos os recursos do Free, mais:</span>
              <ul className="space-y-2.5 text-xs text-text-secondary">
                <li className="flex items-start gap-2">
                  <span className="text-action-primary font-bold">✓</span>
                  <span><strong>Até 10 carteiras ativas</strong> simultâneas</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-action-primary font-bold">✓</span>
                  <span>Gestão expandida de múltiplas carteiras e estratégias</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-action-primary font-bold">✓</span>
                  <span>Reativação automática e imediata de carteiras congeladas</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-action-primary font-bold">✓</span>
                  <span>Visão e filtros avançados no extrato consolidado</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-action-primary font-bold">✓</span>
                  <span>Preparado para futuras integrações de importação e screening</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-action-primary font-bold">✓</span>
                  <span>Suporte prioritário a dúvidas operacionais</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="pt-6 mt-6 border-t border-border-theme space-y-2">
            {isPro ? (
              <div className="w-full py-2.5 px-4 text-center text-xs font-semibold text-action-primary bg-action-primary/10 border border-action-primary/20 rounded-xl">
                ✓ Seu Plano Pro está Ativo
              </div>
            ) : (
              <div>
                <button
                  id="btn-upgrade-pro"
                  type="button"
                  disabled
                  title="Pagamentos e upgrade automatizado ainda não estão disponíveis."
                  className="w-full py-2.5 px-4 text-xs font-semibold text-text-secondary bg-surface-elevated border border-border-theme rounded-xl cursor-not-allowed opacity-75 flex items-center justify-center gap-2"
                >
                  <span>🔒</span> Upgrade Automatizado Indisponível
                </button>
                <p className="text-[11px] text-text-secondary/70 text-center mt-1.5">
                  Pagamentos e upgrade automatizado ainda não estão disponíveis.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Diretrizes e Governança de Faturamento */}
      <div className="bg-surface/50 border border-border-theme rounded-2xl p-6 text-xs text-text-secondary space-y-4">
        <h3 className="text-sm font-bold text-text-primary flex items-center gap-2">
          <span>🛡️</span> Transparência e Governança Comercial do CarteiraExpert
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-2">
          <div className="space-y-1">
            <strong className="text-text-primary font-semibold block">Sem Cobranças Reais Ativas</strong>
            <p className="text-[11px] leading-relaxed">
              O sistema encontra-se em fase de validação arquitetural. Nenhum gateway externo (Stripe, Asaas) está conectado e não há processamento financeiro no seu cartão de crédito.
            </p>
          </div>
          <div className="space-y-1">
            <strong className="text-text-primary font-semibold block">Isolamento e Privacidade</strong>
            <p className="text-[11px] leading-relaxed">
              Toda consulta de limites e planos é estritamente vinculada ao seu usuário autenticado no servidor. Nenhuma informação financeira é exposta entre contas.
            </p>
          </div>
          <div className="space-y-1">
            <strong className="text-text-primary font-semibold block">Preservação Inviolável</strong>
            <p className="text-[11px] leading-relaxed">
              Em caso de downgrade, nenhuma carteira é apagada. Carteiras excedentes são congeladas em modo somente leitura e permanecem seguras para reativação futura.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
