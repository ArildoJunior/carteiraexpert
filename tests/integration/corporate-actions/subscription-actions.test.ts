import { describe, it, expect, beforeAll, afterAll, vi, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import { inArray, eq } from 'drizzle-orm';
import { db } from '../../../src/lib/db';
import { users } from '../../../src/lib/db/schema/identity';
import { portfolios, assets, portfolioEvents } from '../../../src/lib/db/schema/portfolio';
import {
  subscriptionOffers,
  subscriptionRights,
  subscriptionExercises,
} from '../../../src/lib/db/schema/subscription';
import * as currentUserModule from '../../../src/modules/identity/server/current-user';
import {
  listAvailableOffersAction,
  allocateSubscriptionRightAction,
  exerciseSubscriptionAction,
  cancelSubscriptionRightAction,
  listActiveSubscriptionsByPortfolioAction,
} from '../../../src/modules/corporate-actions/server/subscription.actions';
import type { SafeUser } from '../../../src/modules/identity/domain/user.types';

describe('Integração: Subscription Server Actions (S1.4)', () => {
  const user1Id = crypto.randomUUID();
  const user2Id = crypto.randomUUID();

  let user1: SafeUser;
  let user2: SafeUser;
  let activeUser: SafeUser | null = null;

  let portfolio1Id: string;
  let portfolio2Id: string;

  const originAssetId = crypto.randomUUID();
  const rightAssetId = crypto.randomUUID();
  const targetAssetId = crypto.randomUUID();

  let validOfferId: string;
  let expiredOfferId: string;

  beforeAll(async () => {
    // 1. Mock de requireAuth para apontar dinamicamente para o activeUser
    vi.spyOn(currentUserModule, 'requireAuth').mockImplementation(async () => {
      if (!activeUser) {
        throw new Error('Sessão expirada ou usuário não autenticado.');
      }
      return activeUser;
    });

    const now = new Date();

    // 2. Insere usuários no PostgreSQL
    await db.insert(users).values([
      {
        id: user1Id,
        email: `sub_action_user1_${Date.now()}@carteiraexpert.test`,
        name: 'Subscription Action User 1',
        passwordHash: 'dummy_hash_1',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: user2Id,
        email: `sub_action_user2_${Date.now()}@carteiraexpert.test`,
        name: 'Subscription Action User 2',
        passwordHash: 'dummy_hash_2',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
    ]);

    user1 = {
      id: user1Id,
      email: `sub_action_user1_${Date.now()}@carteiraexpert.test`,
      name: 'Subscription Action User 1',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    user2 = {
      id: user2Id,
      email: `sub_action_user2_${Date.now()}@carteiraexpert.test`,
      name: 'Subscription Action User 2',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    // 3. Cria carteiras
    portfolio1Id = crypto.randomUUID();
    portfolio2Id = crypto.randomUUID();

    await db.insert(portfolios).values([
      {
        id: portfolio1Id,
        userId: user1Id,
        name: 'Carteira User 1 Actions',
        baseCurrency: 'BRL',
        status: 'active',
      },
      {
        id: portfolio2Id,
        userId: user2Id,
        name: 'Carteira User 2 Actions',
        baseCurrency: 'BRL',
        status: 'active',
      },
    ]);

    // 4. Cria ativos
    await db.insert(assets).values([
      {
        id: originAssetId,
        ticker: `ACTO${Date.now().toString().slice(-4)}11`,
        name: 'Ativo Originador FII',
        assetType: 'fii',
        market: 'B3',
        currency: 'BRL',
        isCustom: false,
      },
      {
        id: rightAssetId,
        ticker: `ACTO${Date.now().toString().slice(-4)}12`,
        name: 'Direito de Subscrição',
        assetType: 'subscription_right',
        market: 'B3',
        currency: 'BRL',
        isCustom: false,
      },
      {
        id: targetAssetId,
        ticker: `ACTO${Date.now().toString().slice(-4)}11_T`,
        name: 'Ativo Destino FII',
        assetType: 'fii',
        market: 'B3',
        currency: 'BRL',
        isCustom: false,
      },
    ]);

    // 5. Cria ofertas
    validOfferId = crypto.randomUUID();
    expiredOfferId = crypto.randomUUID();

    await db.insert(subscriptionOffers).values([
      {
        id: validOfferId,
        originAssetId,
        rightAssetId,
        targetAssetId,
        cutOffDate: new Date('2026-08-01T00:00:00.000Z'),
        exerciseStartDate: new Date('2026-08-05T00:00:00.000Z'),
        exerciseEndDate: new Date(Date.now() + 30 * 24 * 3600 * 1000),
        exercisePrice: '10.50000000',
        currency: 'BRL',
        createdBy: user1Id,
      },
      {
        id: expiredOfferId,
        originAssetId,
        rightAssetId,
        targetAssetId,
        cutOffDate: new Date('2026-01-01T00:00:00.000Z'),
        exerciseStartDate: new Date('2026-01-05T00:00:00.000Z'),
        exerciseEndDate: new Date('2026-01-20T00:00:00.000Z'),
        exercisePrice: '10.00000000',
        currency: 'BRL',
        createdBy: user1Id,
      },
    ]);
  });

  afterAll(async () => {
    // Limpeza
    await db.delete(subscriptionExercises).where(inArray(subscriptionExercises.createdBy, [user1Id, user2Id]));
    await db.delete(portfolioEvents).where(inArray(portfolioEvents.createdBy, [user1Id, user2Id]));
    await db.delete(subscriptionRights).where(inArray(subscriptionRights.createdBy, [user1Id, user2Id]));
    await db.delete(subscriptionOffers).where(inArray(subscriptionOffers.createdBy, [user1Id, user2Id]));
    await db.delete(assets).where(
      inArray(assets.id, [originAssetId, rightAssetId, targetAssetId])
    );
    await db.delete(portfolios).where(inArray(portfolios.id, [portfolio1Id, portfolio2Id]));
    await db.delete(users).where(inArray(users.id, [user1Id, user2Id]));
  });

  beforeEach(() => {
    activeUser = user1;
  });

  // 1. listAvailableOffersAction
  it('1. listAvailableOffersAction returns available offers when authenticated', async () => {
    const result = await listAvailableOffersAction();
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data?.length).toBeGreaterThan(0);
    const offer = result.data?.find((o) => o.id === validOfferId);
    expect(offer).toBeDefined();
    expect(offer?.originAsset.ticker).toBeDefined();
  });

  it('1b. listAvailableOffersAction returns error when unauthenticated', async () => {
    activeUser = null;
    const result = await listAvailableOffersAction();
    expect(result.success).toBe(false);
    expect(result.error).toContain('não autenticado');
  });

  // 2. allocateSubscriptionRightAction
  it('2a. allocateSubscriptionRightAction allocates right successfully via plain object', async () => {
    const result = await allocateSubscriptionRightAction(null, {
      portfolioId: portfolio1Id,
      offerId: validOfferId,
      allocatedQuantity: '100.0000000000',
    });

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data?.status).toBe('ACTIVE');
    expect(Number(result.data?.allocatedQuantity)).toBe(100);
  });

  it('2b. allocateSubscriptionRightAction allocates right successfully via FormData', async () => {
    const formData = new FormData();
    formData.append('portfolioId', portfolio1Id);
    formData.append('offerId', validOfferId);
    formData.append('allocatedQuantity', '50.0000000000');

    const result = await allocateSubscriptionRightAction(null, formData);
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(Number(result.data?.allocatedQuantity)).toBe(50);
  });

  it('2c. allocateSubscriptionRightAction returns validation fieldErrors on invalid input', async () => {
    const result = await allocateSubscriptionRightAction(null, {
      portfolioId: 'invalid-uuid',
      offerId: validOfferId,
      allocatedQuantity: '-10',
    });

    expect(result.success).toBe(false);
    expect(result.fieldErrors).toBeDefined();
    expect(result.fieldErrors?.portfolioId).toBeDefined();
    expect(result.fieldErrors?.allocatedQuantity).toBeDefined();
  });

  it('2d. allocateSubscriptionRightAction blocks IDOR on other user portfolio', async () => {
    activeUser = user1;
    const result = await allocateSubscriptionRightAction(null, {
      portfolioId: portfolio2Id, // Carteira do User 2
      offerId: validOfferId,
      allocatedQuantity: '50.0000000000',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Acesso não autorizado.');
  });

  // 3. exerciseSubscriptionAction
  it('3a. exerciseSubscriptionAction executes valid exercise and returns result with BUY event', async () => {
    const allocRes = await allocateSubscriptionRightAction(null, {
      portfolioId: portfolio1Id,
      offerId: validOfferId,
      allocatedQuantity: '100.0000000000',
    });
    expect(allocRes.success).toBe(true);
    const rightId = allocRes.data!.id;

    const result = await exerciseSubscriptionAction(null, {
      subscriptionRightId: rightId,
      portfolioId: portfolio1Id,
      quantity: '40.0000000000',
      fees: '2.50000000',
      exerciseDate: new Date().toISOString(),
    });

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(Number(result.data?.exercise.exercisePrice)).toBe(10.5);
    // totalCost = 40 * 10.50 + 2.50 = 422.50000000
    expect(result.data?.exercise.totalCost).toBe('422.50000000');
    expect(result.data?.event.type).toBe('BUY');
    expect(result.data?.subscriptionRight.status).toBe('PARTIALLY_EXERCISED');
  });

  it('3b. exerciseSubscriptionAction executes valid exercise via FormData', async () => {
    const allocRes = await allocateSubscriptionRightAction(null, {
      portfolioId: portfolio1Id,
      offerId: validOfferId,
      allocatedQuantity: '100.0000000000',
    });
    const rightId = allocRes.data!.id;

    const formData = new FormData();
    formData.append('subscriptionRightId', rightId);
    formData.append('portfolioId', portfolio1Id);
    formData.append('quantity', '30.0000000000');
    formData.append('fees', '1.00000000');
    formData.append('exerciseDate', new Date().toISOString());

    const result = await exerciseSubscriptionAction(null, formData);
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(Number(result.data?.exercise.exercisedQuantity)).toBe(30);
  });

  it('3c. exerciseSubscriptionAction strictly rejects client-supplied exercisePrice (anti-tampering)', async () => {
    const allocRes = await allocateSubscriptionRightAction(null, {
      portfolioId: portfolio1Id,
      offerId: validOfferId,
      allocatedQuantity: '100.0000000000',
    });
    const rightId = allocRes.data!.id;

    const result = await exerciseSubscriptionAction(null, {
      subscriptionRightId: rightId,
      portfolioId: portfolio1Id,
      quantity: '10.0000000000',
      exercisePrice: '1.00000000', // Tentativa maliciosa de injetar preço
    });

    expect(result.success).toBe(false);
    expect(result.fieldErrors).toBeDefined();
  });

  it('3d. exerciseSubscriptionAction strictly rejects client-supplied totalCost (anti-tampering)', async () => {
    const allocRes = await allocateSubscriptionRightAction(null, {
      portfolioId: portfolio1Id,
      offerId: validOfferId,
      allocatedQuantity: '100.0000000000',
    });
    const rightId = allocRes.data!.id;

    const result = await exerciseSubscriptionAction(null, {
      subscriptionRightId: rightId,
      portfolioId: portfolio1Id,
      quantity: '10.0000000000',
      totalCost: '5.00000000', // Tentativa maliciosa de injetar custo
    });

    expect(result.success).toBe(false);
    expect(result.fieldErrors).toBeDefined();
  });

  it('3e. exerciseSubscriptionAction rejects quantity greater than remaining balance', async () => {
    const allocRes = await allocateSubscriptionRightAction(null, {
      portfolioId: portfolio1Id,
      offerId: validOfferId,
      allocatedQuantity: '20.0000000000',
    });
    const rightId = allocRes.data!.id;

    const result = await exerciseSubscriptionAction(null, {
      subscriptionRightId: rightId,
      portfolioId: portfolio1Id,
      quantity: '25.0000000000',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('excede o saldo de direitos disponível');
  });

  // 4. cancelSubscriptionRightAction
  it('4a. cancelSubscriptionRightAction cancels subscription right successfully', async () => {
    const allocRes = await allocateSubscriptionRightAction(null, {
      portfolioId: portfolio1Id,
      offerId: validOfferId,
      allocatedQuantity: '50.0000000000',
    });
    const rightId = allocRes.data!.id;

    const result = await cancelSubscriptionRightAction(null, {
      subscriptionRightId: rightId,
      portfolioId: portfolio1Id,
      reason: 'Cancelamento via Server Action',
    });

    expect(result.success).toBe(true);
    expect(result.data?.status).toBe('CANCELLED');
    expect(result.data?.cancellationReason).toBe('Cancelamento via Server Action');
  });

  it('4b. cancelSubscriptionRightAction rejects cancellation of fully exercised right', async () => {
    const allocRes = await allocateSubscriptionRightAction(null, {
      portfolioId: portfolio1Id,
      offerId: validOfferId,
      allocatedQuantity: '20.0000000000',
    });
    const rightId = allocRes.data!.id;

    // Exerce 100%
    await exerciseSubscriptionAction(null, {
      subscriptionRightId: rightId,
      portfolioId: portfolio1Id,
      quantity: '20.0000000000',
    });

    const result = await cancelSubscriptionRightAction(null, {
      subscriptionRightId: rightId,
      portfolioId: portfolio1Id,
      reason: 'Tentativa de cancelar após 100% exercido',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Não é possível cancelar um direito de subscrição totalmente exercido');
  });

  // 5. listActiveSubscriptionsByPortfolioAction
  it('5. listActiveSubscriptionsByPortfolioAction lists subscriptions for portfolio', async () => {
    const allocRes = await allocateSubscriptionRightAction(null, {
      portfolioId: portfolio1Id,
      offerId: validOfferId,
      allocatedQuantity: '70.0000000000',
    });
    expect(allocRes.success).toBe(true);

    const result = await listActiveSubscriptionsByPortfolioAction(portfolio1Id);
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.data?.length).toBeGreaterThan(0);
    const found = result.data?.find((s) => s.id === allocRes.data!.id);
    expect(found).toBeDefined();
    expect(found?.offer).toBeDefined();
    expect(found?.projectedStatus).toBe('ACTIVE');
  });

  it('5b. listActiveSubscriptionsByPortfolioAction blocks IDOR on other user portfolio', async () => {
    activeUser = user1;
    const result = await listActiveSubscriptionsByPortfolioAction(portfolio2Id);
    expect(result.success).toBe(false);
    expect(result.error).toBe('Acesso não autorizado.');
  });
});
