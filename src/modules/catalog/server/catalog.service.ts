import { db, type DbExecutor } from '@/lib/db';
import { assets } from '@/lib/db/schema/portfolio';
import { marketQuotes } from '@/lib/db/schema/market-data';
import { b3HistoricalQuotes } from '@/lib/db/schema/b3-market-data';
import { eq, and, isNull, ilike, or, desc, asc, inArray, count, gte, sql } from 'drizzle-orm';
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
  DelayStatus,
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

function inferAssetTypeFromCotahist(
  ticker: string,
  bdiCode?: string | null,
  specification?: string | null,
  shortName?: string | null
): CatalogAssetCategory {
  const normTicker = ticker.toUpperCase();
  const specUpper = (specification || '').toUpperCase();
  const nameUpper = (shortName || '').toUpperCase();

  if (
    bdiCode === '12' ||
    (normTicker.endsWith('11') && (specUpper.includes('FII') || nameUpper.includes('FII') || nameUpper.includes('IMOB')))
  ) {
    return 'fii';
  }
  if (
    bdiCode === '14' ||
    specUpper.includes('ETF') ||
    nameUpper.includes('ETF') ||
    nameUpper.includes('ISHARES') ||
    nameUpper.includes('INDEX')
  ) {
    return 'etf';
  }
  if (
    bdiCode === '34' ||
    bdiCode === '36' ||
    bdiCode === '38' ||
    normTicker.endsWith('34') ||
    normTicker.endsWith('35') ||
    normTicker.endsWith('39') ||
    specUpper.includes('BDR') ||
    specUpper.includes('DRN') ||
    nameUpper.includes('BDR')
  ) {
    return 'bdr';
  }
  return 'stock';
}

/**
 * Consulta pública paginada de ativos do catálogo oficial.
 * Exclui rigorosamente ativos customizados ou vinculados a usuários (isCustom = false AND userId IS NULL).
 * Pesquisa em `assets` e em `b3_historical_quotes` para garantir que todos os tickers oficiais da B3 sejam exibidos e ordenados por liquidez/negociação.
 */
