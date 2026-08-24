'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import type { CommercialPlan, PlanQuotaSummary } from '../domain/plan.types';
import type { BillingGroupOverview } from '../domain/group.types';
import type { UserBillingSummary } from '@/modules/billing/domain/billing.types';
import {
  createBillingGroupAction,
  inviteGroupMemberAction,
  resendGroupInvitationAction,
  revokeGroupInvitationAction,
  acceptGroupInvitationAction,
  declineGroupInvitationAction,
  removeGroupMemberAction,
  leaveBillingGroupAction,
  dissolveBillingGroupAction,
} from '../server/group.actions';

interface PlansViewProps {
  plans: CommercialPlan[];
  quotaSummary: PlanQuotaSummary;
  billingSummary: UserBillingSummary;
  groupOverview: BillingGroupOverview;
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

export function PlansView({
  plans,
  quotaSummary,
  billingSummary,
  groupOverview,
}: PlansViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteQueryToken = searchParams.get('invite');

  const isPro = quotaSummary.planId === 'pro';
  const isShared = quotaSummary.planId === 'shared';
  const hasSubscription = billingSummary.hasSubscription && billingSummary.subscription !== null;
  const status = billingSummary.status;

  // Estados locais para interatividade de grupos
  const [groupNameInput, setGroupNameInput] = useState('');
  const [inviteEmailInput, setInviteEmailInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Modal de token de convite gerado (exibido uma única vez)
  const [generatedInviteLink, setGeneratedInviteLink] = useState<string | null>(null);
  const [copiedLink, setCopiedLink] = useState(false);

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
  } else if (groupOverview.isMember) {
    statusBadgeColor = 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/20';
    statusLabel = 'Benefício Concedido por Grupo Compartilhado';
    statusDetail = `Você é membro do grupo compartilhado administrado por ${groupOverview.ownerName ?? 'seu titular'} e possui entitlements ativos.`;
  }

  // Ações de gerenciamento de grupo
  const handleCreateGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupNameInput.trim()) return;
    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const res = await createBillingGroupAction({ name: groupNameInput.trim() });
    setIsLoading(false);

