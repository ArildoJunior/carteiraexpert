import crypto from 'node:crypto';
import { eq, and, isNull, inArray } from 'drizzle-orm';
import { db, type Database, type DatabaseTransaction } from '@/lib/db';
import {
  taxCalculationRuns,
  taxMonthlySummaries,
  taxLossCredits,
} from '@/lib/db/schema/tax';
import {
  portfolios,
  assets,
  portfolioEvents,
} from '@/lib/db/schema/portfolio';
import { userChartPreferences } from '@/lib/db/schema/chart-preferences';
import { insertAuditLog } from '@/lib/db/audit';
import { assertOwnership } from '@/modules/identity/server/authorization-service';
import type { SafeUser } from '@/modules/identity/domain/user.types';
import { Decimal } from '@/lib/decimal';
import type {
  UserTaxPreferences,
  TaxCalculationRun,
  TaxLossCredit,
  TaxTimelineEvent,
  TaxAnnualReport,
  TaxMonthlySummary,
} from '../domain/tax.types';
import {
  calculateAnnualTax,
  DEFAULT_TAX_PREFERENCES,
} from '../domain/tax-engine';
import {
  TaxCalculationRunningError,
  TaxUnauthorizedError,
} from '../domain/errors';
import { PortfolioNotFoundError } from '@/modules/portfolio/domain/errors';

/**
 * Consulta as preferências fiscais do usuário autenticado
 */
export async function getUserTaxPreferences(
  user: SafeUser,
  executor: Database | DatabaseTransaction = db
): Promise<UserTaxPreferences> {
  const rows = await executor
    .select()
    .from(userChartPreferences)
    .where(
      and(
        eq(userChartPreferences.userId, user.id),
        eq(userChartPreferences.chartArea, 'tax_preferences')
      )
    )
    .limit(1);

  if (rows.length === 0 || !rows[0].userTaxPreferences) {
    return { ...DEFAULT_TAX_PREFERENCES };
  }

  const raw = rows[0].userTaxPreferences as Record<string, unknown>;

  return {
    defaultCapitalGainsRate: raw.defaultCapitalGainsRate
      ? new Decimal(String(raw.defaultCapitalGainsRate))
      : DEFAULT_TAX_PREFERENCES.defaultCapitalGainsRate,
    exemptThresholdBrl: raw.exemptThresholdBrl
      ? new Decimal(String(raw.exemptThresholdBrl))
      : DEFAULT_TAX_PREFERENCES.exemptThresholdBrl,
    dayTradeRate: raw.dayTradeRate
      ? new Decimal(String(raw.dayTradeRate))
      : DEFAULT_TAX_PREFERENCES.dayTradeRate,
    includeDayTrade:
      typeof raw.includeDayTrade === 'boolean'
        ? raw.includeDayTrade
        : DEFAULT_TAX_PREFERENCES.includeDayTrade,
    compensationEnabled:
      typeof raw.compensationEnabled === 'boolean'
        ? raw.compensationEnabled
        : DEFAULT_TAX_PREFERENCES.compensationEnabled,
  };
}

/**
 * Salva ou atualiza as preferências fiscais do usuário
 */
export async function saveUserTaxPreferences(
  user: SafeUser,
  preferences: UserTaxPreferences,
  executor: Database = db
): Promise<UserTaxPreferences> {
  const payload = {
    defaultCapitalGainsRate: preferences.defaultCapitalGainsRate.toFixed(4),
    exemptThresholdBrl: preferences.exemptThresholdBrl.toFixed(2),
    dayTradeRate: preferences.dayTradeRate.toFixed(4),
    includeDayTrade: preferences.includeDayTrade,
    compensationEnabled: preferences.compensationEnabled,
  };

  await executor
    .insert(userChartPreferences)
    .values({
      id: crypto.randomUUID(),
      userId: user.id,
      chartArea: 'tax_preferences',
      userTaxPreferences: payload,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [userChartPreferences.userId, userChartPreferences.chartArea],
      set: {
        userTaxPreferences: payload,
        updatedAt: new Date(),
      },
    });

  await insertAuditLog(
    {
      tableName: 'user_chart_preferences',
      recordId: user.id,
      action: 'UPDATE',
      actorId: user.id,
      actorType: 'user',
    },
    {
      newValue: { payload },
    },
    { preMinimized: true },
    executor
  );

  return preferences;
}

/**
 * Busca créditos de prejuízo ativos do usuário
 */
export async function listActiveLossCredits(
  user: SafeUser,
  executor: Database | DatabaseTransaction = db
): Promise<TaxLossCredit[]> {
  const rows = await executor
    .select()
    .from(taxLossCredits)
    .where(eq(taxLossCredits.userId, user.id));

  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    year: r.year,
    monthOrigin: r.monthOrigin,
    assetSymbol: r.assetSymbol,
    originalLossAmount: new Decimal(r.originalLossAmount),
    remainingAmount: new Decimal(r.remainingAmount),
    expiresOn: r.expiresOn.toISOString(),
  }));
}

