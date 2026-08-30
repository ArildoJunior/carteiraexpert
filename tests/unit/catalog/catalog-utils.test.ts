import { describe, it, expect } from 'vitest';
import { Decimal } from '@/lib/decimal';
import {
  getMarketTradingDay,
  countBusinessDaysSince,
  calculateDailyVariation,
  deriveFreshnessStatus,
  getCategoryLabel,
  getCategoryRoute,
  getAssetDetailRoute,
  getFreshnessBadge,
} from '@/modules/catalog/domain/catalog-utils';

describe('Catálogo Público — Utilitários de Domínio', () => {
  describe('Fuso Horário do Mercado (America/Sao_Paulo)', () => {
    it('deve agrupar cotações no dia civil correto em São Paulo mesmo perto da meia-noite UTC', () => {
      // 2026-08-25T01:30:00Z em UTC corresponde a 2026-08-24 22:30:00 em São Paulo (UTC-3)
      const dateUtcEarly = new Date('2026-08-25T01:30:00Z');
      const tradingDay = getMarketTradingDay(dateUtcEarly);
      expect(tradingDay).toBe('2026-08-24');

      // 2026-08-25T15:00:00Z em UTC corresponde a 2026-08-25 12:00:00 em São Paulo
      const dateUtcMidday = new Date('2026-08-25T15:00:00Z');
      expect(getMarketTradingDay(dateUtcMidday)).toBe('2026-08-25');
    });

    it('deve calcular dias úteis ignorando finais de semana', () => {
      // De sexta-feira (2026-08-21) até segunda-feira (2026-08-24) em SP = 1 dia útil transcorrido
      const friday = new Date('2026-08-21T18:00:00-03:00');
      const monday = new Date('2026-08-24T10:00:00-03:00');

      const days = countBusinessDaysSince(friday, monday);
      expect(days).toBe(1);
    });

    it('deve retornar zero dias úteis dentro do mesmo fim de semana', () => {
      const friday = new Date('2026-08-21T18:00:00-03:00');
      const sunday = new Date('2026-08-23T20:00:00-03:00');
      const saturday = new Date('2026-08-22T10:00:00-03:00');

      expect(countBusinessDaysSince(friday, sunday)).toBe(0);
      expect(countBusinessDaysSince(saturday, sunday)).toBe(0);
    });

    it('deve contar 1 dia útil de sábado/domingo até segunda-feira', () => {
      const saturday = new Date('2026-08-22T10:00:00-03:00');
      const sunday = new Date('2026-08-23T18:00:00-03:00');
      const monday = new Date('2026-08-24T10:00:00-03:00');

      expect(countBusinessDaysSince(saturday, monday)).toBe(1);
      expect(countBusinessDaysSince(sunday, monday)).toBe(1);
    });

    it('deve retornar zero quando as datas forem no mesmo dia civil', () => {
      const morning = new Date('2026-08-24T08:00:00-03:00');
      const evening = new Date('2026-08-24T22:00:00-03:00');

      expect(countBusinessDaysSince(morning, evening)).toBe(0);
      expect(countBusinessDaysSince(morning, morning)).toBe(0);
    });

    it('deve retornar zero quando as datas forem invertidas (data passada posterior à atual)', () => {
      const monday = new Date('2026-08-24T10:00:00-03:00');
      const friday = new Date('2026-08-21T18:00:00-03:00');

      expect(countBusinessDaysSince(monday, friday)).toBe(0);
    });

    it('deve calcular corretamente na virada de horário e meia-noite', () => {
      // 2026-08-24 23:59:59-03:00 (Segunda) até 2026-08-25 00:00:01-03:00 (Terça) = 1 dia útil
      const mondayNight = new Date('2026-08-24T23:59:59-03:00');
      const tuesdayDawn = new Date('2026-08-25T00:00:01-03:00');

      expect(countBusinessDaysSince(mondayNight, tuesdayDawn)).toBe(1);
    });
  });

  describe('Cálculo Determinístico de Variação Diária', () => {
    it('deve calcular a variação positiva corretamente com Decimal', () => {
      const quotes = [
        {
          price: new Decimal('40.00'),
          currency: 'BRL',
          quoteDate: new Date('2026-08-25T18:00:00-03:00'),
          delayStatus: 'eod' as const,
        },
        {
          price: new Decimal('38.00'),
          currency: 'BRL',
          quoteDate: new Date('2026-08-24T18:00:00-03:00'),
          delayStatus: 'eod' as const,
        },
      ];

      const result = calculateDailyVariation(quotes);
      expect(result.variationStatus).toBe('available');
      // ((40 - 38) / 38) * 100 = 5.26315... -> 5.26
      expect(result.dailyVariation).toBe('5.26');
      expect(result.previousClosePrice).toBe('38.00');
    });

    it('deve calcular a variação negativa corretamente com Decimal', () => {
      const quotes = [
        {
          price: new Decimal('30.00'),
          currency: 'BRL',
          quoteDate: new Date('2026-08-25T18:00:00-03:00'),
          delayStatus: 'eod' as const,
        },
        {
          price: new Decimal('40.00'),
          currency: 'BRL',
          quoteDate: new Date('2026-08-24T18:00:00-03:00'),
          delayStatus: 'eod' as const,
        },
      ];

      const result = calculateDailyVariation(quotes);
      expect(result.variationStatus).toBe('available');
      // ((30 - 40) / 40) * 100 = -25.00
      expect(result.dailyVariation).toBe('-25.00');
      expect(result.previousClosePrice).toBe('40.00');
    });

    it('deve selecionar a cotação do pregão anterior mesmo se houver múltiplas cotações no mesmo dia', () => {
      const quotes = [
        {
          price: new Decimal('42.00'),
          currency: 'BRL',
          quoteDate: new Date('2026-08-25T17:00:00-03:00'),
          delayStatus: 'delayed_15m' as const,
        },
        {
          price: new Decimal('41.50'),
          currency: 'BRL',
          quoteDate: new Date('2026-08-25T11:00:00-03:00'),
          delayStatus: 'delayed_15m' as const,
        },
        {
          price: new Decimal('40.00'),
          currency: 'BRL',
          quoteDate: new Date('2026-08-24T18:00:00-03:00'),
          delayStatus: 'eod' as const,
        },
      ];

      const result = calculateDailyVariation(quotes);
      expect(result.variationStatus).toBe('available');
      // ((42 - 40) / 40) * 100 = 5.00
      expect(result.dailyVariation).toBe('5.00');
      expect(result.previousClosePrice).toBe('40.00');
    });

    it('deve retornar "insufficient_history" e null quando houver um gap temporal excessivo entre os pregões (> 10 dias úteis)', () => {
      const quotesWithGap = [
        {
          price: new Decimal('446.15'),
          currency: 'BRL',
          quoteDate: new Date('2026-08-25T18:00:00-03:00'),
          delayStatus: 'eod' as const,
        },
        {
          price: new Decimal('75.96'),
          currency: 'BRL',
          quoteDate: new Date('2016-12-28T18:00:00-03:00'),
          delayStatus: 'eod' as const,
        },
      ];

      const result = calculateDailyVariation(quotesWithGap);
      expect(result.variationStatus).toBe('insufficient_history');
      expect(result.dailyVariation).toBeNull();
      expect(result.previousClosePrice).toBe('75.96');
    });

    it('deve retornar "insufficient_history" se só houver uma cotação no histórico', () => {
      const quotes = [
        {
          price: new Decimal('40.00'),
          currency: 'BRL',
          quoteDate: new Date('2026-08-25T18:00:00-03:00'),
          delayStatus: 'eod' as const,
        },
      ];

      const result = calculateDailyVariation(quotes);
      expect(result.variationStatus).toBe('insufficient_history');
      expect(result.dailyVariation).toBeNull();
      expect(result.previousClosePrice).toBeNull();
    });

    it('deve retornar "unavailable" se as moedas forem diferentes', () => {
      const quotes = [
        {
          price: new Decimal('50.00'),
          currency: 'BRL',
          quoteDate: new Date('2026-08-25T18:00:00-03:00'),
          delayStatus: 'eod' as const,
        },
        {
          price: new Decimal('10.00'),
          currency: 'USD',
          quoteDate: new Date('2026-08-24T18:00:00-03:00'),
          delayStatus: 'eod' as const,
        },
      ];

      const result = calculateDailyVariation(quotes);
      expect(result.variationStatus).toBe('unavailable');
      expect(result.dailyVariation).toBeNull();
    });
  });

  describe('Classificação de Frescor', () => {
    it('deve retornar "unquoted" quando não houver cotação', () => {
      expect(deriveFreshnessStatus(null)).toBe('unquoted');
      expect(deriveFreshnessStatus(undefined)).toBe('unquoted');
    });

    it('deve retornar o delayStatus persistido se tiver menos de 5 dias úteis', () => {
      const recentQuote = {
        price: '30.00',
        currency: 'BRL',
        quoteDate: new Date(),
        delayStatus: 'delayed_15m' as const,
      };

      expect(deriveFreshnessStatus(recentQuote)).toBe('delayed_15m');
    });

    it('deve derivar "stale" se a cotação tiver mais de 5 dias úteis de defasagem', () => {
      // 15 dias atrás
      const oldQuote = {
        price: '30.00',
        currency: 'BRL',
        quoteDate: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
        delayStatus: 'eod' as const,
      };

      expect(deriveFreshnessStatus(oldQuote)).toBe('stale');
    });
  });

  describe('Mapeamento de Rotas e Labels', () => {
    it('deve mapear labels de categorias corretamente', () => {
      expect(getCategoryLabel('stock')).toBe('Ações');
      expect(getCategoryLabel('fii')).toBe('Fundos Imobiliários');
      expect(getCategoryLabel('etf')).toBe('ETFs');
      expect(getCategoryLabel('bdr')).toBe('BDRs');
    });

    it('deve gerar rotas canônicas de detalhe por classe', () => {
      expect(getAssetDetailRoute('stock', 'PETR4')).toBe('/acoes/PETR4');
      expect(getAssetDetailRoute('fii', 'KNIP11')).toBe('/fiis/KNIP11');
      expect(getAssetDetailRoute('etf', 'IVVB11')).toBe('/etfs/IVVB11');
      expect(getAssetDetailRoute('bdr', 'AAPL34')).toBe('/bdrs/AAPL34');
      expect(getCategoryRoute('stock')).toBe('/acoes');
      expect(getCategoryRoute('fii')).toBe('/fiis');
    });

    it('deve fornecer propriedades de visualização para cada badge de frescor', () => {
      expect(getFreshnessBadge('realtime').label).toBe('Tempo Real');
      expect(getFreshnessBadge('delayed_15m').label).toBe('15m Atraso');
      expect(getFreshnessBadge('eod').label).toBe('Fechamento');
      expect(getFreshnessBadge('stale').label).toBe('Defasada');
      expect(getFreshnessBadge('unquoted').label).toBe('Sem Cotação');
    });
  });
});
