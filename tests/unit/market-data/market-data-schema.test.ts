import { describe, it, expect } from 'vitest';
import {
  createMarketQuoteSchema,
  createExchangeRateSchema,
} from '@/modules/market-data/domain/market-data.schema';
import crypto from 'node:crypto';

describe('Unitário: Validação de Schemas Zod de Market Data e Câmbio', () => {
  const dummyAssetId = crypto.randomUUID();

  describe('createMarketQuoteSchema', () => {
    it('deve aceitar dados válidos com normalização Decimal e defaults', () => {
      const result = createMarketQuoteSchema.parse({
        assetId: dummyAssetId,
        price: '34.50',
        currency: 'BRL',
        quoteDate: '2026-08-18T18:00:00.000Z',
        source: 'internal',
        delayStatus: 'eod',
        notes: 'Cotação diária',
      });

      expect(result.assetId).toBe(dummyAssetId);
      expect(result.price.toString()).toBe('34.5');
      expect(result.currency).toBe('BRL');
      expect(result.delayStatus).toBe('eod');
      expect(result.source).toBe('internal');
    });

    it('deve rejeitar preço negativo', () => {
      expect(() =>
        createMarketQuoteSchema.parse({
          assetId: dummyAssetId,
          price: '-10.00',
          quoteDate: '2026-08-18T18:00:00.000Z',
        })
      ).toThrow();
    });

    it('deve rejeitar data de cotação futura', () => {
      const nextYear = new Date();
      nextYear.setFullYear(nextYear.getFullYear() + 1);

      expect(() =>
        createMarketQuoteSchema.parse({
          assetId: dummyAssetId,
          price: '50.00',
          quoteDate: nextYear.toISOString(),
        })
      ).toThrow();
    });

    it('deve adotar delayStatus "eod" por padrão e nunca "realtime" implicitamente', () => {
      const result = createMarketQuoteSchema.parse({
        assetId: dummyAssetId,
        price: '50.00',
        quoteDate: '2026-08-18T18:00:00.000Z',
      });

      expect(result.delayStatus).toBe('eod');
      expect(result.delayStatus).not.toBe('realtime');
    });

    it('deve permitir delayStatus "manual" quando informado explicitamente', () => {
      const result = createMarketQuoteSchema.parse({
        assetId: dummyAssetId,
        price: '50.00',
        quoteDate: '2026-08-18T18:00:00.000Z',
        delayStatus: 'manual',
      });

      expect(result.delayStatus).toBe('manual');
    });

    it('deve rejeitar explicitamente delayStatus "realtime" na entrada comum', () => {
      expect(() =>
        createMarketQuoteSchema.parse({
          assetId: dummyAssetId,
          price: '50.00',
          quoteDate: '2026-08-18T18:00:00.000Z',
          delayStatus: 'realtime' as unknown as 'eod',
        })
      ).toThrow(/realtime/);
    });
  });

  describe('createExchangeRateSchema', () => {
    it('deve aceitar par cambial válido e converter moedas para uppercase', () => {
      const result = createExchangeRateSchema.parse({
        fromCurrency: 'usd',
        toCurrency: 'brl',
        rate: '5.5520',
        rateDate: '2026-08-18T18:00:00.000Z',
      });

      expect(result.fromCurrency).toBe('USD');
      expect(result.toCurrency).toBe('BRL');
      expect(result.rate.toString()).toBe('5.552');
      expect(result.delayStatus).toBe('eod');
    });

    it('deve adotar delayStatus "eod" por padrão em taxas cambiais e nunca "realtime" implicitamente', () => {
      const result = createExchangeRateSchema.parse({
        fromCurrency: 'USD',
        toCurrency: 'BRL',
        rate: '5.50',
        rateDate: '2026-08-18T18:00:00.000Z',
      });

      expect(result.delayStatus).toBe('eod');
      expect(result.delayStatus).not.toBe('realtime');
    });

    it('deve rejeitar explicitamente delayStatus "realtime" na entrada comum de taxa cambial', () => {
      expect(() =>
        createExchangeRateSchema.parse({
          fromCurrency: 'USD',
          toCurrency: 'BRL',
          rate: '5.50',
          rateDate: '2026-08-18T18:00:00.000Z',
          delayStatus: 'realtime' as unknown as 'eod',
        })
      ).toThrow(/realtime/);
    });

    it('deve rejeitar taxa cambial zero ou negativa', () => {
      expect(() =>
        createExchangeRateSchema.parse({
          fromCurrency: 'USD',
          toCurrency: 'BRL',
          rate: '0',
          rateDate: '2026-08-18T18:00:00.000Z',
        })
      ).toThrow();

      expect(() =>
        createExchangeRateSchema.parse({
          fromCurrency: 'USD',
          toCurrency: 'BRL',
          rate: '-2.50',
          rateDate: '2026-08-18T18:00:00.000Z',
        })
      ).toThrow();
    });

    it('deve rejeitar data de taxa cambial futura', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 5);

      expect(() =>
        createExchangeRateSchema.parse({
          fromCurrency: 'USD',
          toCurrency: 'BRL',
          rate: '5.50',
          rateDate: futureDate.toISOString(),
        })
      ).toThrow();
    });
  });
});
