import crypto from 'node:crypto';
import { eq, and, isNull, desc, gte, lte } from 'drizzle-orm';
import { db, type Database, type DatabaseTransaction, type DbExecutor } from '../../../lib/db';
import { portfolioEvents, portfolios } from '../../../lib/db/schema/portfolio';
import { insertAuditLog } from '../../../lib/db/audit';
import { assertOwnership } from '../../identity/server/authorization-service';
import type { SafeUser } from '../../identity/domain/user.types';
import {
  createPortfolioEventSchema,
  cancelPortfolioEventSchema,
  listPortfolioEventsSchema,
  type CreatePortfolioEventInput,
  type CreatePortfolioEventOutput,
  type CancelPortfolioEventInput,
  type CancelPortfolioEventOutput,
  type ListPortfolioEventsInput,
} from '../domain/portfolio-event.schema';
import type { PortfolioEvent } from '../domain/portfolio-event.types';
import {
  PortfolioEventNotFoundError,
  PortfolioNotFoundError,
} from '../domain/errors';
import { getPortfolioById } from './portfolio.service';
import { getAssetById } from './asset.service';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Operação transacional de registro de evento financeiro na carteira.
 * Recebe obrigatoriamente um DatabaseTransaction ativo.
 */
export async function createPortfolioEventInTransaction(
  input: CreatePortfolioEventOutput,
  user: SafeUser,
  tx: DatabaseTransaction,
  auditLogger: typeof insertAuditLog = insertAuditLog
): Promise<PortfolioEvent> {
  // 1. Valida que a carteira existe e pertence ao usuário
  await getPortfolioById(input.portfolioId, user, tx);

  // 2. Valida que o ativo existe e é acessível ao usuário (global ou customizado próprio)
  await getAssetById(input.assetId, user, tx);

  const id = crypto.randomUUID();
  const now = new Date();

  // 3. Insere o evento financeiro
  const [createdEvent] = await tx
    .insert(portfolioEvents)
    .values({
      id,
      portfolioId: input.portfolioId,
      assetId: input.assetId,
      type: input.type,
      tradeDate: input.tradeDate,
      settlementDate: input.settlementDate ?? null,
      quantity: input.quantity.toString(),
      unitPrice: input.unitPrice.toString(),
      fees: input.fees.toString(),
      currency: input.currency,
      notes: input.notes ?? null,
      source: input.source,
      createdBy: user.id,
      createdAt: now,
    })
    .returning();

  if (!createdEvent) {
    throw new Error('Falha ao registrar evento financeiro.');
  }

  // 4. Registra auditoria transacional
  await auditLogger(
    {
      tableName: 'portfolio_events',
      recordId: id,
      action: 'INSERT',
      actorId: user.id,
      actorType: 'user',
      source: input.source === 'import' ? 'import' : 'manual',
    },
    {
      newValue: {
        portfolioId: input.portfolioId,
        assetId: input.assetId,
        type: input.type,
        tradeDate: input.tradeDate.toISOString(),
        settlementDate: input.settlementDate?.toISOString() ?? null,
        quantity: input.quantity.toString(),
        unitPrice: input.unitPrice.toString(),
        fees: input.fees.toString(),
        currency: input.currency,
        source: input.source,
      },
    },
    {
      allowlist: [
        'portfolioId',
        'assetId',
        'type',
        'tradeDate',
        'settlementDate',
        'quantity',
        'unitPrice',
        'fees',
        'currency',
        'source',
      ],
    },
    tx
  );

  return createdEvent;
}

/**
 * Registra um novo evento financeiro na carteira.
 * Valida rigorosamente:
 * 1. Existência e titularidade da carteira (deve pertencer ao usuário);
 * 2. Existência e visibilidade do ativo (global ou customizado do usuário);
 * 3. Persistência em bloco transacional com valores Decimal preservados;
 * 4. Gravação de auditoria com allowlist.
 */
export async function createPortfolioEvent(
  rawInput: CreatePortfolioEventInput,
  user: SafeUser,
  database: Database = db,
  auditLogger: typeof insertAuditLog = insertAuditLog
): Promise<PortfolioEvent> {
  const input = createPortfolioEventSchema.parse(rawInput);

  return await database.transaction(async (tx) => {
    return await createPortfolioEventInTransaction(input, user, tx, auditLogger);
  });
}

/**
 * Lista todos os eventos ativos de uma carteira.
 * Valida a titularidade da carteira (impede IDOR) e filtra registros cancelados (deletedAt IS NOT NULL).
 * Suporta filtros opcionais por tipo de evento e intervalo de datas.
 * Ordena por tradeDate DESC, createdAt DESC com limites server-side (default: 50, max: 100).
 */
