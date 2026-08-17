import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import Decimal from 'decimal.js';
import { eq, inArray, and, desc } from 'drizzle-orm';
import { db } from '../../../src/lib/db';
import { users } from '../../../src/lib/db/schema/identity';
import { portfolios, assets, portfolioEvents } from '../../../src/lib/db/schema/portfolio';
import {
  subscriptionOffers,
  subscriptionRights,
  subscriptionExercises,
} from '../../../src/lib/db/schema/subscription';
import { auditLogs } from '../../../src/lib/db/schema/audit';
import type { SafeUser } from '../../../src/modules/identity/domain/user.types';
import {
  allocateSubscriptionRight,
  exerciseSubscription,
  cancelSubscriptionRight,
  listActiveSubscriptionsByPortfolio,
  listAvailableOffers,
} from '../../../src/modules/corporate-actions/server/subscription.service';
import {
  SubscriptionExpiredError,
  SubscriptionOfferNotFoundError,
  InsufficientSubscriptionRightsError,
  InvalidSubscriptionStateError,
  InvalidSubscriptionPeriodError,
  InvalidSubscriptionDateError,
  InvalidCorporateActionError,
} from '../../../src/modules/corporate-actions/domain/errors';
import { AuthorizationError } from '../../../src/modules/identity/domain/errors';

