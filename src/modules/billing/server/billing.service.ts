import crypto from 'node:crypto';
import { eq, and, desc } from 'drizzle-orm';
import { db, type Database, type DatabaseTransaction, type DbExecutor } from '../../../lib/db';
import { users } from '../../../lib/db/schema/identity';
import { commercialPlans, userPlans } from '../../../lib/db/schema/plans';
import { billingSubscriptions, paymentEvents } from '../../../lib/db/schema/billing';
import { billingGroups } from '../../../lib/db/schema/groups';
import { insertAuditLog } from '../../../lib/db/audit';
import { Decimal } from '../../../lib/decimal';
import { getUserEffectivePlan, applyPlanDowngradeInTransaction } from '../../plans/server/plan.service';
import { applyGroupSuspensionInTransaction } from '../../plans/server/group.service';
import type {
  BillingSubscription,
  PaymentEvent,
  UserBillingSummary,
  CreateBillingSubscriptionInput,
  UpdateBillingSubscriptionInput,
  CancelBillingSubscriptionInput,
  ProcessPaymentEventInput,
  BillingSubscriptionStatus,
  BillingCycle,
  PaymentEventStatus,
} from '../domain/billing.types';
import {
  createBillingSubscriptionSchema,
  updateBillingSubscriptionSchema,
  cancelBillingSubscriptionSchema,
  processPaymentEventSchema,
} from '../domain/billing.schema';
import {
  BillingSubscriptionNotFoundError,
  DuplicatePaymentEventError,
  PaymentEventProcessingError,
} from '../domain/errors';
import type { CommercialPlanId, UserPlanStatus } from '../../plans/domain/plan.types';
import type { SafeUser } from '../../identity/domain/user.types';

/**
 * Mapeia uma linha do PostgreSQL para a entidade de domínio BillingSubscription.
 */
