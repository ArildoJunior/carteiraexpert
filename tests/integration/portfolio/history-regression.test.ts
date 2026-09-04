import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../../../src/lib/db';
import { users } from '../../../src/lib/db/schema/identity';
import { portfolios, assets, portfolioEvents } from '../../../src/lib/db/schema/portfolio';
import { userPlans } from '../../../src/lib/db/schema/plans';
import { auditLogs } from '../../../src/lib/db/schema/audit';
import {
  getUserHistoryData,
  getSerializedUserHistoryData,
} from '../../../src/modules/portfolio/server/dashboard.service';
import { createPortfolio } from '../../../src/modules/portfolio/server/portfolio.service';
import { createPortfolioEvent } from '../../../src/modules/portfolio/server/portfolio-event.service';
import type { SafeUser } from '../../../src/modules/identity/domain/user.types';
import { inArray } from 'drizzle-orm';
import { Decimal } from '@/lib/decimal';
import crypto from 'node:crypto';

describe('Integração: Não Regressão Comportamental de /history', () => {
  const userId = crypto.randomUUID();
  let testUser: SafeUser;

  const assetId = crypto.randomUUID();
  const createdPortfolioIds: string[] = [];
  const createdEventIds: string[] = [];

  let portReal: any;
  let portEstudo: any;

  beforeAll(async () => {
    const now = new Date();

    // 1. Cria usuário e plano PRO
    await db.insert(users).values({
      id: userId,
      email: `hist_regress_${Date.now()}@carteiraexpert.test`,
      name: 'History Regression User',
      passwordHash: 'dummy',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });

    await db.insert(userPlans).values({
      id: crypto.randomUUID(),
      userId,
      planId: 'pro',
      status: 'active',
      startsAt: now,
      createdAt: now,
      updatedAt: now,
    });

    testUser = {
      id: userId,
      email: `hist_regress_${Date.now()}@carteiraexpert.test`,
      name: 'History Regression User',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    // 2. Cria ativo global
    await db.insert(assets).values({
      id: assetId,
      ticker: `HIST_${Date.now().toString().slice(-4)}`,
      name: 'History Test Asset',
      market: 'B3',
      assetType: 'stock',
      currency: 'BRL',
      createdAt: now,
      updatedAt: now,
    });

    // 3. Cria 1 carteira REAL e 1 carteira ESTUDO
    portReal = await createPortfolio(
      {
        name: 'Carteira Real Hist',
        purpose: 'REAL',
        baseCurrency: 'BRL',
      },
      testUser
    );
    createdPortfolioIds.push(portReal.id);

    portEstudo = await createPortfolio(
      {
        name: 'Carteira Estudo Hist',
        purpose: 'ESTUDO',
        baseCurrency: 'BRL',
      },
      testUser
    );
    createdPortfolioIds.push(portEstudo.id);

    // 4. Cria eventos em datas distintas e carteiras distintas
    const d1 = new Date('2026-01-10T10:00:00Z');
    const d2 = new Date('2026-02-10T10:00:00Z');
    const d3 = new Date('2026-03-10T10:00:00Z');

    const ev1 = await createPortfolioEvent(
      {
        portfolioId: portReal.id,
        assetId,
        type: 'BUY',
        quantity: '10',
        unitPrice: '50.00',
        fees: '1.00',
        currency: 'BRL',
        tradeDate: d1,
      },
      testUser
    );
    createdEventIds.push(ev1.id);

    const ev2 = await createPortfolioEvent(
      {
        portfolioId: portEstudo.id,
        assetId,
        type: 'BUY',
        quantity: '20',
        unitPrice: '55.00',
        fees: '2.00',
        currency: 'BRL',
        tradeDate: d2,
      },
      testUser
    );
    createdEventIds.push(ev2.id);

    const ev3 = await createPortfolioEvent(
      {
        portfolioId: portReal.id,
        assetId,
        type: 'SELL',
        quantity: '5',
        unitPrice: '60.00',
        fees: '1.50',
        currency: 'BRL',
        tradeDate: d3,
      },
      testUser
    );
    createdEventIds.push(ev3.id);
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
    await db.delete(assets).where(inArray(assets.id, [assetId]));
    await db.delete(userPlans).where(inArray(userPlans.userId, [userId]));
    await db.delete(auditLogs).where(inArray(auditLogs.actorId, [userId]));
    await db.delete(users).where(inArray(users.id, [userId]));
  });

  it('deve listar o histórico completo unificado do usuário sem filtros', async () => {
    const history = await getUserHistoryData(testUser);
    expect(history.totalCount).toBe(3);
    expect(history.items).toHaveLength(3);
    // Ordenação descrescente por tradeDate
    expect(new Date(history.items[0].tradeDate).getTime()).toBeGreaterThan(
      new Date(history.items[1].tradeDate).getTime()
    );
  });

  it('deve filtrar o histórico por tipo de evento (SELL)', async () => {
    const history = await getUserHistoryData(testUser, { type: 'SELL' });
    expect(history.totalCount).toBe(1);
    expect(history.items[0].type).toBe('SELL');
  });

  it('deve filtrar o histórico por carteira específica (portEstudo)', async () => {
    const history = await getUserHistoryData(testUser, { portfolioId: portEstudo.id });
    expect(history.totalCount).toBe(1);
    expect(history.items[0].portfolioId).toBe(portEstudo.id);
    expect(history.items[0].portfolioName).toBe('Carteira Estudo Hist');
  });

  it('deve filtrar o histórico por intervalo de datas', async () => {
    const history = await getUserHistoryData(testUser, {
      startDate: new Date('2026-02-01T00:00:00Z'),
      endDate: new Date('2026-02-28T23:59:59Z'),
    });
    expect(history.totalCount).toBe(1);
    expect(new Decimal(history.items[0].quantity).equals(20)).toBe(true);
  });

  it('deve suportar paginação em getSerializedUserHistoryData', async () => {
    const page1 = await getSerializedUserHistoryData(testUser, { page: 1, limit: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page1.totalCount).toBe(3);
    expect(page1.totalPages).toBe(2);

    const page2 = await getSerializedUserHistoryData(testUser, { page: 2, limit: 2 });
    expect(page2.items).toHaveLength(1);
  });
});