export async function getPublicCatalogList(
  rawParams: CatalogFilterParams = {},
  executor: DbExecutor = db
): Promise<PaginatedCatalogResult> {
  const params = catalogFilterSchema.parse(rawParams);
  const trimmedQuery = params.query?.trim();

  // 1. Busca todos os ativos cadastrados na tabela assets compatíveis com os filtros e governança canônica estrita
  const assetConditions = [
    eq(assets.isCustom, false),
    isNull(assets.userId),
    sql`assets.is_visible_catalog = true`,
    sql`assets.is_tradeable = true`,
    sql`assets.status = 'active'`,
  ];

  if (params.category) {
    assetConditions.push(eq(assets.assetType, params.category));
  } else {
    assetConditions.push(inArray(assets.assetType, TRADITIONAL_ASSET_TYPES));
  }

  if (trimmedQuery && trimmedQuery.length > 0) {
    const escaped = escapeLike(trimmedQuery);
    assetConditions.push(
      or(
        ilike(assets.ticker, `${escaped}%`),
        ilike(assets.name, `%${escaped}%`)
      )!
    );
  }

  const assetRows = await executor
    .select()
    .from(assets)
    .where(and(...assetConditions))
    .orderBy(asc(assets.ticker));

  // Mapa unificado indexado por TICKER em caixa alta
  const candidateMap = new Map<string, {
    id: string;
    ticker: string;
    name: string;
    assetType: CatalogAssetCategory;
    market: string;
    currency: string;
    tradeCount: number;
    financialVolume: number;
    isRegistered: boolean;
  }>();

  for (const a of assetRows) {
    const t = a.ticker.toUpperCase();
    candidateMap.set(t, {
      id: a.id,
      ticker: t,
      name: a.name,
      assetType: a.assetType as CatalogAssetCategory,
      market: a.market,
      currency: a.currency,
      tradeCount: 0,
      financialVolume: 0,
      isRegistered: true,
    });
  }

  // 2. Busca ativos oficiais em b3_historical_quotes compatíveis com a categoria e busca
  let bdiFilterSql = sql`${b3HistoricalQuotes.bdiCode} IN ('02', '12', '14', '34', '36', '38') AND ${b3HistoricalQuotes.ticker} NOT LIKE '%F'`;
  if (params.category === 'stock') {
    bdiFilterSql = sql`${b3HistoricalQuotes.bdiCode} = '02' AND ${b3HistoricalQuotes.ticker} NOT LIKE '%F' AND ${b3HistoricalQuotes.ticker} NOT LIKE '%34' AND ${b3HistoricalQuotes.ticker} NOT LIKE '%35' AND ${b3HistoricalQuotes.ticker} NOT LIKE '%39'`;
  } else if (params.category === 'fii') {
    bdiFilterSql = sql`${b3HistoricalQuotes.bdiCode} = '12' AND ${b3HistoricalQuotes.ticker} NOT LIKE '%F'`;
  } else if (params.category === 'etf') {
    bdiFilterSql = sql`${b3HistoricalQuotes.bdiCode} = '14' AND ${b3HistoricalQuotes.ticker} NOT LIKE '%F'`;
  } else if (params.category === 'bdr') {
    bdiFilterSql = sql`${b3HistoricalQuotes.bdiCode} IN ('34', '36', '38') AND ${b3HistoricalQuotes.ticker} NOT LIKE '%F'`;
  }

  const b3Conditions = [bdiFilterSql];
  if (trimmedQuery && trimmedQuery.length > 0) {
    const escaped = escapeLike(trimmedQuery);
    b3Conditions.push(
      or(
        ilike(b3HistoricalQuotes.ticker, `${escaped}%`),
        ilike(b3HistoricalQuotes.shortName, `%${escaped}%`)
      )!
    );
  } else {
    b3Conditions.push(
      sql`${b3HistoricalQuotes.tradeDate} = (SELECT MAX(trade_date) FROM b3_historical_quotes WHERE ${bdiFilterSql})`
    );
  }

  // Cada candidato é formado por uma ÚNICA linha física representativa,
  // selecionada deterministicamente pelo último pregão e critérios de desempate (liquidez e ID)
  const b3Candidates = await executor
    .selectDistinctOn([b3HistoricalQuotes.ticker], {
      id: b3HistoricalQuotes.id,
      ticker: b3HistoricalQuotes.ticker,
      shortName: b3HistoricalQuotes.shortName,
      specification: b3HistoricalQuotes.specification,
      currency: b3HistoricalQuotes.currency,
      bdiCode: b3HistoricalQuotes.bdiCode,
      tradeCount: b3HistoricalQuotes.tradeCount,
      financialVolume: b3HistoricalQuotes.financialVolume,
      closePrice: b3HistoricalQuotes.closePrice,
      tradeDate: b3HistoricalQuotes.tradeDate,
    })
    .from(b3HistoricalQuotes)
    .where(and(...b3Conditions))
    .orderBy(
      b3HistoricalQuotes.ticker,
      desc(b3HistoricalQuotes.tradeDate),
      desc(b3HistoricalQuotes.tradeCount),
      desc(b3HistoricalQuotes.financialVolume),
      asc(b3HistoricalQuotes.id)
    );

  for (const match of b3Candidates) {
    const matchTicker = match.ticker.toUpperCase();
    const inferredType = inferAssetTypeFromCotahist(
      matchTicker,
      match.bdiCode,
      match.specification,
      match.shortName
    );

    if (!params.category || params.category === inferredType) {
      const existing = candidateMap.get(matchTicker);
      const tc = Number(match.tradeCount) || 0;
      const fv = Number(match.financialVolume) || 0;

      if (existing) {
        existing.tradeCount = tc;
        existing.financialVolume = fv;
      } else {
        candidateMap.set(matchTicker, {
          id: `b3_${matchTicker}`,
          ticker: matchTicker,
          name: `${match.shortName}${match.specification ? ' - ' + match.specification : ''}`.trim() || matchTicker,
          assetType: inferredType,
          market: 'B3',
          currency: match.currency || 'BRL',
          tradeCount: tc,
          financialVolume: fv,
          isRegistered: false,
        });
      }
    }
  }

  // 3. Converte para array unificado completo e aplica ordenação determinística sobre todo o conjunto
  const allCandidates = Array.from(candidateMap.values());

  if (params.sortBy === 'name') {
    allCandidates.sort((a, b) =>
      params.sortOrder === 'desc' ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name)
    );
  } else if (params.sortBy === 'ticker' || !params.sortBy) {
    if (trimmedQuery && trimmedQuery.length > 0) {
      const upperQ = trimmedQuery.toUpperCase();
      allCandidates.sort((a, b) => {
        const aExact = a.ticker === upperQ ? 1 : 0;
        const bExact = b.ticker === upperQ ? 1 : 0;
        if (aExact !== bExact) return bExact - aExact;

        const aStarts = a.ticker.startsWith(upperQ) ? 1 : 0;
        const bStarts = b.ticker.startsWith(upperQ) ? 1 : 0;
        if (aStarts !== bStarts) return bStarts - aStarts;

        return params.sortOrder === 'desc'
          ? b.ticker.localeCompare(a.ticker)
          : a.ticker.localeCompare(b.ticker);
      });
    } else {
      allCandidates.sort((a, b) => {
        // Ativos curados/registrados na tabela assets são priorizados na navegação padrão
        if (a.isRegistered !== b.isRegistered) {
          return a.isRegistered ? -1 : 1;
        }
        return params.sortOrder === 'desc'
          ? b.ticker.localeCompare(a.ticker)
          : a.ticker.localeCompare(b.ticker);
      });
    }
  }

  // 4. Paginação exata sobre o conjunto completo ordenado
  const total = allCandidates.length;
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

  const startIndex = (params.page - 1) * params.limit;
  const pagedAssets = allCandidates.slice(startIndex, startIndex + params.limit);

  // 5. Busca cotações recentes para os tickers paginados
  // a) De market_quotes
  const assetIdList = pagedAssets.filter((a) => !a.id.startsWith('b3_')).map((a) => a.id);
  const quotesMap = new Map<string, Array<{ price: Decimal; currency: string; quoteDate: Date | string; delayStatus: DelayStatus }>>();

  if (assetIdList.length > 0) {
    const quotesRows = await executor
      .select()
      .from(marketQuotes)
      .where(inArray(marketQuotes.assetId, assetIdList))
      .orderBy(marketQuotes.assetId, desc(marketQuotes.quoteDate), asc(marketQuotes.id));

    for (const q of quotesRows) {
      const list = quotesMap.get(q.assetId) ?? [];
      list.push({
        price: new Decimal(q.price),
        currency: q.currency,
        quoteDate: new Date(q.quoteDate),
        delayStatus: q.delayStatus as DelayStatus,
      });
      quotesMap.set(q.assetId, list);
    }
  }

  // b) De b3_historical_quotes para os que faltam
  const tickersNeedingB3 = pagedAssets
    .filter((a) => !quotesMap.has(a.id) || quotesMap.get(a.id)!.length === 0)
    .map((a) => a.ticker);

  if (tickersNeedingB3.length > 0) {
    const b3Rows = await executor
      .select()
      .from(b3HistoricalQuotes)
      .where(inArray(b3HistoricalQuotes.ticker, tickersNeedingB3))
      .orderBy(
        b3HistoricalQuotes.ticker,
        desc(b3HistoricalQuotes.tradeDate),
        desc(b3HistoricalQuotes.tradeCount),
        desc(b3HistoricalQuotes.financialVolume)
      );

    const b3ByTicker = new Map<string, Array<typeof b3HistoricalQuotes.$inferSelect>>();
    const b3SeenDates = new Map<string, Set<string>>();

    for (const row of b3Rows) {
      const t = row.ticker;
      const list = b3ByTicker.get(t) ?? [];
      const seen = b3SeenDates.get(t) ?? new Set<string>();
      const dStr = row.tradeDate;

      if (!seen.has(dStr) && list.length < 5) {
        seen.add(dStr);
        list.push(row);
        b3ByTicker.set(t, list);
        b3SeenDates.set(t, seen);
      }
    }

    for (const asset of pagedAssets) {
      if (!quotesMap.has(asset.id) || quotesMap.get(asset.id)!.length === 0) {
        const rowsForTicker = b3ByTicker.get(asset.ticker) ?? [];
        if (rowsForTicker.length > 0) {
          quotesMap.set(
            asset.id,
            rowsForTicker.map((r) => ({
              price: new Decimal(r.closePrice),
              currency: r.currency || 'BRL',
              quoteDate: r.tradeDate,
              delayStatus: 'eod' as DelayStatus,
            }))
          );
        }
      }
    }
  }

  // 6. Monta os resumos de cada ativo
  const items: PublicAssetSummary[] = pagedAssets.map((asset) => {
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
      quoteDate: latestQuote
        ? typeof latestQuote.quoteDate === 'string'
          ? latestQuote.quoteDate
          : latestQuote.quoteDate.toISOString()
        : null,
      delayStatus: latestQuote ? latestQuote.delayStatus : null,
      freshnessStatus,
      dailyVariation: variationResult.dailyVariation,
      variationStatus: variationResult.variationStatus,
    };
  });

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
 * Suporta busca na tabela `assets` e na tabela `b3_historical_quotes`.
 */