export async function listPortfolioEventsByPortfolio(
  portfolioId: string,
  user: SafeUser,
  rawOptions: ListPortfolioEventsInput = {},
  executor: DbExecutor = db
): Promise<PortfolioEvent[]> {
  if (!portfolioId || !UUID_REGEX.test(portfolioId)) {
    throw new PortfolioNotFoundError();
  }

  // Valida que a carteira existe e pertence ao usuário (aciona assertOwnership em caso de IDOR)
  await getPortfolioById(portfolioId, user, executor);

  const options = listPortfolioEventsSchema.parse(rawOptions);

  const conditions = [
    eq(portfolioEvents.portfolioId, portfolioId),
    isNull(portfolioEvents.deletedAt),
  ];

  if (options.type) {
    conditions.push(eq(portfolioEvents.type, options.type));
  }

  if (options.startDate) {
    conditions.push(gte(portfolioEvents.tradeDate, options.startDate));
  }

  if (options.endDate) {
    conditions.push(lte(portfolioEvents.tradeDate, options.endDate));
  }

  return await executor
    .select()
    .from(portfolioEvents)
    .where(and(...conditions))
    .orderBy(desc(portfolioEvents.tradeDate), desc(portfolioEvents.createdAt))
    .limit(options.limit);
}

/**
 * Busca um evento financeiro pelo ID.
 * Valida que o evento existe, não foi cancelado e pertence a uma carteira do usuário.
 * Tentativas de acesso a eventos de outros usuários acionam assertOwnership (gerando log de IDOR).
 */
export async function getPortfolioEventById(
  id: string,
  user: SafeUser,
  executor: DbExecutor = db
): Promise<PortfolioEvent> {
  if (!id || !UUID_REGEX.test(id)) {
    throw new PortfolioEventNotFoundError();
  }

  const [event] = await executor
    .select()
    .from(portfolioEvents)
    .where(and(eq(portfolioEvents.id, id), isNull(portfolioEvents.deletedAt)))
    .limit(1);

  if (!event) {
    throw new PortfolioEventNotFoundError();
  }

  // Valida a titularidade da carteira associada
  const [portfolio] = await executor
    .select({ userId: portfolios.userId })
    .from(portfolios)
    .where(eq(portfolios.id, event.portfolioId))
    .limit(1);

  if (!portfolio) {
    throw new PortfolioEventNotFoundError();
  }

  await assertOwnership(portfolio.userId, user, 'portfolio_event', executor);

  return event;
}

/**
 * Operação transacional de cancelamento lógico (soft delete) de evento financeiro.
 * Recebe obrigatoriamente um DatabaseTransaction ativo.
 */
export async function cancelPortfolioEventInTransaction(
  id: string,
  input: CancelPortfolioEventOutput,
  user: SafeUser,
  tx: DatabaseTransaction,
  auditLogger: typeof insertAuditLog = insertAuditLog
): Promise<void> {
  if (!id || !UUID_REGEX.test(id)) {
    throw new PortfolioEventNotFoundError();
  }

  // 1. Busca o evento ativo
  const [existing] = await tx
    .select()
    .from(portfolioEvents)
    .where(and(eq(portfolioEvents.id, id), isNull(portfolioEvents.deletedAt)))
    .limit(1);

  if (!existing) {
    throw new PortfolioEventNotFoundError();
  }

  // 2. Valida titularidade da carteira
  const [portfolio] = await tx
    .select({ userId: portfolios.userId })
    .from(portfolios)
    .where(eq(portfolios.id, existing.portfolioId))
    .limit(1);

  if (!portfolio) {
    throw new PortfolioEventNotFoundError();
  }

  await assertOwnership(portfolio.userId, user, 'portfolio_event', tx);

  const now = new Date();

  // 3. Atualiza evento com soft delete e justificativa
  await tx
    .update(portfolioEvents)
    .set({
      deletedAt: now,
      cancellationReason: input.cancellationReason,
    })
    .where(and(eq(portfolioEvents.id, id), isNull(portfolioEvents.deletedAt)));

  // 4. Grava auditoria transacional
  await auditLogger(
    {
      tableName: 'portfolio_events',
      recordId: id,
      action: 'DELETE',
      actorId: user.id,
      actorType: 'user',
      reason: input.cancellationReason,
      source: 'manual',
    },
    {
      oldValue: {
        portfolioId: existing.portfolioId,
        assetId: existing.assetId,
        type: existing.type,
        quantity: existing.quantity,
        unitPrice: existing.unitPrice,
      },
      newValue: {
        deletedAt: now.toISOString(),
        cancellationReason: input.cancellationReason,
      },
    },
    {
      allowlist: [
        'portfolioId',
        'assetId',
        'type',
        'quantity',
        'unitPrice',
        'deletedAt',
        'cancellationReason',
      ],
    },
    tx
  );
}

/**
 * Cancela logicamente (soft delete) um evento financeiro da carteira.
 * Exige justificativa obrigatória (entre 5 e 500 caracteres).
 * Valida titularidade e registra auditoria com a justificativa em bloco transacional.
 */
export async function cancelPortfolioEvent(
  id: string,
  rawInput: CancelPortfolioEventInput,
  user: SafeUser,
  database: Database = db,
  auditLogger: typeof insertAuditLog = insertAuditLog
): Promise<void> {
  if (!id || !UUID_REGEX.test(id)) {
    throw new PortfolioEventNotFoundError();
  }

  const input = cancelPortfolioEventSchema.parse(rawInput);

  await database.transaction(async (tx) => {
    await cancelPortfolioEventInTransaction(id, input, user, tx, auditLogger);
  });
}
