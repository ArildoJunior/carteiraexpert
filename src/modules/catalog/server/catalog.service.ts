import { db, type DbExecutor } from '@/lib/db';
import { assets } from '@/lib/db/schema/portfolio';
import { marketQuotes } from '@/lib/db/schema/market-data';
import { eq, and, isNull, ilike, or, desc, asc, inArray, count, gte } from 'drizzle-orm';
import { Decimal } from '@/lib/decimal';
import {
  catalogFilterSchema,
  tickerParamSchema,
  catalogHistoryPeriodSchema,
  type CatalogHistoryPeriod,
} from '../domain/catalog.schema';
import type {
  CatalogFilterParams,
  CatalogAssetCategory,
  PaginatedCatalogResult,
  PublicAssetSummary,
  PublicAssetDetail,
  PublicQuoteHistoryPoint,
} from '../domain/catalog.types';
import {
  calculateDailyVariation,
  deriveFreshnessStatus,
  getMarketTradingDay,
  B3_TIMEZONE,
} from '../domain/catalog-utils';

const TRADITIONAL_ASSET_TYPES = ['stock', 'fii', 'etf', 'bdr'];

function escapeLike(str: string): string {
  return str.replace(/[%_\\]/g, '\\$&');
}

/**
 * Consulta pública paginada de ativos do catálogo oficial.
 * Exclui rigorosamente ativos customizados ou vinculados a usuários (isCustom = false AND userId IS NULL).
 */
export async function getPublicCatalogList(
  rawParams: CatalogFilterParams = {},
  executor: DbExecutor = db
): Promise<PaginatedCatalogResult> {
  const params = catalogFilterSchema.parse(rawParams);

  // 1. Condições de segurança e filtro
  const conditions = [
    eq(assets.isCustom, false),
    isNull(assets.userId),
  ];

  if (params.category) {
    conditions.push(eq(assets.assetType, params.category));
  } else {
    conditions.push(inArray(assets.assetType, TRADITIONAL_ASSET_TYPES));
  }

  const trimmedQuery = params.query?.trim();
  if (trimmedQuery && trimmedQuery.length > 0) {
    const escaped = escapeLike(trimmedQuery);
    conditions.push(
      or(
        ilike(assets.ticker, `${escaped}%`),
        ilike(assets.name, `%${escaped}%`)
      )!
    );
  }

  const whereClause = and(...conditions);

  // 2. Contagem total
  const [countRes] = await executor
    .select({ total: count() })
    .from(assets)
    .where(whereClause);

  const total = Number(countRes?.total ?? 0);
  const totalPages = Math.max(1, Math.ceil(total / params.limit));

  if (total === 0) {
    return {
      items: [],
      total: 0,
      page: params.page,
      limit: params.limit,
      totalPages: 1,
    };
  }

  // 3. Busca de ativos paginados
  // Ordenação básica no banco
  const sortColumn = params.sortBy === 'name' ? assets.name : assets.ticker;
  const sortDirection = params.sortOrder === 'desc' ? desc(sortColumn) : asc(sortColumn);

  const assetRows = await executor
    .select()
    .from(assets)
    .where(whereClause)
    .orderBy(sortDirection)
    .limit(params.limit)
    .offset((params.page - 1) * params.limit);

  const assetIds = assetRows.map((a) => a.id);

  // 4. Busca as cotações recentes para os ativos paginados
  const quotesMap = new Map<string, Array<{ price: Decimal; currency: string; quoteDate: Date; delayStatus: any }>>();

  if (assetIds.length > 0) {
    const quotesRows = await executor
      .select()
      .from(marketQuotes)
      .where(inArray(marketQuotes.assetId, assetIds))
      .orderBy(marketQuotes.assetId, desc(marketQuotes.quoteDate), asc(marketQuotes.id));

    for (const q of quotesRows) {
      const list = quotesMap.get(q.assetId) ?? [];
      list.push({
        price: new Decimal(q.price),
        currency: q.currency,
        quoteDate: new Date(q.quoteDate),
        delayStatus: q.delayStatus as any,
      });
      quotesMap.set(q.assetId, list);
    }
  }

  // 5. Monta os resumos de cada ativo
  const items: PublicAssetSummary[] = assetRows.map((asset) => {
    const quotes = quotesMap.get(asset.id) ?? [];
    const latestQuote = quotes[0] ?? null;
    const variationResult = calculateDailyVariation(quotes, B3_TIMEZONE);
    const freshnessStatus = deriveFreshnessStatus(latestQuote, new Date(), B3_TIMEZONE);

    return {
      id: asset.id,
      ticker: asset.ticker,
      name: asset.name,
      assetType: asset.assetType,
      market: asset.market,
      currency: asset.currency,
      latestPrice: latestQuote ? latestQuote.price.toFixed(2) : null,
      quoteDate: latestQuote ? latestQuote.quoteDate.toISOString() : null,
      delayStatus: latestQuote ? latestQuote.delayStatus : null,
      freshnessStatus,
      dailyVariation: variationResult.dailyVariation,
      variationStatus: variationResult.variationStatus,
    };
  });

  // 6. Ordenação em memória caso seja por preço ou variação
  if (params.sortBy === 'price') {
    items.sort((a, b) => {
      const pA = a.latestPrice ? Number(a.latestPrice) : -Infinity;
      const pB = b.latestPrice ? Number(b.latestPrice) : -Infinity;
      return params.sortOrder === 'desc' ? pB - pA : pA - pB;
    });
  } else if (params.sortBy === 'variation') {
    items.sort((a, b) => {
      const vA = a.dailyVariation ? Number(a.dailyVariation) : -Infinity;
      const vB = b.dailyVariation ? Number(b.dailyVariation) : -Infinity;
      return params.sortOrder === 'desc' ? vB - vA : vA - vB;
    });
  }

  return {
    items,
    total,
    page: params.page,
    limit: params.limit,
    totalPages,
  };
}