/**
 * Carrega a timeline cronológica factual de eventos de investimento do usuário
 */
export async function loadUserTaxTimelineEvents(
  user: SafeUser,
  portfolioId?: string | null,
  executor: Database | DatabaseTransaction = db
): Promise<TaxTimelineEvent[]> {
  if (portfolioId) {
    const pRows = await executor
      .select()
      .from(portfolios)
      .where(and(eq(portfolios.id, portfolioId), isNull(portfolios.deletedAt)))
      .limit(1);

    if (pRows.length === 0) {
      throw new PortfolioNotFoundError();
    }
    await assertOwnership(pRows[0].userId, user, 'portfolio', executor);
  }

  // Busca as carteiras ativas do usuário
  const userPortfolios = await executor
    .select({ id: portfolios.id })
    .from(portfolios)
    .where(and(eq(portfolios.userId, user.id), isNull(portfolios.deletedAt)));

  if (userPortfolios.length === 0) {
    return [];
  }

  const portfolioIds = portfolioId ? [portfolioId] : userPortfolios.map((p) => p.id);

  const eventRows = await executor
    .select({
      event: portfolioEvents,
      asset: {
        id: assets.id,
        ticker: assets.ticker,
        name: assets.name,
        assetType: assets.assetType,
        currency: assets.currency,
      },
    })
    .from(portfolioEvents)
    .innerJoin(assets, eq(portfolioEvents.assetId, assets.id))
    .where(
      and(
        inArray(portfolioEvents.portfolioId, portfolioIds),
        isNull(portfolioEvents.deletedAt)
      )
    );

  return eventRows.map(({ event, asset }) => ({
    id: event.id,
    portfolioId: event.portfolioId,
    assetId: asset.id,
    assetSymbol: asset.ticker,
    assetName: asset.name,
    assetType: asset.assetType,
    type: event.type,
    tradeDate: event.tradeDate,
    settlementDate: event.settlementDate,
    quantity: new Decimal(event.quantity),
    unitPrice: new Decimal(event.unitPrice),
    fees: new Decimal(event.fees || '0'),
    currency: event.currency || 'BRL',
    notes: event.notes,
  }));
}

/**
 * Executa ou reprocessa a apuração fiscal anual para o usuário
 */