    if (res.success) {
      setSuccessMessage('Grupo compartilhado criado com sucesso!');
      setGroupNameInput('');
      router.refresh();
    } else {
      setErrorMessage(res.error ?? 'Falha ao criar grupo.');
    }
  };

  const handleInviteMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmailInput.trim()) return;
    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const res = await inviteGroupMemberAction({ email: inviteEmailInput.trim() });
    setIsLoading(false);

    if (res.success && res.data) {
      const inviteUrl = `${window.location.origin}/plans?invite=${res.data.inviteToken}`;
      setGeneratedInviteLink(inviteUrl);
      setCopiedLink(false);
      setInviteEmailInput('');
      setSuccessMessage('Convite gerado com sucesso! Copie o link abaixo para enviar ao convidado.');
      router.refresh();
    } else {
      setErrorMessage(res.error ?? 'Falha ao emitir convite.');
    }
  };

  const handleResendInvite = async (invitationId: string) => {
    setIsLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    const res = await resendGroupInvitationAction({ invitationId });
    setIsLoading(false);

    if (res.success && res.data) {
      const inviteUrl = `${window.location.origin}/plans?invite=${res.data.newInviteToken}`;
      setGeneratedInviteLink(inviteUrl);
      setCopiedLink(false);
      setSuccessMessage('Novo convite gerado! O link anterior foi invalidado.');
      router.refresh();
    } else {
      setErrorMessage(res.error ?? 'Falha ao reenviar convite.');
    }
  };

  const handleRevokeInvite = async (invitationId: string) => {
    if (!confirm('Deseja realmente revogar este convite?')) return;
    setIsLoading(true);
    setErrorMessage(null);

    const res = await revokeGroupInvitationAction({ invitationId });
    setIsLoading(false);

    if (res.success) {
      setSuccessMessage('Convite revogado com sucesso.');
      router.refresh();
    } else {
      setErrorMessage(res.error ?? 'Falha ao revogar convite.');
    }
  };

  const handleRemoveMember = async (memberUserId: string, memberName: string) => {
    if (
      !confirm(
        `Deseja realmente remover ${memberName} do grupo? O usuário perderá o benefício do Plano Compartilhado imediatamente.`
      )
    ) {
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    const res = await removeGroupMemberAction({ memberUserId });
    setIsLoading(false);

    if (res.success) {
      setSuccessMessage('Membro removido do grupo com sucesso.');
      router.refresh();
    } else {
      setErrorMessage(res.error ?? 'Falha ao remover membro.');
    }
  };

  const handleLeaveGroup = async () => {
    if (
      !confirm(
        'Deseja realmente deixar o grupo compartilhado? Você retornará ao Plano Free e eventuais carteiras excedentes serão congeladas.'
      )
    ) {
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    const res = await leaveBillingGroupAction();
    setIsLoading(false);

    if (res.success) {
      setSuccessMessage('Você deixou o grupo compartilhado com sucesso.');
      router.refresh();
    } else {
      setErrorMessage(res.error ?? 'Falha ao deixar grupo.');
    }
  };

  const handleDissolveGroup = async () => {
    if (
      !confirm(
        'ATENÇÃO: Deseja realmente dissolver o grupo compartilhado? Todos os membros perderão o benefício e serão rebaixados ao Plano Free imediatamente.'
      )
    ) {
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    const res = await dissolveBillingGroupAction();
    setIsLoading(false);

    if (res.success) {
      setSuccessMessage('Grupo compartilhado dissolvido com sucesso.');
      router.refresh();
    } else {
      setErrorMessage(res.error ?? 'Falha ao dissolver grupo.');
    }
  };

  const handleAcceptInvite = async (token: string) => {
    setIsLoading(true);
    setErrorMessage(null);

    const res = await acceptGroupInvitationAction({ token });
    setIsLoading(false);

    if (res.success) {
      setSuccessMessage('Convite aceito! Seus benefícios do Plano Compartilhado foram ativados.');
      router.push('/plans');
      router.refresh();
    } else {
      setErrorMessage(res.error ?? 'Falha ao aceitar convite.');
    }
  };

  const handleDeclineInvite = async (token: string) => {
    setIsLoading(true);
    setErrorMessage(null);

    const res = await declineGroupInvitationAction({ token });
    setIsLoading(false);

    if (res.success) {
      setSuccessMessage('Convite recusado.');
      router.push('/plans');
      router.refresh();
    } else {
      setErrorMessage(res.error ?? 'Falha ao recusar convite.');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 3000);
  };

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

      {/* Alertas Globais de Sucesso / Erro */}
      {errorMessage && (
        <div className="bg-rose-500/10 border border-rose-500/20 text-rose-600 dark:text-rose-400 rounded-xl p-4 text-xs font-semibold flex items-center justify-between">
          <span>⚠️ {errorMessage}</span>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-xs opacity-75 hover:opacity-100"
          >
            ✕
          </button>
        </div>
      )}

      {successMessage && (
        <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-xl p-4 text-xs font-semibold flex items-center justify-between">
          <span>✓ {successMessage}</span>
          <button
            type="button"
            onClick={() => setSuccessMessage(null)}
            className="text-xs opacity-75 hover:opacity-100"
          >
            ✕
          </button>
        </div>
      )}

      {/* Banner de Convite Recebido via URL Query ou Registro Pendente */}
      {inviteQueryToken && (
        <div
          id="banner-received-invite-query"
          className="bg-indigo-500/10 border border-indigo-500/30 rounded-2xl p-6 shadow-sm space-y-4"
        >
          <div className="flex items-center gap-3">
            <span className="text-2xl">✉️</span>
            <div>
              <h3 className="text-base font-bold text-text-primary">
                Convite para Grupo Compartilhado Recebido
              </h3>
              <p className="text-xs text-text-secondary mt-0.5">
                Você recebeu um convite para ingressar em um grupo comercial compartilhado do CarteiraExpert.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 pt-2">
            <button
              id="btn-accept-query-invite"
              type="button"
              disabled={isLoading}
              onClick={() => handleAcceptInvite(inviteQueryToken)}
              className="px-4 py-2 text-xs font-semibold bg-action-primary text-action-primary-text rounded-xl hover:opacity-90 transition-opacity shadow-sm disabled:opacity-50"
            >
              {isLoading ? 'Processando...' : '✓ Aceitar Convite'}
            </button>
            <button
              id="btn-decline-query-invite"
              type="button"
              disabled={isLoading}
              onClick={() => handleDeclineInvite(inviteQueryToken)}
              className="px-4 py-2 text-xs font-semibold bg-surface border border-border-theme text-text-secondary rounded-xl hover:bg-surface-elevated transition-colors disabled:opacity-50"
            >
              Recusar
            </button>
          </div>
        </div>
      )}

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
              {quotaSummary.maxActivePortfolios !== null ? (
                `${quotaSummary.activePortfoliosCount} de ${quotaSummary.maxActivePortfolios} ativas (${quotaSummary.availableSlots} ${quotaSummary.availableSlots === 1 ? 'disponível' : 'disponíveis'})`
              ) : (
                `${quotaSummary.activePortfoliosCount} ativas (Quota a definir)`
              )}
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
                  Suas carteiras excedentes foram preservadas com segurança após um downgrade. Elas não aceitam novos lançamentos, mas permanecem disponíveis para auditoria histórica e serão reativadas ao assinar um plano superior.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Grid Comparativo de Planos Comerciais */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Card 1: Plano Free */}
        <div
          id="card-plan-free"
          className={`bg-surface border rounded-2xl p-6 flex flex-col justify-between shadow-sm transition-all relative ${
            quotaSummary.planId === 'free'
              ? 'border-action-primary/40 ring-1 ring-action-primary/20'
              : 'border-border-theme'
          }`}
        >
          {quotaSummary.planId === 'free' && (
            <span className="absolute -top-3 left-6 text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-action-primary text-action-primary-text shadow-sm">
              Plano Atual
            </span>
          )}

          <div className="space-y-4">
            <div>
              <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">
                Individual & Essencial
              </span>
              <h2 className="text-xl font-bold text-text-primary mt-1">Plano Free</h2>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-2xl font-extrabold text-text-primary">R$ 0</span>
                <span className="text-xs text-text-secondary font-medium">/ para sempre</span>
              </div>
              <p className="text-xs text-text-secondary mt-2">
                Ideal para investidores individuais que desejam consolidar e controlar suas carteiras com precisão matemática.
              </p>
            </div>

            <div className="pt-4 border-t border-border-theme space-y-2.5">
              <span className="text-xs font-semibold text-text-primary">Recursos inclusos:</span>
              <ul className="space-y-2 text-xs text-text-secondary">
                <li className="flex items-start gap-2">
                  <span className="text-emerald-500 font-bold">✓</span>
                  <span><strong>Até 2 carteiras ativas</strong></span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-500 font-bold">✓</span>
                  <span>Lançamentos manuais ilimitados</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-500 font-bold">✓</span>
                  <span>Cálculo determinístico de Custo Médio e PnL</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-500 font-bold">✓</span>
                  <span>Eventos societários (Split, JCP, Dividendos)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-emerald-500 font-bold">✓</span>
                  <span>Preservação total de histórico</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="pt-6 mt-6 border-t border-border-theme">
            {quotaSummary.planId === 'free' ? (
              <div className="w-full py-2 px-3 text-center text-xs font-semibold text-text-secondary bg-surface-elevated border border-border-theme rounded-xl">
                ✓ Plano Atual
              </div>
            ) : (
              <div className="w-full py-2 px-3 text-center text-xs text-text-secondary/70 italic">
                Plano base incluído
              </div>
            )}
          </div>
        </div>

        {/* Card 2: Plano Pro */}
        <div
          id="card-plan-pro"
          className={`bg-surface border rounded-2xl p-6 flex flex-col justify-between shadow-sm transition-all relative ${
            isPro ? 'border-action-primary/50 ring-1 ring-action-primary/30' : 'border-border-theme'
          }`}
        >
          {isPro && (
            <span className="absolute -top-3 left-6 text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-action-primary text-action-primary-text shadow-sm">
              Plano Atual
            </span>
          )}

          <div className="space-y-4">
            <div>
              <span className="text-xs font-semibold text-action-primary uppercase tracking-wider">
                Profissional Individual
              </span>
              <h2 className="text-xl font-bold text-text-primary mt-1">Plano Pro</h2>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-xl font-extrabold text-text-primary">Preço a definir</span>
                <span className="text-[11px] text-text-secondary font-medium">(Disponível futuramente)</span>
              </div>
              <p className="text-xs text-text-secondary mt-2">
                Para investidores com múltiplas estratégias que necessitam de maior capacidade operacional.
              </p>
            </div>

            <div className="pt-4 border-t border-border-theme space-y-2.5">
              <span className="text-xs font-semibold text-text-primary">Todos os recursos do Free, mais:</span>
              <ul className="space-y-2 text-xs text-text-secondary">
                <li className="flex items-start gap-2">
                  <span className="text-action-primary font-bold">✓</span>
                  <span><strong>Até 10 carteiras ativas</strong> simultâneas</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-action-primary font-bold">✓</span>
                  <span>Múltiplas estratégias independentes</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-action-primary font-bold">✓</span>
                  <span>Reativação de carteiras congeladas</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-action-primary font-bold">✓</span>
                  <span>Filtros avançados no extrato consolidado</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="pt-6 mt-6 border-t border-border-theme">
            {isPro ? (
              <div className="w-full py-2 px-3 text-center text-xs font-semibold text-action-primary bg-action-primary/10 border border-action-primary/20 rounded-xl">
                ✓ Seu Plano Pro está Ativo
              </div>
            ) : (
              <button
                id="btn-upgrade-pro"
                type="button"
                disabled
                title="Pagamentos e upgrade automatizado ainda não estão disponíveis."
                className="w-full py-2 px-3 text-xs font-semibold text-text-secondary bg-surface-elevated border border-border-theme rounded-xl cursor-not-allowed opacity-75 flex items-center justify-center gap-1.5"
              >
                <span>🔒</span> Contratação Indisponível
              </button>
            )}
          </div>
        </div>

        {/* Card 3: Plano Compartilhado */}
        <div
          id="card-plan-shared"
          className={`bg-surface border rounded-2xl p-6 flex flex-col justify-between shadow-sm transition-all relative ${
            isShared ? 'border-indigo-500/50 ring-1 ring-indigo-500/30' : 'border-border-theme'
          }`}
        >
          {isShared && (
            <span className="absolute -top-3 left-6 text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-indigo-600 text-white shadow-sm">
              Plano Atual
            </span>
          )}

          <div className="space-y-4">
            <div>
              <span className="text-xs font-semibold text-indigo-500 uppercase tracking-wider">
                Multi-Contas & Família
              </span>
              <h2 className="text-xl font-bold text-text-primary mt-1">Plano Compartilhado</h2>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-xl font-extrabold text-text-primary">Preço a definir</span>
                <span className="text-[11px] text-text-secondary font-medium">(Disponível futuramente)</span>
              </div>
              <p className="text-xs text-text-secondary mt-2">
                Assinatura comercial compartilhada para até 5 pessoas (1 titular + até 4 membros), com quotas individuais e isolamento patrimonial total.
              </p>
            </div>

            <div className="pt-4 border-t border-border-theme space-y-2.5">
              <span className="text-xs font-semibold text-text-primary">Recursos inclusos:</span>
              <ul className="space-y-2 text-xs text-text-secondary">
                <li className="flex items-start gap-2">
                  <span className="text-indigo-500 font-bold">✓</span>
                  <span><strong>1 Titular + até 4 Membros</strong> (5 pessoas no total)</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-indigo-500 font-bold">✓</span>
                  <span><strong>Quota individual de carteiras: A definir</strong></span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-indigo-500 font-bold">✓</span>
                  <span><strong>Sem pool compartilhado</strong> de carteiras</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-indigo-500 font-bold">✓</span>
                  <span><strong>Isolamento patrimonial absoluto (ADR-004)</strong></span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-indigo-500 font-bold">✓</span>
                  <span>Gestão administrativa centralizada de convites</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="pt-6 mt-6 border-t border-border-theme">
            {isShared ? (
              <div className="w-full py-2 px-3 text-center text-xs font-semibold text-indigo-600 bg-indigo-500/10 border border-indigo-500/20 rounded-xl">
                ✓ Plano Compartilhado Ativo
              </div>
            ) : (
              <button
                id="btn-upgrade-shared"
                type="button"
                disabled
                title="Pagamentos e contratação automatizada ainda não estão disponíveis."
                className="w-full py-2 px-3 text-xs font-semibold text-text-secondary bg-surface-elevated border border-border-theme rounded-xl cursor-not-allowed opacity-75 flex items-center justify-center gap-1.5"
              >
                <span>🔒</span> Contratação Indisponível
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Seção de Gestão do Grupo Compartilhado (ADR-004) */}
      <div
        id="section-shared-group"
        className="bg-surface border border-border-theme rounded-2xl p-7 shadow-sm space-y-6"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border-theme pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-lg">
              👥
            </div>
            <div>
              <h3 className="text-lg font-bold text-text-primary">
                Gestão do Grupo Compartilhado
              </h3>
              <p className="text-xs text-text-secondary mt-0.5">
                Conforme o <strong>ADR-004</strong>, dados patrimoniais, saldos, ativos e extratos de cada membro são estritamente confidenciais e inacessíveis entre si.
              </p>
            </div>
          </div>

          {groupOverview.hasGroup && groupOverview.group && (
            <div className="text-left sm:text-right">
              <span className="text-xs text-text-secondary">Ocupação do Grupo</span>
              <div id="group-capacity-indicator" className="text-sm font-bold text-text-primary">
                {groupOverview.group.activeMembersCount} de {groupOverview.group.maxMembers} vagas ({groupOverview.group.availableSlots} {groupOverview.group.availableSlots === 1 ? 'disponível' : 'disponíveis'})
              </div>
            </div>
          )}
        </div>

        {/* Modal de Link Seguro Gerado (Exibição Única) */}
        {generatedInviteLink && (
          <div
            id="modal-generated-invite-link"
            className="bg-indigo-500/10 border border-indigo-500/30 rounded-2xl p-5 space-y-3"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h4 className="text-xs font-bold text-indigo-700 dark:text-indigo-300 uppercase tracking-wider">
                  Link de Convite Gerado com Sucesso
                </h4>
                <p className="text-xs text-text-secondary mt-1">
                  Por motivos de segurança, o token de alta entropia <strong>não é armazenado em texto puro</strong> e este link <strong>não poderá ser exibido novamente</strong> após fechar esta janela.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setGeneratedInviteLink(null)}
                className="text-xs font-bold text-text-secondary hover:text-text-primary px-2 py-1"
              >
                ✕ Fechar
              </button>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                id="input-copyable-invite-link"
                type="text"
                readOnly
                value={generatedInviteLink}
                className="flex-1 px-3 py-2 text-xs bg-surface border border-border-theme rounded-xl text-text-primary font-mono select-all"
              />
              <button
                id="btn-copy-invite-link"
                type="button"
                onClick={() => copyToClipboard(generatedInviteLink)}
                className="px-4 py-2 text-xs font-semibold bg-action-primary text-action-primary-text rounded-xl hover:opacity-90 transition-opacity shadow-sm whitespace-nowrap"
              >
                {copiedLink ? '✓ Copiado!' : 'Copiar Link'}
              </button>
            </div>
          </div>
        )}

        {/* CENÁRIO 1: Usuário é Titular de um Grupo Ativo */}
        {groupOverview.hasGroup && groupOverview.isOwner && groupOverview.group && (
          <div className="space-y-6" id="group-owner-view">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface-elevated/50 p-4 rounded-xl border border-border-theme">
              <div>
                <span className="text-[11px] font-medium text-text-secondary">Nome do Grupo</span>
                <h4 className="text-base font-bold text-text-primary">{groupOverview.group.name}</h4>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-semibold">
                  Grupo Ativo (Titular)
                </span>
                <button
                  id="btn-dissolve-group"
                  type="button"
                  disabled={isLoading}
                  onClick={handleDissolveGroup}
                  className="px-3 py-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl hover:bg-rose-500/20 transition-colors disabled:opacity-50"
                >
                  Dissolver Grupo
                </button>
              </div>
            </div>

            {/* Formulário de Novo Convite */}
            {groupOverview.group.availableSlots > 0 && (
              <form
                id="form-invite-member"
                onSubmit={handleInviteMember}
                className="bg-surface border border-border-theme p-4 rounded-xl space-y-3"
              >
                <span className="text-xs font-bold text-text-primary block">
                  Convidar Novo Membro ({groupOverview.group.availableSlots} vagas restantes)
                </span>
                <div className="flex flex-col sm:flex-row gap-3">
                  <input
                    id="input-invite-email"
                    type="email"
                    required
                    placeholder="Digite o e-mail do participante..."
                    value={inviteEmailInput}
                    onChange={(e) => setInviteEmailInput(e.target.value)}
                    className="flex-1 px-3.5 py-2 text-xs bg-surface-elevated border border-border-theme rounded-xl text-text-primary focus:outline-none focus:ring-1 focus:ring-action-primary"
                  />
                  <button
                    id="btn-submit-invite"
                    type="submit"
                    disabled={isLoading}
                    className="px-4 py-2 text-xs font-semibold bg-action-primary text-action-primary-text rounded-xl hover:opacity-90 transition-opacity shadow-sm disabled:opacity-50 whitespace-nowrap"
                  >
                    {isLoading ? 'Gerando...' : '+ Gerar Convite'}
                  </button>
                </div>
                <p className="text-[11px] text-text-secondary">
                  Limite de 5 envios/reenvios por hora. O link gerado expira em 7 dias e deve ser aceito pelo mesmo e-mail informado.
                </p>
              </form>
            )}

            {/* Tabela de Membros */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-text-primary uppercase tracking-wider">
                Membros Participantes ({groupOverview.members.length})
              </h4>
              <div className="overflow-x-auto border border-border-theme rounded-xl">
                <table className="w-full text-xs text-left">
                  <thead className="bg-surface-elevated text-text-secondary border-b border-border-theme">
                    <tr>
                      <th className="p-3">Nome / Usuário</th>
                      <th className="p-3">E-mail</th>
                      <th className="p-3">Papel</th>
                      <th className="p-3">Status</th>
                      <th className="p-3">Data de Entrada</th>
                      <th className="p-3 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-theme">
                    {groupOverview.members.map((member) => (
                      <tr key={member.id} className="hover:bg-surface-elevated/40">
                        <td className="p-3 font-semibold text-text-primary">{member.name}</td>
                        <td className="p-3 text-text-secondary">{member.email}</td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                              member.role === 'owner'
                                ? 'bg-action-primary/10 text-action-primary border border-action-primary/20'
                                : 'bg-surface-elevated text-text-secondary border border-border-theme'
                            }`}
                          >
                            {member.role === 'owner' ? 'Titular' : 'Membro'}
                          </span>
                        </td>
                        <td className="p-3">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              member.status === 'active'
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                : 'bg-surface-elevated text-text-secondary'
                            }`}
                          >
                            {member.status === 'active' ? 'Ativo' : 'Inativo'}
                          </span>
                        </td>
                        <td className="p-3 text-text-secondary">{formatDate(member.joinedAt)}</td>
                        <td className="p-3 text-right">
                          {member.role !== 'owner' && member.status === 'active' && (
                            <button
                              type="button"
                              onClick={() => handleRemoveMember(member.userId, member.name)}
                              className="text-rose-600 dark:text-rose-400 hover:underline font-semibold"
                            >
                              Remover
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Tabela de Convites Pendentes */}
            {groupOverview.invitations.length > 0 && (
              <div className="space-y-3 pt-2">
                <h4 className="text-xs font-bold text-text-primary uppercase tracking-wider">
                  Histórico e Status de Convites ({groupOverview.invitations.length})
                </h4>
                <div className="overflow-x-auto border border-border-theme rounded-xl">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-surface-elevated text-text-secondary border-b border-border-theme">
                      <tr>
                        <th className="p-3">E-mail Convidado</th>
                        <th className="p-3">Status</th>
                        <th className="p-3">Expira em</th>
                        <th className="p-3">Emitido em</th>
                        <th className="p-3 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-theme">
                      {groupOverview.invitations.map((inv) => (
                        <tr key={inv.id} className="hover:bg-surface-elevated/40">
                          <td className="p-3 font-semibold text-text-primary">{inv.invitedEmail}</td>
                          <td className="p-3">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                                inv.status === 'pending'
                                  ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                                  : inv.status === 'accepted'
                                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                  : 'bg-surface-elevated text-text-secondary'
                              }`}
                            >
                              {inv.status === 'pending'
                                ? 'Pendente'
                                : inv.status === 'accepted'
                                ? 'Aceito'
                                : inv.status === 'expired'
                                ? 'Expirado'
                                : inv.status === 'revoked'
                                ? 'Revogado'
                                : 'Recusado'}
                            </span>
                          </td>
                          <td className="p-3 text-text-secondary">{formatDate(inv.expiresAt)}</td>
                          <td className="p-3 text-text-secondary">{formatDate(inv.createdAt)}</td>
                          <td className="p-3 text-right space-x-2">
                            {(inv.status === 'pending' || inv.status === 'expired') && (
                              <button
                                type="button"
                                onClick={() => handleResendInvite(inv.id)}
                                className="text-action-primary hover:underline font-semibold"
                              >
                                Reenviar
                              </button>
                            )}
                            {inv.status === 'pending' && (
                              <button
                                type="button"
                                onClick={() => handleRevokeInvite(inv.id)}
                                className="text-rose-600 dark:text-rose-400 hover:underline font-semibold"
                              >
                                Revogar
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        {/* CENÁRIO 2: Usuário é Membro Convidado de um Grupo Ativo */}
        {groupOverview.hasGroup && groupOverview.isMember && groupOverview.group && (
          <div className="space-y-5" id="group-member-view">
            <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-5 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <span className="text-[11px] font-semibold text-indigo-700 dark:text-indigo-300 uppercase tracking-wider">
                    Vínculo de Membro Ativo
                  </span>
                  <h4 className="text-base font-bold text-text-primary mt-0.5">
                    {groupOverview.group.name}
                  </h4>
                  <p className="text-xs text-text-secondary mt-1">
                    Administrado por: <strong>{groupOverview.ownerName ?? 'Titular Pagante'}</strong> ({groupOverview.ownerEmail ?? '—'})
                  </p>
                </div>
                <button
                  id="btn-leave-group"
                  type="button"
                  disabled={isLoading}
                  onClick={handleLeaveGroup}
                  className="px-3.5 py-1.5 text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl hover:bg-rose-500/20 transition-colors disabled:opacity-50 self-start sm:self-auto"
                >
                  Deixar Grupo
                </button>
              </div>
              <div className="pt-2 border-t border-indigo-500/20 text-xs text-text-secondary leading-relaxed">
                Você usufrui dos benefícios e quotas do Plano Compartilhado. Suas carteiras, lançamentos e relatórios são <strong>100% privados</strong> e inacessíveis pelo titular ou outros membros.
              </div>
            </div>
          </div>
        )}

        {/* CENÁRIO 3: Usuário é Elegível para Criar Grupo (Assinatura do Plano Compartilhado Ativa sem Grupo Criado) */}
        {!groupOverview.hasGroup && groupOverview.isEligibleToCreate && (
          <form
            id="form-create-group"
            onSubmit={handleCreateGroup}
            className="bg-surface-elevated/40 border border-border-theme p-6 rounded-2xl space-y-4"
          >
            <div>
              <h4 className="text-base font-bold text-text-primary">
                Inicialize seu Grupo Compartilhado
              </h4>
              <p className="text-xs text-text-secondary mt-1">
                Sua assinatura do Plano Compartilhado permite criar um grupo para até 5 pessoas (você + até 4 convidados).
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                id="input-group-name"
                type="text"
                required
                placeholder="Ex: Família Silva ou Time de Investimentos"
                value={groupNameInput}
                onChange={(e) => setGroupNameInput(e.target.value)}
                className="flex-1 px-3.5 py-2 text-xs bg-surface border border-border-theme rounded-xl text-text-primary focus:outline-none focus:ring-1 focus:ring-action-primary"
              />
              <button
                id="btn-submit-create-group"
                type="submit"
                disabled={isLoading}
                className="px-4 py-2 text-xs font-semibold bg-action-primary text-action-primary-text rounded-xl hover:opacity-90 transition-opacity shadow-sm disabled:opacity-50"
              >
                {isLoading ? 'Criando...' : 'Criar Grupo'}
              </button>
            </div>
          </form>
        )}

        {/* CENÁRIO 4: Usuário não possui grupo e não possui assinatura do Plano Compartilhado */}
        {!groupOverview.hasGroup && !groupOverview.isEligibleToCreate && (
          <div
            id="group-educational-card"
            className="bg-surface-elevated/30 border border-border-theme p-5 rounded-xl text-xs text-text-secondary leading-relaxed space-y-2"
          >
            <strong className="text-text-primary block font-semibold">
              Como funciona o Plano Compartilhado do CarteiraExpert?
            </strong>
            <p>
              O Plano Compartilhado é contratado pelo titular pagante e permite convidar até 4 membros da família ou equipe. Cada usuário recebe sua própria quota independente de carteiras com isolamento financeiro total garantido por arquitetura (ADR-004).
            </p>
            <p className="text-[11px] text-text-secondary/80">
              A contratação do Plano Compartilhado estará disponível futuramente.
            </p>
          </div>
        )}
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
              Toda consulta de limites e planos é estritamente vinculada ao seu usuário autenticado no servidor. Nenhuma informação financeira é exposta entre contas de membros.
            </p>
          </div>
          <div className="space-y-1">
            <strong className="text-text-primary font-semibold block">Preservação Inviolável</strong>
            <p className="text-[11px] leading-relaxed">
              Em caso de downgrade ou dissolução de grupo, nenhuma carteira é apagada. Carteiras excedentes são congeladas em modo somente leitura e permanecem seguras para reativação futura.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
