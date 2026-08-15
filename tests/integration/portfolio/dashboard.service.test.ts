import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { eq, and, sql } from 'drizzle-orm';
import { db } from '../../../src/lib/db';
import {
  users,
  portfolios,
  assets,
  portfolioEvents,
  auditLogs,
} from '../../../src/lib/db/schema';
import { createPortfolio, deletePortfolio } from '../../../src/modules/portfolio/server/portfolio.service';
import { createCustomAsset } from '../../../src/modules/portfolio/server/asset.service';
import {
  createPortfolioEvent,
  cancelPortfolioEvent,
  listUserRecentEvents,
} from '../../../src/modules/portfolio/server/portfolio-event.service';
import {
  getUserDashboardData,
  getSerializedUserDashboardData,
} from '../../../src/modules/portfolio/server/dashboard.service';
import type { SafeUser } from '../../../src/modules/identity/domain/user.types';

describe('Integração: Dashboard Consolidado e Histórico de Atividades (PostgreSQL Real)', () => {
  const userAId = crypto.randomUUID();
  const userBId = crypto.randomUUID();
  const userAEmail = 'dash_test_user_a@carteiraexpert.invalid';
  const userBEmail = 'dash_test_user_b@carteiraexpert.invalid';

  const userA: SafeUser = {
    id: userAId,
    email: userAEmail,
    name: 'Dashboard User A',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const userB: SafeUser = {
    id: userBId,
    email: userBEmail,
    name: 'Dashboard User B',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeAll(async () => {
    // Insere usuários de teste
    await db.insert(users).values([
      {
        id: userAId,
        email: userAEmail,
        name: 'Dashboard User A',
        passwordHash: 'dummy_hash',
        status: 'active',
      },
      {
        id: userBId,
        email: userBEmail,
        name: 'Dashboard User B',
        passwordHash: 'dummy_hash',
        status: 'active',
      },
    ]);
  });

  afterEach(async () => {
    // Limpeza de eventos, carteiras e ativos dos usuários de teste
    await db.delete(portfolioEvents).where(sql`created_by IN (${userAId}, ${userBId})`);
    await db.delete(portfolios).where(sql`user_id IN (${userAId}, ${userBId})`);
    await db.delete(assets).where(sql`user_id IN (${userAId}, ${userBId})`);
  });

  afterAll(async () => {
    await db.delete(auditLogs).where(sql`actor_id IN (${userAId}, ${userBId})`);
    await db.delete(users).where(sql`id IN (${userAId}, ${userBId})`);
  });

  it('1. deve consolidar métricas de múltiplas carteiras e retornar feed recente no dashboard do usuário', async () => {
    // Cria 2 carteiras para Usuário A
    const port1 = await createPortfolio(
      { name: 'Carteira Dividendos', baseCurrency: 'BRL' },
      userA
    );
    const port2 = await createPortfolio(
      { name: 'Carteira Growth', baseCurrency: 'BRL' },
      userA
    );

    // Cria 2 ativos
    const asset1 = await createCustomAsset(
      { ticker: 'DASH1', name: 'Ativo 1', currency: 'BRL' },
      userA
    );
    const asset2 = await createCustomAsset(
      { ticker: 'DASH2', name: 'Ativo 2', currency: 'BRL' },
      userA
    );

    // Na Carteira 1: Compra 100 @ 20.00 (custo 2000, taxas 10)
    await createPortfolioEvent(
      {
        portfolioId: port1.id,
        assetId: asset1.id,
        type: 'BUY',
        tradeDate: new Date('2026-08-10T10:00:00.000Z'),
        quantity: '100',
        unitPrice: '20.00',
        fees: '10.00',
        currency: 'BRL',
      },
      userA
    );

    // Na Carteira 2: Compra 50 @ 40.00 (custo 2000, taxas 5)
    await createPortfolioEvent(
      {
        portfolioId: port2.id,
        assetId: asset2.id,
        type: 'BUY',
        tradeDate: new Date('2026-08-11T10:00:00.000Z'),
        quantity: '50',
        unitPrice: '40.00',
        fees: '5.00',
        currency: 'BRL',
      },
      userA
    );

    // Na Carteira 2: Venda parcial de 20 @ 50.00 (taxas 2) -> PnL realizado
    // Custo médio = (2000 + 5) / 50 = 40.10
    // Venda = (20 * 50 - 2) - (20 * 40.10) = 998 - 802 = 196
    await createPortfolioEvent(
      {
        portfolioId: port2.id,
        assetId: asset2.id,
        type: 'SELL',
        tradeDate: new Date('2026-08-12T10:00:00.000Z'),
        quantity: '20',
        unitPrice: '50.00',
        fees: '2.00',
        currency: 'BRL',
      },
      userA
    );

    // Consulta Dashboard do Usuário A
    const dashboard = await getUserDashboardData(userA);

    expect(dashboard.totalActivePortfolios).toBe(2);
    expect(dashboard.totalActivePositions).toBe(2); // DASH1 (100) na port1 + DASH2 (30) na port2
    expect(dashboard.currencyGroups).toHaveLength(1);

    const brl = dashboard.currencyGroups[0];
    expect(brl.currency).toBe('BRL');
    expect(brl.portfoliosCount).toBe(2);
    expect(brl.activePositionsCount).toBe(2);
    // Custo investido: Carteira 1 = 2010.00; Carteira 2 = 30 * 40.10 = 1203.00 -> Total = 3213.00
    expect(brl.totalInvestedCost.toFixed(2)).toBe('3213.00');
    expect(brl.totalRealizedPnL.toFixed(2)).toBe('196.00');
    expect(brl.totalFees.toFixed(2)).toBe('17.00'); // 10 + 5 + 2

    // Feed de Atividades Recentes
    expect(dashboard.recentEvents).toHaveLength(3);
    // Mais recente primeiro (Venda do DASH2 em 12/08)
    expect(dashboard.recentEvents[0].type).toBe('SELL');
    expect(dashboard.recentEvents[0].assetTicker).toBe('DASH2');
    expect(dashboard.recentEvents[0].portfolioName).toBe('Carteira Growth');
  });

  it('2. deve garantir isolamento anti-IDOR: Usuário B não acessa métricas ou histórico de Usuário A', async () => {
    // Cria carteira e eventos para Usuário A
    const portA = await createPortfolio(
      { name: 'Carteira Secreta A', baseCurrency: 'BRL' },
      userA
    );
    const assetA = await createCustomAsset(
      { ticker: 'SECR1', name: 'Ativo Secreto', currency: 'BRL' },
      userA
    );
    await createPortfolioEvent(
      {
        portfolioId: portA.id,
        assetId: assetA.id,
        type: 'BUY',
        tradeDate: new Date('2026-08-10T10:00:00.000Z'),
        quantity: '100',
        unitPrice: '100.00',
        currency: 'BRL',
      },
      userA
    );

    // Consulta dashboard de Usuário B (não possui carteiras)
    const dashboardB = await getUserDashboardData(userB);

    expect(dashboardB.totalActivePortfolios).toBe(0);
    expect(dashboardB.totalActivePositions).toBe(0);
    expect(dashboardB.currencyGroups[0].totalInvestedCost.toString()).toBe('0');
    expect(dashboardB.recentEvents).toHaveLength(0);
    expect(dashboardB.portfolioSummaries).toHaveLength(0);

    // Consulta de eventos recentes com filtro no portfolioId de A feito por B retorna vazio
    const eventsBFilterA = await listUserRecentEvents(userB, {
      portfolioId: portA.id,
    });
    expect(eventsBFilterA).toHaveLength(0);
  });

  it('3. não deve incluir eventos cancelados (soft delete) nas métricas nem no feed recente', async () => {
    const port = await createPortfolio(
      { name: 'Carteira Teste Cancelamento', baseCurrency: 'BRL' },
      userA
    );
    const asset = await createCustomAsset(
      { ticker: 'CANC1', name: 'Ativo Cancelamento', currency: 'BRL' },
      userA
    );

    const event = await createPortfolioEvent(
      {
        portfolioId: port.id,
        assetId: asset.id,
        type: 'BUY',
        tradeDate: new Date('2026-08-10T10:00:00.000Z'),
        quantity: '50',
        unitPrice: '10.00',
        fees: '2.00',
        currency: 'BRL',
      },
      userA
    );

    // Cancela o evento
    await cancelPortfolioEvent(
      event.id,
      { cancellationReason: 'Ordem duplicada no sistema' },
      userA
    );

    const dashboard = await getUserDashboardData(userA);

    expect(dashboard.currencyGroups[0].totalInvestedCost.toString()).toBe('0');
    expect(dashboard.currencyGroups[0].totalFees.toString()).toBe('0');
    expect(dashboard.currencyGroups[0].activePositionsCount).toBe(0);
    expect(dashboard.recentEvents).toHaveLength(0);
  });

  it('4. não deve incluir carteiras excluídas logicamente no dashboard', async () => {
    const port = await createPortfolio(
      { name: 'Carteira a Deletar', baseCurrency: 'BRL' },
      userA
    );
    const asset = await createCustomAsset(
      { ticker: 'DELT1', name: 'Ativo Deletar', currency: 'BRL' },
      userA
    );

    await createPortfolioEvent(
      {
        portfolioId: port.id,
        assetId: asset.id,
        type: 'BUY',
        tradeDate: new Date('2026-08-10T10:00:00.000Z'),
        quantity: '10',
        unitPrice: '100.00',
        currency: 'BRL',
      },
      userA
    );

    // Deleta a carteira
    await deletePortfolio(port.id, userA);

    const dashboard = await getUserDashboardData(userA);
    expect(dashboard.totalActivePortfolios).toBe(0);
    expect(dashboard.currencyGroups[0].totalInvestedCost.toString()).toBe('0');
    expect(dashboard.recentEvents).toHaveLength(0);
  });

  it('5. deve retornar estrutura serializada pronta para SSR com getSerializedUserDashboardData', async () => {
    const port = await createPortfolio(
      { name: 'Carteira SSR', baseCurrency: 'BRL' },
      userA
    );
    const asset = await createCustomAsset(
      { ticker: 'SSRA1', name: 'Ativo SSR', currency: 'BRL' },
      userA
    );

    await createPortfolioEvent(
      {
        portfolioId: port.id,
        assetId: asset.id,
        type: 'BUY',
        tradeDate: new Date('2026-08-14T10:00:00.000Z'),
        quantity: '20',
        unitPrice: '50.00',
        fees: '1.50',
        currency: 'BRL',
      },
      userA
    );

    const serialized = await getSerializedUserDashboardData(userA);

    expect(serialized.totalActivePortfolios).toBe(1);
    expect(serialized.currencyGroups[0].totalInvestedCost).toBe('1001.50000000');
    expect(serialized.portfolioSummaries[0].portfolioName).toBe('Carteira SSR');
    expect(serialized.recentEvents[0].assetTicker).toBe('SSRA1');
    expect(typeof serialized.calculatedAt).toBe('string');
  });
});
