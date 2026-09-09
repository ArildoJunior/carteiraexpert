import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { assets } from '@/lib/db/schema/portfolio';
import { marketQuotes } from '@/lib/db/schema/market-data';
import { users } from '@/lib/db/schema/identity';
import { eq, inArray, sql } from 'drizzle-orm';
import FipsListingPage, { metadata as fipsListingMetadata } from '@/app/fips/page';
import FipDetailPage, { generateMetadata as generateFipMetadata } from '@/app/fips/[ticker]/page';
import FiiDetailPage, { generateMetadata as generateFiiMetadata } from '@/app/fiis/[ticker]/page';
import EtfDetailPage, { generateMetadata as generateEtfMetadata } from '@/app/etfs/[ticker]/page';
import {
  getPublicCatalogList,
  getPublicAssetDetailByTicker,
  getPublicSitemapAssets,
  resolveCanonicalAsset,
} from '@/modules/catalog/server/catalog.service';
import { getAssetDetailRoute } from '@/modules/catalog/domain/catalog-utils';

// Mock do usuário atual para evitar acesso fora do request scope em testes
vi.mock('@/modules/identity/server/current-user', () => ({
  getCurrentUser: vi.fn().mockResolvedValue(null),
}));

// Mock do serviço de portfólios para Server Components
vi.mock('@/modules/portfolio/server/portfolio.service', () => ({
  listPortfolios: vi.fn().mockResolvedValue([]),
}));

