import crypto from 'node:crypto';
import { z } from 'zod';
import Decimal from 'decimal.js';
import { eq, and, isNull, desc } from 'drizzle-orm';
import { db, type Database, type DatabaseTransaction, type DbExecutor } from '@/lib/db';
import { insertAuditLog } from '@/lib/db/audit';
import {
  portfolios,
  portfolioEvents,
  subscriptionOffers,
  subscriptionRights,
  subscriptionExercises,
  assets,
} from '@/lib/db/schema';
import { getPortfolioById } from '@/modules/portfolio/server/portfolio.service';
import { getAssetById } from '@/modules/portfolio/server/asset.service';
import {
  validateTimelineConsistency,
  type TimelineEvent,
} from '@/modules/portfolio/domain/position-engine';
import type { SafeUser } from '@/modules/identity/domain/user.types';
import {
  allocateSubscriptionRightSchema,
  exerciseSubscriptionInputSchema,
  cancelSubscriptionRightSchema,
  type AllocateSubscriptionRightInput,
  type ExerciseSubscriptionInput,
  type CancelSubscriptionRightInput,
  type SubscriptionStatus,
  type SubscriptionOffer,
  type SubscriptionRight,
  type SubscriptionExercise,
  type PortfolioEvent,
  assertExercisePeriod,
  assertExerciseDate,
  calculateRemainingQuantity,
  quantizeTotalCost,
  evaluateSubscriptionStatus,
  InvalidCorporateActionError,
  InvalidSubscriptionStateError,
  SubscriptionOfferNotFoundError,
  SubscriptionExpiredError,
  InsufficientSubscriptionRightsError,
} from '../domain';

// ─── Tipos Auxiliares de Consulta ─────────────────────────────────────────────

export interface SubscriptionOfferWithAssets extends SubscriptionOffer {
  originAsset: { id: string; ticker: string; name: string; assetType: string; currency: string };
  rightAsset: { id: string; ticker: string; name: string; assetType: string; currency: string };
  targetAsset: { id: string; ticker: string; name: string; assetType: string; currency: string };
}

export interface SubscriptionRightWithOfferAndAssets extends SubscriptionRight {
  offer: SubscriptionOfferWithAssets;
  projectedStatus: SubscriptionStatus;
  remainingQuantity: string;
}

export type RawAllocateSubscriptionRightInput = z.input<typeof allocateSubscriptionRightSchema>;
export type RawExerciseSubscriptionInput = z.input<typeof exerciseSubscriptionInputSchema>;
export type RawCancelSubscriptionRightInput = z.input<typeof cancelSubscriptionRightSchema>;

// ─── 1. listAvailableOffers ───────────────────────────────────────────────────

/**
 * Lista todas as ofertas de subscrição cadastradas no sistema com os dados de seus ativos.
 * Permite ao usuário autenticado consultar ofertas válidas para seleção.
 */
export async function listAvailableOffers(
  _user: SafeUser,
  executor: DbExecutor = db
): Promise<SubscriptionOfferWithAssets[]> {
  const rows = await executor
    .select({
      offer: subscriptionOffers,
      originAsset: {
        id: assets.id,
        ticker: assets.ticker,
        name: assets.name,
        assetType: assets.assetType,
        currency: assets.currency,
      },
    })
    .from(subscriptionOffers)
    .innerJoin(assets, eq(subscriptionOffers.originAssetId, assets.id))
    .orderBy(desc(subscriptionOffers.createdAt));

  // Enriquecer com os ativos de direito e destino
  const results: SubscriptionOfferWithAssets[] = [];
  for (const row of rows) {
    const [rightAsset] = await executor
      .select({
        id: assets.id,
        ticker: assets.ticker,
        name: assets.name,
        assetType: assets.assetType,
        currency: assets.currency,
      })
      .from(assets)
      .where(eq(assets.id, row.offer.rightAssetId))
      .limit(1);

    const [targetAsset] = await executor
      .select({
        id: assets.id,
        ticker: assets.ticker,
        name: assets.name,
        assetType: assets.assetType,
        currency: assets.currency,
      })
      .from(assets)
      .where(eq(assets.id, row.offer.targetAssetId))
      .limit(1);

    if (rightAsset && targetAsset) {
      results.push({
        ...row.offer,
        originAsset: row.originAsset,
        rightAsset,
        targetAsset,
      });
    }
  }

  return results;
}

