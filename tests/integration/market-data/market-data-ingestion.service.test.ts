import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { eq, inArray, sql } from 'drizzle-orm';
import { db } from '../../../src/lib/db';
import {
  users,
  portfolios,
  assets,
  portfolioEvents,
  marketQuotes,
  exchangeRates,
  auditLogs,
} from '../../../src/lib/db/schema';
import { createCustomAsset } from '../../../src/modules/portfolio/server/asset.service';
import { createPortfolio } from '../../../src/modules/portfolio/server/portfolio.service';
import { createPortfolioEvent } from '../../../src/modules/portfolio/server/portfolio-event.service';
import { getPortfolioPositions } from '../../../src/modules/portfolio/server/position.service';
import {
  ingestMarketDataPayload,
  ingestFromProvider,
} from '../../../src/modules/market-data/server/market-data-ingestion.service';
import { MockMarketDataProviderAdapter } from '../../../src/modules/market-data/server/adapters/mock-provider.adapter';
import type { SafeUser } from '../../../src/modules/identity/domain/user.types';

describe('Integração: Serviço de Ingestão de Market Data e Câmbio (PostgreSQL Real)', () => {
  const userAId = crypto.randomUUID();
  const userBId = crypto.randomUUID();
  const userAEmail = 'mkt_ingest_a@carteiraexpert.invalid';
  const userBEmail = 'mkt_ingest_b@carteiraexpert.invalid';

  const userA: SafeUser = {
    id: userAId,
    email: userAEmail,
    name: 'User Ingest A',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const userB: SafeUser = {
    id: userBId,
    email: userBEmail,
    name: 'User Ingest B',
    status: 'active',
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  let globalPetr4Id: string;
  let globalVale3Id: string;
  let customAssetAId: string;
  let duplicateTickerAssetId: string;

  beforeAll(async () => {
    // Limpeza prévia
    await db.delete(assets).where(inArray(assets.ticker, ['PETR4_ING', 'VALE3_ING', 'AMBIG_ING', 'AAPL_ING']));
    await db.delete(users).where(inArray(users.email, [userAEmail, userBEmail]));

    await db.insert(users).values([
      {
        id: userAId,
        email: userAEmail,
        name: 'User Ingest A',
        passwordHash: 'hash_a',
        status: 'active',
      },
      {
        id: userBId,
        email: userBEmail,
        name: 'User Ingest B',
        passwordHash: 'hash_b',
        status: 'active',
      },
    ]);

    // Ativos Globais
    globalPetr4Id = crypto.randomUUID();
    globalVale3Id = crypto.randomUUID();

    await db.insert(assets).values([
      {
        id: globalPetr4Id,
        ticker: 'PETR4_ING',
        name: 'Petrobras Test Ingest',
        assetType: 'stock',
        market: 'B3',
        currency: 'BRL',
        isCustom: false,
      },
      {
        id: globalVale3Id,
        ticker: 'VALE3_ING',
        name: 'Vale Test Ingest',
        assetType: 'stock',
        market: 'B3',
        currency: 'BRL',
        isCustom: false,
      },
    ]);

    // Ativo Customizado do Usuário A
    const customAsset = await createCustomAsset(
      {
        ticker: 'CUST_A_ING',
        name: 'Custom Asset Ingest A',
        assetType: 'custom',
        market: 'CUSTOM',
        currency: 'BRL',
      },
      userA
    );
    customAssetAId = customAsset.id;

    // Ativos com Ticker Ambíguo para Usuário A (Global + Custom com mesmo ticker)
    const ambigGlobalId = crypto.randomUUID();
    await db.insert(assets).values({
      id: ambigGlobalId,
      ticker: 'AMBIG_ING',
      name: 'Ambig Global',
      assetType: 'stock',
      market: 'B3',
      currency: 'BRL',
      isCustom: false,
    });

    const ambigCustom = await createCustomAsset(
      {
        ticker: 'AMBIG_ING',
        name: 'Ambig Custom A',
        assetType: 'custom',
        market: 'CUSTOM',
        currency: 'BRL',
      },
      userA
    );
    duplicateTickerAssetId = ambigCustom.id;
  });

  afterEach(async () => {
    // Limpeza de cotações e taxas inseridas
    const assetIds = [globalPetr4Id, globalVale3Id, customAssetAId, duplicateTickerAssetId].filter(Boolean);
    if (assetIds.length > 0) {
      await db.delete(marketQuotes).where(inArray(marketQuotes.assetId, assetIds));
    }
    await db.delete(exchangeRates).where(inArray(exchangeRates.fromCurrency, ['USD', 'EUR']));
  });

  afterAll(async () => {
    const assetIds = [globalPetr4Id, globalVale3Id, customAssetAId, duplicateTickerAssetId].filter(Boolean);
    if (assetIds.length > 0) {
      await db.delete(marketQuotes).where(inArray(marketQuotes.assetId, assetIds));
      await db.delete(portfolioEvents).where(inArray(portfolioEvents.assetId, assetIds));
      await db.delete(assets).where(inArray(assets.id, assetIds));
    }
    await db.delete(assets).where(eq(assets.ticker, 'AMBIG_ING'));
    await db.delete(exchangeRates).where(inArray(exchangeRates.fromCurrency, ['USD', 'EUR']));
    await db.delete(portfolios).where(inArray(portfolios.userId, [userAId, userBId]));
    await db.delete(auditLogs).where(inArray(auditLogs.actorId, [userAId, userBId]));
    await db.delete(users).where(inArray(users.email, [userAEmail, userBEmail]));
  });

  it('1. deve ingerir payload válido de cotação e taxa cambial com persistência e auditoria', async () => {
    const report = await ingestMarketDataPayload(
      {
        quotes: [
          {
            ticker: 'PETR4_ING',
            price: '39.50',
            quoteDate: '2026-08-18T18:00:00.000Z',
          },
        ],
        exchangeRates: [
          {
            fromCurrency: 'USD',
            toCurrency: 'BRL',
            rate: '5.45000000',
            rateDate: '2026-08-18T18:00:00.000Z',
          },
        ],
      },
      userA
    );

    expect(report.success).toBe(true);
    expect(report.quotesSummary.succeeded).toBe(1);
    expect(report.exchangeRatesSummary.succeeded).toBe(1);

    // Valida cotação persistida
    const [quoteRow] = await db
      .select()
      .from(marketQuotes)
      .where(eq(marketQuotes.assetId, globalPetr4Id));

    expect(quoteRow).toBeDefined();
    expect(quoteRow.price).toBe('39.50000000');
    expect(quoteRow.delayStatus).toBe('manual');
    expect(quoteRow.createdBy).toBe(userAId);

    // Valida taxa cambial persistida
    const [rateRow] = await db
      .select()
      .from(exchangeRates)
      .where(eq(exchangeRates.fromCurrency, 'USD'));

    expect(rateRow).toBeDefined();
    expect(rateRow.rate).toBe('5.45000000');
    expect(rateRow.createdBy).toBe(userAId);

    // Valida auditoria
    const logs = await db
      .select()
      .from(auditLogs)
      .where(inArray(auditLogs.tableName, ['market_quotes', 'exchange_rates']));

    expect(logs.length).toBeGreaterThanOrEqual(2);
  });

  it('2. não deve gravar no banco quando dryRun for true', async () => {
    const report = await ingestMarketDataPayload(
      {
        quotes: [
          {
            ticker: 'PETR4_ING',
            price: '45.00',
            quoteDate: '2026-08-18T18:00:00.000Z',
          },
        ],
      },
      userA,
      { dryRun: true }
    );

    expect(report.dryRun).toBe(true);
    expect(report.quotesSummary.succeeded).toBe(1);

    // Garante que não há registro gravado no PostgreSQL
    const rows = await db
      .select()
      .from(marketQuotes)
      .where(eq(marketQuotes.assetId, globalPetr4Id));

    expect(rows).toHaveLength(0);
  });

  it('3. deve reportar ASSET_NOT_FOUND para ticker inexistente e continuar lote', async () => {
    const report = await ingestMarketDataPayload(
      {
        quotes: [
          {
            ticker: 'VALE3_ING',
            price: '60.00',
            quoteDate: '2026-08-18T18:00:00.000Z',
          },
          {
            ticker: 'NAO_EXISTE_XYZ',
            price: '10.00',
            quoteDate: '2026-08-18T18:00:00.000Z',
          },
        ],
      },
      userA
    );

    expect(report.success).toBe(false);
    expect(report.quotesSummary.total).toBe(2);
    expect(report.quotesSummary.succeeded).toBe(1);
    expect(report.quotesSummary.failed).toBe(1);

    const failedItem = report.quotesSummary.items.find((i) => i.identifier === 'NAO_EXISTE_XYZ');
    expect(failedItem?.status).toBe('failed');
    expect(failedItem?.errorCode).toBe('ASSET_NOT_FOUND');
  });

  it('4. deve reportar ASSET_AMBIGUOUS quando múltiplos ativos corresponderem ao ticker', async () => {
    const report = await ingestMarketDataPayload(
      {
        quotes: [
          {
            ticker: 'AMBIG_ING',
            price: '25.00',
            quoteDate: '2026-08-18T18:00:00.000Z',
          },
        ],
      },
      userA
    );

    expect(report.quotesSummary.failed).toBe(1);
    const item = report.quotesSummary.items[0];
    expect(item.status).toBe('failed');
    expect(item.errorCode).toBe('ASSET_AMBIGUOUS');
  });

  it('5. deve rejeitar cotação em ativo customizado pertencente a outro usuário (FORBIDDEN)', async () => {
    const report = await ingestMarketDataPayload(
      {
        quotes: [
          {
            assetId: customAssetAId,
            ticker: 'CUST_A_ING',
            price: '50.00',
            quoteDate: '2026-08-18T18:00:00.000Z',
          },
        ],
      },
      userB // Usuário B tentando alterar ativo de A
    );

    expect(report.quotesSummary.failed).toBe(1);
    const item = report.quotesSummary.items[0];
    expect(item.status).toBe('failed');
    expect(item.errorCode).toBe('FORBIDDEN');
  });

  it('6. deve deduplicar itens com a mesma data no mesmo lote mantendo o último valor', async () => {
    const quoteDate = '2026-08-18T18:00:00.000Z';

    const report = await ingestMarketDataPayload(
      {
        quotes: [
          {
            ticker: 'PETR4_ING',
            price: '35.00',
            quoteDate,
          },
          {
            ticker: 'PETR4_ING',
            price: '37.50',
            quoteDate,
          },
        ],
      },
      userA
    );

    expect(report.success).toBe(true);

    const rows = await db
      .select()
      .from(marketQuotes)
      .where(eq(marketQuotes.assetId, globalPetr4Id));

    expect(rows).toHaveLength(1);
    expect(rows[0].price).toBe('37.50000000');
  });

  it('7. reingestão na mesma data deve ser idempotente (ON CONFLICT DO UPDATE)', async () => {
    const quoteDate = '2026-08-18T18:00:00.000Z';

    // 1ª execução
    await ingestMarketDataPayload(
      {
        quotes: [
          {
            ticker: 'PETR4_ING',
            price: '38.00',
            quoteDate,
          },
        ],
      },
      userA
    );

    // 2ª execução com atualização
    const report = await ingestMarketDataPayload(
      {
        quotes: [
          {
            ticker: 'PETR4_ING',
            price: '40.00',
            quoteDate,
          },
        ],
      },
      userA
    );

    expect(report.success).toBe(true);

    const rows = await db
      .select()
      .from(marketQuotes)
      .where(eq(marketQuotes.assetId, globalPetr4Id));

    expect(rows).toHaveLength(1);
    expect(rows[0].price).toBe('40.00000000');
  });

  it('8. cotação antiga não substitui a mais recente no histórico', async () => {
    // Cotação D-0 (recente)
    await ingestMarketDataPayload(
      {
        quotes: [
          {
            ticker: 'PETR4_ING',
            price: '50.00',
            quoteDate: '2026-08-18T18:00:00.000Z',
          },
        ],
      },
      userA
    );

    // Cotação D-5 (antiga/retroativa)
    await ingestMarketDataPayload(
      {
        quotes: [
          {
            ticker: 'PETR4_ING',
            price: '42.00',
            quoteDate: '2026-08-13T18:00:00.000Z',
          },
        ],
      },
      userA
    );

    // Cria carteira e valida se o valuation usará a cotação mais recente (50.00)
    const portfolio = await createPortfolio(
      {
        name: 'Carteira History Ingest Test',
        baseCurrency: 'BRL',
      },
      userA
    );

    await createPortfolioEvent(
      {
        portfolioId: portfolio.id,
        assetId: globalPetr4Id,
        type: 'BUY',
        tradeDate: '2026-08-10T12:00:00.000Z',
        quantity: '10',
        unitPrice: '40.00',
        fees: '0.00',
      },
      userA
    );

    const summary = await getPortfolioPositions(portfolio.id, userA);
    expect(summary.positions[0].marketPrice?.toString()).toBe('50');
    expect(summary.positions[0].marketValue?.toString()).toBe('500');
  });

  it('9. deve ingerir com sucesso via provider mock desacoplado', async () => {
    const mockProvider = new MockMarketDataProviderAdapter({
      PETR4_ING: '41.25',
    });

    const report = await ingestFromProvider(
      mockProvider,
      {
        tickers: ['PETR4_ING'],
        targetDate: new Date('2026-08-18T18:00:00.000Z'),
      },
      userA
    );

    expect(report.success).toBe(true);
    expect(report.quotesSummary.succeeded).toBe(1);

    const [row] = await db
      .select()
      .from(marketQuotes)
      .where(eq(marketQuotes.assetId, globalPetr4Id));

    expect(row.price).toBe('41.25000000');
    expect(row.source).toBe('mock_provider');
  });

  it('10. deve ingerir cotação fornecendo apenas assetId sem ticker', async () => {
    const report = await ingestMarketDataPayload(
      {
        quotes: [
          {
            assetId: globalVale3Id,
            price: '64.50',
            quoteDate: '2026-08-18T18:00:00.000Z',
          },
        ],
      },
      userA
    );

    expect(report.success).toBe(true);
    expect(report.quotesSummary.succeeded).toBe(1);

    const [row] = await db
      .select()
      .from(marketQuotes)
      .where(eq(marketQuotes.assetId, globalVale3Id));

    expect(row.price).toBe('64.50000000');
  });

  it('11. deve validar consistência quando assetId e ticker forem fornecidos conjuntamente', async () => {
    // Inconsistente: assetId de VALE3 com ticker PETR4
    const reportMismatch = await ingestMarketDataPayload(
      {
        quotes: [
          {
            assetId: globalVale3Id,
            ticker: 'PETR4_ING',
            price: '65.00',
            quoteDate: '2026-08-18T18:00:00.000Z',
          },
        ],
      },
      userA
    );

    expect(reportMismatch.success).toBe(false);
    expect(reportMismatch.quotesSummary.failed).toBe(1);
    expect(reportMismatch.quotesSummary.items[0].errorCode).toBe('ASSET_MISMATCH');

    // Consistente: assetId de VALE3 com ticker VALE3_ING
    const reportMatch = await ingestMarketDataPayload(
      {
        quotes: [
          {
            assetId: globalVale3Id,
            ticker: 'VALE3_ING',
            price: '65.00',
            quoteDate: '2026-08-18T18:00:00.000Z',
          },
        ],
      },
      userA
    );

    expect(reportMatch.success).toBe(true);
    expect(reportMatch.quotesSummary.succeeded).toBe(1);
  });

  it('12. deve validar compatibilidade de moeda e mercado com o ativo cadastrado', async () => {
    // Moeda incompatível: PETR4_ING é BRL, payload envia USD
    const reportCurrencyMismatch = await ingestMarketDataPayload(
      {
        quotes: [
          {
            ticker: 'PETR4_ING',
            price: '38.50',
            currency: 'USD',
            quoteDate: '2026-08-18T18:00:00.000Z',
          },
        ],
      },
      userA
    );

    expect(reportCurrencyMismatch.success).toBe(false);
    expect(reportCurrencyMismatch.quotesSummary.failed).toBe(1);
    expect(reportCurrencyMismatch.quotesSummary.items[0].errorCode).toBe('CURRENCY_MISMATCH');

    // Mercado incompatível: PETR4_ING é B3, payload envia NYSE
    const reportMarketMismatch = await ingestMarketDataPayload(
      {
        quotes: [
          {
            ticker: 'PETR4_ING',
            price: '38.50',
            currency: 'BRL',
            market: 'NYSE',
            quoteDate: '2026-08-18T18:00:00.000Z',
          },
        ],
      },
      userA
    );

    expect(reportMarketMismatch.success).toBe(false);
    expect(reportMarketMismatch.quotesSummary.failed).toBe(1);
    expect(reportMarketMismatch.quotesSummary.items[0].errorCode).toBe('MARKET_MISMATCH');
  });

  it('13. deve aplicar política de qualidade rejeitando downgrade e permitindo upgrade ou mesma qualidade', async () => {
    const quoteDate = '2026-08-18T18:00:00.000Z';

    // 1. Cadastra cotação com delayStatus 'eod' (Rank 3)
    await ingestMarketDataPayload(
      {
        quotes: [
          {
            ticker: 'PETR4_ING',
            price: '38.00',
            quoteDate,
            delayStatus: 'eod',
          },
        ],
      },
      userA
    );

    // 2. Tenta sobrescrever na mesma data com delayStatus 'manual' (Rank 2) -> Rejeição
    const reportDowngrade = await ingestMarketDataPayload(
      {
        quotes: [
          {
            ticker: 'PETR4_ING',
            price: '39.00',
            quoteDate,
            delayStatus: 'manual',
          },
        ],
      },
      userA
    );

    expect(reportDowngrade.success).toBe(false);
    expect(reportDowngrade.quotesSummary.failed).toBe(1);
    expect(reportDowngrade.quotesSummary.items[0].errorCode).toBe('QUALITY_DOWNGRADE_REJECTED');

    // Valor permanece o anterior (38.00)
    let [row] = await db
      .select()
      .from(marketQuotes)
      .where(eq(marketQuotes.assetId, globalPetr4Id));
    expect(row.price).toBe('38.00000000');
    expect(row.delayStatus).toBe('eod');

    // 3. Atualização com mesma qualidade 'eod' -> Permitida
    const reportSameQuality = await ingestMarketDataPayload(
      {
        quotes: [
          {
            ticker: 'PETR4_ING',
            price: '40.00',
            quoteDate,
            delayStatus: 'eod',
          },
        ],
      },
      userA
    );

    expect(reportSameQuality.success).toBe(true);
    [row] = await db
      .select()
      .from(marketQuotes)
      .where(eq(marketQuotes.assetId, globalPetr4Id));
    expect(row.price).toBe('40.00000000');
  });

  it('14. deve executar simulação completa em dryRun sem persistir cotações, câmbio ou auditoria', async () => {
    const initialQuotes = await db.select().from(marketQuotes);
    const initialRates = await db.select().from(exchangeRates);
    const initialAudit = await db.select().from(auditLogs);

    const report = await ingestMarketDataPayload(
      {
        quotes: [
          {
            ticker: 'PETR4_ING',
            price: '42.50',
            quoteDate: '2026-08-18T18:00:00.000Z',
          },
        ],
        exchangeRates: [
          {
            fromCurrency: 'USD',
            toCurrency: 'BRL',
            rate: '5.50',
            rateDate: '2026-08-18T18:00:00.000Z',
          },
        ],
      },
      userA,
      { dryRun: true }
    );

    expect(report.dryRun).toBe(true);
    expect(report.success).toBe(true);
    expect(report.quotesSummary.succeeded).toBe(1);
    expect(report.exchangeRatesSummary.succeeded).toBe(1);

    const postQuotes = await db.select().from(marketQuotes);
    const postRates = await db.select().from(exchangeRates);
    const postAudit = await db.select().from(auditLogs);

    expect(postQuotes.length).toBe(initialQuotes.length);
    expect(postRates.length).toBe(initialRates.length);
    expect(postAudit.length).toBe(initialAudit.length);
  });
});
