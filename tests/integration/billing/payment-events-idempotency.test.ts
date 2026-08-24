import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../../../src/lib/db';
import { users } from '../../../src/lib/db/schema/identity';
import { billingSubscriptions, paymentEvents } from '../../../src/lib/db/schema/billing';
import { userPlans } from '../../../src/lib/db/schema/plans';
import { auditLogs } from '../../../src/lib/db/schema/audit';
import {
  createOrUpdateBillingSubscription,
  processPaymentEvent,
  getUserActiveBillingSubscription,
} from '../../../src/modules/billing/server/billing.service';
import { getUserEffectivePlan } from '../../../src/modules/plans/server/plan.service';
import { Decimal } from '../../../src/lib/decimal';

describe('Integração: Eventos de Pagamento e Idempotência Estrita', () => {
  const userId = crypto.randomUUID();
  let subscriptionId: string;

  beforeAll(async () => {
    const now = new Date();

    await db.insert(users).values({
      id: userId,
      email: `payment_events_${Date.now()}@carteiraexpert.test`,
      name: 'Payment Events User',
      passwordHash: 'dummy_hash',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });

    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    const sub = await createOrUpdateBillingSubscription({
      userId,
      planId: 'pro',
      status: 'active',
      billingCycle: 'monthly',
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      provider: 'internal',
    });

    subscriptionId = sub.id;
  });

  afterAll(async () => {
    await db.delete(paymentEvents).where(eq(paymentEvents.userId, userId));
    await db.delete(billingSubscriptions).where(eq(billingSubscriptions.userId, userId));
    await db.delete(userPlans).where(eq(userPlans.userId, userId));
    await db.delete(auditLogs).where(eq(auditLogs.actorId, userId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it('deve processar evento invoice.payment_succeeded com sucesso', async () => {
    const idempotencyKey = `evt_succ_${Date.now()}`;

    const event = await processPaymentEvent({
      userId,
      subscriptionId,
      idempotencyKey,
      eventType: 'invoice.payment_succeeded',
      amount: new Decimal('49.90'),
      currency: 'BRL',
      provider: 'internal',
    });

    expect(event.id).toBeDefined();
    expect(event.idempotencyKey).toBe(idempotencyKey);
    expect(event.status).toBe('processed');
    expect(event.amount?.toString()).toBe('49.9');

    const sub = await getUserActiveBillingSubscription(userId);
    expect(sub?.status).toBe('active');
    expect(sub?.gracePeriodEndsAt).toBeNull();
  });

  it('deve garantir IDEMPOTÊNCIA ESTRITA: reprocessamento da mesma chave retorna o evento original sem duplicar', async () => {
    const idempotencyKey = `evt_idempotent_${Date.now()}`;

    // 1ª execução
    const firstCall = await processPaymentEvent({
      userId,
      subscriptionId,
      idempotencyKey,
      eventType: 'invoice.payment_succeeded',
      amount: '49.90',
      currency: 'BRL',
    });

    // 2ª execução com mesma idempotencyKey
    const secondCall = await processPaymentEvent({
      userId,
      subscriptionId,
      idempotencyKey,
      eventType: 'invoice.payment_succeeded',
      amount: '49.90',
      currency: 'BRL',
    });

    expect(secondCall.id).toBe(firstCall.id);
    expect(secondCall.createdAt.getTime()).toBe(firstCall.createdAt.getTime());
    expect(secondCall.status).toBe('processed');

    // Confirma que existe apenas 1 registro no banco para essa chave
    const eventsInDb = await db
      .select()
      .from(paymentEvents)
      .where(eq(paymentEvents.idempotencyKey, idempotencyKey));

    expect(eventsInDb).toHaveLength(1);
  });

  it('deve processar invoice.payment_failed e transitar assinatura para past_due com carência de 3 dias', async () => {
    const idempotencyKey = `evt_fail_${Date.now()}`;

    const event = await processPaymentEvent({
      userId,
      subscriptionId,
      idempotencyKey,
      eventType: 'invoice.payment_failed',
      amount: '49.90',
    });

    expect(event.status).toBe('processed');

    const sub = await getUserActiveBillingSubscription(userId);
    expect(sub?.status).toBe('past_due');
    expect(sub?.gracePeriodEndsAt).toBeInstanceOf(Date);

    // Verifica que o plano do usuário reflete past_due
    const effectivePlan = await getUserEffectivePlan(userId);
    // Em past_due, o plano efetivo rebaixa para fallback FREE
    expect(effectivePlan.planId).toBe('free');
    expect(effectivePlan.status).toBe('past_due');
  });

  it('deve processar subscription.canceled e transitar assinatura para canceled', async () => {
    const idempotencyKey = `evt_cancel_${Date.now()}`;

    const event = await processPaymentEvent({
      userId,
      subscriptionId,
      idempotencyKey,
      eventType: 'subscription.canceled',
    });

    expect(event.status).toBe('processed');

    const sub = await getUserActiveBillingSubscription(userId);
    expect(sub?.status).toBe('canceled');
    expect(sub?.endedAt).toBeInstanceOf(Date);
  });
});
