import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createPortfolio,
  listPortfolios,
  getPortfolioById,
  updatePortfolio,
  deletePortfolio,
} from '../../../src/modules/portfolio/server/portfolio.service';
import { PortfolioNotFoundError } from '../../../src/modules/portfolio/domain/errors';
import { AuthorizationError } from '../../../src/modules/identity/domain/errors';
import type { SafeUser } from '../../../src/modules/identity/domain/user.types';
import * as auditModule from '../../../src/lib/db/audit';
import * as authModule from '../../../src/modules/identity/server/authorization-service';
import crypto from 'node:crypto';

describe('Unidade: PortfolioService', () => {
  const user1: SafeUser = {
    id: crypto.randomUUID(),
    email: 'user1@carteiraexpert.test',
    name: 'User One',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const user2: SafeUser = {
    id: crypto.randomUUID(),
    email: 'user2@carteiraexpert.test',
    name: 'User Two',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  let mockDb: any;
  let insertAuditLogSpy: any;
  let assertOwnershipSpy: any;

  beforeEach(() => {
    vi.restoreAllMocks();
    insertAuditLogSpy = vi.spyOn(auditModule, 'insertAuditLog').mockResolvedValue(undefined as any);
    assertOwnershipSpy = vi.spyOn(authModule, 'assertOwnership').mockImplementation(
      async (ownerId, currentUser, resourceType) => {
        if (ownerId !== currentUser.id) {
          throw new AuthorizationError('FORBIDDEN');
        }
      }
    );

    mockDb = {
      insert: vi.fn(),
      select: vi.fn(),
      update: vi.fn(),
      transaction: vi.fn(async (cb) => await cb(mockDb)),
    };
  });

  // ─── 1. createPortfolio ───────────────────────────────────────────────────
  describe('createPortfolio', () => {
    it('deve criar carteira com dados válidos e registrar auditoria', async () => {
      const mockCreated = {
        id: crypto.randomUUID(),
        userId: user1.id,
        name: 'Carteira Principal',
        description: 'Minha carteira de longo prazo',
        baseCurrency: 'BRL',
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      mockDb.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockCreated]),
        }),
      });

      const result = await createPortfolio(
        {
          name: '  Carteira Principal  ',
          description: '  Minha carteira de longo prazo  ',
          baseCurrency: 'BRL',
        },
        user1,
        mockDb
      );

      expect(result).toEqual(mockCreated);
      expect(mockDb.insert).toHaveBeenCalledTimes(1);
      expect(insertAuditLogSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          tableName: 'portfolios',
          action: 'INSERT',
          actorId: user1.id,
          actorType: 'user',
          source: 'manual',
        }),
        expect.objectContaining({
          newValue: {
            name: 'Carteira Principal',
            description: 'Minha carteira de longo prazo',
            baseCurrency: 'BRL',
            status: 'active',
          },
        }),
        expect.objectContaining({
          allowlist: ['name', 'description', 'baseCurrency', 'status'],
        }),
        mockDb
      );
    });

    it('deve rejeitar nome de carteira vazio', async () => {
      await expect(
        createPortfolio(
          {
            name: '   ',
          },
          user1,
          mockDb
        )
      ).rejects.toThrow();
    });

    it('deve rejeitar descrição excessivamente longa (> 500 caracteres)', async () => {
      await expect(
        createPortfolio(
          {
            name: 'Carteira Teste',
            description: 'A'.repeat(501),
          },
          user1,
          mockDb
        )
      ).rejects.toThrow();
    });
  });

  // ─── 2. listPortfolios ────────────────────────────────────────────────────
  describe('listPortfolios', () => {
    it('deve consultar e retornar as carteiras do usuário autenticado', async () => {
      const mockList = [
        {
          id: crypto.randomUUID(),
          userId: user1.id,
          name: 'Carteira Ações',
          description: null,
          baseCurrency: 'BRL',
          status: 'active',
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedAt: null,
        },
      ];

      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue(mockList),
          }),
        }),
      });

      const result = await listPortfolios(user1, mockDb);

      expect(result).toEqual(mockList);
      expect(mockDb.select).toHaveBeenCalledTimes(1);
    });
  });

  // ─── 3. getPortfolioById ──────────────────────────────────────────────────
  describe('getPortfolioById', () => {
    it('deve retornar carteira quando o usuário autenticado for o proprietário', async () => {
      const portfolioId = crypto.randomUUID();
      const mockItem = {
        id: portfolioId,
        userId: user1.id,
        name: 'Carteira FIIs',
        description: null,
        baseCurrency: 'BRL',
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockItem]),
          }),
        }),
      });

      const result = await getPortfolioById(portfolioId, user1, mockDb);

      expect(result).toEqual(mockItem);
      expect(assertOwnershipSpy).toHaveBeenCalledWith(user1.id, user1, 'portfolio');
    });

    it('deve lançar PortfolioNotFoundError para ID inválido', async () => {
      await expect(getPortfolioById('invalid-uuid', user1, mockDb)).rejects.toThrow(
        PortfolioNotFoundError
      );
    });

    it('deve lançar PortfolioNotFoundError quando a carteira não for encontrada', async () => {
      const portfolioId = crypto.randomUUID();
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      await expect(getPortfolioById(portfolioId, user1, mockDb)).rejects.toThrow(
        PortfolioNotFoundError
      );
    });

    it('deve lançar AuthorizationError quando a carteira pertencer a outro usuário (IDOR)', async () => {
      const portfolioId = crypto.randomUUID();
      const mockItemOtherUser = {
        id: portfolioId,
        userId: user2.id, // Pertence ao User 2
        name: 'Carteira Privada User 2',
        description: null,
        baseCurrency: 'BRL',
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([mockItemOtherUser]),
          }),
        }),
      });

      await expect(getPortfolioById(portfolioId, user1, mockDb)).rejects.toThrow(
        AuthorizationError
      );
      expect(assertOwnershipSpy).toHaveBeenCalledWith(user2.id, user1, 'portfolio');
    });
  });

  // ─── 4. updatePortfolio ───────────────────────────────────────────────────
  describe('updatePortfolio', () => {
    it('deve atualizar carteira com sucesso e registrar auditoria', async () => {
      const portfolioId = crypto.randomUUID();
      const existing = {
        id: portfolioId,
        userId: user1.id,
        name: 'Nome Antigo',
        description: 'Desc Antiga',
        baseCurrency: 'BRL',
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      const updated = {
        ...existing,
        name: 'Nome Novo',
        description: 'Desc Nova',
        status: 'archived',
      };

      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([existing]),
          }),
        }),
      });

      mockDb.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([updated]),
          }),
        }),
      });

      const result = await updatePortfolio(
        portfolioId,
        {
          name: '  Nome Novo  ',
          description: '  Desc Nova  ',
          status: 'archived',
        },
        user1,
        mockDb
      );

      expect(result).toEqual(updated);
      expect(insertAuditLogSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          tableName: 'portfolios',
          recordId: portfolioId,
          action: 'UPDATE',
          actorId: user1.id,
          actorType: 'user',
          source: 'manual',
        }),
        expect.objectContaining({
          oldValue: {
            name: 'Nome Antigo',
            description: 'Desc Antiga',
            status: 'active',
          },
          newValue: {
            name: 'Nome Novo',
            description: 'Desc Nova',
            status: 'archived',
          },
        }),
        expect.objectContaining({
          allowlist: ['name', 'description', 'status'],
        }),
        mockDb
      );
    });

    it('deve rejeitar atualização por usuário não proprietário', async () => {
      const portfolioId = crypto.randomUUID();
      const existingOther = {
        id: portfolioId,
        userId: user2.id,
        name: 'Carteira User 2',
        description: null,
        baseCurrency: 'BRL',
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([existingOther]),
          }),
        }),
      });

      await expect(
        updatePortfolio(portfolioId, { name: 'Novo Nome' }, user1, mockDb)
      ).rejects.toThrow(AuthorizationError);
    });
  });

  // ─── 5. deletePortfolio (Soft Delete) ─────────────────────────────────────
  describe('deletePortfolio', () => {
    it('deve realizar soft delete e registrar auditoria de deleção', async () => {
      const portfolioId = crypto.randomUUID();
      const existing = {
        id: portfolioId,
        userId: user1.id,
        name: 'Carteira Para Deletar',
        description: null,
        baseCurrency: 'BRL',
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([existing]),
          }),
        }),
      });

      mockDb.update.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue(undefined),
        }),
      });

      await deletePortfolio(portfolioId, user1, mockDb);

      expect(mockDb.update).toHaveBeenCalledTimes(1);
      expect(insertAuditLogSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          tableName: 'portfolios',
          recordId: portfolioId,
          action: 'DELETE',
          actorId: user1.id,
          actorType: 'user',
          source: 'manual',
        }),
        expect.objectContaining({
          oldValue: {
            name: 'Carteira Para Deletar',
            status: 'active',
          },
        }),
        expect.objectContaining({
          allowlist: ['name', 'status'],
        }),
        mockDb
      );
    });

    it('deve rejeitar deleção de carteira de outro usuário', async () => {
      const portfolioId = crypto.randomUUID();
      const existingOther = {
        id: portfolioId,
        userId: user2.id,
        name: 'Carteira User 2',
        description: null,
        baseCurrency: 'BRL',
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([existingOther]),
          }),
        }),
      });

      await expect(deletePortfolio(portfolioId, user1, mockDb)).rejects.toThrow(
        AuthorizationError
      );
    });
  });
});
