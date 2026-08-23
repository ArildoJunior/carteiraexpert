/**
 * @vitest-environment jsdom
 */
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { TransactionModal } from '../../../src/modules/portfolio/ui/TransactionModal';
import * as portfolioActions from '../../../src/modules/portfolio/server/portfolio.actions';

// Mock do next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: vi.fn(),
  }),
}));

describe('UI: TransactionModal - Seletor de Tipo e Campo Direction', () => {
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

  it('1. não deve renderizar o campo direction quando o tipo for BUY ou SELL', async () => {
    await render(
      <TransactionModal
        isOpen={true}
        onClose={vi.fn()}
        portfolioId="11111111-1111-1111-1111-111111111111"
      />
    );

    // Por padrão, transactionType é BUY
    expect(container.querySelector('#transaction-direction-container')).toBeNull();
    expect(container.querySelector('#transaction-direction-in')).toBeNull();
    expect(container.querySelector('#transaction-direction-out')).toBeNull();

    // Troca para SELL
    const sellBtn = container.querySelector('#transaction-type-sell') as HTMLButtonElement;
    expect(sellBtn).not.toBeNull();
    await act(async () => {
      sellBtn.click();
    });

    expect(container.querySelector('#transaction-direction-container')).toBeNull();
  });

  it('2. deve renderizar o campo direction exclusivamente quando o tipo for MANUAL_ADJUSTMENT', async () => {
    await render(
      <TransactionModal
        isOpen={true}
        onClose={vi.fn()}
        portfolioId="11111111-1111-1111-1111-111111111111"
      />
    );

    const adjustmentBtn = container.querySelector('#transaction-type-adjustment') as HTMLButtonElement;
    expect(adjustmentBtn).not.toBeNull();

    await act(async () => {
      adjustmentBtn.click();
    });

    // Agora o campo direction deve estar visível
    const directionContainer = container.querySelector('#transaction-direction-container');
    expect(directionContainer).not.toBeNull();

    const inBtn = container.querySelector('#transaction-direction-in') as HTMLButtonElement;
    const outBtn = container.querySelector('#transaction-direction-out') as HTMLButtonElement;

    expect(inBtn).not.toBeNull();
    expect(outBtn).not.toBeNull();
    expect(inBtn.textContent).toContain('Entrada (IN)');
    expect(outBtn.textContent).toContain('Saída (OUT)');
  });

  it('3. deve enviar direction no FormData para MANUAL_ADJUSTMENT (IN e OUT)', async () => {
    let capturedFormData: FormData | null = null;
    vi.spyOn(portfolioActions, 'createPortfolioEventAction').mockImplementation(
      async (_prev, formData) => {
        capturedFormData = formData;
        return { success: true, data: {} as any };
      }
    );

    await render(
      <TransactionModal
        isOpen={true}
        onClose={vi.fn()}
        portfolioId="11111111-1111-1111-1111-111111111111"
      />
    );

    // Seleciona MANUAL_ADJUSTMENT
    const adjustmentBtn = container.querySelector('#transaction-type-adjustment') as HTMLButtonElement;
    await act(async () => {
      adjustmentBtn.click();
    });

    // Preenche quantidade e preço
    const qtyInput = container.querySelector('#transaction-quantity') as HTMLInputElement;
    const priceInput = container.querySelector('#transaction-unit-price') as HTMLInputElement;
    await act(async () => {
      qtyInput.value = '50';
      priceInput.value = '10';
    });

    // Submete formulário com direção padrão IN
    const form = container.querySelector('form') as HTMLFormElement;
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(capturedFormData).not.toBeNull();
    expect(capturedFormData!.get('type')).toBe('MANUAL_ADJUSTMENT');
    expect(capturedFormData!.get('direction')).toBe('IN');

    // Agora clica em OUT e submete novamente
    const outBtn = container.querySelector('#transaction-direction-out') as HTMLButtonElement;
    await act(async () => {
      outBtn.click();
    });

    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(capturedFormData!.get('type')).toBe('MANUAL_ADJUSTMENT');
    expect(capturedFormData!.get('direction')).toBe('OUT');
  });

  it('4. NÃO deve enviar direction no FormData para BUY e SELL', async () => {
    let capturedFormData: FormData | null = null;
    vi.spyOn(portfolioActions, 'createPortfolioEventAction').mockImplementation(
      async (_prev, formData) => {
        capturedFormData = formData;
        return { success: true, data: {} as any };
      }
    );

    await render(
      <TransactionModal
        isOpen={true}
        onClose={vi.fn()}
        portfolioId="11111111-1111-1111-1111-111111111111"
      />
    );

    // BUY por padrão
    const form = container.querySelector('form') as HTMLFormElement;
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(capturedFormData).not.toBeNull();
    expect(capturedFormData!.get('type')).toBe('BUY');
    expect(capturedFormData!.get('direction')).toBeNull();

    // Troca para SELL
    const sellBtn = container.querySelector('#transaction-type-sell') as HTMLButtonElement;
    await act(async () => {
      sellBtn.click();
    });

    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });

    expect(capturedFormData!.get('type')).toBe('SELL');
    expect(capturedFormData!.get('direction')).toBeNull();
  });
});
