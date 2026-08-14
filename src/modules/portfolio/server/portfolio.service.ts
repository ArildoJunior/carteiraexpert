import crypto from 'node:crypto';
import { eq, and, isNull, desc } from 'drizzle-orm';
import { db } from '../../../lib/db';
import { portfolios } from '../../../lib/db/schema/portfolio';
import { insertAuditLog } from '../../../lib/db/audit';
import { assertOwnership } from '../../identity/server/authorization-service';
import type { SafeUser } from '../../identity/domain/user.types';
import {
  createPortfolioSchema,
  updatePortfolioSchema,
  type CreatePortfolioInput,
  type UpdatePortfolioInput,
} from '../domain/portfolio.schema';
import type { Portfolio } from '../domain/portfolio.types';
import { PortfolioNotFoundError } from '../domain/errors';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Cria uma nova carteira para o usuário autenticado.
 * A carteira é associada exclusivamente ao user.id resolvido no servidor.
 * Registra evento de auditoria com a criação da entidade.
 */
export async function createPortfolio(
  rawInput: CreatePortfolioInput,
  user: SafeUser,
  executor: any = db
): Promise<Portfolio> {
  const input = createPortfolioSchema.parse(rawInput);
  const id = crypto.randomUUID();
  const now = new Date();

  let createdPortfolio: Portfolio | null = null;

  const runOperation = async (tx: any) => {
    const [row] = await tx
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

    createdPortfolio = row;

    await insertAuditLog(
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
  };

  if (typeof executor.transaction === 'function') {
    await executor.transaction(runOperation);
  } else {
    await runOperation(executor);
  }

  if (!createdPortfolio) {
    throw new Error('Falha ao criar carteira.');
  }

  return createdPortfolio;
}

/**
 * Lista todas as carteiras ativas pertencentes exclusivamente ao usuário autenticado.
 * Carteiras com soft delete (deletedAt IS NOT NULL) são filtradas.
 */
export async function listPortfolios(
  user: SafeUser,
  executor: any = db
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
  executor: any = db
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
 * Atualiza os dados de uma carteira ativa.
 * Valida a titularidade e registra auditoria com os valores anteriores e novos.
 */
export async function updatePortfolio(
  id: string,
  rawInput: UpdatePortfolioInput,
  user: SafeUser,
  executor: any = db
): Promise<Portfolio> {
  if (!id || !UUID_REGEX.test(id)) {
    throw new PortfolioNotFoundError();
  }

  const input = updatePortfolioSchema.parse(rawInput);

  const [existing] = await executor
    .select()
    .from(portfolios)
    .where(and(eq(portfolios.id, id), isNull(portfolios.deletedAt)))
    .limit(1);

  if (!existing) {
    throw new PortfolioNotFoundError();
  }

  await assertOwnership(existing.userId, user, 'portfolio', executor);

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

  let updatedPortfolio: Portfolio | null = null;

  const runOperation = async (tx: any) => {
    const [row] = await tx
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

    updatedPortfolio = row;

    await insertAuditLog(
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
          name: row.name,
          description: row.description,
          status: row.status,
        },
      },
      { allowlist: ['name', 'description', 'status'] },
      tx
    );
  };

  if (typeof executor.transaction === 'function') {
    await executor.transaction(runOperation);
  } else {
    await runOperation(executor);
  }

  if (!updatedPortfolio) {
    throw new PortfolioNotFoundError();
  }

  return updatedPortfolio;
}

/**
 * Realiza a exclusão lógica (soft delete) da carteira atribuindo deletedAt = NOW().
 * Preserva o histórico financeiro e registra auditoria da deleção lógica.
 */
export async function deletePortfolio(
  id: string,
  user: SafeUser,
  executor: any = db
): Promise<void> {
  if (!id || !UUID_REGEX.test(id)) {
    throw new PortfolioNotFoundError();
  }

  const [existing] = await executor
    .select()
    .from(portfolios)
    .where(and(eq(portfolios.id, id), isNull(portfolios.deletedAt)))
    .limit(1);

  if (!existing) {
    throw new PortfolioNotFoundError();
  }

  await assertOwnership(existing.userId, user, 'portfolio', executor);

  const now = new Date();

  const runOperation = async (tx: any) => {
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

    await insertAuditLog(
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
  };

  if (typeof executor.transaction === 'function') {
    await executor.transaction(runOperation);
  } else {
    await runOperation(executor);
  }
}