export async function executeTaxCalculation(
  user: SafeUser,
  params: {
    year: number;
    month?: number | null;
    portfolioId?: string | null;
    forceRecalculate?: boolean;
  },
  database: Database = db
): Promise<TaxAnnualReport> {
  const { year, portfolioId, forceRecalculate } = params;

  // 1. Concurrency guard: impede execuções simultâneas em RUNNING para o mesmo usuário
  const activeRuns = await database
    .select()
    .from(taxCalculationRuns)
    .where(
      and(
        eq(taxCalculationRuns.userId, user.id),
        eq(taxCalculationRuns.status, 'RUNNING')
      )
    );

  if (activeRuns.length > 0) {
    throw new TaxCalculationRunningError();
  }

  // 2. Cria registro de execução RUNNING
  const runId = crypto.randomUUID();
  await database.insert(taxCalculationRuns).values({
    id: runId,
    userId: user.id,
    referenceYear: year,
    referenceMonth: params.month ?? null,
    status: 'RUNNING',
    generatedAt: new Date(),
  });

  try {
    // 3. Carrega preferências fiscais do usuário
    const preferences = await getUserTaxPreferences(user, database);

    // 4. Carrega eventos patrimoniais e créditos prévios
    const events = await loadUserTaxTimelineEvents(user, portfolioId, database);
    const existingLossCredits = await listActiveLossCredits(user, database);

    // 5. Executa o motor determinístico em Decimal
    const report = calculateAnnualTax(events, year, existingLossCredits, preferences);

    // 6. Persistência transacional dos resultados apurados
    await database.transaction(async (tx) => {
      for (const m of report.months) {
        const netGain = m.exemptGainStock
          .plus(m.taxableGainStock)
          .minus(m.taxableLossStock)
          .plus(m.fiiGain)
          .minus(m.fiiLoss)
          .plus(m.etfBdrGain)
          .minus(m.etfBdrLoss)
          .plus(m.dayTradeGain)
          .minus(m.dayTradeLoss);

        const totalCost = Decimal.max(0, m.totalSalesOverall.minus(netGain));

        await tx
          .insert(taxMonthlySummaries)
          .values({
            id: crypto.randomUUID(),
            userId: user.id,
            portfolioId: portfolioId ?? null,
            year,
            month: m.month,
            totalSales: m.totalSalesOverall.toFixed(2),
            totalProceeds: m.totalSalesOverall.toFixed(2),
            totalCost: totalCost.toFixed(2),
            netGainLoss: netGain.toFixed(2),
            exemptThresholdStatus: m.isStockExempt ? 'EXEMPT' : 'TAXABLE',
            applicableRate: preferences.defaultCapitalGainsRate.toFixed(4),
            estimatedTax: m.totalEstimatedTax.toFixed(2),
            accumulatedLossCompensated: m.lossCompensatedSwing
              .plus(m.lossCompensatedDayTrade)
              .toFixed(2),
            generatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [
              taxMonthlySummaries.userId,
              taxMonthlySummaries.portfolioId,
              taxMonthlySummaries.year,
              taxMonthlySummaries.month,
            ],
            set: {
              totalSales: m.totalSalesOverall.toFixed(2),
              totalProceeds: m.totalSalesOverall.toFixed(2),
              totalCost: totalCost.toFixed(2),
              netGainLoss: netGain.toFixed(2),
              exemptThresholdStatus: m.isStockExempt ? 'EXEMPT' : 'TAXABLE',
              applicableRate: preferences.defaultCapitalGainsRate.toFixed(4),
              estimatedTax: m.totalEstimatedTax.toFixed(2),
              accumulatedLossCompensated: m.lossCompensatedSwing
                .plus(m.lossCompensatedDayTrade)
                .toFixed(2),
              generatedAt: new Date(),
            },
          });

        // Persiste novos créditos de prejuízo gerados
        for (const cred of m.newLossCreditsGenerated) {
          const expiresOn = new Date(Date.UTC(year + 5, 11, 31, 23, 59, 59));
          await tx
            .insert(taxLossCredits)
            .values({
              id: crypto.randomUUID(),
              userId: user.id,
              year,
              monthOrigin: cred.originMonth,
              assetSymbol: cred.assetSymbol,
              originalLossAmount: cred.amount.toFixed(2),
              remainingAmount: cred.amount.toFixed(2),
              expiresOn,
            })
            .onConflictDoUpdate({
              target: [
                taxLossCredits.userId,
                taxLossCredits.year,
                taxLossCredits.monthOrigin,
                taxLossCredits.assetSymbol,
              ],
              set: {
                originalLossAmount: cred.amount.toFixed(2),
                remainingAmount: cred.amount.toFixed(2),
                expiresOn,
              },
            });
        }
      }

      // Marca execução como COMPLETED
      await tx
        .update(taxCalculationRuns)
        .set({
          status: 'COMPLETED',
          generatedAt: new Date(),
        })
        .where(eq(taxCalculationRuns.id, runId));

      await insertAuditLog(
        {
          tableName: 'tax_calculation_runs',
          recordId: runId,
          action: 'INSERT',
          actorId: user.id,
          actorType: 'user',
        },
        {
          newValue: {
            year: String(year),
            portfolioId: portfolioId ?? 'ALL',
            totalAnnualSales: report.totalAnnualSales.toFixed(2),
            totalAnnualEstimatedTax: report.totalAnnualEstimatedTax.toFixed(2),
          },
        },
        { preMinimized: true, allowedNumbers: ['year'] },
        tx
      );
    });

    return report;
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Erro desconhecido na apuração';
    await database
      .update(taxCalculationRuns)
      .set({
        status: 'FAILED',
        errorMessage: errorMsg,
        generatedAt: new Date(),
      })
      .where(eq(taxCalculationRuns.id, runId));

    throw err;
  }
}

/**
 * Consulta resumos mensais persistidos
 */
export async function listTaxMonthlySummaries(
  user: SafeUser,
  year: number,
  portfolioId?: string | null,
  executor: Database | DatabaseTransaction = db
): Promise<TaxMonthlySummary[]> {
  const whereConditions = [
    eq(taxMonthlySummaries.userId, user.id),
    eq(taxMonthlySummaries.year, year),
  ];

  if (portfolioId !== undefined) {
    if (portfolioId === null) {
      whereConditions.push(isNull(taxMonthlySummaries.portfolioId));
    } else {
      whereConditions.push(eq(taxMonthlySummaries.portfolioId, portfolioId));
    }
  }

  const rows = await executor
    .select()
    .from(taxMonthlySummaries)
    .where(and(...whereConditions));

  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    portfolioId: r.portfolioId,
    year: r.year,
    month: r.month,
    totalSales: new Decimal(r.totalSales),
    totalProceeds: new Decimal(r.totalProceeds),
    totalCost: new Decimal(r.totalCost),
    netGainLoss: new Decimal(r.netGainLoss),
    exemptThresholdStatus: r.exemptThresholdStatus as 'EXEMPT' | 'TAXABLE',
    applicableRate: new Decimal(r.applicableRate),
    estimatedTax: new Decimal(r.estimatedTax),
    accumulatedLossCompensated: new Decimal(r.accumulatedLossCompensated),
    generatedAt: r.generatedAt.toISOString(),
  }));
}