// ─── 2. allocateSubscriptionRight ─────────────────────────────────────────────

/**
 * Operação transacional de atribuição de lote de direitos de subscrição a uma carteira.
 * A quantidade atribuída é informada diretamente pelo usuário conforme informe oficial.
 * Custo contábil e financeiro da atribuição é ZERO. Não gera evento em portfolio_events.
 */
export async function allocateSubscriptionRightInTransaction(
  rawInput: AllocateSubscriptionRightInput,
  user: SafeUser,
  tx: DatabaseTransaction,
  auditLogger: typeof insertAuditLog = insertAuditLog
): Promise<SubscriptionRight> {
  const input = allocateSubscriptionRightSchema.parse(rawInput);
  const serverNowUtc = new Date();

  // 1. Valida existência e titularidade da carteira (impede IDOR)
  await getPortfolioById(input.portfolioId, user, tx);

  // 2. Lock pessimista na carteira para serializar operações
  await tx
    .select({ id: portfolios.id })
    .from(portfolios)
    .where(eq(portfolios.id, input.portfolioId))
    .for('update');

  // 3. Busca a oferta de subscrição previamente cadastrada
  const [offer] = await tx
    .select()
    .from(subscriptionOffers)
    .where(eq(subscriptionOffers.id, input.offerId))
    .limit(1);

  if (!offer) {
    throw new SubscriptionOfferNotFoundError();
  }

  // 4. Valida se a oferta já expirou no instante do servidor
  if (serverNowUtc > offer.exerciseEndDate) {
    throw new SubscriptionExpiredError('A oferta de subscrição selecionada já expirou.');
  }

  // 5. Valida que o ativo do direito existe em assets e possui asset_type = 'subscription_right'
  const rightAsset = await getAssetById(offer.rightAssetId, user, tx);
  if (rightAsset.assetType !== 'subscription_right') {
    throw new InvalidCorporateActionError(
      'O ativo vinculado ao direito de subscrição deve possuir asset_type = subscription_right.'
    );
  }

  // 6. Valida que os ativos originador e destino existem
  await getAssetById(offer.originAssetId, user, tx);
  await getAssetById(offer.targetAssetId, user, tx);

  // 7. Valida quantidade com Decimal
  const allocatedDec = new Decimal(input.allocatedQuantity);
  if (allocatedDec.lessThanOrEqualTo(0)) {
    throw new InvalidCorporateActionError('Quantidade de direitos deve ser maior que zero.');
  }

  // 8. Cria o lote em subscription_rights
  const id = crypto.randomUUID();
  const [createdRight] = await tx
    .insert(subscriptionRights)
    .values({
      id,
      portfolioId: input.portfolioId,
      offerId: input.offerId,
      status: 'ACTIVE',
      allocatedQuantity: allocatedDec.toFixed(10),
      exercisedQuantity: '0.0000000000',
      createdBy: user.id,
      createdAt: serverNowUtc,
      updatedAt: serverNowUtc,
    })
    .returning();

  if (!createdRight) {
    throw new Error('Falha ao registrar atribuição de direitos de subscrição.');
  }

  // 9. Registra auditoria transacional
  await auditLogger(
    {
      tableName: 'subscription_rights',
      recordId: id,
      action: 'INSERT',
      actorId: user.id,
      actorType: 'user',
      source: 'manual',
    },
    {
      newValue: {
        portfolioId: input.portfolioId,
        offerId: input.offerId,
        status: 'ACTIVE',
        allocatedQuantity: allocatedDec.toFixed(10),
        exercisedQuantity: '0.0000000000',
      },
    },
    {
      allowlist: ['portfolioId', 'offerId', 'status', 'allocatedQuantity', 'exercisedQuantity'],
    },
    tx
  );

  return createdRight as SubscriptionRight;
}

