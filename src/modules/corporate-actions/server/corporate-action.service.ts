import crypto from 'node:crypto';
import Decimal from 'decimal.js';
import { eq, and, isNull } from 'drizzle-orm';
import { db, type Database, type DatabaseTransaction } from '@/lib/db';
import { insertAuditLog } from '@/lib/db/audit';
import { portfolios, portfolioEvents } from '@/lib/db/schema';
import { getPortfolioById } from '@/modules/portfolio/server/portfolio.service';
import { getAssetById } from '@/modules/portfolio/server/asset.service';
import { assertPortfolioWritable } from '@/modules/plans/server/plan.service';
import {
  validateTimelineConsistency,
  type TimelineEvent,
} from '@/modules/portfolio/domain/position-engine';
import type { SafeUser } from '@/modules/identity/domain/user.types';
import {
  createCorporateActionEventSchema,
  createBonusEventSchema,
  createIncomeEventSchema,
  type CreateCorporateActionEventInput,
  type CreateCorporateActionEventOutput,
  type CreateBonusEventInput,
  type CreateBonusEventOutput,
  type CreateIncomeEventInput,
  type CreateIncomeEventOutput,
  type PortfolioEvent,
} from '../domain';

/**
 * Função interna para inserção transacional de evento corporativo (SPLIT / GROUPING).
 */
