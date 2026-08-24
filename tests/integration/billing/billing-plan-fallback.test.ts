import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { eq, inArray, and } from 'drizzle-orm';
import { db } from '../../../src/lib/db';
import { users } from '../../../src/lib/db/schema/identity';
import { portfolios } from '../../../src/lib/db/schema/portfolio';
import { billingSubscriptions, paymentEvents } from '../../../src/lib/db/schema/billing';
import { userPlans } from '../../../src/lib/db/schema/plans';
import { auditLogs } from '../../../src/lib/db/schema/audit';
import type { SafeUser } from '../../../src/modules/identity/domain/user.types';
import {
  createOrUpdateBillingSubscription,
} from '../../../src/modules/billing/server/billing.service';
import {
  getUserEffectivePlan,
  getPlanQuotaSummary,
} from '../../../src/modules/plans/server/plan.service';
import { createPortfolio } from '../../../src/modules/portfolio/server/portfolio.service';

describe('Integração: Fallback de Plano e Congelamento em Inadimplência / Cancelamento', () => {
  const userId = crypto.randomUUID();
  let testUser: SafeUser;
  const createdPortfolioIds: string[] = [];

  beforeAll(async () => {
    const now = new Date();

    await db.insert(users).values({
      id: userId,
      email: `fallback_test_${Date.now()}@carteiraexpert.test`,
      name: 'Fallback Test User',
      passwordHash: 'dummy_hash',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });

    testUser = {
      id: userId,
      email: `fallback_test_${Date.now()}@carteiraexpert.test`,
      name: 'Fallback Test User',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };
  });

  afterAll(async () => {
    if (createdPortfolioIds.length > 0) {
      await db.delete(portfolios).where(inArray(portfolios.id, createdPortfolioIds));
    }
    await db.delete(paymentEvents).where(eq(paymentEvents.userId, userId));
    await db.delete(billingSubscriptions).where(eq(billingSubscriptions.userId, userId));
    await db.delete(userPlans).where(eq(userPlans.userId, userId));
    await db.delete(auditLogs).where(eq(auditLogs.actorId, userId));
    await db.delete(users).where(eq(users.id, userId));
  });

  it('deve permitir criar 4 carteiras enquanto no plano PRO', async () => {
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    await createOrUpdateBillingSubscription({
      userId,
      planId: 'pro',
      status: 'active',
      billingCycle: 'monthly',
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
    });

    const p1 = await createPortfolio({ name: 'Carteira PRO 1' }, testUser);
    const p2 = await createPortfolio({ name: 'Carteira PRO 2' }, testUser);
    const p3 = await createPortfolio({ name: 'Carteira PRO 3' }, testUser);
    const p4 = await createPortfolio({ name: 'Carteira PRO 4' }, testUser);

    createdPortfolioIds.push(p1.id, p2.id, p3.id, p4.id);

    const summary = await getPlanQuotaSummary(userId);
    expect(summary.activePortfoliosCount).toBe(4);
    expect(summary.maxActivePortfolios).toBe(10);
  });

  it('deve rebaixar para FREE e congelar automaticamente as 2 carteiras excedentes quando a assinatura se tornar UNPAID', async () => {
    const now = new Date();

    // Atualiza assinatura para 'unpaid'
    await createOrUpdateBillingSubscription({
      userId,
      planId: 'pro',
      status: 'unpaid',
      billingCycle: 'monthly',
      currentPeriodStart: now,
      currentPeriodEnd: now,
    });

    const effectivePlan = await getUserEffectivePlan(userId);
    expect(effectivePlan.planId).toBe('free');
    expect(effectivePlan.maxActivePortfolios).toBe(2);

    const quotaSummary = await getPlanQuotaSummary(userId);
    expect(quotaSummary.planId).toBe('free');
    expect(quotaSummary.activePortfoliosCount).toBe(2);
    expect(quotaSummary.frozenPortfoliosCount).toBe(2);
    expect(quotaSummary.canCreateMore).toBe(false);

    // Confirma que nenhuma carteira foi apagada
    const allPortfolios = await db
      .select()
      .from(portfolios)
      .where(and(eq(portfolios.userId, userId), inArray(portfolios.id, createdPortfolioIds)));

    expect(allPortfolios).toHaveLength(4);
    const active = allPortfolios.filter((p) => p.status === 'active');
    const frozen = allPortfolios.filter((p) => p.status === 'frozen');

    expect(active).toHaveLength(2);
    expect(frozen).toHaveLength(2);
  });
});
