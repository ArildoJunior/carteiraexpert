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
  });
});
