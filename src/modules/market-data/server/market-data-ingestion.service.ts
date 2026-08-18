import crypto from 'node:crypto';
import { eq, and, or, isNull, inArray, sql } from 'drizzle-orm';
import { db, type DbExecutor, type Database } from '@/lib/db';
import { marketQuotes, exchangeRates } from '@/lib/db/schema/market-data';
import { assets } from '@/lib/db/schema/portfolio';
import { auditLogs } from '@/lib/db/schema/audit';
import { Decimal } from '@/lib/decimal';
import type { SafeUser } from '@/modules/identity/domain/user.types';
import type { DelayStatus } from '../domain/market-data.types';
import type {
  MarketDataProviderAdapter,
  ManualMarketDataPayload,
  IngestMarketDataOptions,
  IngestionReport,
  IngestionItemResult,
  ProviderQuoteItem,
  ProviderExchangeRateItem,
} from './market-data-provider.types';
import {
  ingestQuoteItemSchema,
  ingestExchangeRateItemSchema,
  type IngestQuoteItemParsed,
  type IngestExchangeRateItemParsed,
} from '../domain/market-data.schema';

/**
 * Ordem hierárquica e determinística de qualidade de dados de mercado.
 * Maior pontuação representa maior qualidade / confiança da informação:
 * 1. realtime (Rank 5)
 * 2. delayed_15m (Rank 4)
 * 3. eod (Rank 3)
 * 4. manual (Rank 2)
 * 5. unknown (Rank 1)
 */
export const DELAY_STATUS_QUALITY_RANK: Record<DelayStatus, number> = {
  realtime: 5,
  delayed_15m: 4,
  eod: 3,
  manual: 2,
  unknown: 1,
};

interface ResolvedAssetResult {
  asset: typeof assets.$inferSelect | null;
  errorCode?: string;
  error?: string;
}

/**
 * Resolve o ativo pelo ID ou pelo ticker, respeitando estritamente o isolamento multi-tenant:
 * - Ativos globais (isCustom = false) são acessíveis por qualquer usuário.
 * - Ativos customizados (isCustom = true) só são acessíveis pelo seu criador (userId = user.id).
 * - Se houver ambiguidade (mais de um ativo correspondente), rejeita com ASSET_AMBIGUOUS.
 */
async function resolveAsset(
  quoteItem: IngestQuoteItemParsed,
  user: SafeUser,
  executor: DbExecutor
): Promise<ResolvedAssetResult> {
  if (quoteItem.assetId) {
    const [asset] = await executor
      .select()
      .from(assets)
      .where(eq(assets.id, quoteItem.assetId))
      .limit(1);

    if (!asset) {
      return {
        asset: null,
        errorCode: 'ASSET_NOT_FOUND',
        error: `Ativo com assetId "${quoteItem.assetId}" não foi encontrado.`,
      };
    }

    if (asset.isCustom && asset.userId !== user.id) {
      return {
        asset: null,
        errorCode: 'FORBIDDEN',
        error: `Acesso negado: o ativo customizado "${asset.ticker}" pertence a outro usuário.`,
      };
    }

    // Validação de consistência se ticker também foi fornecido
    if (quoteItem.ticker) {
      const suppliedTicker = quoteItem.ticker.toUpperCase().trim();
      const assetTicker = asset.ticker.toUpperCase().trim();
      if (suppliedTicker !== assetTicker) {
        return {
          asset: null,
          errorCode: 'ASSET_MISMATCH',
          error: `Inconsistência: o ticker fornecido "${quoteItem.ticker}" não corresponde ao ativo "${asset.ticker}" do assetId informado.`,
        };
      }
    }

    return { asset };
  }

  if (!quoteItem.ticker || quoteItem.ticker.trim().length === 0) {
    return {
      asset: null,
      errorCode: 'VALIDATION_ERROR',
      error: 'É obrigatório fornecer pelo menos assetId ou ticker.',
    };
  }

  // Busca por ticker com controle de visibilidade
  const upperTicker = quoteItem.ticker.toUpperCase().trim();
  const visibilityCondition = or(
    and(eq(assets.isCustom, false), isNull(assets.userId)),
    and(eq(assets.isCustom, true), eq(assets.userId, user.id))
  );

  const matchedAssets = await executor
    .select()
    .from(assets)
    .where(and(sql`UPPER(${assets.ticker}) = ${upperTicker}`, visibilityCondition));

  if (matchedAssets.length === 0) {
    return {
      asset: null,
      errorCode: 'ASSET_NOT_FOUND',
      error: `Ativo com ticker "${quoteItem.ticker}" não foi encontrado no catálogo.`,
    };
  }

  if (matchedAssets.length > 1) {
    return {
      asset: null,
      errorCode: 'ASSET_AMBIGUOUS',
      error: `Ticker "${quoteItem.ticker}" é ambíguo (${matchedAssets.length} ativos correspondentes encontrados). Especifique o assetId.`,
    };
  }

  return { asset: matchedAssets[0] };
}

