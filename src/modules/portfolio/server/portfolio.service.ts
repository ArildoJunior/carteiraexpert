import crypto from 'node:crypto';
import { eq, and, isNull, desc } from 'drizzle-orm';
import { db, type Database, type DatabaseTransaction, type DbExecutor } from '../../../lib/db';
import { portfolios } from '../../../lib/db/schema/portfolio';
import { insertAuditLog } from '../../../lib/db/audit';
import { assertOwnership } from '../../identity/server/authorization-service';
import type { SafeUser } from '../../identity/domain/user.types';
import {
  createPortfolioSchema,
  updatePortfolioSchema,
  type CreatePortfolioInput,
  type CreatePortfolioOutput,
  type UpdatePortfolioInput,
  type UpdatePortfolioOutput,
} from '../domain/portfolio.schema';
import type { Portfolio } from '../domain/portfolio.types';
import {
  PortfolioNotFoundError,
  InvalidPortfolioStatusTransitionError,
  DuplicateRealPortfolioError,
} from '../domain/errors';
import {
  assertCanCreatePortfolio,
  assertPortfolioWritable,
} from '../../plans/server/plan.service';
import { createDefaultCashAccountInTransaction } from './cash.service';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Operação transacional de criação de carteira.
 * Recebe obrigatoriamente um DatabaseTransaction ativo.
 */