export async function getPublicAssetDetailByTicker(
  rawTicker: string,
  category?: CatalogAssetCategory,
  executor: DbExecutor = db
): Promise<PublicAssetDetail | null> {
  const parsedTicker = tickerParamSchema.safeParse(rawTicker);
  if (!parsedTicker.success) {
    return null;
  }
  const normalizedTicker = parsedTicker.data;

  const conditions = [
    eq(assets.isCustom, false),
    isNull(assets.userId),
    eq(assets.ticker, normalizedTicker),
    sql`assets.is_visible_catalog = true`,
    sql`assets.is_tradeable = true`,
    sql`assets.status = 'active'`,
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

  let assetId = asset?.id ?? `b3_${normalizedTicker}`;
  let assetName = asset?.name ?? normalizedTicker;
  let assetType: CatalogAssetCategory = (asset?.assetType as CatalogAssetCategory) ?? 'stock';
  let assetMarket = asset?.market ?? 'B3';
  let assetCurrency = asset?.currency ?? 'BRL';

  const quotes: Array<{ price: Decimal; currency: string; quoteDate: Date | string; delayStatus: any }> = [];

  if (asset) {
    // Busca cotações do ativo em market_quotes
    const quotesRows = await executor
      .select()
      .from(marketQuotes)
      .where(eq(marketQuotes.assetId, asset.id))
      .orderBy(desc(marketQuotes.quoteDate), asc(marketQuotes.id))
      .limit(30);

    for (const q of quotesRows) {
      quotes.push({
        price: new Decimal(q.price),
        currency: q.currency,
        quoteDate: new Date(q.quoteDate),
        delayStatus: q.delayStatus as any,
      });
    }
  }

  // Fallback ou busca direta em b3_historical_quotes
  if (quotes.length === 0) {
    const b3Rows = await executor
      .select()
      .from(b3HistoricalQuotes)
      .where(eq(b3HistoricalQuotes.ticker, normalizedTicker))
      .orderBy(
        desc(b3HistoricalQuotes.tradeDate),
        desc(b3HistoricalQuotes.tradeCount),
        desc(b3HistoricalQuotes.financialVolume)
      )
      .limit(60);

    if (b3Rows.length > 0) {
      const firstRow = b3Rows[0];
      if (!asset) {
        assetName =
          `${firstRow.shortName}${firstRow.specification ? ' - ' + firstRow.specification : ''}`.trim() ||
          normalizedTicker;
        assetCurrency = firstRow.currency || 'BRL';
        assetType = inferAssetTypeFromCotahist(
          normalizedTicker,
          firstRow.bdiCode,
          firstRow.specification,
          firstRow.shortName
        );
      }

      const seenDates = new Set<string>();
      for (const r of b3Rows) {
        const dStr = r.tradeDate;
        if (!seenDates.has(dStr)) {
          seenDates.add(dStr);
          quotes.push({
            price: new Decimal(r.closePrice),
            currency: r.currency || 'BRL',
            quoteDate: r.tradeDate,
            delayStatus: 'end_of_day' as any,
          });
        }
      }
    }
  }

  // Se não foi encontrado em assets nem em b3_historical_quotes, retorna null (ativo inexistente)
  if (!asset && quotes.length === 0) {
    return null;
  }

  const latestQuote = quotes[0] ?? null;
  const variationResult = calculateDailyVariation(quotes, B3_TIMEZONE);
  const freshnessStatus = deriveFreshnessStatus(latestQuote, new Date(), B3_TIMEZONE);

  return {
    id: assetId,
    ticker: normalizedTicker,
    name: assetName,
    assetType,
    market: assetMarket,
    currency: assetCurrency,
    latestPrice: latestQuote ? latestQuote.price.toFixed(2) : null,
    quoteDate: latestQuote
      ? typeof latestQuote.quoteDate === 'string'
        ? latestQuote.quoteDate
        : latestQuote.quoteDate.toISOString()
      : null,
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
 * Suporta resolução a partir de asset_id ou ticker B3 e períodos 1M, 3M, 6M, 1Y e ALL.
 */
export async function getPublicAssetPriceHistory(
  assetId: string,
  rawPeriod: CatalogHistoryPeriod = '1M',
  executor: DbExecutor = db
): Promise<PublicQuoteHistoryPoint[]> {
  const period = catalogHistoryPeriodSchema.parse(rawPeriod);

  let ticker: string | null = null;
  let resolvedAssetUuid: string | null = null;

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(assetId);

  if (assetId.startsWith('b3_')) {
    ticker = assetId.replace(/^b3_/, '').toUpperCase();
  } else if (isUuid) {
    resolvedAssetUuid = assetId;
    const [asset] = await executor
      .select({ id: assets.id, ticker: assets.ticker })
      .from(assets)
      .where(
        and(
          eq(assets.id, assetId),
          eq(assets.isCustom, false),
          isNull(assets.userId)
        )
      )
      .limit(1);

    if (asset) {
      ticker = asset.ticker.toUpperCase();
    }
  } else {
    // Busca por ticker em assets
    const [asset] = await executor
      .select({ id: assets.id, ticker: assets.ticker })
      .from(assets)
      .where(
        and(
          eq(assets.ticker, assetId.toUpperCase()),
          eq(assets.isCustom, false),
          isNull(assets.userId)
        )
      )
      .limit(1);

    if (asset) {
      ticker = asset.ticker.toUpperCase();
      resolvedAssetUuid = asset.id;
    } else {
      ticker = assetId.toUpperCase();
    }
  }

  // 2. Consulta em b3_historical_quotes pelo ticker
  if (ticker) {
    // Encontra o último pregão registrado para o ticker para calcular os intervalos relativos ao histórico
    const [latestTrade] = await executor
      .select({
        maxDate: sql<string>`MAX(${b3HistoricalQuotes.tradeDate})::text`,
      })
      .from(b3HistoricalQuotes)
      .where(eq(b3HistoricalQuotes.ticker, ticker));

    let startDateStr: string | null = null;
    if (period !== 'ALL' && latestTrade?.maxDate) {
      const parts = latestTrade.maxDate.split('-').map(Number);
      if (parts.length === 3) {
        const refDate = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
        const daysMap = { '1M': 30, '3M': 90, '6M': 180, '1Y': 365 };
        refDate.setUTCDate(refDate.getUTCDate() - daysMap[period]);
        const y = refDate.getUTCFullYear();
        const m = String(refDate.getUTCMonth() + 1).padStart(2, '0');
        const d = String(refDate.getUTCDate()).padStart(2, '0');
        startDateStr = `${y}-${m}-${d}`;
      }
    }

    const b3Conditions = [eq(b3HistoricalQuotes.ticker, ticker)];
    if (startDateStr) {
      b3Conditions.push(gte(b3HistoricalQuotes.tradeDate, startDateStr));
    }

    // Usamos GROUP BY trade_date para evitar pontos duplicados caso haja sobreposição entre arquivo diário e anual
    const b3Rows = await executor
      .select({
        tradeDate: b3HistoricalQuotes.tradeDate,
        closePrice: sql<string>`(array_agg(${b3HistoricalQuotes.closePrice} ORDER BY COALESCE(${b3HistoricalQuotes.tradeCount}, 0) DESC, COALESCE(${b3HistoricalQuotes.financialVolume}::numeric, 0) DESC, ${b3HistoricalQuotes.createdAt} DESC))[1]`,
      })
      .from(b3HistoricalQuotes)
      .where(and(...b3Conditions))
      .groupBy(b3HistoricalQuotes.tradeDate)
      .orderBy(asc(b3HistoricalQuotes.tradeDate));

    if (b3Rows.length > 0) {
      return b3Rows.map((r) => {
        return {
          date: r.tradeDate,
          price: r.closePrice,
          quoteDate: r.tradeDate,
        };
      });
    }
  }

  // 3. Fallback para marketQuotes caso não haja registros em b3HistoricalQuotes
  if (resolvedAssetUuid) {
    const [latestMq] = await executor
      .select({
        maxDate: sql<Date | string>`MAX(${marketQuotes.quoteDate})`,
      })
      .from(marketQuotes)
      .where(eq(marketQuotes.assetId, resolvedAssetUuid));

    const refDate = latestMq?.maxDate ? new Date(latestMq.maxDate) : new Date();

    let startDate: Date | null = null;
    switch (period) {
      case '1M':
        startDate = new Date(refDate.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case '3M':
        startDate = new Date(refDate.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case '6M':
        startDate = new Date(refDate.getTime() - 180 * 24 * 60 * 60 * 1000);
        break;
      case '1Y':
        startDate = new Date(refDate.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      case 'ALL':
        startDate = null;
        break;
    }

    const mqConditions = [eq(marketQuotes.assetId, resolvedAssetUuid)];
    if (startDate) {
      mqConditions.push(gte(marketQuotes.quoteDate, startDate));
    }

    const mqRows = await executor
      .select({
        quoteDate: marketQuotes.quoteDate,
        price: marketQuotes.price,
      })
      .from(marketQuotes)
      .where(and(...mqConditions))
      .orderBy(asc(marketQuotes.quoteDate), asc(marketQuotes.id));

    return mqRows.map((q) => {
      const d = new Date(q.quoteDate);
      return {
        date: d.toISOString().slice(0, 10),
        price: q.price,
        quoteDate: d.toISOString(),
      };
    });
  }

  return [];
}

/**
 * Consulta a lista de tickers ativos e públicos para geração de sitemap.xml.
 */
export async function getPublicSitemapAssets(
  limit: number = 1000,
  executor: DbExecutor = db
): Promise<Array<{ ticker: string; assetType: string; updatedAt: Date }>> {
  const assetRows = await executor
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
        sql`assets.is_visible_catalog = true`,
        sql`assets.is_tradeable = true`,
        sql`assets.status = 'active'`,
        inArray(assets.assetType, TRADITIONAL_ASSET_TYPES)
      )
    )
    .orderBy(asc(assets.ticker))
    .limit(limit);

  return assetRows.map((a) => ({
    ticker: a.ticker,
    assetType: a.assetType,
    updatedAt: a.updatedAt,
  }));
}
