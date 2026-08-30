import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { users } from '@/lib/db/schema/identity';
import { portfolios, portfolioEvents, assets } from '@/lib/db/schema/portfolio';
import { b3CotahistBatches, b3HistoricalQuotes } from '@/lib/db/schema/b3-market-data';
import { getPortfolioPositions } from '@/modules/portfolio/server/position.service';
import type { SafeUser } from '@/modules/identity/domain/user.types';

describe('Integration — Portfolio Valuation Powered by COTAHIST B3', () => {
  let testUser: SafeUser;
  let portfolioId: string;
  let petr4AssetId: string;
  let bbdc4AssetId: string;

  const tickerPetr = `PTR_VAL_${Date.now().toString().slice(-4)}`;
  const tickerBbdc = `BBD_VAL_${Date.now().toString().slice(-4)}`;

  beforeAll(async () => {
    // 1. Cria usuário autenticado
    const userId = crypto.randomUUID();
    const userEmail = `portfolio_val_${Date.now()}@carteiraexpert.test`;
    await db.insert(users).values({
      id: userId,
      email: userEmail,
      name: 'Investidor Teste Valuation',
      passwordHash: 'hash_test_123',
      status: 'active',
    });

    testUser = {
      id: userId,
      email: userEmail,
      name: 'Investidor Teste Valuation',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // 2. Cria carteira para o usuário
    portfolioId = crypto.randomUUID();
    await db.insert(portfolios).values({
      id: portfolioId,
      userId,
      name: 'Carteira Ações B3',
      description: 'Carteira de teste com ativos alimentados por COTAHIST',
      baseCurrency: 'BRL',
    });

    // 3. Cria ativos específicos no catálogo
    petr4AssetId = crypto.randomUUID();
    await db.insert(assets).values({
      id: petr4AssetId,
      ticker: tickerPetr,
      name: 'Petróleo Brasileiro S.A. Petrobras PN',
      assetType: 'stock',
      market: 'B3',
      currency: 'BRL',
      isCustom: false,
    });

    bbdc4AssetId = crypto.randomUUID();
    await db.insert(assets).values({
      id: bbdc4AssetId,
      ticker: tickerBbdc,
      name: 'Banco Bradesco S.A. PN',
      assetType: 'stock',
      market: 'B3',
      currency: 'BRL',
      isCustom: false,
    });

    // 4. Cria lote de auditoria
    const batchId = crypto.randomUUID();
    await db.insert(b3CotahistBatches).values({
      id: batchId,
      fileName: `COTAHIST_D_${Date.now()}.ZIP`,
      fileType: 'daily',
      fileSize: 1024,
      sha256: crypto.randomBytes(32).toString('hex'),
      storagePath: '/mock/cotahist.zip',
      status: 'COMPLETED',
      totalLines: 2,
      acceptedRecords: 2,
    });

    // 5. Garante cotações em b3_historical_quotes (PETR4 @ 41.45, BBDC4 @ 16.99)
    await db.insert(b3HistoricalQuotes).values([
      {
        id: crypto.randomUUID(),
        batchId,
        ticker: tickerPetr,
        tradeDate: '2026-08-26',
        bdiCode: '02',
        marketType: 10,
        shortName: 'PETROBRAS',
        specification: 'PN N2',
        currency: 'BRL',
        openPrice: '41.14',
        highPrice: '42.27',
        lowPrice: '40.97',
        averagePrice: '41.50',
        closePrice: '41.45',
        quantity: '74631000',
        financialVolume: '3110528270.00',
        tradeCount: 59151,
        recordHash: crypto.randomBytes(32).toString('hex'),
      },
      {
        id: crypto.randomUUID(),
        batchId,
        ticker: tickerBbdc,
        tradeDate: '2026-08-26',
        bdiCode: '02',
        marketType: 10,
        shortName: 'BRADESCO',
        specification: 'PN N1',
        currency: 'BRL',
        openPrice: '16.78',
        highPrice: '17.29',
        lowPrice: '16.76',
        averagePrice: '16.90',
        closePrice: '16.99',
        quantity: '34729800',
        financialVolume: '591886507.00',
        tradeCount: 35601,
        recordHash: crypto.randomBytes(32).toString('hex'),
      },
    ]);

    // 6. Registra compras na carteira:
    // - 100 PETR4 @ R$ 30,00 = R$ 3.000,00
    // - 200 BBDC4 @ R$ 15,00 = R$ 3.000,00
    await db.insert(portfolioEvents).values([
      {
        id: crypto.randomUUID(),
        portfolioId,
        assetId: petr4AssetId,
        type: 'BUY',
        tradeDate: new Date('2026-01-10T10:00:00Z'),
        settlementDate: new Date('2026-01-12T10:00:00Z'),
        quantity: '100',
        unitPrice: '30.00',
        fees: '0.00',
        notes: 'Compra inicial PETR4',
        createdBy: userId,
      },
      {
        id: crypto.randomUUID(),
        portfolioId,
        assetId: bbdc4AssetId,
        type: 'BUY',
        tradeDate: new Date('2026-01-15T10:00:00Z'),
        settlementDate: new Date('2026-01-17T10:00:00Z'),
        quantity: '200',
        unitPrice: '15.00',
        fees: '0.00',
        notes: 'Compra inicial BBDC4',
        createdBy: userId,
      },
    ]);
  });

  it('deve calcular a posição e valuation da carteira utilizando cotações COTAHIST B3', async () => {
    const summary = await getPortfolioPositions(portfolioId, testUser);

    expect(summary.positions).toHaveLength(2);

    // 1. Posição PETR4
    const petr4Pos = summary.positions.find((p) => p.ticker === tickerPetr);
    expect(petr4Pos).toBeDefined();
    expect(petr4Pos?.quantity.toString()).toBe('100');
    expect(petr4Pos?.averagePrice.toFixed(2)).toBe('30.00');
    expect(petr4Pos?.totalCost.toFixed(2)).toBe('3000.00');
    expect(petr4Pos?.hasQuote).toBe(true);
    expect(petr4Pos?.marketPrice?.toFixed(2)).toBe('41.45');
    expect(petr4Pos?.marketValue?.toFixed(2)).toBe('4145.00');
    expect(petr4Pos?.unrealizedPnL?.toFixed(2)).toBe('1145.00');
    expect(petr4Pos?.unrealizedPnLPercent?.toFixed(2)).toBe('38.17'); // (1145 / 3000) * 100
    expect(petr4Pos?.quoteSource).toBe('cotahist_b3');
    expect(petr4Pos?.delayStatus).toBe('eod');

    // 2. Posição BBDC4
    const bbdc4Pos = summary.positions.find((p) => p.ticker === tickerBbdc);
    expect(bbdc4Pos).toBeDefined();
    expect(bbdc4Pos?.quantity.toString()).toBe('200');
    expect(bbdc4Pos?.averagePrice.toFixed(2)).toBe('15.00');
    expect(bbdc4Pos?.totalCost.toFixed(2)).toBe('3000.00');
    expect(bbdc4Pos?.hasQuote).toBe(true);
    expect(bbdc4Pos?.marketPrice?.toFixed(2)).toBe('16.99');
    expect(bbdc4Pos?.marketValue?.toFixed(2)).toBe('3398.00');
    expect(bbdc4Pos?.unrealizedPnL?.toFixed(2)).toBe('398.00');
    expect(bbdc4Pos?.unrealizedPnLPercent?.toFixed(2)).toBe('13.27'); // (398 / 3000) * 100
    expect(bbdc4Pos?.quoteSource).toBe('cotahist_b3');
    expect(bbdc4Pos?.delayStatus).toBe('eod');

    // 3. Totais Consolidados da Carteira
    expect(summary.totalInvestedCost.toFixed(2)).toBe('6000.00');
    expect(summary.totalMarketValue?.toFixed(2)).toBe('7543.00'); // 4145 + 3398
    expect(summary.totalUnrealizedPnL?.toFixed(2)).toBe('1543.00'); // 1145 + 398
  });
});
