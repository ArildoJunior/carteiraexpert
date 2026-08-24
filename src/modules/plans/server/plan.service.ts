import crypto from 'node:crypto';
import { eq, and, isNull, count, desc, inArray, notInArray } from 'drizzle-orm';
import { db, type Database, type DatabaseTransaction, type DbExecutor } from '../../../lib/db';
import { users } from '../../../lib/db/schema/identity';
import { portfolios } from '../../../lib/db/schema/portfolio';
import { commercialPlans, userPlans } from '../../../lib/db/schema/plans';
import { billingSubscriptions } from '../../../lib/db/schema/billing';
import { billingGroups, billingGroupMembers } from '../../../lib/db/schema/groups';
import { insertAuditLog } from '../../../lib/db/audit';
import type {
  CommercialPlan,
  CommercialPlanId,
  UserEffectivePlan,
  PlanQuotaSummary,
  UserPlanStatus,
} from '../domain/plan.types';
import {
  PlanLimitExceededError,
  PortfolioFrozenError,
  PlanNotFoundError,
} from '../domain/errors';

/**
 * Função pura e reutilizável para validação de escrita em carteira.
 * Rejeita qualquer operação de mutação se a carteira estiver congelada.
 */
export function assertPortfolioWritable(portfolio: { id: string; status: string }): void {
  if (portfolio.status === 'frozen') {
    throw new PortfolioFrozenError(
      'Operação não permitida: a carteira está congelada (somente leitura).',
      { portfolioId: portfolio.id }
    );
  }
}

/**
 * Resolve o plano efetivo do usuário sem efeitos colaterais (leitura pura).
 * Aplica a Matriz de Precedência Formal:
 * 1. Assinatura Pro individual própria ativa/trialing (prevalece sobre benefício de grupo).
 * 2. Assinatura própria do Plano Compartilhado ativa/trialing.
 * 3. Benefício de membro ativo em grupo compartilhado elegível.
 * 4. Registro direto vigente em user_plans (legado/cortesia).
 * 5. Fallback gracioso para o Plano Free.
 */