/**
 * Atribui direitos de subscrição a uma carteira abrindo transação gerenciada.
 */
export async function allocateSubscriptionRight(
  rawInput: AllocateSubscriptionRightInput,
  user: SafeUser,
  database: Database = db,
  auditLogger: typeof insertAuditLog = insertAuditLog
): Promise<SubscriptionRight> {
  return await database.transaction(async (tx) => {
    return await allocateSubscriptionRightInTransaction(rawInput, user, tx, auditLogger);
  });
}

// ─── 3. exerciseSubscription ──────────────────────────────────────────────────

export interface ExerciseSubscriptionResult {
  exercise: SubscriptionExercise;
  event: PortfolioEvent;
  subscriptionRight: SubscriptionRight;
}

/**
 * Operação transacional de exercício de direitos de subscrição.
 *
 * SEGURANÇA E INTEGRIDADE:
 * - O cliente NÃO envia nem controla exercisePrice ou totalCost.
 * - Bloqueia o lote com FOR UPDATE.
 * - Verifica idempotência na mesma transação por (subscription_right_id, idempotency_key).
 * - Lê o preço exclusivamente da oferta.
 * - Calcula o totalCost no servidor com quantizeTotalCost (ROUND_HALF_EVEN, 8 casas).
 * - Valida janelas de vigência e data de corte.
 * - Cria um evento BUY em portfolio_events com source = 'corporate_action'.
 * - Cria o registro em subscription_exercises.
 * - Atualiza atomicamente o lote em subscription_rights.
 */
