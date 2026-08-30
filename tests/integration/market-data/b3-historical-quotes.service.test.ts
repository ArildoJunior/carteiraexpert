import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'node:crypto';
import { db } from '../../../src/lib/db';
import { b3CotahistBatches, b3HistoricalQuotes } from '../../../src/lib/db/schema/b3-market-data';
import { getB3HistoricalQuotes } from '../../../src/modules/market-data/server/b3-historical-quotes.service';

describe('b3-historical-quotes.service (Integração PostgreSQL)', () => {
  const batchId = crypto.randomUUID();
  const testTicker = `TEST${Date.now().toString().slice(-4)}`;

  beforeAll(async () => {
    // Insere lote e cotações de teste para validar consulta isolada
    await db.insert(b3CotahistBatches).values({
      id: batchId,
      fileName: 'COTAHIST_TEST_QUOTES.ZIP',
      fileType: 'daily',
      referenceDate: '2026-08-26',
      referenceYear: 2026,
      fileSize: 1024,
      sha256: crypto.randomBytes(32).toString('hex'),
      storagePath: '/test/storage/path.zip',
      status: 'COMPLETED',
      totalLines: 3,
      headerCount: 1,
      quoteCount: 2,
      trailerCount: 1,
      acceptedRecords: 2,
      rejectedRecords: 0,
      recordsRead: 2,
      recordsAccepted: 2,
      recordsInserted: 2,
      recordsConflicted: 0,
      recordsRejected: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await db.insert(b3HistoricalQuotes).values([
      {
        id: crypto.randomUUID(),
        batchId,
        tradeDate: '2026-08-25',
        bdiCode: '02',
        ticker: testTicker,
        marketType: 10,
        shortName: 'TEST CORP',
        specification: 'ON',
        currency: 'BRL',
        openPrice: '10.00000000',
        highPrice: '10.50000000',
        lowPrice: '9.80000000',
        averagePrice: '10.20000000',
        closePrice: '10.40000000',
        tradeCount: 100,
        quantity: '50000.0000000000',
        financialVolume: '510000.0000000000',
        quotationFactor: 1,
        recordHash: crypto.randomBytes(32).toString('hex'),
        createdAt: new Date(),
      },
      {
        id: crypto.randomUUID(),
        batchId,
        tradeDate: '2026-08-26',
        bdiCode: '02',
        ticker: testTicker,
        marketType: 10,
        shortName: 'TEST CORP',
        specification: 'ON',
        currency: 'BRL',
        openPrice: '10.40000000',
        highPrice: '11.00000000',
        lowPrice: '10.30000000',
        averagePrice: '10.70000000',
        closePrice: '10.90000000',
        tradeCount: 150,
        quantity: '75000.0000000000',
        financialVolume: '802500.0000000000',
        quotationFactor: 1,
        recordHash: crypto.randomBytes(32).toString('hex'),
        createdAt: new Date(),
      },
    ]);
  });

  it('deve consultar cotações históricas reais com paginação e ordenação descrescente padrão', async () => {
    const result = await getB3HistoricalQuotes({ ticker: testTicker });

    expect(result.ticker).toBe(testTicker);
    expect(result.totalCount).toBe(2);
    expect(result.quotes.length).toBe(2);
    expect(result.quotes[0].tradeDate).toBe('2026-08-26');
    expect(result.quotes[0].closePrice).toBe('10.90000000');
    expect(result.quotes[1].tradeDate).toBe('2026-08-25');
    expect(result.quotes[1].closePrice).toBe('10.40000000');
  });

  it('deve filtrar por intervalo de datas no PostgreSQL', async () => {
    const result = await getB3HistoricalQuotes({
      ticker: testTicker,
      startDate: '2026-08-26',
      endDate: '2026-08-26',
    });

    expect(result.totalCount).toBe(1);
    expect(result.quotes.length).toBe(1);
    expect(result.quotes[0].tradeDate).toBe('2026-08-26');
  });

  it('deve retornar estrutura vazia para ticker inexistente sem gerar erro no banco', async () => {
    const result = await getB3HistoricalQuotes({ ticker: 'NONEXIST_XYZ99' });

    expect(result.totalCount).toBe(0);
    expect(result.quotes.length).toBe(0);
    expect(result.totalPages).toBe(1);
  });
});
