import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
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
  listUserHistoryEvents,
} from '../../../src/modules/portfolio/server/portfolio-event.service';
import {
  getUserHistoryData,
  getSerializedUserHistoryData,
} from '../../../src/modules/portfolio/server/dashboard.service';
import { getAssetPositionInPortfolio } from '../../../src/modules/portfolio/server/position.service';
import type { SafeUser } from '../../../src/modules/identity/domain/user.types';

describe('Integração: Extrato Geral de Operações e Filtros (PostgreSQL Real)', () => {
  const userAId = crypto.randomUUID();
  const userBId = crypto.randomUUID();
  const userAEmail = 'history_test_user_a@carteiraexpert.invalid';
  const userBEmail = 'history_test_user_b@carteiraexpert.invalid';

  const userA: SafeUser = {
    id: userAId,
    email: userAEmail,
    name: 'History User A',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const userB: SafeUser = {
    id: userBId,
    email: userBEmail,
    name: 'History User B',
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
        name: 'History User A',
        passwordHash: 'dummy_hash',
        status: 'active',
      },
      {
        id: userBId,
        email: userBEmail,
        name: 'History User B',
        passwordHash: 'dummy_hash',
        status: 'active',
      },
    ]);
  });

  afterEach(async () => {
    // Limpeza de eventos, carteiras e ativos dos usuários de teste
    await db.delete(portfolioEvents).where(eq(portfolioEvents.createdBy, userAId));
    await db.delete(portfolioEvents).where(eq(portfolioEvents.createdBy, userBId));
    await db.delete(portfolios).where(eq(portfolios.userId, userAId));
    await db.delete(portfolios).where(eq(portfolios.userId, userBId));
    await db.delete(assets).where(eq(assets.userId, userAId));
    await db.delete(assets).where(eq(assets.userId, userBId));
  });

  afterAll(async () => {
    await db.delete(auditLogs).where(eq(auditLogs.actorId, userAId));
    await db.delete(auditLogs).where(eq(auditLogs.actorId, userBId));
    await db.delete(users).where(eq(users.id, userAId));
    await db.delete(users).where(eq(users.id, userBId));
  });

  it('retorna paginação correta com limit, page e totalPages', async () => {
    const p1 = await createPortfolio({ name: 'Ações BR', baseCurrency: 'BRL' }, userA);
    const asset = await createCustomAsset(
      { ticker: 'XPTO11', name: 'Fundo XPTO', currency: 'BRL' },
      userA
    );

    // Cria 5 eventos em datas diferentes
    for (let i = 1; i <= 5; i++) {
      await createPortfolioEvent(
        {
          portfolioId: p1.id,
          assetId: asset.id,
          type: 'BUY',
          tradeDate: new Date(`2026-01-0${i}T10:00:00.000Z`),
          quantity: '10',
          unitPrice: '100.00',
          fees: '1.00',
          currency: 'BRL',
          source: 'manual',
          notes: `Compra lote ${i}`,
        },
        userA
      );
    }

    // Página 1 com limit 2
    const page1 = await getUserHistoryData(userA, { page: 1, limit: 2 });
    expect(page1.totalCount).toBe(5);
    expect(page1.totalPages).toBe(3);
    expect(page1.page).toBe(1);
    expect(page1.limit).toBe(2);
    expect(page1.items).toHaveLength(2);
    // Mais recente primeiro (data 2026-01-05)
    expect(page1.items[0].notes).toBe('Compra lote 5');
    expect(page1.items[1].notes).toBe('Compra lote 4');

    // Página 2 com limit 2
    const page2 = await getUserHistoryData(userA, { page: 2, limit: 2 });
    expect(page2.items).toHaveLength(2);
    expect(page2.items[0].notes).toBe('Compra lote 3');
    expect(page2.items[1].notes).toBe('Compra lote 2');

    // Página 3 com limit 2
    const page3 = await getUserHistoryData(userA, { page: 3, limit: 2 });
    expect(page3.items).toHaveLength(1);
    expect(page3.items[0].notes).toBe('Compra lote 1');
  });

  it('aplica filtros combinados: carteira, tipo de operação, ticker e intervalo de datas', async () => {
    const p1 = await createPortfolio({ name: 'Carteira 1', baseCurrency: 'BRL' }, userA);
    const p2 = await createPortfolio({ name: 'Carteira 2', baseCurrency: 'BRL' }, userA);

    const assetPetr = await createCustomAsset(
      { ticker: 'PETR4', name: 'Petrobras PN', currency: 'BRL' },
      userA
    );
    const assetVale = await createCustomAsset(
      { ticker: 'VALE3', name: 'Vale ON', currency: 'BRL' },
      userA
    );

    // 1. Compra PETR4 na Carteira 1 em Jan/2026
    await createPortfolioEvent(
      {
        portfolioId: p1.id,
        assetId: assetPetr.id,
        type: 'BUY',
        tradeDate: new Date('2026-01-10T10:00:00.000Z'),
        quantity: '100',
        unitPrice: '30.00',
        fees: '2.00',
        currency: 'BRL',
        source: 'manual',
        notes: 'Compra PETR4 Jan',
      },
      userA
    );

    // 2. Venda PETR4 na Carteira 1 em Fev/2026
    await createPortfolioEvent(
      {
        portfolioId: p1.id,
        assetId: assetPetr.id,
        type: 'SELL',
        tradeDate: new Date('2026-02-15T10:00:00.000Z'),
        quantity: '50',
        unitPrice: '35.00',
        fees: '2.00',
        currency: 'BRL',
        source: 'manual',
        notes: 'Venda PETR4 Fev',
      },
      userA
    );

    // 3. Compra VALE3 na Carteira 2 em Mar/2026
    await createPortfolioEvent(
      {
        portfolioId: p2.id,
        assetId: assetVale.id,
        type: 'BUY',
        tradeDate: new Date('2026-03-01T10:00:00.000Z'),
        quantity: '200',
        unitPrice: '60.00',
        fees: '5.00',
        currency: 'BRL',
        source: 'manual',
        notes: 'Compra VALE3 Mar',
      },
      userA
    );

    // Filtro 1: Por Carteira 1
    const resP1 = await getUserHistoryData(userA, { portfolioId: p1.id });
    expect(resP1.totalCount).toBe(2);
    expect(resP1.items.every((it) => it.portfolioId === p1.id)).toBe(true);

    // Filtro 2: Por Tipo SELL
    const resSell = await getUserHistoryData(userA, { type: 'SELL' });
    expect(resSell.totalCount).toBe(1);
    expect(resSell.items[0].type).toBe('SELL');
    expect(resSell.items[0].assetTicker).toBe('PETR4');

    // Filtro 3: Por Ticker "vale" (case-insensitive)
    const resTicker = await getUserHistoryData(userA, { ticker: 'vale' });
    expect(resTicker.totalCount).toBe(1);
    expect(resTicker.items[0].assetTicker).toBe('VALE3');

    // Filtro 4: Por Período (Janeiro a Fevereiro)
    const resDates = await getUserHistoryData(userA, {
      startDate: new Date('2026-01-01T00:00:00.000Z'),
      endDate: new Date('2026-02-28T23:59:59.999Z'),
    });
    expect(resDates.totalCount).toBe(2);
    expect(resDates.items.some((it) => it.notes === 'Compra VALE3 Mar')).toBe(false);

    // Filtro 5: Combinação Carteira 1 + Tipo BUY + Ticker PETR4
    const resCombined = await getUserHistoryData(userA, {
      portfolioId: p1.id,
      type: 'BUY',
      ticker: 'PETR4',
    });
    expect(resCombined.totalCount).toBe(1);
    expect(resCombined.items[0].notes).toBe('Compra PETR4 Jan');
  });

  it('exclui eventos cancelados (soft delete) e carteiras excluídas', async () => {
    const p1 = await createPortfolio({ name: 'Carteira Ativa', baseCurrency: 'BRL' }, userA);
    const p2 = await createPortfolio({ name: 'Carteira a Excluir', baseCurrency: 'BRL' }, userA);

    const asset = await createCustomAsset(
      { ticker: 'MGLU3', name: 'Magazine Luiza', currency: 'BRL' },
      userA
    );

    const ev1 = await createPortfolioEvent(
      {
        portfolioId: p1.id,
        assetId: asset.id,
        type: 'BUY',
        tradeDate: new Date('2026-01-05T10:00:00.000Z'),
        quantity: '100',
        unitPrice: '10.00',
        fees: '0',
        currency: 'BRL',
        source: 'manual',
        notes: 'Evento que será cancelado',
      },
      userA
    );

    await createPortfolioEvent(
      {
        portfolioId: p2.id,
        assetId: asset.id,
        type: 'BUY',
        tradeDate: new Date('2026-01-06T10:00:00.000Z'),
        quantity: '50',
        unitPrice: '12.00',
        fees: '0',
        currency: 'BRL',
        source: 'manual',
        notes: 'Evento em carteira excluída',
      },
      userA
    );

    // Cancela o evento 1
    await cancelPortfolioEvent(
      ev1.id,
      { cancellationReason: 'Erro de digitação nos valores' },
      userA
    );

    // Exclui a carteira 2
    await deletePortfolio(p2.id, userA);

    // Consulta de histórico não deve trazer nenhum dos dois
    const res = await getUserHistoryData(userA);
    expect(res.totalCount).toBe(0);
    expect(res.items).toHaveLength(0);
  });

  it('assegura isolamento multiusuário estrito (anti-IDOR)', async () => {
    const pA = await createPortfolio({ name: 'Carteira User A', baseCurrency: 'BRL' }, userA);
    const pB = await createPortfolio({ name: 'Carteira User B', baseCurrency: 'BRL' }, userB);

    const assetA = await createCustomAsset(
      { ticker: 'ITUB4', name: 'Itaú Unibanco', currency: 'BRL' },
      userA
    );
    const assetB = await createCustomAsset(
      { ticker: 'BBDC4', name: 'Bradesco PN', currency: 'BRL' },
      userB
    );

    await createPortfolioEvent(
      {
        portfolioId: pA.id,
        assetId: assetA.id,
        type: 'BUY',
        tradeDate: new Date('2026-01-10T10:00:00.000Z'),
        quantity: '100',
        unitPrice: '25.00',
        fees: '0',
        currency: 'BRL',
        source: 'manual',
      },
      userA
    );

    await createPortfolioEvent(
      {
        portfolioId: pB.id,
        assetId: assetB.id,
        type: 'BUY',
        tradeDate: new Date('2026-01-10T10:00:00.000Z'),
        quantity: '200',
        unitPrice: '15.00',
        fees: '0',
        currency: 'BRL',
        source: 'manual',
      },
      userB
    );

    // User B consulta seu próprio histórico
    const resB = await getUserHistoryData(userB);
    expect(resB.totalCount).toBe(1);
    expect(resB.items[0].assetTicker).toBe('BBDC4');

    // User B tenta filtrar pelo portfolioId do User A
    const resBFilteredByA = await getUserHistoryData(userB, { portfolioId: pA.id });
    expect(resBFilteredByA.totalCount).toBe(0);
    expect(resBFilteredByA.items).toHaveLength(0);
  });

  it('detalha corretamente a posição e trades realizados de um ativo específico na carteira', async () => {
    const p1 = await createPortfolio({ name: 'Trades Detail Test', baseCurrency: 'BRL' }, userA);
    const asset = await createCustomAsset(
      { ticker: 'WEGE3', name: 'WEG ON', currency: 'BRL' },
      userA
    );

    // Compra 1: 100 @ 30.00 (taxa 10.00) -> Custo = 3010 / 100 = 30.10
    await createPortfolioEvent(
      {
        portfolioId: p1.id,
        assetId: asset.id,
        type: 'BUY',
        tradeDate: new Date('2026-01-01T10:00:00.000Z'),
        quantity: '100',
        unitPrice: '30.00',
        fees: '10.00',
        currency: 'BRL',
        source: 'manual',
      },
      userA
    );

    // Venda 1: 40 @ 40.00 (taxa 5.00) -> Receita líquida = 1600 - 5 = 1595. Custo Base = 40 * 30.10 = 1204. PnL = +391.00
    await createPortfolioEvent(
      {
        portfolioId: p1.id,
        assetId: asset.id,
        type: 'SELL',
        tradeDate: new Date('2026-01-15T10:00:00.000Z'),
        quantity: '40',
        unitPrice: '40.00',
        fees: '5.00',
        currency: 'BRL',
        source: 'manual',
      },
      userA
    );

    const { position, realizedTrades } = await getAssetPositionInPortfolio(p1.id, asset.id, userA);

    expect(position.quantity.toString()).toBe('60');
    expect(position.averagePrice.toFixed(2)).toBe('30.10');
    expect(position.totalCost.toFixed(2)).toBe('1806.00');
    expect(position.totalRealizedPnL.toFixed(2)).toBe('391.00');

    expect(realizedTrades).toHaveLength(1);
    expect(realizedTrades[0].quantity.toString()).toBe('40');
    expect(realizedTrades[0].salePrice.toFixed(2)).toBe('40.00');
    expect(realizedTrades[0].costBasisPrice.toFixed(2)).toBe('30.10');
    expect(realizedTrades[0].realizedPnL.toFixed(2)).toBe('391.00');
  });
});