export async function exerciseSubscriptionInTransaction(
  rawInput: RawExerciseSubscriptionInput,
  user: SafeUser,
  tx: DatabaseTransaction,
  auditLogger: typeof insertAuditLog = insertAuditLog
): Promise<ExerciseSubscriptionResult> {
  const input = exerciseSubscriptionInputSchema.parse(rawInput);
  const serverNowUtc = new Date();

  // 1. Valida titularidade da carteira informada
  await getPortfolioById(input.portfolioId, user, tx);

  // 2. Bloqueia o lote com FOR UPDATE
  const [right] = await tx
    .select()
    .from(subscriptionRights)
    .where(eq(subscriptionRights.id, input.subscriptionRightId))
    .for('update');

  if (!right) {
    throw new InvalidSubscriptionStateError('Direito de subscrição não encontrado.');
  }

  // 3. Valida se o lote pertence à carteira informada
  if (right.portfolioId !== input.portfolioId) {
    throw new InvalidSubscriptionStateError(
      'O direito de subscrição informado não pertence à carteira especificada.'
    );
  }

  // 4. Verificação de idempotência estrita dentro da mesma transação
  const [existingExercise] = await tx
    .select()
    .from(subscriptionExercises)
    .where(
      and(
        eq(subscriptionExercises.subscriptionRightId, input.subscriptionRightId),
        eq(subscriptionExercises.idempotencyKey, input.idempotencyKey)
      )
    );

  if (existingExercise) {
    const [existingEvent] = await tx
      .select()
      .from(portfolioEvents)
      .where(eq(portfolioEvents.id, existingExercise.portfolioEventId))
      .limit(1);

    return {
      exercise: existingExercise as SubscriptionExercise,
      event: existingEvent as PortfolioEvent,
      subscriptionRight: right as SubscriptionRight,
    };
  }

  // 5. Busca a oferta vinculada na mesma transação
  const [offer] = await tx
    .select()
    .from(subscriptionOffers)
    .where(eq(subscriptionOffers.id, right.offerId))
    .limit(1);

  if (!offer) {
    throw new SubscriptionOfferNotFoundError();
  }

  // 6. Valida vigência da oferta no instante atual do servidor
  assertExercisePeriod(serverNowUtc, offer.exerciseStartDate, offer.exerciseEndDate);

  // 7. Valida a data operacional de exercício informada
  const exerciseDateObj = new Date(input.exerciseDate);
  assertExerciseDate(exerciseDateObj, offer.cutOffDate, serverNowUtc);

  // 8. Valida o status persistido do direito
  if (right.status === 'FULLY_EXERCISED') {
    throw new InvalidSubscriptionStateError(
      'Este lote de subscrição já foi integralmente exercido.'
    );
  }
  if (right.status === 'CANCELLED') {
    throw new InvalidSubscriptionStateError(
      'Não é possível exercer um direito de subscrição cancelado.'
    );
  }
  if (right.status === 'EXPIRED') {
    throw new SubscriptionExpiredError(
      'Não é possível exercer um direito de subscrição expirado.'
    );
  }

  // 9. Calcula e valida saldo remanescente disponível
  const remainingQuantity = calculateRemainingQuantity(
    right.allocatedQuantity,
    right.exercisedQuantity
  );
  const requestedQuantity = new Decimal(input.quantity);

  if (requestedQuantity.lessThanOrEqualTo(0)) {
    throw new InvalidCorporateActionError('Quantidade a exercer deve ser maior que zero.');
  }

  if (requestedQuantity.greaterThan(remainingQuantity)) {
    throw new InsufficientSubscriptionRightsError(
      `Quantidade solicitada (${requestedQuantity.toString()}) excede o saldo de direitos disponível (${remainingQuantity.toString()}).`
    );
  }

  // 10. Lê preço exclusivamente da oferta e calcula totalCost no servidor
  const exercisePriceDec = new Decimal(offer.exercisePrice);
  const feesDec = new Decimal(input.fees ?? '0.00000000');

  const totalCost = quantizeTotalCost({
    quantity: requestedQuantity,
    exercisePrice: exercisePriceDec,
    fees: feesDec,
  });

  // 11. Busca ativo de destino para moeda
  const targetAsset = await getAssetById(offer.targetAssetId, user, tx);

  // 12. Validação de consistência temporal na timeline do ativo de destino
  const existingEvents = await tx
    .select()
    .from(portfolioEvents)
    .where(
      and(
        eq(portfolioEvents.portfolioId, right.portfolioId),
        eq(portfolioEvents.assetId, offer.targetAssetId),
        isNull(portfolioEvents.deletedAt)
      )
    );

  const activeEvents: TimelineEvent[] = existingEvents.map((e) => ({
    id: e.id,
    portfolioId: e.portfolioId,
    assetId: e.assetId,
    type: e.type,
    tradeDate: e.tradeDate,
    quantity: new Decimal(e.quantity),
    unitPrice: new Decimal(e.unitPrice),
    fees: new Decimal(e.fees || 0),
    deletedAt: e.deletedAt,
    createdAt: e.createdAt,
  }));

  const eventId = crypto.randomUUID();
  const prospectiveEvent: TimelineEvent = {
    id: eventId,
    portfolioId: right.portfolioId,
    assetId: offer.targetAssetId,
    type: 'BUY',
    tradeDate: exerciseDateObj,
    quantity: requestedQuantity.toFixed(10),
    unitPrice: exercisePriceDec.toFixed(8),
    fees: feesDec.toFixed(8),
    createdAt: serverNowUtc,
  };

  validateTimelineConsistency(activeEvents, prospectiveEvent);

  // 13. Insere o evento BUY em portfolio_events
  const [createdEvent] = await tx
    .insert(portfolioEvents)
    .values({
      id: eventId,
      portfolioId: right.portfolioId,
      assetId: offer.targetAssetId,
      type: 'BUY',
      tradeDate: exerciseDateObj,
      settlementDate: null,
      quantity: requestedQuantity.toFixed(10),
      unitPrice: exercisePriceDec.toFixed(8),
      fees: feesDec.toFixed(8),
      currency: targetAsset.currency || 'BRL',
      notes: 'Exercício de direito de subscrição',
      source: 'corporate_action',
      createdBy: user.id,
      createdAt: serverNowUtc,
    })
    .returning();

  if (!createdEvent) {
    throw new Error('Falha ao criar evento financeiro de exercício.');
  }

  // 14. Insere o vínculo em subscription_exercises
  const exerciseId = crypto.randomUUID();
  const [createdExercise] = await tx
    .insert(subscriptionExercises)
    .values({
      id: exerciseId,
      subscriptionRightId: right.id,
      portfolioEventId: eventId,
      idempotencyKey: input.idempotencyKey,
      exercisedQuantity: requestedQuantity.toFixed(10),
      exercisePrice: exercisePriceDec.toFixed(8),
      fees: feesDec.toFixed(8),
      totalCost: totalCost.toFixed(8),
      exerciseDate: exerciseDateObj,
      createdBy: user.id,
      createdAt: serverNowUtc,
    })
    .returning();

  if (!createdExercise) {
    throw new Error('Falha ao registrar execução de subscrição.');
  }

  // 15. Atualiza atomicamente o lote em subscription_rights
  const newExercisedQuantity = new Decimal(right.exercisedQuantity).plus(requestedQuantity);
  const newStatus = evaluateSubscriptionStatus({
    allocatedQuantity: right.allocatedQuantity,
    exercisedQuantity: newExercisedQuantity,
    exerciseStartDate: offer.exerciseStartDate,
    exerciseEndDate: offer.exerciseEndDate,
    serverNowUtc,
    persistedStatus: right.status as SubscriptionStatus,
  });

  const [updatedRight] = await tx
    .update(subscriptionRights)
    .set({
      exercisedQuantity: newExercisedQuantity.toFixed(10),
      status: newStatus,
      updatedAt: serverNowUtc,
    })
    .where(eq(subscriptionRights.id, right.id))
    .returning();

  // 16. Registra auditoria transacional para todas as entidades envolvidas
  await auditLogger(
    {
      tableName: 'portfolio_events',
      recordId: eventId,
      action: 'INSERT',
      actorId: user.id,
      actorType: 'user',
      source: 'manual',
    },
    {
      newValue: {
        portfolioId: right.portfolioId,
        assetId: offer.targetAssetId,
        type: 'BUY',
        tradeDate: exerciseDateObj.toISOString(),
        quantity: requestedQuantity.toFixed(10),
        unitPrice: exercisePriceDec.toFixed(8),
        fees: feesDec.toFixed(8),
        source: 'corporate_action',
      },
    },
    {
      allowlist: ['portfolioId', 'assetId', 'type', 'tradeDate', 'quantity', 'unitPrice', 'fees', 'source'],
    },
    tx
  );

  await auditLogger(
    {
      tableName: 'subscription_exercises',
      recordId: exerciseId,
      action: 'INSERT',
      actorId: user.id,
      actorType: 'user',
      source: 'manual',
    },
    {
      newValue: {
        subscriptionRightId: right.id,
        portfolioEventId: eventId,
        idempotencyKey: input.idempotencyKey,
        exercisedQuantity: requestedQuantity.toFixed(10),
        exercisePrice: exercisePriceDec.toFixed(8),
        fees: feesDec.toFixed(8),
        totalCost: totalCost.toFixed(8),
      },
    },
    {
      allowlist: [
        'subscriptionRightId',
        'portfolioEventId',
        'idempotencyKey',
        'exercisedQuantity',
        'exercisePrice',
        'fees',
        'totalCost',
      ],
    },
    tx
  );

  await auditLogger(
    {
      tableName: 'subscription_rights',
      recordId: right.id,
      action: 'UPDATE',
      actorId: user.id,
      actorType: 'user',
      source: 'manual',
    },
    {
      oldValue: {
        exercisedQuantity: right.exercisedQuantity,
        status: right.status,
      },
      newValue: {
        exercisedQuantity: newExercisedQuantity.toFixed(10),
        status: newStatus,
      },
    },
    {
      allowlist: ['exercisedQuantity', 'status'],
    },
    tx
  );

  return {
    exercise: createdExercise as SubscriptionExercise,
    event: createdEvent as PortfolioEvent,
    subscriptionRight: updatedRight as SubscriptionRight,
  };
}

