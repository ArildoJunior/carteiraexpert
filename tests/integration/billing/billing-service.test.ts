import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../../../src/lib/db';
import { users } from '../../../src/lib/db/schema/identity';
import { commercialPlans, userPlans } from '../../../src/lib/db/schema/plans';
import { billingSubscriptions, paymentEvents } from '../../../src/lib/db/schema/billing';
import { auditLogs } from '../../../src/lib/db/schema/audit';
import type { SafeUser } from '../../../src/modules/identity/domain/user.types';
import {
  createOrUpdateBillingSubscription,
  getUserActiveBillingSubscription,
  getUserBillingSummary,
  cancelBillingSubscription,
} from '../../../src/modules/billing/server/billing.service';
import { getUserEffectivePlan } from '../../../src/modules/plans/server/plan.service';
import { BillingSubscriptionNotFoundError } from '../../../src/modules/billing/domain/errors';

describe('Integração: Serviço de Assinaturas e Faturamento', () => {
  const userId = crypto.randomUUID();
  let testUser: SafeUser;

  beforeAll(async () => {
    const now = new Date();

    // Cria usuário de teste
    await db.insert(users).values({
      id: userId,
      email: `billing_test_${Date.now()}@carteiraexpert.test`,
      name: 'Billing Test User',
      passwordHash: 'dummy_hash',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });

    testUser = {
      id: userId,
      email: `billing_test_${Date.now()}@carteiraexpert.test`,
      name: 'Billing Test User',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
  });

  afterAll(async () => {
    await db.delete(paymentEvents).where(eq(paymentEvents.userId, userId));
    await db.delete(billingSubscriptions).where(eq(billingSubscriptions.userId, userId));
    await db.delete(userPlans).where(eq(userPlans.userId, userId));
    await db.delete(auditLogs).where(eq(auditLogs.actorId, userId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it('deve retornar resumo de faturamento padrão para usuário sem assinatura (plano Free)', async () => {
    const summary = await getUserBillingSummary(userId);

    expect(summary.hasSubscription).toBe(false);
    expect(summary.subscription).toBeNull();
    expect(summary.effectivePlanId).toBe('free');
    expect(summary.effectivePlanName).toBe('Plano Free');
    expect(summary.maxActivePortfolios).toBe(2);
    expect(summary.status).toBe('no_subscription');
    expect(summary.isPastDue).toBe(false);
    expect(summary.isCanceled).toBe(false);
  });

  it('deve criar uma nova assinatura PRO e sincronizar atomicamente com user_plans', async () => {
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    const subscription = await createOrUpdateBillingSubscription({
      userId,
      planId: 'pro',
      status: 'active',
      billingCycle: 'monthly',
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      provider: 'internal',
    });

    expect(subscription.id).toBeDefined();
    expect(subscription.userId).toBe(userId);
    expect(subscription.planId).toBe('pro');
    expect(subscription.status).toBe('active');
    expect(subscription.billingCycle).toBe('monthly');

    // Verifica se user_plans foi atualizado com PRO
    const effectivePlan = await getUserEffectivePlan(userId);
    expect(effectivePlan.planId).toBe('pro');
    expect(effectivePlan.maxActivePortfolios).toBe(10);
    expect(effectivePlan.status).toBe('active');
    expect(effectivePlan.isFallback).toBe(false);

    // Verifica se getUserBillingSummary reflete a assinatura
    const summary = await getUserBillingSummary(userId);
    expect(summary.hasSubscription).toBe(true);
    expect(summary.effectivePlanId).toBe('pro');
    expect(summary.status).toBe('active');
    expect(summary.isPastDue).toBe(false);
    expect(summary.isCanceled).toBe(false);
  });

  it('deve registrar trilha de auditoria para criação e sincronização', async () => {
    const logs = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.actorId, userId));

    const subLog = logs.find((l) => l.tableName === 'billing_subscriptions');
    const planLog = logs.find((l) => l.tableName === 'user_plans');

    expect(subLog).toBeDefined();
    expect(planLog).toBeDefined();
  });

  it('deve cancelar assinatura com cancelAtPeriodEnd = true sem rebaixar imediatamente', async () => {
    const activeSub = await getUserActiveBillingSubscription(userId);
    expect(activeSub).toBeDefined();

    const cancelledSub = await cancelBillingSubscription(
      activeSub!.id,
      { cancelAtPeriodEnd: true, reason: 'Test cancel at period end' },
      testUser
    );

    expect(cancelledSub.cancelAtPeriodEnd).toBe(true);
    expect(cancelledSub.status).toBe('active');
    expect(cancelledSub.canceledAt).toBeInstanceOf(Date);
    expect(cancelledSub.endedAt).toBeNull();

    // Como o período vigente ainda não expirou, o plano efetivo continua PRO
    const effectivePlan = await getUserEffectivePlan(userId);
    expect(effectivePlan.planId).toBe('pro');
    expect(effectivePlan.maxActivePortfolios).toBe(10);

    const summary = await getUserBillingSummary(userId);
    expect(summary.cancelAtPeriodEnd).toBe(true);
  });

  it('deve cancelar assinatura imediatamente com cancelAtPeriodEnd = false e rebaixar para FREE', async () => {
    const activeSub = await getUserActiveBillingSubscription(userId);
    expect(activeSub).toBeDefined();

    const cancelledSub = await cancelBillingSubscription(
      activeSub!.id,
      { cancelAtPeriodEnd: false, reason: 'Cancelamento imediato' },
      testUser
    );

    expect(cancelledSub.cancelAtPeriodEnd).toBe(false);
    expect(cancelledSub.status).toBe('canceled');
    expect(cancelledSub.endedAt).toBeInstanceOf(Date);

    // Plano efetivo rebaixa para FREE
    const effectivePlan = await getUserEffectivePlan(userId);
    expect(effectivePlan.planId).toBe('free');
    expect(effectivePlan.maxActivePortfolios).toBe(2);

    const summary = await getUserBillingSummary(userId);
    expect(summary.status).toBe('canceled');
    expect(summary.isCanceled).toBe(true);
  });

  it('deve rejeitar cancelamento de assinatura inexistente ou de outro usuário', async () => {
    const fakeId = crypto.randomUUID();
    await expect(
      cancelBillingSubscription(fakeId, { cancelAtPeriodEnd: true }, testUser)
    ).rejects.toThrow(BillingSubscriptionNotFoundError);
  });
});
