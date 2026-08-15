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
import { createPortfolio } from '../../../src/modules/portfolio/server/portfolio.service';
import { createCustomAsset } from '../../../src/modules/portfolio/server/asset.service';
import {
  createPortfolioEvent,
  cancelPortfolioEvent,
} from '../../../src/modules/portfolio/server/portfolio-event.service';
import {
  getPortfolioPositions,
  getAssetPositionInPortfolio,
} from '../../../src/modules/portfolio/server/position.service';
import {
  InsufficientPositionError,
  RetroactiveInconsistencyError,
} from '../../../src/modules/portfolio/domain/errors';
import type { SafeUser } from '../../../src/modules/identity/domain/user.types';

describe('Integração: Motor de Posições e Validação Temporal (PostgreSQL Real)', () => {
  const userAId = crypto.randomUUID();
  const userBId = crypto.randomUUID();
  const userAEmail = 'pos_test_user_a@carteiraexpert.invalid';
  const userBEmail = 'pos_test_user_b@carteiraexpert.invalid';

  const userA: SafeUser = {
    id: userAId,
    email: userAEmail,
    name: 'User A',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const userB: SafeUser = {
    id: userBId,
    email: userBEmail,
    name: 'User B',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  let globalAssetId: string;

  beforeAll(async () => {
    // Limpeza prévia
    await db.delete(users).where(eq(users.email, userAEmail));
    await db.delete(users).where(eq(users.email, userBEmail));

    await db.insert(users).values([
      {
        id: userA.id,
        email: userA.email,
        name: userA.name,
        passwordHash: 'dummy_hash',
      },
      {
        id: userB.id,
        email: userB.email,
        name: userB.name,
        passwordHash: 'dummy_hash',
      },
    ]);

    // Insere ativo global para testes
    globalAssetId = crypto.randomUUID();
    await db.insert(assets).values({
      id: globalAssetId,
      ticker: `POS_PETR4_${Date.now().toString().slice(-4)}`,
      name: 'Petrobras Teste',
      assetType: 'stock',
      market: 'B3',
      currency: 'BRL',
      isCustom: false,
      userId: null,
    });
  });

  afterEach(async () => {
    // Limpa eventos, carteiras e ativos filhos criados nos testes
    await db.delete(portfolioEvents).where(eq(portfolioEvents.createdBy, userAId));
    await db.delete(portfolioEvents).where(eq(portfolioEvents.createdBy, userBId));
    await db.delete(portfolios).where(eq(portfolios.userId, userAId));
    await db.delete(portfolios).where(eq(portfolios.userId, userBId));
    await db.delete(assets).where(eq(assets.userId, userAId));
    await db.delete(assets).where(eq(assets.userId, userBId));
    await db.delete(auditLogs).where(eq(auditLogs.actorId, userAId));
    await db.delete(auditLogs).where(eq(auditLogs.actorId, userBId));
  });

  afterAll(async () => {
    await db.delete(portfolioEvents).where(eq(portfolioEvents.createdBy, userAId));
    await db.delete(portfolioEvents).where(eq(portfolioEvents.createdBy, userBId));
    await db.delete(portfolios).where(eq(portfolios.userId, userAId));
    await db.delete(portfolios).where(eq(portfolios.userId, userBId));
    await db.delete(assets).where(eq(assets.userId, userAId));
    await db.delete(assets).where(eq(assets.userId, userBId));
    await db.delete(assets).where(eq(assets.id, globalAssetId));
    await db.delete(auditLogs).where(eq(auditLogs.actorId, userAId));
    await db.delete(auditLogs).where(eq(auditLogs.actorId, userBId));
    await db.delete(users).where(eq(users.id, userAId));
    await db.delete(users).where(eq(users.id, userBId));
  });

  it('deve calcular posição, custo médio e custo total investido após compras e vendas', async () => {
    const portfolio = await createPortfolio(
      { name: 'Carteira Posição Teste', baseCurrency: 'BRL' },
      userA
    );

    // 1. Compra 100 @ 25.00 (taxas 5.00)
    await createPortfolioEvent(
      {
        portfolioId: portfolio.id,
        assetId: globalAssetId,
        type: 'BUY',
        tradeDate: new Date('2026-01-10T12:00:00Z'),
        quantity: '100',
        unitPrice: '25.00',
        fees: '5.00',
        currency: 'BRL',
      },
      userA
    );

    // 2. Compra 100 @ 35.00 (taxas 5.00)
    await createPortfolioEvent(
      {
        portfolioId: portfolio.id,
        assetId: globalAssetId,
        type: 'BUY',
        tradeDate: new Date('2026-01-15T12:00:00Z'),
        quantity: '100',
        unitPrice: '35.00',
        fees: '5.00',
        currency: 'BRL',
      },
      userA
    );

    let summary = await getPortfolioPositions(portfolio.id, userA);
    expect(summary.positions).toHaveLength(1);
    expect(summary.positions[0].quantity.toString()).toBe('200');
    // Custo total: (2500 + 5) + (3500 + 5) = 6010
    expect(summary.positions[0].totalCost.toString()).toBe('6010');
    // Custo médio: 6010 / 200 = 30.05
    expect(summary.positions[0].averagePrice.toString()).toBe('30.05');

    // 3. Venda parcial de 50 @ 40.00 (taxas 2.00)
    await createPortfolioEvent(
      {
        portfolioId: portfolio.id,
        assetId: globalAssetId,
        type: 'SELL',
        tradeDate: new Date('2026-01-20T12:00:00Z'),
        quantity: '50',
        unitPrice: '40.00',
        fees: '2.00',
        currency: 'BRL',
      },
      userA
    );

    summary = await getPortfolioPositions(portfolio.id, userA);
    expect(summary.positions[0].quantity.toString()).toBe('150');
    expect(summary.positions[0].averagePrice.toString()).toBe('30.05');
    // Custo total remanescente: 150 * 30.05 = 4507.50
    expect(summary.positions[0].totalCost.toString()).toBe('4507.5');
    // PnL Realizado da venda: (50 * 40 - 2) - (50 * 30.05) = 1998 - 1502.5 = 495.50
    expect(summary.positions[0].totalRealizedPnL.toString()).toBe('495.5');
  });

  it('deve rejeitar venda acima da posição e garantir rollback físico no PostgreSQL', async () => {
    const portfolio = await createPortfolio(
      { name: 'Carteira Rejeição Venda', baseCurrency: 'BRL' },
      userA
    );

    // Compra 50
    await createPortfolioEvent(
      {
        portfolioId: portfolio.id,
        assetId: globalAssetId,
        type: 'BUY',
        tradeDate: new Date('2026-01-10T12:00:00Z'),
        quantity: '50',
        unitPrice: '20.00',
        fees: '0.00',
        currency: 'BRL',
      },
      userA
    );

    // Tenta vender 100
    await expect(
      createPortfolioEvent(
        {
          portfolioId: portfolio.id,
          assetId: globalAssetId,
          type: 'SELL',
          tradeDate: new Date('2026-01-20T12:00:00Z'),
          quantity: '100',
          unitPrice: '25.00',
          fees: '0.00',
          currency: 'BRL',
        },
        userA
      )
    ).rejects.toThrow(InsufficientPositionError);

    // Comprova que a venda NÃO foi inserida
    const events = await db
      .select()
      .from(portfolioEvents)
      .where(eq(portfolioEvents.portfolioId, portfolio.id));

    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('BUY');
  });

  it('deve rejeitar venda retroativa cuja data seja anterior ao saldo disponível', async () => {
    const portfolio = await createPortfolio(
      { name: 'Carteira Retroativa', baseCurrency: 'BRL' },
      userA
    );

    // Compra em Fevereiro
    await createPortfolioEvent(
      {
        portfolioId: portfolio.id,
        assetId: globalAssetId,
        type: 'BUY',
        tradeDate: new Date('2026-02-10T12:00:00Z'),
        quantity: '100',
        unitPrice: '25.00',
        fees: '0.00',
        currency: 'BRL',
      },
      userA
    );

    // Tenta vender em Janeiro (antes da compra)
    await expect(
      createPortfolioEvent(
        {
          portfolioId: portfolio.id,
          assetId: globalAssetId,
          type: 'SELL',
          tradeDate: new Date('2026-01-10T12:00:00Z'),
          quantity: '50',
          unitPrice: '30.00',
          fees: '0.00',
          currency: 'BRL',
        },
        userA
      )
    ).rejects.toThrow(InsufficientPositionError);
  });

  it('deve rejeitar cancelamento de compra que serviu de lastro para vendas posteriores', async () => {
    const portfolio = await createPortfolio(
      { name: 'Carteira Lastro', baseCurrency: 'BRL' },
      userA
    );

    // 1. Compra 100
    const buyEvent = await createPortfolioEvent(
      {
        portfolioId: portfolio.id,
        assetId: globalAssetId,
        type: 'BUY',
        tradeDate: new Date('2026-01-10T12:00:00Z'),
        quantity: '100',
        unitPrice: '25.00',
        fees: '0.00',
        currency: 'BRL',
      },
      userA
    );

    // 2. Venda 80
    await createPortfolioEvent(
      {
        portfolioId: portfolio.id,
        assetId: globalAssetId,
        type: 'SELL',
        tradeDate: new Date('2026-01-20T12:00:00Z'),
        quantity: '80',
        unitPrice: '30.00',
        fees: '0.00',
        currency: 'BRL',
      },
      userA
    );

    // 3. Tentativa de cancelar a compra inicial deve ser rejeitada
    await expect(
      cancelPortfolioEvent(
        buyEvent.id,
        { cancellationReason: 'Erro de digitação' },
        userA
      )
    ).rejects.toThrow(RetroactiveInconsistencyError);

    // Comprova que o evento de compra permanece ativo
    const [row] = await db
      .select()
      .from(portfolioEvents)
      .where(eq(portfolioEvents.id, buyEvent.id));

    expect(row.deletedAt).toBeNull();
  });

  it('deve permitir cancelamento válido de venda e restabelecer a posição original', async () => {
    const portfolio = await createPortfolio(
      { name: 'Carteira Cancelamento Venda', baseCurrency: 'BRL' },
      userA
    );

    await createPortfolioEvent(
      {
        portfolioId: portfolio.id,
        assetId: globalAssetId,
        type: 'BUY',
        tradeDate: new Date('2026-01-10T12:00:00Z'),
        quantity: '100',
        unitPrice: '25.00',
        fees: '0.00',
        currency: 'BRL',
      },
      userA
    );

    const sellEvent = await createPortfolioEvent(
      {
        portfolioId: portfolio.id,
        assetId: globalAssetId,
        type: 'SELL',
        tradeDate: new Date('2026-01-20T12:00:00Z'),
        quantity: '40',
        unitPrice: '30.00',
        fees: '0.00',
        currency: 'BRL',
      },
      userA
    );

    let summary = await getPortfolioPositions(portfolio.id, userA);
    expect(summary.positions[0].quantity.toString()).toBe('60');

    // Cancela a venda
    await cancelPortfolioEvent(
      sellEvent.id,
      { cancellationReason: 'Ordem de venda cancelada' },
      userA
    );

    summary = await getPortfolioPositions(portfolio.id, userA);
    expect(summary.positions[0].quantity.toString()).toBe('100');
    expect(summary.positions[0].totalRealizedPnL.toString()).toBe('0');
  });

  it('deve calcular posição perfeitamente com ativos customizados', async () => {
    const portfolio = await createPortfolio(
      { name: 'Carteira Custom', baseCurrency: 'BRL' },
      userA
    );

    const customAsset = await createCustomAsset(
      {
        ticker: `CUST_${Date.now().toString().slice(-4)}`,
        name: 'Imóvel Fundo Alpha',
        currency: 'BRL',
      },
      userA
    );

    await createPortfolioEvent(
      {
        portfolioId: portfolio.id,
        assetId: customAsset.id,
        type: 'BUY',
        tradeDate: new Date('2026-01-10T12:00:00Z'),
        quantity: '10',
        unitPrice: '500.00',
        fees: '25.00',
        currency: 'BRL',
      },
      userA
    );

    const summary = await getPortfolioPositions(portfolio.id, userA);
    expect(summary.positions).toHaveLength(1);
    expect(summary.positions[0].ticker).toBe(customAsset.ticker);
    expect(summary.positions[0].isCustom).toBe(true);
    expect(summary.positions[0].totalCost.toString()).toBe('5025');
  });

  it('deve garantir isolamento total de posições entre usuários (IDOR)', async () => {
    const portfolioA = await createPortfolio(
      { name: 'Carteira User A', baseCurrency: 'BRL' },
      userA
    );

    await createPortfolioEvent(
      {
        portfolioId: portfolioA.id,
        assetId: globalAssetId,
        type: 'BUY',
        tradeDate: new Date('2026-01-10T12:00:00Z'),
        quantity: '100',
        unitPrice: '25.00',
        fees: '0.00',
        currency: 'BRL',
      },
      userA
    );

    // Usuário B tenta consultar as posições da carteira do Usuário A -> deve ser barrado com FORBIDDEN
    await expect(getPortfolioPositions(portfolioA.id, userB)).rejects.toThrow(
      'FORBIDDEN'
    );
  });
});
