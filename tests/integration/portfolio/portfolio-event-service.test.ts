import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { db, type DatabaseTransaction } from '../../../src/lib/db';
import { users } from '../../../src/lib/db/schema/identity';
import { portfolios, assets, portfolioEvents } from '../../../src/lib/db/schema/portfolio';
import { auditLogs } from '../../../src/lib/db/schema/audit';
import {
  createPortfolioEvent,
  createPortfolioEventInTransaction,
  listPortfolioEventsByPortfolio,
  getPortfolioEventById,
  cancelPortfolioEvent,
} from '../../../src/modules/portfolio/server/portfolio-event.service';
import {
  createPortfolioEventSchema,
} from '../../../src/modules/portfolio/domain/portfolio-event.schema';
import { createPortfolio } from '../../../src/modules/portfolio/server/portfolio.service';
import { createCustomAsset } from '../../../src/modules/portfolio/server/asset.service';
import {
  PortfolioEventNotFoundError,
  PortfolioNotFoundError,
  AssetNotFoundError,
} from '../../../src/modules/portfolio/domain/errors';
import { AuthorizationError } from '../../../src/modules/identity/domain/errors';
import type { SafeUser } from '../../../src/modules/identity/domain/user.types';
import * as auditModule from '../../../src/lib/db/audit';
import { eq, inArray, and } from 'drizzle-orm';
import crypto from 'node:crypto';