/**
 * Consulta os detalhes públicos de um ativo pelo ticker.
 * Exclui ativos customizados e valida compatibilidade de categoria se fornecida.
 */
export async function getPublicAssetDetailByTicker(
  rawTicker: string,
  category?: CatalogAssetCategory,
  executor: DbExecutor = db
): Promise<PublicAssetDetail | null> {
  const ticker = tickerParamSchema.parse(rawTicker);

  const conditions = [
    eq(assets.isCustom, false),
    isNull(assets.userId),
    eq(assets.ticker, ticker),
  ];

  if (category) {
    conditions.push(eq(assets.assetType, category));
  } else {
    conditions.push(inArray(assets.assetType, TRADITIONAL_ASSET_TYPES));
  }

  const [asset] = await executor
    .select()
    .from(assets)
    .where(and(...conditions))
    .limit(1);

  if (!asset) {
    return null;
  }

  // Busca cotações do ativo ordenadas por data decrescente
  const quotesRows = await executor
    .select()
    .from(marketQuotes)
    .where(eq(marketQuotes.assetId, asset.id))
    .orderBy(desc(marketQuotes.quoteDate), asc(marketQuotes.id))
    .limit(30);

  const quotes = quotesRows.map((q) => ({
    price: new Decimal(q.price),
    currency: q.currency,
    quoteDate: new Date(q.quoteDate),
    delayStatus: q.delayStatus as any,
  }));

  const latestQuote = quotes[0] ?? null;
  const variationResult = calculateDailyVariation(quotes, B3_TIMEZONE);
  const freshnessStatus = deriveFreshnessStatus(latestQuote, new Date(), B3_TIMEZONE);

  return {
    id: asset.id,
    ticker: asset.ticker,
    name: asset.name,
    assetType: asset.assetType,
    market: asset.market,
    currency: asset.currency,
    latestPrice: latestQuote ? latestQuote.price.toFixed(2) : null,
    quoteDate: latestQuote ? latestQuote.quoteDate.toISOString() : null,
    delayStatus: latestQuote ? latestQuote.delayStatus : null,
    freshnessStatus,
    dailyVariation: variationResult.dailyVariation,
    variationStatus: variationResult.variationStatus,
    previousClosePrice: variationResult.previousClosePrice,
    previousCloseDate: variationResult.previousCloseDate,
  };
}

