import crypto from 'node:crypto';
import { eq, and, isNull, asc } from 'drizzle-orm';
import { db, type Database, type DatabaseTransaction } from '@/lib/db';
import { optionsContracts } from '@/lib/db/schema/options';
import { portfolios, assets } from '@/lib/db/schema/portfolio';
import { custodyAccounts } from '@/lib/db/schema/custody';
import { insertAuditLog } from '@/lib/db/audit';
import { assertOwnership } from '@/modules/identity/server/authorization-service';
import { assertPortfolioWritable } from '@/modules/plans/server/plan.service';
import type { SafeUser } from '@/modules/identity/domain/user.types';
import { Decimal, toDecimal } from '@/lib/decimal';
import type {
  OptionContract,
  OptionStatus,
  OptionProximityAlert,
  GreeksResult,
  PayoffAnalysis,
  ExpirationCalculation,
} from '../domain/options.types';
import {
  createOptionContractSchema,
  type CreateOptionContractInput,
} from '../domain/options.schema';
import {
  calculateBlackScholesGreeks,
  calculatePayoffAnalysis,
} from '../domain/black-scholes-engine';
import {
  calculateExpirationStatus,
  generateProximityAlert,
  calculateB3BusinessDays,
} from '../domain/expiration-calendar';
import {
  OptionContractNotFoundError,
  UnderlyingAssetNotFoundError,
} from '../domain/errors';
import { PortfolioNotFoundError } from '@/modules/portfolio/domain/errors';

/**
 * Consulta e lista os contratos de opções do usuário autenticado.
 */
export async function listUserOptions(
  user: SafeUser,
  filters?: { portfolioId?: string; status?: OptionStatus },
  executor: Database | DatabaseTransaction = db
): Promise<OptionContract[]> {
  if (filters?.portfolioId) {
    const portfolioRows = await executor
      .select()
      .from(portfolios)
      .where(and(eq(portfolios.id, filters.portfolioId), isNull(portfolios.deletedAt)))
      .limit(1);

    if (portfolioRows.length === 0) {
      throw new PortfolioNotFoundError();
    }
    await assertOwnership(portfolioRows[0].userId, user, 'portfolio', executor);
  }

  const query = executor
    .select({
      contract: optionsContracts,
      underlyingAsset: {
        id: assets.id,
        ticker: assets.ticker,
        name: assets.name,
      },
      custodyAccount: {
        id: custodyAccounts.id,
        name: custodyAccounts.name,
      },
    })
    .from(optionsContracts)
    .innerJoin(assets, eq(optionsContracts.underlyingAssetId, assets.id))
    .leftJoin(custodyAccounts, eq(optionsContracts.custodyAccountId, custodyAccounts.id))
    .where(
      and(
        eq(optionsContracts.userId, user.id),
        isNull(optionsContracts.deletedAt),
        filters?.portfolioId ? eq(optionsContracts.portfolioId, filters.portfolioId) : undefined,
        filters?.status ? eq(optionsContracts.status, filters.status) : undefined
      )
    )
    .orderBy(asc(optionsContracts.expirationDate), asc(optionsContracts.ticker));

  const rows = await query;

  return rows.map((r) => ({
    id: r.contract.id,
    userId: r.contract.userId,
    portfolioId: r.contract.portfolioId,
    underlyingAssetId: r.contract.underlyingAssetId,
    custodyAccountId: r.contract.custodyAccountId,
    ticker: r.contract.ticker,
    optionType: r.contract.optionType as 'CALL' | 'PUT',
    optionStyle: r.contract.optionStyle as 'AMERICAN' | 'EUROPEAN',
    direction: r.contract.direction as 'BUY' | 'SELL',
    strikePrice: toDecimal(r.contract.strikePrice),
    premiumPaidReceived: toDecimal(r.contract.premiumPaidReceived),
    quantity: toDecimal(r.contract.quantity),
    expirationDate: r.contract.expirationDate,
    status: r.contract.status as OptionStatus,
    notes: r.contract.notes,
    createdAt: r.contract.createdAt.toISOString(),
    updatedAt: r.contract.updatedAt.toISOString(),
    deletedAt: r.contract.deletedAt ? r.contract.deletedAt.toISOString() : null,
    underlyingAssetTicker: r.underlyingAsset.ticker,
    underlyingAssetName: r.underlyingAsset.name,
    custodyAccountName: r.custodyAccount?.name ?? null,
  }));
}