/**
 * Serviço de Ingestão em Lote de Cotações e Câmbio.
 * Executa validação, compatibilidade, deduplicação em memória, política de qualidade,
 * persistência idempotente e auditoria.
 */
export async function ingestMarketDataPayload(
  payload: ManualMarketDataPayload,
  user: SafeUser,
  options: IngestMarketDataOptions = {}
): Promise<IngestionReport> {
  const dryRun = options.dryRun ?? false;
  const executor = options.executor ?? db;

  const quoteResults: IngestionItemResult[] = [];
  const exchangeResults: IngestionItemResult[] = [];

  const rawQuotes = payload.quotes || [];
  const rawExchangeRates = payload.exchangeRates || [];

  // ─── 1. Validação, Resolução, Compatibilidade e Deduplicação de Cotações ─────
  interface ValidatedQuoteEntry {
    parsed: IngestQuoteItemParsed;
    asset: typeof assets.$inferSelect;
    rawIdentifier: string;
  }

  const validQuotesMap = new Map<string, ValidatedQuoteEntry>();

  for (const rawQuote of rawQuotes) {
    const rawIdentifier = rawQuote.ticker?.trim() || rawQuote.assetId || 'UNKNOWN_ITEM';
    const parseResult = ingestQuoteItemSchema.safeParse(rawQuote);

    if (!parseResult.success) {
      const issue = parseResult.error.issues[0];
      quoteResults.push({
        identifier: rawIdentifier,
        status: 'failed',
        errorCode: 'VALIDATION_ERROR',
        error: issue?.message || 'Dados de cotação inválidos.',
      });
      continue;
    }

    const parsed = parseResult.data;
    const resolved = await resolveAsset(parsed, user, executor);

    if (!resolved.asset) {
      quoteResults.push({
        identifier: parsed.ticker || parsed.assetId || rawIdentifier,
        status: 'failed',
        errorCode: resolved.errorCode || 'ASSET_NOT_FOUND',
        error: resolved.error || 'Ativo não encontrado.',
      });
      continue;
    }

    const asset = resolved.asset;

    // ─── Validação de Compatibilidade com o Ativo (Moeda e Mercado) ───────────
    if (parsed.currency.toUpperCase().trim() !== asset.currency.toUpperCase().trim()) {
      quoteResults.push({
        identifier: asset.ticker,
        status: 'failed',
        errorCode: 'CURRENCY_MISMATCH',
        error: `Incompatibilidade de moeda: a moeda informada "${parsed.currency}" difere da moeda cadastrada do ativo ("${asset.currency}").`,
      });
      continue;
    }

    if (parsed.market && parsed.market.toUpperCase().trim() !== asset.market.toUpperCase().trim()) {
      quoteResults.push({
        identifier: asset.ticker,
        status: 'failed',
        errorCode: 'MARKET_MISMATCH',
        error: `Incompatibilidade de mercado: o mercado informado "${parsed.market}" difere do mercado cadastrado do ativo ("${asset.market}").`,
      });
      continue;
    }

    // ─── Deduplicação em Memória por Lote (preserva maior qualidade) ──────────
    const dedupKey = `${asset.id}_${parsed.quoteDate.toISOString()}`;
    const existingInBatch = validQuotesMap.get(dedupKey);

    if (existingInBatch) {
      const incomingRank = DELAY_STATUS_QUALITY_RANK[parsed.delayStatus] ?? 1;
      const existingRank = DELAY_STATUS_QUALITY_RANK[existingInBatch.parsed.delayStatus] ?? 1;

      if (incomingRank >= existingRank) {
        validQuotesMap.set(dedupKey, {
          parsed,
          asset,
          rawIdentifier: asset.ticker,
        });
      }
    } else {
      validQuotesMap.set(dedupKey, {
        parsed,
        asset,
        rawIdentifier: asset.ticker,
      });
    }
  }

  // ─── 2. Validação e Deduplicação de Taxas de Câmbio ───────────────────────────
  interface ValidatedFxEntry {
    parsed: IngestExchangeRateItemParsed;
    pairKey: string;
  }

  const validFxMap = new Map<string, ValidatedFxEntry>();

  for (const rawFx of rawExchangeRates) {
    const from = (rawFx.fromCurrency || '').toUpperCase().trim();
    const to = (rawFx.toCurrency || 'BRL').toUpperCase().trim();
    const rawIdentifier = `${from}/${to}`;

    const parseResult = ingestExchangeRateItemSchema.safeParse(rawFx);

    if (!parseResult.success) {
      const issue = parseResult.error.issues[0];
      exchangeResults.push({
        identifier: rawIdentifier,
        status: 'failed',
        errorCode: 'VALIDATION_ERROR',
        error: issue?.message || 'Dados de taxa cambial inválidos.',
      });
      continue;
    }

    const parsed = parseResult.data;
    const dedupKey = `${parsed.fromCurrency}_${parsed.toCurrency}_${parsed.rateDate.toISOString()}`;
    const existingInBatch = validFxMap.get(dedupKey);

    if (existingInBatch) {
      const incomingRank = DELAY_STATUS_QUALITY_RANK[parsed.delayStatus] ?? 1;
      const existingRank = DELAY_STATUS_QUALITY_RANK[existingInBatch.parsed.delayStatus] ?? 1;

      if (incomingRank >= existingRank) {
        validFxMap.set(dedupKey, {
          parsed,
          pairKey: `${parsed.fromCurrency}/${parsed.toCurrency}`,
        });
      }
    } else {
      validFxMap.set(dedupKey, {
        parsed,
        pairKey: `${parsed.fromCurrency}/${parsed.toCurrency}`,
      });
    }
  }

  // ─── 3. Verificação de Política de Qualidade contra Registros Existentes no Banco ───
  // Tanto no modo Dry-Run quanto na Persistência, rejeitamos downgrades de qualidade
  const eligibleQuotes: ValidatedQuoteEntry[] = [];
  for (const entry of validQuotesMap.values()) {
    const { parsed, asset } = entry;

    const [existingDbQuote] = await executor
      .select()
      .from(marketQuotes)
      .where(
        and(
          eq(marketQuotes.assetId, asset.id),
          eq(marketQuotes.quoteDate, parsed.quoteDate)
        )
      )
      .limit(1);

    if (existingDbQuote) {
      const existingRank =
        DELAY_STATUS_QUALITY_RANK[existingDbQuote.delayStatus as DelayStatus] ?? 1;
      const incomingRank = DELAY_STATUS_QUALITY_RANK[parsed.delayStatus] ?? 1;

      if (incomingRank < existingRank) {
        quoteResults.push({
          identifier: asset.ticker,
          status: 'failed',
          errorCode: 'QUALITY_DOWNGRADE_REJECTED',
          error: `Atualização rejeitada: a cotação existente possui qualidade superior (${existingDbQuote.delayStatus}) à cotação informada (${parsed.delayStatus}).`,
        });
        continue;
      }
    }

    eligibleQuotes.push(entry);
  }

  const eligibleFx: ValidatedFxEntry[] = [];
  for (const entry of validFxMap.values()) {
    const { parsed, pairKey } = entry;

    const [existingDbFx] = await executor
      .select()
      .from(exchangeRates)
      .where(
        and(
          eq(exchangeRates.fromCurrency, parsed.fromCurrency),
          eq(exchangeRates.toCurrency, parsed.toCurrency),
          eq(exchangeRates.rateDate, parsed.rateDate)
        )
      )
      .limit(1);

    if (existingDbFx) {
      const existingRank =
        DELAY_STATUS_QUALITY_RANK[existingDbFx.delayStatus as DelayStatus] ?? 1;
      const incomingRank = DELAY_STATUS_QUALITY_RANK[parsed.delayStatus] ?? 1;

      if (incomingRank < existingRank) {
        exchangeResults.push({
          identifier: pairKey,
          status: 'failed',
          errorCode: 'QUALITY_DOWNGRADE_REJECTED',
          error: `Atualização rejeitada: a taxa existente possui qualidade superior (${existingDbFx.delayStatus}) à taxa informada (${parsed.delayStatus}).`,
        });
        continue;
      }
    }

    eligibleFx.push(entry);
  }

  // ─── 4. Modo Dry-Run (Sem Escrita e Sem Auditoria) ───────────────────────────
  if (dryRun) {
    for (const { parsed, asset } of eligibleQuotes) {
      quoteResults.push({
        identifier: asset.ticker,
        status: 'success',
        priceOrRate: parsed.price.toString(),
        currency: parsed.currency,
        date: parsed.quoteDate.toISOString(),
      });
    }

    for (const { parsed, pairKey } of eligibleFx) {
      exchangeResults.push({
        identifier: pairKey,
        status: 'success',
        priceOrRate: parsed.rate.toString(),
        currency: parsed.toCurrency,
        date: parsed.rateDate.toISOString(),
      });
    }

    const quotesSucceeded = quoteResults.filter((r) => r.status === 'success').length;
    const quotesFailed = quoteResults.filter((r) => r.status === 'failed').length;
    const fxSucceeded = exchangeResults.filter((r) => r.status === 'success').length;
    const fxFailed = exchangeResults.filter((r) => r.status === 'failed').length;

    return {
      dryRun: true,
      quotesSummary: {
        total: rawQuotes.length,
        succeeded: quotesSucceeded,
        failed: quotesFailed,
        items: quoteResults,
      },
      exchangeRatesSummary: {
        total: rawExchangeRates.length,
        succeeded: fxSucceeded,
        failed: fxFailed,
        items: exchangeResults,
      },
      success: quotesFailed === 0 && fxFailed === 0,
    };
  }

  // ─── 5. Persistência Atômica e Idempotente no PostgreSQL Real ────────────────
  const executeBatchWrites = async (tx: DbExecutor) => {
    const now = new Date();

    // Persiste Cotações
    for (const { parsed, asset } of eligibleQuotes) {
      const quoteId = crypto.randomUUID();

      const [savedQuote] = await tx
        .insert(marketQuotes)
        .values({
          id: quoteId,
          assetId: asset.id,
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

      // Registro de Auditoria
      await tx.insert(auditLogs).values({
        id: crypto.randomUUID(),
        tableName: 'market_quotes',
        recordId: savedQuote.id,
        action: 'CREATE_OR_UPDATE_QUOTE',
        actorId: user.id,
        actorType: 'user',
        newValue: {
          assetId: asset.id,
          ticker: asset.ticker,
          price: savedQuote.price,
          currency: savedQuote.currency,
          quoteDate: savedQuote.quoteDate.toISOString(),
          source: savedQuote.source,
          delayStatus: savedQuote.delayStatus,
        },
        source: 'market-data.ingestion',
        createdAt: now,
      });

      quoteResults.push({
        identifier: asset.ticker,
        status: 'success',
        recordId: savedQuote.id,
        priceOrRate: new Decimal(savedQuote.price).toString(),
        currency: savedQuote.currency,
        date: savedQuote.quoteDate.toISOString(),
      });
    }

    // Persiste Taxas de Câmbio
    for (const { parsed, pairKey } of eligibleFx) {
      const rateId = crypto.randomUUID();

      const [savedFx] = await tx
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

      // Registro de Auditoria
      await tx.insert(auditLogs).values({
        id: crypto.randomUUID(),
        tableName: 'exchange_rates',
        recordId: savedFx.id,
        action: 'CREATE_OR_UPDATE_FX_RATE',
        actorId: user.id,
        actorType: 'user',
        newValue: {
          fromCurrency: savedFx.fromCurrency,
          toCurrency: savedFx.toCurrency,
          rate: savedFx.rate,
          rateDate: savedFx.rateDate.toISOString(),
          source: savedFx.source,
          delayStatus: savedFx.delayStatus,
        },
        source: 'market-data.ingestion',
        createdAt: now,
      });

      exchangeResults.push({
        identifier: pairKey,
        status: 'success',
        recordId: savedFx.id,
        priceOrRate: new Decimal(savedFx.rate).toString(),
        currency: savedFx.toCurrency,
        date: savedFx.rateDate.toISOString(),
      });
    }
  };

  // Se o executor fornecido já for uma transação, usa diretamente; caso contrário, abre transação
  if ('transaction' in executor && typeof (executor as Database).transaction === 'function') {
    await (executor as Database).transaction(async (tx) => {
      await executeBatchWrites(tx);
    });
  } else {
    await executeBatchWrites(executor);
  }

  const quotesSucceeded = quoteResults.filter((r) => r.status === 'success').length;
  const quotesFailed = quoteResults.filter((r) => r.status === 'failed').length;
  const fxSucceeded = exchangeResults.filter((r) => r.status === 'success').length;
  const fxFailed = exchangeResults.filter((r) => r.status === 'failed').length;

  return {
    dryRun: false,
    quotesSummary: {
      total: rawQuotes.length,
      succeeded: quotesSucceeded,
      failed: quotesFailed,
      items: quoteResults,
    },
    exchangeRatesSummary: {
      total: rawExchangeRates.length,
      succeeded: fxSucceeded,
      failed: fxFailed,
      items: exchangeResults,
    },
    success: quotesFailed === 0 && fxFailed === 0,
  };
}

/**
 * Ingestão a partir de um adaptador de dados de mercado (Mock, Manual ou Futuro Provedor Externo).
 */
export async function ingestFromProvider(
  provider: MarketDataProviderAdapter,
  request: {
    tickers?: string[];
    pairs?: Array<{ fromCurrency: string; toCurrency?: string }>;
    targetDate?: Date;
  },
  user: SafeUser,
  options: IngestMarketDataOptions = {}
): Promise<IngestionReport> {
  const quotes = await provider.fetchQuotes(request.tickers, request.targetDate);
  const exchangeRates = await provider.fetchExchangeRates(request.pairs, request.targetDate);

  const report = await ingestMarketDataPayload(
    {
      quotes,
      exchangeRates,
    },
    user,
    options
  );

  // ─── Deduplicação e Normalização de Solicitações e Respostas ─────────────────
  if (request.tickers && request.tickers.length > 0) {
    const requestedTickersSet = new Set(
      request.tickers.map((t) => t.trim().toUpperCase()).filter(Boolean)
    );

    const returnedTickersSet = new Set(
      quotes.map((q) => (q.ticker || '').trim().toUpperCase()).filter(Boolean)
    );

    for (const requestedTicker of requestedTickersSet) {
      if (!returnedTickersSet.has(requestedTicker)) {
        report.quotesSummary.total++;
        report.quotesSummary.failed++;
        report.quotesSummary.items.push({
          identifier: requestedTicker,
          status: 'failed',
          errorCode: 'PROVIDER_MISSING_DATA',
          error: `O provedor "${provider.name}" não retornou cotação para o ticker solicitado "${requestedTicker}".`,
        });
        report.success = false;
      }
    }
  }

  if (request.pairs && request.pairs.length > 0) {
    const requestedPairsMap = new Map<string, { fromCurrency: string; toCurrency: string }>();

    for (const p of request.pairs) {
      const fromNorm = p.fromCurrency.trim().toUpperCase();
      const toNorm = (p.toCurrency || 'BRL').trim().toUpperCase();
      if (fromNorm && toNorm) {
        requestedPairsMap.set(`${fromNorm}_${toNorm}`, {
          fromCurrency: fromNorm,
          toCurrency: toNorm,
        });
      }
    }

    const returnedPairsSet = new Set(
      exchangeRates.map(
        (r) =>
          `${r.fromCurrency.trim().toUpperCase()}_${(r.toCurrency || 'BRL').trim().toUpperCase()}`
      )
    );

    for (const [pairKey, pairObj] of requestedPairsMap.entries()) {
      if (!returnedPairsSet.has(pairKey)) {
        report.exchangeRatesSummary.total++;
        report.exchangeRatesSummary.failed++;
        report.exchangeRatesSummary.items.push({
          identifier: `${pairObj.fromCurrency}/${pairObj.toCurrency}`,
          status: 'failed',
          errorCode: 'PROVIDER_MISSING_DATA',
          error: `O provedor "${provider.name}" não retornou taxa de câmbio para o par solicitado "${pairObj.fromCurrency}/${pairObj.toCurrency}".`,
        });
        report.success = false;
      }
    }
  }

  return report;
}