function mapBillingSubscriptionRow(row: typeof billingSubscriptions.$inferSelect): BillingSubscription {
  return {
    id: row.id,
    userId: row.userId,
    planId: row.planId as CommercialPlanId,
    status: row.status as BillingSubscriptionStatus,
    billingCycle: row.billingCycle as BillingCycle,
    currentPeriodStart: row.currentPeriodStart,
    currentPeriodEnd: row.currentPeriodEnd,
    cancelAtPeriodEnd: row.cancelAtPeriodEnd,
    canceledAt: row.canceledAt,
    endedAt: row.endedAt,
    gracePeriodEndsAt: row.gracePeriodEndsAt,
    provider: row.provider,
    providerSubscriptionId: row.providerSubscriptionId,
    providerCustomerId: row.providerCustomerId,
    metadata: row.metadata as Record<string, unknown> | null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/**
 * Mapeia uma linha do PostgreSQL para a entidade de domínio PaymentEvent.
 */
function mapPaymentEventRow(row: typeof paymentEvents.$inferSelect): PaymentEvent {
  return {
    id: row.id,
    userId: row.userId,
    subscriptionId: row.subscriptionId,
    idempotencyKey: row.idempotencyKey,
    eventType: row.eventType,
    provider: row.provider,
    providerEventId: row.providerEventId,
    amount: row.amount ? new Decimal(row.amount) : null,
    currency: row.currency,
    status: row.status as PaymentEventStatus,
    payload: row.payload as Record<string, unknown> | null,
    errorMessage: row.errorMessage,
    processedAt: row.processedAt,
    createdAt: row.createdAt,
  };
}

/**
 * Busca a assinatura mais recente do usuário (leitura pura).
 */
export async function getUserActiveBillingSubscription(
  userId: string,
  executor: DbExecutor = db
): Promise<BillingSubscription | null> {
  const subscriptions = await executor
    .select()
    .from(billingSubscriptions)
    .where(eq(billingSubscriptions.userId, userId))
    .orderBy(desc(billingSubscriptions.createdAt));

  if (subscriptions.length === 0) return null;

  // Prioriza Pro ativo/trialing
  const proSub = subscriptions.find(
    (s) => s.planId === 'pro' && (s.status === 'active' || s.status === 'trialing')
  );
  if (proSub) return mapBillingSubscriptionRow(proSub);

  // Prioriza Shared ativo/trialing
  const sharedSub = subscriptions.find(
    (s) => s.planId === 'shared' && (s.status === 'active' || s.status === 'trialing')
  );
  if (sharedSub) return mapBillingSubscriptionRow(sharedSub);

  // Outra ativa/trialing
  const otherActive = subscriptions.find(
    (s) => s.status === 'active' || s.status === 'trialing'
  );
  if (otherActive) return mapBillingSubscriptionRow(otherActive);

  // Fallback: mais recente
  return mapBillingSubscriptionRow(subscriptions[0]);
}

/**
 * Obtém o resumo consolidado de faturamento e assinatura do usuário.
 */
export async function getUserBillingSummary(
  userId: string,
  executor: DbExecutor = db
): Promise<UserBillingSummary> {
  const effectivePlan = await getUserEffectivePlan(userId, executor);
  const subscription = await getUserActiveBillingSubscription(userId, executor);

  const hasSubscription = subscription !== null;
  const isPastDue = subscription?.status === 'past_due';
  const isCanceled = subscription?.status === 'canceled';
  const cancelAtPeriodEnd = subscription?.cancelAtPeriodEnd ?? false;

  return {
    hasSubscription,
    subscription,
    effectivePlanId: effectivePlan.planId,
    effectivePlanName: effectivePlan.name,
    maxActivePortfolios: effectivePlan.maxActivePortfolios,
    status: subscription ? subscription.status : 'no_subscription',
    isPastDue,
    isCanceled,
    cancelAtPeriodEnd,
    currentPeriodEnd: subscription?.currentPeriodEnd ?? null,
    gracePeriodEndsAt: subscription?.gracePeriodEndsAt ?? null,
    provider: subscription?.provider ?? null,
  };
}

/**
 * Sincroniza atomicamente a assinatura vigente com a tabela `user_plans`.
 * Garante que a transição de estado da assinatura reflita nas quotas e entitlements do usuário.
 */
export async function synchronizeUserPlanFromSubscriptionInTransaction(
  subscription: BillingSubscription,
  tx: DatabaseTransaction,
  auditLogger: typeof insertAuditLog = insertAuditLog
): Promise<void> {
  const userId = subscription.userId;

  // Lock pessimista no usuário
  await tx
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .for('update');

  const now = new Date();
  let targetPlanId: CommercialPlanId = subscription.planId;
  let targetStatus: UserPlanStatus = 'active';
  let targetExpiresAt: Date | null = subscription.currentPeriodEnd;
  let shouldTriggerDowngrade = false;

  switch (subscription.status) {
    case 'active':
    case 'trialing':
      targetPlanId = subscription.planId;
      targetStatus = 'active';
      targetExpiresAt = subscription.currentPeriodEnd;
      break;

    case 'past_due':
      targetPlanId = subscription.planId;
      targetStatus = 'past_due';
      targetExpiresAt = subscription.gracePeriodEndsAt ?? subscription.currentPeriodEnd;
      break;

    case 'canceled':
      if (subscription.cancelAtPeriodEnd && subscription.currentPeriodEnd > now) {
        // Permanece ativo até o fim do ciclo contratado
        targetPlanId = subscription.planId;
        targetStatus = 'active';
        targetExpiresAt = subscription.currentPeriodEnd;
      } else {
        // Cancelamento imediato ou ciclo esgotado: rebaixa para FREE
        targetPlanId = 'free';
        targetStatus = 'cancelled';
        targetExpiresAt = subscription.endedAt ?? subscription.canceledAt ?? now;
        shouldTriggerDowngrade = true;
      }
      break;

    case 'unpaid':
    case 'incomplete':
      // Falha ou não pagamento: suspende PRO e rebaixa para FREE
      targetPlanId = 'free';
      targetStatus = 'cancelled';
      targetExpiresAt = now;
      shouldTriggerDowngrade = true;
      break;
  }

  const [existingUserPlan] = await tx
    .select()
    .from(userPlans)
    .where(eq(userPlans.userId, userId))
    .limit(1);

  if (existingUserPlan) {
    await tx
      .update(userPlans)
      .set({
        planId: targetPlanId,
        status: targetStatus,
        expiresAt: targetExpiresAt,
        updatedAt: now,
      })
      .where(eq(userPlans.id, existingUserPlan.id));

    await auditLogger(
      {
        tableName: 'user_plans',
        recordId: existingUserPlan.id,
        action: 'UPDATE',
        actorId: userId,
        actorType: 'system',
        source: 'job',
        reason: 'subscription_sync',
      },
      {
        oldValue: {
          planId: existingUserPlan.planId,
          status: existingUserPlan.status,
          expiresAt: existingUserPlan.expiresAt,
        },
        newValue: {
          planId: targetPlanId,
          status: targetStatus,
          expiresAt: targetExpiresAt,
        },
      },
      { allowlist: ['planId', 'status', 'expiresAt'] },
      tx
    );
  } else {
    const id = crypto.randomUUID();
    await tx.insert(userPlans).values({
      id,
      userId,
      planId: targetPlanId,
      status: targetStatus,
      startsAt: now,
      expiresAt: targetExpiresAt,
      createdAt: now,
      updatedAt: now,
    });

    await auditLogger(
      {
        tableName: 'user_plans',
        recordId: id,
        action: 'INSERT',
        actorId: userId,
        actorType: 'system',
        source: 'job',
        reason: 'subscription_sync',
      },
      {
        newValue: {
          planId: targetPlanId,
          status: targetStatus,
          expiresAt: targetExpiresAt,
        },
      },
      { allowlist: ['planId', 'status', 'expiresAt'] },
      tx
    );
  }

  // Se o usuário foi rebaixado para FREE, aplica congelamento idempotente de carteiras excedentes
  if (shouldTriggerDowngrade) {
    await applyPlanDowngradeInTransaction(userId, undefined, tx, auditLogger);

    // Se o usuário possuir um grupo compartilhado ativo, suspende o grupo e rebaixa os membros
    const [ownedGroup] = await tx
      .select()
      .from(billingGroups)
      .where(and(eq(billingGroups.ownerUserId, userId), eq(billingGroups.status, 'active')))
      .limit(1);

    if (ownedGroup) {
      await applyGroupSuspensionInTransaction(
        ownedGroup.id,
        'titular_subscription_downgrade',
        tx
      );
    }
  }
}

/**
 * Cria ou atualiza uma assinatura dentro de uma transação com auditoria e sincronização de plano.
 */
export async function createOrUpdateBillingSubscriptionInTransaction(
  input: CreateBillingSubscriptionInput,
  tx: DatabaseTransaction,
  auditLogger: typeof insertAuditLog = insertAuditLog
): Promise<BillingSubscription> {
  const validated = createBillingSubscriptionSchema.parse(input);

  // Lock pessimista no usuário
  await tx
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, validated.userId))
    .for('update');

  const now = new Date();
  const currentPeriodStart = validated.currentPeriodStart ?? now;
  const currentPeriodEnd = validated.currentPeriodEnd ?? (() => {
    const end = new Date(currentPeriodStart);
    if (validated.billingCycle === 'yearly') {
      end.setFullYear(end.getFullYear() + 1);
    } else {
      end.setMonth(end.getMonth() + 1);
    }
    return end;
  })();

  const [existingSub] = await tx
    .select()
    .from(billingSubscriptions)
    .where(eq(billingSubscriptions.userId, validated.userId))
    .orderBy(desc(billingSubscriptions.createdAt))
    .limit(1);

  let subscription: BillingSubscription;

  if (existingSub) {
    await tx
      .update(billingSubscriptions)
      .set({
        planId: validated.planId,
        status: validated.status,
        billingCycle: validated.billingCycle,
        currentPeriodStart,
        currentPeriodEnd,
        cancelAtPeriodEnd: validated.cancelAtPeriodEnd,
        gracePeriodEndsAt: validated.gracePeriodEndsAt ?? null,
        provider: validated.provider,
        providerSubscriptionId: validated.providerSubscriptionId ?? null,
        providerCustomerId: validated.providerCustomerId ?? null,
        metadata: validated.metadata ?? null,
        updatedAt: now,
      })
      .where(eq(billingSubscriptions.id, existingSub.id));

    const [updatedRow] = await tx
      .select()
      .from(billingSubscriptions)
      .where(eq(billingSubscriptions.id, existingSub.id));

    subscription = mapBillingSubscriptionRow(updatedRow);

    await auditLogger(
      {
        tableName: 'billing_subscriptions',
        recordId: existingSub.id,
        action: 'UPDATE',
        actorId: validated.userId,
        actorType: 'user',
        source: 'manual',
        reason: 'subscription_update',
      },
      {
        oldValue: {
          planId: existingSub.planId,
          status: existingSub.status,
          billingCycle: existingSub.billingCycle,
        },
        newValue: {
          planId: validated.planId,
          status: validated.status,
          billingCycle: validated.billingCycle,
        },
      },
      { allowlist: ['planId', 'status', 'billingCycle'] },
      tx
    );
  } else {
    const id = crypto.randomUUID();
    await tx.insert(billingSubscriptions).values({
      id,
      userId: validated.userId,
      planId: validated.planId,
      status: validated.status,
      billingCycle: validated.billingCycle,
      currentPeriodStart,
      currentPeriodEnd,
      cancelAtPeriodEnd: validated.cancelAtPeriodEnd,
      canceledAt: null,
      endedAt: null,
      gracePeriodEndsAt: validated.gracePeriodEndsAt ?? null,
      provider: validated.provider,
      providerSubscriptionId: validated.providerSubscriptionId ?? null,
      providerCustomerId: validated.providerCustomerId ?? null,
      metadata: validated.metadata ?? null,
      createdAt: now,
      updatedAt: now,
    });

    const [insertedRow] = await tx
      .select()
      .from(billingSubscriptions)
      .where(eq(billingSubscriptions.id, id));

    subscription = mapBillingSubscriptionRow(insertedRow);

    await auditLogger(
      {
        tableName: 'billing_subscriptions',
        recordId: id,
        action: 'INSERT',
        actorId: validated.userId,
        actorType: 'user',
        source: 'manual',
        reason: 'subscription_creation',
      },
      {
        newValue: {
          planId: validated.planId,
          status: validated.status,
          billingCycle: validated.billingCycle,
        },
      },
      { allowlist: ['planId', 'status', 'billingCycle'] },
      tx
    );
  }

  // Sincroniza estado com user_plans
  await synchronizeUserPlanFromSubscriptionInTransaction(subscription, tx, auditLogger);

  return subscription;
}

