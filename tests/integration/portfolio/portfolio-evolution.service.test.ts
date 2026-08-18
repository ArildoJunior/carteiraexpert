import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import {
  users,
  portfolios,
  assets,
  portfolioEvents,
  marketQuotes,
  exchangeRates,
} from '@/lib/db/schema';
import { createPortfolio } from '@/modules/portfolio/server/portfolio.service';
import { createPortfolioEvent } from '@/modules/portfolio/server/portfolio-event.service';
import {
  getPortfolioEvolutionData,
  getSerializedPortfolioEvolutionData,
} from '@/modules/portfolio/server/portfolio-evolution.service';
import { AuthorizationError } from '@/modules/identity/domain/errors';
import type { SafeUser } from '@/modules/identity/domain/user.types';

describe('Integração: Serviço de Evolução Patrimonial (PostgreSQL Real)', () => {
  const userAId = crypto.randomUUID();
  const userBId = crypto.randomUUID();
  const userAEmail = 'evolution_user_a@carteiraexpert.invalid';
  const userBEmail = 'evolution_user_b@carteiraexpert.invalid';

  const userA: SafeUser = {
    id: userAId,
    email: userAEmail,
    name: 'User Evolution A',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const userB: SafeUser = {
    id: userBId,
    email: userBEmail,
    name: 'User Evolution B',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  let globalPetr4Id: string;
  let globalVale3Id: string;
  let portfolioAId: string;

  beforeAll(async () => {
    // 1. Limpeza prévia
    await db.delete(users).where(eq(users.email, userAEmail));
    await db.delete(users).where(eq(users.email, userBEmail));

    // 2. Insere usuários de teste
    await db.insert(users).values([
      {
        id: userAId,
        email: userAEmail,
        name: userA.name,
        passwordHash: 'hash',
        status: 'active',
      },
      {
        id: userBId,
        email: userBEmail,
        name: userB.name,
        passwordHash: 'hash',
        status: 'active',
      },
    ]);

    // 3. Insere ativos de teste
    globalPetr4Id = crypto.randomUUID();
    globalVale3Id = crypto.randomUUID();

    await db.insert(assets).values([
      {
        id: globalPetr4Id,
        ticker: 'PETR4_EVO',
        name: 'Petrobras PN Evo',
        assetType: 'stock',
        market: 'B3',
        currency: 'BRL',
        isCustom: false,
        userId: null,
      },
      {
        id: globalVale3Id,
        ticker: 'VALE3_EVO',
        name: 'Vale ON Evo',
        assetType: 'stock',
        market: 'B3',
        currency: 'BRL',
        isCustom: false,
        userId: null,
      },
    ]);

    // 4. Cria carteira para User A
    const pA = await createPortfolio(
      {
        name: 'Carteira Evolution Test',
        baseCurrency: 'BRL',
      },
      userA
    );
    portfolioAId = pA.id;

    // 5. Insere eventos com datas específicas
    // Compra 1: PETR4 em 2026-08-01 (100 cotas a R$ 30,00)
    await createPortfolioEvent(
      {
        portfolioId: portfolioAId,
        assetId: globalPetr4Id,
        type: 'BUY',
        tradeDate: '2026-08-01T12:00:00.000Z',
        quantity: '100',
        unitPrice: '30.00',
        fees: '0.00',
      },
      userA
    );

    // Compra 2: VALE3 em 2026-08-10 (50 cotas a R$ 60,00)
    await createPortfolioEvent(
      {
        portfolioId: portfolioAId,
        assetId: globalVale3Id,
        type: 'BUY',
        tradeDate: '2026-08-10T12:00:00.000Z',
        quantity: '50',
        unitPrice: '60.00',
        fees: '0.00',
      },
      userA
    );

    // 6. Insere cotações históricas no banco real
    // PETR4: R$ 35,00 em 2026-08-01
    await db.insert(marketQuotes).values([
      {
        id: crypto.randomUUID(),
        assetId: globalPetr4Id,
        price: '35.00000000',
        currency: 'BRL',
        quoteDate: new Date('2026-08-01T12:00:00.000Z'),
        source: 'manual',
        delayStatus: 'eod',
        createdBy: userAId,
      },
      // PETR4: R$ 38,00 em 2026-08-12
      {
        id: crypto.randomUUID(),
        assetId: globalPetr4Id,
        price: '38.00000000',
        currency: 'BRL',
        quoteDate: new Date('2026-08-12T12:00:00.000Z'),
        source: 'manual',
        delayStatus: 'eod',
        createdBy: userAId,
      },
      // VALE3: R$ 65,00 em 2026-08-10
      {
        id: crypto.randomUUID(),
        assetId: globalVale3Id,
        price: '65.00000000',
        currency: 'BRL',
        quoteDate: new Date('2026-08-10T12:00:00.000Z'),
        source: 'manual',
        delayStatus: 'eod',
        createdBy: userAId,
      },
    ]);
  });

  afterAll(async () => {
    // Limpeza de tabelas
    await db.delete(portfolioEvents).where(eq(portfolioEvents.portfolioId, portfolioAId));
    await db.delete(marketQuotes).where(eq(marketQuotes.assetId, globalPetr4Id));
    await db.delete(marketQuotes).where(eq(marketQuotes.assetId, globalVale3Id));
    await db.delete(portfolios).where(eq(portfolios.id, portfolioAId));
    await db.delete(assets).where(eq(assets.id, globalPetr4Id));
    await db.delete(assets).where(eq(assets.id, globalVale3Id));
    await db.delete(users).where(eq(users.email, userAEmail));
    await db.delete(users).where(eq(users.email, userBEmail));
  });

  it('1. deve recuperar histórico diário reconstruído a partir do PostgreSQL real', async () => {
    const summary = await getPortfolioEvolutionData(portfolioAId, userA, {
      period: '1M',
      referenceDate: new Date('2026-08-15T18:00:00.000Z'),
    });

    expect(summary.portfolioId).toBe(portfolioAId);
    expect(summary.baseCurrency).toBe('BRL');
    expect(summary.points.length).toBeGreaterThan(25);

    // Ponto no dia 05/08: apenas PETR4 existia (100 ações * R$ 30 = 3000 de custo, valor a mercado 100 * 35 = 3500)
    const p5 = summary.points.find((p) => p.dateKey === '2026-08-05')!;
    expect(p5.investedCost.toString()).toBe('3000');
    expect(p5.marketValue?.toString()).toBe('3500');
    expect(p5.unrealizedPnL?.toString()).toBe('500');
    expect(p5.totalPositionsCount).toBe(1);
    expect(p5.quotedPositionsCount).toBe(1);

    // Ponto no dia 14/08: PETR4 (100 ações a R$ 38 = 3800) + VALE3 (50 ações a R$ 65 = 3250)
    // Custo total: 3000 + 3000 = 6000. Mercado total: 3800 + 3250 = 7050. PnL: +1050.
    const p14 = summary.points.find((p) => p.dateKey === '2026-08-14')!;
    expect(p14.investedCost.toString()).toBe('6000');
    expect(p14.marketValue?.toString()).toBe('7050');
    expect(p14.unrealizedPnL?.toString()).toBe('1050');
    expect(p14.totalPositionsCount).toBe(2);
    expect(p14.quotedPositionsCount).toBe(2);
  });

  it('2. deve garantir isolamento multi-tenant impedindo Usuário B de acessar evolução da carteira de A', async () => {
    await expect(
      getPortfolioEvolutionData(portfolioAId, userB, { period: '1M' })
    ).rejects.toThrow(AuthorizationError);
  });

  it('3. deve serializar corretamente os dados para transporte SSR', async () => {
    const serialized = await getSerializedPortfolioEvolutionData(
      portfolioAId,
      userA,
      {
        period: '1M',
        referenceDate: new Date('2026-08-15T18:00:00.000Z'),
      }
    );

    expect(serialized.portfolioId).toBe(portfolioAId);
    expect(typeof serialized.currentInvestedCost).toBe('string');
    expect(typeof serialized.points[0].formattedInvestedCost).toBe('string');
  });

  it('4. deve registrar CURRENCY_MISMATCH sem sobrescrever a cotação compatível anterior válida no valuation', async () => {
    // Insere cotação com moeda USD para PETR4_EVO (que é em BRL) em 14/08
    const mismatchQuoteId = crypto.randomUUID();
    await db.insert(marketQuotes).values([
      {
        id: mismatchQuoteId,
        assetId: globalPetr4Id,
        price: '7.50000000',
        currency: 'USD', // Mismatch!
        quoteDate: new Date('2026-08-14T12:00:00.000Z'),
        source: 'manual',
        delayStatus: 'eod',
        createdBy: userAId,
      },
    ]);

    try {
      const summary = await getPortfolioEvolutionData(portfolioAId, userA, {
        period: '1M',
        referenceDate: new Date('2026-08-15T18:00:00.000Z'),
      });

      // Avaliação em 14/08 e 15/08:
      // - PETR4: possui cotação BRL compatível em 12/08 (R$ 38,00 -> 100 * 38 = R$ 3.800)
      // - PETR4: possui cotação USD incompatível em 14/08 ($ 7.50 -> preservada somente para diagnóstico)
      // - VALE3: possui cotação BRL compatível em 10/08 (R$ 65,00 -> 50 * 65 = R$ 3.250)
      // Resultado esperado em ambos os dias:
      // - marketValue = 7050 (3800 + 3250)
      // - quotedPositionsCount = 2 (PETR4 e VALE3)
      // - unquotedPositionsCount = 0
      // - stalePositionsCount = 0
      // - currencyMismatchPositionsCount = 1
      for (const dateKey of ['2026-08-14', '2026-08-15']) {
        const point = summary.points.find((p) => p.dateKey === dateKey)!;
        expect(point.marketValue?.toString()).toBe('7050');
        expect(point.quotedPositionsCount).toBe(2);
        expect(point.unquotedPositionsCount).toBe(0);
        expect(point.stalePositionsCount).toBe(0);
        expect(point.currencyMismatchPositionsCount).toBe(1);
        expect(point.isPartiallyValued).toBe(false);
      }
    } finally {
      await db.delete(marketQuotes).where(eq(marketQuotes.id, mismatchQuoteId));
    }
  });

  it('5. deve rejeitar referenceDate no futuro com FutureDateNotAllowedError', async () => {
    const futureDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    await expect(
      getPortfolioEvolutionData(portfolioAId, userA, {
        period: '1M',
        referenceDate: futureDate,
      })
    ).rejects.toThrow('A data de referência não pode estar no futuro.');
  });

  it('6. deve rejeitar period inválido com InvalidEvolutionPeriodError', async () => {
    await expect(
      getPortfolioEvolutionData(portfolioAId, userA, {
        period: 'INVALID_PERIOD' as any,
      })
    ).rejects.toThrow();
  });

  it('7. deve converter histórico no PostgreSQL real para carteira com baseCurrency USD', async () => {
    // 1. Cria carteira em USD para User A
    const pUsd = await createPortfolio(
      {
        name: 'Carteira USD Test',
        baseCurrency: 'USD',
      },
      userA
    );

    // 2. Compra PETR4 (BRL) na carteira USD
    await createPortfolioEvent(
      {
        portfolioId: pUsd.id,
        assetId: globalPetr4Id,
        type: 'BUY',
        tradeDate: '2026-08-01T12:00:00.000Z',
        quantity: '100',
        unitPrice: '30.00', // R$ 3.000,00
        fees: '0.00',
      },
      userA
    );

    // 3. Insere taxa cambial BRL -> USD = 0.20
    const fxId = crypto.randomUUID();
    await db.insert(exchangeRates).values([
      {
        id: fxId,
        fromCurrency: 'BRL',
        toCurrency: 'USD',
        rate: '0.20000000',
        rateDate: new Date('2026-08-01T12:00:00.000Z'),
        source: 'manual',
        delayStatus: 'eod',
        createdBy: userAId,
      },
    ]);

    try {
      const summary = await getPortfolioEvolutionData(pUsd.id, userA, {
        period: '1M',
        referenceDate: new Date('2026-08-05T18:00:00.000Z'),
      });

      expect(summary.baseCurrency).toBe('USD');
      const p5 = summary.points.find((p) => p.dateKey === '2026-08-05')!;

      // Custo: 3000 BRL * 0.20 = 600 USD
      expect(p5.investedCost.toString()).toBe('600');
      // Mercado: 3500 BRL * 0.20 = 700 USD
      expect(p5.marketValue?.toString()).toBe('700');
      expect(p5.quotedPositionsCount).toBe(1);
    } finally {
      await db.delete(exchangeRates).where(eq(exchangeRates.id, fxId));
      await db.delete(portfolioEvents).where(eq(portfolioEvents.portfolioId, pUsd.id));
      await db.delete(portfolios).where(eq(portfolios.id, pUsd.id));
    }
  });
});


