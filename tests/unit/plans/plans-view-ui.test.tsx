/**
 * @vitest-environment jsdom
 */
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PlansView } from '@/modules/plans/ui/PlansView';
import type { CommercialPlan, PlanQuotaSummary } from '@/modules/plans/domain/plan.types';
import type { UserBillingSummary } from '@/modules/billing/domain/billing.types';

// Mock do next/link
vi.mock('next/link', () => ({
  default: ({ children, href, id, className }: any) => (
    <a href={href} id={id} className={className}>
      {children}
    </a>
  ),
}));

const mockPlans: CommercialPlan[] = [
  {
    id: 'free',
    name: 'Plano Free',
    description: 'Plano gratuito individual',
    maxActivePortfolios: 2,
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  },
  {
    id: 'pro',
    name: 'Plano Pro',
    description: 'Plano profissional avançado',
    maxActivePortfolios: 10,
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  },
];

describe('UI: PlansView (Unit)', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  });

  async function render(element: React.ReactElement) {
    await act(async () => {
      root.render(element);
    });
  }

  it('1. deve renderizar corretamente para usuário no Plano Free sem assinatura', async () => {
    const quotaSummary: PlanQuotaSummary = {
      planId: 'free',
      planName: 'Plano Free',
      maxActivePortfolios: 2,
      activePortfoliosCount: 1,
      frozenPortfoliosCount: 0,
      archivedPortfoliosCount: 0,
      availableSlots: 1,
      canCreateMore: true,
    };

    const billingSummary: UserBillingSummary = {
      hasSubscription: false,
      subscription: null,
      effectivePlanId: 'free',
      effectivePlanName: 'Plano Free',
      maxActivePortfolios: 2,
      status: 'no_subscription',
      isPastDue: false,
      isCanceled: false,
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null,
      gracePeriodEndsAt: null,
      provider: null,
    };

    await render(
      <PlansView
        plans={mockPlans}
        quotaSummary={quotaSummary}
        billingSummary={billingSummary}
      />
    );

    // Badges e títulos
    expect(container.querySelector('#effective-plan-badge')?.textContent).toContain('Plano Free');
    expect(container.querySelector('#quota-usage-indicator')?.textContent).toContain('1 de 2 ativas (1 disponível)');
    expect(container.querySelector('#subscription-status-tag')?.textContent).toContain('Sem assinatura ativa');

    // Botão de upgrade desabilitado e explicativo
    const upgradeBtn = container.querySelector('#btn-upgrade-pro') as HTMLButtonElement;
    expect(upgradeBtn).not.toBeNull();
    expect(upgradeBtn.disabled).toBe(true);
    expect(upgradeBtn.textContent).toContain('Upgrade Automatizado Indisponível');

    // Não deve haver alerta de congelamento
    expect(container.querySelector('#frozen-portfolios-alert')).toBeNull();

    // Não deve haver inputs de pagamento ou checkout
    expect(container.querySelector('input[name="cardNumber"]')).toBeNull();
    expect(container.querySelector('input[type="payment"]')).toBeNull();
  });

  it('2. deve exibir alerta destacado quando houver carteiras congeladas', async () => {
    const quotaSummary: PlanQuotaSummary = {
      planId: 'free',
      planName: 'Plano Free',
      maxActivePortfolios: 2,
      activePortfoliosCount: 2,
      frozenPortfoliosCount: 3,
      archivedPortfoliosCount: 0,
      availableSlots: 0,
      canCreateMore: false,
    };

    const billingSummary: UserBillingSummary = {
      hasSubscription: false,
      subscription: null,
      effectivePlanId: 'free',
      effectivePlanName: 'Plano Free',
      maxActivePortfolios: 2,
      status: 'no_subscription',
      isPastDue: false,
      isCanceled: false,
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null,
      gracePeriodEndsAt: null,
      provider: null,
    };

    await render(
      <PlansView
        plans={mockPlans}
        quotaSummary={quotaSummary}
        billingSummary={billingSummary}
      />
    );

    const frozenAlert = container.querySelector('#frozen-portfolios-alert');
    expect(frozenAlert).not.toBeNull();
    expect(frozenAlert?.textContent).toContain('3 carteira(s) em estado congelado');
  });

  it('3. deve renderizar corretamente para usuário no Plano Pro com assinatura ativa', async () => {
    const quotaSummary: PlanQuotaSummary = {
      planId: 'pro',
      planName: 'Plano Pro',
      maxActivePortfolios: 10,
      activePortfoliosCount: 4,
      frozenPortfoliosCount: 0,
      archivedPortfoliosCount: 0,
      availableSlots: 6,
      canCreateMore: true,
    };

    const billingSummary: UserBillingSummary = {
      hasSubscription: true,
      subscription: {
        id: 'sub-1',
        userId: 'user-1',
        planId: 'pro',
        status: 'active',
        billingCycle: 'monthly',
        currentPeriodStart: new Date('2026-08-01T00:00:00Z'),
        currentPeriodEnd: new Date('2026-09-01T00:00:00Z'),
        cancelAtPeriodEnd: false,
        canceledAt: null,
        endedAt: null,
        gracePeriodEndsAt: null,
        provider: 'internal',
        providerSubscriptionId: null,
        providerCustomerId: null,
        metadata: null,
        createdAt: new Date('2026-08-01T00:00:00Z'),
        updatedAt: new Date('2026-08-01T00:00:00Z'),
      },
      effectivePlanId: 'pro',
      effectivePlanName: 'Plano Pro',
      maxActivePortfolios: 10,
      status: 'active',
      isPastDue: false,
      isCanceled: false,
      cancelAtPeriodEnd: false,
      currentPeriodEnd: new Date('2026-09-01T00:00:00Z'),
      gracePeriodEndsAt: null,
      provider: 'internal',
    };

    await render(
      <PlansView
        plans={mockPlans}
        quotaSummary={quotaSummary}
        billingSummary={billingSummary}
      />
    );

    expect(container.querySelector('#effective-plan-badge')?.textContent).toContain('Plano Pro');
    expect(container.querySelector('#subscription-status-tag')?.textContent).toContain('Assinatura Ativa');
    expect(container.querySelector('#quota-usage-indicator')?.textContent).toContain('4 de 10 ativas (6 disponíveis)');

    // No card Pro, deve informar que o plano está ativo em vez do botão de upgrade
    expect(container.querySelector('#btn-upgrade-pro')).toBeNull();
    expect(container.querySelector('#card-plan-pro')?.textContent).toContain('Seu Plano Pro está Ativo');
  });

  it('4. deve exibir status de período de carência para past_due', async () => {
    const quotaSummary: PlanQuotaSummary = {
      planId: 'pro',
      planName: 'Plano Pro',
      maxActivePortfolios: 10,
      activePortfoliosCount: 3,
      frozenPortfoliosCount: 0,
      archivedPortfoliosCount: 0,
      availableSlots: 7,
      canCreateMore: true,
    };

    const billingSummary: UserBillingSummary = {
      hasSubscription: true,
      subscription: {
        id: 'sub-past-due',
        userId: 'user-1',
        planId: 'pro',
        status: 'past_due',
        billingCycle: 'monthly',
        currentPeriodStart: new Date('2026-07-01T00:00:00Z'),
        currentPeriodEnd: new Date('2026-08-01T00:00:00Z'),
        cancelAtPeriodEnd: false,
        canceledAt: null,
        endedAt: null,
        gracePeriodEndsAt: new Date('2026-08-15T00:00:00Z'),
        provider: 'internal',
        providerSubscriptionId: null,
        providerCustomerId: null,
        metadata: null,
        createdAt: new Date('2026-07-01T00:00:00Z'),
        updatedAt: new Date('2026-08-01T00:00:00Z'),
      },
      effectivePlanId: 'pro',
      effectivePlanName: 'Plano Pro',
      maxActivePortfolios: 10,
      status: 'past_due',
      isPastDue: true,
      isCanceled: false,
      cancelAtPeriodEnd: false,
      currentPeriodEnd: new Date('2026-08-01T00:00:00Z'),
      gracePeriodEndsAt: new Date('2026-08-15T00:00:00Z'),
      provider: 'internal',
    };

    await render(
      <PlansView
        plans={mockPlans}
        quotaSummary={quotaSummary}
        billingSummary={billingSummary}
      />
    );

    expect(container.querySelector('#subscription-status-tag')?.textContent).toContain('Pagamento Pendente / Em Carência');
    expect(container.querySelector('#subscription-status-detail')?.textContent).toContain('Período de tolerância concedido');
  });

  it('5. deve exibir status de cancelamento agendado para canceled com cancelAtPeriodEnd', async () => {
    const quotaSummary: PlanQuotaSummary = {
      planId: 'pro',
      planName: 'Plano Pro',
      maxActivePortfolios: 10,
      activePortfoliosCount: 2,
      frozenPortfoliosCount: 0,
      archivedPortfoliosCount: 0,
      availableSlots: 8,
      canCreateMore: true,
    };

    const billingSummary: UserBillingSummary = {
      hasSubscription: true,
      subscription: {
        id: 'sub-canceled',
        userId: 'user-1',
        planId: 'pro',
        status: 'canceled',
        billingCycle: 'monthly',
        currentPeriodStart: new Date('2026-08-01T00:00:00Z'),
        currentPeriodEnd: new Date('2026-09-01T00:00:00Z'),
        cancelAtPeriodEnd: true,
        canceledAt: new Date('2026-08-10T00:00:00Z'),
        endedAt: null,
        gracePeriodEndsAt: null,
        provider: 'internal',
        providerSubscriptionId: null,
        providerCustomerId: null,
        metadata: null,
        createdAt: new Date('2026-08-01T00:00:00Z'),
        updatedAt: new Date('2026-08-10T00:00:00Z'),
      },
      effectivePlanId: 'pro',
      effectivePlanName: 'Plano Pro',
      maxActivePortfolios: 10,
      status: 'canceled',
      isPastDue: false,
      isCanceled: true,
      cancelAtPeriodEnd: true,
      currentPeriodEnd: new Date('2026-09-01T00:00:00Z'),
      gracePeriodEndsAt: null,
      provider: 'internal',
    };

    await render(
      <PlansView
        plans={mockPlans}
        quotaSummary={quotaSummary}
        billingSummary={billingSummary}
      />
    );

    expect(container.querySelector('#subscription-status-tag')?.textContent).toContain('Cancelamento Agendado');
    expect(container.querySelector('#subscription-status-detail')?.textContent).toContain('benefícios permanecem ativos');
  });

  it('6. deve exibir status unpaid (inadimplente), indicação neutra de preço do Pro e governança', async () => {
    const quotaSummary: PlanQuotaSummary = {
      planId: 'free',
      planName: 'Plano Free',
      maxActivePortfolios: 2,
      activePortfoliosCount: 2,
      frozenPortfoliosCount: 1,
      archivedPortfoliosCount: 0,
      availableSlots: 0,
      canCreateMore: false,
    };

    const billingSummary: UserBillingSummary = {
      hasSubscription: true,
      subscription: {
        id: 'sub-unpaid',
        userId: 'user-1',
        planId: 'pro',
        status: 'unpaid',
        billingCycle: 'monthly',
        currentPeriodStart: new Date('2026-07-01T00:00:00Z'),
        currentPeriodEnd: new Date('2026-08-01T00:00:00Z'),
        cancelAtPeriodEnd: false,
        canceledAt: null,
        endedAt: new Date('2026-08-15T00:00:00Z'),
        gracePeriodEndsAt: null,
        provider: 'internal',
        providerSubscriptionId: null,
        providerCustomerId: null,
        metadata: null,
        createdAt: new Date('2026-07-01T00:00:00Z'),
        updatedAt: new Date('2026-08-15T00:00:00Z'),
      },
      effectivePlanId: 'free',
      effectivePlanName: 'Plano Free',
      maxActivePortfolios: 2,
      status: 'unpaid',
      isPastDue: false,
      isCanceled: false,
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null,
      gracePeriodEndsAt: null,
      provider: 'internal',
    };

    await render(
      <PlansView
        plans={mockPlans}
        quotaSummary={quotaSummary}
        billingSummary={billingSummary}
      />
    );

    expect(container.querySelector('#subscription-status-tag')?.textContent).toContain('Inadimplente (Downgrade Aplicado)');
    expect(container.querySelector('#card-plan-free')?.textContent).toContain('R$ 0');
    expect(container.querySelector('#card-plan-free')?.textContent).toContain('Até 2 carteiras ativas');
    expect(container.querySelector('#card-plan-pro')?.textContent).toContain('Preço a definir');
    expect(container.querySelector('#card-plan-pro')?.textContent).toContain('Disponível futuramente');
    expect(container.querySelector('#card-plan-pro')?.textContent).toContain('Até 10 carteiras ativas');
    expect(container.textContent).toContain('Isolamento e Privacidade');
  });
});
