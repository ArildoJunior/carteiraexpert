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

  it('1. deve consolidar métricas da carteira selecionada e retornar feed recente no dashboard do usuário', async () => {
    // Cria 1 carteira REAL e 1 carteira ESTUDO para Usuário A
    const port1 = await createPortfolio(
      { name: 'Carteira Dividendos', baseCurrency: 'BRL', purpose: 'REAL' },
      userA
    );
    const port2 = await createPortfolio(
      { name: 'Carteira Growth', baseCurrency: 'BRL', purpose: 'ESTUDO' },
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

    // Na Carteira 1 (REAL): Compra 100 @ 20.00 (custo 2000, taxas 10)
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

    // Na Carteira 2 (ESTUDO): Compra 50 @ 40.00 (custo 2000, taxas 5)
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

    // Consulta Dashboard padrão do Usuário A (deve selecionar deterministicamente a carteira REAL)
    const dashboard = await getUserDashboardData(userA);

    expect(dashboard.selectedPortfolio?.id).toBe(port1.id);
    expect(dashboard.selectedPortfolio?.purpose).toBe('REAL');
    expect(dashboard.totalActivePortfolios).toBe(1);
    expect(dashboard.totalActivePositions).toBe(1); // Apenas DASH1 (100) na port1
    expect(dashboard.currencyGroups).toHaveLength(1);

    const brl = dashboard.currencyGroups[0];
    expect(brl.currency).toBe('BRL');
    expect(brl.portfoliosCount).toBe(1);
    expect(brl.activePositionsCount).toBe(1);
    // Custo investido da Carteira 1 = 2010.00
    expect(brl.totalInvestedCost.toFixed(2)).toBe('2010.00');
    expect(brl.totalRealizedPnL.toFixed(2)).toBe('0.00');
    expect(brl.totalFees.toFixed(2)).toBe('10.00');

    // Feed de Atividades Recentes da Carteira 1 (REAL)
    expect(dashboard.recentEvents).toHaveLength(1);
    expect(dashboard.recentEvents[0].type).toBe('BUY');
    expect(dashboard.recentEvents[0].assetTicker).toBe('DASH1');
    expect(dashboard.recentEvents[0].portfolioName).toBe('Carteira Dividendos');

    // Consulta explicitamente a Carteira 2 (ESTUDO)
    const dashboardEstudo = await getUserDashboardData(userA, { portfolioId: port2.id });
    expect(dashboardEstudo.selectedPortfolio?.id).toBe(port2.id);
    expect(dashboardEstudo.selectedPortfolio?.purpose).toBe('ESTUDO');
    expect(dashboardEstudo.currencyGroups[0].totalInvestedCost.toFixed(2)).toBe('1203.00');
    expect(dashboardEstudo.currencyGroups[0].totalRealizedPnL.toFixed(2)).toBe('196.00');
    expect(dashboardEstudo.currencyGroups[0].totalFees.toFixed(2)).toBe('7.00'); // 5 + 2
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