/**
 * Consulta a série histórica de cotações para exibição em gráficos.
 */
export async function getPublicAssetPriceHistory(
  assetId: string,
  rawPeriod: CatalogHistoryPeriod = '1M',
  executor: DbExecutor = db
): Promise<PublicQuoteHistoryPoint[]> {
  const period = catalogHistoryPeriodSchema.parse(rawPeriod);

  // 1. Valida que o ativo é público
  const [asset] = await executor
    .select({ id: assets.id })
    .from(assets)
    .where(
      and(
        eq(assets.id, assetId),
        eq(assets.isCustom, false),
        isNull(assets.userId)
      )
    )
    .limit(1);

  if (!asset) {
    return [];
  }

  // 2. Calcula data inicial conforme período
  let startDate: Date | null = null;
  const now = new Date();

  switch (period) {
    case '1M':
      startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      break;
    case '3M':
      startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
      break;
    case '6M':
      startDate = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
      break;
    case '1Y':
      startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
      break;
    case 'ALL':
      startDate = null;
      break;
  }

  const conditions = [eq(marketQuotes.assetId, asset.id)];
  if (startDate) {
    conditions.push(gte(marketQuotes.quoteDate, startDate));
  }

  const rows = await executor
    .select({
      price: marketQuotes.price,
      quoteDate: marketQuotes.quoteDate,
    })
    .from(marketQuotes)
    .where(and(...conditions))
    .orderBy(asc(marketQuotes.quoteDate), asc(marketQuotes.id));

  return rows.map((r) => {
    const qDate = new Date(r.quoteDate);
    return {
      date: getMarketTradingDay(qDate, B3_TIMEZONE),
      price: new Decimal(r.price).toFixed(2),
      quoteDate: qDate.toISOString(),
    };
  });
}

/**
 * Consulta os ativos públicos elegíveis para o sitemap com limite seguro de 1.000 URLs.
 */
export async function getPublicSitemapAssets(
  limit = 1000,
  executor: DbExecutor = db
): Promise<Array<{ ticker: string; assetType: string; updatedAt: Date }>> {
  try {
    // 1. Contagem total de ativos públicos
    const [countRes] = await executor
      .select({ total: count() })
      .from(assets)
      .where(
        and(
          eq(assets.isCustom, false),
          isNull(assets.userId),
          inArray(assets.assetType, TRADITIONAL_ASSET_TYPES)
        )
      );

    const total = Number(countRes?.total ?? 0);

    if (total > limit) {
      console.warn(
        `[Sitemap] O catálogo público possui ${total} ativos, excedendo o limite de ${limit} URLs do MVP. Planejar segmentação em Sitemap Index.`
      );
    }

    const rows = await executor
      .select({
        ticker: assets.ticker,
        assetType: assets.assetType,
        updatedAt: assets.updatedAt,
      })
      .from(assets)
      .where(
        and(
          eq(assets.isCustom, false),
          isNull(assets.userId),
          inArray(assets.assetType, TRADITIONAL_ASSET_TYPES)
        )
      )
      .orderBy(asc(assets.ticker))
      .limit(limit);

    return rows.map((r) => ({
      ticker: r.ticker,
      assetType: r.assetType,
      updatedAt: new Date(r.updatedAt),
    }));
  } catch (err) {
    console.error('[Sitemap] Falha ao consultar ativos para o sitemap:', err);
    return [];
  }
}
