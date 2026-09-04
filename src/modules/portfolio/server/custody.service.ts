import { eq, and, isNull, asc } from 'drizzle-orm';
import { db, type Database, type DatabaseTransaction } from '@/lib/db';
import { custodyInstitutions, custodyAccounts } from '@/lib/db/schema/custody';
import { portfolios } from '@/lib/db/schema/portfolio';
import { insertAuditLog } from '@/lib/db/audit';
import type { SafeUser } from '@/modules/identity/domain/user.types';
import { assertOwnership } from '@/modules/identity/server/authorization-service';
import { assertPortfolioWritable } from '@/modules/plans/server/plan.service';
import type {
  CustodyInstitution,
  CustodyAccountWithInstitution,
  SerializedCustodyInstitution,
  SerializedCustodyAccount,
} from '../domain/custody.types';
import {
  createCustodyAccountSchema,
  updateCustodyAccountSchema,
  archiveCustodyAccountSchema,
  type CreateCustodyAccountInput,
  type UpdateCustodyAccountInput,
  type ArchiveCustodyAccountInput,
} from '../domain/custody.schema';
import {
  CustodyInstitutionNotFoundError,
  CustodyAccountNotFoundError,
  CustodyAccountArchivedError,
  PortfolioNotFoundError,
} from '../domain/errors';

export function serializeCustodyInstitution(
  inst: CustodyInstitution
): SerializedCustodyInstitution {
  return {
    id: inst.id,
    name: inst.name,
    code: inst.code,
    country: inst.country,
    status: inst.status,
    createdAt: inst.createdAt.toISOString(),
    updatedAt: inst.updatedAt.toISOString(),
  };
}

export function serializeCustodyAccount(
  acc: CustodyAccountWithInstitution
): SerializedCustodyAccount {
  return {
    id: acc.id,
    portfolioId: acc.portfolioId,
    institutionId: acc.institutionId,
    name: acc.name,
    accountNumber: acc.accountNumber,
    status: acc.status,
    createdAt: acc.createdAt.toISOString(),
    updatedAt: acc.updatedAt.toISOString(),
    deletedAt: acc.deletedAt ? acc.deletedAt.toISOString() : null,
    institution: serializeCustodyInstitution(acc.institution),
  };
}

/**
 * Consulta todas as instituições de custódia ativas no catálogo.
 */
export async function getCustodyInstitutions(
  executor: Database | DatabaseTransaction = db
): Promise<CustodyInstitution[]> {
  const rows = await executor
    .select()
    .from(custodyInstitutions)
    .where(eq(custodyInstitutions.status, 'active'))
    .orderBy(asc(custodyInstitutions.name));

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    code: r.code,
    country: r.country,
    status: r.status as 'active' | 'inactive',
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  }));
}

/**
 * Lista as contas de custódia vinculadas a uma carteira, validando titularidade.
 */
export async function getCustodyAccountsByPortfolio(
  portfolioId: string,
  user: SafeUser,
  executor: Database | DatabaseTransaction = db
): Promise<CustodyAccountWithInstitution[]> {
  const portfolioRows = await executor
    .select()
    .from(portfolios)
    .where(and(eq(portfolios.id, portfolioId), isNull(portfolios.deletedAt)))
    .limit(1);

  if (portfolioRows.length === 0) {
    throw new PortfolioNotFoundError();
  }

  const portfolio = portfolioRows[0];
  await assertOwnership(portfolio.userId, user, 'portfolio', executor);

  const rows = await executor
    .select({
      account: custodyAccounts,
      institution: custodyInstitutions,
    })
    .from(custodyAccounts)
    .innerJoin(
      custodyInstitutions,
      eq(custodyAccounts.institutionId, custodyInstitutions.id)
    )
    .where(
      and(
        eq(custodyAccounts.portfolioId, portfolioId),
        isNull(custodyAccounts.deletedAt)
      )
    )
    .orderBy(asc(custodyAccounts.createdAt));

  return rows.map(({ account, institution }) => ({
    id: account.id,
    portfolioId: account.portfolioId,
    institutionId: account.institutionId,
    name: account.name,
    accountNumber: account.accountNumber,
    status: account.status as 'active' | 'archived',
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
    deletedAt: account.deletedAt,
    institution: {
      id: institution.id,
      name: institution.name,
      code: institution.code,
      country: institution.country,
      status: institution.status as 'active' | 'inactive',
      createdAt: institution.createdAt,
      updatedAt: institution.updatedAt,
    },
  }));
}