export async function getUserEffectivePlan(
  userId: string,
  executor: DbExecutor = db
): Promise<UserEffectivePlan> {
  const now = new Date();

  // 1. Assinatura Própria PRO Direta (Ativa ou Trialing e não expirada - Prioridade Máxima)
  const [proSubscription] = await executor
    .select()
    .from(billingSubscriptions)
    .where(
      and(
        eq(billingSubscriptions.userId, userId),
        eq(billingSubscriptions.planId, 'pro'),
        inArray(billingSubscriptions.status, ['active', 'trialing'])
      )
    )
    .orderBy(desc(billingSubscriptions.createdAt))
    .limit(1);

  if (proSubscription) {
    const isExpired =
      proSubscription.currentPeriodEnd < now &&
      (!proSubscription.gracePeriodEndsAt || proSubscription.gracePeriodEndsAt < now);

    if (!isExpired) {
      const [plan] = await executor
        .select()
        .from(commercialPlans)
        .where(and(eq(commercialPlans.id, 'pro'), eq(commercialPlans.isActive, true)))
        .limit(1);

      if (plan) {
        return {
          planId: 'pro',
          name: plan.name,
          maxActivePortfolios: plan.maxActivePortfolios,
          status: 'active',
          isFallback: false,
          expiresAt: proSubscription.currentPeriodEnd,
          source: 'direct',
        };
      }
    }
  }

  // 2. Assinatura Própria SHARED Direta do Titular (Ativa ou Trialing e não expirada)
  const [sharedSubscription] = await executor
    .select()
    .from(billingSubscriptions)
    .where(
      and(
        eq(billingSubscriptions.userId, userId),
        eq(billingSubscriptions.planId, 'shared'),
        inArray(billingSubscriptions.status, ['active', 'trialing'])
      )
    )
    .orderBy(desc(billingSubscriptions.createdAt))
    .limit(1);

  if (sharedSubscription) {
    const isExpired =
      sharedSubscription.currentPeriodEnd < now &&
      (!sharedSubscription.gracePeriodEndsAt || sharedSubscription.gracePeriodEndsAt < now);

    if (!isExpired) {
      const [plan] = await executor
        .select()
        .from(commercialPlans)
        .where(and(eq(commercialPlans.id, 'shared'), eq(commercialPlans.isActive, true)))
        .limit(1);

      if (plan) {
        return {
          planId: 'shared',
          name: plan.name,
          maxActivePortfolios: plan.maxActivePortfolios,
          status: 'active',
          isFallback: false,
          expiresAt: sharedSubscription.currentPeriodEnd,
          source: 'direct',
        };
      }
    }
  }

  // 2. Benefício Ativo de Membro em Grupo Compartilhado
  const [activeGroupMember] = await executor
    .select({
      memberId: billingGroupMembers.id,
      groupId: billingGroupMembers.groupId,
      groupStatus: billingGroups.status,
      groupPlanId: billingGroups.planId,
      ownerUserId: billingGroups.ownerUserId,
    })
    .from(billingGroupMembers)
    .innerJoin(billingGroups, eq(billingGroupMembers.groupId, billingGroups.id))
    .where(
      and(
        eq(billingGroupMembers.userId, userId),
        eq(billingGroupMembers.status, 'active'),
        eq(billingGroups.status, 'active')
      )
    )
    .limit(1);

  if (activeGroupMember) {
    const [groupPlan] = await executor
      .select()
      .from(commercialPlans)
      .where(and(eq(commercialPlans.id, activeGroupMember.groupPlanId), eq(commercialPlans.isActive, true)))
      .limit(1);

    if (groupPlan) {
      return {
        planId: groupPlan.id as CommercialPlanId,
        name: groupPlan.name,
        maxActivePortfolios: groupPlan.maxActivePortfolios,
        status: 'active',
        isFallback: false,
        expiresAt: null,
        source: 'group',
      };
    }
  }

  // 3. Registro Direto em user_plans (legado/cortesia)
  const [userPlanRow] = await executor
    .select()
    .from(userPlans)
    .where(eq(userPlans.userId, userId))
    .limit(1);

  if (userPlanRow) {
    const isPastDue = userPlanRow.status === 'past_due';
    const isExpired = userPlanRow.expiresAt !== null && userPlanRow.expiresAt < now;
    const isCancelledAndExpired =
      userPlanRow.status === 'cancelled' &&
      (userPlanRow.expiresAt === null || userPlanRow.expiresAt < now);

    if (!isPastDue && !isExpired && !isCancelledAndExpired) {
      const [commercialPlan] = await executor
        .select()
        .from(commercialPlans)
        .where(and(eq(commercialPlans.id, userPlanRow.planId), eq(commercialPlans.isActive, true)))
        .limit(1);

      if (commercialPlan) {
        return {
          planId: commercialPlan.id as CommercialPlanId,
          name: commercialPlan.name,
          maxActivePortfolios: commercialPlan.maxActivePortfolios,
          status: userPlanRow.status as UserPlanStatus,
          isFallback: false,
          expiresAt: userPlanRow.expiresAt,
          source: 'direct',
        };
      }
    }
  }

  // 4. Fallback Padrão: Plano Free
  return {
    planId: 'free',
    name: 'Plano Free',
    maxActivePortfolios: 2,
    status: userPlanRow?.status === 'past_due' ? 'past_due' : 'active',
    isFallback: true,
    expiresAt: null,
    source: 'fallback',
  };
}

/**
 * Obtém o resumo consolidado de quotas e contagem de carteiras do usuário.
 */
export async function getPlanQuotaSummary(
  userId: string,
  executor: DbExecutor = db
): Promise<PlanQuotaSummary> {
  const effectivePlan = await getUserEffectivePlan(userId, executor);

  const userPortfolios = await executor
    .select({
      id: portfolios.id,
      status: portfolios.status,
    })
    .from(portfolios)
    .where(and(eq(portfolios.userId, userId), isNull(portfolios.deletedAt)));

  let activeCount = 0;
  let frozenCount = 0;
  let archivedCount = 0;

  for (const p of userPortfolios) {
    if (p.status === 'active') activeCount++;
    else if (p.status === 'frozen') frozenCount++;
    else if (p.status === 'archived') archivedCount++;
  }

  const hasDefinedQuota = effectivePlan.maxActivePortfolios !== null;
  const availableSlots = hasDefinedQuota
    ? Math.max(0, effectivePlan.maxActivePortfolios! - activeCount)
    : 0;
  const canCreateMore = hasDefinedQuota
    ? activeCount < effectivePlan.maxActivePortfolios!
    : false;

  return {
    planId: effectivePlan.planId,
    planName: effectivePlan.name,
    maxActivePortfolios: effectivePlan.maxActivePortfolios,
    activePortfoliosCount: activeCount,
    frozenPortfoliosCount: frozenCount,
    archivedPortfoliosCount: archivedCount,
    availableSlots,
    canCreateMore,
  };
}

