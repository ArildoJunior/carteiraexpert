import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { assets, portfolios, portfolioEvents } from '@/lib/db/schema/portfolio';
import { marketQuotes } from '@/lib/db/schema/market-data';
import { users } from '@/lib/db/schema/identity';
import { auditLogs } from '@/lib/db/schema/audit';
import { eq, inArray } from 'drizzle-orm';
import {
  getPublicCatalogList,
  getPublicAssetDetailByTicker,
  getPublicAssetPriceHistory,
  getPublicSitemapAssets,
} from '@/modules/catalog/server/catalog.service';
import { createPortfolioEvent } from '@/modules/portfolio/server/portfolio-event.service';
import { AuthorizationError } from '@/modules/identity/domain/errors';
import { PortfolioFrozenError } from '@/modules/portfolio/domain/errors';
import type { SafeUser } from '@/modules/identity/domain/user.types';

describe('Catálogo Público — Testes de Integração (PostgreSQL Real)', () => {
  let testUser1: SafeUser;
  let testUser2: SafeUser;
  let publicStockAssetId: string;
  let publicFiiAssetId: string;
  let customAssetId: string;
  let createdAssetIds: string[] = [];
  let createdUserIds: string[] = [];

  beforeEach(async () => {
    // 1. Cria usuários de teste
    const userId1 = crypto.randomUUID();
    const userId2 = crypto.randomUUID();
    createdUserIds.push(userId1, userId2);

    await db.insert(users).values([
      {
        id: userId1,
        email: `catalog-test-user1-${Date.now()}@example.com`,
        passwordHash: 'hash',
        name: 'Usuário Teste 1',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: userId2,
        email: `catalog-test-user2-${Date.now()}@example.com`,
        passwordHash: 'hash',
        name: 'Usuário Teste 2',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]);

    testUser1 = {
      id: userId1,
      email: `catalog-test-user1-${Date.now()}@example.com`,
      name: 'Usuário Teste 1',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    testUser2 = {
      id: userId2,
      email: `catalog-test-user2-${Date.now()}@example.com`,
      name: 'Usuário Teste 2',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // 2. Cria ativos de teste
    const uniqueSuffix = Date.now().toString().slice(-4);
    publicStockAssetId = crypto.randomUUID();
    publicFiiAssetId = crypto.randomUUID();
    customAssetId = crypto.randomUUID();
    createdAssetIds.push(publicStockAssetId, publicFiiAssetId, customAssetId);

    await db.insert(assets).values([
      // Ativo público 1: Ação
      {
        id: publicStockAssetId,
        ticker: `TEST${uniqueSuffix}`,
        name: 'Empresa Teste de Ações S.A.',
        assetType: 'stock',
        market: 'B3',
        currency: 'BRL',
        isCustom: false,
        userId: null,
      },
      // Ativo público 2: FII
      {
        id: publicFiiAssetId,
        ticker: `FII${uniqueSuffix}11`,
        name: 'Fundo Imobiliário Teste FII',
        assetType: 'fii',
        market: 'B3',
        currency: 'BRL',
        isCustom: false,
        userId: null,
      },
      // Ativo privado/customizado do Usuário 1
      {
        id: customAssetId,
        ticker: `CUST${uniqueSuffix}`,
        name: 'Ativo Customizado Privado',
        assetType: 'custom',
        market: 'CUSTOM',
        currency: 'BRL',
        isCustom: true,
        userId: testUser1.id,
      },
    ]);

    // 3. Insere cotações históricas para o ativo público de ação
    const today = new Date();
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

    await db.insert(marketQuotes).values([
      {
        id: crypto.randomUUID(),
        assetId: publicStockAssetId,
        price: '42.00000000',
        currency: 'BRL',
        quoteDate: today,
        source: 'brapi',
        delayStatus: 'delayed_15m',
        createdBy: testUser1.id,
      },
      {
        id: crypto.randomUUID(),
        assetId: publicStockAssetId,
        price: '40.00000000',
        currency: 'BRL',
        quoteDate: yesterday,
        source: 'brapi',
        delayStatus: 'eod',
        createdBy: testUser1.id,
      },
    ]);
  });

  afterAll(async () => {
    // Limpeza
    if (createdAssetIds.length > 0) {
      await db.delete(marketQuotes).where(inArray(marketQuotes.assetId, createdAssetIds));
      await db.delete(portfolioEvents).where(inArray(portfolioEvents.assetId, createdAssetIds));
      await db.delete(assets).where(inArray(assets.id, createdAssetIds));
    }
    if (createdUserIds.length > 0) {
      await db.delete(portfolios).where(inArray(portfolios.userId, createdUserIds));
      await db.delete(users).where(inArray(users.id, createdUserIds));
    }
  });

  describe('Consultas Públicas e Isolamento', () => {
    it('deve listar ativos públicos e excluir rigorosamente ativos privados/customizados', async () => {
      const result = await getPublicCatalogList({ limit: 50 });

      // O ativo de teste público deve estar presente
      const foundPublicStock = result.items.find((i) => i.id === publicStockAssetId);
      expect(foundPublicStock).toBeDefined();
      expect(foundPublicStock?.latestPrice).toBe('42.00');
      expect(foundPublicStock?.dailyVariation).toBe('5.00'); // ((42 - 40) / 40) * 100
      expect(foundPublicStock?.freshnessStatus).toBe('delayed_15m');

      // O ativo customizado privado NUNCA deve estar na listagem pública
      const foundCustom = result.items.find((i) => i.id === customAssetId);
      expect(foundCustom).toBeUndefined();
    });

    it('deve filtrar por categoria específica (ações vs FIIs)', async () => {
      const stocksResult = await getPublicCatalogList({ category: 'stock', limit: 50 });
      expect(stocksResult.items.some((i) => i.id === publicStockAssetId)).toBe(true);
      expect(stocksResult.items.some((i) => i.id === publicFiiAssetId)).toBe(false);

      const fiisResult = await getPublicCatalogList({ category: 'fii', limit: 50 });
      expect(fiisResult.items.some((i) => i.id === publicFiiAssetId)).toBe(true);
      expect(fiisResult.items.some((i) => i.id === publicStockAssetId)).toBe(false);
    });

    it('deve retornar detalhes do ativo público pelo ticker', async () => {
      const [assetRow] = await db
        .select()
        .from(assets)
        .where(eq(assets.id, publicStockAssetId));

      const detail = await getPublicAssetDetailByTicker(assetRow.ticker, 'stock');
      expect(detail).not.toBeNull();
      expect(detail?.ticker).toBe(assetRow.ticker);
      expect(detail?.latestPrice).toBe('42.00');
      expect(detail?.previousClosePrice).toBe('40.00');
      expect(detail?.dailyVariation).toBe('5.00');
      expect(detail?.variationStatus).toBe('available');
    });

    it('deve retornar null ao tentar consultar ticker de ativo customizado privadamente', async () => {
      const [customRow] = await db
        .select()
        .from(assets)
        .where(eq(assets.id, customAssetId));

      const detail = await getPublicAssetDetailByTicker(customRow.ticker);
      expect(detail).toBeNull();
    });

    it('deve retornar histórico de preços ordenado cronologicamente', async () => {
      const history = await getPublicAssetPriceHistory(publicStockAssetId, '1M');
      expect(history.length).toBe(2);
      expect(Number(history[0].price)).toBe(40.0);
      expect(Number(history[1].price)).toBe(42.0);
    });

    it('deve retornar ativos para o sitemap respeitando o limite', async () => {
      const sitemapAssets = await getPublicSitemapAssets(100);
      expect(sitemapAssets.length).toBeGreaterThan(0);
      expect(sitemapAssets.some((a) => a.ticker.startsWith('TEST'))).toBe(true);
    });
  });

  describe('Integração com Lançamentos e Autorização', () => {
    it('deve permitir lançamento de compra de ativo público em carteira própria', async () => {
      const portfolioId = crypto.randomUUID();
      await db.insert(portfolios).values({
        id: portfolioId,
        userId: testUser1.id,
        name: 'Carteira Teste Usuário 1',
        baseCurrency: 'BRL',
        status: 'active',
      });

      const event = await createPortfolioEvent(
        {
          portfolioId,
          assetId: publicStockAssetId,
          type: 'BUY',
          tradeDate: new Date(),
          quantity: '100',
          unitPrice: '42.00',
          fees: '0',
          currency: 'BRL',
          source: 'manual',
        },
        testUser1
      );

      expect(event.id).toBeDefined();
      expect(event.portfolioId).toBe(portfolioId);
      expect(event.assetId).toBe(publicStockAssetId);
    });

    it('deve rejeitar lançamento em carteira de outro usuário e registrar IDOR no audit_logs em consultas diretas', async () => {
      // Cria carteira do Usuário 2
      const portfolioIdUser2 = crypto.randomUUID();
      await db.insert(portfolios).values({
        id: portfolioIdUser2,
        userId: testUser2.id,
        name: 'Carteira Secreta Usuário 2',
        baseCurrency: 'BRL',
        status: 'active',
      });

      // 1. Usuário 1 tenta lançar operação na carteira do Usuário 2 -> rejeitado com AuthorizationError
      await expect(
        createPortfolioEvent(
          {
            portfolioId: portfolioIdUser2,
            assetId: publicStockAssetId,
            type: 'BUY',
            tradeDate: new Date(),
            quantity: '50',
            unitPrice: '42.00',
            fees: '0',
            currency: 'BRL',
            source: 'manual',
          },
          testUser1
        )
      ).rejects.toThrow(AuthorizationError);

      // 2. Consulta direta de carteira de terceiro dispara assertOwnership com commit no audit_logs
      const { getPortfolioById } = await import('@/modules/portfolio/server/portfolio.service');
      await expect(getPortfolioById(portfolioIdUser2, testUser1)).rejects.toThrow(AuthorizationError);

      // Confirma que a tentativa indevida foi registrada no audit_logs
      const auditRows = await db
        .select()
        .from(auditLogs)
        .where(eq(auditLogs.actorId, testUser1.id));

      const idorLog = auditRows.find((l) => l.reason === 'FORBIDDEN_IDOR_ATTEMPT');
      expect(idorLog).toBeDefined();
    });

    it('deve rejeitar lançamento em carteira congelada', async () => {
      const frozenPortfolioId = crypto.randomUUID();
      await db.insert(portfolios).values({
        id: frozenPortfolioId,
        userId: testUser1.id,
        name: 'Carteira Congelada por Downgrade',
        baseCurrency: 'BRL',
        status: 'frozen',
      });

      await expect(
        createPortfolioEvent(
          {
            portfolioId: frozenPortfolioId,
            assetId: publicStockAssetId,
            type: 'BUY',
            tradeDate: new Date(),
            quantity: '10',
            unitPrice: '42.00',
            fees: '0',
            currency: 'BRL',
            source: 'manual',
          },
          testUser1
        )
      ).rejects.toThrow(PortfolioFrozenError);
    });

    it('deve localizar na busca por ativos e detalhes um ticker que existe apenas em b3_historical_quotes', async () => {
      const { b3CotahistBatches, b3HistoricalQuotes } = await import('@/lib/db/schema/b3-market-data');

      const uniqueTicker = `WEGE_${Date.now().toString().slice(-4)}`;
      const batchId = crypto.randomUUID();

      // Cria lote e cotação em b3_historical_quotes sem criar registro em assets
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

      await db.insert(b3HistoricalQuotes).values([
        {
          id: crypto.randomUUID(),
          batchId,
          ticker: uniqueTicker,
          tradeDate: '2026-08-26',
          bdiCode: '02',
          marketType: 10,
          shortName: 'WEG',
          specification: 'ON NM',
          currency: 'BRL',
          openPrice: '52.00',
          highPrice: '53.50',
          lowPrice: '51.80',
          averagePrice: '52.70',
          closePrice: '53.20',
          quantity: '1000000',
          financialVolume: '52700000.00',
          tradeCount: 12000,
          recordHash: crypto.randomBytes(32).toString('hex'),
        },
        {
          id: crypto.randomUUID(),
          batchId,
          ticker: uniqueTicker,
          tradeDate: '2026-08-25',
          bdiCode: '02',
          marketType: 10,
          shortName: 'WEG',
          specification: 'ON NM',
          currency: 'BRL',
          openPrice: '51.00',
          highPrice: '52.20',
          lowPrice: '50.90',
          averagePrice: '51.50',
          closePrice: '51.80',
          quantity: '900000',
          financialVolume: '46350000.00',
          tradeCount: 11000,
          recordHash: crypto.randomBytes(32).toString('hex'),
        },
      ]);

      // 1. Testa busca paginada em getPublicCatalogList com minúsculas e espaços
      const searchResult = await getPublicCatalogList({
        query: `  ${uniqueTicker.toLowerCase()}  `,
      });

      expect(searchResult.items.length).toBeGreaterThanOrEqual(1);
      const foundItem = searchResult.items.find((i) => i.ticker === uniqueTicker);
      expect(foundItem).toBeDefined();
      expect(foundItem?.name).toContain('WEG');
      expect(foundItem?.latestPrice).toBe('53.20');
      expect(foundItem?.dailyVariation).toBe('2.70'); // (53.20 - 51.80) / 51.80 * 100 = 2.7027%

      // 2. Testa detalhe do ativo em getPublicAssetDetailByTicker
      const detailResult = await getPublicAssetDetailByTicker(` ${uniqueTicker.toLowerCase()} `);
      expect(detailResult).not.toBeNull();
      expect(detailResult?.ticker).toBe(uniqueTicker);
      expect(detailResult?.latestPrice).toBe('53.20');
      expect(detailResult?.previousClosePrice).toBe('51.80');
      expect(detailResult?.dailyVariation).toBe('2.70');
      expect(detailResult?.variationStatus).toBe('available');

      // 3. Testa histórico do ativo em getPublicAssetPriceHistory
      const historyResult = await getPublicAssetPriceHistory(`b3_${uniqueTicker}`, '1M');
      expect(historyResult.length).toBe(2);
      expect(Number(historyResult[1].price)).toBe(53.2);
    });

    it('deve retornar intervalos diferentes para 1M, 3M, 6M, 1Y e ALL com ordenação ASC', async () => {
      const { b3CotahistBatches, b3HistoricalQuotes } = await import('@/lib/db/schema/b3-market-data');
      const batchId = crypto.randomUUID();
      const testTicker = `HIST_${Date.now().toString().slice(-4)}`;

      await db.insert(b3CotahistBatches).values({
        id: batchId,
        fileName: `COTAHIST_PERIOD_TEST_${Date.now()}.ZIP`,
        fileType: 'annual',
        fileSize: 1024,
        sha256: crypto.randomBytes(32).toString('hex'),
        storagePath: '/mock/cotahist_period.zip',
        status: 'COMPLETED',
        totalLines: 5,
        acceptedRecords: 5,
      });

      const refDate = new Date('2026-08-26T00:00:00Z');
      const dates = [
        new Date(refDate.getTime() - 400 * 24 * 60 * 60 * 1000), // > 1 ano (~400 dias atrás) -> só em ALL
        new Date(refDate.getTime() - 200 * 24 * 60 * 60 * 1000), // > 6 meses (~200 dias atrás) -> em 1Y e ALL
        new Date(refDate.getTime() - 100 * 24 * 60 * 60 * 1000), // > 3 meses (~100 dias atrás) -> em 6M, 1Y e ALL
        new Date(refDate.getTime() - 40 * 24 * 60 * 60 * 1000),  // > 1 mês (~40 dias atrás) -> em 3M, 6M, 1Y e ALL
        new Date(refDate.getTime() - 5 * 24 * 60 * 60 * 1000),   // Recente (5 dias atrás) -> em 1M, 3M, 6M, 1Y e ALL
        refDate,                                                  // Último pregão -> em todos
      ];

      await db.insert(b3HistoricalQuotes).values(
        dates.map((d, idx) => ({
          id: crypto.randomUUID(),
          batchId,
          ticker: testTicker,
          tradeDate: d.toISOString().slice(0, 10),
          bdiCode: '02',
          marketType: 10,
          shortName: 'TEST HIST',
          specification: 'ON NM',
          currency: 'BRL',
          openPrice: '10.00',
          highPrice: '11.00',
          lowPrice: '9.50',
          averagePrice: '10.50',
          closePrice: (10 + idx).toFixed(2),
          quantity: '1000',
          financialVolume: '10000.00',
          tradeCount: 100,
          recordHash: crypto.randomBytes(32).toString('hex'),
        }))
      );

      const h1M = await getPublicAssetPriceHistory(testTicker, '1M');
      const h3M = await getPublicAssetPriceHistory(testTicker, '3M');
      const h6M = await getPublicAssetPriceHistory(testTicker, '6M');
      const h1Y = await getPublicAssetPriceHistory(testTicker, '1Y');
      const hALL = await getPublicAssetPriceHistory(testTicker, 'ALL');

      expect(h1M.length).toBe(2);
      expect(h3M.length).toBe(3);
      expect(h6M.length).toBe(4);
      expect(h1Y.length).toBe(5);
      expect(hALL.length).toBe(6);

      // Verifica ordenação cronológica ascendente
      for (let i = 1; i < hALL.length; i++) {
        expect(new Date(hALL[i].date).getTime()).toBeGreaterThan(new Date(hALL[i - 1].date).getTime());
      }
    });

    it('deve listar pelo menos 10 ativos reais para as categorias stock, fii e etf sem misturar categorias', async () => {
      const { b3CotahistBatches, b3HistoricalQuotes } = await import('@/lib/db/schema/b3-market-data');
      const batchId = crypto.randomUUID();
      const latestTradeDate = '2026-08-26';

      await db.insert(b3CotahistBatches).values({
        id: batchId,
        fileName: `COTAHIST_CATEGORIES_TEST_${Date.now()}.ZIP`,
        fileType: 'daily',
        fileSize: 1024,
        sha256: crypto.randomBytes(32).toString('hex'),
        storagePath: '/mock/cotahist_cats.zip',
        status: 'COMPLETED',
        totalLines: 30,
        acceptedRecords: 30,
      });

      const quoteRows: Array<typeof b3HistoricalQuotes.$inferInsert> = [];

      // 10 Ações (BDI 02)
      for (let i = 1; i <= 10; i++) {
        quoteRows.push({
          id: crypto.randomUUID(),
          batchId,
          ticker: `ACAO${i}`,
          tradeDate: latestTradeDate,
          bdiCode: '02',
          marketType: 10,
          shortName: `EMPRESA ACAO ${i}`,
          specification: 'ON NM',
          currency: 'BRL',
          openPrice: '20.00',
          highPrice: '21.00',
          lowPrice: '19.50',
          averagePrice: '20.50',
          closePrice: '20.00',
          quantity: '50000',
          financialVolume: '1000000.00',
          tradeCount: 1000 - i * 10,
          recordHash: crypto.randomBytes(32).toString('hex'),
        });
      }

      // 10 FIIs (BDI 12)
      for (let i = 1; i <= 10; i++) {
        quoteRows.push({
          id: crypto.randomUUID(),
          batchId,
          ticker: `FIIX${i}11`,
          tradeDate: latestTradeDate,
          bdiCode: '12',
          marketType: 10,
          shortName: `FII IMOB ${i}`,
          specification: 'CI',
          currency: 'BRL',
          openPrice: '100.00',
          highPrice: '101.00',
          lowPrice: '99.50',
          averagePrice: '100.50',
          closePrice: '100.00',
          quantity: '20000',
          financialVolume: '2000000.00',
          tradeCount: 500 - i * 10,
          recordHash: crypto.randomBytes(32).toString('hex'),
        });
      }

      // 10 ETFs (BDI 14)
      for (let i = 1; i <= 10; i++) {
        quoteRows.push({
          id: crypto.randomUUID(),
          batchId,
          ticker: `ETFX${i}11`,
          tradeDate: latestTradeDate,
          bdiCode: '14',
          marketType: 10,
          shortName: `ISHARES ETF ${i}`,
          specification: 'CI',
          currency: 'BRL',
          openPrice: '50.00',
          highPrice: '51.00',
          lowPrice: '49.50',
          averagePrice: '50.50',
          closePrice: '50.00',
          quantity: '30000',
          financialVolume: '1500000.00',
          tradeCount: 300 - i * 10,
          recordHash: crypto.randomBytes(32).toString('hex'),
        });
      }

      await db.insert(b3HistoricalQuotes).values(quoteRows);

      const stocks = await getPublicCatalogList({ category: 'stock', limit: 15 });
      const fiis = await getPublicCatalogList({ category: 'fii', limit: 15 });
      const etfs = await getPublicCatalogList({ category: 'etf', limit: 15 });

      expect(stocks.items.length).toBeGreaterThanOrEqual(10);
      expect(fiis.items.length).toBeGreaterThanOrEqual(10);
      expect(etfs.items.length).toBeGreaterThanOrEqual(10);

      // Garante que todos os itens de stock pertencem à categoria stock
      for (const item of stocks.items) {
        expect(item.assetType).toBe('stock');
      }

      // Garante que todos os itens de fii pertencem à categoria fii
      for (const item of fiis.items) {
        expect(item.assetType).toBe('fii');
      }

      // Garante que todos os itens de etf pertencem à categoria etf
      for (const item of etfs.items) {
        expect(item.assetType).toBe('etf');
      }
    });

    it('deve isolar estritamente ativos privados/customizados mesmo em caso de colisão de ticker com ativo público', async () => {
      const collisionTicker = `COLIS${Date.now().toString().slice(-4)}`;
      const publicAssetUuid = crypto.randomUUID();
      const privateAssetUuid = crypto.randomUUID();
      createdAssetIds.push(publicAssetUuid, privateAssetUuid);

      // 1. Cria ativo público e ativo privado de usuário com o mesmo ticker
      await db.insert(assets).values([
        {
          id: publicAssetUuid,
          ticker: collisionTicker,
          name: 'Ativo Público Oficial S.A.',
          assetType: 'stock',
          market: 'B3',
          currency: 'BRL',
          isCustom: false,
          userId: null,
        },
        {
          id: privateAssetUuid,
          ticker: collisionTicker,
          name: 'Ativo Privado do Usuário',
          assetType: 'custom',
          market: 'CUSTOM',
          currency: 'BRL',
          isCustom: true,
          userId: testUser1.id,
        },
      ]);

      // 2. Consulta listagem pública
      const catalogResult = await getPublicCatalogList({ query: collisionTicker });
      expect(catalogResult.items.length).toBe(1);
      expect(catalogResult.items[0].id).toBe(publicAssetUuid);
      expect(catalogResult.items[0].name).toBe('Ativo Público Oficial S.A.');
      expect(catalogResult.items[0].assetType).toBe('stock');

      // 3. Consulta detalhes públicos
      const detailResult = await getPublicAssetDetailByTicker(collisionTicker);
      expect(detailResult).not.toBeNull();
      expect(detailResult?.id).toBe(publicAssetUuid);
      expect(detailResult?.name).toBe('Ativo Público Oficial S.A.');

      // 4. Se existir apenas um ativo customizado sem ativo público, não deve vazar no catálogo
      const onlyCustomTicker = `ONLYCUST${Date.now().toString().slice(-4)}`;
      const onlyCustomUuid = crypto.randomUUID();
      createdAssetIds.push(onlyCustomUuid);

      await db.insert(assets).values({
        id: onlyCustomUuid,
        ticker: onlyCustomTicker,
        name: 'Ativo Puramente Customizado',
        assetType: 'custom',
        market: 'CUSTOM',
        currency: 'BRL',
        isCustom: true,
        userId: testUser2.id,
      });

      const catalogHiddenResult = await getPublicCatalogList({ query: onlyCustomTicker });
      expect(catalogHiddenResult.items.length).toBe(0);

      const detailHiddenResult = await getPublicAssetDetailByTicker(onlyCustomTicker);
      expect(detailHiddenResult).toBeNull();
    });

    it('deve selecionar deterministicamente a linha representativa mais recente e de maior liquidez para ticker com múltiplos pregões/BDIs', async () => {
      const { b3CotahistBatches, b3HistoricalQuotes } = await import('@/lib/db/schema/b3-market-data');
      const batchId = crypto.randomUUID();
      const multiBdiTicker = `MULTI${Date.now().toString().slice(-4)}`;

      await db.insert(b3CotahistBatches).values({
        id: batchId,
        fileName: `COTAHIST_MULTI_BDI_${Date.now()}.ZIP`,
        fileType: 'daily',
        fileSize: 1024,
        sha256: crypto.randomBytes(32).toString('hex'),
        storagePath: '/mock/cotahist_multi.zip',
        status: 'COMPLETED',
        totalLines: 3,
        acceptedRecords: 3,
      });

      // Linha 1: Pregão mais antigo (2026-08-25) com especificação antiga
      const row1Id = crypto.randomUUID();
      // Linha 2: Pregão mais recente (2026-08-26), BDI 02 (mercado a vista regular) e alta liquidez (15000 trades)
      const row2Id = crypto.randomUUID();
      // Linha 3: Pregão mais recente (2026-08-26), BDI 96 (mercado fracionário/recibo) e baixa liquidez (5 trades)
      const row3Id = crypto.randomUUID();

      await db.insert(b3HistoricalQuotes).values([
        {
          id: row1Id,
          batchId,
          ticker: multiBdiTicker,
          tradeDate: '2026-08-25',
          bdiCode: '02',
          marketType: 10,
          shortName: 'MULTI OLD NAME',
          specification: 'ON REC',
          currency: 'BRL',
          openPrice: '10.00',
          highPrice: '10.50',
          lowPrice: '9.80',
          averagePrice: '10.20',
          closePrice: '10.10',
          quantity: '1000',
          financialVolume: '10100.00',
          tradeCount: 20,
          recordHash: crypto.randomBytes(32).toString('hex'),
        },
        {
          id: row2Id,
          batchId,
          ticker: multiBdiTicker,
          tradeDate: '2026-08-26',
          bdiCode: '02',
          marketType: 10,
          shortName: 'MULTI REPRESENTATIVE CO',
          specification: 'ON NM',
          currency: 'BRL',
          openPrice: '30.00',
          highPrice: '31.50',
          lowPrice: '29.50',
          averagePrice: '30.50',
          closePrice: '31.00',
          quantity: '500000',
          financialVolume: '15500000.00',
          tradeCount: 15000,
          recordHash: crypto.randomBytes(32).toString('hex'),
        },
        {
          id: row3Id,
          batchId,
          ticker: multiBdiTicker,
          tradeDate: '2026-08-26',
          bdiCode: '96',
          marketType: 20,
          shortName: 'MULTI FRACIONARIO',
          specification: 'FRAC',
          currency: 'BRL',
          openPrice: '30.00',
          highPrice: '31.00',
          lowPrice: '30.00',
          averagePrice: '30.50',
          closePrice: '30.50',
          quantity: '50',
          financialVolume: '1525.00',
          tradeCount: 5,
          recordHash: crypto.randomBytes(32).toString('hex'),
        },
      ]);

      const result = await getPublicCatalogList({ query: multiBdiTicker });
      expect(result.items.length).toBe(1);
      const candidate = result.items[0];

      // Garante que o candidato é formado integralmente pela linha mais recente e de maior liquidez (Row 2)
      expect(candidate.ticker).toBe(multiBdiTicker);
      expect(candidate.name).toBe('MULTI REPRESENTATIVE CO - ON NM');
      expect(candidate.assetType).toBe('stock');
      expect(candidate.latestPrice).toBe('31.00');
    });

    it('deve realizar ordenação global e paginação sem truncamento ou duplicidade de itens', async () => {
      const { b3CotahistBatches, b3HistoricalQuotes } = await import('@/lib/db/schema/b3-market-data');
      const batchId = crypto.randomUUID();
      const prefix = `PAGE_${Date.now().toString().slice(-4)}_`;

      await db.insert(b3CotahistBatches).values({
        id: batchId,
        fileName: `COTAHIST_PAGING_${Date.now()}.ZIP`,
        fileType: 'daily',
        fileSize: 1024,
        sha256: crypto.randomBytes(32).toString('hex'),
        storagePath: '/mock/cotahist_paging.zip',
        status: 'COMPLETED',
        totalLines: 9,
        acceptedRecords: 9,
      });

      // Cria 9 ativos ordenáveis
      const itemsToInsert = [
        { ticker: `${prefix}1`, name: 'ALPHA CO', trades: 100, price: '10.00' },
        { ticker: `${prefix}2`, name: 'BRAVO CORP', trades: 900, price: '20.00' },
        { ticker: `${prefix}3`, name: 'CHARLIE INC', trades: 300, price: '30.00' },
        { ticker: `${prefix}4`, name: 'DELTA SA', trades: 700, price: '40.00' },
        { ticker: `${prefix}5`, name: 'ECHO LTD', trades: 500, price: '50.00' },
        { ticker: `${prefix}6`, name: 'FOXTROT CO', trades: 200, price: '60.00' },
        { ticker: `${prefix}7`, name: 'GOLF CORP', trades: 800, price: '70.00' },
        { ticker: `${prefix}8`, name: 'HOTEL SA', trades: 400, price: '80.00' },
        { ticker: `${prefix}9`, name: 'INDIA INC', trades: 600, price: '90.00' },
      ];

      await db.insert(b3HistoricalQuotes).values(
        itemsToInsert.map((item) => ({
          id: crypto.randomUUID(),
          batchId,
          ticker: item.ticker,
          tradeDate: '2026-08-26',
          bdiCode: '02',
          marketType: 10,
          shortName: item.name,
          specification: 'ON NM',
          currency: 'BRL',
          openPrice: item.price,
          highPrice: item.price,
          lowPrice: item.price,
          averagePrice: item.price,
          closePrice: item.price,
          quantity: '1000',
          financialVolume: '100000.00',
          tradeCount: item.trades,
          recordHash: crypto.randomBytes(32).toString('hex'),
        }))
      );

      // 1. Ordenação por nome ASC com paginação de 3 por página
      const page1 = await getPublicCatalogList({
        query: prefix,
        sortBy: 'name',
        sortOrder: 'asc',
        page: 1,
        limit: 3,
      });

      const page2 = await getPublicCatalogList({
        query: prefix,
        sortBy: 'name',
        sortOrder: 'asc',
        page: 2,
        limit: 3,
      });

      const page3 = await getPublicCatalogList({
        query: prefix,
        sortBy: 'name',
        sortOrder: 'asc',
        page: 3,
        limit: 3,
      });

      expect(page1.total).toBe(9);
      expect(page1.totalPages).toBe(3);
      expect(page1.items.map((i) => i.ticker)).toEqual([`${prefix}1`, `${prefix}2`, `${prefix}3`]); // ALPHA, BRAVO, CHARLIE
      expect(page2.items.map((i) => i.ticker)).toEqual([`${prefix}4`, `${prefix}5`, `${prefix}6`]); // DELTA, ECHO, FOXTROT
      expect(page3.items.map((i) => i.ticker)).toEqual([`${prefix}7`, `${prefix}8`, `${prefix}9`]); // GOLF, HOTEL, INDIA

      // Garante que não há sobreposição de itens entre as páginas
      const allPagedTickers = [
        ...page1.items.map((i) => i.ticker),
        ...page2.items.map((i) => i.ticker),
        ...page3.items.map((i) => i.ticker),
      ];
      expect(new Set(allPagedTickers).size).toBe(9);
    });
  });
});