/**
 * Consulta um contrato de opção por ID com validação de titularidade (anti-IDOR).
 */
export async function getOptionContractById(
  contractId: string,
  user: SafeUser,
  executor: Database | DatabaseTransaction = db
): Promise<OptionContract> {
  const rows = await executor
    .select({
      contract: optionsContracts,
      underlyingAsset: {
        id: assets.id,
        ticker: assets.ticker,
        name: assets.name,
      },
      custodyAccount: {
        id: custodyAccounts.id,
        name: custodyAccounts.name,
      },
    })
    .from(optionsContracts)
    .innerJoin(assets, eq(optionsContracts.underlyingAssetId, assets.id))
    .leftJoin(custodyAccounts, eq(optionsContracts.custodyAccountId, custodyAccounts.id))
    .where(
      and(eq(optionsContracts.id, contractId), isNull(optionsContracts.deletedAt))
    )
    .limit(1);

  if (rows.length === 0) {
    throw new OptionContractNotFoundError();
  }

  const { contract, underlyingAsset, custodyAccount } = rows[0];
  await assertOwnership(contract.userId, user, 'options_contract', executor);

  return {
    id: contract.id,
    userId: contract.userId,
    portfolioId: contract.portfolioId,
    underlyingAssetId: contract.underlyingAssetId,
    custodyAccountId: contract.custodyAccountId,
    ticker: contract.ticker,
    optionType: contract.optionType as 'CALL' | 'PUT',
    optionStyle: contract.optionStyle as 'AMERICAN' | 'EUROPEAN',
    direction: contract.direction as 'BUY' | 'SELL',
    strikePrice: toDecimal(contract.strikePrice),
    premiumPaidReceived: toDecimal(contract.premiumPaidReceived),
    quantity: toDecimal(contract.quantity),
    expirationDate: contract.expirationDate,
    status: contract.status as OptionStatus,
    notes: contract.notes,
    createdAt: contract.createdAt.toISOString(),
    updatedAt: contract.updatedAt.toISOString(),
    deletedAt: contract.deletedAt ? contract.deletedAt.toISOString() : null,
    underlyingAssetTicker: underlyingAsset.ticker,
    underlyingAssetName: underlyingAsset.name,
    custodyAccountName: custodyAccount?.name ?? null,
  };
}

/**
 * Cadastra um novo contrato de opção com validações de carteira, ativo e custódia.
 */