/**
 * Cancela uma assinatura com opção de término ao final do período vigente (`cancelAtPeriodEnd = true`)
 * ou cancelamento imediato.
 */
export async function cancelBillingSubscriptionInTransaction(
  subscriptionId: string,
  options: CancelBillingSubscriptionInput,
  user: SafeUser | { id: string },
  tx: DatabaseTransaction,
  auditLogger: typeof insertAuditLog = insertAuditLog
): Promise<BillingSubscription> {
  const validated = cancelBillingSubscriptionSchema.parse(options);

  const [existingSub] = await tx
    .select()
    .from(billingSubscriptions)
    .where(eq(billingSubscriptions.id, subscriptionId))
    .limit(1);

  if (!existingSub || existingSub.userId !== user.id) {
    throw new BillingSubscriptionNotFoundError('Assinatura não encontrada ou não pertence ao usuário.');
  }

  const now = new Date();
  const cancelAtPeriodEnd = validated.cancelAtPeriodEnd;
  const newStatus: BillingSubscriptionStatus = cancelAtPeriodEnd ? (existingSub.status as BillingSubscriptionStatus) : 'canceled';
  const endedAt = cancelAtPeriodEnd ? null : now;

  await tx
    .update(billingSubscriptions)
    .set({
      status: newStatus,
      cancelAtPeriodEnd,
      canceledAt: now,
      endedAt,
      updatedAt: now,
    })
    .where(eq(billingSubscriptions.id, subscriptionId));

  const [updatedRow] = await tx
    .select()
    .from(billingSubscriptions)
    .where(eq(billingSubscriptions.id, subscriptionId));

  const updatedSubscription = mapBillingSubscriptionRow(updatedRow);

  await auditLogger(
    {
      tableName: 'billing_subscriptions',
      recordId: subscriptionId,
      action: 'UPDATE',
      actorId: user.id,
      actorType: 'user',
      source: 'manual',
      reason: validated.reason || 'subscription_cancellation',
    },
    {
      oldValue: {
        status: existingSub.status,
        cancelAtPeriodEnd: existingSub.cancelAtPeriodEnd,
      },
      newValue: {
        status: newStatus,
        cancelAtPeriodEnd,
      },
    },
    { allowlist: ['status', 'cancelAtPeriodEnd'] },
    tx
  );

  // Sincroniza user_plans
  await synchronizeUserPlanFromSubscriptionInTransaction(updatedSubscription, tx, auditLogger);

  return updatedSubscription;
}

