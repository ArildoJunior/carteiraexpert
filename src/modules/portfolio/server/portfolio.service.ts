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
import { PortfolioNotFoundError } from '../domain/errors';

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
  const id = crypto.randomUUID();
  const now = new Date();

  const [createdPortfolio] = await tx
    .insert(portfolios)
    .values({
      id,
      userId: user.id,
      name: input.name,
      description: input.description ?? null,
      baseCurrency: input.baseCurrency,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    })
    .returning();

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
      },
    },
    { allowlist: ['name', 'description', 'baseCurrency', 'status'] },
    tx
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

  const updateData: {
    name?: string;
    description?: string | null;
    status?: 'active' | 'archived';
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

  const [updatedPortfolio] = await tx
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
      },
      newValue: {
        name: updatedPortfolio.name,
        description: updatedPortfolio.description,
        status: updatedPortfolio.status,
      },
    },
    { allowlist: ['name', 'description', 'status'] },
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
