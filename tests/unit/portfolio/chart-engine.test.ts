import { describe, it, expect } from 'vitest';
import { Decimal } from '@/lib/decimal';
import {
  calculatePortfolioAllocation,
  serializePortfolioAllocation,
  getAssetTypeLabel,
  formatChartMoney,
  formatChartPercent,
} from '../../../src/modules/portfolio/domain/chart-engine';
import type { AssetPosition } from '../../../src/modules/portfolio/domain/position.types';

describe('Unitário: Motor de Gráficos e Alocação Patrimonial (Chart Engine)', () => {
  const mockBasePosition = (overrides: Partial<AssetPosition> = {}): AssetPosition => ({
    assetId: 'asset-1',
    ticker: 'PETR4',
    name: 'Petrobras PN',
    assetType: 'stock',
    market: 'B3',
    currency: 'BRL',
    isCustom: false,
    quantity: new Decimal('100'),
    averagePrice: new Decimal('30.00'),
    totalCost: new Decimal('3000.00'),
    totalFees: new Decimal('0.00'),
    totalRealizedPnL: new Decimal('0.00'),
    totalIncomeReceived: new Decimal('0.00'),
    lastTradeDate: new Date('2026-01-10T12:00:00Z'),
    hasFractionalShares: false,
    hasQuote: true,
    marketPrice: new Decimal('35.00'),
    marketValue: new Decimal('3500.00'),
    unrealizedPnL: new Decimal('500.00'),
    unrealizedPnLPercent: new Decimal('16.67'),
    quoteCurrency: 'BRL',
    quoteDate: new Date('2026-08-18T18:00:00Z'),
    quoteSource: 'internal',
    delayStatus: 'eod',
    marketValueBrl: null,
    fxRateUsed: null,
    fxDateUsed: null,
    assetPriceReturnPercent: new Decimal('16.67'),
    ...overrides,
  });

  describe('Formatação e Mapeamento de Rótulos', () => {
    it('deve mapear corretamente os rótulos de classes de ativos', () => {
      expect(getAssetTypeLabel('stock')).toBe('Ações');
      expect(getAssetTypeLabel('fii')).toBe('Fundos Imobiliários');
      expect(getAssetTypeLabel('etf')).toBe('ETFs');
      expect(getAssetTypeLabel('bdr')).toBe('BDRs');
      expect(getAssetTypeLabel('crypto')).toBe('Criptoativos');
      expect(getAssetTypeLabel('fixed_income')).toBe('Renda Fixa');
      expect(getAssetTypeLabel('option')).toBe('Opções');
      expect(getAssetTypeLabel('other')).toBe('Outros');
      expect(getAssetTypeLabel(null)).toBe('Outros');
    });

    it('deve formatar moedas e percentuais com precisão', () => {
      expect(formatChartMoney(new Decimal('1234567.89'), 'BRL')).toBe('R$ 1.234.567,89');
      expect(formatChartMoney(new Decimal('500.50'), 'USD')).toBe('$ 500,50');
      expect(formatChartPercent(new Decimal('33.33333333'))).toBe('33,33%');
    });
  });

  describe('Carteira Vazia ou com Valores Zerados', () => {
    it('deve retornar estrutura vazia quando não houver posições', () => {
      const result = calculatePortfolioAllocation([]);
      expect(result.isEmpty).toBe(true);
      expect(result.slices).toHaveLength(0);
      expect(result.totalCalculatedValue.toString()).toBe('0');
      expect(result.totalPositionsCount).toBe(0);
      expect(result.quotedPositionsCount).toBe(0);
      expect(result.unquotedPositionsCount).toBe(0);
    });
  });

  describe('Alocação por Ativo em Carteira 100% Cotada', () => {
    it('deve calcular proporções e percentuais exatos em Decimal para ativos cotados e preservar tipos Decimal', () => {
      const pos1 = mockBasePosition({
        assetId: 'asset-1',
        ticker: 'PETR4',
        marketValue: new Decimal('6000.00'), // 60%
      });
      const pos2 = mockBasePosition({
        assetId: 'asset-2',
        ticker: 'VALE3',
        name: 'Vale ON',
        marketValue: new Decimal('4000.00'), // 40%
      });

      const result = calculatePortfolioAllocation([pos1, pos2], {
        basis: 'market_value',
        groupingType: 'asset',
      });

      expect(result.isEmpty).toBe(false);
      expect(result.totalCalculatedValue).toBeInstanceOf(Decimal);
      expect(result.totalCalculatedValue.toString()).toBe('10000');
      expect(result.quotedPositionsCount).toBe(2);
      expect(result.unquotedPositionsCount).toBe(0);
      expect(result.isPartiallyQuoted).toBe(false);
      expect(result.hasOnlyUnquotedPositions).toBe(false);

      expect(result.slices).toHaveLength(2);
      expect(result.slices[0].label).toBe('PETR4');
      expect(result.slices[0].rawValue).toBeInstanceOf(Decimal);
      expect(result.slices[0].percent).toBeInstanceOf(Decimal);
      expect(result.slices[0].rawValue.toString()).toBe('6000');
      expect(result.slices[0].percent.toString()).toBe('60');
      expect(result.slices[0].formattedPercent).toBe('60,00%');
      // Garante que numericValue não existe no motor de domínio
      expect((result.slices[0] as unknown as Record<string, unknown>).numericValue).toBeUndefined();

      expect(result.slices[1].label).toBe('VALE3');
      expect(result.slices[1].rawValue).toBeInstanceOf(Decimal);
      expect(result.slices[1].percent).toBeInstanceOf(Decimal);
      expect(result.slices[1].rawValue.toString()).toBe('4000');
      expect(result.slices[1].percent.toString()).toBe('40');
      expect(result.slices[1].formattedPercent).toBe('40,00%');
      expect((result.slices[1] as unknown as Record<string, unknown>).numericValue).toBeUndefined();
    });
  });

  describe('Agrupamento por Classe de Ativo (assetType)', () => {
    it('deve somar e agrupar posições da mesma classe em uma única fatia', () => {
      const pos1 = mockBasePosition({
        assetId: 'asset-1',
        ticker: 'PETR4',
        assetType: 'stock',
        marketValue: new Decimal('3000.00'),
      });
      const pos2 = mockBasePosition({
        assetId: 'asset-2',
        ticker: 'VALE3',
        assetType: 'stock',
        marketValue: new Decimal('2000.00'),
      });
      const pos3 = mockBasePosition({
        assetId: 'asset-3',
        ticker: 'HGLG11',
        name: 'CSHG Logística',
        assetType: 'fii',
        marketValue: new Decimal('5000.00'),
      });

      const result = calculatePortfolioAllocation([pos1, pos2, pos3], {
        basis: 'market_value',
        groupingType: 'asset_type',
      });

      expect(result.slices).toHaveLength(2);
      // Ações: 3000 + 2000 = 5000 (50%)
      expect(result.slices[0].label).toBe('Ações');
      expect(result.slices[0].rawValue.toString()).toBe('5000');
      expect(result.slices[0].percent.toString()).toBe('50');
      expect(result.slices[0].positionsCount).toBe(2);

      // FIIs: 5000 (50%)
      expect(result.slices[1].label).toBe('Fundos Imobiliários');
      expect(result.slices[1].rawValue.toString()).toBe('5000');
      expect(result.slices[1].percent.toString()).toBe('50');
      expect(result.slices[1].positionsCount).toBe(1);
    });
  });

  describe('Agrupamento por Moeda (currency)', () => {
    it('deve agrupar por moeda consolidando ativos estrangeiros em BRL', () => {
      const posBrl = mockBasePosition({
        assetId: 'asset-brl',
        ticker: 'PETR4',
        currency: 'BRL',
        marketValue: new Decimal('7500.00'),
      });
      const posUsd = mockBasePosition({
        assetId: 'asset-usd',
        ticker: 'AAPL',
        name: 'Apple Inc.',
        currency: 'USD',
        marketValue: new Decimal('500.00'), // USD
        marketValueBrl: new Decimal('2500.00'), // Convertido para BRL (taxa 5.00)
      });

      const result = calculatePortfolioAllocation([posBrl, posUsd], {
        basis: 'market_value',
        groupingType: 'currency',
        baseCurrency: 'BRL',
      });

      expect(result.totalCalculatedValue.toString()).toBe('10000');
      expect(result.slices).toHaveLength(2);

      // BRL: 7500 (75%)
      expect(result.slices[0].label).toBe('BRL');
      expect(result.slices[0].rawValue.toString()).toBe('7500');
      expect(result.slices[0].percent.toString()).toBe('75');

      // USD: 2500 BRL (25%)
      expect(result.slices[1].label).toBe('USD');
      expect(result.slices[1].rawValue.toString()).toBe('2500');
      expect(result.slices[1].percent.toString()).toBe('25');
    });
  });

  describe('Tratamento Rigoroso de Ativos Sem Cotação e Custo de Aquisição', () => {
    it('em carteira mista, não deve incluir ativos não cotados nas fatias de valor a mercado e deve sinalizar isPartiallyQuoted', () => {
      const posQuoted = mockBasePosition({
        assetId: 'asset-1',
        ticker: 'PETR4',
        hasQuote: true,
        marketValue: new Decimal('4000.00'),
        totalCost: new Decimal('3000.00'),
      });
      const posUnquoted = mockBasePosition({
        assetId: 'asset-2',
        ticker: 'CUSTOM1',
        name: 'Ativo Privado Sem Cotação',
        hasQuote: false,
        marketPrice: null,
        marketValue: null,
        totalCost: new Decimal('1000.00'),
      });

      const result = calculatePortfolioAllocation([posQuoted, posUnquoted], {
        basis: 'market_value',
        groupingType: 'asset',
      });

      // Denominador = 4000 (não soma os 1000 de custo do unquoted nem cria fatia zerada)
      expect(result.totalCalculatedValue.toString()).toBe('4000');
      expect(result.slices).toHaveLength(1);
      expect(result.slices[0].label).toBe('PETR4');
      expect(result.slices[0].percent.toString()).toBe('100');

      // Métricas informativas de unquoted
      expect(result.quotedPositionsCount).toBe(1);
      expect(result.unquotedPositionsCount).toBe(1);
      expect(result.unquotedTotalCost.toString()).toBe('1000');
      expect(result.isPartiallyQuoted).toBe(true);
      expect(result.hasOnlyUnquotedPositions).toBe(false);
    });

    it('em carteira 100% sem cotação, deve indicar hasOnlyUnquotedPositions e slices vazios no modo market_value', () => {
      const posUnquoted1 = mockBasePosition({
        assetId: 'asset-1',
        ticker: 'CUSTOM1',
        hasQuote: false,
        marketValue: null,
        totalCost: new Decimal('2000.00'),
      });
      const posUnquoted2 = mockBasePosition({
        assetId: 'asset-2',
        ticker: 'CUSTOM2',
        hasQuote: false,
        marketValue: null,
        totalCost: new Decimal('3000.00'),
      });

      const result = calculatePortfolioAllocation([posUnquoted1, posUnquoted2], {
        basis: 'market_value',
      });

      expect(result.totalCalculatedValue.toString()).toBe('0');
      expect(result.slices).toHaveLength(0);
      expect(result.quotedPositionsCount).toBe(0);
      expect(result.unquotedPositionsCount).toBe(2);
      expect(result.unquotedTotalCost.toString()).toBe('5000');
      expect(result.hasOnlyUnquotedPositions).toBe(true);
      expect(result.isEmpty).toBe(true);
    });

    it('em modo cost_basis, deve incluir todas as posições pelo custo de aquisição e converter FX para BRL quando aplicável', () => {
      const posBrl = mockBasePosition({
        assetId: 'asset-1',
        ticker: 'PETR4',
        currency: 'BRL',
        hasQuote: true,
        marketValue: new Decimal('4000.00'),
        totalCost: new Decimal('2000.00'),
      });
      const posUsd = mockBasePosition({
        assetId: 'asset-2',
        ticker: 'AAPL',
        currency: 'USD',
        hasQuote: true,
        marketValue: new Decimal('600.00'),
        marketValueBrl: new Decimal('3000.00'),
        totalCost: new Decimal('400.00'),
        fxRateUsed: new Decimal('5.00'), // 400 USD * 5 = 2000 BRL
      });

      const result = calculatePortfolioAllocation([posBrl, posUsd], {
        basis: 'cost_basis',
        groupingType: 'asset',
        baseCurrency: 'BRL',
      });

      // Denominador = 2000 BRL + (400 * 5) BRL = 4000 BRL
      expect(result.totalCalculatedValue.toString()).toBe('4000');
      expect(result.slices).toHaveLength(2);
      expect(result.slices[0].rawValue.toString()).toBe('2000');
      expect(result.slices[0].percent.toString()).toBe('50');
      expect(result.slices[1].rawValue.toString()).toBe('2000');
      expect(result.slices[1].percent.toString()).toBe('50');
    });

    it('em modo cost_basis com consolidação BRL, não deve somar ativo estrangeiro sem taxa cambial ao total BRL', () => {
      const posBrl = mockBasePosition({
        assetId: 'asset-1',
        ticker: 'PETR4',
        currency: 'BRL',
        totalCost: new Decimal('3000.00'),
      });
      const posUsdNoFx = mockBasePosition({
        assetId: 'asset-2',
        ticker: 'MSFT',
        currency: 'USD',
        totalCost: new Decimal('500.00'), // USD sem FX
        fxRateUsed: null,
      });

      const result = calculatePortfolioAllocation([posBrl, posUsdNoFx], {
        basis: 'cost_basis',
        baseCurrency: 'BRL',
      });

      // Total BRL deve conter somente os 3000 em BRL (nunca somar 500 USD diretamente em BRL)
      expect(result.totalCalculatedValue.toString()).toBe('3000');
      expect(result.slices).toHaveLength(1);
      expect(result.slices[0].label).toBe('PETR4');
    });
  });

  describe('Ativos Estrangeiros Sem Câmbio Válido em Consolidação BRL', () => {
    it('não deve incluir ativo estrangeiro no total BRL se marketValueBrl for nulo', () => {
      const posBrl = mockBasePosition({
        assetId: 'asset-brl',
        ticker: 'PETR4',
        currency: 'BRL',
        marketValue: new Decimal('5000.00'),
      });
      const posUsdNoFx = mockBasePosition({
        assetId: 'asset-usd',
        ticker: 'MSFT',
        currency: 'USD',
        marketValue: new Decimal('1000.00'), // USD
        marketValueBrl: null, // Sem câmbio disponível
        totalCost: new Decimal('800.00'),
      });

      const result = calculatePortfolioAllocation([posBrl, posUsdNoFx], {
        basis: 'market_value',
        baseCurrency: 'BRL',
      });

      expect(result.totalCalculatedValue.toString()).toBe('5000');
      expect(result.slices).toHaveLength(1);
      expect(result.slices[0].label).toBe('PETR4');
      expect(result.quotedPositionsCount).toBe(1);
      expect(result.unquotedPositionsCount).toBe(1);
    });
  });

  describe('Serialização para Transporte', () => {
    it('deve serializar corretamente todos os campos do resultado para strings sem numericValue', () => {
      const pos = mockBasePosition();
      const result = calculatePortfolioAllocation([pos]);
      const serialized = serializePortfolioAllocation(result);

      expect(typeof serialized.totalCalculatedValue).toBe('string');
      expect(typeof serialized.unquotedTotalCost).toBe('string');
      expect(serialized.slices[0].rawValue).toBe('3500');
      expect(serialized.slices[0].percent).toBe('100');
      expect((serialized.slices[0] as unknown as Record<string, unknown>).numericValue).toBeUndefined();
    });
  });
});
