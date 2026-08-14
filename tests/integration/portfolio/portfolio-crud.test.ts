import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../../../src/lib/db';
import { users } from '../../../src/lib/db/schema/identity';
import { portfolios } from '../../../src/lib/db/schema/portfolio';
import { auditLogs } from '../../../src/lib/db/schema/audit';
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
import { eq, inArray, and } from 'drizzle-orm';
import crypto from 'node:crypto';

describe('Integração: PortfolioService CRUD, Isolamento e Auditoria', () => {
  const user1Id = crypto.randomUUID();
  const user2Id = crypto.randomUUID();

  let user1: SafeUser;
  let user2: SafeUser;

  const createdPortfolioIds: string[] = [];

  beforeAll(async () => {
    // 1. Cria dois usuários reais no PostgreSQL
    const now = new Date();
    await db.insert(users).values([
      {
        id: user1Id,
        email: `crud_user1_${Date.now()}@carteiraexpert.test`,
        name: 'Portfolio User 1',
        passwordHash: 'dummy_hash_user1',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: user2Id,
        email: `crud_user2_${Date.now()}@carteiraexpert.test`,
        name: 'Portfolio User 2',
        passwordHash: 'dummy_hash_user2',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
    ]);

    user1 = {
      id: user1Id,
      email: `crud_user1_${Date.now()}@carteiraexpert.test`,
      name: 'Portfolio User 1',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    user2 = {
      id: user2Id,
      email: `crud_user2_${Date.now()}@carteiraexpert.test`,
      name: 'Portfolio User 2',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
  });

  afterAll(async () => {
    // Limpeza em ordem reversa para respeitar FKs
    if (createdPortfolioIds.length > 0) {
      await db.delete(auditLogs).where(inArray(auditLogs.recordId, createdPortfolioIds));
      await db.delete(portfolios).where(inArray(portfolios.id, createdPortfolioIds));
    }
    await db.delete(auditLogs).where(inArray(auditLogs.actorId, [user1Id, user2Id]));
    await db.delete(users).where(inArray(users.id, [user1Id, user2Id]));
  });

  // ─── 1. Criação e Listagem Isolada por Usuário ───────────────────────────
  describe('Criação e Listagem Isolada', () => {
    let portfolioAId: string;
    let portfolioBId: string;
    let portfolioCId: string;

    it('deve permitir que User 1 crie suas carteiras e que sejam persistidas no PostgreSQL', async () => {
      const portA = await createPortfolio(
        {
          name: 'Carteira Ações User 1',
          description: 'Ações de crescimento',
          baseCurrency: 'BRL',
        },
        user1
      );

      const portB = await createPortfolio(
        {
          name: 'Carteira FIIs User 1',
          description: 'Fundos imobiliários',
          baseCurrency: 'BRL',
        },
        user1
      );

      portfolioAId = portA.id;
      portfolioBId = portB.id;
      createdPortfolioIds.push(portfolioAId, portfolioBId);

      expect(portA.name).toBe('Carteira Ações User 1');
      expect(portA.userId).toBe(user1.id);
      expect(portA.status).toBe('active');
      expect(portA.baseCurrency).toBe('BRL');

      // Verifica auditoria de inserção
      const auditRows = await db
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.tableName, 'portfolios'),
            eq(auditLogs.recordId, portfolioAId),
            eq(auditLogs.action, 'INSERT')
          )
        );

      expect(auditRows).toHaveLength(1);
      expect(auditRows[0].actorId).toBe(user1.id);
    });

    it('deve permitir que User 2 crie sua carteira isolada', async () => {
      const portC = await createPortfolio(
        {
          name: 'Carteira Global User 2',
          description: 'Ativos internacionais',
          baseCurrency: 'USD',
        },
        user2
      );

      portfolioCId = portC.id;
      createdPortfolioIds.push(portfolioCId);

      expect(portC.name).toBe('Carteira Global User 2');
      expect(portC.userId).toBe(user2.id);
      expect(portC.baseCurrency).toBe('USD');
    });

    it('deve garantir que listPortfolios(user1) retorne estritamente as carteiras de User 1', async () => {
      const listUser1 = await listPortfolios(user1);
      const ids = listUser1.map((p) => p.id);

      expect(ids).toContain(portfolioAId);
      expect(ids).toContain(portfolioBId);
      expect(ids).not.toContain(portfolioCId);
    });

    it('deve garantir que listPortfolios(user2) retorne estritamente as carteiras de User 2', async () => {
      const listUser2 = await listPortfolios(user2);
      const ids = listUser2.map((p) => p.id);

      expect(ids).toContain(portfolioCId);
      expect(ids).not.toContain(portfolioAId);
      expect(ids).not.toContain(portfolioBId);
    });
  });

  // ─── 2. Tentativas de IDOR e Auditoria de Segurança ──────────────────────
  describe('Proteção contra Acesso Cruzado Indevido (IDOR)', () => {
    let targetPortfolioId: string;

    beforeAll(async () => {
      const port = await createPortfolio(
        {
          name: 'Carteira Privada User 1',
          baseCurrency: 'BRL',
        },
        user1
      );
      targetPortfolioId = port.id;
      createdPortfolioIds.push(targetPortfolioId);
    });

    it('deve bloquear User 2 ao tentar ler a carteira de User 1 (IDOR READ) e registrar auditoria de segurança', async () => {
      await expect(getPortfolioById(targetPortfolioId, user2)).rejects.toThrow(
        AuthorizationError
      );

      // Verifica log de auditoria de tentativa de IDOR
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
      expect(idorLogs[0].tableName).toBe('audit_logs');
      // Garante que o ID do recurso privado de User 1 não vazou no recordId
      expect(idorLogs[0].recordId).not.toBe(targetPortfolioId);
    });

    it('deve bloquear User 2 ao tentar atualizar a carteira de User 1 (IDOR UPDATE)', async () => {
      await expect(
        updatePortfolio(targetPortfolioId, { name: 'Nome Hackeado' }, user2)
      ).rejects.toThrow(AuthorizationError);

      // Confirma que a carteira no banco permanece inalterada
      const [row] = await db
        .select()
        .from(portfolios)
        .where(eq(portfolios.id, targetPortfolioId));

      expect(row.name).toBe('Carteira Privada User 1');
    });

    it('deve bloquear User 2 ao tentar deletar a carteira de User 1 (IDOR DELETE)', async () => {
      await expect(deletePortfolio(targetPortfolioId, user2)).rejects.toThrow(
        AuthorizationError
      );

      // Confirma que a carteira no banco permanece ativa
      const [row] = await db
        .select()
        .from(portfolios)
        .where(eq(portfolios.id, targetPortfolioId));

      expect(row.deletedAt).toBeNull();
    });
  });

  // ─── 3. Atualização e Soft Delete Legítimos ────────────────────────────────
  describe('Atualização e Exclusão Lógica Legítimas', () => {
    let portfolioId: string;

    beforeAll(async () => {
      const port = await createPortfolio(
        {
          name: 'Carteira Para Modificar',
          description: 'Desc Inicial',
          baseCurrency: 'BRL',
        },
        user1
      );
      portfolioId = port.id;
      createdPortfolioIds.push(portfolioId);
    });

    it('deve atualizar carteira com sucesso pelo proprietário e gravar auditoria', async () => {
      const updated = await updatePortfolio(
        portfolioId,
        {
          name: 'Carteira Modificada Com Sucesso',
          description: 'Desc Atualizada',
          status: 'archived',
        },
        user1
      );

      expect(updated.name).toBe('Carteira Modificada Com Sucesso');
      expect(updated.description).toBe('Desc Atualizada');
      expect(updated.status).toBe('archived');

      // Verifica no banco
      const [dbRow] = await db
        .select()
        .from(portfolios)
        .where(eq(portfolios.id, portfolioId));

      expect(dbRow.name).toBe('Carteira Modificada Com Sucesso');
      expect(dbRow.status).toBe('archived');

      // Verifica log de auditoria UPDATE
      const updateLogs = await db
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.tableName, 'portfolios'),
            eq(auditLogs.recordId, portfolioId),
            eq(auditLogs.action, 'UPDATE')
          )
        );

      expect(updateLogs).toHaveLength(1);
      expect((updateLogs[0].oldValue as any)?.name).toBe('Carteira Para Modificar');
      expect((updateLogs[0].newValue as any)?.name).toBe('Carteira Modificada Com Sucesso');
    });

    it('deve realizar soft delete, ocultar da listagem e lançar PortfolioNotFoundError em buscas subsequentes', async () => {
      await deletePortfolio(portfolioId, user1);

      // 1. Verifica que no banco físico a coluna deleted_at foi preenchida
      const [dbRow] = await db
        .select()
        .from(portfolios)
        .where(eq(portfolios.id, portfolioId));

      expect(dbRow.deletedAt).not.toBeNull();

      // 2. listPortfolios não deve mais listar a carteira
      const activeList = await listPortfolios(user1);
      const ids = activeList.map((p) => p.id);
      expect(ids).not.toContain(portfolioId);

      // 3. getPortfolioById deve lançar PortfolioNotFoundError
      await expect(getPortfolioById(portfolioId, user1)).rejects.toThrow(
        PortfolioNotFoundError
      );

      // 4. Verifica log de auditoria DELETE
      const deleteLogs = await db
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.tableName, 'portfolios'),
            eq(auditLogs.recordId, portfolioId),
            eq(auditLogs.action, 'DELETE')
          )
        );

      expect(deleteLogs).toHaveLength(1);
      expect(deleteLogs[0].actorId).toBe(user1.id);
    });
  });
});
