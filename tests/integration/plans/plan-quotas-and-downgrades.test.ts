import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { eq, inArray, and, isNull } from 'drizzle-orm';
import { db } from '../../../src/lib/db';
import { users } from '../../../src/lib/db/schema/identity';
import { portfolios, assets, portfolioEvents } from '../../../src/lib/db/schema/portfolio';
import { commercialPlans, userPlans } from '../../../src/lib/db/schema/plans';
import { auditLogs } from '../../../src/lib/db/schema/audit';
import type { SafeUser } from '../../../src/modules/identity/domain/user.types';
import {
  createPortfolio,
  updatePortfolio,
  deletePortfolio,
  getPortfolioById,
} from '../../../src/modules/portfolio/server/portfolio.service';
import {
  createPortfolioEvent,
  cancelPortfolioEvent,
} from '../../../src/modules/portfolio/server/portfolio-event.service';
import {
  createCorporateActionEvent,
  createBonusEvent,
  createIncomeEvent,
} from '../../../src/modules/corporate-actions/server/corporate-action.service';
import {
  getUserEffectivePlan,
  getPlanQuotaSummary,
  changeUserPlan,
  applyPlanDowngradeInTransaction,
  listCommercialPlans,
} from '../../../src/modules/plans/server/plan.service';
import {
  PlanLimitExceededError,
  PortfolioFrozenError,
  InvalidPortfolioStatusTransitionError,
} from '../../../src/modules/plans/domain/errors';
import { Decimal } from '../../../src/lib/decimal';

