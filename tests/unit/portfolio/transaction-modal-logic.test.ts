import { describe, it, expect, vi } from 'vitest';
import { Decimal } from '@/lib/decimal';
import type { SerializedAssetPosition } from '../../../src/modules/portfolio/domain/position.types';
import type { ActionResult } from '../../../src/modules/portfolio/server/portfolio.actions';

describe('Unitário: Lógica de Estado e Posição Disponível no Modal de Transação', () => {
  // Simulação do controlador de ciclo de vida do useEffect do TransactionModal
  class TransactionModalStateController {
    public selectedAssetId: string | null = null;
    public transactionType: 'BUY' | 'SELL' = 'BUY';
    public availableQty: string | null = null;
    private activeCleanup: (() => void) | null = null;

    constructor(
      private fetchPositionFn: (
        portfolioId: string,
        assetId: string
      ) => Promise<ActionResult<{ position: SerializedAssetPosition | null }>>
    ) {}

    public setTransactionType(type: 'BUY' | 'SELL') {
      this.transactionType = type;
      this.onAssetOrTypeChange();
    }

    public setSelectedAsset(assetId: string | null) {
      this.selectedAssetId = assetId;
      this.onAssetOrTypeChange();
    }

    private onAssetOrTypeChange() {
      // 1. Limpa imediatamente a posição anterior para não manter estado obsoleto
      this.availableQty = null;

      // Cancela efeito anterior
      if (this.activeCleanup) {
        this.activeCleanup();
        this.activeCleanup = null;
      }

      let active = true;
      this.activeCleanup = () => {
        active = false;
      };

      const assetId = this.selectedAssetId;
      const type = this.transactionType;

      if (assetId && type === 'SELL') {
        this.fetchPositionFn('portfolio-123', assetId)
          .then((res) => {
            if (active) {
              if (res.success && res.data?.position?.quantity) {
                this.availableQty = res.data.position.quantity;
              } else {
                this.availableQty = null;
              }
            }
          })
          .catch(() => {
            if (active) {
              this.availableQty = null;
            }
          });
      }
    }

    public get isAvailablePositive(): boolean {
      if (!this.availableQty) return false;
      try {
        return new Decimal(this.availableQty).greaterThan(0);
      } catch {
        return false;
      }
    }
  }

  it('a) deve exibir posição de um ativo com saldo em modo VENDA', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      success: true,
      data: {
        position: {
          assetId: 'asset-1',
          ticker: 'PETR4',
          quantity: '150.0000000000',
        } as SerializedAssetPosition,
      },
    });

    const controller = new TransactionModalStateController(mockFetch);
    controller.setTransactionType('SELL');
    controller.setSelectedAsset('asset-1');

    expect(controller.availableQty).toBeNull(); // Imediatamente nulo antes do resolve

    await vi.waitFor(() => {
      expect(controller.availableQty).toBe('150.0000000000');
    });

    expect(controller.isAvailablePositive).toBe(true);
  });

  it('b) ao trocar para ativo sem posição, limpa imediatamente e mantém nulo', async () => {
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(async (_, assetId) => {
      callCount++;
      if (assetId === 'asset-1') {
        return {
          success: true,
          data: {
            position: {
              assetId: 'asset-1',
              quantity: '100.0000000000',
            } as SerializedAssetPosition,
          },
        };
      }
      return {
        success: true,
        data: {
          position: null,
        },
      };
    });

    const controller = new TransactionModalStateController(mockFetch);
    controller.setTransactionType('SELL');
    controller.setSelectedAsset('asset-1');

    await vi.waitFor(() => {
      expect(controller.availableQty).toBe('100.0000000000');
    });

    // Troca para ativo 2 (sem posição)
    controller.setSelectedAsset('asset-2');
    // Limpa imediatamente
    expect(controller.availableQty).toBeNull();

    await vi.waitFor(() => {
      expect(callCount).toBe(2);
    });

    expect(controller.availableQty).toBeNull();
    expect(controller.isAvailablePositive).toBe(false);
  });

  it('c) resposta de erro da consulta limpa e não preserva a posição anterior', async () => {
    const mockFetch = vi.fn().mockImplementation(async (_, assetId) => {
      if (assetId === 'asset-1') {
        return {
          success: true,
          data: {
            position: {
              assetId: 'asset-1',
              quantity: '50.0000000000',
            } as SerializedAssetPosition,
          },
        };
      }
      throw new Error('Falha de rede ou banco');
    });

    const controller = new TransactionModalStateController(mockFetch);
    controller.setTransactionType('SELL');
    controller.setSelectedAsset('asset-1');

    await vi.waitFor(() => {
      expect(controller.availableQty).toBe('50.0000000000');
    });

    // Troca para ativo com erro
    controller.setSelectedAsset('asset-error');
    expect(controller.availableQty).toBeNull();

    await new Promise((r) => setTimeout(r, 10));
    expect(controller.availableQty).toBeNull();
  });

  it('d) troca rápida de ativos não permite que resposta defasada sobrescreva a posição atual', async () => {
    let resolveAsset1: (val: any) => void;
    const promise1 = new Promise((resolve) => {
      resolveAsset1 = resolve;
    });

    let resolveAsset2: (val: any) => void;
    const promise2 = new Promise((resolve) => {
      resolveAsset2 = resolve;
    });

    const mockFetch = vi.fn().mockImplementation(async (_, assetId) => {
      if (assetId === 'asset-1') return promise1;
      if (assetId === 'asset-2') return promise2;
      return { success: false };
    });

    const controller = new TransactionModalStateController(mockFetch);
    controller.setTransactionType('SELL');

    // Seleciona Asset 1 (demora a responder)
    controller.setSelectedAsset('asset-1');
    expect(controller.availableQty).toBeNull();

    // Rapidamente troca para Asset 2
    controller.setSelectedAsset('asset-2');
    expect(controller.availableQty).toBeNull();

    // Asset 2 resolve primeiro com saldo 20
    resolveAsset2!({
      success: true,
      data: {
        position: {
          assetId: 'asset-2',
          quantity: '20.0000000000',
        },
      },
    });

    await vi.waitFor(() => {
      expect(controller.availableQty).toBe('20.0000000000');
    });

    // Agora a resposta antiga de Asset 1 (saldo 999) chega atrasada
    resolveAsset1!({
      success: true,
      data: {
        position: {
          assetId: 'asset-1',
          quantity: '999.0000000000',
        },
      },
    });

    // Espera tempo para garantir que a promessa antiga não sobrescreveu o estado de Asset 2
    await new Promise((r) => setTimeout(r, 20));
    expect(controller.availableQty).toBe('20.0000000000');
  });

  it('e/f) validação puramente decimal de availableQty sem coerção para number', () => {
    // Quantidade com alta precisão decimal
    const qtyCrypto = '0.0000000100';
    const dec = new Decimal(qtyCrypto);
    expect(dec.greaterThan(0)).toBe(true);

    // Formato com string original preservada
    const formatted = dec.greaterThan(0) ? qtyCrypto : '0.0000000000';
    expect(formatted).toBe('0.0000000100');
  });
});