/**
 * Lista todas as contas de custódia ativas associadas a carteiras do usuário.
 * Útil para filtros globais de histórico e visão patrimonial consolidada com proteção IDOR total.
 */
export async function getCustodyAccountsByUser(
  user: SafeUser,
  executor: Database | DatabaseTransaction = db
): Promise<CustodyAccountWithInstitution[]> {
  const rows = await executor
    .select({
      account: custodyAccounts,
      institution: custodyInstitutions,
    })
    .from(custodyAccounts)
    .innerJoin(
      custodyInstitutions,
      eq(custodyAccounts.institutionId, custodyInstitutions.id)
    )
    .innerJoin(portfolios, eq(custodyAccounts.portfolioId, portfolios.id))
    .where(
      and(
        eq(portfolios.userId, user.id),
        isNull(portfolios.deletedAt),
        isNull(custodyAccounts.deletedAt)
      )
    )
    .orderBy(asc(custodyInstitutions.name), asc(custodyAccounts.name));

  return rows.map(({ account, institution }) => ({
    id: account.id,
    portfolioId: account.portfolioId,
    institutionId: account.institutionId,
    name: account.name,
    accountNumber: account.accountNumber,
    status: account.status as 'active' | 'archived',
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
    deletedAt: account.deletedAt,
    institution: {
      id: institution.id,
      name: institution.name,
      code: institution.code,
      country: institution.country,
      status: institution.status as 'active' | 'inactive',
      createdAt: institution.createdAt,
      updatedAt: institution.updatedAt,
    },
  }));
}

/**
 * Consulta uma conta de custódia por ID validando titularidade da carteira pai.
 */
export async function getCustodyAccountById(
  id: string,
  user: SafeUser,
  executor: Database | DatabaseTransaction = db
): Promise<CustodyAccountWithInstitution> {
  const rows = await executor
    .select({
      account: custodyAccounts,
      institution: custodyInstitutions,
      portfolio: portfolios,
    })
    .from(custodyAccounts)
    .innerJoin(
      custodyInstitutions,
      eq(custodyAccounts.institutionId, custodyInstitutions.id)
    )
    .innerJoin(portfolios, eq(custodyAccounts.portfolioId, portfolios.id))
    .where(
      and(eq(custodyAccounts.id, id), isNull(custodyAccounts.deletedAt))
    )
    .limit(1);

  if (rows.length === 0) {
    throw new CustodyAccountNotFoundError();
  }

  const { account, institution, portfolio } = rows[0];
  await assertOwnership(portfolio.userId, user, 'custody_account', executor);

  return {
    id: account.id,
    portfolioId: account.portfolioId,
    institutionId: account.institutionId,
    name: account.name,
    accountNumber: account.accountNumber,
    status: account.status as 'active' | 'archived',
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
    deletedAt: account.deletedAt,
    institution: {
      id: institution.id,
      name: institution.name,
      code: institution.code,
      country: institution.country,
      status: institution.status as 'active' | 'inactive',
      createdAt: institution.createdAt,
      updatedAt: institution.updatedAt,
    },
  };
}

/**
 * Cadastra uma nova conta de custódia formal para a carteira.
 */
