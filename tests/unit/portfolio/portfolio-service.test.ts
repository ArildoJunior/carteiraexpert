import { describe, it, expect } from 'vitest';
import {
  createPortfolio,
  getPortfolioById,
  updatePortfolio,
  deletePortfolio,
} from '../../../src/modules/portfolio/server/portfolio.service';
import { PortfolioNotFoundError } from '../../../src/modules/portfolio/domain/errors';
import type { SafeUser } from '../../../src/modules/identity/domain/user.types';
import crypto from 'node:crypto';

describe('Unidade: PortfolioService (Validações de Entrada e Formato)', () => {
  const user1: SafeUser = {
    id: crypto.randomUUID(),
    email: 'user1@carteiraexpert.test',
    name: 'User One',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  describe('createPortfolio (validação de entrada)', () => {
    it('deve rejeitar nome de carteira vazio', async () => {
      await expect(
        createPortfolio({ name: '' }, user1)
      ).rejects.toThrow();
    });

    it('deve rejeitar descrição que exceda 500 caracteres', async () => {
      await expect(
        createPortfolio(
          {
            name: 'Carteira Válida',
            description: 'A'.repeat(501),
          },
          user1
        )
      ).rejects.toThrow();
    });
  });

  describe('getPortfolioById (validação de formato de ID)', () => {
    it('deve lançar PortfolioNotFoundError para ID com formato inválido (não-UUID)', async () => {
      await expect(getPortfolioById('id-invalido', user1)).rejects.toThrow(
        PortfolioNotFoundError
      );
    });

    it('deve lançar PortfolioNotFoundError para ID vazio', async () => {
      await expect(getPortfolioById('', user1)).rejects.toThrow(
        PortfolioNotFoundError
      );
    });
  });

  describe('updatePortfolio (validação de formato de ID e entrada)', () => {
    it('deve lançar PortfolioNotFoundError para ID com formato inválido no update', async () => {
      await expect(
        updatePortfolio('nao-eh-uuid', { name: 'Novo Nome' }, user1)
      ).rejects.toThrow(PortfolioNotFoundError);
    });
  });

  describe('deletePortfolio (validação de formato de ID)', () => {
    it('deve lançar PortfolioNotFoundError para ID com formato inválido no delete', async () => {
      await expect(
        deletePortfolio('id-invalido-delete', user1)
      ).rejects.toThrow(PortfolioNotFoundError);
    });
  });
});
