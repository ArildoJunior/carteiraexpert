import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'node:crypto';
import { db } from '@/lib/db';
import { b3CotahistBatches, b3HistoricalQuotes } from '@/lib/db/schema/b3-market-data';
import { marketQuotes } from '@/lib/db/schema/market-data';
import { users } from '@/lib/db/schema/identity';
import { assets } from '@/lib/db/schema/portfolio';
import {
  getLatestUsableQuote,
  getQuoteAtDate,
  getHistoricalQuotes,
  calculateTickerPeriodVariation,
  getPortfolioValuationQuotes,
} from '@/modules/market-data/server/unified-quote.service';
import type { SafeUser } from '@/modules/identity/domain/user.types';

describe('Integration — UnifiedQuoteService', () => {
  let testUser: SafeUser;
  let petr4AssetId: string;
  let bbdc4AssetId: string;
  let batchId: string;

  const tickerPetr = `PTR_${Date.now().toString().slice(-4)}`;
  const tickerBbdc = `BBD_${Date.now().toString().slice(-4)}`;

  beforeAll(async () => {
    // 1. Cria usuário de teste
    const userId = crypto.randomUUID();
    const userEmail = `unified_test_${Date.now()}@carteiraexpert.test`;
    await db.insert(users).values({
      id: userId,
      email: userEmail,
      name: 'Testador Cotação Unificada',
      passwordHash: 'hash_test_123',
      status: 'active',
    });

    testUser = {
      id: userId,
      email: userEmail,
      name: 'Testador Cotação Unificada',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // 2. Cria lote de auditoria
    batchId = crypto.randomUUID();
    await db.insert(b3CotahistBatches).values({
      id: batchId,
      fileName: `COTAHIST_D_${Date.now()}.ZIP`,
      fileType: 'daily',
      fileSize: 1024,
      sha256: crypto.randomBytes(32).toString('hex'),
      storagePath: '/mock/cotahist.zip',
      status: 'COMPLETED',
      totalLines: 3,
      acceptedRecords: 3,
    });

    // 3. Insere cotações históricas controladas para o teste com IDs e hashes únicos
    await db.insert(b3HistoricalQuotes).values([
      {
        id: crypto.randomUUID(),
        batchId,
        ticker: tickerPetr,
        tradeDate: '2026-08-26',
        bdiCode: '02',
        marketType: 10,
        shortName: 'PETROBRAS',
        specification: 'PN N2',
        currency: 'BRL',
        openPrice: '41.14',
        highPrice: '42.27',
        lowPrice: '40.97',
        averagePrice: '41.50',
        closePrice: '41.45',
        quantity: '74631000',
        financialVolume: '3110528270.00',
        tradeCount: 59151,
        recordHash: crypto.randomBytes(32).toString('hex'),
      },
      {
        id: crypto.randomUUID(),
        batchId,
        ticker: tickerPetr,
        tradeDate: '2026-08-25',
        bdiCode: '02',
        marketType: 10,
        shortName: 'PETROBRAS',
        specification: 'PN N2',
        currency: 'BRL',
        openPrice: '40.50',
        highPrice: '41.20',
        lowPrice: '40.10',
        averagePrice: '40.70',
        closePrice: '40.80',
        quantity: '65000000',
        financialVolume: '2650000000.00',
        tradeCount: 45000,
        recordHash: crypto.randomBytes(32).toString('hex'),
      },
      {
        id: crypto.randomUUID(),
        batchId,
        ticker: tickerBbdc,
        tradeDate: '2026-08-26',
        bdiCode: '02',
        marketType: 10,
        shortName: 'BRADESCO',
        specification: 'PN N1',
        currency: 'BRL',
        openPrice: '16.78',
        highPrice: '17.29',
        lowPrice: '16.76',
        averagePrice: '16.90',
        closePrice: '16.99',
        quantity: '34729800',
        financialVolume: '591886507.00',
        tradeCount: 35601,
        recordHash: crypto.randomBytes(32).toString('hex'),
      },
    ]);

    // 4. Cria ativos correspondentes na tabela assets
    petr4AssetId = crypto.randomUUID();
    await db.insert(assets).values({
      id: petr4AssetId,
      ticker: tickerPetr,
      name: 'Petróleo Brasileiro S.A. Petrobras PN',
      assetType: 'stock',
      market: 'B3',
      currency: 'BRL',
      isCustom: false,
    });

    bbdc4AssetId = crypto.randomUUID();
    await db.insert(assets).values({
      id: bbdc4AssetId,
      ticker: tickerBbdc,
      name: 'Banco Bradesco S.A. PN',
      assetType: 'stock',
      market: 'B3',
      currency: 'BRL',
      isCustom: false,
    });
  });

  it('deve buscar a cotação mais recente para o ticker com fechamento oficial e variação diária', async () => {
    const quote = await getLatestUsableQuote(tickerPetr, db, new Date('2026-08-26T15:00:00Z'));
    expect(quote).not.toBeNull();
    expect(quote?.ticker).toBe(tickerPetr);
    expect(quote?.closePrice.toFixed(2)).toBe('41.45');
    expect(quote?.openPrice?.toFixed(2)).toBe('41.14');
    expect(quote?.highPrice?.toFixed(2)).toBe('42.27');
    expect(quote?.lowPrice?.toFixed(2)).toBe('40.97');
    expect(quote?.source).toBe('cotahist_b3');
    expect(quote?.isOfficialClosing).toBe(true);
    expect(quote?.previousClosePrice?.toFixed(2)).toBe('40.80');
    expect(quote?.dailyVariationPercent).not.toBeNull();
    // (41.45 - 40.80) / 40.80 * 100 = 1.5931...%
    expect(quote?.dailyVariationPercent?.toFixed(2)).toBe('1.59');
  });

  it('deve buscar a cotação mais recente para outro ticker sem misturar dados', async () => {
    const quote = await getLatestUsableQuote(tickerBbdc, db, new Date('2026-08-26T15:00:00Z'));
    expect(quote).not.toBeNull();
    expect(quote?.ticker).toBe(tickerBbdc);
    expect(quote?.closePrice.toFixed(2)).toBe('16.99');
    expect(quote?.openPrice?.toFixed(2)).toBe('16.78');
    expect(quote?.source).toBe('cotahist_b3');
    expect(quote?.isOfficialClosing).toBe(true);
  });

  it('deve retornar null para ticker inexistente sem lançar exceção', async () => {
    const quote = await getLatestUsableQuote('NONEXIST99');
    expect(quote).toBeNull();
  });

  it('deve consultar cotação oficial em data específica via getQuoteAtDate com Date e string', async () => {
    // 1. Data Exata (pregão regular 2026-08-25)
    const quoteDateObj = await getQuoteAtDate(tickerPetr, new Date('2026-08-25T23:59:59Z'));
    expect(quoteDateObj).not.toBeNull();
    expect(quoteDateObj?.ticker).toBe(tickerPetr);
    expect(quoteDateObj?.closePrice.toFixed(2)).toBe('40.80');
    expect(quoteDateObj?.delayStatus).toBe('end_of_day');
    expect(quoteDateObj?.isOfficialClosing).toBe(true);

    // 2. Passando string YYYY-MM-DD
    const quoteDateStr = await getQuoteAtDate(tickerPetr, '2026-08-25');
    expect(quoteDateStr).not.toBeNull();
    expect(quoteDateStr?.ticker).toBe(tickerPetr);
    expect(quoteDateStr?.closePrice.toFixed(2)).toBe('40.80');
    expect(quoteDateStr?.delayStatus).toBe('end_of_day');

    // 3. Passando string ISO
    const quoteIsoStr = await getQuoteAtDate(tickerPetr, '2026-08-25T14:30:00.000Z');
    expect(quoteIsoStr).not.toBeNull();
    expect(quoteIsoStr?.ticker).toBe(tickerPetr);
    expect(quoteIsoStr?.closePrice.toFixed(2)).toBe('40.80');

    // 4. Fim de semana / Domingo (2026-08-30 -> deve retornar o último pregão disponível 2026-08-26)
    const weekendQuote = await getQuoteAtDate(tickerPetr, '2026-08-30');
    expect(weekendQuote).not.toBeNull();
    expect(weekendQuote?.ticker).toBe(tickerPetr);
    expect(weekendQuote?.closePrice.toFixed(2)).toBe('41.45');
    expect(weekendQuote?.isOfficialClosing).toBe(true);

    // 5. Feriado / dia sem pregão intermediário (2026-08-27 -> retorna o pregão anterior 2026-08-26)
    const holidayQuote = await getQuoteAtDate(tickerPetr, '2026-08-27');
    expect(holidayQuote).not.toBeNull();
    expect(holidayQuote?.ticker).toBe(tickerPetr);
    expect(holidayQuote?.closePrice.toFixed(2)).toBe('41.45');

    // 6. Data futura (2027-01-01 -> retorna o último fechamento conhecido com isOutdated: true)
    const futureQuote = await getQuoteAtDate(tickerPetr, '2027-01-01');
    expect(futureQuote).not.toBeNull();
    expect(futureQuote?.ticker).toBe(tickerPetr);
    expect(futureQuote?.closePrice.toFixed(2)).toBe('41.45');
    expect(futureQuote?.isOutdated).toBe(true);
    expect(futureQuote?.dataAgeDays).toBeGreaterThan(0);

    // 7. Data anterior ao histórico (2010-01-01 -> deve retornar estritamente null)
    const beforeHistoryQuote = await getQuoteAtDate(tickerPetr, '2010-01-01');
    expect(beforeHistoryQuote).toBeNull();
  });

  it('deve calcular dataAgeDays deterministicamente para string civil YYYY-MM-DD em fins de semana e mudanças de fuso', async () => {
    // COTAHIST mais recente inserido para PETR4 é na quarta-feira 2026-08-26
    // Quinta 2026-08-27: 1 dia útil de distância -> dataAgeDays: 1
    const quoteThu = await getQuoteAtDate(tickerPetr, '2026-08-27');
    expect(quoteThu?.dataAgeDays).toBe(1);

    // Sexta 2026-08-28: 2 dias úteis de distância -> dataAgeDays: 2
    const quoteFri = await getQuoteAtDate(tickerPetr, '2026-08-28');
    expect(quoteFri?.dataAgeDays).toBe(2);

    // Sábado 2026-08-29: fim de semana não adiciona dia útil adicional -> dataAgeDays: 2
    const quoteSat = await getQuoteAtDate(tickerPetr, '2026-08-29');
    expect(quoteSat?.dataAgeDays).toBe(2);

    // Domingo 2026-08-30: fim de semana não adiciona dia útil adicional -> dataAgeDays: 2
    const quoteSun = await getQuoteAtDate(tickerPetr, '2026-08-30');
    expect(quoteSun?.dataAgeDays).toBe(2);

    // Segunda 2026-08-31: próximo dia útil -> dataAgeDays: 3
    const quoteMon = await getQuoteAtDate(tickerPetr, '2026-08-31');
    expect(quoteMon?.dataAgeDays).toBe(3);

    // Teste de ISO com timezone UTC vs fuso de São Paulo
    // '2026-08-26T02:00:00Z' é 2026-08-25T23:00:00 em America/Sao_Paulo (dia 2026-08-25 na B3)
    const quoteB3Timezone = await getQuoteAtDate(tickerPetr, '2026-08-26T02:00:00Z');
    expect(quoteB3Timezone?.closePrice.toFixed(2)).toBe('40.80'); // Cotação de 2026-08-25
  });

  it('deve retornar série histórica em ordem cronológica ascendente (ASC)', async () => {
    const series = await getHistoricalQuotes(tickerPetr);
    expect(series.length).toBe(2);
    expect(series[0].closePrice.toFixed(2)).toBe('40.80'); // 2026-08-25 primeiro
    expect(series[1].closePrice.toFixed(2)).toBe('41.45'); // 2026-08-26 segundo
    expect(series[0].tradeDate.getTime()).toBeLessThan(series[1].tradeDate.getTime());
  });

  it('deve calcular variações e extremos do período via calculateTickerPeriodVariation', async () => {
    const variation = await calculateTickerPeriodVariation(
      tickerPetr,
      new Date('2026-08-25T00:00:00Z'),
      new Date('2026-08-26T23:59:59Z')
    );

    expect(variation).not.toBeNull();
    expect(variation?.ticker).toBe(tickerPetr);
    expect(variation?.initialPrice.toFixed(2)).toBe('40.80');
    expect(variation?.finalPrice.toFixed(2)).toBe('41.45');
    expect(variation?.periodHigh.toFixed(2)).toBe('42.27');
    expect(variation?.periodLow.toFixed(2)).toBe('40.10');
    expect(variation?.quoteCount).toBe(2);
    expect(variation?.periodVariationPercent.toFixed(2)).toBe('1.59');
  });

  it('deve retornar cotações de valuation para múltiplos ativos na carteira sem compartilhamento de dados', async () => {
    const quotesMap = await getPortfolioValuationQuotes(
      [petr4AssetId, bbdc4AssetId],
      testUser
    );

    expect(quotesMap.size).toBe(2);

    const petr4Quote = quotesMap.get(petr4AssetId);
    expect(petr4Quote).toBeDefined();
    expect(petr4Quote?.price.toFixed(2)).toBe('41.45');
    expect(petr4Quote?.source).toBe('cotahist_b3');
    expect(petr4Quote?.delayStatus).toBe('eod');

    const bbdc4Quote = quotesMap.get(bbdc4AssetId);
    expect(bbdc4Quote).toBeDefined();
    expect(bbdc4Quote?.price.toFixed(2)).toBe('16.99');
    expect(bbdc4Quote?.source).toBe('cotahist_b3');
    expect(bbdc4Quote?.delayStatus).toBe('eod');

    // Garante que os preços são distintos e rigorosamente segregados
    expect(petr4Quote?.price.equals(bbdc4Quote?.price!)).toBe(false);
  });

  it('deve selecionar exclusivamente a cotação do ativo público em getLatestUsableQuote mesmo em colisão de ticker com ativo customizado', async () => {
    const deterministicTradingDay = new Date('2026-08-26T15:00:00Z'); // Quarta-feira 12:00 SP
    const collisionTicker = `UQCOLIS_${Date.now().toString().slice(-4)}`;
    const publicAssetUuid = crypto.randomUUID();
    const privateAssetUuid = crypto.randomUUID();

    // 1. Cria ativo público e ativo privado de usuário com o mesmo ticker
    await db.insert(assets).values([
      {
        id: publicAssetUuid,
        ticker: collisionTicker,
        name: 'Ativo Público Oficial',
        assetType: 'stock',
        market: 'B3',
        currency: 'BRL',
        isCustom: false,
        userId: null,
      },
      {
        id: privateAssetUuid,
        ticker: collisionTicker,
        name: 'Ativo Privado Customizado',
        assetType: 'custom',
        market: 'CUSTOM',
        currency: 'BRL',
        isCustom: true,
        userId: testUser.id,
      },
    ]);

    // 2. Insere cotações com preços distintos em market_quotes para o pregão de 2026-08-26
    await db.insert(marketQuotes).values([
      {
        id: crypto.randomUUID(),
        assetId: publicAssetUuid,
        price: '100.50',
        currency: 'BRL',
        quoteDate: deterministicTradingDay,
        source: 'market_quotes',
        delayStatus: 'realtime',
        createdBy: testUser.id,
        createdAt: deterministicTradingDay,
        updatedAt: deterministicTradingDay,
      },
      {
        id: crypto.randomUUID(),
        assetId: privateAssetUuid,
        price: '999.99', // Preço falso do ativo privado
        currency: 'BRL',
        quoteDate: deterministicTradingDay,
        source: 'market_quotes',
        delayStatus: 'realtime',
        createdBy: testUser.id,
        createdAt: deterministicTradingDay,
        updatedAt: deterministicTradingDay,
      },
    ]);

    // 3. Executa getLatestUsableQuote com data determinística
    const quote = await getLatestUsableQuote(collisionTicker, db, deterministicTradingDay);

    expect(quote).not.toBeNull();
    expect(quote?.ticker).toBe(collisionTicker);
    // Deve selecionar ESTRITAMENTE a cotação do ativo público (100.50) e NUNCA a do privado (999.99)
    expect(quote?.closePrice.toFixed(2)).toBe('100.50');
    expect(quote?.delayStatus).toBe('real_time');
    expect(quote?.isOutdated).toBe(false);

    // 4. Cenário inverso: se houver APENAS o ativo privado com cotação em market_quotes, não deve retornar a cotação privada
    const onlyPrivateTicker = `ONLYPRIV_${Date.now().toString().slice(-4)}`;
    const onlyPrivateAssetUuid = crypto.randomUUID();

    await db.insert(assets).values({
      id: onlyPrivateAssetUuid,
      ticker: onlyPrivateTicker,
      name: 'Ativo Puramente Privado',
      assetType: 'custom',
      market: 'CUSTOM',
      currency: 'BRL',
      isCustom: true,
      userId: testUser.id,
    });

    await db.insert(marketQuotes).values({
      id: crypto.randomUUID(),
      assetId: onlyPrivateAssetUuid,
      price: '555.55',
      currency: 'BRL',
      quoteDate: deterministicTradingDay,
      source: 'market_quotes',
      delayStatus: 'realtime',
      createdBy: testUser.id,
      createdAt: deterministicTradingDay,
      updatedAt: deterministicTradingDay,
    });

    const hiddenQuote = await getLatestUsableQuote(onlyPrivateTicker, db, deterministicTradingDay);
    // Como não há ativo público nem cotação COTAHIST, deve retornar null
    expect(hiddenQuote).toBeNull();
  });

  it('deve aceitar cotação de sexta-feira como atual quando consultada durante o sábado e o domingo', async () => {
    const weekendTicker = `WKND_${Date.now().toString().slice(-4)}`;
    const assetUuid = crypto.randomUUID();

    await db.insert(assets).values({
      id: assetUuid,
      ticker: weekendTicker,
      name: 'Ativo Weekend Test',
      assetType: 'stock',
      market: 'B3',
      currency: 'BRL',
      isCustom: false,
      userId: null,
    });

    const fridayQuoteTime = new Date('2026-08-28T19:30:00Z'); // Sexta-feira 16:30 SP
    await db.insert(marketQuotes).values({
      id: crypto.randomUUID(),
      assetId: assetUuid,
      price: '52.75',
      currency: 'BRL',
      quoteDate: fridayQuoteTime,
      source: 'market_quotes',
      delayStatus: 'realtime',
      createdBy: testUser.id,
      createdAt: fridayQuoteTime,
      updatedAt: fridayQuoteTime,
    });

    // 1. Consulta durante o Sábado (2026-08-29 14:00 SP)
    const saturdayTime = new Date('2026-08-29T17:00:00Z');
    const quoteSaturday = await getLatestUsableQuote(weekendTicker, db, saturdayTime);

    expect(quoteSaturday).not.toBeNull();
    expect(quoteSaturday?.closePrice.toFixed(2)).toBe('52.75');
    expect(quoteSaturday?.dataAgeDays).toBe(0);
    expect(quoteSaturday?.isOutdated).toBe(false);
    expect(quoteSaturday?.delayStatus).toBe('real_time');

    // 2. Consulta durante o Domingo (2026-08-30 18:00 SP)
    const sundayTime = new Date('2026-08-30T21:00:00Z');
    const quoteSunday = await getLatestUsableQuote(weekendTicker, db, sundayTime);

    expect(quoteSunday).not.toBeNull();
    expect(quoteSunday?.closePrice.toFixed(2)).toBe('52.75');
    expect(quoteSunday?.dataAgeDays).toBe(0);
    expect(quoteSunday?.isOutdated).toBe(false);
    expect(quoteSunday?.delayStatus).toBe('real_time');
  });

  it('não deve aceitar cotação antiga marcada como realtime ou delayed_15m como atual', async () => {
    const oldQuoteTicker = `OLDQ_${Date.now().toString().slice(-4)}`;
    const assetUuid = crypto.randomUUID();

    await db.insert(assets).values({
      id: assetUuid,
      ticker: oldQuoteTicker,
      name: 'Ativo Antigo Sem Pregão Atual',
      assetType: 'stock',
      market: 'B3',
      currency: 'BRL',
      isCustom: false,
      userId: null,
    });

    // Cotação antiga da segunda-feira 2026-08-24
    const mondayQuoteTime = new Date('2026-08-24T18:00:00Z');
    await db.insert(marketQuotes).values({
      id: crypto.randomUUID(),
      assetId: assetUuid,
      price: '33.20',
      currency: 'BRL',
      quoteDate: mondayQuoteTime,
      source: 'market_quotes',
      delayStatus: 'realtime',
      createdBy: testUser.id,
      createdAt: mondayQuoteTime,
      updatedAt: mondayQuoteTime,
    });

    // Consulta realizada na quarta-feira 2026-08-26
    const wednesdayTime = new Date('2026-08-26T18:00:00Z');
    const quoteWed = await getLatestUsableQuote(oldQuoteTicker, db, wednesdayTime);

    // Como não há COTAHIST, cai no fallback antigo com isOutdated: true e dataAgeDays: 2
    expect(quoteWed).not.toBeNull();
    expect(quoteWed?.closePrice.toFixed(2)).toBe('33.20');
    expect(quoteWed?.isOutdated).toBe(true);
    expect(quoteWed?.dataAgeDays).toBe(2);
    expect(quoteWed?.delayStatus).toBe('real_time');
  });

  it('deve aceitar cotação do pregão atual em market_quotes e priorizar COTAHIST na ausência de intraday recente', async () => {
    const mixedTicker = `MIXT_${Date.now().toString().slice(-4)}`;
    const assetUuid = crypto.randomUUID();

    await db.insert(assets).values({
      id: assetUuid,
      ticker: mixedTicker,
      name: 'Ativo Misto Cotahist e MarketQuotes',
      assetType: 'stock',
      market: 'B3',
      currency: 'BRL',
      isCustom: false,
      userId: null,
    });

    // Fechamento oficial COTAHIST da terça-feira 2026-08-25
    await db.insert(b3HistoricalQuotes).values({
      id: crypto.randomUUID(),
      batchId,
      ticker: mixedTicker,
      tradeDate: '2026-08-25',
      bdiCode: '02',
      marketType: 10,
      shortName: 'ATIVO MISTO',
      specification: 'ON',
      currency: 'BRL',
      openPrice: '68.50',
      highPrice: '71.00',
      lowPrice: '68.00',
      averagePrice: '69.80',
      closePrice: '70.00',
      quantity: '1000000',
      financialVolume: '70000000.00',
      tradeCount: 1500,
      recordHash: crypto.randomBytes(32).toString('hex'),
    });

    // 1. Consulta na quarta-feira 2026-08-26 antes de haver cotação intraday
    const wednesdayTime = new Date('2026-08-26T15:00:00Z');
    const cotahistFallback = await getLatestUsableQuote(mixedTicker, db, wednesdayTime);

    expect(cotahistFallback).not.toBeNull();
    expect(cotahistFallback?.closePrice.toFixed(2)).toBe('70.00');
    expect(cotahistFallback?.source).toBe('cotahist_b3');
    expect(cotahistFallback?.delayStatus).toBe('end_of_day');
    expect(cotahistFallback?.isOfficialClosing).toBe(true);
    expect(cotahistFallback?.isOutdated).toBe(true);
    expect(cotahistFallback?.dataAgeDays).toBe(1);

    // 2. Insere cotação intraday no pregão de quarta-feira 2026-08-26
    const wednesdayQuoteTime = new Date('2026-08-26T14:30:00Z');
    await db.insert(marketQuotes).values({
      id: crypto.randomUUID(),
      assetId: assetUuid,
      price: '72.50',
      currency: 'BRL',
      quoteDate: wednesdayQuoteTime,
      source: 'market_quotes',
      delayStatus: 'delayed',
      createdBy: testUser.id,
      createdAt: wednesdayQuoteTime,
      updatedAt: wednesdayQuoteTime,
    });

    // 3. Agora a cotação intraday da quarta-feira deve assumir a Prioridade 1
    const intradayActiveQuote = await getLatestUsableQuote(mixedTicker, db, wednesdayTime);

    expect(intradayActiveQuote).not.toBeNull();
    expect(intradayActiveQuote?.closePrice.toFixed(2)).toBe('72.50');
    expect(intradayActiveQuote?.source).toBe('market_quotes');
    expect(intradayActiveQuote?.isOfficialClosing).toBe(false);
    expect(intradayActiveQuote?.isOutdated).toBe(false);
    expect(intradayActiveQuote?.dataAgeDays).toBe(0);
    expect(intradayActiveQuote?.delayStatus).toBe('delayed');
  });
});
