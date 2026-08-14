import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { db } from '../../../src/lib/db';
import { users } from '../../../src/lib/db/schema/identity';
import { assets } from '../../../src/lib/db/schema/portfolio';
import { auditLogs } from '../../../src/lib/db/schema/audit';
import * as auditModule from '../../../src/lib/db/audit';
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
import { eq, inArray, and } from 'drizzle-orm';
import crypto from 'node:crypto';

describe('Integração: AssetService Consulta, Custom Assets, Unicidade e IDOR', () => {
  const user1Id = crypto.randomUUID();
  const user2Id = crypto.randomUUID();

  let user1: SafeUser;
  let user2: SafeUser;

  const globalAssetId = crypto.randomUUID();
  const globalTicker = `GL_${Date.now().toString().slice(-8)}`;

  const createdAssetIds: string[] = [globalAssetId];

  beforeAll(async () => {
    const now = new Date();

    // 1. Cria dois usuários reais no PostgreSQL
    await db.insert(users).values([
      {
        id: user1Id,
        email: `asset_user1_${Date.now()}@carteiraexpert.test`,
        name: 'Asset User 1',
        passwordHash: 'dummy_hash_user1',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: user2Id,
        email: `asset_user2_${Date.now()}@carteiraexpert.test`,
        name: 'Asset User 2',
        passwordHash: 'dummy_hash_user2',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
    ]);

    user1 = {
      id: user1Id,
      email: `asset_user1_${Date.now()}@carteiraexpert.test`,
      name: 'Asset User 1',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    user2 = {
      id: user2Id,
      email: `asset_user2_${Date.now()}@carteiraexpert.test`,
      name: 'Asset User 2',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    // 2. Insere um ativo global para os testes de busca compartilhada
    await db.insert(assets).values({
      id: globalAssetId,
      ticker: globalTicker,
      name: 'Ativo Global de Teste',
      assetType: 'stock',
      market: 'B3',
      currency: 'BRL',
      isCustom: false,
      userId: null,
      createdAt: now,
      updatedAt: now,
    });
  });

  afterAll(async () => {
    // Limpeza de assets criados e logs de auditoria
    if (createdAssetIds.length > 0) {
      await db.delete(auditLogs).where(inArray(auditLogs.recordId, createdAssetIds));
      await db.delete(assets).where(inArray(assets.id, createdAssetIds));
    }
    await db.delete(auditLogs).where(inArray(auditLogs.actorId, [user1Id, user2Id]));
    await db.delete(users).where(inArray(users.id, [user1Id, user2Id]));
  });

  // ─── 1. Criação de Ativos Customizados e Auditoria ────────────────────────
  describe('Criação de Ativos Customizados', () => {
    let custom1Id: string;
    const tickerU1 = `C1_${Date.now().toString().slice(-8)}`;

    it('deve criar ativo customizado para User 1 e persistir no PostgreSQL com auditoria', async () => {
      const created = await createCustomAsset(
        {
          ticker: tickerU1,
          name: 'Ativo Custom User 1',
          currency: 'BRL',
        },
        user1
      );

      custom1Id = created.id;
      createdAssetIds.push(custom1Id);

      expect(created.ticker).toBe(tickerU1);
      expect(created.name).toBe('Ativo Custom User 1');
      expect(created.isCustom).toBe(true);
      expect(created.userId).toBe(user1.id);
      expect(created.market).toBe('CUSTOM');
      expect(created.assetType).toBe('custom');

      // Verifica auditoria
      const auditRows = await db
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.tableName, 'assets'),
            eq(auditLogs.recordId, custom1Id),
            eq(auditLogs.action, 'INSERT')
          )
        );

      expect(auditRows).toHaveLength(1);
      expect(auditRows[0].actorId).toBe(user1.id);
      expect((auditRows[0].newValue as any)?.ticker).toBe(tickerU1);
    });

    it('deve converter erro de duplicidade de ticker para o mesmo usuário em DuplicateAssetError', async () => {
      await expect(
        createCustomAsset(
          {
            ticker: tickerU1,
            name: 'Tentativa Duplicada',
          },
          user1
        )
      ).rejects.toThrow(DuplicateAssetError);
    });

    it('deve garantir atomicidade com rollback físico no PostgreSQL caso a auditoria falhe', async () => {
      const failedTicker = `FA_${Date.now().toString().slice(-8)}`;

      // Simula falha na gravação de auditoria dentro da transação
      const insertAuditSpy = vi
        .spyOn(auditModule, 'insertAuditLog')
        .mockRejectedValueOnce(new Error('Falha simulada de I/O na auditoria'));

      try {
        await expect(
          createCustomAsset(
            {
              ticker: failedTicker,
              name: 'Ativo Que Deve Sofrer Rollback',
              currency: 'BRL',
            },
            user1
          )
        ).rejects.toThrow('Falha simulada de I/O na auditoria');

        // Confirma fisicamente no PostgreSQL que o ativo NÃO foi persistido
        const rows = await db
          .select()
          .from(assets)
          .where(
            and(eq(assets.ticker, failedTicker), eq(assets.userId, user1.id))
          );

        expect(rows).toHaveLength(0);
      } finally {
        insertAuditSpy.mockRestore();
      }
    });
  });

  // ─── 2. Isolamento com Mesmo Ticker entre Usuários Diferentes ─────────────
  describe('Isolamento com Mesmo Ticker entre Usuários', () => {
    const sharedTicker = `SH_${Date.now().toString().slice(-8)}`;
    let u1SharedId: string;
    let u2SharedId: string;

    it('deve permitir que User 1 e User 2 criem ativos customizados com exatamente o mesmo ticker', async () => {
      const a1 = await createCustomAsset(
        { ticker: sharedTicker, name: 'Ativo Compartilhado User 1' },
        user1
      );
      const a2 = await createCustomAsset(
        { ticker: sharedTicker, name: 'Ativo Compartilhado User 2' },
        user2
      );

      u1SharedId = a1.id;
      u2SharedId = a2.id;
      createdAssetIds.push(u1SharedId, u2SharedId);

      expect(a1.ticker).toBe(sharedTicker);
      expect(a1.userId).toBe(user1.id);
      expect(a2.ticker).toBe(sharedTicker);
      expect(a2.userId).toBe(user2.id);
    });

    it('User 1 ao buscar pelo ticker compartilhado deve ver somente seu próprio ativo', async () => {
      const results = await searchAssets({ query: sharedTicker }, user1);
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe(u1SharedId);
      expect(results[0].userId).toBe(user1.id);
      expect(results[0].name).toBe('Ativo Compartilhado User 1');
    });

    it('User 2 ao buscar pelo ticker compartilhado deve ver somente seu próprio ativo', async () => {
      const results = await searchAssets({ query: sharedTicker }, user2);
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe(u2SharedId);
      expect(results[0].userId).toBe(user2.id);
      expect(results[0].name).toBe('Ativo Compartilhado User 2');
    });

    it('listCustomAssets deve manter isolamento dos ativos com mesmo ticker', async () => {
      const listU1 = await listCustomAssets(user1);
      const listU2 = await listCustomAssets(user2);

      const u1Ids = listU1.map((a) => a.id);
      const u2Ids = listU2.map((a) => a.id);

      expect(u1Ids).toContain(u1SharedId);
      expect(u1Ids).not.toContain(u2SharedId);

      expect(u2Ids).toContain(u2SharedId);
      expect(u2Ids).not.toContain(u1SharedId);
    });
  });

  // ─── 3. Busca e Isolamento de Visibilidade ────────────────────────────────
  describe('Busca Unificada e Isolamento', () => {
    let u1AssetId: string;
    let u2AssetId: string;
    const uniqueU1Ticker = `U1_${Date.now().toString().slice(-8)}`;
    const uniqueU2Ticker = `U2_${Date.now().toString().slice(-8)}`;

    beforeAll(async () => {
      const a1 = await createCustomAsset(
        { ticker: uniqueU1Ticker, name: 'Específico User 1' },
        user1
      );
      const a2 = await createCustomAsset(
        { ticker: uniqueU2Ticker, name: 'Específico User 2' },
        user2
      );
      u1AssetId = a1.id;
      u2AssetId = a2.id;
      createdAssetIds.push(u1AssetId, u2AssetId);
    });

    it('User 1 deve encontrar o ativo global e o seu próprio ativo customizado', async () => {
      const results = await searchAssets({ query: uniqueU1Ticker }, user1);
      const tickers = results.map((a) => a.ticker);

      expect(tickers).toContain(uniqueU1Ticker);
      expect(tickers).not.toContain(uniqueU2Ticker);
    });

    it('User 2 deve encontrar o ativo global e o seu próprio ativo customizado', async () => {
      const results = await searchAssets({ query: uniqueU2Ticker }, user2);
      const tickers = results.map((a) => a.ticker);

      expect(tickers).toContain(uniqueU2Ticker);
      expect(tickers).not.toContain(uniqueU1Ticker);
    });

    it('Ambos os usuários devem conseguir buscar o ativo global', async () => {
      const resU1 = await searchAssets({ query: globalTicker }, user1);
      const resU2 = await searchAssets({ query: globalTicker }, user2);

      expect(resU1.map((a) => a.id)).toContain(globalAssetId);
      expect(resU2.map((a) => a.id)).toContain(globalAssetId);
    });
  });

  // ─── 4. Obtenção por ID e Proteção contra IDOR ────────────────────────────
  describe('getAssetById e Proteção contra IDOR', () => {
    let privateAssetId: string;

    beforeAll(async () => {
      const a = await createCustomAsset(
        { ticker: `PR_${Date.now().toString().slice(-8)}`, name: 'Ativo Privadíssimo' },
        user1
      );
      privateAssetId = a.id;
      createdAssetIds.push(privateAssetId);
    });

    it('deve permitir que qualquer usuário leia o ativo global', async () => {
      const a1 = await getAssetById(globalAssetId, user1);
      const a2 = await getAssetById(globalAssetId, user2);

      expect(a1.id).toBe(globalAssetId);
      expect(a2.id).toBe(globalAssetId);
    });

    it('deve permitir que o proprietário leia seu próprio ativo customizado', async () => {
      const a = await getAssetById(privateAssetId, user1);
      expect(a.id).toBe(privateAssetId);
    });

    it('deve bloquear User 2 ao tentar ler ativo customizado de User 1 (IDOR) e registrar auditoria', async () => {
      await expect(getAssetById(privateAssetId, user2)).rejects.toThrow(
        AuthorizationError
      );

      // Verifica log de tentativa de IDOR
      const idorLogs = await db
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.actorId, user2.id),
            eq(auditLogs.reason, 'FORBIDDEN_IDOR_ATTEMPT')
          )
        );

      expect(idorLogs.length).toBeGreaterThanOrEqual(1);
      // Confirma que o ID real do ativo não vazou no recordId do log
      expect(idorLogs[0].recordId).not.toBe(privateAssetId);
    });

    it('deve lançar AssetNotFoundError para UUID inexistente ou inválido', async () => {
      await expect(getAssetById('invalid-uuid', user1)).rejects.toThrow(
        AssetNotFoundError
      );
      await expect(getAssetById(crypto.randomUUID(), user1)).rejects.toThrow(
        AssetNotFoundError
      );
    });
  });

  // ─── 5. Listagem de Ativos Customizados ────────────────────────────────────
  describe('listCustomAssets', () => {
    it('deve retornar estritamente os ativos customizados do usuário', async () => {
      const listU1 = await listCustomAssets(user1);
      const listU2 = await listCustomAssets(user2);

      expect(listU1.every((a) => a.isCustom && a.userId === user1.id)).toBe(true);
      expect(listU2.every((a) => a.isCustom && a.userId === user2.id)).toBe(true);
    });
  });
});