describe('Integração: Planos Comerciais, Quotas e Carteiras Congeladas', () => {
  const userAId = crypto.randomUUID();
  const userBId = crypto.randomUUID();

  let userA: SafeUser;
  let userB: SafeUser;

  const testAssetId = crypto.randomUUID();
  const createdPortfolioIds: string[] = [];

  beforeAll(async () => {
    const now = new Date();

    // 1. Cria usuários no banco de testes
    await db.insert(users).values([
      {
        id: userAId,
        email: `plan_user_a_${Date.now()}@carteiraexpert.test`,
        name: 'Plan User A',
        passwordHash: 'dummy_hash_a',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: userBId,
        email: `plan_user_b_${Date.now()}@carteiraexpert.test`,
        name: 'Plan User B',
        passwordHash: 'dummy_hash_b',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
    ]);

    userA = {
      id: userAId,
      email: `plan_user_a_${Date.now()}@carteiraexpert.test`,
      name: 'Plan User A',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    userB = {
      id: userBId,
      email: `plan_user_b_${Date.now()}@carteiraexpert.test`,
      name: 'Plan User B',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    // 2. Cria ativo global para os testes de eventos
    await db.insert(assets).values({
      id: testAssetId,
      ticker: 'TEST3',
      name: 'Test S.A.',
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
    // Limpeza de tabelas respeitando constraints
    if (createdPortfolioIds.length > 0) {
      await db.delete(portfolioEvents).where(inArray(portfolioEvents.portfolioId, createdPortfolioIds));
      await db.delete(portfolios).where(inArray(portfolios.id, createdPortfolioIds));
    }
    await db.delete(assets).where(eq(assets.id, testAssetId));
    await db.delete(userPlans).where(inArray(userPlans.userId, [userAId, userBId]));
    await db.delete(auditLogs).where(inArray(auditLogs.actorId, [userAId, userBId]));
    await db.delete(users).where(inArray(users.id, [userAId, userBId]));
  });

  // ─── 1. Catálogo e Resolução Padrão ──────────────────────────────────────
  describe('Catálogo e Fallback do Plano FREE', () => {
    it('deve confirmar que os planos "free" e "pro" existem no banco físico', async () => {
      const plans = await db.select().from(commercialPlans);
      const freePlan = plans.find((p) => p.id === 'free');
      const proPlan = plans.find((p) => p.id === 'pro');

      expect(freePlan).toBeDefined();
      expect(freePlan?.maxActivePortfolios).toBe(2);
      expect(proPlan).toBeDefined();
      expect(proPlan?.maxActivePortfolios).toBe(10);
    });

    it('usuário sem registro em user_plans deve receber plano FREE por fallback puro', async () => {
      const effective = await getUserEffectivePlan(userA.id);

      expect(effective.planId).toBe('free');
      expect(effective.maxActivePortfolios).toBe(2);
      expect(effective.isFallback).toBe(true);
    });

    it('resumo de quotas inicial deve refletir 0 carteiras de 2 permitidas', async () => {
      const summary = await getPlanQuotaSummary(userA.id);

      expect(summary.planId).toBe('free');
      expect(summary.maxActivePortfolios).toBe(2);
      expect(summary.activePortfoliosCount).toBe(0);
      expect(summary.availableSlots).toBe(2);
      expect(summary.canCreateMore).toBe(true);
    });
  });

  // ─── 2. Aplicação de Limite de Quotas no Plano FREE ──────────────────────
  describe('Enforcement de Limite de Carteiras no Plano FREE', () => {
    let port1Id: string;
    let port2Id: string;

    it('deve permitir criar a 1ª e a 2ª carteira no plano FREE', async () => {
      const port1 = await createPortfolio({ name: 'Carteira 1 User A' }, userA);
      const port2 = await createPortfolio({ name: 'Carteira 2 User A' }, userA);

      port1Id = port1.id;
      port2Id = port2.id;
      createdPortfolioIds.push(port1Id, port2Id);

      const summary = await getPlanQuotaSummary(userA.id);
      expect(summary.activePortfoliosCount).toBe(2);
      expect(summary.availableSlots).toBe(0);
      expect(summary.canCreateMore).toBe(false);
    });

    it('deve rejeitar a criação da 3ª carteira ativa com PlanLimitExceededError', async () => {
      await expect(
        createPortfolio({ name: 'Carteira 3 Inválida' }, userA)
      ).rejects.toThrow(PlanLimitExceededError);
    });

    it('deve permitir criar nova carteira após soft delete de uma existente', async () => {
      // Exclui logicamente a carteira 2
      await deletePortfolio(port2Id, userA);

      const summaryAfterDelete = await getPlanQuotaSummary(userA.id);
      expect(summaryAfterDelete.activePortfoliosCount).toBe(1);
      expect(summaryAfterDelete.canCreateMore).toBe(true);

      // Agora a criação da nova carteira deve ser aceita
      const port3 = await createPortfolio({ name: 'Carteira 3 Válida' }, userA);
      createdPortfolioIds.push(port3.id);

      const finalSummary = await getPlanQuotaSummary(userA.id);
      expect(finalSummary.activePortfoliosCount).toBe(2);
      expect(finalSummary.canCreateMore).toBe(false);
    });
  });

  // ─── 3. Upgrade para PRO e Downgrade com Congelamento ─────────────────────
  describe('Upgrade para PRO, Downgrade e Congelamento (Frozen)', () => {
    it('deve permitir upgrade para PRO e criar até 10 carteiras', async () => {
      // Atribui PRO para User B
      await changeUserPlan(userB.id, 'pro');

      const planB = await getUserEffectivePlan(userB.id);
      expect(planB.planId).toBe('pro');
      expect(planB.maxActivePortfolios).toBe(10);
      expect(planB.isFallback).toBe(false);

      // Cria 4 carteiras ativas
      const p1 = await createPortfolio({ name: 'User B - Port 1' }, userB);
      const p2 = await createPortfolio({ name: 'User B - Port 2' }, userB);
      const p3 = await createPortfolio({ name: 'User B - Port 3' }, userB);
      const p4 = await createPortfolio({ name: 'User B - Port 4' }, userB);

      createdPortfolioIds.push(p1.id, p2.id, p3.id, p4.id);

      const summaryB = await getPlanQuotaSummary(userB.id);
      expect(summaryB.activePortfoliosCount).toBe(4);
      expect(summaryB.canCreateMore).toBe(true);
    });

    it('downgrade explícito para FREE deve congelar as 2 carteiras excedentes sem apagar dados', async () => {
      // Downgrade para FREE mantendo as 2 mais antigas por padrão
      await changeUserPlan(userB.id, 'free');

      const summaryAfterDowngrade = await getPlanQuotaSummary(userB.id);
      expect(summaryAfterDowngrade.planId).toBe('free');
      expect(summaryAfterDowngrade.maxActivePortfolios).toBe(2);
      expect(summaryAfterDowngrade.activePortfoliosCount).toBe(2);
      expect(summaryAfterDowngrade.frozenPortfoliosCount).toBe(2);
      expect(summaryAfterDowngrade.canCreateMore).toBe(false);

      // Verifica status das carteiras no banco
      const userBPortfolios = await db
        .select()
        .from(portfolios)
        .where(and(eq(portfolios.userId, userB.id), inArray(portfolios.id, createdPortfolioIds)))
        .orderBy(portfolios.createdAt);

      const activePorts = userBPortfolios.filter((p) => p.status === 'active');
      const frozenPorts = userBPortfolios.filter((p) => p.status === 'frozen');

      expect(activePorts).toHaveLength(2);
      expect(frozenPorts).toHaveLength(2);

      // Verifica que auditoria de downgrade foi registrada
      const auditDowngrade = await db
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.tableName, 'portfolios'),
            eq(auditLogs.reason, 'plan_downgrade')
          )
        );

      expect(auditDowngrade.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ─── 4. Bloqueio Completo de Mutações em Carteira Frozen ──────────────────
  describe('Bloqueio Server-Side de Mutações em Carteiras Frozen', () => {
    let frozenPortfolioId: string;

    beforeAll(async () => {
      const userBPortfolios = await db
        .select()
        .from(portfolios)
        .where(and(eq(portfolios.userId, userB.id), eq(portfolios.status, 'frozen')))
        .limit(1);

      frozenPortfolioId = userBPortfolios[0].id;
    });

    it('deve bloquear criação de eventos operacionais (BUY, SELL, MANUAL_ADJUSTMENT)', async () => {
      await expect(
        createPortfolioEvent(
          {
            portfolioId: frozenPortfolioId,
            assetId: testAssetId,
            type: 'BUY',
            tradeDate: new Date(),
            quantity: new Decimal(10),
            unitPrice: new Decimal(25),
            fees: new Decimal(0),
            currency: 'BRL',
          },
          userB
        )
      ).rejects.toThrow(PortfolioFrozenError);

      await expect(
        createPortfolioEvent(
          {
            portfolioId: frozenPortfolioId,
            assetId: testAssetId,
            type: 'MANUAL_ADJUSTMENT',
            direction: 'IN',
            tradeDate: new Date(),
            quantity: new Decimal(5),
            unitPrice: new Decimal(0),
            fees: new Decimal(0),
            currency: 'BRL',
          },
          userB
        )
      ).rejects.toThrow(PortfolioFrozenError);
    });

    it('deve bloquear inserção de eventos corporativos (SPLIT, BONUS_SHARE, DIVIDEND)', async () => {
      await expect(
        createCorporateActionEvent(
          {
            portfolioId: frozenPortfolioId,
            assetId: testAssetId,
            type: 'SPLIT',
            tradeDate: new Date(),
            factor: '2',
          },
          userB
        )
      ).rejects.toThrow(PortfolioFrozenError);

      await expect(
        createBonusEvent(
          {
            portfolioId: frozenPortfolioId,
            assetId: testAssetId,
            tradeDate: new Date(),
            quantity: new Decimal(1),
            unitPrice: new Decimal(0),
            source: 'manual',
          },
          userB
        )
      ).rejects.toThrow(PortfolioFrozenError);

      await expect(
        createIncomeEvent(
          {
            portfolioId: frozenPortfolioId,
            assetId: testAssetId,
            type: 'DIVIDEND',
            tradeDate: new Date(),
            settlementDate: new Date(),
            quantity: '10',
            unitPrice: '1.50',
            fees: '0',
            source: 'manual',
          },
          userB
        )
      ).rejects.toThrow(PortfolioFrozenError);
    });

    it('deve bloquear edição simples de dados da carteira congelada', async () => {
      await expect(
        updatePortfolio(
          frozenPortfolioId,
          { name: 'Novo Nome Bloqueado' },
          userB
        )
      ).rejects.toThrow(PortfolioFrozenError);
    });

    it('deve bloquear reativação de carteira congelada se o limite do plano estiver esgotado', async () => {
      // User B já possui 2 carteiras ativas no FREE (limite 2)
      await expect(
        updatePortfolio(
          frozenPortfolioId,
          { status: 'active' },
          userB
        )
      ).rejects.toThrow(PlanLimitExceededError);
    });

    it('deve PERMITIR soft delete de carteira congelada', async () => {
      await expect(
        deletePortfolio(frozenPortfolioId, userB)
      ).resolves.not.toThrow();

      const deleted = await db
        .select()
        .from(portfolios)
        .where(eq(portfolios.id, frozenPortfolioId))
        .limit(1);

      expect(deleted[0].deletedAt).not.toBeNull();
    });
  });

  // ─── 5. Proteção de Transições de Status e Bloqueio de Congelamento Manual ─
  describe('Proteção Server-Side contra Congelamento Manual e Transições de Status', () => {
    let activePortId: string;
    let archivedPortId: string;
    let otherFrozenPortId: string;

    beforeAll(async () => {
      // Localiza a outra carteira frozen do User B
      const userBPortfolios = await db
        .select()
        .from(portfolios)
        .where(and(eq(portfolios.userId, userB.id), eq(portfolios.status, 'frozen'), isNull(portfolios.deletedAt)))
        .limit(1);

      otherFrozenPortId = userBPortfolios[0].id;

      // Localiza uma carteira ativa do User B
      const activePorts = await db
        .select()
        .from(portfolios)
        .where(and(eq(portfolios.userId, userB.id), eq(portfolios.status, 'active'), isNull(portfolios.deletedAt)))
        .limit(1);

      activePortId = activePorts[0].id;

      // Cria uma carteira arquivada para testar archived -> frozen
      const [archived] = await db
        .insert(portfolios)
        .values({
          id: crypto.randomUUID(),
          userId: userB.id,
          name: 'User B - Port Arquivada',
          baseCurrency: 'BRL',
          status: 'archived',
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning();

      archivedPortId = archived.id;
      createdPortfolioIds.push(archivedPortId);
    });

    it('deve REJEITAR server-side tentativa de congelar carteira ativa (active -> frozen)', async () => {
      await expect(
        updatePortfolio(
          activePortId,
          { status: 'frozen' as any },
          userB
        )
      ).rejects.toThrow(InvalidPortfolioStatusTransitionError);

      // Confirma no banco que status permanece 'active'
      const check = await db
        .select()
        .from(portfolios)
        .where(eq(portfolios.id, activePortId))
        .limit(1);

      expect(check[0].status).toBe('active');
    });

    it('deve REJEITAR server-side tentativa de congelar carteira arquivada (archived -> frozen)', async () => {
      await expect(
        updatePortfolio(
          archivedPortId,
          { status: 'frozen' as any },
          userB
        )
      ).rejects.toThrow(InvalidPortfolioStatusTransitionError);

      const check = await db
        .select()
        .from(portfolios)
        .where(eq(portfolios.id, archivedPortId))
        .limit(1);

      expect(check[0].status).toBe('archived');
    });

    it('deve PERMITIR transição de carteira congelada para arquivada (frozen -> archived)', async () => {
      await expect(
        updatePortfolio(
          otherFrozenPortId,
          { status: 'archived' },
          userB
        )
      ).resolves.not.toThrow();

      const check = await db
        .select()
        .from(portfolios)
        .where(eq(portfolios.id, otherFrozenPortId))
        .limit(1);

      expect(check[0].status).toBe('archived');
    });

    it('deve PERMITIR reativar carteira arquivada/congelada quando houver quota disponível', async () => {
      // Arquiva uma das carteiras ativas para liberar quota (2 -> 1 ativa no Free)
      await updatePortfolio(activePortId, { status: 'archived' }, userB);

      const summaryBefore = await getPlanQuotaSummary(userB.id);
      expect(summaryBefore.activePortfoliosCount).toBe(1);
      expect(summaryBefore.canCreateMore).toBe(true);

      // Agora reativa a carteira que estava arquivada
      await expect(
        updatePortfolio(otherFrozenPortId, { status: 'active' }, userB)
      ).resolves.not.toThrow();

      const check = await db
        .select()
        .from(portfolios)
        .where(eq(portfolios.id, otherFrozenPortId))
        .limit(1);

      expect(check[0].status).toBe('active');

      const summaryAfter = await getPlanQuotaSummary(userB.id);
      expect(summaryAfter.activePortfoliosCount).toBe(2);
      expect(summaryAfter.canCreateMore).toBe(false);
    });

    it('deve listar os planos comerciais ativos com ordenação correta por maxActivePortfolios', async () => {
      const plans = await listCommercialPlans(db);
      expect(plans.length).toBeGreaterThanOrEqual(2);

      const freePlan = plans.find((p) => p.id === 'free');
      const proPlan = plans.find((p) => p.id === 'pro');

      expect(freePlan).toBeDefined();
      expect(freePlan?.maxActivePortfolios).toBe(2);
      expect(freePlan?.isActive).toBe(true);

      expect(proPlan).toBeDefined();
      expect(proPlan?.maxActivePortfolios).toBe(10);
      expect(proPlan?.isActive).toBe(true);

      // Free deve vir antes de Pro pela ordenação de maxActivePortfolios
      const freeIdx = plans.findIndex((p) => p.id === 'free');
      const proIdx = plans.findIndex((p) => p.id === 'pro');
      expect(freeIdx).toBeLessThan(proIdx);
    });
  });
});
