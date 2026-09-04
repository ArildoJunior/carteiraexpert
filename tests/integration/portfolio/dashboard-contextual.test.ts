import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../../../src/lib/db';
import { users } from '../../../src/lib/db/schema/identity';
import { portfolios, assets, portfolioEvents } from '../../../src/lib/db/schema/portfolio';
import { userPlans } from '../../../src/lib/db/schema/plans';
import { auditLogs } from '../../../src/lib/db/schema/audit';
import {
  getUserDashboardData,
  getSerializedUserDashboardData,
} from '../../../src/modules/portfolio/server/dashboard.service';
import { createPortfolio } from '../../../src/modules/portfolio/server/portfolio.service';
import { createPortfolioEvent } from '../../../src/modules/portfolio/server/portfolio-event.service';
import { PortfolioNotFoundError } from '../../../src/modules/portfolio/domain/errors';
import { AuthorizationError } from '../../../src/modules/identity/domain/errors';
import type { SafeUser } from '../../../src/modules/identity/domain/user.types';
import { eq, inArray, and } from 'drizzle-orm';
import crypto from 'node:crypto';

describe('Integração: Dashboard Contextual por Carteira Selecionada', () => {
  const userAId = crypto.randomUUID();
  const userBId = crypto.randomUUID();
  let userA: SafeUser;
  let userB: SafeUser;

  const assetPetr4Id = crypto.randomUUID();
  const assetVale3Id = crypto.randomUUID();

  const createdPortfolioIds: string[] = [];
  const createdEventIds: string[] = [];

  let portRealA: any;
  let portEstudoA: any;
  let portAnaliseA: any;
  let portRealB: any;

  beforeAll(async () => {
    const now = new Date();

    // 1. Cria usuários
    await db.insert(users).values([
      {
        id: userAId,
        email: `dash_ctx_user_a_${Date.now()}@carteiraexpert.test`,
        name: 'Dashboard Context User A',
        passwordHash: 'dummy',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: userBId,
        email: `dash_ctx_user_b_${Date.now()}@carteiraexpert.test`,
        name: 'Dashboard Context User B',
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
      email: `dash_ctx_user_a_${Date.now()}@carteiraexpert.test`,
      name: 'Dashboard Context User A',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    userB = {
      id: userBId,
      email: `dash_ctx_user_b_${Date.now()}@carteiraexpert.test`,
      name: 'Dashboard Context User B',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    // 3. Ativos globais para transações
    await db.insert(assets).values([
      {
        id: assetPetr4Id,
        ticker: `PETR4_DASH_${Date.now().toString().slice(-4)}`,
        name: 'Petrobras PN',
        market: 'B3',
        assetType: 'stock',
        currency: 'BRL',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: assetVale3Id,
        ticker: `VALE3_DASH_${Date.now().toString().slice(-4)}`,
        name: 'Vale ON',
        market: 'B3',
        assetType: 'stock',
        currency: 'BRL',
        createdAt: now,
        updatedAt: now,
      },
    ]);

    // 4. Carteiras do User A: 1 REAL, 1 ESTUDO, 1 ANALISE
    portRealA = await createPortfolio(
      {
        name: 'Carteira Real User A',
        purpose: 'REAL',
        baseCurrency: 'BRL',
      },
      userA
    );
    createdPortfolioIds.push(portRealA.id);

    portEstudoA = await createPortfolio(
      {
        name: 'Carteira Estudo User A',
        purpose: 'ESTUDO',
        baseCurrency: 'BRL',
      },
      userA
    );
    createdPortfolioIds.push(portEstudoA.id);

    portAnaliseA = await createPortfolio(
      {
        name: 'Carteira Analise User A',
        purpose: 'ANALISE',
        baseCurrency: 'BRL',
      },
      userA
    );
    createdPortfolioIds.push(portAnaliseA.id);

    // 5. Carteira do User B: 1 REAL
    portRealB = await createPortfolio(
      {
        name: 'Carteira Real User B',
        purpose: 'REAL',
        baseCurrency: 'BRL',
      },
      userB
    );
    createdPortfolioIds.push(portRealB.id);

    // 6. Registra compras em carteiras distintas para testar não-agregação
    // Em portRealA: Compra de 100 PETR4 @ R$ 30,00
    const ev1 = await createPortfolioEvent(
      {
        portfolioId: portRealA.id,
        assetId: assetPetr4Id,
        type: 'BUY',
        quantity: '100',
        unitPrice: '30.00',
        fees: '5.00',
        currency: 'BRL',
        tradeDate: new Date(),
      },
      userA
    );
    createdEventIds.push(ev1.id);

    // Em portEstudoA: Compra de 50 VALE3 @ R$ 60,00
    const ev2 = await createPortfolioEvent(
      {
        portfolioId: portEstudoA.id,
        assetId: assetVale3Id,
        type: 'BUY',
        quantity: '50',
        unitPrice: '60.00',
        fees: '2.00',
        currency: 'BRL',
        tradeDate: new Date(),
      },
      userA
    );
    createdEventIds.push(ev2.id);
  });

  afterAll(async () => {
    if (createdEventIds.length > 0) {
      await db.delete(auditLogs).where(inArray(auditLogs.recordId, createdEventIds));
      await db.delete(portfolioEvents).where(inArray(portfolioEvents.id, createdEventIds));
    }
    if (createdPortfolioIds.length > 0) {
      await db.delete(auditLogs).where(inArray(auditLogs.recordId, createdPortfolioIds));
      await db.delete(portfolios).where(inArray(portfolios.id, createdPortfolioIds));
    }
    await db.delete(assets).where(inArray(assets.id, [assetPetr4Id, assetVale3Id]));
    await db.delete(userPlans).where(inArray(userPlans.userId, [userAId, userBId]));
    await db.delete(auditLogs).where(inArray(auditLogs.actorId, [userAId, userBId]));
    await db.delete(users).where(inArray(users.id, [userAId, userBId]));
  });

  it('deve retornar dashboard vazio quando usuário não tem nenhuma carteira', async () => {
    const emptyUserId = crypto.randomUUID();
    const emptyUser: SafeUser = {
      id: emptyUserId,
      email: `empty_${Date.now()}@carteiraexpert.test`,
      name: 'Empty User',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const data = await getUserDashboardData(emptyUser);
    expect(data.selectedPortfolio).toBeNull();
    expect(data.availablePortfolios).toHaveLength(0);
    expect(data.portfolioSummaries).toHaveLength(0);
    expect(data.currencyGroups[0].currency).toBe('BRL');
    expect(data.currencyGroups[0].totalInvestedCost.isZero()).toBe(true);
    expect(data.currencyGroups[0].portfoliosCount).toBe(0);
  });

  it('deve resolver deterministicamente a carteira REAL no acesso padrão (sem portfolioId)', async () => {
    const data = await getUserDashboardData(userA);

    expect(data.selectedPortfolio).toBeDefined();
    expect(data.selectedPortfolio?.id).toBe(portRealA.id);
    expect(data.selectedPortfolio?.purpose).toBe('REAL');
    expect(data.availablePortfolios).toHaveLength(3);

    // Deve conter estritamente as posições da carteira REAL (PETR4), NUNCA de portEstudoA (VALE3)
    expect(data.portfolioSummaries).toHaveLength(1);
    expect(data.portfolioSummaries[0].portfolioId).toBe(portRealA.id);
    expect(data.portfolioSummaries[0].summary.positions).toHaveLength(1);
    expect(data.portfolioSummaries[0].summary.positions[0].assetId).toBe(assetPetr4Id);

    // Total em custódia deve ser exatamente 100 * 30 + 5 (taxas) = 3005
    expect(data.currencyGroups[0].totalInvestedCost.toString()).toBe('3005');
  });

  it('deve permitir a seleção explícita da carteira ESTUDO via options.portfolioId', async () => {
    const data = await getUserDashboardData(userA, { portfolioId: portEstudoA.id });

    expect(data.selectedPortfolio).toBeDefined();
    expect(data.selectedPortfolio?.id).toBe(portEstudoA.id);
    expect(data.selectedPortfolio?.purpose).toBe('ESTUDO');

    // Deve conter estritamente as posições da carteira ESTUDO (VALE3), NUNCA de portRealA (PETR4)
    expect(data.portfolioSummaries).toHaveLength(1);
    expect(data.portfolioSummaries[0].portfolioId).toBe(portEstudoA.id);
    expect(data.portfolioSummaries[0].summary.positions).toHaveLength(1);
    expect(data.portfolioSummaries[0].summary.positions[0].assetId).toBe(assetVale3Id);

    // Total em custódia deve ser exatamente 50 * 60 + 2 (taxas) = 3002
    expect(data.currencyGroups[0].totalInvestedCost.toString()).toBe('3002');
  });

  it('deve lançar PortfolioNotFoundError para identificador de carteira inexistente ou UUID inválido', async () => {
    await expect(
      getUserDashboardData(userA, { portfolioId: '00000000-0000-0000-0000-000000000000' })
    ).rejects.toThrow(PortfolioNotFoundError);

    await expect(
      getUserDashboardData(userA, { portfolioId: 'not-a-valid-uuid' })
    ).rejects.toThrow(PortfolioNotFoundError);
  });

  it('deve bloquear IDOR e lançar AuthorizationError com auditoria quando tentar acessar carteira de outro usuário', async () => {
    // User A tenta consultar o dashboard apontando para a carteira de User B (portRealB)
    await expect(
      getUserDashboardData(userA, { portfolioId: portRealB.id })
    ).rejects.toThrow(AuthorizationError);

    // Verifica que o evento de tentativa de IDOR foi auditado com recordId técnico
    const auditEntries = await db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.actorId, userA.id),
          eq(auditLogs.reason, 'FORBIDDEN_IDOR_ATTEMPT')
        )
      );

    expect(auditEntries.length).toBeGreaterThanOrEqual(1);
    expect(auditEntries[0].action).toBe('ADJUSTMENT');
  });

  it('deve serializar corretamente os metadados contextuais em getSerializedUserDashboardData', async () => {
    const serialized = await getSerializedUserDashboardData(userA, {
      portfolioId: portEstudoA.id,
    });

    expect(serialized.selectedPortfolio?.id).toBe(portEstudoA.id);
    expect(serialized.selectedPortfolio?.purpose).toBe('ESTUDO');
    expect(serialized.availablePortfolios).toHaveLength(3);
    expect(serialized.currencyGroups[0].totalInvestedCost).toBe('3002.00000000');
  });
});
