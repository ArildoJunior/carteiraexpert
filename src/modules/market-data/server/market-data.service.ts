import { eq, and, desc, inArray, sql } from 'drizzle-orm';
import crypto from 'node:crypto';
import { db, type DbExecutor } from '@/lib/db';
import { marketQuotes, exchangeRates } from '@/lib/db/schema/market-data';
import { assets } from '@/lib/db/schema/portfolio';
import { auditLogs } from '@/lib/db/schema/audit';
import { Decimal } from '@/lib/decimal';
import type { SafeUser } from '@/modules/identity/domain/user.types';
import type {
  MarketQuote,
  ExchangeRate,
  DelayStatus,
} from '../domain/market-data.types';
import {
  createMarketQuoteSchema,
  createExchangeRateSchema,
  type CreateMarketQuoteInput,
  type CreateExchangeRateInput,
} from '../domain/market-data.schema';
import { getAssetById } from '@/modules/portfolio/server/asset.service';

/**
 * Mapeia uma linha do PostgreSQL para a entidade canônica MarketQuote.
 */
function mapQuoteRow(row: typeof marketQuotes.$inferSelect): MarketQuote {
  return {
    id: row.id,
    assetId: row.assetId,
    price: new Decimal(row.price),
    currency: row.currency,
    quoteDate: new Date(row.quoteDate),
    source: row.source,
    delayStatus: row.delayStatus as DelayStatus,
    notes: row.notes,
    createdBy: row.createdBy,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

/**
 * Mapeia uma linha do PostgreSQL para a entidade canônica ExchangeRate.
 */
function mapExchangeRateRow(row: typeof exchangeRates.$inferSelect): ExchangeRate {
  return {
    id: row.id,
    fromCurrency: row.fromCurrency,
    toCurrency: row.toCurrency,
    rate: new Decimal(row.rate),
    rateDate: new Date(row.rateDate),
    source: row.source,
    delayStatus: row.delayStatus as DelayStatus,
    createdBy: row.createdBy,
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  };
}

import { b3HistoricalQuotes } from '@/lib/db/schema/b3-market-data';

/**
 * Consulta a cotação mais recente de um ativo específico.
 * Valida autorização caso o ativo seja customizado do usuário.
 * Caso não haja cotação em market_quotes, busca o último fechamento oficial em b3_historical_quotes.
 */
export async function getLatestQuoteForAsset(
  assetId: string,
  user: SafeUser,
  executor: DbExecutor = db
): Promise<MarketQuote | null> {
  // 1. Valida acesso ao ativo (garante isolamento para ativos customizados)
  const asset = await getAssetById(assetId, user, executor);

  // 2. Busca a cotação com maior quoteDate no banco interno (market_quotes)
  const rows = await executor
    .select()
    .from(marketQuotes)
    .where(eq(marketQuotes.assetId, assetId))
    .orderBy(desc(marketQuotes.quoteDate), desc(marketQuotes.createdAt))
    .limit(1);

  if (rows.length > 0) {
    return mapQuoteRow(rows[0]);
  }

  // 3. Fallback: Busca o último fechamento oficial na base COTAHIST B3
  const [b3Row] = await executor
    .select()
    .from(b3HistoricalQuotes)
    .where(eq(b3HistoricalQuotes.ticker, asset.ticker))
    .orderBy(desc(b3HistoricalQuotes.tradeDate))
    .limit(1);

  if (b3Row) {
    const qDate = new Date(b3Row.tradeDate);
    return {
      id: `cotahist-${b3Row.id}`,
      assetId: asset.id,
      price: new Decimal(b3Row.closePrice),
      currency: 'BRL',
      quoteDate: qDate,
      source: 'cotahist_b3',
      delayStatus: 'eod',
      notes: `Fechamento oficial B3 COTAHIST (${qDate.toISOString().slice(0, 10)})`,
      createdBy: 'system',
      createdAt: qDate,
      updatedAt: qDate,
    };
  }

  return null;
}

/**
 * Consulta as cotações mais recentes para um conjunto de ativos.
 * Utiliza DISTINCT ON para alta performance e fallback para b3_historical_quotes.
 */
export async function getLatestQuotesForAssets(
  assetIds: string[],
  user: SafeUser,
  executor: DbExecutor = db
): Promise<Map<string, MarketQuote>> {
  const result = new Map<string, MarketQuote>();
  if (assetIds.length === 0) {
    return result;
  }

  // Busca ativos para filtrar apenas os autorizados para o usuário
  const userAssetRows = await executor
    .select()
    .from(assets)
    .where(inArray(assets.id, assetIds));

  const authorizedAssets = userAssetRows.filter(
    (a) => !a.isCustom || a.userId === user.id
  );

  if (authorizedAssets.length === 0) {
    return result;
  }

  const authorizedAssetIds = authorizedAssets.map((a) => a.id);

  // Executa consulta com DISTINCT ON (asset_id) em market_quotes
  const rows = await executor
    .selectDistinctOn([marketQuotes.assetId])
    .from(marketQuotes)
    .where(inArray(marketQuotes.assetId, authorizedAssetIds))
    .orderBy(marketQuotes.assetId, desc(marketQuotes.quoteDate), desc(marketQuotes.createdAt));

  for (const row of rows) {
    result.set(row.assetId, mapQuoteRow(row));
  }

  // Fallback: Para ativos que não possuem cotação em market_quotes, busca em b3_historical_quotes
  const missingAssets = authorizedAssets.filter((a) => !result.has(a.id));
  for (const asset of missingAssets) {
    const [b3Row] = await executor
      .select()
      .from(b3HistoricalQuotes)
      .where(eq(b3HistoricalQuotes.ticker, asset.ticker))
      .orderBy(desc(b3HistoricalQuotes.tradeDate))
      .limit(1);

    if (b3Row) {
      const qDate = new Date(b3Row.tradeDate);
      result.set(asset.id, {
        id: `cotahist-${b3Row.id}`,
        assetId: asset.id,
        price: new Decimal(b3Row.closePrice),
        currency: 'BRL',
        quoteDate: qDate,
        source: 'cotahist_b3',
        delayStatus: 'eod',
        notes: `Fechamento oficial B3 COTAHIST (${qDate.toISOString().slice(0, 10)})`,
        createdBy: 'system',
        createdAt: qDate,
        updatedAt: qDate,
      });
    }
  }

  return result;
}

/**
 * Consulta a taxa cambial mais recente entre duas moedas (ex: USD -> BRL).
 */
export async function getLatestExchangeRate(
  fromCurrency: string,
  toCurrency = 'BRL',
  executor: DbExecutor = db
): Promise<ExchangeRate | null> {
  const normFrom = fromCurrency.toUpperCase().trim();
  const normTo = toCurrency.toUpperCase().trim();

  if (normFrom === normTo) {
    const now = new Date();
    return {
      id: crypto.randomUUID(),
      fromCurrency: normFrom,
      toCurrency: normTo,
      rate: new Decimal(1),
      rateDate: now,
      source: 'identity',
      delayStatus: 'eod',
      createdBy: '00000000-0000-0000-0000-000000000000',
      createdAt: now,
      updatedAt: now,
    };
  }

  const rows = await executor
    .select()
    .from(exchangeRates)
    .where(
      and(
        eq(exchangeRates.fromCurrency, normFrom),
        eq(exchangeRates.toCurrency, normTo)
      )
    )
    .orderBy(desc(exchangeRates.rateDate), desc(exchangeRates.createdAt))
    .limit(1);

  if (rows.length === 0) {
    return null;
  }

  return mapExchangeRateRow(rows[0]);
}

/**
 * Consulta as taxas cambiais mais recentes para múltiplos pares de moedas para BRL.
 */
export async function getLatestExchangeRates(
  fromCurrencies: string[],
  toCurrency = 'BRL',
  executor: DbExecutor = db
): Promise<Map<string, ExchangeRate>> {
  const result = new Map<string, ExchangeRate>();
  const normTo = toCurrency.toUpperCase().trim();
  const uniqueFrom = Array.from(
    new Set(fromCurrencies.map((c) => c.toUpperCase().trim()))
  );

  if (uniqueFrom.length === 0) {
    return result;
  }

  // Preenche pares idênticos com taxa 1.00 e status 'eod'
  for (const c of uniqueFrom) {
    if (c === normTo) {
      const now = new Date();
      result.set(c, {
        id: crypto.randomUUID(),
        fromCurrency: c,
        toCurrency: normTo,
        rate: new Decimal(1),
        rateDate: now,
        source: 'identity',
        delayStatus: 'eod',
        createdBy: '00000000-0000-0000-0000-000000000000',
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  const nonIdentityFrom = uniqueFrom.filter((c) => c !== normTo);
  if (nonIdentityFrom.length === 0) {
    return result;
  }

  const rows = await executor
    .selectDistinctOn([exchangeRates.fromCurrency, exchangeRates.toCurrency])
    .from(exchangeRates)
    .where(
      and(
        inArray(exchangeRates.fromCurrency, nonIdentityFrom),
        eq(exchangeRates.toCurrency, normTo)
      )
    )
    .orderBy(
      exchangeRates.fromCurrency,
      exchangeRates.toCurrency,
      desc(exchangeRates.rateDate),
      desc(exchangeRates.createdAt)
    );

  for (const row of rows) {
    result.set(row.fromCurrency, mapExchangeRateRow(row));
  }

  return result;
}

/**
 * Registra ou atualiza atomicamente uma cotação no banco interno com auditoria.
 */
export async function createMarketQuote(
  rawInput: CreateMarketQuoteInput,
  user: SafeUser,
  executor: DbExecutor = db
): Promise<MarketQuote> {
  const parsed = createMarketQuoteSchema.parse(rawInput);

  // 1. Valida acesso ao ativo
  const asset = await getAssetById(parsed.assetId, user, executor);

  const quoteId = crypto.randomUUID();
  const now = new Date();

  // 2. Insere com cláusula ON CONFLICT para idempotência de cotações no mesmo quoteDate
  const insertedRows = await executor
    .insert(marketQuotes)
    .values({
      id: quoteId,
      assetId: parsed.assetId,
      price: parsed.price.toFixed(8),
      currency: parsed.currency,
      quoteDate: parsed.quoteDate,
      source: parsed.source,
      delayStatus: parsed.delayStatus,
      notes: parsed.notes ?? null,
      createdBy: user.id,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [marketQuotes.assetId, marketQuotes.quoteDate],
      set: {
        price: parsed.price.toFixed(8),
        currency: parsed.currency,
        source: parsed.source,
        delayStatus: parsed.delayStatus,
        notes: parsed.notes ?? null,
        updatedAt: now,
      },
    })
    .returning();

  const saved = mapQuoteRow(insertedRows[0]);

  // 3. Registra log de auditoria imutável
  await executor.insert(auditLogs).values({
    id: crypto.randomUUID(),
    tableName: 'market_quotes',
    recordId: saved.id,
    action: 'CREATE_OR_UPDATE_QUOTE',
    actorId: user.id,
    actorType: 'user',
    newValue: {
      assetId: saved.assetId,
      ticker: asset.ticker,
      price: saved.price.toString(),
      currency: saved.currency,
      quoteDate: saved.quoteDate.toISOString(),
      source: saved.source,
      delayStatus: saved.delayStatus,
    },
    source: 'market-data.service',
    createdAt: now,
  });

  return saved;
}

/**
 * Registra ou atualiza atomicamente uma taxa cambial no banco interno com auditoria.
 */
export async function createExchangeRate(
  rawInput: CreateExchangeRateInput,
  user: SafeUser,
  executor: DbExecutor = db
): Promise<ExchangeRate> {
  const parsed = createExchangeRateSchema.parse(rawInput);

  const rateId = crypto.randomUUID();
  const now = new Date();

  const insertedRows = await executor
    .insert(exchangeRates)
    .values({
      id: rateId,
      fromCurrency: parsed.fromCurrency,
      toCurrency: parsed.toCurrency,
      rate: parsed.rate.toFixed(8),
      rateDate: parsed.rateDate,
      source: parsed.source,
      delayStatus: parsed.delayStatus,
      createdBy: user.id,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        exchangeRates.fromCurrency,
        exchangeRates.toCurrency,
        exchangeRates.rateDate,
      ],
      set: {
        rate: parsed.rate.toFixed(8),
        source: parsed.source,
        delayStatus: parsed.delayStatus,
        updatedAt: now,
      },
    })
    .returning();

  const saved = mapExchangeRateRow(insertedRows[0]);

  // Registra log de auditoria
  await executor.insert(auditLogs).values({
    id: crypto.randomUUID(),
    tableName: 'exchange_rates',
    recordId: saved.id,
    action: 'CREATE_OR_UPDATE_FX_RATE',
    actorId: user.id,
    actorType: 'user',
    newValue: {
      fromCurrency: saved.fromCurrency,
      toCurrency: saved.toCurrency,
      rate: saved.rate.toString(),
      rateDate: saved.rateDate.toISOString(),
      source: saved.source,
      delayStatus: saved.delayStatus,
    },
    source: 'market-data.service',
    createdAt: now,
  });

  return saved;
}