/**
 * Executa exercício de direitos de subscrição abrindo transação gerenciada.
 */
export async function exerciseSubscription(
  rawInput: RawExerciseSubscriptionInput,
  user: SafeUser,
  database: Database = db,
  auditLogger: typeof insertAuditLog = insertAuditLog
): Promise<ExerciseSubscriptionResult> {
  return await database.transaction(async (tx) => {
    return await exerciseSubscriptionInTransaction(rawInput, user, tx, auditLogger);
  });
}

// ─── 4. cancelSubscriptionRight ───────────────────────────────────────────────

/**
 * Operação transacional de cancelamento administrativo de saldo remanescente não exercido.
 * - Bloqueia com FOR UPDATE.
 * - Rejeita cancelamento de FULLY_EXERCISED, CANCELLED ou lote com vigência expirada.
 * - Não cria evento financeiro nem estorna BUYs anteriores.
 * - Soft delete com deleted_at, cancellation_reason e status = 'CANCELLED'.
 */
export async function cancelSubscriptionRightInTransaction(
  rawInput: RawCancelSubscriptionRightInput,
  user: SafeUser,
  tx: DatabaseTransaction,
  auditLogger: typeof insertAuditLog = insertAuditLog
): Promise<SubscriptionRight> {
  const input = cancelSubscriptionRightSchema.parse(rawInput);
  const serverNowUtc = new Date();

  // 1. Valida titularidade da carteira informada
  await getPortfolioById(input.portfolioId, user, tx);

  // 2. Bloqueia o lote com FOR UPDATE
  const [right] = await tx
    .select()
    .from(subscriptionRights)
    .where(eq(subscriptionRights.id, input.subscriptionRightId))
    .for('update');

  if (!right) {
    throw new InvalidSubscriptionStateError('Direito de subscrição não encontrado.');
  }

  // 3. Valida se o direito pertence à carteira informada
  if (right.portfolioId !== input.portfolioId) {
    throw new InvalidSubscriptionStateError(
      'O direito de subscrição informado não pertence à carteira especificada.'
    );
  }

  // 4. Busca oferta vinculada para checar vigência
  const [offer] = await tx
    .select()
    .from(subscriptionOffers)
    .where(eq(subscriptionOffers.id, right.offerId))
    .limit(1);

  if (!offer) {
    throw new SubscriptionOfferNotFoundError();
  }

  // 5. Rejeita cancelamento se a oferta já expirou
  if (serverNowUtc > offer.exerciseEndDate) {
    throw new SubscriptionExpiredError(
      'Não é possível cancelar um direito de subscrição com vigência expirada.'
    );
  }

  // 6. Valida status persistido
  if (right.status === 'FULLY_EXERCISED') {
    throw new InvalidSubscriptionStateError(
      'Não é possível cancelar um direito de subscrição totalmente exercido.'
    );
  }
  if (right.status === 'CANCELLED') {
    throw new InvalidSubscriptionStateError(
      'Direito de subscrição já está cancelado.'
    );
  }
  if (right.status === 'EXPIRED') {
    throw new SubscriptionExpiredError(
      'Não é possível cancelar um direito de subscrição expirado.'
    );
  }

  // 7. Atualiza status para CANCELLED com motivo e deleted_at
  const [updatedRight] = await tx
    .update(subscriptionRights)
    .set({
      status: 'CANCELLED',
      deletedAt: serverNowUtc,
      cancellationReason: input.reason.trim(),
      updatedAt: serverNowUtc,
    })
    .where(eq(subscriptionRights.id, right.id))
    .returning();

  if (!updatedRight) {
    throw new Error('Falha ao cancelar direito de subscrição.');
  }

  // 8. Registra auditoria transacional
  await auditLogger(
    {
      tableName: 'subscription_rights',
      recordId: right.id,
      action: 'UPDATE',
      actorId: user.id,
      actorType: 'user',
      source: 'manual',
      reason: input.reason.trim(),
    },
    {
      oldValue: {
        status: right.status,
        deletedAt: null,
        cancellationReason: null,
      },
      newValue: {
        status: 'CANCELLED',
        deletedAt: serverNowUtc.toISOString(),
        cancellationReason: input.reason.trim(),
      },
    },
    {
      allowlist: ['status', 'deletedAt', 'cancellationReason'],
    },
    tx
  );

  return updatedRight as SubscriptionRight;
}

