import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { assets } from '@/lib/db/schema/portfolio';
import { marketQuotes } from '@/lib/db/schema/market-data';
import { b3CotahistBatches, b3HistoricalQuotes } from '@/lib/db/schema/b3-market-data';
import { users } from '@/lib/db/schema/identity';
import { eq, inArray, sql } from 'drizzle-orm';
import {
  getPublicAssetDetailByTicker,
  getPublicCatalogList,
} from '@/modules/catalog/server/catalog.service';
import {
  classifyCanonicalCandidate,
  hasBdrEvidence,
  hasFiiEvidence,
  hasEtfEvidence,
  inferCanonicalAssetCategory,
} from '@/modules/catalog/domain/canonical-classifier';
import { searchAssets } from '@/modules/portfolio/server/asset.service';
import type { SafeUser } from '@/modules/identity/domain/user.types';

describe('Fase 1: Isolamento de Rotas, Busca, Listagem, Fallback e Classificação Canônica', () => {
  let testUserId: string;
  let testUser: SafeUser;
  let testBatchId: string;
  const createdAssetIds: string[] = [];
  const createdQuoteIds: string[] = [];

  const fallbackTickers = {
    bdr02: 'FBDR02',
    bdr35: 'FBDR35',
    stock02: 'FSTK02',
    fii12: 'FFII12',
    etf14: 'FETF14',
  };

  beforeAll(async () => {
    testUserId = crypto.randomUUID();
    testUser = {
      id: testUserId,
      email: `test-isolation-${Date.now()}@carteiraexpert.test`,
      name: 'Isolation Test User',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db.insert(users).values({
      id: testUserId,
      email: testUser.email,
      passwordHash: 'test_hash',
      name: testUser.name,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // 1. Garante presença dos ativos canônicos essenciais na tabela assets
    const testAssetsData = [
      { ticker: 'ABEV3', name: 'AMBEV S/A - ON', assetType: 'stock' },
      { ticker: 'PETR4', name: 'PETROBRAS - PN', assetType: 'stock' },
      { ticker: 'MXRF11', name: 'FII MAXI REN - CI  ER', assetType: 'fii' },
      { ticker: 'HGLG11', name: 'FII HGLG PAX - CI  ER', assetType: 'fii' },
      { ticker: 'BOVA11', name: 'ISHARES BOVA - CI', assetType: 'etf' },
      { ticker: 'AAPL34', name: 'APPLE - DRN', assetType: 'bdr' },
      { ticker: 'BPAC11', name: 'BANCO BTG PACTUAL - UNT', assetType: 'stock' },
      { ticker: 'KLBN11', name: 'KLABIN S/A - UNT', assetType: 'stock' },
      { ticker: 'TAEE11', name: 'TAESA - UNT', assetType: 'stock' },
      { ticker: 'AMBV3', name: 'AMBEV S/A - ON HISTORICO', assetType: 'stock', status: 'delisted', isTradeable: false },
      { ticker: 'FAKEFII1', name: 'FII TESTE FAKE - CI', assetType: 'stock' },
    ];

    for (const item of testAssetsData) {
      const [existing] = await db
        .select()
        .from(assets)
        .where(eq(assets.ticker, item.ticker))
        .limit(1);

      let assetId: string;
      if (!existing) {
        assetId = crypto.randomUUID();
        createdAssetIds.push(assetId);
        await db.insert(assets).values({
          id: assetId,
          ticker: item.ticker,
          name: item.name,
          assetType: item.assetType,
          market: 'B3',
          currency: 'BRL',
          isCustom: false,
          userId: null,
        });

        await db.execute(
          sql`UPDATE assets SET is_visible_catalog = true, is_tradeable = ${item.isTradeable ?? true}, status = ${item.status ?? 'active'}, provenance = 'curated_seed' WHERE id = ${assetId}`
        );
      } else {
        assetId = existing.id;
      }

      // Adiciona cotação recente em market_quotes se não possuir
      const [existingQuote] = await db
        .select()
        .from(marketQuotes)
        .where(eq(marketQuotes.assetId, assetId))
        .limit(1);

      if (!existingQuote) {
        await db.insert(marketQuotes).values({
          id: crypto.randomUUID(),
          assetId,
          price: '25.50000000',
          currency: 'BRL',
          quoteDate: new Date(),
          source: 'test_seed',
          delayStatus: 'eod',
          createdBy: testUserId,
        });
      }
    }

    // 2. Insere registros em b3_historical_quotes para teste de fallback histórico isolado
    testBatchId = crypto.randomUUID();
    await db.insert(b3CotahistBatches).values({
      id: testBatchId,
      fileName: `COTAHIST_TEST_ISOLATION_${Date.now()}.ZIP`,
      fileType: 'daily',
      fileSize: 2048,
      sha256: crypto.randomBytes(32).toString('hex'),
      storagePath: '/mock/cotahist_test.zip',
      status: 'COMPLETED',
      totalLines: 5,
      acceptedRecords: 5,
    });

    const fallbackQuotes = [
      {
        id: crypto.randomUUID(),
        batchId: testBatchId,
        ticker: fallbackTickers.bdr02,
        tradeDate: '2026-09-01',
        bdiCode: '02',
        marketType: 10,
        shortName: 'BDR TESTE 02',
        specification: 'DR3',
        currency: 'BRL',
        openPrice: '10.00',
        highPrice: '11.00',
        lowPrice: '9.90',
        averagePrice: '10.50',
        closePrice: '10.20',
        quantity: '1000',
        financialVolume: '10200.00',
        tradeCount: 50,
        recordHash: crypto.randomBytes(32).toString('hex'),
      },
      {
        id: crypto.randomUUID(),
        batchId: testBatchId,
        ticker: fallbackTickers.bdr35,
        tradeDate: '2026-09-01',
        bdiCode: '35',
        marketType: 10,
        shortName: 'BDR TESTE 35',
        specification: 'DR3',
        currency: 'BRL',
        openPrice: '20.00',
        highPrice: '21.00',
        lowPrice: '19.80',
        averagePrice: '20.40',
        closePrice: '20.50',
        quantity: '2000',
        financialVolume: '41000.00',
        tradeCount: 100,
        recordHash: crypto.randomBytes(32).toString('hex'),
      },
      {
        id: crypto.randomUUID(),
        batchId: testBatchId,
        ticker: fallbackTickers.stock02,
        tradeDate: '2026-09-01',
        bdiCode: '02',
        marketType: 10,
        shortName: 'ACAO TESTE 02',
        specification: 'ON NM',
        currency: 'BRL',
        openPrice: '30.00',
        highPrice: '31.00',
        lowPrice: '29.50',
        averagePrice: '30.20',
        closePrice: '30.80',
        quantity: '5000',
        financialVolume: '154000.00',
        tradeCount: 500,
        recordHash: crypto.randomBytes(32).toString('hex'),
      },
      {
        id: crypto.randomUUID(),
        batchId: testBatchId,
        ticker: fallbackTickers.fii12,
        tradeDate: '2026-09-01',
        bdiCode: '12',
        marketType: 10,
        shortName: 'FII TESTE 12',
        specification: 'CI',
        currency: 'BRL',
        openPrice: '100.00',
        highPrice: '101.50',
        lowPrice: '99.80',
        averagePrice: '100.40',
        closePrice: '100.80',
        quantity: '800',
        financialVolume: '80640.00',
        tradeCount: 200,
        recordHash: crypto.randomBytes(32).toString('hex'),
      },
      {
        id: crypto.randomUUID(),
        batchId: testBatchId,
        ticker: fallbackTickers.etf14,
        tradeDate: '2026-09-01',
        bdiCode: '14',
        marketType: 10,
        shortName: 'ISHARES ETF 14',
        specification: 'CI',
        currency: 'BRL',
        openPrice: '50.00',
        highPrice: '51.00',
        lowPrice: '49.80',
        averagePrice: '50.30',
        closePrice: '50.70',
        quantity: '1200',
        financialVolume: '60840.00',
        tradeCount: 300,
        recordHash: crypto.randomBytes(32).toString('hex'),
      },
    ];

    for (const q of fallbackQuotes) {
      createdQuoteIds.push(q.id);
      await db.insert(b3HistoricalQuotes).values(q);
    }
  });

  afterAll(async () => {
    if (createdQuoteIds.length > 0) {
      await db.delete(b3HistoricalQuotes).where(inArray(b3HistoricalQuotes.id, createdQuoteIds));
    }
    if (testBatchId) {
      await db.delete(b3CotahistBatches).where(eq(b3CotahistBatches.id, testBatchId));
    }
    if (createdAssetIds.length > 0) {
      await db.delete(marketQuotes).where(inArray(marketQuotes.assetId, createdAssetIds));
      await db.delete(assets).where(inArray(assets.id, createdAssetIds));
    }
    if (testUserId) {
      await db.delete(users).where(eq(users.id, testUserId));
    }
  });

  describe('1. Validação Rigorosa de Rotas por Categoria (Rejeição de Vazamento)', () => {
    it('rota de ação (/acoes/[ticker]) deve rejeitar FII (ex: HGLG11) retornando null', async () => {
      const asset = await getPublicAssetDetailByTicker('HGLG11', 'stock');
      expect(asset).toBeNull();
    });

    it('rota de ação (/acoes/[ticker]) deve rejeitar ETF (ex: BOVA11) retornando null', async () => {
      const asset = await getPublicAssetDetailByTicker('BOVA11', 'stock');
      expect(asset).toBeNull();
    });

    it('rota de FII (/fiis/[ticker]) deve rejeitar ação (ex: PETR4) retornando null', async () => {
      const asset = await getPublicAssetDetailByTicker('PETR4', 'fii');
      expect(asset).toBeNull();
    });

    it('rota de ETF (/etfs/[ticker]) deve rejeitar ação (ex: PETR4) retornando null', async () => {
      const asset = await getPublicAssetDetailByTicker('PETR4', 'etf');
      expect(asset).toBeNull();
    });

    it('rota de BDR (/bdrs/[ticker]) deve rejeitar ação (ex: PETR4) retornando null', async () => {
      const asset = await getPublicAssetDetailByTicker('PETR4', 'bdr');
      expect(asset).toBeNull();
    });

    it('ativo persistido como stock com nome contendo FII deve ser rejeitado em /fiis', async () => {
      const asset = await getPublicAssetDetailByTicker('FAKEFII1', 'fii');
      expect(asset).toBeNull();
    });

    it('rotas legítimas devem retornar 200 com assetType rigorosamente correspondente', async () => {
      const stock1 = await getPublicAssetDetailByTicker('ABEV3', 'stock');
      expect(stock1).not.toBeNull();
      expect(stock1?.assetType).toBe('stock');

      const stock2 = await getPublicAssetDetailByTicker('PETR4', 'stock');
      expect(stock2).not.toBeNull();
      expect(stock2?.assetType).toBe('stock');

      const fii1 = await getPublicAssetDetailByTicker('MXRF11', 'fii');
      expect(fii1).not.toBeNull();
      expect(fii1?.assetType).toBe('fii');

      const fii2 = await getPublicAssetDetailByTicker('HGLG11', 'fii');
      expect(fii2).not.toBeNull();
      expect(fii2?.assetType).toBe('fii');

      const etf = await getPublicAssetDetailByTicker('BOVA11', 'etf');
      expect(etf).not.toBeNull();
      expect(etf?.assetType).toBe('etf');

      const bdr = await getPublicAssetDetailByTicker('AAPL34', 'bdr');
      expect(bdr).not.toBeNull();
      expect(bdr?.assetType).toBe('bdr');
    });
  });

  describe('2. Listagens Públicas e Prevenção de Vazamento de Units para FIIs', () => {
    it('/acoes deve conter exclusivamente ações (stock)', async () => {
      const result = await getPublicCatalogList({ category: 'stock', limit: 30 });
      expect(result.items.length).toBeGreaterThan(0);
      for (const item of result.items) {
        expect(item.assetType).toBe('stock');
        expect(item.name.toUpperCase()).not.toMatch(/^FII /);
      }
    });

    it('/fiis deve conter exclusivamente FIIs (fii)', async () => {
      const result = await getPublicCatalogList({ category: 'fii', limit: 30 });
      expect(result.items.length).toBeGreaterThan(0);
      for (const item of result.items) {
        expect(item.assetType).toBe('fii');
      }
    });

    it('units de ações como BPAC11, KLBN11 e TAEE11 NÃO devem aparecer em /fiis', async () => {
      const result = await getPublicCatalogList({ category: 'fii', limit: 100 });
      const tickers = result.items.map((i) => i.ticker);
      expect(tickers).not.toContain('BPAC11');
      expect(tickers).not.toContain('KLBN11');
      expect(tickers).not.toContain('TAEE11');
    });

    it('HGLG11 cadastrado como fii deve aparecer em /fiis', async () => {
      const result = await getPublicCatalogList({ category: 'fii', query: 'HGLG11', limit: 10 });
      expect(result.items.some((i) => i.ticker === 'HGLG11')).toBe(true);
    });

    it('registro persistido como stock não deve aparecer em /fiis somente porque termina em 11', async () => {
      const result = await getPublicCatalogList({ category: 'fii', query: 'BPAC11', limit: 10 });
      expect(result.items.some((i) => i.ticker === 'BPAC11')).toBe(false);
    });

    it('/etfs deve conter exclusivamente ETFs (etf)', async () => {
      const result = await getPublicCatalogList({ category: 'etf', limit: 30 });
      expect(result.items.length).toBeGreaterThan(0);
      for (const item of result.items) {
        expect(item.assetType).toBe('etf');
      }
    });

    it('/bdrs deve conter exclusivamente BDRs (bdr)', async () => {
      const result = await getPublicCatalogList({ category: 'bdr', limit: 30 });
      expect(result.items.length).toBeGreaterThan(0);
      for (const item of result.items) {
        expect(item.assetType).toBe('bdr');
      }
    });

    it('/ativos unificado deve manter identificação clara da categoria para cada item', async () => {
      const result = await getPublicCatalogList({ limit: 40 });
      expect(result.items.length).toBeGreaterThan(0);
      for (const item of result.items) {
        expect(['stock', 'fii', 'etf', 'bdr']).toContain(item.assetType);
      }
    });
  });

  describe('3. Fallback de Cotações Históricas (b3_historical_quotes)', () => {
    it('BDR DR3 com BDI 02 deve ser aceito em /bdrs e rejeitado em /acoes', async () => {
      const bdrResult = await getPublicAssetDetailByTicker(fallbackTickers.bdr02, 'bdr');
      expect(bdrResult).not.toBeNull();
      expect(bdrResult?.assetType).toBe('bdr');

      const stockResult = await getPublicAssetDetailByTicker(fallbackTickers.bdr02, 'stock');
      expect(stockResult).toBeNull();
    });

    it('BDR DR3 com BDI 35 deve ser aceito em /bdrs e rejeitado em /acoes', async () => {
      const bdrResult = await getPublicAssetDetailByTicker(fallbackTickers.bdr35, 'bdr');
      expect(bdrResult).not.toBeNull();
      expect(bdrResult?.assetType).toBe('bdr');

      const stockResult = await getPublicAssetDetailByTicker(fallbackTickers.bdr35, 'stock');
      expect(stockResult).toBeNull();
    });

    it('ação com BDI 02 deve ser aceita em /acoes e rejeitada em /bdrs', async () => {
      const stockResult = await getPublicAssetDetailByTicker(fallbackTickers.stock02, 'stock');
      expect(stockResult).not.toBeNull();
      expect(stockResult?.assetType).toBe('stock');

      const bdrResult = await getPublicAssetDetailByTicker(fallbackTickers.stock02, 'bdr');
      expect(bdrResult).toBeNull();
    });

    it('FII com BDI 12 deve ser aceito em /fiis e rejeitado em /acoes', async () => {
      const fiiResult = await getPublicAssetDetailByTicker(fallbackTickers.fii12, 'fii');
      expect(fiiResult).not.toBeNull();
      expect(fiiResult?.assetType).toBe('fii');

      const stockResult = await getPublicAssetDetailByTicker(fallbackTickers.fii12, 'stock');
      expect(stockResult).toBeNull();
    });

    it('ETF com BDI 14 deve ser aceito em /etfs e rejeitado em /acoes', async () => {
      const etfResult = await getPublicAssetDetailByTicker(fallbackTickers.etf14, 'etf');
      expect(etfResult).not.toBeNull();
      expect(etfResult?.assetType).toBe('etf');

      const stockResult = await getPublicAssetDetailByTicker(fallbackTickers.etf14, 'stock');
      expect(stockResult).toBeNull();
    });
  });

  describe('4. Busca Filtrada por asset_type em searchAssets', () => {
    it('deve filtrar estritamente por assetType = stock', async () => {
      const results = await searchAssets(
        { query: 'ABEV', assetType: 'stock', limit: 10 },
        testUser
      );
      expect(results.length).toBeGreaterThan(0);
      for (const asset of results) {
        expect(asset.assetType).toBe('stock');
      }
    });

    it('busca de FII não deve retornar ações como PETR4', async () => {
      const results = await searchAssets(
        { query: 'PETR4', assetType: 'fii', limit: 10 },
        testUser
      );
      expect(results.length).toBe(0);
    });

    it('busca de ação não deve retornar FIIs como HGLG11', async () => {
      const results = await searchAssets(
        { query: 'HGLG11', assetType: 'stock', limit: 10 },
        testUser
      );
      expect(results.length).toBe(0);
    });

    it('busca de ETF não deve retornar ações nem FIIs', async () => {
      const results = await searchAssets(
        { query: 'PETR4', assetType: 'etf', limit: 10 },
        testUser
      );
      expect(results.length).toBe(0);
    });

    it('busca de BDR não deve retornar ações nem FIIs', async () => {
      const results = await searchAssets(
        { query: 'PETR4', assetType: 'bdr', limit: 10 },
        testUser
      );
      expect(results.length).toBe(0);
    });
  });

  describe('5. Classificador Canônico — BDRs DR3, Units de Ações e FIIs', () => {
    it('deve classificar AURA33 com especificação DR3 como bdr', () => {
      const res = classifyCanonicalCandidate({
        ticker: 'AURA33',
        shortName: 'AURA 360',
        specification: 'DR3',
        bdiCode: '35',
        marketType: 10,
        tradeDate: '2024-05-15',
      });
      expect(res.decision).toBe('ACCEPT');
      expect(res.assetType).toBe('bdr');
    });

    it('deve classificar NUBR33 com especificação DR3 como bdr', () => {
      const res = classifyCanonicalCandidate({
        ticker: 'NUBR33',
        shortName: 'NU-NUBANK',
        specification: 'DR3',
        bdiCode: '35',
        marketType: 10,
        tradeDate: '2024-05-15',
      });
      expect(res.decision).toBe('ACCEPT');
      expect(res.assetType).toBe('bdr');
    });

    it('deve classificar BDR DR3 com BDI 02 como bdr', () => {
      const res = classifyCanonicalCandidate({
        ticker: 'BSAN33',
        shortName: 'BANSANTANDER',
        specification: 'DR3',
        bdiCode: '02',
        marketType: 10,
        tradeDate: '2024-05-15',
      });
      expect(res.decision).toBe('ACCEPT');
      expect(res.assetType).toBe('bdr');
    });

    it('deve classificar BDR DR3 com BDI 35 como bdr', () => {
      const res = classifyCanonicalCandidate({
        ticker: 'G2DI33',
        shortName: 'G2D INVEST',
        specification: 'DR3',
        bdiCode: '35',
        marketType: 10,
        tradeDate: '2024-05-15',
      });
      expect(res.decision).toBe('ACCEPT');
      expect(res.assetType).toBe('bdr');
    });

    it('deve classificar BBTG36 com especificação DR3 A como bdr', () => {
      const res = classifyCanonicalCandidate({
        ticker: 'BBTG36',
        shortName: 'BTG PACTUAL',
        specification: 'DR3 A',
        bdiCode: '02',
        marketType: 10,
        tradeDate: '2024-05-15',
      });
      expect(res.decision).toBe('ACCEPT');
      expect(res.assetType).toBe('bdr');
    });

    it('ticker terminado em 33 sem evidência de BDR NÃO deve ser classificado como bdr', () => {
      const res = classifyCanonicalCandidate({
        ticker: 'TEST33',
        shortName: 'EMPRESA TESTE',
        specification: 'ON',
        bdiCode: '02',
        marketType: 10,
        tradeDate: '2024-05-15',
      });
      expect(res.assetType).not.toBe('bdr');
    });

    it('units de ações como BPAC11 e KLBN11 devem ser classificadas como stock (shareClass UNT)', () => {
      const bpac = classifyCanonicalCandidate({
        ticker: 'BPAC11',
        shortName: 'BANCO BTG PACTUAL',
        specification: 'UNT N2',
        bdiCode: '02',
        marketType: 10,
        tradeDate: '2026-09-04',
      });
      expect(bpac.decision).toBe('ACCEPT');
      expect(bpac.assetType).toBe('stock');
      expect(bpac.shareClass).toBe('UNT');

      const klbn = classifyCanonicalCandidate({
        ticker: 'KLBN11',
        shortName: 'KLABIN S/A',
        specification: 'UNT N2',
        bdiCode: '02',
        marketType: 10,
        tradeDate: '2026-09-04',
      });
      expect(klbn.decision).toBe('ACCEPT');
      expect(klbn.assetType).toBe('stock');
      expect(klbn.shareClass).toBe('UNT');
    });

    it('deve classificar cota de FII como fii via BDI 12 ou nome oficial', () => {
      const res = classifyCanonicalCandidate({
        ticker: 'MXRF11',
        shortName: 'FII MAXI REN',
        specification: 'CI ER',
        bdiCode: '12',
        marketType: 10,
        tradeDate: '2026-09-04',
      });
      expect(res.decision).toBe('ACCEPT');
      expect(res.assetType).toBe('fii');
    });

    it('deve classificar cota de FII de balcão (série 11B) como fii', () => {
      const res = classifyCanonicalCandidate({
        ticker: 'ANCR11B',
        shortName: 'FII ANCAR IC',
        specification: 'CI MB',
        bdiCode: '12',
        marketType: 10,
        tradeDate: '2025-10-10',
      });
      expect(res.decision).toBe('ACCEPT');
      expect(res.assetType).toBe('fii');
    });

    it('deve rejeitar direitos e recibos de subscrição no catálogo de custódia principal', () => {
      const right1 = classifyCanonicalCandidate({
        ticker: 'ALZR12',
        shortName: 'FII ALIANZA',
        specification: 'DIR',
        bdiCode: '12',
        marketType: 10,
        tradeDate: '2024-03-20',
      });
      expect(right1.decision).toBe('REJECT');
      expect(right1.rejectionReason).toBe('SUBSCRIPTION_RIGHT_OR_RECEIPT');
    });
  });

  describe('6. Ativo Delisted e Permissão de Venda em Custódia', () => {
    it('ativo delisted deve permanecer consultável no detalhe público', async () => {
      const detail = await getPublicAssetDetailByTicker('AMBV3', 'stock');
      expect(detail).not.toBeNull();
      expect(detail?.ticker).toBe('AMBV3');
      expect(detail?.assetType).toBe('stock');
      expect(detail?.status).toBe('delisted');
    });

    it('busca de ativos deve retornar ativos delisted quando isTradeableOnly = false (fluxo de venda)', async () => {
      const results = await searchAssets(
        { query: 'AMBV', isTradeableOnly: false, limit: 10 },
        testUser
      );
      expect(results.length).toBeGreaterThan(0);
      expect(results.some((r) => r.ticker === 'AMBV3')).toBe(true);
    });

    it('busca com isTradeableOnly = true deve excluir ativos inativos/delisted (fluxo de compra)', async () => {
      const results = await searchAssets(
        { query: 'AMBV', isTradeableOnly: true, limit: 10 },
        testUser
      );
      expect(results.some((r) => r.ticker === 'AMBV3')).toBe(false);
    });
  });
});