describe('Fase 2: Rotas Públicas Nativas de FIP e Compatibilidade Retroativa (HTTP 308)', () => {
  let testUserId: string;
  const createdAssetIds: string[] = [];
  const createdQuoteIds: string[] = [];

  beforeAll(async () => {
    testUserId = crypto.randomUUID();

    await db.insert(users).values({
      id: testUserId,
      email: `test-fip-${Date.now()}@carteiraexpert.test`,
      passwordHash: 'test_hash',
      name: 'FIP Test User',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Massa de testes com status pré-migração (ESUD11 como fii, PICE11 como etf, etc.)
    const testAssetsData = [
      // Candidatos a FIP (mantendo tipos pré-migração na tabela assets)
      { ticker: 'ESUD11', name: 'FIP IE II - CI', assetType: 'fii' },
      { ticker: 'ESUT11', name: 'FIP IE III - CI', assetType: 'fii' },
      { ticker: 'ESUU11', name: 'FIP IE I - CI', assetType: 'fii' },
      { ticker: 'PICE11', name: 'FIP PATR INF - CI  ER', assetType: 'etf' },
      { ticker: 'PICE12', name: 'FIP PATR INF - CI', assetType: 'etf' },
      { ticker: 'BDIV11', name: 'FIP BTGDV IE - CI', assetType: 'etf' },
      { ticker: 'XPIE11', name: 'FIP XP INFRA - CI  ERA', assetType: 'etf' },

      // FIIs legítimos
      { ticker: 'HGLG11', name: 'CSHG LOGÍSTICA - FII', assetType: 'fii' },
      { ticker: 'KNRI11', name: 'KINEA RENDA - FII', assetType: 'fii' },

      // ETFs legítimos
      { ticker: 'BOVA11', name: 'ISHARES IBOVESPA - ETF', assetType: 'etf' },
      { ticker: 'SMAL11', name: 'ISHARES SMALL CAP - ETF', assetType: 'etf' },

      // Ticker com substring FIP mas sem evidência de FIP (FIA IP.COM - cadastrado como ETF no banco)
      { ticker: 'FIPC11', name: 'FIA IP.COM - CI', assetType: 'etf' },

      // Ações e BDRs
      { ticker: 'PETR4', name: 'PETROBRAS - PN', assetType: 'stock' },
      { ticker: 'AAPL34', name: 'APPLE - DRN', assetType: 'bdr' },
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
          sql`UPDATE assets SET is_visible_catalog = true, is_tradeable = true, status = 'active', provenance = 'curated_seed' WHERE id = ${assetId}`
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
        const quoteId = crypto.randomUUID();
        createdQuoteIds.push(quoteId);
        await db.insert(marketQuotes).values({
          id: quoteId,
          assetId,
          price: '100.50000000',
          currency: 'BRL',
          quoteDate: new Date(),
          source: 'test_fixture',
          delayStatus: 'eod',
          createdBy: testUserId,
        });
      }
    }
  });

  afterAll(async () => {
    // Limpeza da base isolada de testes
    if (createdQuoteIds.length > 0) {
      await db.delete(marketQuotes).where(inArray(marketQuotes.id, createdQuoteIds));
    }
    if (createdAssetIds.length > 0) {
      await db.delete(assets).where(inArray(assets.id, createdAssetIds));
    }
    if (testUserId) {
      await db.delete(users).where(eq(users.id, testUserId));
    }
  });

  // ── 1. Listagem pública (/fips) ──────────────────────────────────────────────
  describe('Listagem pública (/fips)', () => {
    it('deve possuir metadata coerente para a categoria FIP', () => {
      expect(fipsListingMetadata.title).toContain('Fundos de Participações (FIPs)');
      expect(fipsListingMetadata.description).toContain('fundos de investimento em participações');
    });

    it('/fips retorna status 200 e renderiza o componente de listagem', async () => {
      const page = await FipsListingPage({
        searchParams: Promise.resolve({}),
      });
      expect(page).toBeDefined();
      expect(page.type).toBe('div');
    });

    it('/fips lista FIPs reconhecidos pelo classificador canônico', async () => {
      const result = await getPublicCatalogList({ category: 'fip', limit: 50 });
      expect(result.items.length).toBeGreaterThan(0);

      const tickers = result.items.map((i) => i.ticker);
      // FIPs candidatos reconhecidos por evidência no nome/especificação
      expect(tickers).toContain('ESUD11');
      expect(tickers).toContain('ESUT11');
      expect(tickers).toContain('ESUU11');
      expect(tickers).toContain('PICE11');
      expect(tickers).toContain('PICE12');
      expect(tickers).toContain('BDIV11');
      expect(tickers).toContain('XPIE11');

      // Todos os itens retornados devem ter assetType efetivo 'fip'
      expect(result.items.every((i) => i.assetType === 'fip')).toBe(true);
    });

    it('/fips não lista FIPC11 (FIA IP.COM sem evidência de FIP)', async () => {
      const result = await getPublicCatalogList({ category: 'fip', limit: 50 });
      const tickers = result.items.map((i) => i.ticker);
      expect(tickers).not.toContain('FIPC11');
    });

    it('/fips não lista ETFs comuns (ex: BOVA11, SMAL11)', async () => {
      const result = await getPublicCatalogList({ category: 'fip', limit: 50 });
      const tickers = result.items.map((i) => i.ticker);
      expect(tickers).not.toContain('BOVA11');
      expect(tickers).not.toContain('SMAL11');
    });

    it('/fips não lista FIIs comuns (ex: HGLG11, KNRI11)', async () => {
      const result = await getPublicCatalogList({ category: 'fip', limit: 50 });
      const tickers = result.items.map((i) => i.ticker);
      expect(tickers).not.toContain('HGLG11');
      expect(tickers).not.toContain('KNRI11');
    });

    it('/fips não lista ações ou BDRs', async () => {
      const result = await getPublicCatalogList({ category: 'fip', limit: 50 });
      const tickers = result.items.map((i) => i.ticker);
      expect(tickers).not.toContain('PETR4');
      expect(tickers).not.toContain('AAPL34');
    });

    it('/fips paginação preserva itens sem perda por LIMIT pré-validação', async () => {
      const page1 = await getPublicCatalogList({ category: 'fip', page: 1, limit: 3 });
      expect(page1.items.length).toBe(3);
      expect(page1.page).toBe(1);
      expect(page1.limit).toBe(3);
      expect(page1.total).toBeGreaterThanOrEqual(7);
      expect(page1.totalPages).toBeGreaterThanOrEqual(3);

      const page2 = await getPublicCatalogList({ category: 'fip', page: 2, limit: 3 });
      expect(page2.items.length).toBe(3);
      expect(page2.page).toBe(2);

      // Não há sobreposição entre página 1 e página 2
      const page1Tickers = new Set(page1.items.map((i) => i.ticker));
      for (const item of page2.items) {
        expect(page1Tickers.has(item.ticker)).toBe(false);
      }
    });
  });

  // ── 2. Detalhes públicos (/fips/[ticker]) ────────────────────────────────────
  describe('Detalhes públicos (/fips/[ticker])', () => {
    it('/fips/ESUD11 retorna 200 e metadata dinâmica coerente', async () => {
      const metadata = await generateFipMetadata({
        params: Promise.resolve({ ticker: 'ESUD11' }),
      });
      expect(metadata.title).toContain('ESUD11');
      expect(metadata.title).toContain('FIP IE II');

      const page = await FipDetailPage({
        params: Promise.resolve({ ticker: 'ESUD11' }),
      });
      expect(page).toBeDefined();
      expect(page.type).toBe('div');
    });

    it('/fips/PICE11 retorna 200 e metadata dinâmica coerente', async () => {
      const metadata = await generateFipMetadata({
        params: Promise.resolve({ ticker: 'PICE11' }),
      });
      expect(metadata.title).toContain('PICE11');
      expect(metadata.title).toContain('FIP PATR INF');

      const page = await FipDetailPage({
        params: Promise.resolve({ ticker: 'PICE11' }),
      });
      expect(page).toBeDefined();
      expect(page.type).toBe('div');
    });

    it('/fips/PICE12 retorna 200 (recibo/cota com especificação CI)', async () => {
      const page = await FipDetailPage({
        params: Promise.resolve({ ticker: 'PICE12' }),
      });
      expect(page).toBeDefined();
      expect(page.type).toBe('div');
    });

    it('/fips/FIPC11 lança notFound() pois FIPC11 não é FIP', async () => {
      await expect(
        FipDetailPage({
          params: Promise.resolve({ ticker: 'FIPC11' }),
        })
      ).rejects.toThrow();

      const metadata = await generateFipMetadata({
        params: Promise.resolve({ ticker: 'FIPC11' }),
      });
      expect(metadata.title).toBe('FIP Não Encontrado | CarteiraExpert');
    });

    it('/fips/BOVA11 lança notFound() e não apresenta ETF como FIP', async () => {
      await expect(
        FipDetailPage({
          params: Promise.resolve({ ticker: 'BOVA11' }),
        })
      ).rejects.toThrow();

      const detail = await getPublicAssetDetailByTicker('BOVA11', 'fip');
      expect(detail).toBeNull();
    });

    it('/fips/HGLG11 lança notFound() e não apresenta FII como FIP', async () => {
      await expect(
        FipDetailPage({
          params: Promise.resolve({ ticker: 'HGLG11' }),
        })
      ).rejects.toThrow();

      const detail = await getPublicAssetDetailByTicker('HGLG11', 'fip');
      expect(detail).toBeNull();
    });

    it('resolveCanonicalAsset identifica FIPs pré-migração independentemente do asset_type no banco', async () => {
      const esud = await resolveCanonicalAsset('ESUD11');
      expect(esud).toBeDefined();
      expect(esud?.canonicalCategory).toBe('fip');
      expect(esud?.asset.assetType).toBe('fip');

      const pice11 = await resolveCanonicalAsset('PICE11');
      expect(pice11).toBeDefined();
      expect(pice11?.canonicalCategory).toBe('fip');
      expect(pice11?.asset.assetType).toBe('fip');

      const pice12 = await resolveCanonicalAsset('PICE12');
      expect(pice12).toBeDefined();
      expect(pice12?.canonicalCategory).toBe('fip');
      expect(pice12?.asset.assetType).toBe('fip');
    });
  });

  // ── 3. Compatibilidade e Redirecionamentos HTTP 308 ──────────────────────────
  describe('Compatibilidade de rotas antigas via HTTP 308 (permanentRedirect)', () => {
    it('/fiis/ESUD11 redireciona com HTTP 308 para /fips/ESUD11', async () => {
      try {
        await FiiDetailPage({
          params: Promise.resolve({ ticker: 'ESUD11' }),
        });
        expect.fail('Deveria ter lançado erro de redirecionamento');
      } catch (err: any) {
        expect(err.digest).toContain('NEXT_REDIRECT');
        expect(err.digest).toContain('308');
        expect(err.digest).toContain('/fips/ESUD11');
      }

      try {
        await generateFiiMetadata({
          params: Promise.resolve({ ticker: 'ESUD11' }),
        });
        expect.fail('generateMetadata deveria ter lançado redirecionamento');
      } catch (err: any) {
        expect(err.digest).toContain('NEXT_REDIRECT');
        expect(err.digest).toContain('308');
        expect(err.digest).toContain('/fips/ESUD11');
      }
    });

    it('/etfs/PICE11 redireciona com HTTP 308 para /fips/PICE11', async () => {
      try {
        await EtfDetailPage({
          params: Promise.resolve({ ticker: 'PICE11' }),
        });
        expect.fail('Deveria ter lançado erro de redirecionamento');
      } catch (err: any) {
        expect(err.digest).toContain('NEXT_REDIRECT');
        expect(err.digest).toContain('308');
        expect(err.digest).toContain('/fips/PICE11');
      }

      try {
        await generateEtfMetadata({
          params: Promise.resolve({ ticker: 'PICE11' }),
        });
        expect.fail('generateMetadata deveria ter lançado redirecionamento');
      } catch (err: any) {
        expect(err.digest).toContain('NEXT_REDIRECT');
        expect(err.digest).toContain('308');
        expect(err.digest).toContain('/fips/PICE11');
      }
    });

    it('/fiis/HGLG11 continua atendendo normalmente como FII (sem redirecionar)', async () => {
      const page = await FiiDetailPage({
        params: Promise.resolve({ ticker: 'HGLG11' }),
      });
      expect(page).toBeDefined();
      expect(page.type).toBe('div');

      const metadata = await generateFiiMetadata({
        params: Promise.resolve({ ticker: 'HGLG11' }),
      });
      expect(metadata.title).toContain('HGLG11');
      expect(metadata.title).toContain('CSHG LOGÍSTICA');
    });

    it('/etfs/BOVA11 continua atendendo normalmente como ETF (sem redirecionar)', async () => {
      const page = await EtfDetailPage({
        params: Promise.resolve({ ticker: 'BOVA11' }),
      });
      expect(page).toBeDefined();
      expect(page.type).toBe('div');

      const metadata = await generateEtfMetadata({
        params: Promise.resolve({ ticker: 'BOVA11' }),
      });
      expect(metadata.title).toContain('BOVA11');
      expect(metadata.title).toContain('ISHARES IBOVESPA');
    });

    it('comportamento de rota para FIPC11: 404 em /fips e /fiis, 200 em /etfs (atende como ETF até Phase 3)', async () => {
      // 1. /fips/FIPC11 -> 404 (sem evidência de FIP)
      await expect(
        FipDetailPage({ params: Promise.resolve({ ticker: 'FIPC11' }) })
      ).rejects.toThrow();

      // 2. /fiis/FIPC11 -> 404 (não é FII no banco)
      await expect(
        FiiDetailPage({ params: Promise.resolve({ ticker: 'FIPC11' }) })
      ).rejects.toThrow();

      // 3. /etfs/FIPC11 -> 200 (atende como ETF sem redirecionamento)
      const page = await EtfDetailPage({
        params: Promise.resolve({ ticker: 'FIPC11' }),
      });
      expect(page).toBeDefined();
      expect(page.type).toBe('div');

      const metadata = await generateEtfMetadata({
        params: Promise.resolve({ ticker: 'FIPC11' }),
      });
      expect(metadata.title).toContain('FIPC11');
      expect(metadata.title).toContain('FIA IP.COM');
    });

    it('não existe loop entre as rotas legadas e a rota canônica /fips', async () => {
      // /fiis/ESUD11 -> redireciona para /fips/ESUD11
      try {
        await FiiDetailPage({ params: Promise.resolve({ ticker: 'ESUD11' }) });
      } catch (err: any) {
        expect(err.digest).toContain('/fips/ESUD11');
      }

      // /fips/ESUD11 -> renderiza status 200 (não redireciona de volta)
      const fipPage = await FipDetailPage({ params: Promise.resolve({ ticker: 'ESUD11' }) });
      expect(fipPage).toBeDefined();
      expect(fipPage.type).toBe('div');
    });
  });

  // ── 4. Isolamento estrito entre categorias ──────────────────────────────────
  describe('Isolamento estrito entre categorias', () => {
    it('FIPs não aparecem na listagem de /fiis', async () => {
      const fiisResult = await getPublicCatalogList({ category: 'fii', limit: 100 });
      const fiiTickers = fiisResult.items.map((i) => i.ticker);

      expect(fiiTickers).not.toContain('ESUD11');
      expect(fiiTickers).not.toContain('ESUT11');
      expect(fiiTickers).not.toContain('ESUU11');
      expect(fiiTickers).not.toContain('PICE11');
      expect(fiiTickers).not.toContain('XPIE11');
    });

    it('FIPs não aparecem na listagem de /etfs', async () => {
      const etfsResult = await getPublicCatalogList({ category: 'etf', limit: 100 });
      const etfTickers = etfsResult.items.map((i) => i.ticker);

      expect(etfTickers).not.toContain('PICE11');
      expect(etfTickers).not.toContain('PICE12');
      expect(etfTickers).not.toContain('BDIV11');
      expect(etfTickers).not.toContain('XPIE11');
      expect(etfTickers).not.toContain('ESUD11');
    });

    it('FIIs não aparecem na listagem de /fips', async () => {
      const fipsResult = await getPublicCatalogList({ category: 'fip', limit: 100 });
      const fipTickers = fipsResult.items.map((i) => i.ticker);

      expect(fipTickers).not.toContain('HGLG11');
      expect(fipTickers).not.toContain('KNRI11');
    });

    it('ETFs não aparecem na listagem de /fips', async () => {
      const fipsResult = await getPublicCatalogList({ category: 'fip', limit: 100 });
      const fipTickers = fipsResult.items.map((i) => i.ticker);

      expect(fipTickers).not.toContain('BOVA11');
      expect(fipTickers).not.toContain('SMAL11');
    });
  });

  // ── 5. Sitemap e URLs canônicas ─────────────────────────────────────────────
  describe('Sitemap e URLs canônicas', () => {
    it('getPublicSitemapAssets emite assetType = "fip" para ativos com evidência de FIP', async () => {
      const sitemapAssets = await getPublicSitemapAssets(1000);
      const esud = sitemapAssets.find((a) => a.ticker === 'ESUD11');
      const pice = sitemapAssets.find((a) => a.ticker === 'PICE11');

      expect(esud).toBeDefined();
      expect(esud?.assetType).toBe('fip');

      expect(pice).toBeDefined();
      expect(pice?.assetType).toBe('fip');

      // Verifica se getAssetDetailRoute gera /fips/TICKER diretamente
      if (esud) {
        expect(getAssetDetailRoute(esud.assetType, esud.ticker)).toBe('/fips/ESUD11');
      }
      if (pice) {
        expect(getAssetDetailRoute(pice.assetType, pice.ticker)).toBe('/fips/PICE11');
      }
    });

    it('getPublicSitemapAssets preserva FIIs e ETFs legítimos', async () => {
      const sitemapAssets = await getPublicSitemapAssets(1000);
      const hglg = sitemapAssets.find((a) => a.ticker === 'HGLG11');
      const bova = sitemapAssets.find((a) => a.ticker === 'BOVA11');

      expect(hglg).toBeDefined();
      expect(hglg?.assetType).toBe('fii');
      if (hglg) {
        expect(getAssetDetailRoute(hglg.assetType, hglg.ticker)).toBe('/fiis/HGLG11');
      }

      expect(bova).toBeDefined();
      expect(bova?.assetType).toBe('etf');
      if (bova) {
        expect(getAssetDetailRoute(bova.assetType, bova.ticker)).toBe('/etfs/BOVA11');
      }
    });
  });
});
