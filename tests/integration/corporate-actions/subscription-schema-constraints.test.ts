import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { db } from '../../../src/lib/db';
import { users } from '../../../src/lib/db/schema/identity';
import { portfolios, assets, portfolioEvents } from '../../../src/lib/db/schema/portfolio';
import {
  subscriptionOffers,
  subscriptionRights,
  subscriptionExercises,
} from '../../../src/lib/db/schema/subscription';
import { eq, inArray } from 'drizzle-orm';
import crypto from 'node:crypto';

async function expectDbError(promise: Promise<unknown>, pattern: RegExp) {
  try {
    await promise;
    expect.unreachable('Deveria ter lançado erro de restrição no PostgreSQL');
  } catch (err: any) {
    const errorDetails = [
      err?.message,
      err?.cause?.message,
      err?.cause?.constraint,
      err?.cause?.constraint_name,
      err?.cause?.detail,
    ]
      .filter(Boolean)
      .join(' ');

    expect(errorDetails).toMatch(pattern);
  }
}

describe('Integração: Constraints Físicas e Integridade de Schema de Subscrição', () => {
  const userId = crypto.randomUUID();
  const portfolioId = crypto.randomUUID();
  const originAssetId = crypto.randomUUID();
  const rightAssetId = crypto.randomUUID();
  const targetAssetId = crypto.randomUUID();
  let defaultOfferId: string;

  beforeAll(async () => {
    // 1. Cria usuário base
    await db.insert(users).values({
      id: userId,
      email: `sub_schema_user_${Date.now()}@carteiraexpert.test`,
      name: 'Subscription Schema Test User',
      passwordHash: 'dummy_hash',
    });

    // 2. Cria carteira base
    await db.insert(portfolios).values({
      id: portfolioId,
      userId,
      name: 'Carteira Teste Subscrições',
      baseCurrency: 'BRL',
      status: 'active',
    });

    // 3. Cria ativos originador (fii), direito (subscription_right) e destino (fii)
    await db.insert(assets).values([
      {
        id: originAssetId,
        ticker: `ORIG${Date.now().toString().slice(-4)}11`,
        name: 'Fundo Originador FII',
        assetType: 'fii',
        market: 'B3',
        currency: 'BRL',
        isCustom: false,
      },
      {
        id: rightAssetId,
        ticker: `ORIG${Date.now().toString().slice(-4)}12`,
        name: 'Direito de Subscrição FII',
        assetType: 'subscription_right',
        market: 'B3',
        currency: 'BRL',
        isCustom: false,
      },
      {
        id: targetAssetId,
        ticker: `ORIG${Date.now().toString().slice(-4)}11_T`,
        name: 'Fundo Destino FII',
        assetType: 'fii',
        market: 'B3',
        currency: 'BRL',
        isCustom: false,
      },
    ]);

    // 4. Cria oferta padrão
    defaultOfferId = crypto.randomUUID();
    await db.insert(subscriptionOffers).values({
      id: defaultOfferId,
      originAssetId,
      rightAssetId,
      targetAssetId,
      cutOffDate: new Date('2026-08-01T00:00:00.000Z'),
      exerciseStartDate: new Date('2026-08-05T00:00:00.000Z'),
      exerciseEndDate: new Date('2026-08-25T23:59:59.999Z'),
      exercisePrice: '10.50000000',
      currency: 'BRL',
      createdBy: userId,
    });
  });

  afterAll(async () => {
    // Limpeza em cascata reversa
    await db.delete(subscriptionExercises).where(eq(subscriptionExercises.createdBy, userId));
    await db.delete(portfolioEvents).where(eq(portfolioEvents.createdBy, userId));
    await db.delete(subscriptionRights).where(eq(subscriptionRights.createdBy, userId));
    await db.delete(subscriptionOffers).where(eq(subscriptionOffers.createdBy, userId));
    await db.delete(assets).where(
      inArray(assets.id, [originAssetId, rightAssetId, targetAssetId])
    );
    await db.delete(portfolios).where(eq(portfolios.id, portfolioId));
    await db.delete(users).where(eq(users.id, userId));
  });

  // 1 & 4. Criação física e asset_type = subscription_right
  it('1 & 4. allows creating an asset with asset_type = "subscription_right"', async () => {
    const assetCheck = await db
      .select()
      .from(assets)
      .where(eq(assets.id, rightAssetId));
    expect(assetCheck.length).toBe(1);
    expect(assetCheck[0].assetType).toBe('subscription_right');
  });

  // 2. FKs obrigatórias e 13. Nulidade de colunas críticas
  it('2 & 13. enforces foreign keys on subscription_offers (rejects non-existent asset)', async () => {
    await expectDbError(
      db.insert(subscriptionOffers).values({
        id: crypto.randomUUID(),
        originAssetId: crypto.randomUUID(), // Não existe!
        rightAssetId,
        targetAssetId,
        cutOffDate: new Date(),
        exerciseStartDate: new Date(),
        exerciseEndDate: new Date(),
        exercisePrice: '10.00000000',
        createdBy: userId,
      }),
      /violates foreign key constraint|subscription_offers_origin_asset_id_assets_id_fk/i
    );
  });

  // 7. Preço zero aceito em subscription_offers
  it('7. allows zero exercise price in subscription_offers', async () => {
    const zeroPriceOfferId = crypto.randomUUID();
    await db.insert(subscriptionOffers).values({
      id: zeroPriceOfferId,
      originAssetId,
      rightAssetId,
      targetAssetId,
      cutOffDate: new Date('2026-08-01T00:00:00.000Z'),
      exerciseStartDate: new Date('2026-08-05T00:00:00.000Z'),
      exerciseEndDate: new Date('2026-08-25T23:59:59.999Z'),
      exercisePrice: '0.00000000',
      createdBy: userId,
    });

    const inserted = await db
      .select()
      .from(subscriptionOffers)
      .where(eq(subscriptionOffers.id, zeroPriceOfferId));
    expect(inserted.length).toBe(1);
    expect(Number(inserted[0].exercisePrice)).toBe(0);

    await db.delete(subscriptionOffers).where(eq(subscriptionOffers.id, zeroPriceOfferId));
  });

  // 8. Preço negativo rejeitado
  it('8. rejects negative exercise_price via chk_subscription_offers_price', async () => {
    await expectDbError(
      db.insert(subscriptionOffers).values({
        id: crypto.randomUUID(),
        originAssetId,
        rightAssetId,
        targetAssetId,
        cutOffDate: new Date(),
        exerciseStartDate: new Date(),
        exerciseEndDate: new Date(),
        exercisePrice: '-0.00000001',
        createdBy: userId,
      }),
      /chk_subscription_offers_price|violates check constraint/i
    );
  });

  // Data de início posterior à data final rejeitada
  it('enforces exercise_start_date <= exercise_end_date via chk_subscription_offers_dates', async () => {
    await expectDbError(
      db.insert(subscriptionOffers).values({
        id: crypto.randomUUID(),
        originAssetId,
        rightAssetId,
        targetAssetId,
        cutOffDate: new Date('2026-08-01T00:00:00.000Z'),
        exerciseStartDate: new Date('2026-08-20T00:00:00.000Z'),
        exerciseEndDate: new Date('2026-08-10T00:00:00.000Z'), // Anterior!
        exercisePrice: '10.00000000',
        createdBy: userId,
      }),
      /chk_subscription_offers_dates|violates check constraint/i
    );
  });

  // 5. Statuses válidos e inválidos em subscription_rights
  it('5. allows valid statuses and rejects invalid status in subscription_rights', async () => {
    const rightId = crypto.randomUUID();
    await db.insert(subscriptionRights).values({
      id: rightId,
      portfolioId,
      offerId: defaultOfferId,
      status: 'ACTIVE',
      allocatedQuantity: '100.0000000000',
      createdBy: userId,
    });

    // Atualiza para outros status válidos
    for (const validStatus of [
      'PARTIALLY_EXERCISED',
      'FULLY_EXERCISED',
      'EXPIRED',
      'CANCELLED',
    ]) {
      await db
        .update(subscriptionRights)
        .set({ status: validStatus })
        .where(eq(subscriptionRights.id, rightId));
    }

    // Rejeita status inválido
    await expectDbError(
      db
        .update(subscriptionRights)
        .set({ status: 'INVALID_STATUS' })
        .where(eq(subscriptionRights.id, rightId)),
      /chk_subscription_rights_status|violates check constraint/i
    );

    await db.delete(subscriptionRights).where(eq(subscriptionRights.id, rightId));
  });

  // 6. Quantidades inválidas em subscription_rights
  it('6a. rejects allocated_quantity <= 0 via chk_subscription_rights_allocated_quantity', async () => {
    await expectDbError(
      db.insert(subscriptionRights).values({
        id: crypto.randomUUID(),
        portfolioId,
        offerId: defaultOfferId,
        status: 'ACTIVE',
        allocatedQuantity: '0.0000000000',
        createdBy: userId,
      }),
      /chk_subscription_rights_allocated_quantity|violates check constraint/i
    );
  });

  it('6b. rejects exercised_quantity > allocated_quantity via chk_subscription_rights_exercised_quantity', async () => {
    await expectDbError(
      db.insert(subscriptionRights).values({
        id: crypto.randomUUID(),
        portfolioId,
        offerId: defaultOfferId,
        status: 'ACTIVE',
        allocatedQuantity: '50.0000000000',
        exercisedQuantity: '50.0000000001',
        createdBy: userId,
      }),
      /chk_subscription_rights_exercised_quantity|violates check constraint/i
    );
  });

  // 9. Taxas negativas rejeitadas e 10. Custo total negativo rejeitado em subscription_exercises
  it('9 & 10. rejects negative fees and negative total_cost in subscription_exercises', async () => {
    const rightId = crypto.randomUUID();
    await db.insert(subscriptionRights).values({
      id: rightId,
      portfolioId,
      offerId: defaultOfferId,
      status: 'ACTIVE',
      allocatedQuantity: '100.0000000000',
      createdBy: userId,
    });

    const eventId = crypto.randomUUID();
    await db.insert(portfolioEvents).values({
      id: eventId,
      portfolioId,
      assetId: targetAssetId,
      type: 'BUY',
      tradeDate: new Date(),
      quantity: '10.0000000000',
      unitPrice: '10.50000000',
      fees: '0.00000000',
      source: 'corporate_action',
      createdBy: userId,
    });

    // Rejeita taxas negativas
    await expectDbError(
      db.insert(subscriptionExercises).values({
        id: crypto.randomUUID(),
        subscriptionRightId: rightId,
        portfolioEventId: eventId,
        idempotencyKey: crypto.randomUUID(),
        exercisedQuantity: '10.0000000000',
        exercisePrice: '10.50000000',
        fees: '-1.00000000',
        totalCost: '105.00000000',
        exerciseDate: new Date(),
        createdBy: userId,
      }),
      /chk_subscription_exercises_fees|violates check constraint/i
    );

    // Rejeita total_cost negativo
    await expectDbError(
      db.insert(subscriptionExercises).values({
        id: crypto.randomUUID(),
        subscriptionRightId: rightId,
        portfolioEventId: eventId,
        idempotencyKey: crypto.randomUUID(),
        exercisedQuantity: '10.0000000000',
        exercisePrice: '10.50000000',
        fees: '0.00000000',
        totalCost: '-105.00000000',
        exerciseDate: new Date(),
        createdBy: userId,
      }),
      /chk_subscription_exercises_total_cost|violates check constraint/i
    );

    await db.delete(portfolioEvents).where(eq(portfolioEvents.id, eventId));
    await db.delete(subscriptionRights).where(eq(subscriptionRights.id, rightId));
  });

  // 12. Unicidade de (subscription_right_id, idempotency_key)
  it('12. enforces uniqueness of (subscription_right_id, idempotency_key)', async () => {
    const rightId = crypto.randomUUID();
    await db.insert(subscriptionRights).values({
      id: rightId,
      portfolioId,
      offerId: defaultOfferId,
      status: 'ACTIVE',
      allocatedQuantity: '100.0000000000',
      createdBy: userId,
    });

    const event1Id = crypto.randomUUID();
    const event2Id = crypto.randomUUID();
    await db.insert(portfolioEvents).values([
      {
        id: event1Id,
        portfolioId,
        assetId: targetAssetId,
        type: 'BUY',
        tradeDate: new Date(),
        quantity: '10.0000000000',
        unitPrice: '10.50000000',
        fees: '0.00000000',
        source: 'corporate_action',
        createdBy: userId,
      },
      {
        id: event2Id,
        portfolioId,
        assetId: targetAssetId,
        type: 'BUY',
        tradeDate: new Date(),
        quantity: '10.0000000000',
        unitPrice: '10.50000000',
        fees: '0.00000000',
        source: 'corporate_action',
        createdBy: userId,
      },
    ]);

    const sharedIdempotencyKey = crypto.randomUUID();

    // Primeiro insert com a chave de idempotência é bem-sucedido
    await db.insert(subscriptionExercises).values({
      id: crypto.randomUUID(),
      subscriptionRightId: rightId,
      portfolioEventId: event1Id,
      idempotencyKey: sharedIdempotencyKey,
      exercisedQuantity: '10.0000000000',
      exercisePrice: '10.50000000',
      fees: '0.00000000',
      totalCost: '105.00000000',
      exerciseDate: new Date(),
      createdBy: userId,
    });

    // Segundo insert com a MESMA chave para o MESMO right_id deve falhar
    await expectDbError(
      db.insert(subscriptionExercises).values({
        id: crypto.randomUUID(),
        subscriptionRightId: rightId,
        portfolioEventId: event2Id,
        idempotencyKey: sharedIdempotencyKey,
        exercisedQuantity: '10.0000000000',
        exercisePrice: '10.50000000',
        fees: '0.00000000',
        totalCost: '105.00000000',
        exerciseDate: new Date(),
        createdBy: userId,
      }),
      /uq_subscription_exercises_idempotency|violates unique constraint/i
    );

    await db.delete(subscriptionExercises).where(eq(subscriptionExercises.subscriptionRightId, rightId));
    await db.delete(portfolioEvents).where(inArray(portfolioEvents.id, [event1Id, event2Id]));
    await db.delete(subscriptionRights).where(eq(subscriptionRights.id, rightId));
  });

  // 14. Impossibilidade de excluir oferta referenciada (ON DELETE RESTRICT)
  it('14. prevents deleting an offer referenced by a subscription_right (ON DELETE RESTRICT)', async () => {
    const rightId = crypto.randomUUID();
    await db.insert(subscriptionRights).values({
      id: rightId,
      portfolioId,
      offerId: defaultOfferId,
      status: 'ACTIVE',
      allocatedQuantity: '100.0000000000',
      createdBy: userId,
    });

    await expectDbError(
      db.delete(subscriptionOffers).where(eq(subscriptionOffers.id, defaultOfferId)),
      /(foreign key|chave estrangeira|violates|viola)/i
    );

    await db.delete(subscriptionRights).where(eq(subscriptionRights.id, rightId));
  });

  // 15 & 16. Impossibilidade de excluir direito ou evento referenciado por exercício (ON DELETE RESTRICT)
  it('15 & 16. prevents deleting subscription_right or portfolio_event referenced by subscription_exercise', async () => {
    const rightId = crypto.randomUUID();
    await db.insert(subscriptionRights).values({
      id: rightId,
      portfolioId,
      offerId: defaultOfferId,
      status: 'ACTIVE',
      allocatedQuantity: '100.0000000000',
      createdBy: userId,
    });

    const eventId = crypto.randomUUID();
    await db.insert(portfolioEvents).values({
      id: eventId,
      portfolioId,
      assetId: targetAssetId,
      type: 'BUY',
      tradeDate: new Date(),
      quantity: '10.0000000000',
      unitPrice: '10.50000000',
      fees: '0.00000000',
      source: 'corporate_action',
      createdBy: userId,
    });

    const exerciseId = crypto.randomUUID();
    await db.insert(subscriptionExercises).values({
      id: exerciseId,
      subscriptionRightId: rightId,
      portfolioEventId: eventId,
      idempotencyKey: crypto.randomUUID(),
      exercisedQuantity: '10.0000000000',
      exercisePrice: '10.50000000',
      fees: '0.00000000',
      totalCost: '105.00000000',
      exerciseDate: new Date(),
      createdBy: userId,
    });

    // 15. Tentar excluir subscription_rights falha
    await expectDbError(
      db.delete(subscriptionRights).where(eq(subscriptionRights.id, rightId)),
      /(foreign key|chave estrangeira|violates|viola)/i
    );

    // 16. Tentar excluir portfolio_events falha
    await expectDbError(
      db.delete(portfolioEvents).where(eq(portfolioEvents.id, eventId)),
      /(foreign key|chave estrangeira|violates|viola)/i
    );

    await db.delete(subscriptionExercises).where(eq(subscriptionExercises.id, exerciseId));
    await db.delete(portfolioEvents).where(eq(portfolioEvents.id, eventId));
    await db.delete(subscriptionRights).where(eq(subscriptionRights.id, rightId));
  });
});
