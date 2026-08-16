import { describe, it, expect } from 'vitest';
import {
  createPortfolioEvent,
  listPortfolioEventsByPortfolio,
  getPortfolioEventById,
  cancelPortfolioEvent,
} from '../../../src/modules/portfolio/server/portfolio-event.service';
import {
  PortfolioEventNotFoundError,
  PortfolioNotFoundError,
} from '../../../src/modules/portfolio/domain/errors';
import type { SafeUser } from '../../../src/modules/identity/domain/user.types';
import crypto from 'node:crypto';

describe('Unidade: PortfolioEventService (Validações de Entrada e Formato)', () => {
  const user1: SafeUser = {
    id: crypto.randomUUID(),
    email: 'user1@carteiraexpert.test',
    name: 'User 1',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const validPortfolioId = crypto.randomUUID();
  const validAssetId = crypto.randomUUID();

  describe('createPortfolioEvent (validação de entrada e bounds)', () => {
    it('deve rejeitar quantity menor ou igual a zero', async () => {
      await expect(
        createPortfolioEvent(
          {
            portfolioId: validPortfolioId,
            assetId: validAssetId,
            type: 'BUY',
            tradeDate: '2026-03-01T10:00:00Z',
            quantity: '0',
            unitPrice: '10.00',
            fees: '0',
            currency: 'BRL',
          },
          user1
        )
      ).rejects.toThrow();
    });

    it('deve rejeitar unitPrice negativo', async () => {
      await expect(
        createPortfolioEvent(
          {
            portfolioId: validPortfolioId,
            assetId: validAssetId,
            type: 'BUY',
            tradeDate: '2026-03-01T10:00:00Z',
            quantity: '10',
            unitPrice: '-5.00',
            fees: '0',
            currency: 'BRL',
          },
          user1
        )
      ).rejects.toThrow();
    });

    it('deve rejeitar settlementDate anterior a tradeDate', async () => {
      await expect(
        createPortfolioEvent(
          {
            portfolioId: validPortfolioId,
            assetId: validAssetId,
            type: 'BUY',
            tradeDate: '2026-03-10T10:00:00Z',
            settlementDate: '2026-03-05T10:00:00Z',
            quantity: '10',
            unitPrice: '10.00',
            fees: '0',
            currency: 'BRL',
          },
          user1
        )
      ).rejects.toThrow();
    });
  });

  describe('listPortfolioEventsByPortfolio (validação de formato de ID)', () => {
    it('deve lançar PortfolioNotFoundError para portfolioId com formato inválido', async () => {
      await expect(
        listPortfolioEventsByPortfolio('id-invalido', user1)
      ).rejects.toThrow(PortfolioNotFoundError);
    });
  });

  describe('getPortfolioEventById (validação de formato de ID)', () => {
    it('deve lançar PortfolioEventNotFoundError para ID com formato inválido', async () => {
      await expect(
        getPortfolioEventById('id-invalido', user1)
      ).rejects.toThrow(PortfolioEventNotFoundError);
    });
  });

  describe('cancelPortfolioEvent (validação de formato de ID e justificativa)', () => {
    it('deve lançar PortfolioEventNotFoundError para ID com formato inválido', async () => {
      await expect(
        cancelPortfolioEvent(
          'id-invalido',
          { cancellationReason: 'Justificativa válida' },
          user1
        )
      ).rejects.toThrow(PortfolioEventNotFoundError);
    });

    it('deve rejeitar cancelamento com justificativa menor que 5 caracteres', async () => {
      await expect(
        cancelPortfolioEvent(
          crypto.randomUUID(),
          { cancellationReason: 'Erro' },
          user1
        )
      ).rejects.toThrow();
    });
  });
});