/**
 * Valida se o usuário pode criar ou reativar uma carteira.
 * Deve ser executado obrigatoriamente dentro de transação com lock pessimista.
 */
export async function assertCanCreatePortfolio(
  userId: string,
  tx: DatabaseTransaction
): Promise<void> {
  // 1. Lock pessimista na linha do usuário para serializar criação concorrente
  await tx
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .for('update');

  // 2. Resolve plano efetivo
  const effectivePlan = await getUserEffectivePlan(userId, tx);

  // 3. Conta carteiras ativas atuais
  const [activeCountRow] = await tx
    .select({ total: count() })
    .from(portfolios)
    .where(
      and(
        eq(portfolios.userId, userId),
        eq(portfolios.status, 'active'),
        isNull(portfolios.deletedAt)
      )
    );

  const currentCount = Number(activeCountRow?.total ?? 0);

  if (effectivePlan.maxActivePortfolios === null) {
    throw new PlanLimitExceededError(
      `A quota de carteiras do ${effectivePlan.name} ainda não foi definida. Não é possível criar novas carteiras nesta modalidade até a definição comercial da quota.`,
      {
        planId: effectivePlan.planId,
        maxAllowed: 0,
        currentCount,
      }
    );
  }

  if (currentCount >= effectivePlan.maxActivePortfolios) {
    throw new PlanLimitExceededError(
      `Limite de carteiras ativas para o ${effectivePlan.name} atingido (${effectivePlan.maxActivePortfolios}).`,
      {
        planId: effectivePlan.planId,
        maxAllowed: effectivePlan.maxActivePortfolios,
        currentCount,
      }
    );
  }
}

/**
 * Aplica o downgrade explícito de plano e congela carteiras excedentes de forma atômica e idempotente.
 * Nenhum dado financeiro ou carteira é apagado.
 */
export async function applyPlanDowngradeInTransaction(
  userId: string,
  keepPortfolioIds: string[] | undefined,
  tx: DatabaseTransaction,
  auditLogger: typeof insertAuditLog = insertAuditLog
): Promise<{ frozenPortfoliosCount: number; activePortfoliosCount: number }> {
  // Lock pessimista no usuário
  await tx
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .for('update');

  const activePortfolios = await tx
    .select()
    .from(portfolios)
    .where(
      and(
        eq(portfolios.userId, userId),
        eq(portfolios.status, 'active'),
        isNull(portfolios.deletedAt)
      )
    )
    .orderBy(portfolios.createdAt);

  const maxAllowed = 2; // Limite padrão do plano Free

  if (activePortfolios.length <= maxAllowed) {
    return {
      frozenPortfoliosCount: 0,
      activePortfoliosCount: activePortfolios.length,
    };
  }

  // Determina quais carteiras manter ativas
  const activeIdsSet = new Set(activePortfolios.map((p) => p.id));
  let idsToKeep: string[] = [];

  if (keepPortfolioIds && keepPortfolioIds.length > 0) {
    const validIds = keepPortfolioIds.filter((id) => activeIdsSet.has(id));
    idsToKeep = validIds.slice(0, maxAllowed);
  }

  // Se não fornecido ou insuficiente, completa com as mais antigas
  if (idsToKeep.length < maxAllowed) {
    for (const p of activePortfolios) {
      if (!idsToKeep.includes(p.id)) {
        idsToKeep.push(p.id);
        if (idsToKeep.length >= maxAllowed) break;
      }
    }
  }

  const idsToFreeze = activePortfolios
    .map((p) => p.id)
    .filter((id) => !idsToKeep.includes(id));

  const now = new Date();

  for (const freezeId of idsToFreeze) {
    const existing = activePortfolios.find((p) => p.id === freezeId);
    if (!existing) continue;

    await tx
      .update(portfolios)
      .set({
        status: 'frozen',
        updatedAt: now,
      })
      .where(eq(portfolios.id, freezeId));

    await auditLogger(
      {
        tableName: 'portfolios',
        recordId: freezeId,
        action: 'UPDATE',
        actorId: userId,
        actorType: 'user',
        source: 'manual',
        reason: 'plan_downgrade',
      },
      {
        oldValue: { status: 'active', name: existing.name },
        newValue: { status: 'frozen', name: existing.name },
      },
      { allowlist: ['status', 'name'] },
      tx
    );
  }

  return {
    frozenPortfoliosCount: idsToFreeze.length,
    activePortfoliosCount: idsToKeep.length,
  };
}

