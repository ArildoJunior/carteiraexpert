import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { eq, inArray } from 'drizzle-orm';
import { db } from '../../../src/lib/db';
import { users } from '../../../src/lib/db/schema/identity';
import { portfolios, assets, portfolioEvents } from '../../../src/lib/db/schema/portfolio';
import { userPlans } from '../../../src/lib/db/schema/plans';
import { auditLogs } from '../../../src/lib/db/schema/audit';
import {
  taxCalculationRuns,
  taxMonthlySummaries,
  taxLossCredits,
} from '../../../src/lib/db/schema/tax';
import { userChartPreferences } from '../../../src/lib/db/schema/chart-preferences';
import {
  executeTaxCalculation,
  getUserTaxPreferences,
  saveUserTaxPreferences,
  listTaxMonthlySummaries,
} from '../../../src/modules/tax/server/tax.service';
import {
  TaxCalculationRunningError,
} from '../../../src/modules/tax/domain/errors';
import { AuthorizationError } from '../../../src/modules/identity/domain/errors';
import type { SafeUser } from '../../../src/modules/identity/domain/user.types';
import { Decimal } from '../../../src/lib/decimal';

describe('Integração: Módulo Fiscal e Relatórios Auxiliares de IRPF (Etapa 9)', () => {
  const userAId = crypto.randomUUID();
  const userBId = crypto.randomUUID();
  let userA: SafeUser;
  let userB: SafeUser;

  const portfolioAId = crypto.randomUUID();
  const portfolioBId = crypto.randomUUID();

  const assetStockId = crypto.randomUUID();
  const assetFiiId = crypto.randomUUID();

  const targetYear = 2024;

  beforeAll(async () => {
    const now = new Date();

    // 1. Criar Usuários A e B
    await db.insert(users).values([
      {
        id: userAId,
        email: `tax_user_a_${Date.now()}@carteiraexpert.test`,
        name: 'Tax User A',
        passwordHash: 'dummy',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: userBId,
        email: `tax_user_b_${Date.now()}@carteiraexpert.test`,
        name: 'Tax User B',
        passwordHash: 'dummy',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
    ]);

    // 2. Planos PRO para ambos
    await db.insert(userPlans).values([
      {
        id: crypto.randomUUID(),
        userId: userAId,
        planId: 'pro',
        status: 'active',
        startsAt: now,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: crypto.randomUUID(),
        userId: userBId,
        planId: 'pro',
        status: 'active',
        startsAt: now,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    userA = {
      id: userAId,
      email: `tax_user_a_${Date.now()}@carteiraexpert.test`,
      name: 'Tax User A',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    userB = {
      id: userBId,
      email: `tax_user_b_${Date.now()}@carteiraexpert.test`,
      name: 'Tax User B',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    };

    // 3. Carteiras
    await db.insert(portfolios).values([
      {
        id: portfolioAId,
        userId: userAId,
        name: 'Carteira Fiscal A',
        baseCurrency: 'BRL',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: portfolioBId,
        userId: userBId,
        name: 'Carteira Fiscal B',
        baseCurrency: 'BRL',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
    ]);

    // 4. Ativos
    await db.insert(assets).values([
      {
        id: assetStockId,
        ticker: `PETR_${Date.now().toString().slice(-4)}`,
        name: 'Petrobras PN Teste Fiscal',
        assetType: 'stock',
        market: 'B3',
        currency: 'BRL',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: assetFiiId,
        ticker: `HGLG_${Date.now().toString().slice(-4)}`,
        name: 'CSHG Logistica FII Teste Fiscal',
        assetType: 'fii',
        market: 'B3',
        currency: 'BRL',
        createdAt: now,
        updatedAt: now,
      },
    ]);

    // 5. Inserir Eventos para Usuário A:
    // Jan/2024: Compra de 1.000 ações a R$ 30,00 (Custo R$ 30.000)
    // Fev/2024: Venda de 1.000 ações a R$ 40,00 (Venda R$ 40.000 > 20k -> Lucro R$ 10.000, IR = R$ 1.500)
    // Mar/2024: Provento JCP bruto R$ 1.000,00 com R$ 150,00 IRRF
    await db.insert(portfolioEvents).values([
      {
        id: crypto.randomUUID(),
        portfolioId: portfolioAId,
        assetId: assetStockId,
        type: 'BUY',
        tradeDate: new Date('2024-01-10T10:00:00Z'),
        quantity: '1000.0000000000',
        unitPrice: '30.00000000',
        fees: '0.00000000',
        currency: 'BRL',
        createdBy: userAId,
        createdAt: now,
      },
      {
        id: crypto.randomUUID(),
        portfolioId: portfolioAId,
        assetId: assetStockId,
        type: 'SELL',
        tradeDate: new Date('2024-02-15T10:00:00Z'),
        quantity: '1000.0000000000',
        unitPrice: '40.00000000',
        fees: '0.00000000',
        currency: 'BRL',
        createdBy: userAId,
        createdAt: now,
      },
      {
        id: crypto.randomUUID(),
        portfolioId: portfolioAId,
        assetId: assetStockId,
        type: 'JCP',
        tradeDate: new Date('2024-03-20T10:00:00Z'),
        quantity: '1000.0000000000',
        unitPrice: '1.00000000',
        fees: '150.00000000',
        currency: 'BRL',
        createdBy: userAId,
        createdAt: now,
      },
    ]);
  });

  afterAll(async () => {
    // Limpeza em ordem de dependência
    await db.delete(taxLossCredits).where(inArray(taxLossCredits.userId, [userAId, userBId]));
    await db.delete(taxMonthlySummaries).where(inArray(taxMonthlySummaries.userId, [userAId, userBId]));
    await db.delete(taxCalculationRuns).where(inArray(taxCalculationRuns.userId, [userAId, userBId]));
    await db.delete(userChartPreferences).where(inArray(userChartPreferences.userId, [userAId, userBId]));
    await db.delete(portfolioEvents).where(inArray(portfolioEvents.portfolioId, [portfolioAId, portfolioBId]));
    await db.delete(portfolios).where(inArray(portfolios.id, [portfolioAId, portfolioBId]));
    await db.delete(assets).where(inArray(assets.id, [assetStockId, assetFiiId]));
    await db.delete(userPlans).where(inArray(userPlans.userId, [userAId, userBId]));
    await db.delete(auditLogs).where(inArray(auditLogs.actorId, [userAId, userBId]));
    await db.delete(users).where(inArray(users.id, [userAId, userBId]));
  });

  it('deve gerenciar preferências fiscais do usuário com persistência e auditoria', async () => {
    const defaultPrefs = await getUserTaxPreferences(userA);
    expect(defaultPrefs.defaultCapitalGainsRate.toFixed(2)).toBe('0.15');
    expect(defaultPrefs.exemptThresholdBrl.toFixed(2)).toBe('20000.00');

    // Atualiza preferências
    await saveUserTaxPreferences(userA, {
      defaultCapitalGainsRate: new Decimal('0.18'),
      exemptThresholdBrl: new Decimal('25000.00'),
      dayTradeRate: new Decimal('0.20'),
      includeDayTrade: true,
      compensationEnabled: true,
    });

    const updatedPrefs = await getUserTaxPreferences(userA);
    expect(updatedPrefs.defaultCapitalGainsRate.toFixed(2)).toBe('0.18');
    expect(updatedPrefs.exemptThresholdBrl.toFixed(2)).toBe('25000.00');
  });

  it('deve executar apuração anual para Usuário A, persistir resumos mensais e registrar auditoria', async () => {
    const report = await executeTaxCalculation(userA, {
      year: targetYear,
      portfolioId: portfolioAId,
      forceRecalculate: true,
    });

    expect(report.year).toBe(targetYear);
    expect(report.totalAnnualSales.toFixed(2)).toBe('40000.00');
    expect(report.totalAnnualNetGainLoss.toFixed(2)).toBe('10000.00');
    expect(report.totalIrrfRetidoJcp.toFixed(2)).toBe('150.00');

    // Verifica persistência física em tax_monthly_summaries
    const summaries = await listTaxMonthlySummaries(userA, targetYear, portfolioAId);
    expect(summaries.length).toBe(12);

    const fevSummary = summaries.find((s) => s.month === 2);
    expect(fevSummary).toBeDefined();
    expect(fevSummary!.totalSales.toFixed(2)).toBe('40000.00');
    expect(fevSummary!.exemptThresholdStatus).toBe('TAXABLE');
    expect(fevSummary!.netGainLoss.toFixed(2)).toBe('10000.00');

    // Verifica que execução foi registrada como COMPLETED
    const runs = await db
      .select()
      .from(taxCalculationRuns)
      .where(eq(taxCalculationRuns.userId, userAId));
    expect(runs.length).toBeGreaterThan(0);
    expect(runs.some((r) => r.status === 'COMPLETED')).toBe(true);

    // Verifica registro em audit_logs
    const logs = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.actorId, userAId));
    expect(logs.some((l) => l.tableName === 'tax_calculation_runs')).toBe(true);
  });

  it('deve isolar estritamente os dados: Usuário B não acessa nem calcula dados da carteira do Usuário A', async () => {
    await expect(
      executeTaxCalculation(userB, {
        year: targetYear,
        portfolioId: portfolioAId, // Carteira de A!
      })
    ).rejects.toThrow(AuthorizationError);
  });

  it('deve bloquear apuração simultânea se houver execução em RUNNING (concurrency lock)', async () => {
    // Insere run artificial com status RUNNING para Usuário A
    const fakeRunId = crypto.randomUUID();
    await db.insert(taxCalculationRuns).values({
      id: fakeRunId,
      userId: userAId,
      referenceYear: targetYear,
      status: 'RUNNING',
      generatedAt: new Date(),
    });

    await expect(
      executeTaxCalculation(userA, {
        year: targetYear,
      })
    ).rejects.toThrow(TaxCalculationRunningError);

    // Remove run fake para não poluir
    await db.delete(taxCalculationRuns).where(eq(taxCalculationRuns.id, fakeRunId));
  });
});