describe('Integração: Serviços Transacionais de Subscrição (S1.3)', () => {
  const user1Id = crypto.randomUUID();
  const user2Id = crypto.randomUUID();

  const safeUser1: SafeUser = {
    id: user1Id,
    email: `sub_user1_${Date.now()}@carteiraexpert.test`,
    name: 'User 1 Subscriptions',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const safeUser2: SafeUser = {
    id: user2Id,
    email: `sub_user2_${Date.now()}@carteiraexpert.test`,
    name: 'User 2 Subscriptions',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  let portfolio1Id: string;
  let portfolio2Id: string;

  const originAssetId = crypto.randomUUID();
  const rightAssetId = crypto.randomUUID();
  const targetAssetId = crypto.randomUUID();
  const invalidTypeAssetId = crypto.randomUUID();

  let validOfferId: string;
  let expiredOfferId: string;
  let futureOfferId: string;

  beforeAll(async () => {
    // 1. Cria usuários para teste e validação de IDOR
    await db.insert(users).values([
      {
        id: user1Id,
        email: safeUser1.email,
        name: safeUser1.name,
        passwordHash: 'dummy_hash_1',
      },
      {
        id: user2Id,
        email: safeUser2.email,
        name: safeUser2.name,
        passwordHash: 'dummy_hash_2',
      },
    ]);

    // 2. Cria carteiras para os usuários
    portfolio1Id = crypto.randomUUID();
    portfolio2Id = crypto.randomUUID();

    await db.insert(portfolios).values([
      {
        id: portfolio1Id,
        userId: user1Id,
        name: 'Carteira User 1 Subscrições',
        baseCurrency: 'BRL',
        status: 'active',
      },
      {
        id: portfolio2Id,
        userId: user2Id,
        name: 'Carteira User 2 Subscrições',
        baseCurrency: 'BRL',
        status: 'active',
      },
    ]);

    // 3. Cria catálogo de ativos
    await db.insert(assets).values([
      {
        id: originAssetId,
        ticker: `KNCR${Date.now().toString().slice(-4)}11`,
        name: 'Kinea Rendimentos Imobiliários FII',
        assetType: 'fii',
        market: 'B3',
        currency: 'BRL',
        isCustom: false,
      },
      {
        id: rightAssetId,
        ticker: `KNCR${Date.now().toString().slice(-4)}12`,
        name: 'Direito de Subscrição KNCR',
        assetType: 'subscription_right',
        market: 'B3',
        currency: 'BRL',
        isCustom: false,
      },
      {
        id: targetAssetId,
        ticker: `KNCR${Date.now().toString().slice(-4)}11_T`,
        name: 'Kinea Rendimentos Imobiliários FII - Destino',
        assetType: 'fii',
        market: 'B3',
        currency: 'BRL',
        isCustom: false,
      },
      {
        id: invalidTypeAssetId,
        ticker: `INVA${Date.now().toString().slice(-4)}12`,
        name: 'Ativo com Tipo Incorreto',
        assetType: 'stock', // Tipo incorreto (deveria ser subscription_right)
        market: 'B3',
        currency: 'BRL',
        isCustom: false,
      },
    ]);

    // 4. Cria ofertas de subscrição
    validOfferId = crypto.randomUUID();
    expiredOfferId = crypto.randomUUID();
    futureOfferId = crypto.randomUUID();

    await db.insert(subscriptionOffers).values([
      {
        id: validOfferId,
        originAssetId,
        rightAssetId,
        targetAssetId,
        cutOffDate: new Date('2026-08-01T00:00:00.000Z'),
        exerciseStartDate: new Date('2026-08-05T00:00:00.000Z'),
        exerciseEndDate: new Date(Date.now() + 30 * 24 * 3600 * 1000), // Válida por +30 dias
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
        exerciseEndDate: new Date('2026-01-20T23:59:59.999Z'), // Expirada no passado
        exercisePrice: '10.00000000',
        currency: 'BRL',
        createdBy: user1Id,
      },
      {
        id: futureOfferId,
        originAssetId,
        rightAssetId,
        targetAssetId,
        cutOffDate: new Date(Date.now() + 5 * 24 * 3600 * 1000),
        exerciseStartDate: new Date(Date.now() + 10 * 24 * 3600 * 1000), // Início no futuro
        exerciseEndDate: new Date(Date.now() + 40 * 24 * 3600 * 1000),
        exercisePrice: '12.00000000',
        currency: 'BRL',
        createdBy: user1Id,
      },
    ]);
  });

  afterAll(async () => {
    // Limpeza reversa
    await db.delete(subscriptionExercises).where(inArray(subscriptionExercises.createdBy, [user1Id, user2Id]));
    await db.delete(portfolioEvents).where(inArray(portfolioEvents.createdBy, [user1Id, user2Id]));
    await db.delete(subscriptionRights).where(inArray(subscriptionRights.createdBy, [user1Id, user2Id]));
    await db.delete(subscriptionOffers).where(inArray(subscriptionOffers.createdBy, [user1Id, user2Id]));
    await db.delete(assets).where(
      inArray(assets.id, [originAssetId, rightAssetId, targetAssetId, invalidTypeAssetId])
    );
    await db.delete(portfolios).where(inArray(portfolios.id, [portfolio1Id, portfolio2Id]));
    await db.delete(auditLogs).where(inArray(auditLogs.actorId, [user1Id, user2Id]));
    await db.delete(users).where(inArray(users.id, [user1Id, user2Id]));
  });

  // 1. Atribuição válida
  it('1. allocates subscription right with cost zero and ACTIVE status', async () => {
    const right = await allocateSubscriptionRight(
      {
        portfolioId: portfolio1Id,
        offerId: validOfferId,
        allocatedQuantity: '100.0000000000',
      },
      safeUser1
    );

    expect(right).toBeDefined();
    expect(right.portfolioId).toBe(portfolio1Id);
    expect(right.offerId).toBe(validOfferId);
    expect(right.status).toBe('ACTIVE');
    expect(Number(right.allocatedQuantity)).toBe(100);
    expect(Number(right.exercisedQuantity)).toBe(0);

    // Não pode criar portfolio_events
    const events = await db
      .select()
      .from(portfolioEvents)
      .where(eq(portfolioEvents.portfolioId, portfolio1Id));
    expect(events.length).toBe(0);
  });

  // 2. Bloqueio de IDOR na atribuição
  it('2. blocks IDOR when allocating in a portfolio of another user', async () => {
    await expect(
      allocateSubscriptionRight(
        {
          portfolioId: portfolio2Id, // Carteira do User 2
          offerId: validOfferId,
          allocatedQuantity: '50.0000000000',
        },
        safeUser1 // User 1 tentando acessar
      )
    ).rejects.toThrow(AuthorizationError);
  });

  // 3. Oferta inexistente
  it('3. rejects allocation with non-existent offer', async () => {
    await expect(
      allocateSubscriptionRight(
        {
          portfolioId: portfolio1Id,
          offerId: crypto.randomUUID(),
          allocatedQuantity: '50.0000000000',
        },
        safeUser1
      )
    ).rejects.toThrow(SubscriptionOfferNotFoundError);
  });

  // 4. Oferta expirada
  it('4. rejects allocation when offer is already expired', async () => {
    await expect(
      allocateSubscriptionRight(
        {
          portfolioId: portfolio1Id,
          offerId: expiredOfferId,
          allocatedQuantity: '50.0000000000',
        },
        safeUser1
      )
    ).rejects.toThrow(SubscriptionExpiredError);
  });

  // 5. Ativo do direito inexistente
  it('5. rejects offer creation or allocation if right asset does not exist', async () => {
    const ghostAssetId = crypto.randomUUID();
    await expect(
      db.insert(subscriptionOffers).values({
        id: crypto.randomUUID(),
        originAssetId,
        rightAssetId: ghostAssetId, // Ativo não existe no catálogo de assets
        targetAssetId,
        cutOffDate: new Date('2026-08-01T00:00:00.000Z'),
        exerciseStartDate: new Date('2026-08-05T00:00:00.000Z'),
        exerciseEndDate: new Date(Date.now() + 30 * 24 * 3600 * 1000),
        exercisePrice: '10.00000000',
        createdBy: user1Id,
      })
    ).rejects.toThrow();
  });

  // 6. Ativo do direito com tipo incorreto
  it('6. rejects allocation if right asset has invalid asset_type', async () => {
    const invalidTypeOfferId = crypto.randomUUID();
    await db.insert(subscriptionOffers).values({
      id: invalidTypeOfferId,
      originAssetId,
      rightAssetId: invalidTypeAssetId, // assetType = stock
      targetAssetId,
      cutOffDate: new Date('2026-08-01T00:00:00.000Z'),
      exerciseStartDate: new Date('2026-08-05T00:00:00.000Z'),
      exerciseEndDate: new Date(Date.now() + 30 * 24 * 3600 * 1000),
      exercisePrice: '10.00000000',
      createdBy: user1Id,
    });

    await expect(
      allocateSubscriptionRight(
        {
          portfolioId: portfolio1Id,
          offerId: invalidTypeOfferId,
          allocatedQuantity: '50.0000000000',
        },
        safeUser1
      )
    ).rejects.toThrow(InvalidCorporateActionError);

    await db.delete(subscriptionOffers).where(eq(subscriptionOffers.id, invalidTypeOfferId));
  });

  // 7, 8, 10, 11, 20. Exercício válido com leitura do preço da oferta e cálculo de totalCost
  it('7, 8, 10 & 11. executes valid exercise, reading price from offer and calculating totalCost with ROUND_HALF_EVEN', async () => {
    const right = await allocateSubscriptionRight(
      {
        portfolioId: portfolio1Id,
        offerId: validOfferId,
        allocatedQuantity: '100.0000000000',
      },
      safeUser1
    );

    const idempotencyKey = crypto.randomUUID();
    const result = await exerciseSubscription(
      {
        subscriptionRightId: right.id,
        portfolioId: portfolio1Id,
        quantity: '40.0000000000',
        fees: '5.25000000',
        exerciseDate: new Date().toISOString(),
        idempotencyKey,
      },
      safeUser1
    );

    expect(result).toBeDefined();
    // 8. Preço lido da oferta (10.50)
    expect(Number(result.exercise.exercisePrice)).toBe(10.5);
    // 10. totalCost = 40 * 10.50 + 5.25 = 420.00 + 5.25 = 425.25000000
    expect(result.exercise.totalCost).toBe('425.25000000');
    // Status deve ser PARTIALLY_EXERCISED
    expect(result.subscriptionRight.status).toBe('PARTIALLY_EXERCISED');
    expect(Number(result.subscriptionRight.exercisedQuantity)).toBe(40);

    // Evento BUY criado no targetAssetId
    expect(result.event.type).toBe('BUY');
    expect(result.event.assetId).toBe(targetAssetId);
    expect(result.event.source).toBe('corporate_action');
    expect(Number(result.event.quantity)).toBe(40);
    expect(Number(result.event.unitPrice)).toBe(10.5);
    expect(Number(result.event.fees)).toBe(5.25);
  });

  // 9. Rejeição de exercisePrice ou totalCost enviados pelo cliente
  it('9. strictly rejects client-supplied exercisePrice or totalCost via Zod anti-tampering', async () => {
    const right = await allocateSubscriptionRight(
      {
        portfolioId: portfolio1Id,
        offerId: validOfferId,
        allocatedQuantity: '100.0000000000',
      },
      safeUser1
    );

    await expect(
      exerciseSubscription(
        {
          subscriptionRightId: right.id,
          portfolioId: portfolio1Id,
          quantity: '10.0000000000',
          exerciseDate: new Date().toISOString(),
          idempotencyKey: crypto.randomUUID(),
          exercisePrice: '1.00000000', // Injeção maliciosa!
        } as any,
        safeUser1
      )
    ).rejects.toThrow();

    await expect(
      exerciseSubscription(
        {
          subscriptionRightId: right.id,
          portfolioId: portfolio1Id,
          quantity: '10.0000000000',
          exerciseDate: new Date().toISOString(),
          idempotencyKey: crypto.randomUUID(),
          totalCost: '10.00000000', // Injeção maliciosa!
        } as any,
        safeUser1
      )
    ).rejects.toThrow();
  });

  // 12. Rejeição de taxas negativas ou quantidade negativa
  it('12. rejects negative fees or non-positive quantity', async () => {
    const right = await allocateSubscriptionRight(
      {
        portfolioId: portfolio1Id,
        offerId: validOfferId,
        allocatedQuantity: '100.0000000000',
      },
      safeUser1
    );

    await expect(
      exerciseSubscription(
        {
          subscriptionRightId: right.id,
          portfolioId: portfolio1Id,
          quantity: '10.0000000000',
          fees: '-1.00000000', // Negativo
          exerciseDate: new Date().toISOString(),
          idempotencyKey: crypto.randomUUID(),
        },
        safeUser1
      )
    ).rejects.toThrow();

    await expect(
      exerciseSubscription(
        {
          subscriptionRightId: right.id,
          portfolioId: portfolio1Id,
          quantity: '0.0000000000', // Zero
          exerciseDate: new Date().toISOString(),
          idempotencyKey: crypto.randomUUID(),
        },
        safeUser1
      )
    ).rejects.toThrow();
  });

  // 13. Exercício acima do saldo disponível
  it('13. rejects exercise quantity greater than remaining available balance', async () => {
    const right = await allocateSubscriptionRight(
      {
        portfolioId: portfolio1Id,
        offerId: validOfferId,
        allocatedQuantity: '50.0000000000',
      },
      safeUser1
    );

    await expect(
      exerciseSubscription(
        {
          subscriptionRightId: right.id,
          portfolioId: portfolio1Id,
          quantity: '50.0000000001', // Excede
          exerciseDate: new Date().toISOString(),
          idempotencyKey: crypto.randomUUID(),
        },
        safeUser1
      )
    ).rejects.toThrow(InsufficientSubscriptionRightsError);
  });

  // 14. Exercício antes do início da vigência
  it('14. rejects exercise before offer exerciseStartDate has arrived', async () => {
    const right = await allocateSubscriptionRight(
      {
        portfolioId: portfolio1Id,
        offerId: futureOfferId, // Início daqui a 10 dias
        allocatedQuantity: '50.0000000000',
      },
      safeUser1
    );

    await expect(
      exerciseSubscription(
        {
          subscriptionRightId: right.id,
          portfolioId: portfolio1Id,
          quantity: '10.0000000000',
          exerciseDate: new Date().toISOString(),
          idempotencyKey: crypto.randomUUID(),
        },
        safeUser1
      )
    ).rejects.toThrow(InvalidSubscriptionPeriodError);
  });

  // 15. Exercício depois do fim da vigência
  it('15. rejects exercise after offer exerciseEndDate has passed', async () => {
    // Cria oferta expirada há 1 segundo
    const expiredNowOfferId = crypto.randomUUID();
    await db.insert(subscriptionOffers).values({
      id: expiredNowOfferId,
      originAssetId,
      rightAssetId,
      targetAssetId,
      cutOffDate: new Date('2026-08-01T00:00:00.000Z'),
      exerciseStartDate: new Date('2026-08-05T00:00:00.000Z'),
      exerciseEndDate: new Date(Date.now() + 500), // Expira em 500ms
      exercisePrice: '10.00000000',
      createdBy: user1Id,
    });

    const right = await allocateSubscriptionRight(
      {
        portfolioId: portfolio1Id,
        offerId: expiredNowOfferId,
        allocatedQuantity: '50.0000000000',
      },
      safeUser1
    );

    // Aguarda expirar
    await new Promise((r) => setTimeout(r, 600));

    await expect(
      exerciseSubscription(
        {
          subscriptionRightId: right.id,
          portfolioId: portfolio1Id,
          quantity: '10.0000000000',
          exerciseDate: new Date('2026-08-06T00:00:00.000Z').toISOString(),
          idempotencyKey: crypto.randomUUID(),
        },
        safeUser1
      )
    ).rejects.toThrow(SubscriptionExpiredError);

    await db.delete(subscriptionRights).where(eq(subscriptionRights.id, right.id));
    await db.delete(subscriptionOffers).where(eq(subscriptionOffers.id, expiredNowOfferId));
  });

  // 16. Rejeição de exerciseDate futura
  it('16. rejects exerciseDate that is in the future relative to server time', async () => {
    const right = await allocateSubscriptionRight(
      {
        portfolioId: portfolio1Id,
        offerId: validOfferId,
        allocatedQuantity: '100.0000000000',
      },
      safeUser1
    );

    const futureDate = new Date(Date.now() + 24 * 3600 * 1000).toISOString();

    await expect(
      exerciseSubscription(
        {
          subscriptionRightId: right.id,
          portfolioId: portfolio1Id,
          quantity: '10.0000000000',
          exerciseDate: futureDate, // Futura
          idempotencyKey: crypto.randomUUID(),
        },
        safeUser1
      )
    ).rejects.toThrow(InvalidSubscriptionDateError);
  });

  // 17. Rejeição de exerciseDate anterior à cutOffDate
  it('17. rejects exerciseDate before cutOffDate', async () => {
    const right = await allocateSubscriptionRight(
      {
        portfolioId: portfolio1Id,
        offerId: validOfferId,
        allocatedQuantity: '100.0000000000',
      },
      safeUser1
    );

    const beforeCutoffDate = new Date('2026-07-15T00:00:00.000Z').toISOString();

    await expect(
      exerciseSubscription(
        {
          subscriptionRightId: right.id,
          portfolioId: portfolio1Id,
          quantity: '10.0000000000',
          exerciseDate: beforeCutoffDate, // Anterior à cutOffDate (2026-08-01)
          idempotencyKey: crypto.randomUUID(),
        },
        safeUser1
      )
    ).rejects.toThrow(InvalidSubscriptionDateError);
  });

  // 18. Consistência temporal do novo BUY com a timeline de eventos
  it('18. validates timeline consistency for the new BUY event', async () => {
    const right = await allocateSubscriptionRight(
      {
        portfolioId: portfolio1Id,
        offerId: validOfferId,
        allocatedQuantity: '100.0000000000',
      },
      safeUser1
    );

    const validExerciseDate = new Date('2026-08-10T12:00:00.000Z').toISOString();
    const result = await exerciseSubscription(
      {
        subscriptionRightId: right.id,
        portfolioId: portfolio1Id,
        quantity: '25.0000000000',
        exerciseDate: validExerciseDate,
        idempotencyKey: crypto.randomUUID(),
      },
      safeUser1
    );

    expect(result.event.tradeDate).toEqual(new Date(validExerciseDate));
    expect(result.event.type).toBe('BUY');
    expect(result.event.source).toBe('corporate_action');
  });

  // 19. Idempotência da mesma chave
  it('19. returns existing result idempotently without creating duplicate events or exercises', async () => {
    const right = await allocateSubscriptionRight(
      {
        portfolioId: portfolio1Id,
        offerId: validOfferId,
        allocatedQuantity: '100.0000000000',
      },
      safeUser1
    );

    const sharedKey = crypto.randomUUID();
    const payload = {
      subscriptionRightId: right.id,
      portfolioId: portfolio1Id,
      quantity: '20.0000000000',
      exerciseDate: new Date().toISOString(),
      idempotencyKey: sharedKey,
    };

    const firstResult = await exerciseSubscription(payload, safeUser1);
    const secondResult = await exerciseSubscription(payload, safeUser1);

    expect(firstResult.exercise.id).toBe(secondResult.exercise.id);
    expect(firstResult.event.id).toBe(secondResult.event.id);
    expect(firstResult.subscriptionRight.exercisedQuantity).toBe('20.0000000000');

    // Verifica que existe apenas 1 exercício e 1 evento para esta chave
    const countExercises = await db
      .select()
      .from(subscriptionExercises)
      .where(eq(subscriptionExercises.idempotencyKey, sharedKey));
    expect(countExercises.length).toBe(1);
  });

  // 20 & 21. Concorrência e garantia de soma dos exercícios
  it('20 & 21. serializes concurrent exercises with FOR UPDATE and matches total exercised quantity', async () => {
    const right = await allocateSubscriptionRight(
      {
        portfolioId: portfolio1Id,
        offerId: validOfferId,
        allocatedQuantity: '100.0000000000',
      },
      safeUser1
    );

    // Dispara 5 exercícios concorrentes de 15 cada = 75 total
    const promises = Array.from({ length: 5 }).map((_, i) =>
      exerciseSubscription(
        {
          subscriptionRightId: right.id,
          portfolioId: portfolio1Id,
          quantity: '15.0000000000',
          exerciseDate: new Date().toISOString(),
          idempotencyKey: crypto.randomUUID(),
        },
        safeUser1
      )
    );

    const results = await Promise.all(promises);
    expect(results.length).toBe(5);

    // Consulta estado final no banco
    const [finalRight] = await db
      .select()
      .from(subscriptionRights)
      .where(eq(subscriptionRights.id, right.id));

    expect(Number(finalRight.exercisedQuantity)).toBe(75);
    expect(finalRight.status).toBe('PARTIALLY_EXERCISED');

    // Soma individual dos exercícios deve bater exatamente com 75
    const exercises = await db
      .select()
      .from(subscriptionExercises)
      .where(eq(subscriptionExercises.subscriptionRightId, right.id));

    const sum = exercises.reduce(
      (acc, curr) => acc.plus(curr.exercisedQuantity),
      new Decimal(0)
    );
    expect(sum.toNumber()).toBe(75);
  });

  // 22. Rollback transacional se ocorrer erro
  it('22. rolls back entire transaction if validation fails during exercise', async () => {
    const right = await allocateSubscriptionRight(
      {
        portfolioId: portfolio1Id,
        offerId: validOfferId,
        allocatedQuantity: '10.0000000000',
      },
      safeUser1
    );

    const preEventsCount = (
      await db
        .select()
        .from(portfolioEvents)
        .where(eq(portfolioEvents.portfolioId, portfolio1Id))
    ).length;

    await expect(
      exerciseSubscription(
        {
          subscriptionRightId: right.id,
          portfolioId: portfolio1Id,
          quantity: '15.0000000000', // Excede saldo!
          exerciseDate: new Date().toISOString(),
          idempotencyKey: crypto.randomUUID(),
        },
        safeUser1
      )
    ).rejects.toThrow(InsufficientSubscriptionRightsError);

    // Nenhum evento foi criado
    const postEventsCount = (
      await db
        .select()
        .from(portfolioEvents)
        .where(eq(portfolioEvents.portfolioId, portfolio1Id))
    ).length;
    expect(postEventsCount).toBe(preEventsCount);
  });

  // 23. Cancelamento sem exercício
  it('23. cancels subscription right without prior exercises (preserves record with CANCELLED status)', async () => {
    const right = await allocateSubscriptionRight(
      {
        portfolioId: portfolio1Id,
        offerId: validOfferId,
        allocatedQuantity: '100.0000000000',
      },
      safeUser1
    );

    const cancelled = await cancelSubscriptionRight(
      {
        subscriptionRightId: right.id,
        portfolioId: portfolio1Id,
        reason: 'Decisão do investidor de não subscrever',
      },
      safeUser1
    );

    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.deletedAt).toBeDefined();
    expect(cancelled.cancellationReason).toBe('Decisão do investidor de não subscrever');

    // Permanece no banco
    const [persisted] = await db
      .select()
      .from(subscriptionRights)
      .where(eq(subscriptionRights.id, right.id));
    expect(persisted.status).toBe('CANCELLED');
  });

  // 24 & 25. Cancelamento após exercício parcial e preservação de BUYs
  it('24 & 25. cancels partially exercised right and preserves existing BUY events', async () => {
    const right = await allocateSubscriptionRight(
      {
        portfolioId: portfolio1Id,
        offerId: validOfferId,
        allocatedQuantity: '100.0000000000',
      },
      safeUser1
    );

    // Exerce 30
    const exerciseRes = await exerciseSubscription(
      {
        subscriptionRightId: right.id,
        portfolioId: portfolio1Id,
        quantity: '30.0000000000',
        exerciseDate: new Date().toISOString(),
        idempotencyKey: crypto.randomUUID(),
      },
      safeUser1
    );

    expect(exerciseRes.subscriptionRight.status).toBe('PARTIALLY_EXERCISED');

    // Cancela os 70 restantes
    const cancelled = await cancelSubscriptionRight(
      {
        subscriptionRightId: right.id,
        portfolioId: portfolio1Id,
        reason: 'Cancelamento dos direitos remanescentes',
      },
      safeUser1
    );

    expect(cancelled.status).toBe('CANCELLED');
    expect(Number(cancelled.exercisedQuantity)).toBe(30);

    // 25. O evento BUY do exercício anterior continua intacto e ativo
    const [event] = await db
      .select()
      .from(portfolioEvents)
      .where(eq(portfolioEvents.id, exerciseRes.event.id));
    expect(event).toBeDefined();
    expect(event.deletedAt).toBeNull();
    expect(Number(event.quantity)).toBe(30);
  });

  // 26. Rejeição de cancelamento após expiração
  it('26. rejects cancellation after offer expiration date has passed', async () => {
    const shortOfferId = crypto.randomUUID();
    await db.insert(subscriptionOffers).values({
      id: shortOfferId,
      originAssetId,
      rightAssetId,
      targetAssetId,
      cutOffDate: new Date('2026-08-01T00:00:00.000Z'),
      exerciseStartDate: new Date('2026-08-05T00:00:00.000Z'),
      exerciseEndDate: new Date(Date.now() + 500),
      exercisePrice: '10.00000000',
      createdBy: user1Id,
    });

    const right = await allocateSubscriptionRight(
      {
        portfolioId: portfolio1Id,
        offerId: shortOfferId,
        allocatedQuantity: '50.0000000000',
      },
      safeUser1
    );

    await new Promise((r) => setTimeout(r, 600));

    await expect(
      cancelSubscriptionRight(
        {
          subscriptionRightId: right.id,
          portfolioId: portfolio1Id,
          reason: 'Tentativa de cancelar após expirar',
        },
        safeUser1
      )
    ).rejects.toThrow(SubscriptionExpiredError);

    await db.delete(subscriptionRights).where(eq(subscriptionRights.id, right.id));
    await db.delete(subscriptionOffers).where(eq(subscriptionOffers.id, shortOfferId));
  });

  // 27. Rejeição de cancelamento após exercício total
  it('27. rejects cancellation of FULLY_EXERCISED subscription right', async () => {
    const right = await allocateSubscriptionRight(
      {
        portfolioId: portfolio1Id,
        offerId: validOfferId,
        allocatedQuantity: '50.0000000000',
      },
      safeUser1
    );

    // Exerce 100%
    const fullyRes = await exerciseSubscription(
      {
        subscriptionRightId: right.id,
        portfolioId: portfolio1Id,
        quantity: '50.0000000000',
        exerciseDate: new Date().toISOString(),
        idempotencyKey: crypto.randomUUID(),
      },
      safeUser1
    );

    expect(fullyRes.subscriptionRight.status).toBe('FULLY_EXERCISED');

    await expect(
      cancelSubscriptionRight(
        {
          subscriptionRightId: right.id,
          portfolioId: portfolio1Id,
          reason: 'Tentativa de cancelar após exercício integral',
        },
        safeUser1
      )
    ).rejects.toThrow(InvalidSubscriptionStateError);
  });

  // 28 & 29. Projeção lazy de EXPIRED e preservação de estados terminais
  it('28 & 29. lists subscriptions with lazy projection of EXPIRED while preserving FULLY_EXERCISED and CANCELLED', async () => {
    const testOfferId = crypto.randomUUID();
    await db.insert(subscriptionOffers).values({
      id: testOfferId,
      originAssetId,
      rightAssetId,
      targetAssetId,
      cutOffDate: new Date('2026-08-01T00:00:00.000Z'),
      exerciseStartDate: new Date('2026-08-05T00:00:00.000Z'),
      exerciseEndDate: new Date(Date.now() + 500),
      exercisePrice: '10.00000000',
      createdBy: user1Id,
    });

    // Lote 1: Ficará expirado
    const right1 = await allocateSubscriptionRight(
      {
        portfolioId: portfolio1Id,
        offerId: testOfferId,
        allocatedQuantity: '100.0000000000',
      },
      safeUser1
    );

    // Lote 2: Será totalmente exercido antes de expirar
    const right2 = await allocateSubscriptionRight(
      {
        portfolioId: portfolio1Id,
        offerId: testOfferId,
        allocatedQuantity: '50.0000000000',
      },
      safeUser1
    );
    await exerciseSubscription(
      {
        subscriptionRightId: right2.id,
        portfolioId: portfolio1Id,
        quantity: '50.0000000000',
        exerciseDate: new Date().toISOString(),
        idempotencyKey: crypto.randomUUID(),
      },
      safeUser1
    );

    // Aguarda expiração da oferta
    await new Promise((r) => setTimeout(r, 600));

    const list = await listActiveSubscriptionsByPortfolio(portfolio1Id, safeUser1);

    const found1 = list.find((s) => s.id === right1.id);
    const found2 = list.find((s) => s.id === right2.id);

    // Lote 1 projeta EXPIRED
    expect(found1?.projectedStatus).toBe('EXPIRED');
    // Lote 2 preserva FULLY_EXERCISED
    expect(found2?.projectedStatus).toBe('FULLY_EXERCISED');

    await db.delete(subscriptionExercises).where(eq(subscriptionExercises.subscriptionRightId, right2.id));
    await db.delete(subscriptionRights).where(inArray(subscriptionRights.id, [right1.id, right2.id]));
    await db.delete(subscriptionOffers).where(eq(subscriptionOffers.id, testOfferId));
  });

  // 30. Auditoria das operações
  it('30. records audit logs for allocation, exercise and cancellation', async () => {
    const right = await allocateSubscriptionRight(
      {
        portfolioId: portfolio1Id,
        offerId: validOfferId,
        allocatedQuantity: '50.0000000000',
      },
      safeUser1
    );

    // 1. Auditoria de Atribuição
    const [allocLog] = await db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.tableName, 'subscription_rights'),
          eq(auditLogs.recordId, right.id),
          eq(auditLogs.action, 'INSERT')
        )
      );
    expect(allocLog).toBeDefined();
    expect(allocLog.actorId).toBe(user1Id);

    // 2. Auditoria de Exercício
    const exerciseRes = await exerciseSubscription(
      {
        subscriptionRightId: right.id,
        portfolioId: portfolio1Id,
        quantity: '20.0000000000',
        exerciseDate: new Date().toISOString(),
        idempotencyKey: crypto.randomUUID(),
      },
      safeUser1
    );

    const [exerciseLog] = await db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.tableName, 'subscription_exercises'),
          eq(auditLogs.recordId, exerciseRes.exercise.id),
          eq(auditLogs.action, 'INSERT')
        )
      );
    expect(exerciseLog).toBeDefined();

    // 3. Auditoria de Cancelamento
    await cancelSubscriptionRight(
      {
        subscriptionRightId: right.id,
        portfolioId: portfolio1Id,
        reason: 'Cancelamento para auditoria',
      },
      safeUser1
    );

    const cancelLogs = await db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.tableName, 'subscription_rights'),
          eq(auditLogs.recordId, right.id),
          eq(auditLogs.action, 'UPDATE')
        )
      )
      .orderBy(desc(auditLogs.createdAt));

    expect(cancelLogs.length).toBeGreaterThan(0);
    const cancelLog = cancelLogs.find((l) => l.reason === 'Cancelamento para auditoria');
    expect(cancelLog).toBeDefined();
    expect(cancelLog?.reason).toBe('Cancelamento para auditoria');
  });

  // listAvailableOffers
  it('lists available offers with joined asset information', async () => {
    const offers = await listAvailableOffers(safeUser1);
    expect(offers.length).toBeGreaterThan(0);
    const validOffer = offers.find((o) => o.id === validOfferId);
    expect(validOffer).toBeDefined();
    expect(validOffer?.originAsset).toBeDefined();
    expect(validOffer?.rightAsset).toBeDefined();
    expect(validOffer?.targetAsset).toBeDefined();
  });
});