export async function createCustodyAccount(
  rawInput: CreateCustodyAccountInput,
  user: SafeUser,
  executor: Database | DatabaseTransaction = db
): Promise<CustodyAccountWithInstitution> {
  const data = createCustodyAccountSchema.parse(rawInput);

  const portfolioRows = await executor
    .select()
    .from(portfolios)
    .where(and(eq(portfolios.id, data.portfolioId), isNull(portfolios.deletedAt)))
    .limit(1);

  if (portfolioRows.length === 0) {
    throw new PortfolioNotFoundError();
  }

  const portfolio = portfolioRows[0];
  await assertOwnership(portfolio.userId, user, 'portfolio', executor);
  assertPortfolioWritable(portfolio);

  const instRows = await executor
    .select()
    .from(custodyInstitutions)
    .where(
      and(
        eq(custodyInstitutions.id, data.institutionId),
        eq(custodyInstitutions.status, 'active')
      )
    )
    .limit(1);

  if (instRows.length === 0) {
    throw new CustodyInstitutionNotFoundError();
  }

  const institution = instRows[0];
  const id = crypto.randomUUID();
  const now = new Date();

  const [created] = await executor
    .insert(custodyAccounts)
    .values({
      id,
      portfolioId: data.portfolioId,
      institutionId: data.institutionId,
      name: data.name,
      accountNumber: data.accountNumber ?? null,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  await insertAuditLog(
    {
      tableName: 'custody_accounts',
      recordId: id,
      action: 'INSERT',
      actorId: user.id,
      actorType: 'user',
      source: 'manual',
    },
    {
      newValue: {
        portfolioId: data.portfolioId,
        institutionId: data.institutionId,
        name: data.name,
        accountNumber: data.accountNumber ?? null,
        status: 'active',
      },
    },
    { allowlist: ['portfolioId', 'institutionId', 'name', 'accountNumber', 'status'] },
    executor
  );

  return {
    id: created.id,
    portfolioId: created.portfolioId,
    institutionId: created.institutionId,
    name: created.name,
    accountNumber: created.accountNumber,
    status: created.status as 'active' | 'archived',
    createdAt: created.createdAt,
    updatedAt: created.updatedAt,
    deletedAt: created.deletedAt,
    institution: {
      id: institution.id,
      name: institution.name,
      code: institution.code,
      country: institution.country,
      status: institution.status as 'active' | 'inactive',
      createdAt: institution.createdAt,
      updatedAt: institution.updatedAt,
    },
  };
}

/**
 * Atualiza dados de uma conta de custódia (ex: nome, número ou status).
 */
export async function updateCustodyAccount(
  rawInput: UpdateCustodyAccountInput,
  user: SafeUser,
  executor: Database | DatabaseTransaction = db
): Promise<CustodyAccountWithInstitution> {
  const data = updateCustodyAccountSchema.parse(rawInput);

  const existing = await getCustodyAccountById(data.id, user, executor);
  if (existing.portfolioId !== data.portfolioId) {
    throw new CustodyAccountNotFoundError('Conta de custódia não pertence à carteira informada.');
  }

  const [portfolio] = await executor
    .select()
    .from(portfolios)
    .where(and(eq(portfolios.id, data.portfolioId), isNull(portfolios.deletedAt)))
    .limit(1);
  if (!portfolio) {
    throw new PortfolioNotFoundError();
  }
  await assertOwnership(portfolio.userId, user, 'portfolio', executor);
  assertPortfolioWritable(portfolio);

  const updateFields: Partial<typeof custodyAccounts.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (data.name !== undefined) updateFields.name = data.name;
  if (data.accountNumber !== undefined) updateFields.accountNumber = data.accountNumber;
  if (data.status !== undefined) updateFields.status = data.status;

  const [updated] = await executor
    .update(custodyAccounts)
    .set(updateFields)
    .where(eq(custodyAccounts.id, data.id))
    .returning();

  await insertAuditLog(
    {
      tableName: 'custody_accounts',
      recordId: data.id,
      action: 'UPDATE',
      actorId: user.id,
      actorType: 'user',
      source: 'manual',
    },
    {
      oldValue: {
        name: existing.name,
        accountNumber: existing.accountNumber,
        status: existing.status,
      },
      newValue: {
        name: updated.name,
        accountNumber: updated.accountNumber,
        status: updated.status,
      },
    },
    { allowlist: ['name', 'accountNumber', 'status'] },
    executor
  );

  return {
    ...existing,
    name: updated.name,
    accountNumber: updated.accountNumber,
    status: updated.status as 'active' | 'archived',
    updatedAt: updated.updatedAt,
  };
}

/**
 * Arquiva uma conta de custódia.
 */
export async function archiveCustodyAccount(
  rawInput: ArchiveCustodyAccountInput,
  user: SafeUser,
  executor: Database | DatabaseTransaction = db
): Promise<CustodyAccountWithInstitution> {
  const data = archiveCustodyAccountSchema.parse(rawInput);
  return updateCustodyAccount({ ...data, status: 'archived' }, user, executor);
}
