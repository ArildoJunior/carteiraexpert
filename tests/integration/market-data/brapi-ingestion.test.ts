import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import crypto from 'node:crypto';
import { eq, inArray, and } from 'drizzle-orm';
import { db } from '../../../src/lib/db';
import { users, assets, marketQuotes, auditLogs } from '../../../src/lib/db/schema';
import { Decimal } from '@/lib/decimal';
import type { SafeUser } from '../../../src/modules/identity/domain/user.types';
import { BrapiMarketDataProviderAdapter } from '../../../src/modules/market-data/server/adapters/brapi.adapter';
import { ManualPayloadAdapter } from '../../../src/modules/market-data/server/adapters/manual-payload.adapter';
import { ingestFromProvider, ingestMarketDataPayload } from '../../../src/modules/market-data/server/market-data-ingestion.service';
import { calculateAssetValuation } from '../../../src/modules/market-data/domain/valuation-engine';

describe('Integração: Ingestão de Cotações via Adaptador BRAPI (PostgreSQL Real)', () => {
  const testUserId = crypto.randomUUID();
  const testUserEmail = 'brapi_test_user@carteiraexpert.invalid';

  const testUser: SafeUser = {
    id: testUserId,
    email: testUserEmail,
    name: 'BRAPI Test User',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const testTickers = ['PETR4_BRAPI', 'VALE3_BRAPI', 'KNIP11_BRAPI'];
  let petr4AssetId: string;
  let vale3AssetId: string;
  let knip11AssetId: string;

  beforeAll(async () => {
    // Limpeza prévia
    await db.delete(assets).where(inArray(assets.ticker, testTickers));
    await db.delete(users).where(eq(users.email, testUserEmail));

    // Criação do usuário de teste
    await db.insert(users).values({
      id: testUserId,
      email: testUserEmail,
      name: testUser.name,
      passwordHash: 'dummy_hash_for_test',
      status: 'active',
    });

    // Criação dos ativos no catálogo
    const now = new Date();
    petr4AssetId = crypto.randomUUID();
    vale3AssetId = crypto.randomUUID();
    knip11AssetId = crypto.randomUUID();

    await db.insert(assets).values([
      {
        id: petr4AssetId,
        ticker: 'PETR4_BRAPI',
        name: 'Petrobras PN Test',
        assetType: 'stock',
        currency: 'BRL',
        market: 'B3',
        isCustom: false,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: vale3AssetId,
        ticker: 'VALE3_BRAPI',
        name: 'Vale ON Test',
        assetType: 'stock',
        currency: 'BRL',
        market: 'B3',
        isCustom: false,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: knip11AssetId,
        ticker: 'KNIP11_BRAPI',
        name: 'Kinea FII Test',
        assetType: 'fii',
        currency: 'BRL',
        market: 'B3',
        isCustom: false,
        createdAt: now,
        updatedAt: now,
      },
    ]);
  });

  afterAll(async () => {
    // Limpeza posterior
    const assetIds = [petr4AssetId, vale3AssetId, knip11AssetId].filter(Boolean);
    if (assetIds.length > 0) {
      await db.delete(marketQuotes).where(inArray(marketQuotes.assetId, assetIds));
      await db.delete(assets).where(inArray(assets.id, assetIds));
    }
    await db.delete(auditLogs).where(eq(auditLogs.actorId, testUserId));
    await db.delete(users).where(eq(users.id, testUserId));
  });

  it('deve ingerir e persistir cotações com sucesso no PostgreSQL a partir do adaptador BRAPI', async () => {
    const fixedQuoteDate = new Date('2026-08-18T18:00:00.000Z');

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        results: [
          {
            symbol: 'PETR4_BRAPI',
            regularMarketPrice: 38.5,
            currency: 'BRL',
            regularMarketTime: fixedQuoteDate.toISOString(),
          },
          {
            symbol: 'VALE3_BRAPI',
            regularMarketPrice: 62.1,
            currency: 'BRL',
            regularMarketTime: fixedQuoteDate.toISOString(),
          },
          {
            symbol: 'KNIP11_BRAPI',
            regularMarketPrice: 95.4,
            currency: 'BRL',
            regularMarketTime: fixedQuoteDate.toISOString(),
          },
        ],
      }),
    });

    const brapiAdapter = new BrapiMarketDataProviderAdapter({
      apiToken: 'mock_valid_token',
      customFetch: mockFetch as any,
    });

    const report = await ingestFromProvider(
      brapiAdapter,
      { tickers: testTickers },
      testUser,
      { executor: db }
    );

    expect(report.success).toBe(true);
    expect(report.quotesSummary.succeeded).toBe(3);
    expect(report.quotesSummary.failed).toBe(0);

    // Verificação no banco de dados
    const savedQuotes = await db
      .select()
      .from(marketQuotes)
      .where(inArray(marketQuotes.assetId, [petr4AssetId, vale3AssetId, knip11AssetId]));

    expect(savedQuotes).toHaveLength(3);

    const petr4Quote = savedQuotes.find((q) => q.assetId === petr4AssetId);
    expect(petr4Quote).toBeDefined();
    expect(new Decimal(petr4Quote!.price).toString()).toBe('38.5');
    expect(petr4Quote!.currency).toBe('BRL');
    expect(petr4Quote!.source).toBe('brapi');
    expect(petr4Quote!.delayStatus).toBe('unknown');
    expect(petr4Quote!.quoteDate.toISOString()).toBe(fixedQuoteDate.toISOString());

    // Verificação da auditoria
    const auditEntries = await db
      .select()
      .from(auditLogs)
      .where(eq(auditLogs.actorId, testUserId));

    expect(auditEntries.length).toBeGreaterThanOrEqual(3);
    const petr4Audit = auditEntries.find((a) => a.recordId === petr4Quote!.id);
    expect(petr4Audit).toBeDefined();
    expect(petr4Audit!.action).toBe('CREATE_OR_UPDATE_QUOTE');
  });

  it('deve rejeitar explicitamente targetDate histórico no ingestFromProvider impedindo gravação indevida', async () => {
    const historicalDate = new Date('2020-01-01T00:00:00.000Z');
    const mockFetch = vi.fn();

    const brapiAdapter = new BrapiMarketDataProviderAdapter({
      apiToken: 'mock_valid_token',
      customFetch: mockFetch as any,
    });

    await expect(
      ingestFromProvider(
        brapiAdapter,
        { tickers: ['PETR4_BRAPI'], targetDate: historicalDate },
        testUser,
        { executor: db }
      )
    ).rejects.toThrow(/aceita somente cotações correntes do dia atual em UTC/);

    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('deve realizar repetição idempotente (onConflictDoUpdate) atualizando o preço sem duplicar registros', async () => {
    const fixedQuoteDate = new Date('2026-08-18T18:00:00.000Z');

    const updatedPriceMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        results: [
          {
            symbol: 'PETR4_BRAPI',
            regularMarketPrice: 39.2, // Preço atualizado
            currency: 'BRL',
            regularMarketTime: fixedQuoteDate.toISOString(),
          },
        ],
      }),
    });

    const brapiAdapter = new BrapiMarketDataProviderAdapter({
      apiToken: 'mock_valid_token',
      customFetch: updatedPriceMock as any,
    });

    const report = await ingestFromProvider(
      brapiAdapter,
      { tickers: ['PETR4_BRAPI'] },
      testUser,
      { executor: db }
    );

    expect(report.success).toBe(true);

    const savedPetr4Quotes = await db
      .select()
      .from(marketQuotes)
      .where(eq(marketQuotes.assetId, petr4AssetId));

    // Garante que não houve duplicação de linha para a mesma data
    expect(savedPetr4Quotes).toHaveLength(1);
    expect(new Decimal(savedPetr4Quotes[0].price).toString()).toBe('39.2');
  });

  it('deve tratar resposta parcial registrando itens faltantes como PROVIDER_MISSING_DATA sem quebrar o lote', async () => {
    const fixedQuoteDate = new Date('2026-08-18T18:00:00.000Z');

    const partialMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        results: [
          {
            symbol: 'PETR4_BRAPI',
            regularMarketPrice: 40.0,
            currency: 'BRL',
            regularMarketTime: fixedQuoteDate.toISOString(),
          },
        ],
      }),
    });

    const brapiAdapter = new BrapiMarketDataProviderAdapter({
      apiToken: 'mock_valid_token',
      customFetch: partialMock as any,
    });

    // Solicitou PETR4_BRAPI e VALE3_BRAPI, mas BRAPI retornou somente PETR4_BRAPI
    const report = await ingestFromProvider(
      brapiAdapter,
      { tickers: ['PETR4_BRAPI', 'VALE3_BRAPI'] },
      testUser,
      { executor: db }
    );

    expect(report.success).toBe(false);
    expect(report.quotesSummary.total).toBe(2);
    expect(report.quotesSummary.succeeded).toBe(1);
    expect(report.quotesSummary.failed).toBe(1);

    const missingItem = report.quotesSummary.items.find((i) => i.identifier === 'VALE3_BRAPI');
    expect(missingItem).toBeDefined();
    expect(missingItem!.status).toBe('failed');
    expect(missingItem!.errorCode).toBe('PROVIDER_MISSING_DATA');
  });

  it('deve permitir que o motor de valuation consuma as cotações persistidas de forma determinística e pura', async () => {
    // Consulta a cotação persistida no banco
    const [petr4Quote] = await db
      .select()
      .from(marketQuotes)
      .where(eq(marketQuotes.assetId, petr4AssetId));

    expect(petr4Quote).toBeDefined();

    const quoteEntity = {
      id: petr4Quote.id,
      assetId: petr4Quote.assetId,
      price: new Decimal(petr4Quote.price),
      currency: petr4Quote.currency,
      quoteDate: petr4Quote.quoteDate,
      source: petr4Quote.source,
      delayStatus: petr4Quote.delayStatus as any,
      notes: petr4Quote.notes,
      createdBy: petr4Quote.createdBy,
      createdAt: petr4Quote.createdAt,
      updatedAt: petr4Quote.updatedAt,
    };

    // Simula posição em custódia
    const position = {
      assetId: petr4AssetId,
      ticker: 'PETR4_BRAPI',
      name: 'Petrobras PN Test',
      assetType: 'stock',
      market: 'B3',
      currency: 'BRL',
      isCustom: false,
      quantity: new Decimal('100'),
      averagePrice: new Decimal('35.00'),
      totalCost: new Decimal('3500.00'),
      totalFees: new Decimal('0.00'),
      totalRealizedPnL: new Decimal('0.00'),
      totalIncomeReceived: new Decimal('0.00'),
      lastTradeDate: new Date('2026-08-15T12:00:00.000Z'),
      hasFractionalShares: false,
      hasQuote: false,
      marketPrice: null,
      marketValue: null,
      unrealizedPnL: null,
      unrealizedPnLPercent: null,
      quoteCurrency: null,
      quoteDate: null,
      quoteSource: null,
      delayStatus: null,
      marketValueBrl: null,
      fxRateUsed: null,
      fxDateUsed: null,
      assetPriceReturnPercent: null,
    };

    const valuationResult = calculateAssetValuation(position, quoteEntity, null);

    expect(valuationResult.hasQuote).toBe(true);
    expect(valuationResult.marketPrice?.toString()).toBe('40');
    expect(valuationResult.marketValue?.toString()).toBe('4000');
    expect(valuationResult.unrealizedPnL?.toString()).toBe('500');
    expect(valuationResult.unrealizedPnLPercent?.toFixed(2)).toBe('14.29');
  });

  it('deve preservar a ingestão manual (ManualPayloadAdapter) como fallback funcional', async () => {
    const manualQuoteDate = new Date('2026-08-17T12:00:00.000Z');
    const manualPayload = {
      quotes: [
        {
          assetId: petr4AssetId,
          ticker: 'PETR4_BRAPI',
          price: '41.50',
          currency: 'BRL',
          quoteDate: manualQuoteDate,
          source: 'manual',
          delayStatus: 'manual' as const,
        },
      ],
    };

    const manualAdapter = new ManualPayloadAdapter(manualPayload);
    const report = await ingestMarketDataPayload(
      manualPayload,
      testUser,
      { executor: db }
    );

    expect(report.success).toBe(true);
    expect(report.quotesSummary.succeeded).toBe(1);

    const [savedManualQuote] = await db
      .select()
      .from(marketQuotes)
      .where(
        and(
          eq(marketQuotes.assetId, petr4AssetId),
          eq(marketQuotes.quoteDate, manualQuoteDate)
        )
      );

    expect(savedManualQuote).toBeDefined();
    expect(new Decimal(savedManualQuote.price).toString()).toBe('41.5');
    expect(savedManualQuote.source).toBe('manual');
  });
});
