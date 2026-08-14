import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  searchAssets,
  getAssetById,
  createCustomAsset,
  listCustomAssets,
} from '../../../src/modules/portfolio/server/asset.service';
import {
  AssetNotFoundError,
  DuplicateAssetError,
} from '../../../src/modules/portfolio/domain/errors';
import { AuthorizationError } from '../../../src/modules/identity/domain/errors';
import type { SafeUser } from '../../../src/modules/identity/domain/user.types';
import * as auditModule from '../../../src/lib/db/audit';
import * as authModule from '../../../src/modules/identity/server/authorization-service';
import crypto from 'node:crypto';

describe('Unidade: AssetService', () => {
  const user1: SafeUser = {
    id: crypto.randomUUID(),
    email: 'user1@carteiraexpert.test',
    name: 'Asset User 1',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const user2: SafeUser = {
    id: crypto.randomUUID(),
    email: 'user2@carteiraexpert.test',
    name: 'Asset User 2',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  let mockDb: any;
  let insertAuditLogSpy: any;
  let assertOwnershipSpy: any;

  beforeEach(() => {
    vi.restoreAllMocks();
    insertAuditLogSpy = vi
      .spyOn(auditModule, 'insertAuditLog')
      .mockResolvedValue(undefined as any);
    assertOwnershipSpy = vi
      .spyOn(authModule, 'assertOwnership')
      .mockImplementation(async (ownerId, currentUser, resourceType, executor) => {
        if (ownerId !== currentUser.id) {
          throw new AuthorizationError('FORBIDDEN');
        }
      });

    mockDb = {
      insert: vi.fn(),
      select: vi.fn(),
      transaction: vi.fn(async (cb) => await cb(mockDb)),
    };
  });

  // ─── 1. searchAssets ──────────────────────────────────────────────────────
  describe('searchAssets', () => {
    it('deve buscar ativos com parâmetros válidos e limites aplicados', async () => {
      const mockAssets = [
        {
          id: crypto.randomUUID(),
          ticker: 'PETR4',
          name: 'Petrobras PN',
          assetType: 'stock',
          market: 'B3',
          currency: 'BRL',
          isCustom: false,
          userId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue(mockAssets),
            }),
          }),
        }),
      });

      const result = await searchAssets(
        { query: 'petr', limit: 10 },
        user1,
        mockDb
      );

      expect(result).toEqual(mockAssets);
      expect(mockDb.select).toHaveBeenCalledTimes(1);
    });

    it('deve aceitar busca vazia e aplicar limit default de 20', async () => {
      const mockLimitFn = vi.fn().mockResolvedValue([]);
      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: mockLimitFn,
            }),
          }),
        }),
      });

      await searchAssets({}, user1, mockDb);

      expect(mockLimitFn).toHaveBeenCalledWith(20);
    });

    it('deve rejeitar limit maior que 50 ou menor que 1', async () => {
      await expect(
        searchAssets({ limit: 51 }, user1, mockDb)
      ).rejects.toThrow();

      await expect(
        searchAssets({ limit: 0 }, user1, mockDb)
      ).rejects.toThrow();
    });
  });

  // ─── 2. getAssetById ──────────────────────────────────────────────────────
  describe('getAssetById', () => {
    it('deve retornar ativo global para qualquer usuário autenticado sem chamar assertOwnership', async () => {
      const assetId = crypto.randomUUID();
      const globalAsset = {
        id: assetId,
        ticker: 'VALE3',
        name: 'Vale ON',
        assetType: 'stock',
        market: 'B3',
        currency: 'BRL',
        isCustom: false,
        userId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([globalAsset]),
          }),
        }),
      });

      const result = await getAssetById(assetId, user1, mockDb);

      expect(result).toEqual(globalAsset);
      expect(assertOwnershipSpy).not.toHaveBeenCalled();
    });

    it('deve retornar ativo customizado quando o usuário for o proprietário e propagar o executor', async () => {
      const assetId = crypto.randomUUID();
      const customAsset = {
        id: assetId,
        ticker: 'MEUATIVO',
        name: 'Ativo Privado User 1',
        assetType: 'custom',
        market: 'CUSTOM',
        currency: 'BRL',
        isCustom: true,
        userId: user1.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([customAsset]),
          }),
        }),
      });

      const result = await getAssetById(assetId, user1, mockDb);

      expect(result).toEqual(customAsset);
      expect(assertOwnershipSpy).toHaveBeenCalledWith(
        user1.id,
        user1,
        'asset',
        mockDb
      );
    });

    it('deve lançar AuthorizationError quando o usuário tentar acessar ativo customizado de outro usuário (IDOR) e propagar o executor', async () => {
      const assetId = crypto.randomUUID();
      const customAssetOther = {
        id: assetId,
        ticker: 'SECRET_COIN',
        name: 'Ativo Privado User 2',
        assetType: 'custom',
        market: 'CUSTOM',
        currency: 'BRL',
        isCustom: true,
        userId: user2.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([customAssetOther]),
          }),
        }),
      });

      await expect(getAssetById(assetId, user1, mockDb)).rejects.toThrow(
        AuthorizationError
      );
      expect(assertOwnershipSpy).toHaveBeenCalledWith(
        user2.id,
        user1,
        'asset',
        mockDb
      );
    });

    it('deve lançar AssetNotFoundError para ID inválido ou não encontrado', async () => {
      await expect(getAssetById('not-a-uuid', user1, mockDb)).rejects.toThrow(
        AssetNotFoundError
      );

      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      });

      await expect(
        getAssetById(crypto.randomUUID(), user1, mockDb)
      ).rejects.toThrow(AssetNotFoundError);
    });
  });

  // ─── 3. createCustomAsset ─────────────────────────────────────────────────
  describe('createCustomAsset', () => {
    it('deve criar ativo customizado com isCustom=true e registrar auditoria', async () => {
      const mockCreated = {
        id: crypto.randomUUID(),
        ticker: 'IMOVEL_SP',
        name: 'Imóvel Comercial SP',
        assetType: 'custom',
        market: 'CUSTOM',
        currency: 'BRL',
        isCustom: true,
        userId: user1.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDb.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockCreated]),
        }),
      });

      const result = await createCustomAsset(
        {
          ticker: '  imovel_sp  ',
          name: '  Imóvel Comercial SP  ',
          currency: 'BRL',
        },
        user1,
        mockDb
      );

      expect(result).toEqual(mockCreated);
      expect(insertAuditLogSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          tableName: 'assets',
          action: 'INSERT',
          actorId: user1.id,
          actorType: 'user',
          source: 'manual',
        }),
        expect.objectContaining({
          newValue: {
            ticker: 'IMOVEL_SP',
            name: 'Imóvel Comercial SP',
            assetType: 'custom',
            market: 'CUSTOM',
            currency: 'BRL',
            isCustom: true,
          },
        }),
        expect.objectContaining({
          allowlist: [
            'ticker',
            'name',
            'assetType',
            'market',
            'currency',
            'isCustom',
          ],
        }),
        mockDb
      );
    });

    it('deve converter violação de unicidade de idx_assets_user_ticker_market (23505) em DuplicateAssetError', async () => {
      mockDb.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue({
            code: '23505',
            constraint_name: 'idx_assets_user_ticker_market',
            message: 'duplicate key value violates unique constraint "idx_assets_user_ticker_market"',
          }),
        }),
      });

      await expect(
        createCustomAsset(
          {
            ticker: 'DUP_TICKER',
            name: 'Ativo Duplicado',
          },
          user1,
          mockDb
        )
      ).rejects.toThrow(DuplicateAssetError);
    });

    it('não deve converter erro 23505 de outra constraint em DuplicateAssetError e deve relançar o erro original', async () => {
      const otherUniqueError = {
        code: '23505',
        constraint_name: 'other_unique_index',
        message: 'duplicate key value violates unique constraint "other_unique_index"',
      };

      mockDb.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue(otherUniqueError),
        }),
      });

      await expect(
        createCustomAsset(
          {
            ticker: 'OTHER_TICKER',
            name: 'Outro Ativo',
          },
          user1,
          mockDb
        )
      ).rejects.toThrow('duplicate key value violates unique constraint "other_unique_index"');
    });

    it('não deve converter em DuplicateAssetError erro 23505 cuja mensagem menciona idx_assets_user_ticker_market mas cujo constraint_name seja outro', async () => {
      const deceptiveError = {
        code: '23505',
        constraint_name: 'idx_assets_global_ticker_market',
        message: 'duplicate key (mentions idx_assets_user_ticker_market in text) violates unique constraint',
      };

      mockDb.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockRejectedValue(deceptiveError),
        }),
      });

      await expect(
        createCustomAsset(
          {
            ticker: 'DECEPTIVE_TICKER',
            name: 'Ativo Enganoso',
          },
          user1,
          mockDb
        )
      ).rejects.toThrow('duplicate key (mentions idx_assets_user_ticker_market in text) violates unique constraint');
    });

    it('deve falhar a operação e propagar o erro caso a gravação de auditoria falhe', async () => {
      const mockCreated = {
        id: crypto.randomUUID(),
        ticker: 'AUDIT_FAIL',
        name: 'Ativo Falha Auditoria',
        assetType: 'custom',
        market: 'CUSTOM',
        currency: 'BRL',
        isCustom: true,
        userId: user1.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDb.insert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([mockCreated]),
        }),
      });

      insertAuditLogSpy.mockRejectedValue(new Error('Falha no banco ao gravar auditoria.'));

      await expect(
        createCustomAsset(
          {
            ticker: 'AUDIT_FAIL',
            name: 'Ativo Falha Auditoria',
          },
          user1,
          mockDb
        )
      ).rejects.toThrow('Falha no banco ao gravar auditoria.');
    });
  });

  // ─── 4. listCustomAssets ──────────────────────────────────────────────────
  describe('listCustomAssets', () => {
    it('deve listar apenas ativos customizados do usuário', async () => {
      const mockList = [
        {
          id: crypto.randomUUID(),
          ticker: 'MY_TOKEN',
          name: 'Meu Token Privado',
          assetType: 'custom',
          market: 'CUSTOM',
          currency: 'BRL',
          isCustom: true,
          userId: user1.id,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockDb.select.mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockResolvedValue(mockList),
          }),
        }),
      });

      const result = await listCustomAssets(user1, mockDb);

      expect(result).toEqual(mockList);
    });
  });
});