export async function createPortfolioInTransaction(
  input: CreatePortfolioOutput,
  user: SafeUser,
  tx: DatabaseTransaction,
  auditLogger: typeof insertAuditLog = insertAuditLog
): Promise<Portfolio> {
  // 1. Valida se o usuário pode criar uma nova carteira ativa de acordo com seu plano
  await assertCanCreatePortfolio(user.id, tx);

  // 2. Valida se o usuário já possui uma carteira REAL ativa/não excluída
  if (input.purpose === 'REAL') {
    const existingReal = await tx
      .select({ id: portfolios.id })
      .from(portfolios)
      .where(
        and(
          eq(portfolios.userId, user.id),
          eq(portfolios.purpose, 'REAL'),
          isNull(portfolios.deletedAt)
        )
      )
      .limit(1);

    if (existingReal.length > 0) {
      throw new DuplicateRealPortfolioError();
    }
  }

  const id = crypto.randomUUID();
  const now = new Date();

  let createdPortfolio: Portfolio | undefined;

  try {
    const [res] = await tx
      .insert(portfolios)
      .values({
        id,
        userId: user.id,
        name: input.name,
        description: input.description ?? null,
        baseCurrency: input.baseCurrency,
        status: 'active',
        purpose: input.purpose,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    createdPortfolio = res;
  } catch (err: any) {
    const isTargetConstraint =
      err?.code === '23505' &&
      (err?.constraint === 'idx_unique_user_real_portfolio' ||
        String(err?.detail).includes('idx_unique_user_real_portfolio') ||
        String(err?.message).includes('idx_unique_user_real_portfolio'));

    if (isTargetConstraint) {
      throw new DuplicateRealPortfolioError();
    }
    throw err;
  }

  if (!createdPortfolio) {
    throw new Error('Falha ao criar carteira.');
  }

  await auditLogger(
    {
      tableName: 'portfolios',
      recordId: id,
      action: 'INSERT',
      actorId: user.id,
      actorType: 'user',
      source: 'manual',
    },
    {
      newValue: {
        name: input.name,
        description: input.description ?? null,
        baseCurrency: input.baseCurrency,
        status: 'active',
        purpose: input.purpose,
      },
    },
    { allowlist: ['name', 'description', 'baseCurrency', 'status', 'purpose'] },
    tx
  );

  // Criação automática e transacional da Conta Corrente Principal da carteira
  await createDefaultCashAccountInTransaction(
    createdPortfolio.id,
    createdPortfolio.baseCurrency,
    user.id,
    tx,
    auditLogger
  );

  return createdPortfolio;
}

/**
 * Cria uma nova carteira para o usuário autenticado.
 * A carteira é associada exclusivamente ao user.id resolvido no servidor.
 * Registra evento de auditoria com a criação da entidade.
 */
export async function createPortfolio(
  rawInput: CreatePortfolioInput,
  user: SafeUser,
  database: Database = db,
  auditLogger: typeof insertAuditLog = insertAuditLog
): Promise<Portfolio> {
  const input = createPortfolioSchema.parse(rawInput);
  return await database.transaction(async (tx) => {
    return await createPortfolioInTransaction(input, user, tx, auditLogger);
  });
}

/**
 * Lista todas as carteiras ativas pertencentes exclusivamente ao usuário autenticado.
 * Carteiras com soft delete (deletedAt IS NOT NULL) são filtradas.
 */
export async function listPortfolios(
  user: SafeUser,
  executor: DbExecutor = db
): Promise<Portfolio[]> {
  return await executor
    .select()
    .from(portfolios)
    .where(and(eq(portfolios.userId, user.id), isNull(portfolios.deletedAt)))
    .orderBy(desc(portfolios.createdAt));
}

/**
 * Busca uma carteira ativa pelo ID.
 * Garante validação de titularidade via assertOwnership:
 * - Se não existir ou estiver deletada logicamente: lança PortfolioNotFoundError.
 * - Se pertencer a outro usuário: aciona assertOwnership (gera log de IDOR e lança AuthorizationError).
 */
export async function getPortfolioById(
  id: string,
  user: SafeUser,
  executor: DbExecutor = db
): Promise<Portfolio> {
  if (!id || !UUID_REGEX.test(id)) {
    throw new PortfolioNotFoundError();
  }

  const [portfolio] = await executor
    .select()
    .from(portfolios)
    .where(and(eq(portfolios.id, id), isNull(portfolios.deletedAt)))
    .limit(1);

  if (!portfolio) {
    throw new PortfolioNotFoundError();
  }

  await assertOwnership(portfolio.userId, user, 'portfolio', executor);

  return portfolio;
}

/**
 * Operação transacional de atualização de carteira.
 * Recebe obrigatoriamente um DatabaseTransaction ativo.
 */
export async function updatePortfolioInTransaction(
  id: string,
  input: UpdatePortfolioOutput,
  user: SafeUser,
  tx: DatabaseTransaction,
  auditLogger: typeof insertAuditLog = insertAuditLog
): Promise<Portfolio> {
  if (!id || !UUID_REGEX.test(id)) {
    throw new PortfolioNotFoundError();
  }

  const [existing] = await tx
    .select()
    .from(portfolios)
    .where(and(eq(portfolios.id, id), isNull(portfolios.deletedAt)))
    .limit(1);

  if (!existing) {
    throw new PortfolioNotFoundError();
  }

  await assertOwnership(existing.userId, user, 'portfolio', tx);

  // 1. Rejeição server-side estrita de qualquer tentativa manual de transicionar para 'frozen' (ex: active -> frozen, archived -> frozen)
  if ((input as unknown as { status?: string }).status === 'frozen') {
    throw new InvalidPortfolioStatusTransitionError(
      'Transição manual para o status congelado (frozen) não é permitida.'
    );
  }

  // 2. Validações de estado a partir do status atual da carteira
  if (existing.status === 'frozen') {
    if (input.status === 'active') {
      // Reativação de carteira congelada exige quota de carteiras ativas disponível
      await assertCanCreatePortfolio(user.id, tx);
    } else if (input.status === 'archived') {
      // Transição frozen -> archived é permitida
    } else {
      // Qualquer outra alteração de atributos (nome, descrição) em carteira congelada é bloqueada
      assertPortfolioWritable(existing);
    }
  } else if (existing.status === 'archived' && input.status === 'active') {
    // Reativação de carteira arquivada exige quota de carteiras ativas disponível
    await assertCanCreatePortfolio(user.id, tx);
  }

  const updateData: {
    name?: string;
    description?: string | null;
    status?: 'active' | 'archived';
    purpose?: 'REAL' | 'ESTUDO' | 'ANALISE';
    updatedAt: Date;
  } = {
    updatedAt: new Date(),
  };

  if (input.name !== undefined) {
    updateData.name = input.name;
  }
  if (input.description !== undefined) {
    updateData.description = input.description;
  }
  if (input.status !== undefined) {
    updateData.status = input.status;
  }

  if (input.purpose !== undefined && input.purpose !== existing.purpose) {
    if (input.purpose === 'REAL') {
      const otherReal = await tx
        .select({ id: portfolios.id })
        .from(portfolios)
        .where(
          and(
            eq(portfolios.userId, user.id),
            eq(portfolios.purpose, 'REAL'),
            isNull(portfolios.deletedAt)
          )
        )
        .limit(1);

      if (otherReal.length > 0 && otherReal[0].id !== id) {
        throw new DuplicateRealPortfolioError();
      }
    } else if (existing.purpose === 'REAL') {
      if (!input.confirmPurposeChange) {
        throw new Error(
          'A alteração da finalidade da carteira de Patrimônio Real para Estudo ou Análise remove sua carteira real ativa e requer confirmação explícita.'
        );
      }
    }
    updateData.purpose = input.purpose;
  }

  let updatedPortfolio: Portfolio | undefined;

  try {
    const [res] = await tx
      .update(portfolios)
      .set(updateData)
      .where(
        and(
          eq(portfolios.id, id),
          eq(portfolios.userId, user.id),
          isNull(portfolios.deletedAt)
        )
      )
      .returning();
    updatedPortfolio = res;
  } catch (err: any) {
    const isTargetConstraint =
      err?.code === '23505' &&
      (err?.constraint === 'idx_unique_user_real_portfolio' ||
        String(err?.detail).includes('idx_unique_user_real_portfolio') ||
        String(err?.message).includes('idx_unique_user_real_portfolio'));

    if (isTargetConstraint) {
      throw new DuplicateRealPortfolioError();
    }
    throw err;
  }

  if (!updatedPortfolio) {
    throw new PortfolioNotFoundError();
  }

  await auditLogger(
    {
      tableName: 'portfolios',
      recordId: id,
      action: 'UPDATE',
      actorId: user.id,
      actorType: 'user',
      source: 'manual',
    },
    {
      oldValue: {
        name: existing.name,
        description: existing.description,
        status: existing.status,
        purpose: existing.purpose,
      },
      newValue: {
        name: updatedPortfolio.name,
        description: updatedPortfolio.description,
        status: updatedPortfolio.status,
        purpose: updatedPortfolio.purpose,
      },
    },
    { allowlist: ['name', 'description', 'status', 'purpose'] },
    tx
  );

  return updatedPortfolio;
}

/**
 * Atualiza os dados de uma carteira ativa.
 * Valida a titularidade e registra auditoria com os valores anteriores e novos.
 */
export async function updatePortfolio(
  id: string,
  rawInput: UpdatePortfolioInput,
  user: SafeUser,
  database: Database = db,
  auditLogger: typeof insertAuditLog = insertAuditLog
): Promise<Portfolio> {
  if (!id || !UUID_REGEX.test(id)) {
    throw new PortfolioNotFoundError();
  }

  if ((rawInput as unknown as { status?: string })?.status === 'frozen') {
    throw new InvalidPortfolioStatusTransitionError(
      'Transição manual para o status congelado (frozen) não é permitida.'
    );
  }

  const input = updatePortfolioSchema.parse(rawInput);

  return await database.transaction(async (tx) => {
    return await updatePortfolioInTransaction(id, input, user, tx, auditLogger);
  });
}

/**
 * Operação transacional de exclusão lógica (soft delete) da carteira.
 * Recebe obrigatoriamente um DatabaseTransaction ativo.
 */
export async function deletePortfolioInTransaction(
  id: string,
  user: SafeUser,
  tx: DatabaseTransaction,
  auditLogger: typeof insertAuditLog = insertAuditLog
): Promise<void> {
  if (!id || !UUID_REGEX.test(id)) {
    throw new PortfolioNotFoundError();
  }

  const [existing] = await tx
    .select()
    .from(portfolios)
    .where(and(eq(portfolios.id, id), isNull(portfolios.deletedAt)))
    .limit(1);

  if (!existing) {
    throw new PortfolioNotFoundError();
  }

  await assertOwnership(existing.userId, user, 'portfolio', tx);

  const now = new Date();

  await tx
    .update(portfolios)
    .set({
      deletedAt: now,
      updatedAt: now,
    })
    .where(
      and(
        eq(portfolios.id, id),
        eq(portfolios.userId, user.id),
        isNull(portfolios.deletedAt)
      )
    );

  await auditLogger(
    {
      tableName: 'portfolios',
      recordId: id,
      action: 'DELETE',
      actorId: user.id,
      actorType: 'user',
      source: 'manual',
    },
    {
      oldValue: {
        name: existing.name,
        status: existing.status,
      },
    },
    { allowlist: ['name', 'status'] },
    tx
  );
}

/**
 * Realiza a exclusão lógica (soft delete) da carteira atribuindo deletedAt = NOW().
 * Preserva o histórico financeiro e registra auditoria da deleção lógica.
 */
export async function deletePortfolio(
  id: string,
  user: SafeUser,
  database: Database = db,
  auditLogger: typeof insertAuditLog = insertAuditLog
): Promise<void> {
  if (!id || !UUID_REGEX.test(id)) {
    throw new PortfolioNotFoundError();
  }

  await database.transaction(async (tx) => {
    await deletePortfolioInTransaction(id, user, tx, auditLogger);
  });
}