export async function createOptionContract(
  rawInput: CreateOptionContractInput,
  user: SafeUser,
  executor: Database | DatabaseTransaction = db
): Promise<OptionContract> {
  const data = createOptionContractSchema.parse(rawInput);

  // 1. Validar carteira
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

  // 2. Validar ativo-objeto (deve existir e pertencer ao usuário)
  const assetRows = await executor
    .select()
    .from(assets)
    .where(eq(assets.id, data.underlyingAssetId))
    .limit(1);

  if (assetRows.length === 0) {
    throw new UnderlyingAssetNotFoundError();
  }
  const underlyingAsset = assetRows[0];
  if (underlyingAsset.userId) {
    await assertOwnership(underlyingAsset.userId, user, 'asset', executor);
  }

  // 3. Validar conta de custódia caso informada
  let custodyAccountName: string | null = null;
  if (data.custodyAccountId) {
    const custodyRows = await executor
      .select()
      .from(custodyAccounts)
      .where(
        and(
          eq(custodyAccounts.id, data.custodyAccountId),
          eq(custodyAccounts.portfolioId, data.portfolioId),
          isNull(custodyAccounts.deletedAt)
        )
      )
      .limit(1);

    if (custodyRows.length === 0) {
      throw new Error('Conta de custódia informada não encontrada nesta carteira.');
    }
    custodyAccountName = custodyRows[0].name;
  }

  const id = crypto.randomUUID();
  const now = new Date();

  const [created] = await executor
    .insert(optionsContracts)
    .values({
      id,
      userId: user.id,
      portfolioId: data.portfolioId,
      underlyingAssetId: data.underlyingAssetId,
      custodyAccountId: data.custodyAccountId ?? null,
      ticker: data.ticker,
      optionType: data.optionType,
      optionStyle: data.optionStyle,
      direction: data.direction,
      strikePrice: data.strikePrice,
      premiumPaidReceived: data.premiumPaidReceived,
      quantity: data.quantity,
      expirationDate: data.expirationDate,
      status: 'OPEN',
      notes: data.notes ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  await insertAuditLog(
    {
      tableName: 'options_contracts',
      recordId: id,
      action: 'INSERT',
      actorId: user.id,
      actorType: 'user',
      source: 'manual',
    },
    undefined,
    {},
    executor
  );

  return {
    id: created.id,
    userId: created.userId,
    portfolioId: created.portfolioId,
    underlyingAssetId: created.underlyingAssetId,
    custodyAccountId: created.custodyAccountId,
    ticker: created.ticker,
    optionType: created.optionType as 'CALL' | 'PUT',
    optionStyle: created.optionStyle as 'AMERICAN' | 'EUROPEAN',
    direction: created.direction as 'BUY' | 'SELL',
    strikePrice: toDecimal(created.strikePrice),
    premiumPaidReceived: toDecimal(created.premiumPaidReceived),
    quantity: toDecimal(created.quantity),
    expirationDate: created.expirationDate,
    status: created.status as OptionStatus,
    notes: created.notes,
    createdAt: created.createdAt.toISOString(),
    updatedAt: created.updatedAt.toISOString(),
    deletedAt: null,
    underlyingAssetTicker: underlyingAsset.ticker,
    underlyingAssetName: underlyingAsset.name,
    custodyAccountName,
  };
}

/**
 * Atualiza o status operacional de um contrato (ex: fechar posição encerrada).
 */
export async function updateOptionStatus(
  contractId: string,
  newStatus: OptionStatus,
  user: SafeUser,
  executor: Database | DatabaseTransaction = db
): Promise<OptionContract> {
  const existing = await getOptionContractById(contractId, user, executor);

  const now = new Date();
  const [updated] = await executor
    .update(optionsContracts)
    .set({
      status: newStatus,
      updatedAt: now,
    })
    .where(eq(optionsContracts.id, contractId))
    .returning();

  await insertAuditLog(
    {
      tableName: 'options_contracts',
      recordId: contractId,
      action: 'UPDATE',
      actorId: user.id,
      actorType: 'user',
      reason: `Status atualizado de ${existing.status} para ${newStatus}`,
      source: 'manual',
    },
    undefined,
    {},
    executor
  );

  return {
    ...existing,
    status: updated.status as OptionStatus,
    updatedAt: updated.updatedAt.toISOString(),
  };
}

/**
 * Exclusão lógica (soft delete) de um contrato de opção.
 */
export async function deleteOptionContract(
  contractId: string,
  user: SafeUser,
  executor: Database | DatabaseTransaction = db
): Promise<void> {
  await getOptionContractById(contractId, user, executor);

  const now = new Date();
  await executor
    .update(optionsContracts)
    .set({
      deletedAt: now,
      updatedAt: now,
    })
    .where(eq(optionsContracts.id, contractId));

  await insertAuditLog(
    {
      tableName: 'options_contracts',
      recordId: contractId,
      action: 'DELETE',
      actorId: user.id,
      actorType: 'user',
      source: 'manual',
    },
    undefined,
    {},
    executor
  );
}

/**
 * Retorna os alertas de proximidade de vencimento (D-5 a D-0 ou vencidos) para as opções ativas do usuário.
 */
export async function getUserOptionAlerts(
  user: SafeUser,
  referenceDateStr?: string,
  executor: Database | DatabaseTransaction = db
): Promise<OptionProximityAlert[]> {
  const options = await listUserOptions(user, { status: 'OPEN' }, executor);

  const refDate = referenceDateStr ?? new Date().toISOString().slice(0, 10);
  const alerts: OptionProximityAlert[] = [];

  for (const opt of options) {
    const alert = generateProximityAlert(opt, refDate);
    if (alert) {
      alerts.push(alert);
    }
  }

  // Ordenar por gravidade: CRITICAL (D-0) > WARNING (D-5..D-1) > EXPIRED > INFO
  const severityWeight: Record<string, number> = {
    CRITICAL: 1,
    WARNING: 2,
    EXPIRED: 3,
    INFO: 4,
  };

  return alerts.sort((a, b) => {
    const weightDiff = (severityWeight[a.alertLevel] ?? 99) - (severityWeight[b.alertLevel] ?? 99);
    if (weightDiff !== 0) return weightDiff;
    return a.businessDaysRemaining - b.businessDaysRemaining;
  });
}

/**
 * Apura os cálculos analíticos de gregas, preço teórico e payoff descritivo para um contrato.
 */
export async function getOptionContractAnalytics(
  contractId: string,
  user: SafeUser,
  params?: {
    spotPrice?: string | Decimal;
    riskFreeRate?: string | Decimal;
    volatility?: string | Decimal;
    referenceDate?: string;
  },
  executor: Database | DatabaseTransaction = db
): Promise<{
  contract: OptionContract;
  expirationStatus: ExpirationCalculation;
  greeks: GreeksResult;
  payoff: PayoffAnalysis;
}> {
  const contract = await getOptionContractById(contractId, user, executor);

  const refDate = params?.referenceDate ?? new Date().toISOString().slice(0, 10);
  const expirationStatus = calculateExpirationStatus(refDate, contract.expirationDate);

  // Parâmetros de mercado com premissas default caso não informados
  // Taxa livre de risco padrão: 10.5% a.a. (CDI/Selic representativa)
  const riskFreeRate = params?.riskFreeRate
    ? toDecimal(params.riskFreeRate)
    : new Decimal('0.105');

  // Volatilidade padrão: 35% a.a. (volatilidade média representativa de ações brasileiras)
  const volatility = params?.volatility
    ? toDecimal(params.volatility)
    : new Decimal('0.35');

  // Preço do ativo-objeto: se não informado, utiliza o strike do contrato como premissa inicial
  const spotPrice = params?.spotPrice
    ? toDecimal(params.spotPrice)
    : contract.strikePrice;

  // Tempo até o vencimento em anos (base dias úteis / 252)
  const businessDays = Math.max(0, expirationStatus.businessDays);
  const timeToExpirationYears = new Decimal(businessDays).div(new Decimal('252'));

  const greeks = calculateBlackScholesGreeks({
    spotPrice,
    strikePrice: contract.strikePrice,
    timeToExpirationYears,
    riskFreeRate,
    volatility,
    optionType: contract.optionType,
    direction: contract.direction,
    premium: contract.premiumPaidReceived,
  });

  const payoff = calculatePayoffAnalysis({
    strikePrice: contract.strikePrice,
    premium: contract.premiumPaidReceived,
    quantity: contract.quantity,
    optionType: contract.optionType,
    direction: contract.direction,
    currentSpotPrice: spotPrice,
  });

  return {
    contract,
    expirationStatus,
    greeks,
    payoff,
  };
}