/**
 * Cancela direito de subscrição abrindo transação gerenciada.
 */
export async function cancelSubscriptionRight(
  rawInput: RawCancelSubscriptionRightInput,
  user: SafeUser,
  database: Database = db,
  auditLogger: typeof insertAuditLog = insertAuditLog
): Promise<SubscriptionRight> {
  return await database.transaction(async (tx) => {
    return await cancelSubscriptionRightInTransaction(rawInput, user, tx, auditLogger);
  });
}

// ─── 5. listActiveSubscriptionsByPortfolio ────────────────────────────────────

/**
 * Lista todos os direitos de subscrição de uma carteira com projeção lazy de status.
 * - Valida titularidade da carteira.
 * - Projeta status EXPIRED em memória quando houver saldo remanescente e serverNowUtc > exerciseEndDate.
 * - Preserva estados terminais FULLY_EXERCISED e CANCELLED.
 */
export async function listActiveSubscriptionsByPortfolio(
  portfolioId: string,
  user: SafeUser,
  executor: DbExecutor = db
): Promise<SubscriptionRightWithOfferAndAssets[]> {
  // 1. Valida titularidade da carteira (aciona assertOwnership em caso de IDOR)
  await getPortfolioById(portfolioId, user, executor);

  const serverNowUtc = new Date();

  // 2. Busca todos os direitos da carteira
  const rightsRows = await executor
    .select()
    .from(subscriptionRights)
    .where(eq(subscriptionRights.portfolioId, portfolioId))
    .orderBy(desc(subscriptionRights.createdAt));

  const results: SubscriptionRightWithOfferAndAssets[] = [];

  for (const right of rightsRows) {
    const [offer] = await executor
      .select()
      .from(subscriptionOffers)
      .where(eq(subscriptionOffers.id, right.offerId))
      .limit(1);

    if (!offer) continue;

    const [originAsset] = await executor
      .select({
        id: assets.id,
        ticker: assets.ticker,
        name: assets.name,
        assetType: assets.assetType,
        currency: assets.currency,
      })
      .from(assets)
      .where(eq(assets.id, offer.originAssetId))
      .limit(1);

    const [rightAsset] = await executor
      .select({
        id: assets.id,
        ticker: assets.ticker,
        name: assets.name,
        assetType: assets.assetType,
        currency: assets.currency,
      })
      .from(assets)
      .where(eq(assets.id, offer.rightAssetId))
      .limit(1);

    const [targetAsset] = await executor
      .select({
        id: assets.id,
        ticker: assets.ticker,
        name: assets.name,
        assetType: assets.assetType,
        currency: assets.currency,
      })
      .from(assets)
      .where(eq(assets.id, offer.targetAssetId))
      .limit(1);

    if (originAsset && rightAsset && targetAsset) {
      const projectedStatus = evaluateSubscriptionStatus({
        allocatedQuantity: right.allocatedQuantity,
        exercisedQuantity: right.exercisedQuantity,
        exerciseStartDate: offer.exerciseStartDate,
        exerciseEndDate: offer.exerciseEndDate,
        serverNowUtc,
        persistedStatus: right.status as SubscriptionStatus,
      });

      const remainingQuantity = calculateRemainingQuantity(
        right.allocatedQuantity,
        right.exercisedQuantity
      );

      results.push({
        ...(right as SubscriptionRight),
        offer: {
          ...offer,
          originAsset,
          rightAsset,
          targetAsset,
        },
        projectedStatus,
        remainingQuantity: remainingQuantity.toFixed(10),
      });
    }
  }

  return results;
}