/**
 * Processa um evento de pagamento com idempotência estrita por `idempotency_key`.
 * Se o evento já foi processado anteriormente, retorna o evento existente sem duplicar efeitos.
 */
export async function processPaymentEventInTransaction(
  eventInput: ProcessPaymentEventInput,
  tx: DatabaseTransaction,
  auditLogger: typeof insertAuditLog = insertAuditLog
): Promise<PaymentEvent> {
  const validated = processPaymentEventSchema.parse(eventInput);

  // 1. Verificação de idempotência estrita
  const [existingEvent] = await tx
    .select()
    .from(paymentEvents)
    .where(eq(paymentEvents.idempotencyKey, validated.idempotencyKey))
    .limit(1);

  if (existingEvent) {
    // Retorna o evento existente de forma idempotente
    return mapPaymentEventRow(existingEvent);
  }

  // 2. Cria registro do evento com status 'received'
  const eventId = crypto.randomUUID();
  const now = new Date();
  const amountStr = validated.amount ? validated.amount.toString() : null;

  await tx.insert(paymentEvents).values({
    id: eventId,
    userId: validated.userId,
    subscriptionId: validated.subscriptionId ?? null,
    idempotencyKey: validated.idempotencyKey,
    eventType: validated.eventType,
    provider: validated.provider,
    providerEventId: validated.providerEventId ?? null,
    amount: amountStr,
    currency: validated.currency,
    status: 'received',
    payload: validated.payload ?? null,
    createdAt: now,
  });

  // 3. Processamento conforme o tipo de evento
  let processingStatus: PaymentEventStatus = 'processed';
  let errorMessage: string | null = null;

  try {
    if (validated.subscriptionId) {
      const [subRow] = await tx
        .select()
        .from(billingSubscriptions)
        .where(eq(billingSubscriptions.id, validated.subscriptionId))
        .limit(1);

      if (subRow) {
        let sub = mapBillingSubscriptionRow(subRow);

        if (validated.eventType === 'invoice.payment_succeeded') {
          // Pagamento bem-sucedido: ativa assinatura e renova ciclo
          await tx
            .update(billingSubscriptions)
            .set({
              status: 'active',
              gracePeriodEndsAt: null,
              updatedAt: now,
            })
            .where(eq(billingSubscriptions.id, sub.id));

          sub = { ...sub, status: 'active', gracePeriodEndsAt: null };
          await synchronizeUserPlanFromSubscriptionInTransaction(sub, tx, auditLogger);
        } else if (validated.eventType === 'invoice.payment_failed') {
          // Falha no pagamento: entra em atraso ('past_due') com período de carência (3 dias)
          const gracePeriod = new Date(now);
          gracePeriod.setDate(gracePeriod.getDate() + 3);

          await tx
            .update(billingSubscriptions)
            .set({
              status: 'past_due',
              gracePeriodEndsAt: gracePeriod,
              updatedAt: now,
            })
            .where(eq(billingSubscriptions.id, sub.id));

          sub = { ...sub, status: 'past_due', gracePeriodEndsAt: gracePeriod };
          await synchronizeUserPlanFromSubscriptionInTransaction(sub, tx, auditLogger);
        } else if (validated.eventType === 'subscription.canceled') {
          // Assinatura cancelada no gateway
          await tx
            .update(billingSubscriptions)
            .set({
              status: 'canceled',
              endedAt: now,
              updatedAt: now,
            })
            .where(eq(billingSubscriptions.id, sub.id));

          sub = { ...sub, status: 'canceled', endedAt: now };
          await synchronizeUserPlanFromSubscriptionInTransaction(sub, tx, auditLogger);
        }
      }
    }
  } catch (err: unknown) {
    processingStatus = 'failed';
    errorMessage = err instanceof Error ? err.message : 'Falha ao processar evento de pagamento.';
  }

  // 4. Atualiza status do evento de pagamento
  await tx
    .update(paymentEvents)
    .set({
      status: processingStatus,
      errorMessage,
      processedAt: now,
    })
    .where(eq(paymentEvents.id, eventId));

  const [processedRow] = await tx
    .select()
    .from(paymentEvents)
    .where(eq(paymentEvents.id, eventId));

  const processedEvent = mapPaymentEventRow(processedRow);

  await auditLogger(
    {
      tableName: 'payment_events',
      recordId: eventId,
      action: 'INSERT',
      actorId: validated.userId,
      actorType: 'system',
      source: 'job',
      reason: `payment_event:${validated.eventType}`,
    },
    {
      newValue: {
        eventType: validated.eventType,
        status: processingStatus,
        amount: amountStr,
      },
    },
    { allowlist: ['eventType', 'status', 'amount'] },
    tx
  );

  if (processingStatus === 'failed') {
    throw new PaymentEventProcessingError(errorMessage || 'Falha ao processar evento.');
  }

  return processedEvent;
}

/**
 * Wrappers públicos para execução com transação automática no banco de dados.
 */
export async function createOrUpdateBillingSubscription(
  input: CreateBillingSubscriptionInput,
  database: Database = db,
  auditLogger: typeof insertAuditLog = insertAuditLog
): Promise<BillingSubscription> {
  return await database.transaction(async (tx) => {
    return await createOrUpdateBillingSubscriptionInTransaction(input, tx, auditLogger);
  });
}

export async function cancelBillingSubscription(
  subscriptionId: string,
  options: CancelBillingSubscriptionInput,
  user: SafeUser | { id: string },
  database: Database = db,
  auditLogger: typeof insertAuditLog = insertAuditLog
): Promise<BillingSubscription> {
  return await database.transaction(async (tx) => {
    return await cancelBillingSubscriptionInTransaction(subscriptionId, options, user, tx, auditLogger);
  });
}

export async function processPaymentEvent(
  eventInput: ProcessPaymentEventInput,
  database: Database = db,
  auditLogger: typeof insertAuditLog = insertAuditLog
): Promise<PaymentEvent> {
  return await database.transaction(async (tx) => {
    return await processPaymentEventInTransaction(eventInput, tx, auditLogger);
  });
}
