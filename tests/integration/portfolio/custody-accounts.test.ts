import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../../../src/lib/db';
import { users } from '../../../src/lib/db/schema/identity';
import { portfolios, portfolioEvents, assets } from '../../../src/lib/db/schema/portfolio';
import { custodyInstitutions, custodyAccounts } from '../../../src/lib/db/schema/custody';
import { userPlans } from '../../../src/lib/db/schema/plans';
import { auditLogs } from '../../../src/lib/db/schema/audit';
import { createPortfolio } from '../../../src/modules/portfolio/server/portfolio.service';
import {
  getCustodyInstitutions,
  getCustodyAccountsByPortfolio,
  getCustodyAccountById,
  createCustodyAccount,
  updateCustodyAccount,
  archiveCustodyAccount,
} from '../../../src/modules/portfolio/server/custody.service';
import { createPortfolioEvent } from '../../../src/modules/portfolio/server/portfolio-event.service';
import {
  CustodyAccountNotFoundError,
  CustodyAccountArchivedError,
  InvalidCustodyAccountError,
} from '../../../src/modules/portfolio/domain/errors';
import { AuthorizationError } from '../../../src/modules/identity/domain/errors';
import type { SafeUser } from '../../../src/modules/identity/domain/user.types';
import { eq, inArray } from 'drizzle-orm';
import crypto from 'node:crypto';

