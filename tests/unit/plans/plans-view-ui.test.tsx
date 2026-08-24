/**
 * @vitest-environment jsdom
 */
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PlansView } from '@/modules/plans/ui/PlansView';
import type { CommercialPlan, PlanQuotaSummary } from '@/modules/plans/domain/plan.types';
import type { BillingGroupOverview } from '@/modules/plans/domain/group.types';
import type { UserBillingSummary } from '@/modules/billing/domain/billing.types';

// Mock do next/link e next/navigation
vi.mock('next/link', () => ({
  default: ({ children, href, id, className }: any) => (
    <a href={href} id={id} className={className}>
      {children}
    </a>
  ),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn(),
  }),
  useSearchParams: () => ({
    get: vi.fn().mockReturnValue(null),
  }),
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
  {
    id: 'shared',
    name: 'Plano Compartilhado',
    description: 'Plano compartilhado para até 5 pessoas',
    maxActivePortfolios: null,
    isActive: true,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  },
];

const mockEmptyGroupOverview: BillingGroupOverview = {
  hasGroup: false,
  group: null,
  userRole: null,
  isOwner: false,
  isMember: false,
  isEligibleToCreate: false,
  ownerName: null,
  ownerEmail: null,
  members: [],
  invitations: [],
  pendingInvitationForUser: null,
};

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
        groupOverview={mockEmptyGroupOverview}
      />
    );

    // Badges e títulos
    expect(container.querySelector('#effective-plan-badge')?.textContent).toContain('Plano Free');
    expect(container.querySelector('#quota-usage-indicator')?.textContent).toContain('1 de 2 ativas (1 disponível)');
    expect(container.querySelector('#subscription-status-tag')?.textContent).toContain('Sem assinatura ativa');

    // Card do Plano Compartilhado exibido com "Preço a definir" e sem R$ 99,99
    const sharedCard = container.querySelector('#card-plan-shared');
    expect(sharedCard).not.toBeNull();
    expect(sharedCard?.textContent).toContain('Plano Compartilhado');
    expect(sharedCard?.textContent).toContain('Preço a definir');
    expect(sharedCard?.textContent).not.toContain('99,99');

    // Botões de contratação desabilitados
    const upgradeSharedBtn = container.querySelector('#btn-upgrade-shared') as HTMLButtonElement;
    expect(upgradeSharedBtn).not.toBeNull();
    expect(upgradeSharedBtn.disabled).toBe(true);

    // Card educativo de grupo presente para usuário sem grupo
    expect(container.querySelector('#group-educational-card')).not.toBeNull();
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
        groupOverview={mockEmptyGroupOverview}
      />
    );

    const frozenAlert = container.querySelector('#frozen-portfolios-alert');
    expect(frozenAlert).not.toBeNull();
    expect(frozenAlert?.textContent).toContain('3 carteira(s) em estado congelado');
  });

  it('3. deve exibir formulário de criação de grupo para titular elegível com assinatura do plano compartilhado', async () => {
    const quotaSummary: PlanQuotaSummary = {
      planId: 'shared',
      planName: 'Plano Compartilhado',
      maxActivePortfolios: null,
      activePortfoliosCount: 0,
      frozenPortfoliosCount: 0,
      archivedPortfoliosCount: 0,
      availableSlots: 0,
      canCreateMore: false,
    };

    const billingSummary: UserBillingSummary = {
      hasSubscription: true,
      subscription: {
        id: 'sub-1',
        userId: 'user-1',
        planId: 'shared',
        status: 'active',
        billingCycle: 'monthly',
        currentPeriodStart: new Date('2026-01-01'),
        currentPeriodEnd: new Date('2026-12-31'),
        cancelAtPeriodEnd: false,
        canceledAt: null,
        endedAt: null,
        gracePeriodEndsAt: null,
        provider: 'internal',
        providerSubscriptionId: null,
        providerCustomerId: null,
        metadata: null,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
      },
      effectivePlanId: 'shared',
      effectivePlanName: 'Plano Compartilhado',
      maxActivePortfolios: null,
      status: 'active',
      isPastDue: false,
      isCanceled: false,
      cancelAtPeriodEnd: false,
      currentPeriodEnd: new Date('2026-12-31'),
      gracePeriodEndsAt: null,
      provider: 'internal',
    };

    const eligibleGroupOverview: BillingGroupOverview = {
      hasGroup: false,
      group: null,
      userRole: null,
      isOwner: false,
      isMember: false,
      isEligibleToCreate: true,
      ownerName: null,
      ownerEmail: null,
      members: [],
      invitations: [],
      pendingInvitationForUser: null,
    };

    await render(
      <PlansView
        plans={mockPlans}
        quotaSummary={quotaSummary}
        billingSummary={billingSummary}
        groupOverview={eligibleGroupOverview}
      />
    );

    expect(container.querySelector('#form-create-group')).not.toBeNull();
    expect(container.querySelector('#input-group-name')).not.toBeNull();
    expect(container.querySelector('#quota-usage-indicator')?.textContent).toContain('0 ativas (Quota a definir)');
  });

  it('4. deve exibir painel completo de administração quando usuário for titular de grupo ativo', async () => {
    const quotaSummary: PlanQuotaSummary = {
      planId: 'shared',
      planName: 'Plano Compartilhado',
      maxActivePortfolios: null,
      activePortfoliosCount: 0,
      frozenPortfoliosCount: 0,
      archivedPortfoliosCount: 0,
      availableSlots: 0,
      canCreateMore: false,
    };

    const billingSummary: UserBillingSummary = {
      hasSubscription: true,
      subscription: {
        id: 'sub-1',
        userId: 'owner-1',
        planId: 'shared',
        status: 'active',
        billingCycle: 'monthly',
        currentPeriodStart: new Date('2026-01-01'),
        currentPeriodEnd: new Date('2026-12-31'),
        cancelAtPeriodEnd: false,
        canceledAt: null,
        endedAt: null,
        gracePeriodEndsAt: null,
        provider: 'internal',
        providerSubscriptionId: null,
        providerCustomerId: null,
        metadata: null,
        createdAt: new Date('2026-01-01'),
        updatedAt: new Date('2026-01-01'),
      },
      effectivePlanId: 'shared',
      effectivePlanName: 'Plano Compartilhado',
      maxActivePortfolios: null,
      status: 'active',
      isPastDue: false,
      isCanceled: false,
      cancelAtPeriodEnd: false,
      currentPeriodEnd: new Date('2026-12-31'),
      gracePeriodEndsAt: null,
      provider: 'internal',
    };

    const ownerGroupOverview: BillingGroupOverview = {
      hasGroup: true,
      group: {
        id: 'group-1',
        name: 'Família Silva',
        ownerUserId: 'owner-1',
        status: 'active',
        maxMembers: 5,
        activeMembersCount: 2,
        pendingInvitesCount: 1,
        availableSlots: 3,
      },
      userRole: 'owner',
      isOwner: true,
      isMember: false,
      isEligibleToCreate: false,
      ownerName: 'Arildo Titular',
      ownerEmail: 'arildo@example.com',
      members: [
        {
          id: 'm-1',
          userId: 'owner-1',
          name: 'Arildo Titular',
          email: 'arildo@example.com',
          role: 'owner',
          status: 'active',
          joinedAt: new Date('2026-01-01'),
          leftAt: null,
        },
        {
          id: 'm-2',
          userId: 'member-2',
          name: 'Beatriz Membro',
          email: 'beatriz@example.com',
          role: 'member',
          status: 'active',
          joinedAt: new Date('2026-01-05'),
          leftAt: null,
        },
      ],
      invitations: [
        {
          id: 'inv-1',
          invitedEmail: 'carlos@example.com',
          status: 'pending',
          expiresAt: new Date('2026-01-20'),
          createdAt: new Date('2026-01-13'),
        },
      ],
      pendingInvitationForUser: null,
    };

    await render(
      <PlansView
        plans={mockPlans}
        quotaSummary={quotaSummary}
        billingSummary={billingSummary}
        groupOverview={ownerGroupOverview}
      />
    );

    expect(container.querySelector('#group-owner-view')).not.toBeNull();
    expect(container.querySelector('#group-capacity-indicator')?.textContent).toContain('2 de 5 vagas');
    expect(container.querySelector('#form-invite-member')).not.toBeNull();
    expect(container.querySelector('#btn-dissolve-group')).not.toBeNull();
    expect(container.textContent).toContain('Família Silva');
    expect(container.textContent).toContain('Beatriz Membro');
    expect(container.textContent).toContain('carlos@example.com');
  });

  it('5. deve exibir painel informativo para membro de grupo com opção de deixar o grupo', async () => {
    const quotaSummary: PlanQuotaSummary = {
      planId: 'shared',
      planName: 'Plano Compartilhado',
      maxActivePortfolios: null,
      activePortfoliosCount: 0,
      frozenPortfoliosCount: 0,
      archivedPortfoliosCount: 0,
      availableSlots: 0,
      canCreateMore: false,
    };

    const billingSummary: UserBillingSummary = {
      hasSubscription: false,
      subscription: null,
      effectivePlanId: 'shared',
      effectivePlanName: 'Plano Compartilhado',
      maxActivePortfolios: null,
      status: 'no_subscription',
      isPastDue: false,
      isCanceled: false,
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null,
      gracePeriodEndsAt: null,
      provider: null,
    };

    const memberGroupOverview: BillingGroupOverview = {
      hasGroup: true,
      group: {
        id: 'group-1',
        name: 'Família Silva',
        ownerUserId: 'owner-1',
        status: 'active',
        maxMembers: 5,
        activeMembersCount: 2,
        pendingInvitesCount: 0,
        availableSlots: 3,
      },
      userRole: 'member',
      isOwner: false,
      isMember: true,
      isEligibleToCreate: false,
      ownerName: 'Arildo Titular',
      ownerEmail: 'arildo@example.com',
      members: [],
      invitations: [],
      pendingInvitationForUser: null,
    };

    await render(
      <PlansView
        plans={mockPlans}
        quotaSummary={quotaSummary}
        billingSummary={billingSummary}
        groupOverview={memberGroupOverview}
      />
    );

    expect(container.querySelector('#group-member-view')).not.toBeNull();
    expect(container.querySelector('#btn-leave-group')).not.toBeNull();
    expect(container.textContent).toContain('Arildo Titular');
    expect(container.textContent).toContain('100% privados');
  });
});
