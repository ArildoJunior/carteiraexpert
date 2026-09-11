import { eq, and, gte, lte, asc, desc, sql, getTableColumns } from 'drizzle-orm';
import { db, type DbExecutor } from '@/lib/db';
import { b3HistoricalQuotes } from '@/lib/db/schema/b3-market-data';
import type {
  B3HistoricalQuoteItem,
  B3HistoricalQuotesFilter,
  B3HistoricalQuotesResult,
} from '../domain/b3-historical-quotes.types';

function getMarketTypeDescription(marketType: number): string {
  switch (marketType) {
    case 10:
      return 'VISTA';
    case 20:
      return 'FRACIONÁRIO';
    case 30:
      return 'TERMO';
    case 70:
      return 'OPÇÕES DE COMPRA';
    case 80:
      return 'OPÇÕES DE VENDA';
    case 12:
      return 'EXERCÍCIO DE OPÇÕES DE COMPRA';
    case 13:
      return 'EXERCÍCIO DE OPÇÕES DE VENDA';
    case 17:
      return 'LEILÃO';
    default:
      return `MERCADO ${marketType}`;
  }
}

function formatDateToPtBr(isoDate: string): string {
  if (!isoDate) { return ''; }
  const parts = isoDate.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return isoDate;
}

/**
 * Consulta cotações históricas da B3 na tabela b3_historical_quotes.
 * Aplica deduplicação determinística por instrumento econômico (tradeDate, marketType, bdiCode)
 * preservando o registro mais recente inserido no banco caso haja duplicidade física residual.
 */
export async function getB3HistoricalQuotes(
  filter: B3HistoricalQuotesFilter,
  executor: DbExecutor = db
): Promise<B3HistoricalQuotesResult> {
  const ticker = filter.ticker ? filter.ticker.trim().toUpperCase() : 'PETR4';
  const page = Math.max(1, filter.page ?? 1);
  const limit = Math.min(100, Math.max(1, filter.limit ?? 20));
  const orderDirection = filter.order === 'asc' ? 'asc' : 'desc';

  const conditions = [eq(b3HistoricalQuotes.ticker, ticker)];

  if (filter.startDate) {
    conditions.push(gte(b3HistoricalQuotes.tradeDate, filter.startDate.trim()));
  }

  if (filter.endDate) {
    conditions.push(lte(b3HistoricalQuotes.tradeDate, filter.endDate.trim()));
  }

  const whereClause = and(...conditions);

  // Subconsulta particionada para deduplicar múltiplos registros da mesma data e instrumento
  // (ex: reprocessamento de lote com hash diferente). Prioriza o mais recentemente criado.
  const b3Columns = getTableColumns(b3HistoricalQuotes);
  const rankedSubquery = executor
    .select({
      ...b3Columns,
      rowNumber: sql<number>`ROW_NUMBER() OVER (
        PARTITION BY ${b3HistoricalQuotes.ticker}, ${b3HistoricalQuotes.tradeDate}, ${b3HistoricalQuotes.marketType}, ${b3HistoricalQuotes.bdiCode}
        ORDER BY ${b3HistoricalQuotes.createdAt} DESC, ${b3HistoricalQuotes.id} DESC
      )`.as('rn'),
    })
    .from(b3HistoricalQuotes)
    .where(whereClause)
    .as('ranked_b3_quotes');

  // 1. Contagem total de registros deduplicados para paginação
  const [countResult] = await executor
    .select({ count: sql<number>`count(*)::int` })
    .from(rankedSubquery)
    .where(eq(rankedSubquery.rowNumber, 1));

  const totalCount = countResult?.count ?? 0;
  const totalPages = Math.ceil(totalCount / limit) || 1;
  const offset = (page - 1) * limit;

  // 2. Consulta paginada deduplicada com ordenação consistente
  const rows = await executor
    .select()
    .from(rankedSubquery)
    .where(eq(rankedSubquery.rowNumber, 1))
    .orderBy(
      orderDirection === 'asc'
        ? asc(rankedSubquery.tradeDate)
        : desc(rankedSubquery.tradeDate),
      asc(rankedSubquery.marketType),
      asc(rankedSubquery.id)
    )
    .limit(limit)
    .offset(offset);

  const quotes: B3HistoricalQuoteItem[] = rows.map((r) => {
    const isoDate = r.tradeDate;
    const ptBrDate = formatDateToPtBr(r.tradeDate);

    return {
      id: r.id,
      batchId: r.batchId,
      tradeDate: isoDate,
      tradeDateFormatted: ptBrDate,
      ticker: r.ticker,
      bdiCode: r.bdiCode,
      marketType: r.marketType,
      marketTypeDescription: getMarketTypeDescription(r.marketType),
      shortName: r.shortName,
      specification: r.specification,
      forwardTermDays: r.forwardTermDays,
      currency: r.currency,
      openPrice: r.openPrice,
      highPrice: r.highPrice,
      lowPrice: r.lowPrice,
      averagePrice: r.averagePrice,
      closePrice: r.closePrice,
      bestBidPrice: r.bestBidPrice,
      bestAskPrice: r.bestAskPrice,
      tradeCount: r.tradeCount,
      quantity: r.quantity,
      financialVolume: r.financialVolume,
      strikePrice: r.strikePrice,
      expirationDate: r.expirationDate,
      quotationFactor: r.quotationFactor,
      isin: r.isin,
      distributionNumber: r.distributionNumber,
      assetId: r.assetId,
    };
  });

  return {
    quotes,
    totalCount,
    page,
    limit,
    totalPages,
    ticker,
    startDate: filter.startDate,
    endDate: filter.endDate,
    order: orderDirection,
  };
}

/**
 * Retorna os principais tickers negociados disponíveis na base histórica.
 */
export async function getPopularB3Tickers(
  executor: DbExecutor = db
): Promise<string[]> {
  try {
    const rows = await executor
      .select({ ticker: b3HistoricalQuotes.ticker })
      .from(b3HistoricalQuotes)
      .where(eq(b3HistoricalQuotes.marketType, 10))
      .groupBy(b3HistoricalQuotes.ticker)
      .orderBy(desc(sql`count(*)`))
      .limit(10);

    const tickers = rows.map((r) => r.ticker);
    if (tickers.length > 0) {
      return tickers;
    }
  } catch {
    // Fallback padrão se não houver registros
  }

  return ['PETR4', 'VALE3', 'ITUB4', 'BBAS3', 'BBDC4', 'MGLU3'];
}
