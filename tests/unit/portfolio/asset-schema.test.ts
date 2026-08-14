import { describe, it, expect } from 'vitest';
import {
  createAssetSchema,
  createCustomAssetSchema,
  tickerSchema,
} from '../../../src/modules/portfolio/domain/asset.schema';
import crypto from 'node:crypto';

describe('Asset Domain Schemas (Unit Tests)', () => {
  describe('tickerSchema', () => {
    it('deve sanitizar ticker convertendo para maiúsculas e removendo espaços', () => {
      const result = tickerSchema.safeParse('  petr4  ');
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data).toBe('PETR4');
    });

    it('deve aceitar ticker de exatamente 20 caracteres cercado por espaços nas extremidades', () => {
      const rawTicker = '   12345678901234567890   ';
      const result = tickerSchema.safeParse(rawTicker);
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data).toBe('12345678901234567890');
      expect(result.data.length).toBe(20);
    });

    it('deve aceitar tickers válidos com pontos, hifens e números', () => {
      expect(tickerSchema.safeParse('VALE3').success).toBe(true);
      expect(tickerSchema.safeParse('AAPL.US').success).toBe(true);
      expect(tickerSchema.safeParse('BTC-USD').success).toBe(true);
      expect(tickerSchema.safeParse('ETH_USDT').success).toBe(true);
    });

    it('deve rejeitar ticker vazio ou apenas com espaços', () => {
      expect(tickerSchema.safeParse('').success).toBe(false);
      expect(tickerSchema.safeParse('   ').success).toBe(false);
    });

    it('deve rejeitar caracteres especiais não permitidos no ticker', () => {
      expect(tickerSchema.safeParse('PETR@4').success).toBe(false);
      expect(tickerSchema.safeParse('VALE#3').success).toBe(false);
      expect(tickerSchema.safeParse('ITSA 4').success).toBe(false);
      expect(tickerSchema.safeParse('B3/SA').success).toBe(false);
    });

    it('deve rejeitar ticker com mais de 20 caracteres após o trim', () => {
      expect(tickerSchema.safeParse('A'.repeat(21)).success).toBe(false);
      expect(tickerSchema.safeParse('   ' + 'A'.repeat(21) + '   ').success).toBe(false);
    });
  });

  describe('createAssetSchema - Coerência de Ativos Globais e Customizados', () => {
    const validUserId = crypto.randomUUID();

    it('deve aceitar ativo global válido com assetType padrão, market B3 e sem userId', () => {
      const result = createAssetSchema.safeParse({
        ticker: 'petr4',
        name: 'Petrobras PN',
        assetType: 'stock',
        market: 'B3',
        currency: 'BRL',
        isCustom: false,
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.ticker).toBe('PETR4');
      expect(result.data.isCustom).toBe(false);
      expect(result.data.userId).toBeUndefined();
    });

    it('deve rejeitar ativo global (isCustom = false) que contenha userId', () => {
      const result = createAssetSchema.safeParse({
        ticker: 'PETR4',
        name: 'Petrobras PN',
        assetType: 'stock',
        market: 'B3',
        isCustom: false,
        userId: validUserId,
      });

      expect(result.success).toBe(false);
    });

    it('deve rejeitar ativo global (isCustom = false) com assetType "custom"', () => {
      const result = createAssetSchema.safeParse({
        ticker: 'PETR4',
        name: 'Petrobras PN',
        assetType: 'custom',
        market: 'B3',
        isCustom: false,
      });

      expect(result.success).toBe(false);
    });

    it('deve rejeitar ativo global (isCustom = false) com market "CUSTOM"', () => {
      const result = createAssetSchema.safeParse({
        ticker: 'PETR4',
        name: 'Petrobras PN',
        assetType: 'stock',
        market: 'CUSTOM',
        isCustom: false,
      });

      expect(result.success).toBe(false);
    });

    it('deve aceitar ativo customizado válido com isCustom: true, assetType "custom", market "CUSTOM" e userId UUID', () => {
      const result = createAssetSchema.safeParse({
        ticker: 'MEU_FUNDO',
        name: 'Fundo Exclusivo Família',
        assetType: 'custom',
        market: 'CUSTOM',
        isCustom: true,
        userId: validUserId,
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.isCustom).toBe(true);
      expect(result.data.assetType).toBe('custom');
      expect(result.data.market).toBe('CUSTOM');
      expect(result.data.userId).toBe(validUserId);
    });

    it('deve rejeitar ativo customizado (isCustom = true) com assetType diferente de "custom"', () => {
      const result = createAssetSchema.safeParse({
        ticker: 'MEU_FUNDO',
        name: 'Fundo Exclusivo',
        assetType: 'stock',
        market: 'CUSTOM',
        isCustom: true,
        userId: validUserId,
      });

      expect(result.success).toBe(false);
    });

    it('deve rejeitar ativo customizado (isCustom = true) com market diferente de "CUSTOM"', () => {
      const result = createAssetSchema.safeParse({
        ticker: 'MEU_FUNDO',
        name: 'Fundo Exclusivo',
        assetType: 'custom',
        market: 'B3',
        isCustom: true,
        userId: validUserId,
      });

      expect(result.success).toBe(false);
    });

    it('deve rejeitar ativo customizado (isCustom = true) sem userId', () => {
      const resultNoUser = createAssetSchema.safeParse({
        ticker: 'MEU_FUNDO',
        name: 'Fundo Exclusivo',
        assetType: 'custom',
        market: 'CUSTOM',
        isCustom: true,
      });
      expect(resultNoUser.success).toBe(false);

      const resultNullUser = createAssetSchema.safeParse({
        ticker: 'MEU_FUNDO',
        name: 'Fundo Exclusivo',
        assetType: 'custom',
        market: 'CUSTOM',
        isCustom: true,
        userId: null,
      });
      expect(resultNullUser.success).toBe(false);
    });

    it('deve rejeitar userId em formato não-UUID', () => {
      const result = createAssetSchema.safeParse({
        ticker: 'MEU_FUNDO',
        name: 'Fundo Exclusivo',
        assetType: 'custom',
        market: 'CUSTOM',
        isCustom: true,
        userId: 'id-invalido-123',
      });
      expect(result.success).toBe(false);
    });

    it('deve rejeitar tipo de ativo inválido', () => {
      const result = createAssetSchema.safeParse({
        ticker: 'PETR4',
        name: 'Petrobras',
        assetType: 'tipo_inexistente',
      });
      expect(result.success).toBe(false);
    });

    it('deve rejeitar mercado inválido', () => {
      const result = createAssetSchema.safeParse({
        ticker: 'PETR4',
        name: 'Petrobras',
        assetType: 'stock',
        market: 'MERCADO_FANTASMA',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('createCustomAssetSchema', () => {
    const validUserId = crypto.randomUUID();

    it('deve criar ativo customizado com defaults apropriados', () => {
      const result = createCustomAssetSchema.safeParse({
        ticker: 'tit_priv_01',
        name: 'Título Privado Família',
        userId: validUserId,
      });

      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.ticker).toBe('TIT_PRIV_01');
      expect(result.data.assetType).toBe('custom');
      expect(result.data.market).toBe('CUSTOM');
      expect(result.data.currency).toBe('BRL');
    });

    it('deve rejeitar ativo customizado com assetType diferente de "custom"', () => {
      const result = createCustomAssetSchema.safeParse({
        ticker: 'tit_priv_02',
        name: 'Título Privado Família',
        assetType: 'stock',
        userId: validUserId,
      });

      expect(result.success).toBe(false);
    });

    it('deve rejeitar ativo customizado com market diferente de "CUSTOM"', () => {
      const result = createCustomAssetSchema.safeParse({
        ticker: 'tit_priv_03',
        name: 'Título Privado Família',
        market: 'B3',
        userId: validUserId,
      });

      expect(result.success).toBe(false);
    });
  });
});
