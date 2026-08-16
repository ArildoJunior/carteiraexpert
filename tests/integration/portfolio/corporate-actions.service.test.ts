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
import { createPortfolio } from '../../../src/modules/portfolio/server/portfolio.service';
import { createCustomAsset } from '../../../src/modules/portfolio/server/asset.service';
import {
  createPortfolioEvent,
  createCorporateActionEvent,
  cancelPortfolioEvent,
} from '../../../src/modules/portfolio/server/portfolio-event.service';
import { getAssetPositionInPortfolio } from '../../../src/modules/portfolio/server/position.service';
import {
  InsufficientPositionError,
  PortfolioNotFoundError,
} from '../../../src/modules/portfolio/domain/errors';
import { AuthorizationError } from '../../../src/modules/identity/domain/errors';
import type { SafeUser } from '../../../src/modules/identity/domain/user.types';

describe('Integração: Eventos Corporativos no PostgreSQL Real (Pacote 04.01)', () => {
  const userAId = crypto.randomUUID();
  const userBId = crypto.randomUUID();
  const userAEmail = 'corp_action_user_a@carteiraexpert.invalid';
  const userBEmail = 'corp_action_user_b@carteiraexpert.invalid';

  const userA: SafeUser = {
    id: userAId,
    email: userAEmail,
    name: 'Corp Action User A',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const userB: SafeUser = {
    id: userBId,
    email: userBEmail,
    name: 'Corp Action User B',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeAll(async () => {
    await db.insert(users).values([
      {
        id: userAId,
        email: userAEmail,
        name: 'Corp Action User A',
        passwordHash: 'dummy_hash',
        status: 'active',
      },
      {
        id: userBId,
        email: userBEmail,
        name: 'Corp Action User B',
        passwordHash: 'dummy_hash',
        status: 'active',
      },
    ]);
  });

  afterEach(async () => {
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

  it('deve persistir um evento de SPLIT e atualizar a posição mantendo o custo total invariante', async () => {
    const portfolio = await createPortfolio(
      { name: 'Carteira Ações', baseCurrency: 'BRL' },
      userA
    );
    const asset = await createCustomAsset(
      { ticker: 'VALE3_TEST', name: 'Vale ON Test', currency: 'BRL' },
      userA
    );

    // Compra inicial: 100 ações a R$ 60,00 = R$ 6.000,00
    await createPortfolioEvent(
      {
        portfolioId: portfolio.id,
        assetId: asset.id,
        type: 'BUY',
        tradeDate: new Date('2026-01-10T12:00:00Z'),
        quantity: '100',
        unitPrice: '60.00',
        fees: '0',
        currency: 'BRL',
      },
      userA
    );

    // Desdobramento (SPLIT) 1:2 no dia 15/01
    const splitEvent = await createCorporateActionEvent(
      {
        portfolioId: portfolio.id,
        assetId: asset.id,
        type: 'SPLIT',
        tradeDate: new Date('2026-01-15T12:00:00Z'),
        factor: '2',
        notes: 'Desdobramento 1:2',
      },
      userA
    );

    expect(splitEvent.type).toBe('SPLIT');
    expect(splitEvent.source).toBe('corporate_action');

    // Consulta a posição consolidada
    const { position } = await getAssetPositionInPortfolio(portfolio.id, asset.id, userA);

    expect(position.quantity.toString()).toBe('200');
    expect(position.averagePrice.toString()).toBe('30');
    expect(position.totalCost.toString()).toBe('6000');
    expect(position.hasFractionalShares).toBe(false);
  });

  it('deve persistir um evento de GROUPING com frações residuais e sinalizar hasFractionalShares', async () => {
    const portfolio = await createPortfolio(
      { name: 'Carteira Small Caps', baseCurrency: 'BRL' },
      userA
    );
    const asset = await createCustomAsset(
      { ticker: 'OIBR3_TEST', name: 'Oi ON Test', currency: 'BRL' },
      userA
    );

    // Compra inicial: 105 ações a R$ 1,50 = R$ 157,50
    await createPortfolioEvent(
      {
        portfolioId: portfolio.id,
        assetId: asset.id,
        type: 'BUY',
        tradeDate: new Date('2026-01-10T12:00:00Z'),
        quantity: '105',
        unitPrice: '1.50',
        fees: '0',
        currency: 'BRL',
      },
      userA
    );

    // Grupamento 10:1
    await createCorporateActionEvent(
      {
        portfolioId: portfolio.id,
        assetId: asset.id,
        type: 'GROUPING',
        tradeDate: new Date('2026-01-15T12:00:00Z'),
        factor: '10',
        notes: 'Grupamento 10:1',
      },
      userA
    );

    const { position } = await getAssetPositionInPortfolio(portfolio.id, asset.id, userA);

    // 105 / 10 = 10.5 ações a R$ 15,00 = R$ 157,50
    expect(position.quantity.toString()).toBe('10.5');
    expect(position.averagePrice.toString()).toBe('15');
    expect(position.totalCost.toString()).toBe('157.5');
    expect(position.hasFractionalShares).toBe(true);
  });

  it('deve recalcular corretamente a linha temporal após o cancelamento auditado de um split', async () => {
    const portfolio = await createPortfolio(
      { name: 'Carteira Reversão', baseCurrency: 'BRL' },
      userA
    );
    const asset = await createCustomAsset(
      { ticker: 'TEST3', name: 'Ativo Teste', currency: 'BRL' },
      userA
    );

    await createPortfolioEvent(
      {
        portfolioId: portfolio.id,
        assetId: asset.id,
        type: 'BUY',
        tradeDate: new Date('2026-01-10T12:00:00Z'),
        quantity: '100',
        unitPrice: '50.00',
        fees: '0',
        currency: 'BRL',
      },
      userA
    );

    const splitEvent = await createCorporateActionEvent(
      {
        portfolioId: portfolio.id,
        assetId: asset.id,
        type: 'SPLIT',
        tradeDate: new Date('2026-01-15T12:00:00Z'),
        factor: '2',
      },
      userA
    );

    // Cancela o split
    await cancelPortfolioEvent(
      splitEvent.id,
      { cancellationReason: 'Evento corporativo lançado por engano' },
      userA
    );

    // Posição volta ao estado original de 100 ações @ 50.00
    const { position } = await getAssetPositionInPortfolio(portfolio.id, asset.id, userA);

    expect(position.quantity.toString()).toBe('100');
    expect(position.averagePrice.toString()).toBe('50');
    expect(position.totalCost.toString()).toBe('5000');
  });

  it('deve impedir que o Usuário B lance evento corporativo na carteira do Usuário A (Anti-IDOR)', async () => {
    const portfolioA = await createPortfolio(
      { name: 'Carteira do User A', baseCurrency: 'BRL' },
      userA
    );
    const assetA = await createCustomAsset(
      { ticker: 'PRIV3', name: 'Privado A', currency: 'BRL' },
      userA
    );

    await createPortfolioEvent(
      {
        portfolioId: portfolioA.id,
        assetId: assetA.id,
        type: 'BUY',
        tradeDate: new Date('2026-01-10T12:00:00Z'),
        quantity: '100',
        unitPrice: '10.00',
        fees: '0',
        currency: 'BRL',
      },
      userA
    );

    // User B tenta lançar split na carteira de A
    await expect(
      createCorporateActionEvent(
        {
          portfolioId: portfolioA.id,
          assetId: assetA.id,
          type: 'SPLIT',
          tradeDate: new Date('2026-01-15T12:00:00Z'),
          factor: '2',
        },
        userB
      )
    ).rejects.toThrow();
  });
});