describe('Integração: PortfolioEventService (PostgreSQL Real)', () => {
  const user1Id = crypto.randomUUID();
  const user2Id = crypto.randomUUID();

  let user1: SafeUser;
  let user2: SafeUser;

  let portfolio1Id: string;
  let portfolio2Id: string;

  const globalAssetId = crypto.randomUUID();
  let customAssetUser1Id: string;
  let customAssetUser2Id: string;

  const createdEventIds: string[] = [];

  beforeAll(async () => {
    const now = new Date();
    const timestamp = Date.now();

    // 1. Cria 2 usuários reais
    await db.insert(users).values([
      {
        id: user1Id,
        email: `event_user1_${timestamp}@carteiraexpert.test`,
        name: 'Event User 1',
        passwordHash: 'dummy_hash_user1',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: user2Id,
        email: `event_user2_${timestamp}@carteiraexpert.test`,
        name: 'Event User 2',
        passwordHash: 'dummy_hash_user2',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
    ]);

    user1 = {
      id: user1Id,
      email: `event_user1_${timestamp}@carteiraexpert.test`,
      name: 'Event User 1',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    user2 = {
      id: user2Id,
      email: `event_user2_${timestamp}@carteiraexpert.test`,
      name: 'Event User 2',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    // 2. Cria carteiras para cada usuário
    const p1 = await createPortfolio(
      { name: 'Carteira User 1', baseCurrency: 'BRL' },
      user1
    );
    portfolio1Id = p1.id;

    const p2 = await createPortfolio(
      { name: 'Carteira User 2', baseCurrency: 'BRL' },
      user2
    );
    portfolio2Id = p2.id;

    // 3. Cria ativo global
    await db.insert(assets).values({
      id: globalAssetId,
      ticker: `GLB_${timestamp.toString().slice(-6)}`,
      name: 'Ativo Global Integracao',
      assetType: 'stock',
      market: 'B3',
      currency: 'BRL',
      isCustom: false,
      userId: null,
      createdAt: now,
      updatedAt: now,
    });

    // 4. Cria ativos customizados para user1 e user2
    const c1 = await createCustomAsset(
      {
        ticker: `C1_${timestamp.toString().slice(-6)}`,
        name: 'Custom Asset User 1',
        currency: 'BRL',
      },
      user1
    );
    customAssetUser1Id = c1.id;

    const c2 = await createCustomAsset(
      {
        ticker: `C2_${timestamp.toString().slice(-6)}`,
        name: 'Custom Asset User 2',
        currency: 'BRL',
      },
      user2
    );
    customAssetUser2Id = c2.id;
  });

  afterAll(async () => {
    // Limpeza de logs de auditoria
    await db.delete(auditLogs).where(
      inArray(auditLogs.actorId, [user1Id, user2Id])
    );

    // Limpeza de eventos
    if (createdEventIds.length > 0) {
      await db.delete(portfolioEvents).where(
        inArray(portfolioEvents.id, createdEventIds)
      );
    }
    await db.delete(portfolioEvents).where(
      inArray(portfolioEvents.portfolioId, [portfolio1Id, portfolio2Id])
    );

    // Limpeza de carteiras
    await db.delete(portfolios).where(
      inArray(portfolios.id, [portfolio1Id, portfolio2Id])
    );

    // Limpeza de ativos
    await db.delete(assets).where(
      inArray(assets.id, [globalAssetId, customAssetUser1Id, customAssetUser2Id])
    );

    // Limpeza de usuários
    await db.delete(users).where(
      inArray(users.id, [user1Id, user2Id])
    );
  });

  // ─── 1. createPortfolioEvent ──────────────────────────────────────────────
  describe('createPortfolioEvent', () => {
    it('deve registrar evento com ativo global, gravando campos Decimal com precisão no PostgreSQL e gerando auditoria', async () => {
      const event = await createPortfolioEvent(
        {
          portfolioId: portfolio1Id,
          assetId: globalAssetId,
          type: 'BUY',
          tradeDate: new Date('2025-08-14T10:00:00Z'),
          quantity: '100.1234567890',
          unitPrice: '35.55000000',
          fees: '4.50000000',
          currency: 'BRL',
          notes: 'Compra de teste de integracao',
          source: 'manual',
        },
        user1
      );

      createdEventIds.push(event.id);

      expect(event.id).toBeDefined();
      expect(event.portfolioId).toBe(portfolio1Id);
      expect(event.assetId).toBe(globalAssetId);
      expect(event.type).toBe('BUY');
      expect(event.quantity).toBe('100.1234567890');
      expect(event.unitPrice).toBe('35.55000000');
      expect(event.fees).toBe('4.50000000');
      expect(event.createdBy).toBe(user1.id);
      expect(event.deletedAt).toBeNull();

      // Verifica persistência física real no banco
      const [saved] = await db
        .select()
        .from(portfolioEvents)
        .where(eq(portfolioEvents.id, event.id))
        .limit(1);

      expect(saved).toBeDefined();
      expect(saved.quantity).toBe('100.1234567890');
      expect(saved.unitPrice).toBe('35.55000000');

      // Verifica log de auditoria
      const [audit] = await db
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.tableName, 'portfolio_events'),
            eq(auditLogs.recordId, event.id),
            eq(auditLogs.action, 'INSERT')
          )
        )
        .limit(1);

      expect(audit).toBeDefined();
      expect(audit.actorId).toBe(user1.id);
    });

    it('deve registrar evento com ativo customizado pertencente ao próprio usuário', async () => {
      const event = await createPortfolioEvent(
        {
          portfolioId: portfolio1Id,
          assetId: customAssetUser1Id,
          type: 'BUY',
          tradeDate: new Date('2025-08-14T11:00:00Z'),
          quantity: '50.0000000000',
          unitPrice: '10.00000000',
          fees: '0.00000000',
        },
        user1
      );

      createdEventIds.push(event.id);
      expect(event.assetId).toBe(customAssetUser1Id);
      expect(event.createdBy).toBe(user1.id);
    });

    it('deve bloquear lançamento em carteira de outro usuário (IDOR)', async () => {
      await expect(
        createPortfolioEvent(
          {
            portfolioId: portfolio2Id, // Carteira do user2
            assetId: globalAssetId,
            type: 'BUY',
            tradeDate: new Date('2025-08-14T10:00:00Z'),
            quantity: '10.0000000000',
            unitPrice: '20.00000000',
          },
          user1 // Usuário 1 tentando lançar na carteira do Usuário 2
        )
      ).rejects.toThrow(AuthorizationError);
    });

    it('deve bloquear lançamento utilizando ativo customizado de outro usuário', async () => {
      await expect(
        createPortfolioEvent(
          {
            portfolioId: portfolio1Id, // Carteira do user1
            assetId: customAssetUser2Id, // Ativo do user2
            type: 'BUY',
            tradeDate: new Date('2025-08-14T10:00:00Z'),
            quantity: '10.0000000000',
            unitPrice: '20.00000000',
          },
          user1
        )
      ).rejects.toThrow(AuthorizationError);
    });

    it('deve lançar erro se carteira ou ativo não existirem', async () => {
      const randomUuid = crypto.randomUUID();

      await expect(
        createPortfolioEvent(
          {
            portfolioId: randomUuid,
            assetId: globalAssetId,
            type: 'BUY',
            tradeDate: new Date('2025-08-14T10:00:00Z'),
            quantity: '10.0000000000',
            unitPrice: '20.00000000',
          },
          user1
        )
      ).rejects.toThrow(PortfolioNotFoundError);

      await expect(
        createPortfolioEvent(
          {
            portfolioId: portfolio1Id,
            assetId: randomUuid,
            type: 'BUY',
            tradeDate: new Date('2025-08-14T10:00:00Z'),
            quantity: '10.0000000000',
            unitPrice: '20.00000000',
          },
          user1
        )
      ).rejects.toThrow(AssetNotFoundError);
    });

    it('deve realizar rollback atômico e não persistir evento se a auditoria falhar', async () => {
      const spy = vi
        .spyOn(auditModule, 'insertAuditLog')
        .mockRejectedValueOnce(new Error('Simulated Audit Failure for Transaction Rollback'));

      const testEventTradeDate = new Date('2025-08-10T15:00:00Z');

      await expect(
        createPortfolioEvent(
          {
            portfolioId: portfolio1Id,
            assetId: globalAssetId,
            type: 'SELL',
            tradeDate: testEventTradeDate,
            quantity: '999.0000000000',
            unitPrice: '123.00000000',
          },
          user1
        )
      ).rejects.toThrow('Simulated Audit Failure for Transaction Rollback');

      // Verifica fisicamente que o evento não foi gravado no banco
      const rows = await db
        .select()
        .from(portfolioEvents)
        .where(
          and(
            eq(portfolioEvents.portfolioId, portfolio1Id),
            eq(portfolioEvents.quantity, '999.0000000000')
          )
        );

      expect(rows).toHaveLength(0);
      spy.mockRestore();
    });

    it('deve garantir rollback físico via injeção explícita de auditLogger em createPortfolioEvent', async () => {
      const failingAuditLogger = vi.fn<typeof auditModule.insertAuditLog>(async () => {
        throw new Error('Falha injetada no auditLogger (createPortfolioEvent)');
      });
      const testTradeDate = new Date('2025-08-11T12:00:00Z');

      await expect(
        createPortfolioEvent(
          {
            portfolioId: portfolio1Id,
            assetId: globalAssetId,
            type: 'BUY',
            tradeDate: testTradeDate,
            quantity: '888.0000000000',
            unitPrice: '50.00000000',
          },
          user1,
          db,
          failingAuditLogger
        )
      ).rejects.toThrow('Falha injetada no auditLogger (createPortfolioEvent)');

      // Confirma que a dependência injetada foi chamada
      expect(failingAuditLogger).toHaveBeenCalledTimes(1);

      // Verifica fisicamente que o evento não foi persistido
      const rows = await db
        .select()
        .from(portfolioEvents)
        .where(
          and(
            eq(portfolioEvents.portfolioId, portfolio1Id),
            eq(portfolioEvents.quantity, '888.0000000000')
          )
        );

      expect(rows).toHaveLength(0);
    });

    it('deve garantir execução e rollback em chamada direta a createPortfolioEventInTransaction com DatabaseTransaction e auditLogger injetado', async () => {
      const failingAuditLogger = vi.fn<typeof auditModule.insertAuditLog>(async () => {
        throw new Error('Falha injetada no auditLogger (createPortfolioEventInTransaction)');
      });
      const testTradeDate = new Date('2025-08-12T12:00:00Z');

      const validatedData = createPortfolioEventSchema.parse({
        portfolioId: portfolio1Id,
        assetId: globalAssetId,
        type: 'BUY',
        tradeDate: testTradeDate,
        quantity: '777.0000000000',
        unitPrice: '75.00000000',
      });

      let capturedTx: DatabaseTransaction | null = null;

      // Executa a operação dentro de uma transação externa
      await expect(
        db.transaction(async (tx) => {
          capturedTx = tx;
          await createPortfolioEventInTransaction(
            validatedData,
            user1,
            tx,
            failingAuditLogger
          );
        })
      ).rejects.toThrow('Falha injetada no auditLogger (createPortfolioEventInTransaction)');

      // Confirma que o auditLogger injetado foi invocado com o mesmo DatabaseTransaction
      expect(failingAuditLogger).toHaveBeenCalledTimes(1);
      expect(failingAuditLogger.mock.calls[0][0]).toMatchObject({ tableName: 'portfolio_events', action: 'INSERT' });
      expect(failingAuditLogger.mock.calls[0][3]).toBe(capturedTx);

      // Verifica fisicamente que o evento não foi persistido
      const rows = await db
        .select()
        .from(portfolioEvents)
        .where(
          and(
            eq(portfolioEvents.portfolioId, portfolio1Id),
            eq(portfolioEvents.quantity, '777.0000000000')
          )
        );

      expect(rows).toHaveLength(0);
    });
  });

  // ─── 2. listPortfolioEventsByPortfolio ────────────────────────────────────
  describe('listPortfolioEventsByPortfolio', () => {
    it('deve listar eventos da carteira ordenados por tradeDate DESC e createdAt DESC', async () => {
      const events = await listPortfolioEventsByPortfolio(portfolio1Id, user1);

      expect(events.length).toBeGreaterThanOrEqual(2);
      for (const ev of events) {
        expect(ev.portfolioId).toBe(portfolio1Id);
        expect(ev.deletedAt).toBeNull();
      }

      // Verifica ordenação decrescente de tradeDate
      for (let i = 0; i < events.length - 1; i++) {
        expect(new Date(events[i].tradeDate).getTime()).toBeGreaterThanOrEqual(
          new Date(events[i + 1].tradeDate).getTime()
        );
      }
    });

    it('deve filtrar eventos por tipo e limite', async () => {
      const events = await listPortfolioEventsByPortfolio(
        portfolio1Id,
        user1,
        { type: 'BUY', limit: 1 }
      );

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe('BUY');
    });

    it('deve bloquear listagem de eventos em carteira de outro usuário e gerar log de IDOR', async () => {
      await expect(
        listPortfolioEventsByPortfolio(portfolio2Id, user1)
      ).rejects.toThrow(AuthorizationError);

      const [idorAudit] = await db
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.reason, 'FORBIDDEN_IDOR_ATTEMPT'),
            eq(auditLogs.actorId, user1.id)
          )
        )
        .limit(1);

      expect(idorAudit).toBeDefined();
    });
  });

  // ─── 3. getPortfolioEventById ─────────────────────────────────────────────
  describe('getPortfolioEventById', () => {
    it('deve buscar evento ativo por ID com sucesso', async () => {
      const existingId = createdEventIds[0];
      const event = await getPortfolioEventById(existingId, user1);

      expect(event.id).toBe(existingId);
      expect(event.portfolioId).toBe(portfolio1Id);
    });

    it('deve bloquear acesso a evento de outro usuário (IDOR)', async () => {
      const user1EventId = createdEventIds[0];

      await expect(
        getPortfolioEventById(user1EventId, user2)
      ).rejects.toThrow(AuthorizationError);
    });

    it('deve lançar PortfolioEventNotFoundError para ID inexistente', async () => {
      await expect(
        getPortfolioEventById(crypto.randomUUID(), user1)
      ).rejects.toThrow(PortfolioEventNotFoundError);
    });
  });

  // ─── 4. cancelPortfolioEvent ──────────────────────────────────────────────
  describe('cancelPortfolioEvent', () => {
    it('deve cancelar evento com soft delete, registrar justificativa e auditoria, e ocultar da listagem', async () => {
      // Cria um evento exclusivo para teste de cancelamento
      const eventToCancel = await createPortfolioEvent(
        {
          portfolioId: portfolio1Id,
          assetId: globalAssetId,
          type: 'BUY',
          tradeDate: new Date('2025-08-14T09:00:00Z'),
          quantity: '25.0000000000',
          unitPrice: '50.00000000',
        },
        user1
      );
      createdEventIds.push(eventToCancel.id);

      const reason = 'Lançamento efetuado com ativo incorreto para teste';
      await cancelPortfolioEvent(
        eventToCancel.id,
        { cancellationReason: reason },
        user1
      );

      // 1. Verifica no banco que foi marcado com soft delete
      const [canceledRow] = await db
        .select()
        .from(portfolioEvents)
        .where(eq(portfolioEvents.id, eventToCancel.id))
        .limit(1);

      expect(canceledRow.deletedAt).not.toBeNull();
      expect(canceledRow.cancellationReason).toBe(reason);

      // 2. Verifica que o evento não é mais retornado em listPortfolioEventsByPortfolio
      const activeEvents = await listPortfolioEventsByPortfolio(portfolio1Id, user1);
      const existsInList = activeEvents.some((ev) => ev.id === eventToCancel.id);
      expect(existsInList).toBe(false);

      // 3. Verifica que getPortfolioEventById agora lança PortfolioEventNotFoundError
      await expect(
        getPortfolioEventById(eventToCancel.id, user1)
      ).rejects.toThrow(PortfolioEventNotFoundError);

      // 4. Verifica auditoria do cancelamento
      const [auditDelete] = await db
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.tableName, 'portfolio_events'),
            eq(auditLogs.recordId, eventToCancel.id),
            eq(auditLogs.action, 'DELETE')
          )
        )
        .limit(1);

      expect(auditDelete).toBeDefined();
      expect(auditDelete.actorId).toBe(user1.id);
      expect(auditDelete.reason).toBe(reason);
    });

    it('deve rejeitar cancelamento com justificativa inválida ou curta (< 5 caracteres)', async () => {
      const activeEventId = createdEventIds[0];

      await expect(
        cancelPortfolioEvent(
          activeEventId,
          { cancellationReason: '123' },
          user1
        )
      ).rejects.toThrow();

      await expect(
        cancelPortfolioEvent(
          activeEventId,
          { cancellationReason: '     ' },
          user1
        )
      ).rejects.toThrow();
    });

    it('deve bloquear cancelamento de evento pertencente a outro usuário', async () => {
      const user1EventId = createdEventIds[0];

      await expect(
        cancelPortfolioEvent(
          user1EventId,
          { cancellationReason: 'Tentativa indevida de cancelamento' },
          user2
        )
      ).rejects.toThrow(AuthorizationError);
    });
  });
});
