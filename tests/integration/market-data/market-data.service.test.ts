import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { eq, inArray, sql } from 'drizzle-orm';
import { db } from '../../../src/lib/db';
import {
  users,
  portfolios,
  assets,
  portfolioEvents,
  marketQuotes,
  exchangeRates,
  auditLogs,
} from '../../../src/lib/db/schema';
import { createPortfolio } from '../../../src/modules/portfolio/server/portfolio.service';
import { createCustomAsset } from '../../../src/modules/portfolio/server/asset.service';
import { createPortfolioEvent } from '../../../src/modules/portfolio/server/portfolio-event.service';
import {
  getPortfolioPositions,
  getAssetPositionInPortfolio,
} from '../../../src/modules/portfolio/server/position.service';
import {
  createMarketQuote,
  getLatestQuoteForAsset,
  getLatestQuotesForAssets,
  createExchangeRate,
  getLatestExchangeRate,
  getLatestExchangeRates,
} from '../../../src/modules/market-data';
import type { SafeUser } from '../../../src/modules/identity/domain/user.types';

describe('Integração: Serviço de Market Data, Câmbio e Valuation (PostgreSQL Real)', () => {
  const userAId = crypto.randomUUID();
  const userBId = crypto.randomUUID();
  const userAEmail = 'mkt_user_a@carteiraexpert.invalid';
  const userBEmail = 'mkt_user_b@carteiraexpert.invalid';

  const userA: SafeUser = {
    id: userAId,
    email: userAEmail,
    name: 'User Market A',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const userB: SafeUser = {
    id: userBId,
    email: userBEmail,
    name: 'User Market B',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  let globalAssetId: string;
  let customAssetAId: string;

  beforeAll(async () => {
    // Limpeza de dados prévios
    await db.delete(assets).where(eq(assets.ticker, 'VALE3_MKT'));
    await db.delete(users).where(inArray(users.email, [userAEmail, userBEmail]));

    await db.insert(users).values([
      {
        id: userAId,
        email: userAEmail,
        name: 'User Market A',
        passwordHash: 'hash_a',
        status: 'active',
      },
      {
        id: userBId,
        email: userBEmail,
        name: 'User Market B',
        passwordHash: 'hash_b',
        status: 'active',
      },
    ]);

    // Ativo Global
    globalAssetId = crypto.randomUUID();
    await db.insert(assets).values({
      id: globalAssetId,
      ticker: 'VALE3_MKT',
      name: 'Vale S.A. Test Mkt',
      assetType: 'stock',
      market: 'B3',
      currency: 'BRL',
      isCustom: false,
    });

    // Ativo Customizado do Usuário A
    const customAsset = await createCustomAsset(
      {
        ticker: 'CUST_MKT_A',
        name: 'Custom Asset A',
        assetType: 'custom',
        market: 'CUSTOM',
        currency: 'BRL',
      },
      userA
    );
    customAssetAId = customAsset.id;
  });

  afterEach(async () => {
    // Limpa dados de teste intermediários
    const idsToClean = [globalAssetId, customAssetAId].filter(Boolean);
    if (idsToClean.length > 0) {
      await db.delete(marketQuotes).where(inArray(marketQuotes.assetId, idsToClean));
    }
    await db.delete(exchangeRates).where(eq(exchangeRates.fromCurrency, 'USD'));
  });

  afterAll(async () => {
    const idsToClean = [globalAssetId, customAssetAId].filter(Boolean);
    if (idsToClean.length > 0) {
      await db.delete(marketQuotes).where(inArray(marketQuotes.assetId, idsToClean));
      await db.delete(portfolioEvents).where(inArray(portfolioEvents.assetId, idsToClean));
      await db.delete(assets).where(inArray(assets.id, idsToClean));
    }
    await db.delete(exchangeRates).where(eq(exchangeRates.fromCurrency, 'USD'));
    await db.delete(portfolios).where(inArray(portfolios.userId, [userAId, userBId]));
    await db.delete(auditLogs).where(inArray(auditLogs.actorId, [userAId, userBId]));
    await db.delete(users).where(inArray(users.email, [userAEmail, userBEmail]));
  });

  it('deve registrar cotação com sucesso, persistir NUMERIC de alta precisão e gerar log de auditoria', async () => {
    const quote = await createMarketQuote(
      {
        assetId: globalAssetId,
        price: '45.12345678',
        currency: 'BRL',
        quoteDate: '2026-08-18T18:00:00.000Z',
        source: 'internal',
        delayStatus: 'eod',
        notes: 'Cotação de fechamento teste',
      },
      userA
    );

    expect(quote.id).toBeDefined();
    expect(quote.price.toFixed(8)).toBe('45.12345678');
    expect(quote.delayStatus).toBe('eod');

    // Valida auditoria
    const logs = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.recordId, quote.id));

    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe('CREATE_OR_UPDATE_QUOTE');
    expect(logs[0].actorId).toBe(userAId);
  });

  it('deve atualizar atomicamente a cotação existente (ON CONFLICT) para a mesma data sem duplicidade', async () => {
    const quoteDate = '2026-08-18T18:00:00.000Z';

    await createMarketQuote(
      {
        assetId: globalAssetId,
        price: '40.00',
        quoteDate,
      },
      userA
    );

    // Segunda inserção com novo preço na mesma data
    const updated = await createMarketQuote(
      {
        assetId: globalAssetId,
        price: '42.50',
        quoteDate,
      },
      userA
    );

    expect(updated.price.toString()).toBe('42.5');

    const countRows = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(marketQuotes)
      .where(eq(marketQuotes.assetId, globalAssetId));

    expect(countRows[0].count).toBe(1);
  });

  it('deve respeitar isolamento: Usuário B não pode cadastrar cotação em ativo customizado do Usuário A', async () => {
    await expect(
      createMarketQuote(
        {
          assetId: customAssetAId,
          price: '100.00',
          quoteDate: '2026-08-18T18:00:00.000Z',
        },
        userB
      )
    ).rejects.toThrow('FORBIDDEN');
  });

  it('deve consultar a cotação mais recente (maior quoteDate)', async () => {
    await createMarketQuote(
      {
        assetId: globalAssetId,
        price: '30.00',
        quoteDate: '2026-08-15T18:00:00.000Z',
      },
      userA
    );

    await createMarketQuote(
      {
        assetId: globalAssetId,
        price: '35.00',
        quoteDate: '2026-08-18T18:00:00.000Z',
      },
      userA
    );

    const latest = await getLatestQuoteForAsset(globalAssetId, userA);

    expect(latest).not.toBeNull();
    expect(latest?.price.toString()).toBe('35');
    expect(latest?.quoteDate.toISOString()).toBe('2026-08-18T18:00:00.000Z');
  });

  it('deve registrar e consultar taxas de câmbio (ex: USD -> BRL)', async () => {
    await createExchangeRate(
      {
        fromCurrency: 'USD',
        toCurrency: 'BRL',
        rate: '5.54321000',
        rateDate: '2026-08-18T18:00:00.000Z',
        source: 'internal',
        delayStatus: 'eod',
      },
      userA
    );

    const latest = await getLatestExchangeRate('USD', 'BRL');

    expect(latest).not.toBeNull();
    expect(latest?.rate.toFixed(8)).toBe('5.54321000');
    expect(latest?.fromCurrency).toBe('USD');
    expect(latest?.delayStatus).toBe('eod');
  });

  it('deve retornar delayStatus "eod" e nunca "realtime" para pares de identidade (ex: BRL -> BRL)', async () => {
    const identitySingle = await getLatestExchangeRate('BRL', 'BRL');
    expect(identitySingle).not.toBeNull();
    expect(identitySingle?.rate.toString()).toBe('1');
    expect(identitySingle?.delayStatus).toBe('eod');
    expect(identitySingle?.delayStatus).not.toBe('realtime');

    const identityBatch = await getLatestExchangeRates(['BRL', 'USD'], 'BRL');
    const brlRate = identityBatch.get('BRL');
    expect(brlRate).toBeDefined();
    expect(brlRate?.rate.toString()).toBe('1');
    expect(brlRate?.delayStatus).toBe('eod');
    expect(brlRate?.delayStatus).not.toBe('realtime');
  });

  it('deve persistir delayStatus "eod" por padrão e nunca "realtime" quando criado pelo serviço interno sem status explícito', async () => {
    const quote = await createMarketQuote(
      {
        assetId: globalAssetId,
        price: '33.00',
        quoteDate: '2026-08-18T18:00:00.000Z',
      },
      userA
    );

    expect(quote.delayStatus).toBe('eod');
    expect(quote.delayStatus).not.toBe('realtime');
  });

  it('deve rejeitar tentativa de persistir cotação com delayStatus "realtime" pela entrada comum', async () => {
    await expect(
      createMarketQuote(
        {
          assetId: globalAssetId,
          price: '33.00',
          quoteDate: '2026-08-18T18:00:00.000Z',
          // @ts-expect-error testando rejeição em runtime de status realtime
          delayStatus: 'realtime',
        },
        userA
      )
    ).rejects.toThrow(/realtime/);
  });

  it('deve rejeitar tentativa de persistir taxa de câmbio com delayStatus "realtime" pela entrada comum', async () => {
    await expect(
      createExchangeRate(
        {
          fromCurrency: 'USD',
          toCurrency: 'BRL',
          rate: '5.50',
          rateDate: '2026-08-18T18:00:00.000Z',
          // @ts-expect-error testando rejeição em runtime de status realtime
          delayStatus: 'realtime',
        },
        userA
      )
    ).rejects.toThrow(/realtime/);
  });

  it('deve integrar valuation a mercado e PnL não realizado em getPortfolioPositions', async () => {
    const portfolio = await createPortfolio(
      {
        name: 'Carteira Valuation Mkt Test',
        baseCurrency: 'BRL',
      },
      userA
    );

    // 1. Compra 100 unidades de VALE3 a R$ 30,00 (Total = 3000)
    await createPortfolioEvent(
      {
        portfolioId: portfolio.id,
        assetId: globalAssetId,
        type: 'BUY',
        tradeDate: '2026-08-10T12:00:00.000Z',
        quantity: '100',
        unitPrice: '30.00',
        fees: '0.00',
      },
      userA
    );

    // 2. Insere cotação de mercado de R$ 35,00 (default eod)
    await createMarketQuote(
      {
        assetId: globalAssetId,
        price: '35.00',
        quoteDate: '2026-08-18T18:00:00.000Z',
      },
      userA
    );

    // 3. Consulta posições da carteira
    const summary = await getPortfolioPositions(portfolio.id, userA);

    expect(summary.positions).toHaveLength(1);
    const pos = summary.positions[0];

    expect(pos.hasQuote).toBe(true);
    expect(pos.marketPrice?.toString()).toBe('35');
    expect(pos.marketValue?.toString()).toBe('3500');
    expect(pos.unrealizedPnL?.toString()).toBe('500');
    expect(pos.unrealizedPnLPercent?.toFixed(2)).toBe('16.67');
    expect(pos.delayStatus).toBe('eod');

    expect(summary.totalInvestedCost.toString()).toBe('3000');
    expect(summary.totalMarketValue.toString()).toBe('3500');
    expect(summary.totalUnrealizedPnL.toString()).toBe('500');
    expect(summary.totalUnrealizedPnLPercent?.toFixed(2)).toBe('16.67');
  });

  it('deve aplicar fallback seguro para ativos sem cotação cadastrada no banco', async () => {
    const portfolio = await createPortfolio(
      {
        name: 'Carteira Fallback Mkt Test',
        baseCurrency: 'BRL',
        purpose: 'ESTUDO',
      },
      userA
    );

    // Compra ativo customizado sem cotação
    await createPortfolioEvent(
      {
        portfolioId: portfolio.id,
        assetId: customAssetAId,
        type: 'BUY',
        tradeDate: '2026-08-12T12:00:00.000Z',
        quantity: '50',
        unitPrice: '10.00',
        fees: '5.00',
      },
      userA
    );

    const summary = await getPortfolioPositions(portfolio.id, userA);

    expect(summary.positions).toHaveLength(1);
    const pos = summary.positions[0];

    expect(pos.hasQuote).toBe(false);
    expect(pos.marketPrice).toBeNull();
    expect(pos.marketValue).toBeNull();
    expect(pos.unrealizedPnL).toBeNull();

    // Total de mercado não substitui valor ausente por custo
    expect(summary.totalInvestedCost.toString()).toBe('505'); // 50 * 10 + 5
    expect(summary.totalMarketValue.toString()).toBe('0');
    expect(summary.totalUnrealizedPnL.toString()).toBe('0');
    expect(summary.totalUnrealizedPnLPercent).toBeNull();
  });
});
