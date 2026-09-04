/**
 * @vitest-environment jsdom
 */
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  SubscriptionPanel,
  SubscriptionStatusBadge,
  AllocateSubscriptionModal,
  ExerciseSubscriptionModal,
  CancelSubscriptionModal,
} from '../../../src/modules/corporate-actions/ui';
import * as subscriptionActions from '../../../src/modules/corporate-actions/server/subscription.actions';
import type {
  SubscriptionRightWithOfferAndAssets,
  SubscriptionOfferWithAssets,
} from '../../../src/modules/corporate-actions/server/subscription.service';

// Mock do next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: vi.fn(),
  }),
}));

describe('UI: Subscription Components e Modais (S1.5)', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    vi.clearAllMocks();
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

  function changeInput(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
    const prototype =
      element instanceof HTMLInputElement
        ? HTMLInputElement.prototype
        : HTMLTextAreaElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
    if (setter) {
      setter.call(element, value);
    } else {
      element.value = value;
    }
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
  }

  const mockOffer: SubscriptionOfferWithAssets = {
    id: 'offer-1',
    originAssetId: 'origin-1',
    rightAssetId: 'right-1',
    targetAssetId: 'target-1',
    cutOffDate: new Date('2026-08-01T00:00:00.000Z'),
    exerciseStartDate: new Date('2026-08-05T00:00:00.000Z'),
    exerciseEndDate: new Date('2026-08-30T00:00:00.000Z'),
    exercisePrice: '10.50000000',
    currency: 'BRL',
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'user-1',
    originAsset: {
      id: 'origin-1',
      ticker: 'HGLG11',
      name: 'CSHG Logística FII',
      assetType: 'fii',
      currency: 'BRL',
    },
    rightAsset: {
      id: 'right-1',
      ticker: 'HGLG12',
      name: 'Direito de Subscrição HGLG',
      assetType: 'subscription_right',
      currency: 'BRL',
    },
    targetAsset: {
      id: 'target-1',
      ticker: 'HGLG11',
      name: 'CSHG Logística FII',
      assetType: 'fii',
      currency: 'BRL',
    },
  };

  const createMockSubscription = (
    status: 'ACTIVE' | 'PARTIALLY_EXERCISED' | 'FULLY_EXERCISED' | 'EXPIRED' | 'CANCELLED',
    allocated = '100.0000000000',
    exercised = '0.0000000000',
    remaining = '100.0000000000'
  ): SubscriptionRightWithOfferAndAssets => ({
    id: `sub-${status.toLowerCase()}`,
    portfolioId: 'port-1',
    offerId: mockOffer.id,
    allocatedQuantity: allocated,
    exercisedQuantity: exercised,
    remainingQuantity: remaining,
    status: status === 'EXPIRED' ? 'ACTIVE' : status,
    projectedStatus: status,
    createdAt: new Date(),
    updatedAt: new Date(),
    createdBy: 'user-1',
    deletedAt: status === 'CANCELLED' ? new Date() : null,
    cancellationReason: status === 'CANCELLED' ? 'Cancelado pelo usuário' : null,
    offer: mockOffer,
  });

  // 1. Renderização de oferta disponível
  it('1. Renderização de oferta disponível na seção colapsável do SubscriptionPanel', async () => {
    await render(
      <SubscriptionPanel
        portfolioId="port-1"
        subscriptions={[]}
        availableOffers={[mockOffer]}
      />
    );

    expect(container.textContent).toContain('Direitos de Subscrição');
    expect(container.textContent).toContain('Ofertas de Subscrição Disponíveis no Mercado (1)');

    // Abre seção de ofertas
    const toggleBtn = container.querySelector('[data-testid="toggle-available-offers-btn"]') as HTMLButtonElement;
    expect(toggleBtn).not.toBeNull();
    await act(async () => {
      toggleBtn.click();
    });

    expect(container.textContent).toContain('HGLG12');
    expect(container.textContent).toContain('CSHG Logística FII');
    expect(container.textContent).toContain('10.50');
  });

  // 2. Renderização de direito ACTIVE
  it('2. Renderização de direito ACTIVE com tickers, status e botões de ação', async () => {
    const activeSub = createMockSubscription('ACTIVE', '100.0000000000', '0.0000000000', '100.0000000000');
    await render(
      <SubscriptionPanel
        portfolioId="port-1"
        subscriptions={[activeSub]}
      />
    );

    expect(container.textContent).toContain('HGLG12');
    expect(container.textContent).toContain('Origem: HGLG11');
    expect(container.textContent).toContain('Ativo');
    expect(container.querySelector(`[data-testid="exercise-btn-${activeSub.id}"]`)).not.toBeNull();
    expect(container.querySelector(`[data-testid="cancel-btn-${activeSub.id}"]`)).not.toBeNull();
  });

  // 3. Renderização de direito PARTIALLY_EXERCISED
  it('3. Renderização de direito PARTIALLY_EXERCISED', async () => {
    const partialSub = createMockSubscription('PARTIALLY_EXERCISED', '100.0000000000', '40.0000000000', '60.0000000000');
    await render(
      <SubscriptionPanel
        portfolioId="port-1"
        subscriptions={[partialSub]}
      />
    );

    expect(container.textContent).toContain('Parcialmente Exercido');
    expect(container.querySelector(`[data-testid="exercise-btn-${partialSub.id}"]`)).not.toBeNull();
    expect(container.querySelector(`[data-testid="cancel-btn-${partialSub.id}"]`)).not.toBeNull();
  });

  // 4. Exibição do saldo remanescente
  it('4. Exibição correta do saldo remanescente formatado', async () => {
    const sub = createMockSubscription('ACTIVE', '250.0000000000', '50.0000000000', '200.0000000000');
    await render(
      <SubscriptionPanel
        portfolioId="port-1"
        subscriptions={[sub]}
      />
    );

    const remainingEl = container.querySelector(`[data-testid="remaining-qty-${sub.id}"]`);
    expect(remainingEl?.textContent?.trim()).toBe('200');
  });

  // 5. Ausência do botão de exercício para FULLY_EXERCISED
  it('5. Ausência do botão de exercício e cancelamento para FULLY_EXERCISED', async () => {
    const fullSub = createMockSubscription('FULLY_EXERCISED', '100.0000000000', '100.0000000000', '0.0000000000');
    await render(
      <SubscriptionPanel
        portfolioId="port-1"
        subscriptions={[fullSub]}
      />
    );

    expect(container.textContent).toContain('Totalmente Exercido');
    expect(container.querySelector(`[data-testid="exercise-btn-${fullSub.id}"]`)).toBeNull();
    expect(container.querySelector(`[data-testid="cancel-btn-${fullSub.id}"]`)).toBeNull();
  });

  // 6. Ausência do botão de exercício para EXPIRED
  it('6. Ausência do botão de exercício e cancelamento para EXPIRED', async () => {
    const expiredSub = createMockSubscription('EXPIRED', '100.0000000000', '0.0000000000', '100.0000000000');
    await render(
      <SubscriptionPanel
        portfolioId="port-1"
        subscriptions={[expiredSub]}
      />
    );

    expect(container.textContent).toContain('Expirado');
    expect(container.querySelector(`[data-testid="exercise-btn-${expiredSub.id}"]`)).toBeNull();
    expect(container.querySelector(`[data-testid="cancel-btn-${expiredSub.id}"]`)).toBeNull();
  });

  // 7. Ausência do botão de cancelamento para CANCELLED
  it('7. Ausência de ações para CANCELLED', async () => {
    const cancelledSub = createMockSubscription('CANCELLED', '100.0000000000', '0.0000000000', '0.0000000000');
    await render(
      <SubscriptionPanel
        portfolioId="port-1"
        subscriptions={[cancelledSub]}
      />
    );

    expect(container.textContent).toContain('Cancelado');
    expect(container.querySelector(`[data-testid="exercise-btn-${cancelledSub.id}"]`)).toBeNull();
    expect(container.querySelector(`[data-testid="cancel-btn-${cancelledSub.id}"]`)).toBeNull();
  });

  // 8. Validação de quantidade inválida no modal de exercício
  it('8. Validação de quantidade inválida (bloqueia envio com quantidade zero ou superior ao saldo)', async () => {
    const activeSub = createMockSubscription('ACTIVE', '100.0000000000', '0.0000000000', '100.0000000000');
    await render(
      <ExerciseSubscriptionModal
        isOpen={true}
        onClose={vi.fn()}
        subscription={activeSub}
      />
    );

    const submitBtn = container.querySelector('[data-testid="exercise-submit-btn"]') as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);

    const qtyInput = container.querySelector('#exercise-quantity-input') as HTMLInputElement;
    await act(async () => {
      changeInput(qtyInput, '150'); // Superior aos 100 disponíveis
    });

    expect(submitBtn.disabled).toBe(true);
  });

  // 9. Submissão do formulário de exercício e chamada da Server Action
  it('9. Submissão do formulário de exercício chama exerciseSubscriptionAction com dados corretos', async () => {
    const activeSub = createMockSubscription('ACTIVE', '100.0000000000', '0.0000000000', '100.0000000000');
    const actionSpy = vi.spyOn(subscriptionActions, 'exerciseSubscriptionAction').mockResolvedValue({
      success: true,
      data: {
        exercise: {
          id: 'ex-1',
          subscriptionRightId: activeSub.id,
          portfolioEventId: 'event-1',
          exercisedQuantity: '50.0000000000',
          exercisePrice: '10.50000000',
          fees: '0.00000000',
          totalCost: '525.00000000',
          exerciseDate: new Date(),
          idempotencyKey: 'idem-1',
          createdAt: new Date(),
          createdBy: 'user-1',
        },
        event: {
          id: 'event-1',
          portfolioId: 'port-1',
          assetId: mockOffer.targetAssetId,
          type: 'BUY',
          direction: null,
          source: 'corporate_action',
          tradeDate: new Date(),
          settlementDate: null,
          quantity: '50.0000000000',
          unitPrice: '10.50000000',
          currency: 'BRL',
          fees: '0.00000000',
          custodyAccountId: null,
          notes: null,
          createdAt: new Date(),
          createdBy: 'user-1',
          deletedAt: null,
          cancellationReason: null,
        },
        subscriptionRight: {
          ...activeSub,
          status: 'PARTIALLY_EXERCISED',
          exercisedQuantity: '50.0000000000',
        },
      },
    });

    const onSuccess = vi.fn();
    await render(
      <ExerciseSubscriptionModal
        isOpen={true}
        onClose={vi.fn()}
        subscription={activeSub}
        onSuccess={onSuccess}
      />
    );

    const qtyInput = container.querySelector('#exercise-quantity-input') as HTMLInputElement;
    await act(async () => {
      changeInput(qtyInput, '50');
    });

    const submitBtn = container.querySelector('[data-testid="exercise-submit-btn"]') as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(false);

    await act(async () => {
      submitBtn.click();
    });

    expect(actionSpy).toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalled();
    // Exibe custo liquidado pelo servidor
    expect(container.querySelector('[data-testid="exercised-total-cost"]')?.textContent).toContain('525,00');
  });

  // 10. Rejeição de exercisePrice e totalCost como campos editáveis
  it('10. Garante que exercisePrice e totalCost NÃO são inputs editáveis no modal de exercício', async () => {
    const activeSub = createMockSubscription('ACTIVE', '100.0000000000', '0.0000000000', '100.0000000000');
    await render(
      <ExerciseSubscriptionModal
        isOpen={true}
        onClose={vi.fn()}
        subscription={activeSub}
      />
    );

    // Não existe input editável para exercisePrice ou totalCost
    expect(container.querySelector('input[name="exercisePrice"]')).toBeNull();
    expect(container.querySelector('input[name="totalCost"]')).toBeNull();

    // Preço de exercício da oferta é renderizado em elemento somente leitura
    const readonlyPrice = container.querySelector('[data-testid="readonly-exercise-price"]');
    expect(readonlyPrice).not.toBeNull();
    expect(readonlyPrice?.textContent).toContain('10.50');
  });

  // 11. Tratamento de erro retornado pela Server Action
  it('11. Exibe mensagem de erro retornada pela Server Action quando o exercício falha', async () => {
    const activeSub = createMockSubscription('ACTIVE', '100.0000000000', '0.0000000000', '100.0000000000');
    vi.spyOn(subscriptionActions, 'exerciseSubscriptionAction').mockResolvedValue({
      success: false,
      error: 'O período de exercício deste direito expirou no servidor.',
    });

    await render(
      <ExerciseSubscriptionModal
        isOpen={true}
        onClose={vi.fn()}
        subscription={activeSub}
      />
    );

    const qtyInput = container.querySelector('#exercise-quantity-input') as HTMLInputElement;
    await act(async () => {
      changeInput(qtyInput, '50');
    });

    const submitBtn = container.querySelector('[data-testid="exercise-submit-btn"]') as HTMLButtonElement;
    await act(async () => {
      submitBtn.click();
    });

    const errorEl = container.querySelector('[data-testid="exercise-error-message"]');
    expect(errorEl).not.toBeNull();
    expect(errorEl?.textContent).toContain('O período de exercício deste direito expirou');
  });

  // 12. Estado de carregamento e bloqueio contra duplo envio
  it('12. Bloqueia botão de envio enquanto processa a requisição (pending state)', async () => {
    const activeSub = createMockSubscription('ACTIVE', '100.0000000000', '0.0000000000', '100.0000000000');
    let resolveAction!: (val: any) => void;
    const promise = new Promise((res) => {
      resolveAction = res;
    });

    vi.spyOn(subscriptionActions, 'exerciseSubscriptionAction').mockImplementation(() => promise as any);

    await render(
      <ExerciseSubscriptionModal
        isOpen={true}
        onClose={vi.fn()}
        subscription={activeSub}
      />
    );

    const qtyInput = container.querySelector('#exercise-quantity-input') as HTMLInputElement;
    await act(async () => {
      changeInput(qtyInput, '50');
    });

    const submitBtn = container.querySelector('[data-testid="exercise-submit-btn"]') as HTMLButtonElement;

    // Inicia submissão sem aguardar resolução imediata
    let clickPromise: Promise<void>;
    act(() => {
      clickPromise = (async () => {
        submitBtn.click();
      })();
    });

    // Enquanto pendente, deve estar desabilitado
    expect(submitBtn.disabled).toBe(true);
    expect(submitBtn.textContent).toContain('Processando...');

    await act(async () => {
      resolveAction({ success: true, data: { exercise: {}, event: {}, subscriptionRight: {} } });
      await clickPromise;
    });
  });

  // 13. Confirmação e submissão de cancelamento
  it('13. Modal de cancelamento exige motivo com min 3 caracteres e chama cancelSubscriptionRightAction', async () => {
    const activeSub = createMockSubscription('ACTIVE', '100.0000000000', '0.0000000000', '100.0000000000');
    const cancelSpy = vi.spyOn(subscriptionActions, 'cancelSubscriptionRightAction').mockResolvedValue({
      success: true,
      data: {
        ...activeSub,
        status: 'CANCELLED',
      },
    });

    const onSuccess = vi.fn();
    await render(
      <CancelSubscriptionModal
        isOpen={true}
        onClose={vi.fn()}
        subscription={activeSub}
        onSuccess={onSuccess}
      />
    );

    const submitBtn = container.querySelector('[data-testid="cancel-submit-btn"]') as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);

    const reasonInput = container.querySelector('#cancel-reason-input') as HTMLTextAreaElement;
    await act(async () => {
      changeInput(reasonInput, 'Optei por não exercer a subscrição nesta emissão');
    });

    expect(submitBtn.disabled).toBe(false);

    await act(async () => {
      submitBtn.click();
    });

    expect(cancelSpy).toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalled();
  });

  // 14. Atribuição de direitos e atualização da interface após sucesso
  it('14. Modal de atribuição de direitos submete allocateSubscriptionRightAction e executa onSuccess', async () => {
    vi.spyOn(subscriptionActions, 'listAvailableOffersAction').mockResolvedValue({
      success: true,
      data: [mockOffer],
    });

    const allocateSpy = vi.spyOn(subscriptionActions, 'allocateSubscriptionRightAction').mockResolvedValue({
      success: true,
      data: createMockSubscription('ACTIVE', '100.0000000000'),
    });

    const onSuccess = vi.fn();
    await render(
      <AllocateSubscriptionModal
        isOpen={true}
        onClose={vi.fn()}
        portfolioId="port-1"
        onSuccess={onSuccess}
      />
    );

    // Aguarda carregar ofertas
    await act(async () => {
      await Promise.resolve();
    });

    const qtyInput = container.querySelector('#allocated-quantity-input') as HTMLInputElement;
    await act(async () => {
      changeInput(qtyInput, '100');
    });

    const submitBtn = container.querySelector('[data-testid="allocate-submit-btn"]') as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(false);

    await act(async () => {
      submitBtn.click();
    });

    expect(allocateSpy).toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalled();
  });
});
