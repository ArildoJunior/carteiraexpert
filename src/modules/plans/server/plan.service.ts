import crypto from 'node:crypto';
import { eq, and, isNull, count, desc, inArray, notInArray } from 'drizzle-orm';
import { db, type Database, type DatabaseTransaction, type DbExecutor } from '../../../lib/db';
import { users } from '../../../lib/db/schema/identity';
import { portfolios } from '../../../lib/db/schema/portfolio';
import { commercialPlans, userPlans } from '../../../lib/db/schema/plans';
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
 * Se o usuário não possuir registro em user_plans ou estiver expirado/inadimplente,
 * aplica o fallback gracioso para o plano 'free'.
 */
export async function getUserEffectivePlan(
  userId: string,
  executor: DbExecutor = db
): Promise<UserEffectivePlan> {
  const [userPlanRow] = await executor
    .select()
    .from(userPlans)
    .where(eq(userPlans.userId, userId))
    .limit(1);

  // Fallback padrão se não houver linha de plano
  if (!userPlanRow) {
    return {
      planId: 'free',
      name: 'Plano Free',
      maxActivePortfolios: 2,
      status: 'active',
      isFallback: true,
      expiresAt: null,
    };
  }

  const now = new Date();
  const isPastDue = userPlanRow.status === 'past_due';
  const isExpired = userPlanRow.expiresAt !== null && userPlanRow.expiresAt < now;
  const isCancelledAndExpired = userPlanRow.status === 'cancelled' && (userPlanRow.expiresAt === null || userPlanRow.expiresAt < now);

  // Se estiver cancelado/expirado ou inadimplente, o plano efetivo rebaixa para free
  if (isPastDue || isExpired || isCancelledAndExpired) {
    return {
      planId: 'free',
      name: 'Plano Free',
      maxActivePortfolios: 2,
      status: userPlanRow.status as UserPlanStatus,
      isFallback: true,
      expiresAt: userPlanRow.expiresAt,
    };
  }

  // Busca o plano comercial cadastrado
  const [commercialPlan] = await executor
    .select()
    .from(commercialPlans)
    .where(and(eq(commercialPlans.id, userPlanRow.planId), eq(commercialPlans.isActive, true)))
    .limit(1);

  if (!commercialPlan) {
    return {
      planId: 'free',
      name: 'Plano Free',
      maxActivePortfolios: 2,
      status: userPlanRow.status as UserPlanStatus,
      isFallback: true,
      expiresAt: userPlanRow.expiresAt,
    };
  }

  return {
    planId: commercialPlan.id as CommercialPlanId,
    name: commercialPlan.name,
    maxActivePortfolios: commercialPlan.maxActivePortfolios,
    status: userPlanRow.status as UserPlanStatus,
    isFallback: false,
    expiresAt: userPlanRow.expiresAt,
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

  const availableSlots = Math.max(0, effectivePlan.maxActivePortfolios - activeCount);
  const canCreateMore = activeCount < effectivePlan.maxActivePortfolios;

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