/**
 * Operação transacional para alteração de plano de um usuário.
 * Usado em rotinas controladas e testes.
 */
export async function changeUserPlanInTransaction(
  userId: string,
  newPlanId: CommercialPlanId,
  options: {
    status?: UserPlanStatus;
    expiresAt?: Date | null;
    keepPortfolioIds?: string[];
  } = {},
  tx: DatabaseTransaction,
  auditLogger: typeof insertAuditLog = insertAuditLog
): Promise<UserEffectivePlan> {
  const [targetPlan] = await tx
    .select()
    .from(commercialPlans)
    .where(and(eq(commercialPlans.id, newPlanId), eq(commercialPlans.isActive, true)))
    .limit(1);

  if (!targetPlan) {
    throw new PlanNotFoundError(`Plano comercial "${newPlanId}" não encontrado.`);
  }

  // Lock pessimista no usuário
  await tx
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .for('update');

  const [existingUserPlan] = await tx
    .select()
    .from(userPlans)
    .where(eq(userPlans.userId, userId))
    .limit(1);

  const now = new Date();
  const status = options.status ?? 'active';
  const expiresAt = options.expiresAt ?? null;

  if (existingUserPlan) {
    await tx
      .update(userPlans)
      .set({
        planId: newPlanId,
        status,
        expiresAt,
        updatedAt: now,
      })
      .where(eq(userPlans.id, existingUserPlan.id));

    await auditLogger(
      {
        tableName: 'user_plans',
        recordId: existingUserPlan.id,
        action: 'UPDATE',
        actorId: userId,
        actorType: 'user',
        source: 'manual',
        reason: 'plan_change',
      },
      {
        oldValue: {
          planId: existingUserPlan.planId,
          status: existingUserPlan.status,
          expiresAt: existingUserPlan.expiresAt,
        },
        newValue: {
          planId: newPlanId,
          status,
          expiresAt,
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
      planId: newPlanId,
      status,
      startsAt: now,
      expiresAt,
      createdAt: now,
      updatedAt: now,
    });

    await auditLogger(
      {
        tableName: 'user_plans',
        recordId: id,
        action: 'INSERT',
        actorId: userId,
        actorType: 'user',
        source: 'manual',
        reason: 'plan_assignment',
      },
      {
        newValue: {
          planId: newPlanId,
          status,
          expiresAt,
        },
      },
      { allowlist: ['planId', 'status', 'expiresAt'] },
      tx
    );
  }

  // Se o novo plano for FREE, aplica o congelamento de excedentes se necessário
  if (newPlanId === 'free') {
    await applyPlanDowngradeInTransaction(
      userId,
      options.keepPortfolioIds,
      tx,
      auditLogger
    );
  }

  return await getUserEffectivePlan(userId, tx);
}

/**
 * Wrapper público para alteração de plano.
 */
export async function changeUserPlan(
  userId: string,
  newPlanId: CommercialPlanId,
  options: {
    status?: UserPlanStatus;
    expiresAt?: Date | null;
    keepPortfolioIds?: string[];
  } = {},
  database: Database = db,
  auditLogger: typeof insertAuditLog = insertAuditLog
): Promise<UserEffectivePlan> {
  return await database.transaction(async (tx) => {
    return await changeUserPlanInTransaction(
      userId,
      newPlanId,
      options,
      tx,
      auditLogger
    );
  });
}

/**
 * Lista todos os planos comerciais ativos cadastrados no catálogo.
 */
export async function listCommercialPlans(
  executor: DbExecutor = db
): Promise<CommercialPlan[]> {
  const rows = await executor
    .select()
    .from(commercialPlans)
    .where(eq(commercialPlans.isActive, true))
    .orderBy(commercialPlans.maxActivePortfolios);

  return rows.map((r) => ({
    id: r.id as CommercialPlanId,
    name: r.name,
    description: r.description,
    maxActivePortfolios: r.maxActivePortfolios,
    isActive: r.isActive,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}
