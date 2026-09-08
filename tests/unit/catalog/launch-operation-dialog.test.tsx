/**
 * @vitest-environment jsdom
 */
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LaunchOperationDialog } from '@/modules/catalog/ui/LaunchOperationDialog';

describe('LaunchOperationDialog — Validação de Bloqueio de Compra para Delisted', () => {
  let container: HTMLDivElement | null = null;
  let root: ReturnType<typeof createRoot> | null = null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root && container) {
      act(() => {
        root?.unmount();
      });
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    container = null;
    root = null;
  });

  it('deve exibir badge de Não Negociável e NÃO oferecer compra quando status for delisted', async () => {
    await act(async () => {
      root?.render(
        <LaunchOperationDialog
          asset={{
            id: 'asset-delisted-uuid',
            ticker: 'AMBV4',
            name: 'AMBEV S.A. - PN',
            assetType: 'stock',
            market: 'B3',
            currency: 'BRL',
            isTradeable: false,
            status: 'delisted',
          }}
          userPortfolios={[{ id: 'p1', name: 'Carteira Principal', baseCurrency: 'BRL', status: 'active' }]}
          isAuthenticated={true}
          callbackUrl="/acoes/AMBV4"
        />
      );
    });

    const badge = container?.querySelector('#badge-delisted-untradeable');
    expect(badge).not.toBeNull();
    expect(badge?.textContent).toContain('Ativo Não Negociável (Delisted / Histórico)');

    const btn = container?.querySelector('#btn-open-launch-dialog');
    expect(btn).toBeNull();
  });

  it('deve exibir badge de Não Negociável quando isTradeable for false mesmo com status indefinido', async () => {
    await act(async () => {
      root?.render(
        <LaunchOperationDialog
          asset={{
            id: 'asset-untradeable-uuid',
            ticker: 'MXRF12',
            name: 'FII MAXI RENDA - DIR',
            assetType: 'stock',
            market: 'B3',
            currency: 'BRL',
            isTradeable: false,
          }}
          userPortfolios={[{ id: 'p1', name: 'Carteira Principal', baseCurrency: 'BRL', status: 'active' }]}
          isAuthenticated={true}
          callbackUrl="/acoes/MXRF12"
        />
      );
    });

    const badge = container?.querySelector('#badge-delisted-untradeable');
    expect(badge).not.toBeNull();
    expect(container?.querySelector('#btn-open-launch-dialog')).toBeNull();
  });

  it('deve exibir botão normal de lançamento quando ativo for ativo e negociável', async () => {
    await act(async () => {
      root?.render(
        <LaunchOperationDialog
          asset={{
            id: 'asset-active-uuid',
            ticker: 'PETR4',
            name: 'PETROBRAS - PN N2',
            assetType: 'stock',
            market: 'B3',
            currency: 'BRL',
            isTradeable: true,
            status: 'active',
          }}
          userPortfolios={[{ id: 'p1', name: 'Carteira Principal', baseCurrency: 'BRL', status: 'active' }]}
          isAuthenticated={true}
          callbackUrl="/acoes/PETR4"
        />
      );
    });

    const badge = container?.querySelector('#badge-delisted-untradeable');
    expect(badge).toBeNull();

    const btn = container?.querySelector('#btn-open-launch-dialog');
    expect(btn).not.toBeNull();
    expect(btn?.textContent).toContain('Lançar em Carteira');
  });
});
