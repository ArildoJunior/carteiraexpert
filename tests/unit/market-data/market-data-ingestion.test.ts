import { describe, it, expect } from 'vitest';
import { Decimal } from '@/lib/decimal';
import {
  ingestQuoteItemSchema,
  ingestExchangeRateItemSchema,
  ingestMarketDataPayloadSchema,
} from '../../../src/modules/market-data/domain/market-data.schema';
import { ManualPayloadAdapter } from '../../../src/modules/market-data/server/adapters/manual-payload.adapter';
import { MockMarketDataProviderAdapter } from '../../../src/modules/market-data/server/adapters/mock-provider.adapter';
import { ingestFromProvider } from '../../../src/modules/market-data/server/market-data-ingestion.service';
import type { SafeUser } from '../../../src/modules/identity/domain/user.types';

describe('Unitário: Ingestão de Market Data e Câmbio (Schemas e Adaptadores)', () => {
  describe('Validação de Cotações (ingestQuoteItemSchema)', () => {
    it('deve aceitar payload válido de cotação com normalização de moeda e delayStatus manual', () => {
      const parsed = ingestQuoteItemSchema.parse({
        ticker: 'petr4',
        price: '38.50000000',
        currency: 'brl',
        quoteDate: '2026-08-18T12:00:00.000Z',
        source: 'manual',
        delayStatus: 'manual',
      });

      expect(parsed.ticker).toBe('petr4');
      expect(parsed.price).toBeInstanceOf(Decimal);
      expect(parsed.price.toString()).toBe('38.5');
      expect(parsed.currency).toBe('BRL');
      expect(parsed.delayStatus).toBe('manual');
    });

    it('deve aceitar cotação fornecendo apenas assetId (UUID válido) sem ticker', () => {
      const validUuid = '123e4567-e89b-12d3-a456-426614174000';
      const parsed = ingestQuoteItemSchema.parse({
        assetId: validUuid,
        price: '38.50',
        quoteDate: '2026-08-18T12:00:00.000Z',
      });

      expect(parsed.assetId).toBe(validUuid);
      expect(parsed.ticker).toBeUndefined();
    });

    it('deve aceitar cotação fornecendo ambos assetId e ticker', () => {
      const validUuid = '123e4567-e89b-12d3-a456-426614174000';
      const parsed = ingestQuoteItemSchema.parse({
        assetId: validUuid,
        ticker: 'PETR4',
        price: '38.50',
        quoteDate: '2026-08-18T12:00:00.000Z',
      });

      expect(parsed.assetId).toBe(validUuid);
      expect(parsed.ticker).toBe('PETR4');
    });

    it('deve rejeitar cotação sem assetId e sem ticker', () => {
      expect(() =>
        ingestQuoteItemSchema.parse({
          price: '38.50',
          quoteDate: '2026-08-18T12:00:00.000Z',
        })
      ).toThrow(/pelo menos assetId ou ticker/);
    });

    it('deve fazer trim do ticker e rejeitar ticker vazio ou composto apenas por espaços', () => {
      expect(() =>
        ingestQuoteItemSchema.parse({
          ticker: '',
          price: '38.50',
          quoteDate: '2026-08-18T12:00:00.000Z',
        })
      ).toThrow();

      expect(() =>
        ingestQuoteItemSchema.parse({
          ticker: '   ',
          price: '38.50',
          quoteDate: '2026-08-18T12:00:00.000Z',
        })
      ).toThrow();
    });

    it('deve rejeitar preço ausente, zero, negativo, NaN e tipo number puro', () => {
      // Zero
      expect(() =>
        ingestQuoteItemSchema.parse({
          ticker: 'PETR4',
          price: '0.00',
          quoteDate: '2026-08-18T12:00:00.000Z',
        })
      ).toThrow();

      // Negativo
      expect(() =>
        ingestQuoteItemSchema.parse({
          ticker: 'PETR4',
          price: '-10.50',
          quoteDate: '2026-08-18T12:00:00.000Z',
        })
      ).toThrow();

      // NaN / string inválida
      expect(() =>
        ingestQuoteItemSchema.parse({
          ticker: 'PETR4',
          price: 'abc',
          quoteDate: '2026-08-18T12:00:00.000Z',
        })
      ).toThrow();

      // Number puro JS (proibição estrita)
      expect(() =>
        ingestQuoteItemSchema.parse({
          ticker: 'PETR4',
          price: 38.5 as unknown as string,
          quoteDate: '2026-08-18T12:00:00.000Z',
        })
      ).toThrow();
    });

    it('deve rejeitar data futura', () => {
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000 * 2);
      expect(() =>
        ingestQuoteItemSchema.parse({
          ticker: 'PETR4',
          price: '38.50',
          quoteDate: tomorrow.toISOString(),
        })
      ).toThrow(/futura/);
    });

    it('deve rejeitar delayStatus "realtime" para entrada manual', () => {
      expect(() =>
        ingestQuoteItemSchema.parse({
          ticker: 'PETR4',
          price: '38.50',
          quoteDate: '2026-08-18T12:00:00.000Z',
          delayStatus: 'realtime' as unknown as 'manual',
        })
      ).toThrow(/realtime/);
    });
  });

  describe('Validação de Taxas de Câmbio (ingestExchangeRateItemSchema)', () => {
    it('deve aceitar payload válido de câmbio com normalização de moedas para maiúsculas', () => {
      const parsed = ingestExchangeRateItemSchema.parse({
        fromCurrency: 'usd',
        toCurrency: 'brl',
        rate: '5.42000000',
        rateDate: '2026-08-18T12:00:00.000Z',
      });

      expect(parsed.fromCurrency).toBe('USD');
      expect(parsed.toCurrency).toBe('BRL');
      expect(parsed.rate).toBeInstanceOf(Decimal);
      expect(parsed.rate.toFixed(4)).toBe('5.4200');
    });

    it('deve rejeitar pares cambiais com moedas iguais (fromCurrency === toCurrency)', () => {
      expect(() =>
        ingestExchangeRateItemSchema.parse({
          fromCurrency: 'USD',
          toCurrency: 'USD',
          rate: '1.00',
          rateDate: '2026-08-18T12:00:00.000Z',
        })
      ).toThrow(/distintas/);

      expect(() =>
        ingestExchangeRateItemSchema.parse({
          fromCurrency: 'brl',
          toCurrency: 'BRL',
          rate: '1.00',
          rateDate: '2026-08-18T12:00:00.000Z',
        })
      ).toThrow(/distintas/);
    });

    it('deve rejeitar taxa ausente, zero, negativa ou inválida', () => {
      expect(() =>
        ingestExchangeRateItemSchema.parse({
          fromCurrency: 'USD',
          rate: '0',
          rateDate: '2026-08-18T12:00:00.000Z',
        })
      ).toThrow();

      expect(() =>
        ingestExchangeRateItemSchema.parse({
          fromCurrency: 'USD',
          rate: '-5.40',
          rateDate: '2026-08-18T12:00:00.000Z',
        })
      ).toThrow();
    });

    it('deve rejeitar delayStatus "realtime" para taxa cambial manual', () => {
      expect(() =>
        ingestExchangeRateItemSchema.parse({
          fromCurrency: 'USD',
          toCurrency: 'BRL',
          rate: '5.42',
          rateDate: '2026-08-18T12:00:00.000Z',
          delayStatus: 'realtime' as unknown as 'manual',
        })
      ).toThrow(/realtime/);
    });
  });

  describe('Adaptador de Payload Manual (ManualPayloadAdapter)', () => {
    it('deve filtrar cotações por ticker e taxas por par', async () => {
      const adapter = new ManualPayloadAdapter({
        quotes: [
          {
            ticker: 'PETR4',
            price: new Decimal('38.50'),
            quoteDate: new Date('2026-08-18T12:00:00Z'),
          },
          {
            ticker: 'VALE3',
            price: new Decimal('62.10'),
            quoteDate: new Date('2026-08-18T12:00:00Z'),
          },
        ],
        exchangeRates: [
          {
            fromCurrency: 'USD',
            toCurrency: 'BRL',
            rate: new Decimal('5.42'),
            rateDate: new Date('2026-08-18T12:00:00Z'),
          },
        ],
      });

      const quotesAll = await adapter.fetchQuotes();
      expect(quotesAll).toHaveLength(2);

      const quotesFiltered = await adapter.fetchQuotes(['petr4']);
      expect(quotesFiltered).toHaveLength(1);
      expect(quotesFiltered[0].ticker).toBe('PETR4');

      const fxFiltered = await adapter.fetchExchangeRates([
        { fromCurrency: 'USD', toCurrency: 'BRL' },
      ]);
      expect(fxFiltered).toHaveLength(1);
      expect(fxFiltered[0].fromCurrency).toBe('USD');
    });

    it('deve respeitar targetDate, filtrando quotes e exchange rates pela data alvo', async () => {
      const date1 = new Date('2026-08-17T12:00:00Z');
      const date2 = new Date('2026-08-18T12:00:00Z');

      const adapter = new ManualPayloadAdapter({
        quotes: [
          {
            ticker: 'PETR4',
            price: new Decimal('37.00'),
            quoteDate: date1,
          },
          {
            ticker: 'PETR4',
            price: new Decimal('38.50'),
            quoteDate: date2,
          },
        ],
        exchangeRates: [
          {
            fromCurrency: 'USD',
            toCurrency: 'BRL',
            rate: new Decimal('5.40'),
            rateDate: date1,
          },
          {
            fromCurrency: 'USD',
            toCurrency: 'BRL',
            rate: new Decimal('5.45'),
            rateDate: date2,
          },
        ],
      });

      const quotesOnDate1 = await adapter.fetchQuotes(undefined, date1);
      expect(quotesOnDate1).toHaveLength(1);
      expect(quotesOnDate1[0].price.toString()).toBe('37');

      const fxOnDate2 = await adapter.fetchExchangeRates(undefined, date2);
      expect(fxOnDate2).toHaveLength(1);
      expect(fxOnDate2[0].rate.toString()).toBe('5.45');
    });
    it('deve comparar data por dia normalizado em UTC quando targetDate for meia-noite e registro for às 18:00 UTC', async () => {
      const midnightTarget = new Date('2026-08-18T00:00:00.000Z');
      const adapter = new ManualPayloadAdapter({
        quotes: [
          {
            ticker: 'PETR4',
            price: new Decimal('38.50'),
            quoteDate: new Date('2026-08-18T18:00:00.000Z'),
          },
          {
            ticker: 'PETR4',
            price: new Decimal('37.00'),
            quoteDate: new Date('2026-08-19T18:00:00.000Z'),
          },
        ],
        exchangeRates: [
          {
            fromCurrency: 'USD',
            toCurrency: 'BRL',
            rate: new Decimal('5.45'),
            rateDate: new Date('2026-08-18T18:00:00.000Z'),
          },
        ],
      });

      const quotes = await adapter.fetchQuotes(['PETR4'], midnightTarget);
      expect(quotes).toHaveLength(1);
      expect(quotes[0].price.toString()).toBe('38.5');

      const fx = await adapter.fetchExchangeRates(
        [{ fromCurrency: 'USD', toCurrency: 'BRL' }],
        midnightTarget
      );
      expect(fx).toHaveLength(1);
      expect(fx[0].rate.toString()).toBe('5.45');
    });
  });

  describe('Relatório de Itens Ausentes do Provider (ingestFromProvider)', () => {
    it('deve reportar explicitamente tickers e pares solicitados que o provedor não retornou', async () => {
      const mockAdapter = {
        name: 'custom_mock_adapter',
        fetchQuotes: async () => [
          {
            ticker: 'PETR4',
            price: '38.50',
            quoteDate: new Date('2026-08-18T12:00:00Z'),
          },
        ],
        fetchExchangeRates: async () => [
          {
            fromCurrency: 'USD',
            toCurrency: 'BRL',
            rate: '5.42',
            rateDate: new Date('2026-08-18T12:00:00Z'),
          },
        ],
      };

      const dummyUser: SafeUser = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        email: 'user@example.com',
        name: 'User',
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const report = await ingestFromProvider(
        mockAdapter,
        {
          tickers: ['PETR4', 'VALE3', 'ITUB4'],
          pairs: [
            { fromCurrency: 'USD', toCurrency: 'BRL' },
            { fromCurrency: 'EUR', toCurrency: 'BRL' },
          ],
        },
        dummyUser,
        { dryRun: true }
      );

      expect(report.success).toBe(false);

      const missingQuotes = report.quotesSummary.items.filter(
        (i) => i.errorCode === 'PROVIDER_MISSING_DATA'
      );
      expect(missingQuotes).toHaveLength(2);
      expect(missingQuotes.map((i) => i.identifier)).toEqual(['VALE3', 'ITUB4']);

      const missingFx = report.exchangeRatesSummary.items.filter(
        (i) => i.errorCode === 'PROVIDER_MISSING_DATA'
      );
      expect(missingFx).toHaveLength(1);
      expect(missingFx[0].identifier).toBe('EUR/BRL');
    });

    it('não deve gerar PROVIDER_MISSING_DATA para duplicidades de solicitação ou diferenças de caixa', async () => {
      const mockAdapter = {
        name: 'casing_mock_adapter',
        fetchQuotes: async () => [
          {
            ticker: 'petr4',
            price: '38.50',
            quoteDate: new Date('2026-08-18T12:00:00Z'),
          },
        ],
        fetchExchangeRates: async () => [
          {
            fromCurrency: 'usd',
            toCurrency: 'brl',
            rate: '5.42',
            rateDate: new Date('2026-08-18T12:00:00Z'),
          },
        ],
      };

      const dummyUser: SafeUser = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        email: 'user@example.com',
        name: 'User',
        status: 'active',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Solicita 'PETR4', 'petr4', '  PETR4  ' e pares em caixas diferentes
      const report = await ingestFromProvider(
        mockAdapter,
        {
          tickers: ['PETR4', 'petr4', '  PETR4  '],
          pairs: [
            { fromCurrency: 'USD', toCurrency: 'BRL' },
            { fromCurrency: 'usd', toCurrency: 'brl' },
          ],
        },
        dummyUser,
        { dryRun: true }
      );

      const missingQuotes = report.quotesSummary.items.filter(
        (i) => i.errorCode === 'PROVIDER_MISSING_DATA'
      );
      const missingFx = report.exchangeRatesSummary.items.filter(
        (i) => i.errorCode === 'PROVIDER_MISSING_DATA'
      );

      expect(missingQuotes).toHaveLength(0);
      expect(missingFx).toHaveLength(0);
    });
  });

  describe('Adaptador Mock Determinístico (MockMarketDataProviderAdapter)', () => {
    it('deve fornecer cotações simuladas sem acesso a rede externa', async () => {
      const adapter = new MockMarketDataProviderAdapter();

      const quotes = await adapter.fetchQuotes(['PETR4', 'VALE3']);
      expect(quotes).toHaveLength(2);
      expect(quotes[0].ticker).toBe('PETR4');
      expect(new Decimal(quotes[0].price).toString()).toBe('38.5');

      const fx = await adapter.fetchExchangeRates([
        { fromCurrency: 'USD', toCurrency: 'BRL' },
      ]);
      expect(fx).toHaveLength(1);
      expect(new Decimal(fx[0].rate).toString()).toBe('5.42');
    });
  });
});