describe('Integração: Instituições de Custódia e Corretoras (Etapa 5/10)', () => {
  const userAId = crypto.randomUUID();
  const userBId = crypto.randomUUID();
  let userA: SafeUser;
  let userB: SafeUser;

  let portfolioAId: string;
  let portfolioBId: string;
  const createdPortfolioIds: string[] = [];
  let testAssetId: string;

  beforeAll(async () => {
    const now = new Date();

    // 1. Cria usuários A e B
    await db.insert(users).values([
      {
        id: userAId,
        email: `custody_user_a_${Date.now()}@carteiraexpert.test`,
        name: 'Custody User A',
        passwordHash: 'dummy',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: userBId,
        email: `custody_user_b_${Date.now()}@carteiraexpert.test`,
        name: 'Custody User B',
        passwordHash: 'dummy',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
    ]);

    // 2. Planos PRO para ambos
    await db.insert(userPlans).values([
      {
        id: crypto.randomUUID(),
        userId: userAId,
        planId: 'pro',
        status: 'active',
        startsAt: now,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: crypto.randomUUID(),
        userId: userBId,
        planId: 'pro',
        status: 'active',
        startsAt: now,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    userA = {
      id: userAId,
      email: `custody_user_a_${Date.now()}@carteiraexpert.test`,
      name: 'Custody User A',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    userB = {
      id: userBId,
      email: `custody_user_b_${Date.now()}@carteiraexpert.test`,
      name: 'Custody User B',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    // 3. Carteiras para User A e User B
    const portA = await createPortfolio(
      { name: 'Carteira User A', description: 'Test', baseCurrency: 'BRL' },
      userA
    );
    portfolioAId = portA.id;
    createdPortfolioIds.push(portfolioAId);

    const portB = await createPortfolio(
      { name: 'Carteira User B', description: 'Test', baseCurrency: 'BRL' },
      userB
    );
    portfolioBId = portB.id;
    createdPortfolioIds.push(portfolioBId);

    // 4. Ativo para testes de operação
    testAssetId = crypto.randomUUID();
    await db.insert(assets).values({
      id: testAssetId,
      ticker: `TEST_CUSTODY_${Date.now()}`,
      name: 'Ativo Teste Custodia',
      assetType: 'stock',
      market: 'B3',
      currency: 'BRL',
      isCustom: false,
      createdAt: now,
      updatedAt: now,
    });
  });

  afterAll(async () => {
    // Limpeza em cascata ordenada
    if (createdPortfolioIds.length > 0) {
      await db.delete(portfolioEvents).where(inArray(portfolioEvents.portfolioId, createdPortfolioIds));
      await db.delete(custodyAccounts).where(inArray(custodyAccounts.portfolioId, createdPortfolioIds));
      await db.delete(portfolios).where(inArray(portfolios.id, createdPortfolioIds));
    }
    if (testAssetId) {
      await db.delete(assets).where(eq(assets.id, testAssetId));
    }
    await db.delete(userPlans).where(inArray(userPlans.userId, [userAId, userBId]));
    await db.delete(auditLogs).where(inArray(auditLogs.actorId, [userAId, userBId]));
    await db.delete(users).where(inArray(users.id, [userAId, userBId]));
  });

  describe('1. Catálogo de Instituições de Custódia', () => {
    it('deve listar as instituições ativas cadastradas via seed da migração 0020', async () => {
      const institutions = await getCustodyInstitutions();

      expect(institutions.length).toBeGreaterThanOrEqual(15);
      const xp = institutions.find((i) => i.name.includes('XP') || i.code === '102');
      const btg = institutions.find((i) => i.name.includes('BTG') || i.code === '208');
      const avenue = institutions.find((i) => i.name.includes('Avenue') || i.code === 'AVENUE');

      expect(xp).toBeDefined();
      expect(xp?.name).toContain('XP');
      expect(xp?.status).toBe('active');

      expect(btg).toBeDefined();
      expect(btg?.code).toBe('208');

      expect(avenue).toBeDefined();
      expect(avenue?.country).toBe('US');
    });
  });

  describe('2. Criação e Consulta de Contas de Custódia', () => {
    it('deve permitir que o titular crie uma conta de custódia vinculada à sua carteira', async () => {
      const institutions = await getCustodyInstitutions();
      const xp = institutions.find((i) => i.name.includes('XP') || i.code === '102')!;

      const account = await createCustodyAccount(
        {
          portfolioId: portfolioAId,
          institutionId: xp.id,
          name: 'Conta XP Principal',
          accountNumber: '123456-0',
        },
        userA
      );

      expect(account.id).toBeDefined();
      expect(account.portfolioId).toBe(portfolioAId);
      expect(account.institutionId).toBe(xp.id);
      expect(account.name).toBe('Conta XP Principal');
      expect(account.accountNumber).toBe('123456-0');
      expect(account.status).toBe('active');
      expect(account.institution.code).toBe(xp.code);

      // Verifica auditoria
      const logs = await db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.recordId, account.id));

      expect(logs.length).toBeGreaterThanOrEqual(1);
      expect(logs[0].action).toBe('INSERT');
      expect(logs[0].actorId).toBe(userAId);
    });

    it('deve listar as contas da carteira pertencentes ao usuário titular', async () => {
      const accounts = await getCustodyAccountsByPortfolio(portfolioAId, userA);
      expect(accounts.length).toBeGreaterThanOrEqual(1);
      expect(accounts[0].portfolioId).toBe(portfolioAId);
      expect(accounts[0].institution).toBeDefined();
    });

    it('deve obter uma conta por ID se o usuário for o titular', async () => {
      const accounts = await getCustodyAccountsByPortfolio(portfolioAId, userA);
      const acc = accounts[0];

      const fetched = await getCustodyAccountById(acc.id, userA);
      expect(fetched.id).toBe(acc.id);
      expect(fetched.name).toBe(acc.name);
    });
  });

  describe('3. Isolamento IDOR e Segurança Multi-tenant', () => {
    it('deve impedir que userB liste contas de custódia da carteira de userA', async () => {
      await expect(
        getCustodyAccountsByPortfolio(portfolioAId, userB)
      ).rejects.toThrow(AuthorizationError);
    });

    it('deve impedir que userB acesse diretamente por ID uma conta de custódia de userA', async () => {
      const accounts = await getCustodyAccountsByPortfolio(portfolioAId, userA);
      const accA = accounts[0];

      await expect(
        getCustodyAccountById(accA.id, userB)
      ).rejects.toThrow(AuthorizationError);
    });

    it('deve impedir que userB atualize uma conta de custódia de userA', async () => {
      const accounts = await getCustodyAccountsByPortfolio(portfolioAId, userA);
      const accA = accounts[0];

      await expect(
        updateCustodyAccount(
          {
            id: accA.id,
            portfolioId: portfolioAId,
            name: 'Tentativa Invasão',
          },
          userB
        )
      ).rejects.toThrow(AuthorizationError);
    });

    it('deve impedir que userB arquive uma conta de custódia de userA', async () => {
      const accounts = await getCustodyAccountsByPortfolio(portfolioAId, userA);
      const accA = accounts[0];

      await expect(
        archiveCustodyAccount(
          {
            id: accA.id,
            portfolioId: portfolioAId,
          },
          userB
        )
      ).rejects.toThrow(AuthorizationError);
    });
  });

  describe('4. Atualização e Arquivamento de Conta de Custódia', () => {
    it('deve permitir que o titular atualize o nome e número da conta de custódia', async () => {
      const accounts = await getCustodyAccountsByPortfolio(portfolioAId, userA);
      const acc = accounts[0];

      const updated = await updateCustodyAccount(
        {
          id: acc.id,
          portfolioId: portfolioAId,
          name: 'Conta XP Investimentos VIP',
          accountNumber: '999999-1',
        },
        userA
      );

      expect(updated.name).toBe('Conta XP Investimentos VIP');
      expect(updated.accountNumber).toBe('999999-1');
    });

    it('deve permitir que o titular arquive a conta de custódia', async () => {
      const institutions = await getCustodyInstitutions();
      const btg = institutions.find((i) => i.name.includes('BTG') || i.code === '208')!;

      const newAcc = await createCustodyAccount(
        {
          portfolioId: portfolioAId,
          institutionId: btg.id,
          name: 'Conta BTG para Arquivar',
        },
        userA
      );

      const archived = await archiveCustodyAccount(
        {
          id: newAcc.id,
          portfolioId: portfolioAId,
        },
        userA
      );

      expect(archived.status).toBe('archived');

      // Verifica auditoria de arquivamento
      const logs = await db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.recordId, newAcc.id));

      const archiveLog = logs.find((l) => l.action === 'UPDATE');
      expect(archiveLog).toBeDefined();
    });
  });

  describe('5. Integração com Portfolio Events (Operações com Ativo)', () => {
    it('deve persistir custody_account_id ao registrar evento de compra com conta válida', async () => {
      const accounts = await getCustodyAccountsByPortfolio(portfolioAId, userA);
      const activeAccount = accounts.find((a) => a.status === 'active')!;

      const event = await createPortfolioEvent(
        {
          portfolioId: portfolioAId,
          assetId: testAssetId,
          type: 'BUY',
          tradeDate: '2026-09-04T12:00:00Z',
          quantity: '10',
          unitPrice: '25.50',
          fees: '2.00',
          custodyAccountId: activeAccount.id,
        },
        userA
      );

      expect(event.id).toBeDefined();
      expect(event.custodyAccountId).toBe(activeAccount.id);

      // Confirma persistência física no banco de dados
      const [persisted] = await db
        .select()
        .from(portfolioEvents)
        .where(eq(portfolioEvents.id, event.id));

      expect(persisted.custodyAccountId).toBe(activeAccount.id);
    });

    it('deve rejeitar registrar operação vinculada a conta de custódia pertencente a outra carteira', async () => {
      // Cria conta na carteira B
      const institutions = await getCustodyInstitutions();
      const accountB = await createCustodyAccount(
        {
          portfolioId: portfolioBId,
          institutionId: institutions[0].id,
          name: 'Conta Corretora B',
        },
        userB
      );

      // Tenta criar evento na carteira A vinculando a conta da carteira B
      await expect(
        createPortfolioEvent(
          {
            portfolioId: portfolioAId,
            assetId: testAssetId,
            type: 'BUY',
            tradeDate: '2026-09-04T12:00:00Z',
            quantity: '5',
            unitPrice: '20.00',
            custodyAccountId: accountB.id,
          },
          userA
        )
      ).rejects.toThrow(CustodyAccountNotFoundError);
    });

    it('deve rejeitar registrar operação vinculada a uma conta de custódia arquivada', async () => {
      const accounts = await getCustodyAccountsByPortfolio(portfolioAId, userA);
      const archivedAccount = accounts.find((a) => a.status === 'archived')!;

      await expect(
        createPortfolioEvent(
          {
            portfolioId: portfolioAId,
            assetId: testAssetId,
            type: 'BUY',
            tradeDate: '2026-09-04T12:00:00Z',
            quantity: '5',
            unitPrice: '20.00',
            custodyAccountId: archivedAccount.id,
          },
          userA
        )
      ).rejects.toThrow(CustodyAccountArchivedError);
    });

    it('deve permitir registrar operação sem conta de custódia (retrocompatibilidade)', async () => {
      const event = await createPortfolioEvent(
        {
          portfolioId: portfolioAId,
          assetId: testAssetId,
          type: 'BUY',
          tradeDate: '2026-09-04T12:00:00Z',
          quantity: '5',
          unitPrice: '30.00',
        },
        userA
      );

      expect(event.id).toBeDefined();
      expect(event.custodyAccountId).toBeNull();
    });
  });
});