export async function createCorporateActionEventInTransaction(
  input: CreateCorporateActionEventOutput,
  user: SafeUser,
  tx: DatabaseTransaction,
  auditLogger: typeof insertAuditLog = insertAuditLog
): Promise<PortfolioEvent> {
  // 1. Valida existência e titularidade da carteira (aciona assertOwnership em caso de IDOR)
  const portfolio = await getPortfolioById(input.portfolioId, user, tx);
  assertPortfolioWritable(portfolio);

  // 2. Valida existência e visibilidade do ativo
  const asset = await getAssetById(input.assetId, user, tx);

  // 3. Aplica lock pessimista na carteira para serializar operações concorrentes
  await tx
    .select()
    .from(portfolios)
    .where(eq(portfolios.id, input.portfolioId))
    .for('update');

  // 4. Busca todos os eventos ativos existentes do mesmo ativo na carteira
  const existingEvents = await tx
    .select()
    .from(portfolioEvents)
    .where(
      and(
        eq(portfolioEvents.portfolioId, input.portfolioId),
        eq(portfolioEvents.assetId, input.assetId),
        isNull(portfolioEvents.deletedAt)
      )
    );

  const activeEvents: TimelineEvent[] = existingEvents.map((e) => ({
    id: e.id,
    portfolioId: e.portfolioId,
    assetId: e.assetId,
    type: e.type,
    tradeDate: e.tradeDate,
    quantity: new Decimal(e.quantity),
    unitPrice: new Decimal(e.unitPrice),
    fees: new Decimal(e.fees || 0),
    deletedAt: e.deletedAt,
    createdAt: e.createdAt,
  }));

  const id = crypto.randomUUID();
  const now = new Date();
  const factorDec = new Decimal(input.factor);

  const prospectiveEvent: TimelineEvent = {
    id,
    portfolioId: input.portfolioId,
    assetId: input.assetId,
    type: input.type,
    tradeDate: input.tradeDate,
    quantity: factorDec.toString(),
    unitPrice: '0',
    fees: '0',
    createdAt: now,
  };

  // 5. Valida a consistência temporal (rejeita desdobramento/grupamento em posições nulas ou insuficientes)
  validateTimelineConsistency(activeEvents, prospectiveEvent);

  // 6. Insere o evento corporativo
  const [createdEvent] = await tx
    .insert(portfolioEvents)
    .values({
      id,
      portfolioId: input.portfolioId,
      assetId: input.assetId,
      type: input.type,
      tradeDate: input.tradeDate,
      settlementDate: null,
      quantity: factorDec.toString(),
      unitPrice: '0.00000000',
      fees: '0.00000000',
      currency: asset.currency || 'BRL',
      notes: input.notes ?? null,
      source: input.source,
      createdBy: user.id,
      createdAt: now,
    })
    .returning();

  if (!createdEvent) {
    throw new Error('Falha ao registrar evento corporativo.');
  }

  // 7. Registra auditoria transacional
  await auditLogger(
    {
      tableName: 'portfolio_events',
      recordId: id,
      action: 'INSERT',
      actorId: user.id,
      actorType: 'user',
      source: 'manual',
    },
    {
      newValue: {
        portfolioId: input.portfolioId,
        assetId: input.assetId,
        type: input.type,
        tradeDate: input.tradeDate.toISOString(),
        settlementDate: null,
        quantity: factorDec.toString(),
        unitPrice: '0.00000000',
        fees: '0.00000000',
        currency: asset.currency || 'BRL',
        source: input.source,
      },
    },
    {
      allowlist: [
        'portfolioId',
        'assetId',
        'type',
        'tradeDate',
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
 * Registra um novo evento corporativo (SPLIT ou GROUPING) na carteira.
 * Valida existência da carteira, titularidade, consistência cronológica e isolamento multiusuário.
 */
export async function createCorporateActionEvent(
  rawInput: CreateCorporateActionEventInput,
  user: SafeUser,
  database: Database = db,
  auditLogger: typeof insertAuditLog = insertAuditLog
): Promise<PortfolioEvent> {
  const input = createCorporateActionEventSchema.parse(rawInput);

  return await database.transaction(async (tx) => {
    return await createCorporateActionEventInTransaction(input, user, tx, auditLogger);
  });
}

/**
 * Operação transacional de registro de bonificação de ações (BONUS_SHARE).
 */
export async function createBonusEventInTransaction(
  input: CreateBonusEventOutput,
  user: SafeUser,
  tx: DatabaseTransaction,
  auditLogger: typeof insertAuditLog = insertAuditLog
): Promise<PortfolioEvent> {
  // 1. Valida existência e titularidade da carteira
  const portfolio = await getPortfolioById(input.portfolioId, user, tx);
  assertPortfolioWritable(portfolio);

  // 2. Valida existência e acesso ao ativo
  const asset = await getAssetById(input.assetId, user, tx);

  // 3. Lock pessimista na carteira
  await tx
    .select({ id: portfolios.id })
    .from(portfolios)
    .where(eq(portfolios.id, input.portfolioId))
    .for('update');

  const id = crypto.randomUUID();
  const now = new Date();

  // 4. Busca eventos ativos do ativo nesta carteira
  const activeEvents = await tx
    .select()
    .from(portfolioEvents)
    .where(
      and(
        eq(portfolioEvents.portfolioId, input.portfolioId),
        eq(portfolioEvents.assetId, input.assetId),
        isNull(portfolioEvents.deletedAt)
      )
    );

  const prospectiveEvent: TimelineEvent = {
    id,
    portfolioId: input.portfolioId,
    assetId: input.assetId,
    type: 'BONUS_SHARE',
    tradeDate: input.tradeDate,
    quantity: input.quantity,
    unitPrice: input.unitPrice,
    fees: '0',
    createdAt: now,
  };

  // 5. Valida consistência temporal (rejeita bonificação em posições nulas)
  validateTimelineConsistency(activeEvents, prospectiveEvent);

  // 6. Insere o evento de bonificação
  const [createdEvent] = await tx
    .insert(portfolioEvents)
    .values({
      id,
      portfolioId: input.portfolioId,
      assetId: input.assetId,
      type: 'BONUS_SHARE',
      tradeDate: input.tradeDate,
      settlementDate: null,
      quantity: input.quantity.toString(),
      unitPrice: input.unitPrice.toString(),
      fees: '0.00000000',
      currency: asset.currency || 'BRL',
      notes: input.notes ?? null,
      source: input.source,
      createdBy: user.id,
      createdAt: now,
    })
    .returning();

  if (!createdEvent) {
    throw new Error('Falha ao registrar bonificação de ações.');
  }

  // 7. Registra auditoria transacional
  await auditLogger(
    {
      tableName: 'portfolio_events',
      recordId: id,
      action: 'INSERT',
      actorId: user.id,
      actorType: 'user',
      source: 'manual',
    },
    {
      newValue: {
        portfolioId: input.portfolioId,
        assetId: input.assetId,
        type: 'BONUS_SHARE',
        tradeDate: input.tradeDate.toISOString(),
        quantity: input.quantity.toString(),
        unitPrice: input.unitPrice.toString(),
        fees: '0.00000000',
        currency: asset.currency || 'BRL',
        source: input.source,
      },
    },
    {
      allowlist: [
        'portfolioId',
        'assetId',
        'type',
        'tradeDate',
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
 * Registra um evento de bonificação de ações (BONUS_SHARE).
 */
export async function createBonusEvent(
  rawInput: CreateBonusEventInput,
  user: SafeUser,
  database: Database = db,
  auditLogger: typeof insertAuditLog = insertAuditLog
): Promise<PortfolioEvent> {
  const input = createBonusEventSchema.parse(rawInput);

  return await database.transaction(async (tx) => {
    return await createBonusEventInTransaction(input, user, tx, auditLogger);
  });
}

/**
 * Operação transacional de registro de proventos em dinheiro (DIVIDEND ou JCP).
 */
export async function createIncomeEventInTransaction(
  input: CreateIncomeEventOutput,
  user: SafeUser,
  tx: DatabaseTransaction,
  auditLogger: typeof insertAuditLog = insertAuditLog
): Promise<PortfolioEvent> {
  // 1. Valida existência e titularidade da carteira
  const portfolio = await getPortfolioById(input.portfolioId, user, tx);
  assertPortfolioWritable(portfolio);

  // 2. Valida existência e acesso ao ativo
  const asset = await getAssetById(input.assetId, user, tx);

  // 3. Lock pessimista na carteira
  await tx
    .select({ id: portfolios.id })
    .from(portfolios)
    .where(eq(portfolios.id, input.portfolioId))
    .for('update');

  const id = crypto.randomUUID();
  const now = new Date();

  // 4. Busca eventos ativos do ativo nesta carteira
  const activeEvents = await tx
    .select()
    .from(portfolioEvents)
    .where(
      and(
        eq(portfolioEvents.portfolioId, input.portfolioId),
        eq(portfolioEvents.assetId, input.assetId),
        isNull(portfolioEvents.deletedAt)
      )
    );

  const prospectiveEvent: TimelineEvent = {
    id,
    portfolioId: input.portfolioId,
    assetId: input.assetId,
    type: input.type,
    tradeDate: input.tradeDate,
    quantity: input.quantity,
    unitPrice: input.unitPrice,
    fees: input.fees,
    createdAt: now,
  };

  // 5. Valida consistência temporal (custódia na Data-Com e quantidade elegível)
  validateTimelineConsistency(activeEvents, prospectiveEvent);

  // 6. Insere o evento de provento
  const [createdEvent] = await tx
    .insert(portfolioEvents)
    .values({
      id,
      portfolioId: input.portfolioId,
      assetId: input.assetId,
      type: input.type,
      tradeDate: input.tradeDate,
      settlementDate: input.settlementDate,
      quantity: input.quantity.toString(),
      unitPrice: input.unitPrice.toString(),
      fees: input.fees.toString(),
      currency: asset.currency || 'BRL',
      notes: input.notes ?? null,
      source: input.source,
      createdBy: user.id,
      createdAt: now,
    })
    .returning();

  if (!createdEvent) {
    throw new Error('Falha ao registrar provento.');
  }

  // 7. Registra auditoria transacional
  await auditLogger(
    {
      tableName: 'portfolio_events',
      recordId: id,
      action: 'INSERT',
      actorId: user.id,
      actorType: 'user',
      source: 'manual',
    },
    {
      newValue: {
        portfolioId: input.portfolioId,
        assetId: input.assetId,
        type: input.type,
        tradeDate: input.tradeDate.toISOString(),
        settlementDate: input.settlementDate.toISOString(),
        quantity: input.quantity.toString(),
        unitPrice: input.unitPrice.toString(),
        fees: input.fees.toString(),
        currency: asset.currency || 'BRL',
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
 * Registra um evento de provento em dinheiro (DIVIDEND ou JCP).
 */
export async function createIncomeEvent(
  rawInput: CreateIncomeEventInput,
  user: SafeUser,
  database: Database = db,
  auditLogger: typeof insertAuditLog = insertAuditLog
): Promise<PortfolioEvent> {
  const input = createIncomeEventSchema.parse(rawInput);

  return await database.transaction(async (tx) => {
    return await createIncomeEventInTransaction(input, user, tx, auditLogger);
  });
}
