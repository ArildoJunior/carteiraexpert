import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createPortfolioEvent,
  listPortfolioEventsByPortfolio,
  getPortfolioEventById,
  cancelPortfolioEvent,
} from '../../../src/modules/portfolio/server/portfolio-event.service';
import {
  PortfolioEventNotFoundError,
  PortfolioNotFoundError,
  AssetNotFoundError,
} from '../../../src/modules/portfolio/domain/errors';
import { AuthorizationError } from '../../../src/modules/identity/domain/errors';
import type { SafeUser } from '../../../src/modules/identity/domain/user.types';
import * as auditModule from '../../../src/lib/db/audit';
import * as authModule from '../../../src/modules/identity/server/authorization-service';
import * as portfolioServiceModule from '../../../src/modules/portfolio/server/portfolio.service';
import * as assetServiceModule from '../../../src/modules/portfolio/server/asset.service';
import crypto from 'node:crypto';

describe('Unidade: PortfolioEventService', () => {
  const user1: SafeUser = {
    id: crypto.randomUUID(),
    email: 'user1@carteiraexpert.test',
    name: 'User 1',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const user2: SafeUser = {
    id: crypto.randomUUID(),
    email: 'user2@carteiraexpert.test',
    name: 'User 2',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const validPortfolioId = crypto.randomUUID();
  const validAssetId = crypto.randomUUID();
  const validEventId = crypto.randomUUID();

  let mockDb: any;
  let insertAuditLogSpy: any;
  let assertOwnershipSpy: any;
  let getPortfolioByIdSpy: any;
  let getAssetByIdSpy: any;

  beforeEach(() => {
    vi.restoreAllMocks();

    insertAuditLogSpy = vi
      .spyOn(auditModule, 'insertAuditLog')
      .mockResolvedValue(undefined as any);

    assertOwnershipSpy = vi
      .spyOn(authModule, 'assertOwnership')
      .mockImplementation(async (ownerId, currentUser) => {
        if (ownerId !== currentUser.id) {
          throw new AuthorizationError('FORBIDDEN');
        }
      });

    getPortfolioByIdSpy = vi
      .spyOn(portfolioServiceModule, 'getPortfolioById')
      .mockResolvedValue({
        id: validPortfolioId,
        userId: user1.id,
        name: 'Carteira Principal',
        description: null,
        baseCurrency: 'BRL',
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      });

    getAssetByIdSpy = vi
      .spyOn(assetServiceModule, 'getAssetById')
      .mockResolvedValue({
        id: validAssetId,
        ticker: 'PETR4',
        name: 'Petrobras PN',
        assetType: 'stock',
        market: 'B3',
        currency: 'BRL',
        isCustom: false,
        userId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

    mockDb = {
      insert: vi.fn(),
      select: vi.fn(),
      update: vi.fn(),
      transaction: vi.fn(async (cb) => await cb(mockDb)),
    };
  });

  // ─── 1. createPortfolioEvent ──────────────────────────────────────────────
  describe('createPortfolioEvent', () => {
    const validPayload = {
      portfolioId: validPortfolioId,
      assetId: validAssetId,
      type: 'BUY' as const,
      tradeDate: new Date('2025-08-14T10:00:00Z'),
      quantity: '100.0000000000',
      unitPrice: '35.50000000',
      fees: '4.50000000',
      currency: 'BRL' as const,
      notes: 'Compra regular',
      source: 'manual' as const,
    };

    it('deve registrar evento com sucesso, injetando createdBy no servidor e gerando auditoria', async () => {
      const mockCreatedEvent = {
        id: validEventId,
        portfolioId: validPayload.portfolioId,
        assetId: validPayload.assetId,
        type: validPayload.type,
        tradeDate: validPayload.tradeDate,
        settlementDate: null,
        quantity: validPayload.quantity,
        unitPrice: validPayload.unitPrice,
        fees: validPayload.fees,
        currency: validPayload.currency,
        notes: validPayload.notes,
        source: validPayload.source,
        createdBy: user1.id,
        createdAt: new Date(),
        deletedAt: null,
        cancellationReason: null,
      };

      mockDb.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockCreatedEvent]),
        }),
      });

      const result = await createPortfolioEvent(validPayload, user1, mockDb);

      expect(getPortfolioByIdSpy).toHaveBeenCalledWith(validPortfolioId, user1, mockDb);
      expect(getAssetByIdSpy).toHaveBeenCalledWith(validAssetId, user1, mockDb);
      expect(mockDb.insert).toHaveBeenCalled();
      expect(insertAuditLogSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          tableName: 'portfolio_events',
          action: 'INSERT',
          actorId: user1.id,
        }),
        expect.objectContaining({
          newValue: expect.objectContaining({
            portfolioId: validPortfolioId,
            assetId: validAssetId,
            quantity: '100',
            unitPrice: '35.5',
          }),
        }),
        expect.objectContaining({
          allowlist: expect.arrayContaining(['portfolioId', 'assetId', 'type', 'quantity', 'unitPrice']),
        }),
        mockDb
      );
      expect(result).toEqual(mockCreatedEvent);
    });

    it('deve rejeitar e bloquear lançamento se a carteira for de outro usuário', async () => {
      getPortfolioByIdSpy.mockRejectedValueOnce(new AuthorizationError('FORBIDDEN'));

      await expect(
        createPortfolioEvent(validPayload, user2, mockDb)
      ).rejects.toThrow(AuthorizationError);

      expect(mockDb.insert).not.toHaveBeenCalled();
      expect(insertAuditLogSpy).not.toHaveBeenCalled();
    });

    it('deve rejeitar e bloquear lançamento se o ativo customizado for de outro usuário', async () => {
      getAssetByIdSpy.mockRejectedValueOnce(new AuthorizationError('FORBIDDEN'));

      await expect(
        createPortfolioEvent(validPayload, user1, mockDb)
      ).rejects.toThrow(AuthorizationError);

      expect(mockDb.insert).not.toHaveBeenCalled();
      expect(insertAuditLogSpy).not.toHaveBeenCalled();
    });

    it('deve rejeitar e lançar erro de schema para inputs inválidos (ex: number do JS ou quantity <= 0)', async () => {
      await expect(
        createPortfolioEvent(
          {
            ...validPayload,
            quantity: 100 as any, // number JS inválido
          },
          user1,
          mockDb
        )
      ).rejects.toThrow();

      await expect(
        createPortfolioEvent(
          {
            ...validPayload,
            quantity: '0', // quantity deve ser > 0
          },
          user1,
          mockDb
        )
      ).rejects.toThrow();
    });

    it('deve propagar falha de auditoria e causar rollback transacional', async () => {
      mockDb.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            {
              id: validEventId,
              portfolioId: validPayload.portfolioId,
              createdBy: user1.id,
            },
          ]),
        }),
      });

      insertAuditLogSpy.mockRejectedValueOnce(new Error('Falha no audit log'));

      await expect(
        createPortfolioEvent(validPayload, user1, mockDb)
      ).rejects.toThrow('Falha no audit log');
    });
  });

  // ─── 2. listPortfolioEventsByPortfolio ────────────────────────────────────
  describe('listPortfolioEventsByPortfolio', () => {
    it('deve listar eventos ativos com ordenação e limite aplicados', async () => {
      const mockEvents = [
        {
          id: validEventId,
          portfolioId: validPortfolioId,
          assetId: validAssetId,
          type: 'BUY',
          tradeDate: new Date('2025-08-14T10:00:00Z'),
          quantity: '100.0000000000',
          unitPrice: '35.50000000',
          fees: '0',
          currency: 'BRL',
          notes: null,
          source: 'manual',
          createdBy: user1.id,
          createdAt: new Date(),
          deletedAt: null,
          cancellationReason: null,
        },
      ];

      const limitMock = vi.fn().mockResolvedValue(mockEvents);
      const orderByMock = vi.fn().mockReturnValue({ limit: limitMock });
      const whereMock = vi.fn().mockReturnValue({ orderBy: orderByMock });
      const fromMock = vi.fn().mockReturnValue({ where: whereMock });

      mockDb.select.mockReturnValue({ from: fromMock });

      const result = await listPortfolioEventsByPortfolio(
        validPortfolioId,
        user1,
        { limit: 20, type: 'BUY' },
        mockDb
      );

      expect(getPortfolioByIdSpy).toHaveBeenCalledWith(validPortfolioId, user1, mockDb);
      expect(limitMock).toHaveBeenCalledWith(20);
      expect(result).toEqual(mockEvents);
    });

    it('deve rejeitar se portfolioId for inválido', async () => {
      await expect(
        listPortfolioEventsByPortfolio('invalid-uuid', user1, {}, mockDb)
      ).rejects.toThrow(PortfolioNotFoundError);
    });

    it('deve rejeitar listagem se a carteira pertencer a outro usuário (IDOR)', async () => {
      getPortfolioByIdSpy.mockRejectedValueOnce(new AuthorizationError('FORBIDDEN'));

      await expect(
        listPortfolioEventsByPortfolio(validPortfolioId, user2, {}, mockDb)
      ).rejects.toThrow(AuthorizationError);
    });
  });

  // ─── 3. getPortfolioEventById ─────────────────────────────────────────────
  describe('getPortfolioEventById', () => {
    it('deve retornar evento existente se o usuário for o dono da carteira', async () => {
      const mockEvent = {
        id: validEventId,
        portfolioId: validPortfolioId,
        assetId: validAssetId,
        type: 'BUY',
        tradeDate: new Date('2025-08-14T10:00:00Z'),
        quantity: '100.0000000000',
        unitPrice: '35.50000000',
        fees: '0',
        currency: 'BRL',
        notes: null,
        source: 'manual',
        createdBy: user1.id,
        createdAt: new Date(),
        deletedAt: null,
        cancellationReason: null,
      };

      // Mock da busca do evento
      const limitEventMock = vi.fn().mockResolvedValue([mockEvent]);
      const whereEventMock = vi.fn().mockReturnValue({ limit: limitEventMock });
      const fromEventMock = vi.fn().mockReturnValue({ where: whereEventMock });

      // Mock da busca do portfolio correspondente
      const limitPortMock = vi.fn().mockResolvedValue([{ userId: user1.id }]);
      const wherePortMock = vi.fn().mockReturnValue({ limit: limitPortMock });
      const fromPortMock = vi.fn().mockReturnValue({ where: wherePortMock });

      mockDb.select
        .mockReturnValueOnce({ from: fromEventMock })
        .mockReturnValueOnce({ from: fromPortMock });

      const result = await getPortfolioEventById(validEventId, user1, mockDb);

      expect(assertOwnershipSpy).toHaveBeenCalledWith(user1.id, user1, 'portfolio_event', mockDb);
      expect(result).toEqual(mockEvent);
    });

    it('deve lançar PortfolioEventNotFoundError para UUID inválido ou evento inexistente', async () => {
      await expect(
        getPortfolioEventById('invalid-uuid', user1, mockDb)
      ).rejects.toThrow(PortfolioEventNotFoundError);

      const limitMock = vi.fn().mockResolvedValue([]);
      const whereMock = vi.fn().mockReturnValue({ limit: limitMock });
      const fromMock = vi.fn().mockReturnValue({ where: whereMock });
      mockDb.select.mockReturnValueOnce({ from: fromMock });

      await expect(
        getPortfolioEventById(validEventId, user1, mockDb)
      ).rejects.toThrow(PortfolioEventNotFoundError);
    });

    it('deve disparar assertOwnership e rejeitar com AuthorizationError se o evento for de outro usuário', async () => {
      const mockEvent = {
        id: validEventId,
        portfolioId: validPortfolioId,
        createdBy: user1.id,
        deletedAt: null,
      };

      const limitEventMock = vi.fn().mockResolvedValue([mockEvent]);
      const whereEventMock = vi.fn().mockReturnValue({ limit: limitEventMock });
      const fromEventMock = vi.fn().mockReturnValue({ where: whereEventMock });

      const limitPortMock = vi.fn().mockResolvedValue([{ userId: user1.id }]);
      const wherePortMock = vi.fn().mockReturnValue({ limit: limitPortMock });
      const fromPortMock = vi.fn().mockReturnValue({ where: wherePortMock });

      mockDb.select
        .mockReturnValueOnce({ from: fromEventMock })
        .mockReturnValueOnce({ from: fromPortMock });

      await expect(
        getPortfolioEventById(validEventId, user2, mockDb)
      ).rejects.toThrow(AuthorizationError);

      expect(assertOwnershipSpy).toHaveBeenCalledWith(user1.id, user2, 'portfolio_event', mockDb);
    });
  });

  // ─── 4. cancelPortfolioEvent ──────────────────────────────────────────────
  describe('cancelPortfolioEvent', () => {
    it('deve cancelar evento com soft delete e auditoria', async () => {
      const mockExisting = {
        id: validEventId,
        portfolioId: validPortfolioId,
        assetId: validAssetId,
        type: 'BUY',
        quantity: '100.0000000000',
        unitPrice: '35.50000000',
        deletedAt: null,
      };

      const limitEventMock = vi.fn().mockResolvedValue([mockExisting]);
      const whereEventMock = vi.fn().mockReturnValue({ limit: limitEventMock });
      const fromEventMock = vi.fn().mockReturnValue({ where: whereEventMock });

      const limitPortMock = vi.fn().mockResolvedValue([{ userId: user1.id }]);
      const wherePortMock = vi.fn().mockReturnValue({ limit: limitPortMock });
      const fromPortMock = vi.fn().mockReturnValue({ where: wherePortMock });

      mockDb.select
        .mockReturnValueOnce({ from: fromEventMock })
        .mockReturnValueOnce({ from: fromPortMock });

      const whereUpdateMock = vi.fn().mockResolvedValue([]);
      const setUpdateMock = vi.fn().mockReturnValue({ where: whereUpdateMock });
      mockDb.update.mockReturnValue({ set: setUpdateMock });

      await cancelPortfolioEvent(
        validEventId,
        { cancellationReason: 'Lançamento duplicado por engano' },
        user1,
        mockDb
      );

      expect(assertOwnershipSpy).toHaveBeenCalledWith(user1.id, user1, 'portfolio_event', mockDb);
      expect(mockDb.update).toHaveBeenCalled();
      expect(insertAuditLogSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          tableName: 'portfolio_events',
          recordId: validEventId,
          action: 'DELETE',
          actorId: user1.id,
          reason: 'Lançamento duplicado por engano',
        }),
        expect.objectContaining({
          newValue: expect.objectContaining({
            cancellationReason: 'Lançamento duplicado por engano',
          }),
        }),
        expect.anything(),
        mockDb
      );
    });

    it('deve rejeitar cancelamento se justificativa for muito curta (< 5 chars) ou apenas espaços', async () => {
      await expect(
        cancelPortfolioEvent(
          validEventId,
          { cancellationReason: 'abc' },
          user1,
          mockDb
        )
      ).rejects.toThrow();

      await expect(
        cancelPortfolioEvent(
          validEventId,
          { cancellationReason: '     ' },
          user1,
          mockDb
        )
      ).rejects.toThrow();
    });

    it('deve rejeitar cancelamento se evento pertencer a outro usuário', async () => {
      const mockExisting = {
        id: validEventId,
        portfolioId: validPortfolioId,
        deletedAt: null,
      };

      const limitEventMock = vi.fn().mockResolvedValue([mockExisting]);
      const whereEventMock = vi.fn().mockReturnValue({ limit: limitEventMock });
      const fromEventMock = vi.fn().mockReturnValue({ where: whereEventMock });

      const limitPortMock = vi.fn().mockResolvedValue([{ userId: user1.id }]);
      const wherePortMock = vi.fn().mockReturnValue({ limit: limitPortMock });
      const fromPortMock = vi.fn().mockReturnValue({ where: wherePortMock });

      mockDb.select
        .mockReturnValueOnce({ from: fromEventMock })
        .mockReturnValueOnce({ from: fromPortMock });

      await expect(
        cancelPortfolioEvent(
          validEventId,
          { cancellationReason: 'Cancelando evento alheio' },
          user2,
          mockDb
        )
      ).rejects.toThrow(AuthorizationError);

      expect(mockDb.update).not.toHaveBeenCalled();
    });
  });
});
