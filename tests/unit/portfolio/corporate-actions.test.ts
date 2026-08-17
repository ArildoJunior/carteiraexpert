import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import {
  calculateAssetPosition,
  validateTimelineConsistency,
  type TimelineEvent,
} from '../../../src/modules/portfolio/domain/position-engine';
import {
  InsufficientPositionError,
  RetroactiveInconsistencyError,
} from '../../../src/modules/portfolio/domain/errors';
import {
  createCorporateActionEventSchema,
  createBonusEventSchema,
  createIncomeEventSchema,
} from '../../../src/modules/portfolio/domain/portfolio-event.schema';
import type { Asset } from '../../../src/modules/portfolio/domain/asset.types';

describe('Unidade: Eventos Corporativos — Split e Grupamento (Pacote 04.01)', () => {
  const assetId = 'asset-petr4-uuid';
  const portfolioId = 'portfolio-main-uuid';

  const mockAsset: Asset = {
    id: assetId,
    ticker: 'PETR4',
    name: 'Petrobras PN',
    assetType: 'stock',
    market: 'B3',
    currency: 'BRL',
    isCustom: false,
    userId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  describe('1. Desdobramento (SPLIT)', () => {
    it('deve multiplicar a quantidade e reduzir proporcionalmente o custo médio em um split 1:2', () => {
      const events: TimelineEvent[] = [
        {
          id: 'ev-buy-1',
          portfolioId,
          assetId,
          type: 'BUY',
          tradeDate: new Date('2026-01-10T12:00:00Z'),
          quantity: '100',
          unitPrice: '40.00',
          fees: '0.00',
        },
        {
          id: 'ev-split-1',
          portfolioId,
          assetId,
          type: 'SPLIT',
          tradeDate: new Date('2026-01-15T12:00:00Z'),
          quantity: '2', // Fator 2 (1 ação vira 2)
          unitPrice: '0',
          fees: '0',
        },
      ];

      const { position } = calculateAssetPosition(assetId, events, mockAsset);

      // Antes: 100 ações a R$ 40,00 = R$ 4.000,00
      // Depois: 200 ações a R$ 20,00 = R$ 4.000,00 (Custo total invariante)
      expect(position.quantity.toString()).toBe('200');
      expect(position.averagePrice.toString()).toBe('20');
      expect(position.totalCost.toString()).toBe('4000');
      expect(position.hasFractionalShares).toBe(false);
    });

    it('deve processar split 1:10 preservando estritamente o custo total investido', () => {
      const events: TimelineEvent[] = [
        {
          id: 'ev-buy-1',
          portfolioId,
          assetId,
          type: 'BUY',
          tradeDate: new Date('2026-01-10T12:00:00Z'),
          quantity: '50',
          unitPrice: '120.00',
          fees: '15.00', // Custo total = 6000 + 15 = 6015 -> CM = 120.30
        },
        {
          id: 'ev-split-1',
          portfolioId,
          assetId,
          type: 'SPLIT',
          tradeDate: new Date('2026-01-20T12:00:00Z'),
          quantity: '10', // Fator 10
          unitPrice: '0',
          fees: '0',
        },
      ];

      const { position } = calculateAssetPosition(assetId, events, mockAsset);

      // Antes: 50 ações, custo total = 6015, CM = 120.30
      // Depois: 500 ações, custo total = 6015, CM = 12.03
      expect(position.quantity.toString()).toBe('500');
      expect(position.averagePrice.toString()).toBe('12.03');
      expect(position.totalCost.toString()).toBe('6015');
      expect(position.hasFractionalShares).toBe(false);
    });

    it('deve apurar PnL realizado corretamente em venda posterior ao split', () => {
      const events: TimelineEvent[] = [
        {
          id: 'ev-buy-1',
          portfolioId,
          assetId,
          type: 'BUY',
          tradeDate: new Date('2026-01-10T12:00:00Z'),
          quantity: '100',
          unitPrice: '50.00',
          fees: '0.00', // Custo total = 5000, CM = 50
        },
        {
          id: 'ev-split-1',
          portfolioId,
          assetId,
          type: 'SPLIT',
          tradeDate: new Date('2026-01-15T12:00:00Z'),
          quantity: '2', // 200 ações a CM 25.00
          unitPrice: '0',
          fees: '0',
        },
        {
          id: 'ev-sell-1',
          portfolioId,
          assetId,
          type: 'SELL',
          tradeDate: new Date('2026-01-20T12:00:00Z'),
          quantity: '50', // Venda de 50 ações a R$ 30,00 (CM = 25.00 -> Lucro de 5,00 por ação = 250,00)
          unitPrice: '30.00',
          fees: '5.00', // Lucro líquido = (50 * 30 - 5) - (50 * 25) = 1495 - 1250 = 245,00
        },
      ];

      const { position, realizedTrades } = calculateAssetPosition(assetId, events, mockAsset);

      expect(position.quantity.toString()).toBe('150');
      expect(position.averagePrice.toString()).toBe('25');
      expect(position.totalCost.toString()).toBe('3750');
      expect(position.totalRealizedPnL.toString()).toBe('245');

      expect(realizedTrades).toHaveLength(1);
      expect(realizedTrades[0].costBasisPrice.toString()).toBe('25');
      expect(realizedTrades[0].realizedPnL.toString()).toBe('245');
    });
  });

  describe('2. Grupamento (GROUPING)', () => {
    it('deve dividir a quantidade e multiplicar proporcionalmente o custo médio em um grupamento 10:1', () => {
      const events: TimelineEvent[] = [
        {
          id: 'ev-buy-1',
          portfolioId,
          assetId,
          type: 'BUY',
          tradeDate: new Date('2026-01-10T12:00:00Z'),
          quantity: '1000',
          unitPrice: '2.50',
          fees: '0.00', // Custo total = 2500, CM = 2.50
        },
        {
          id: 'ev-grouping-1',
          portfolioId,
          assetId,
          type: 'GROUPING',
          tradeDate: new Date('2026-01-15T12:00:00Z'),
          quantity: '10', // Fator 10 (10 ações viram 1)
          unitPrice: '0',
          fees: '0',
        },
      ];

      const { position } = calculateAssetPosition(assetId, events, mockAsset);

      // Antes: 1000 ações a R$ 2,50 = R$ 2.500,00
      // Depois: 100 ações a R$ 25,00 = R$ 2.500,00 (Custo total invariante)
      expect(position.quantity.toString()).toBe('100');
      expect(position.averagePrice.toString()).toBe('25');
      expect(position.totalCost.toString()).toBe('2500');
      expect(position.hasFractionalShares).toBe(false);
    });

    it('deve preservar frações residuais em grupamento não divisível e sinalizar hasFractionalShares', () => {
      const events: TimelineEvent[] = [
        {
          id: 'ev-buy-1',
          portfolioId,
          assetId,
          type: 'BUY',
          tradeDate: new Date('2026-01-10T12:00:00Z'),
          quantity: '105', // 105 ações a R$ 2,00 = R$ 210,00
          unitPrice: '2.00',
          fees: '0.00',
        },
        {
          id: 'ev-grouping-1',
          portfolioId,
          assetId,
          type: 'GROUPING',
          tradeDate: new Date('2026-01-15T12:00:00Z'),
          quantity: '10', // Fator 10 -> 10.5 ações a R$ 20,00 = R$ 210,00
          unitPrice: '0',
          fees: '0',
        },
      ];

      const { position } = calculateAssetPosition(assetId, events, mockAsset);

      expect(position.quantity.toString()).toBe('10.5');
      expect(position.averagePrice.toString()).toBe('20');
      expect(position.totalCost.toString()).toBe('210');
      expect(position.hasFractionalShares).toBe(true);
    });

    it('deve apurar PnL realizado corretamente em venda posterior ao grupamento', () => {
      const events: TimelineEvent[] = [
        {
          id: 'ev-buy-1',
          portfolioId,
          assetId,
          type: 'BUY',
          tradeDate: new Date('2026-01-10T12:00:00Z'),
          quantity: '1000',
          unitPrice: '1.00',
          fees: '0.00', // Custo total = 1000
        },
        {
          id: 'ev-grouping-1',
          portfolioId,
          assetId,
          type: 'GROUPING',
          tradeDate: new Date('2026-01-15T12:00:00Z'),
          quantity: '10', // 100 ações a CM 10.00
          unitPrice: '0',
          fees: '0',
        },
        {
          id: 'ev-sell-1',
          portfolioId,
          assetId,
          type: 'SELL',
          tradeDate: new Date('2026-01-20T12:00:00Z'),
          quantity: '40', // Vende 40 a R$ 15,00 (Lucro de 5,00 por ação = 200,00)
          unitPrice: '15.00',
          fees: '0.00',
        },
      ];

      const { position, realizedTrades } = calculateAssetPosition(assetId, events, mockAsset);

      expect(position.quantity.toString()).toBe('60');
      expect(position.averagePrice.toString()).toBe('10');
      expect(position.totalCost.toString()).toBe('600');
      expect(position.totalRealizedPnL.toString()).toBe('200');

      expect(realizedTrades).toHaveLength(1);
      expect(realizedTrades[0].costBasisPrice.toString()).toBe('10');
      expect(realizedTrades[0].realizedPnL.toString()).toBe('200');
    });

    it('deve processar múltiplos eventos encadeados (Compra -> Split 1:2 -> Grupamento 5:1 -> Venda parcial -> posição residual) com determinismo', () => {
      // 1. Compra 105 ações a R$ 20,00 (Custo = R$ 2.100,00)
      // 2. Split 1:2 -> 210 ações a R$ 10,00 (Custo invariante = R$ 2.100,00)
      // 3. Grupamento 5:1 -> 42 ações a R$ 50,00 (Custo invariante = R$ 2.100,00)
      // 4. Venda parcial de 12 ações a R$ 60,00 (Taxa = R$ 10,00)
      //    - Receita líquida = 12 * 60 - 10 = 710,00
      //    - Custo base = 12 * 50 = 600,00
      //    - PnL realizado = +110,00
      //    - Quantidade residual = 30 ações a R$ 50,00
      //    - Custo residual = 1.500,00
      //    - hasFractionalShares = false
      const events: TimelineEvent[] = [
        {
          id: 'ev-buy-1',
          portfolioId,
          assetId,
          type: 'BUY',
          tradeDate: new Date('2026-01-10T10:00:00Z'),
          quantity: '105',
          unitPrice: '20.00',
          fees: '0.00',
          createdAt: new Date('2026-01-10T10:00:00Z'),
        },
        {
          id: 'ev-split-1',
          portfolioId,
          assetId,
          type: 'SPLIT',
          tradeDate: new Date('2026-01-15T10:00:00Z'),
          quantity: '2',
          unitPrice: '0',
          fees: '0',
          createdAt: new Date('2026-01-15T10:00:00Z'),
        },
        {
          id: 'ev-grouping-1',
          portfolioId,
          assetId,
          type: 'GROUPING',
          tradeDate: new Date('2026-01-20T10:00:00Z'),
          quantity: '5',
          unitPrice: '0',
          fees: '0',
          createdAt: new Date('2026-01-20T10:00:00Z'),
        },
        {
          id: 'ev-sell-1',
          portfolioId,
          assetId,
          type: 'SELL',
          tradeDate: new Date('2026-01-25T10:00:00Z'),
          quantity: '12',
          unitPrice: '60.00',
          fees: '10.00',
          createdAt: new Date('2026-01-25T10:00:00Z'),
        },
      ];

      // Primeira execução
      const res1 = calculateAssetPosition(assetId, events, mockAsset);
      expect(res1.position.quantity.toString()).toBe('30');
      expect(res1.position.averagePrice.toString()).toBe('50');
      expect(res1.position.totalCost.toString()).toBe('1500');
      expect(res1.position.totalFees.toString()).toBe('10');
      expect(res1.position.totalRealizedPnL.toString()).toBe('110');
      expect(res1.position.hasFractionalShares).toBe(false);

      expect(res1.realizedTrades).toHaveLength(1);
      expect(res1.realizedTrades[0].costBasisPrice.toString()).toBe('50');
      expect(res1.realizedTrades[0].totalCostBasis.toString()).toBe('600');
      expect(res1.realizedTrades[0].totalProceedsNet.toString()).toBe('710');
      expect(res1.realizedTrades[0].realizedPnL.toString()).toBe('110');

      // Segunda execução (determinismo estrito)
      const res2 = calculateAssetPosition(assetId, events, mockAsset);
      expect(res2.position.quantity.toString()).toBe(res1.position.quantity.toString());
      expect(res2.position.averagePrice.toString()).toBe(res1.position.averagePrice.toString());
      expect(res2.position.totalCost.toString()).toBe(res1.position.totalCost.toString());
      expect(res2.position.totalRealizedPnL.toString()).toBe(res1.position.totalRealizedPnL.toString());
      expect(res2.position.hasFractionalShares).toBe(res1.position.hasFractionalShares);
    });

    it('deve processar múltiplos eventos encadeados gerando e preservando fração residual finita', () => {
      // 1. Compra 105 ações a R$ 20,00 (Custo = R$ 2.100,00)
      // 2. Split 1:2 -> 210 ações a R$ 10,00 (Custo invariante = R$ 2.100,00)
      // 3. Grupamento 4:1 -> 52.5 ações a R$ 40,00 (Custo invariante = R$ 2.100,00, hasFractionalShares = true)
      // 4. Venda de 12 ações a R$ 60,00 (Taxa = R$ 0,00)
      //    - Receita líquida = 12 * 60 = 720,00
      //    - Custo base = 12 * 40 = 480,00
      //    - PnL = 720 - 480 = +240,00
      //    - Restante = 40.5 ações a R$ 40,00 (Custo residual = 1.620,00)
      //    - hasFractionalShares = true
      const events: TimelineEvent[] = [
        {
          id: 'ev-buy-1',
          portfolioId,
          assetId,
          type: 'BUY',
          tradeDate: new Date('2026-01-10T10:00:00Z'),
          quantity: '105',
          unitPrice: '20.00',
          fees: '0.00',
        },
        {
          id: 'ev-split-1',
          portfolioId,
          assetId,
          type: 'SPLIT',
          tradeDate: new Date('2026-01-15T10:00:00Z'),
          quantity: '2',
          unitPrice: '0',
          fees: '0',
        },
        {
          id: 'ev-grouping-1',
          portfolioId,
          assetId,
          type: 'GROUPING',
          tradeDate: new Date('2026-01-20T10:00:00Z'),
          quantity: '4',
          unitPrice: '0',
          fees: '0',
        },
        {
          id: 'ev-sell-1',
          portfolioId,
          assetId,
          type: 'SELL',
          tradeDate: new Date('2026-01-25T10:00:00Z'),
          quantity: '12',
          unitPrice: '60.00',
          fees: '0.00',
        },
      ];

      const { position, realizedTrades } = calculateAssetPosition(assetId, events, mockAsset);
      expect(position.quantity.toString()).toBe('40.5');
      expect(position.hasFractionalShares).toBe(true);
      expect(position.averagePrice.toString()).toBe('40');
      expect(position.totalCost.toString()).toBe('1620');
      expect(position.totalRealizedPnL.toString()).toBe('240');
      expect(realizedTrades).toHaveLength(1);
      expect(realizedTrades[0].realizedPnL.toString()).toBe('240');
    });
  });

  describe('3. Validação Temporal e Reprocessamento', () => {
    it('deve rejeitar split em data onde a posição é nula (sem compras prévias)', () => {
      const existingEvents: TimelineEvent[] = [];
      const prospectiveSplit: TimelineEvent = {
        id: 'ev-split-1',
        portfolioId,
        assetId,
        type: 'SPLIT',
        tradeDate: new Date('2026-01-15T12:00:00Z'),
        quantity: '2',
        unitPrice: '0',
        fees: '0',
      };

      expect(() => {
        validateTimelineConsistency(existingEvents, prospectiveSplit);
      }).toThrow(InsufficientPositionError);
    });

    it('deve rejeitar grupamento em data onde a posição é nula', () => {
      const existingEvents: TimelineEvent[] = [];
      const prospectiveGrouping: TimelineEvent = {
        id: 'ev-grouping-1',
        portfolioId,
        assetId,
        type: 'GROUPING',
        tradeDate: new Date('2026-01-15T12:00:00Z'),
        quantity: '10',
        unitPrice: '0',
        fees: '0',
      };

      expect(() => {
        validateTimelineConsistency(existingEvents, prospectiveGrouping);
      }).toThrow(InsufficientPositionError);
    });

    it('deve rejeitar split retroativo caso inserção anterior gere inconsistência temporal', () => {
      const existingEvents: TimelineEvent[] = [
        {
          id: 'ev-buy-1',
          portfolioId,
          assetId,
          type: 'BUY',
          tradeDate: new Date('2026-01-20T12:00:00Z'),
          quantity: '100',
          unitPrice: '20.00',
          fees: '0.00',
        },
      ];

      // Split em 2026-01-10 (antes da compra de 2026-01-20)
      const retroactiveSplit: TimelineEvent = {
        id: 'ev-split-early',
        portfolioId,
        assetId,
        type: 'SPLIT',
        tradeDate: new Date('2026-01-10T12:00:00Z'),
        quantity: '2',
        unitPrice: '0',
        fees: '0',
      };

      expect(() => {
        validateTimelineConsistency(existingEvents, retroactiveSplit);
      }).toThrow(InsufficientPositionError);
    });

    it('deve permitir inserção de split retroativo entre uma compra e uma venda válida', () => {
      const existingEvents: TimelineEvent[] = [
        {
          id: 'ev-buy-1',
          portfolioId,
          assetId,
          type: 'BUY',
          tradeDate: new Date('2026-01-05T12:00:00Z'),
          quantity: '100',
          unitPrice: '50.00',
          fees: '0.00',
        },
        {
          id: 'ev-sell-1',
          portfolioId,
          assetId,
          type: 'SELL',
          tradeDate: new Date('2026-01-20T12:00:00Z'),
          quantity: '150', // Venda de 150 (só é válida se houver split 1:2 antes)
          unitPrice: '30.00',
          fees: '0.00',
        },
      ];

      const splitBetween: TimelineEvent = {
        id: 'ev-split-between',
        portfolioId,
        assetId,
        type: 'SPLIT',
        tradeDate: new Date('2026-01-10T12:00:00Z'),
        quantity: '2', // 100 vira 200, permitindo a venda de 150 em 20/01
        unitPrice: '0',
        fees: '0',
      };

      expect(() => {
        validateTimelineConsistency(existingEvents, splitBetween);
      }).not.toThrow();
    });
  });

  describe('4. Validação de Schemas Zod', () => {
    it('deve validar com sucesso a criação de SPLIT válido', () => {
      const validPortfolioId = '123e4567-e89b-12d3-a456-426614174000';
      const validAssetId = '223e4567-e89b-12d3-a456-426614174000';

      const parsed = createCorporateActionEventSchema.parse({
        portfolioId: validPortfolioId,
        assetId: validAssetId,
        type: 'SPLIT',
        tradeDate: '2026-08-15T12:00:00.000Z',
        factor: '10',
        notes: 'Desdobramento 1:10 aprovado',
      });

      expect(parsed.type).toBe('SPLIT');
      expect(parsed.factor.toString()).toBe('10');
      expect(parsed.source).toBe('corporate_action');
    });

    it('deve validar com sucesso a criação de GROUPING válido', () => {
      const validPortfolioId = '123e4567-e89b-12d3-a456-426614174000';
      const validAssetId = '223e4567-e89b-12d3-a456-426614174000';

      const parsed = createCorporateActionEventSchema.parse({
        portfolioId: validPortfolioId,
        assetId: validAssetId,
        type: 'GROUPING',
        tradeDate: '2026-08-15T12:00:00.000Z',
        factor: '5',
      });

      expect(parsed.type).toBe('GROUPING');
      expect(parsed.factor.toString()).toBe('5');
    });

    it('deve rejeitar fator menor ou igual a zero', () => {
      const validPortfolioId = '123e4567-e89b-12d3-a456-426614174000';
      const validAssetId = '223e4567-e89b-12d3-a456-426614174000';

      expect(() => {
        createCorporateActionEventSchema.parse({
          portfolioId: validPortfolioId,
          assetId: validAssetId,
          type: 'SPLIT',
          tradeDate: '2026-08-15T12:00:00.000Z',
          factor: '0',
        });
      }).toThrow();

      expect(() => {
        createCorporateActionEventSchema.parse({
          portfolioId: validPortfolioId,
          assetId: validAssetId,
          type: 'SPLIT',
          tradeDate: '2026-08-15T12:00:00.000Z',
          factor: '-2',
        });
      }).toThrow();
    });

    it('deve rejeitar tipo inválido fora de SPLIT ou GROUPING', () => {
      const validPortfolioId = '123e4567-e89b-12d3-a456-426614174000';
      const validAssetId = '223e4567-e89b-12d3-a456-426614174000';

      expect(() => {
        createCorporateActionEventSchema.parse({
          portfolioId: validPortfolioId,
          assetId: validAssetId,
          type: 'BUY' as any,
          tradeDate: '2026-08-15T12:00:00.000Z',
          factor: '2',
        });
      }).toThrow();
    });
  });

  describe('5. Bonificação de Ações (BONUS_SHARE — Pacote 04.02)', () => {
    it('deve processar bonificação com custo unitário zero (reduzindo custo médio unitário)', () => {
      const events: TimelineEvent[] = [
        {
          id: 'ev-buy-1',
          portfolioId,
          assetId,
          type: 'BUY',
          tradeDate: new Date('2026-01-10T12:00:00Z'),
          quantity: '100',
          unitPrice: '30.00',
          fees: '0.00', // Custo total: 3.000,00
        },
        {
          id: 'ev-bonus-1',
          portfolioId,
          assetId,
          type: 'BONUS_SHARE',
          tradeDate: new Date('2026-01-20T12:00:00Z'),
          quantity: '20', // +20 ações
          unitPrice: '0.00', // Custo atribuído: 0
          fees: '0.00',
        },
      ];

      const { position } = calculateAssetPosition(assetId, events, mockAsset);

      // Quantidade: 100 + 20 = 120
      // Custo Total: 3.000 + (20 * 0) = 3.000
      // Custo Médio: 3.000 / 120 = 25,00
      expect(position.quantity.toString()).toBe('120');
      expect(position.totalCost.toString()).toBe('3000');
      expect(position.averagePrice.toString()).toBe('25');
      expect(position.hasFractionalShares).toBe(false);
    });

    it('deve processar bonificação com custo unitário atribuído positivo aumentando o custo total', () => {
      const events: TimelineEvent[] = [
        {
          id: 'ev-buy-1',
          portfolioId,
          assetId,
          type: 'BUY',
          tradeDate: new Date('2026-01-10T12:00:00Z'),
          quantity: '100',
          unitPrice: '20.00',
          fees: '0.00', // Custo total: 2.000,00
        },
        {
          id: 'ev-bonus-1',
          portfolioId,
          assetId,
          type: 'BONUS_SHARE',
          tradeDate: new Date('2026-01-20T12:00:00Z'),
          quantity: '10', // +10 ações
          unitPrice: '15.40', // Custo atribuído: R$ 15,40 por ação = R$ 154,00 adicionados
          fees: '0.00',
        },
      ];

      const { position } = calculateAssetPosition(assetId, events, mockAsset);

      // Quantidade: 100 + 10 = 110
      // Custo Total: 2.000 + 154 = 2.154,00
      // Custo Médio: 2.154 / 110 = 19.58181818...
      expect(position.quantity.toString()).toBe('110');
      expect(position.totalCost.toString()).toBe('2154');
      expect(position.averagePrice.toFixed(8)).toBe(new Decimal('2154').dividedBy('110').toFixed(8));
      expect(position.hasFractionalShares).toBe(false);
    });

    it('deve preservar frações decimais e sinalizar hasFractionalShares em bonificações fracionárias', () => {
      const events: TimelineEvent[] = [
        {
          id: 'ev-buy-1',
          portfolioId,
          assetId,
          type: 'BUY',
          tradeDate: new Date('2026-01-10T12:00:00Z'),
          quantity: '100',
          unitPrice: '10.00',
          fees: '0.00',
        },
        {
          id: 'ev-bonus-1',
          portfolioId,
          assetId,
          type: 'BONUS_SHARE',
          tradeDate: new Date('2026-01-20T12:00:00Z'),
          quantity: '7.5', // 7.5 ações bonificadas
          unitPrice: '0.00',
          fees: '0.00',
        },
      ];

      const { position } = calculateAssetPosition(assetId, events, mockAsset);

      expect(position.quantity.toString()).toBe('107.5');
      expect(position.hasFractionalShares).toBe(true);
    });

    it('deve apurar PnL de venda corretamente após bonificação de ações', () => {
      const events: TimelineEvent[] = [
        {
          id: 'ev-buy-1',
          portfolioId,
          assetId,
          type: 'BUY',
          tradeDate: new Date('2026-01-10T12:00:00Z'),
          quantity: '100',
          unitPrice: '30.00',
          fees: '0.00', // Custo total: 3.000,00
        },
        {
          id: 'ev-bonus-1',
          portfolioId,
          assetId,
          type: 'BONUS_SHARE',
          tradeDate: new Date('2026-01-15T12:00:00Z'),
          quantity: '20', // 120 ações a CM 25.00
          unitPrice: '0.00',
          fees: '0.00',
        },
        {
          id: 'ev-sell-1',
          portfolioId,
          assetId,
          type: 'SELL',
          tradeDate: new Date('2026-01-25T12:00:00Z'),
          quantity: '40', // Venda de 40 ações a R$ 35,00 (CM = 25.00 -> Lucro de 10,00 por ação = 400,00)
          unitPrice: '35.00',
          fees: '0.00',
        },
      ];

      const { position, realizedTrades } = calculateAssetPosition(assetId, events, mockAsset);

      expect(position.quantity.toString()).toBe('80');
      expect(position.averagePrice.toString()).toBe('25');
      expect(position.totalCost.toString()).toBe('2000');
      expect(position.totalRealizedPnL.toString()).toBe('400');

      expect(realizedTrades).toHaveLength(1);
      expect(realizedTrades[0].costBasisPrice.toString()).toBe('25');
      expect(realizedTrades[0].realizedPnL.toString()).toBe('400');
    });

    it('deve rejeitar bonificação quando não houver posição em custódia na Data-Com', () => {
      const prospectiveBonus: TimelineEvent = {
        id: 'ev-bonus-fail',
        portfolioId,
        assetId,
        type: 'BONUS_SHARE',
        tradeDate: new Date('2026-01-15T12:00:00Z'),
        quantity: '10',
        unitPrice: '0',
        fees: '0',
      };

      expect(() => {
        validateTimelineConsistency([], prospectiveBonus);
      }).toThrow(InsufficientPositionError);
    });
  });

  describe('6. Dividendos (DIVIDEND — Pacote 04.02)', () => {
    it('deve acumular totalIncomeReceived sem alterar quantidade, custo total ou custo médio da posição', () => {
      const events: TimelineEvent[] = [
        {
          id: 'ev-buy-1',
          portfolioId,
          assetId,
          type: 'BUY',
          tradeDate: new Date('2026-01-10T12:00:00Z'),
          quantity: '100',
          unitPrice: '25.00',
          fees: '10.00', // Custo total: 2.510,00 | CM: 25.10
        },
        {
          id: 'ev-div-1',
          portfolioId,
          assetId,
          type: 'DIVIDEND',
          tradeDate: new Date('2026-01-20T12:00:00Z'),
          settlementDate: new Date('2026-01-25T12:00:00Z'),
          quantity: '100', // 100 ações elegíveis
          unitPrice: '0.80', // R$ 0,80 por ação = R$ 80,00 de proventos
          fees: '0.00',
        },
      ];

      const { position } = calculateAssetPosition(assetId, events, mockAsset);

      // Quantidade e custos permanecem idênticos
      expect(position.quantity.toString()).toBe('100');
      expect(position.totalCost.toString()).toBe('2510');
      expect(position.averagePrice.toString()).toBe('25.1');
      expect(position.totalIncomeReceived.toString()).toBe('80');
    });

    it('deve rejeitar dividendo se a quantidade informada for maior que a custódia na Data-Com', () => {
      const existingEvents: TimelineEvent[] = [
        {
          id: 'ev-buy-1',
          portfolioId,
          assetId,
          type: 'BUY',
          tradeDate: new Date('2026-01-10T12:00:00Z'),
          quantity: '50',
          unitPrice: '20.00',
          fees: '0.00',
        },
      ];

      const prospectiveDiv: TimelineEvent = {
        id: 'ev-div-oversize',
        portfolioId,
        assetId,
        type: 'DIVIDEND',
        tradeDate: new Date('2026-01-15T12:00:00Z'),
        settlementDate: new Date('2026-01-20T12:00:00Z'),
        quantity: '100', // 100 > 50 existente
        unitPrice: '1.00',
        fees: '0.00',
      };

      expect(() => {
        validateTimelineConsistency(existingEvents, prospectiveDiv);
      }).toThrow(InsufficientPositionError);
    });

    it('deve manter ativo zerado com proventos recebidos na lista de posições encerradas', () => {
      const events: TimelineEvent[] = [
        {
          id: 'ev-buy-1',
          portfolioId,
          assetId,
          type: 'BUY',
          tradeDate: new Date('2026-01-10T12:00:00Z'),
          quantity: '100',
          unitPrice: '20.00',
          fees: '0.00',
        },
        {
          id: 'ev-div-1',
          portfolioId,
          assetId,
          type: 'DIVIDEND',
          tradeDate: new Date('2026-01-15T12:00:00Z'),
          settlementDate: new Date('2026-01-20T12:00:00Z'),
          quantity: '100',
          unitPrice: '1.50', // R$ 150,00 de proventos
          fees: '0.00',
        },
        {
          id: 'ev-sell-1',
          portfolioId,
          assetId,
          type: 'SELL',
          tradeDate: new Date('2026-01-25T12:00:00Z'),
          quantity: '100', // Liquidação total
          unitPrice: '20.00',
          fees: '0.00',
        },
      ];

      const { position } = calculateAssetPosition(assetId, events, mockAsset);

      expect(position.quantity.toString()).toBe('0');
      expect(position.totalIncomeReceived.toString()).toBe('150');
    });
  });

  describe('7. Juros sobre Capital Próprio (JCP — Pacote 04.02)', () => {
    it('deve calcular provento líquido subtraindo o IRRF retido e manter posição intacta', () => {
      const events: TimelineEvent[] = [
        {
          id: 'ev-buy-1',
          portfolioId,
          assetId,
          type: 'BUY',
          tradeDate: new Date('2026-01-10T12:00:00Z'),
          quantity: '200',
          unitPrice: '15.00',
          fees: '0.00', // Custo total: 3.000,00 | CM: 15.00
        },
        {
          id: 'ev-jcp-1',
          portfolioId,
          assetId,
          type: 'JCP',
          tradeDate: new Date('2026-01-20T12:00:00Z'),
          settlementDate: new Date('2026-01-28T12:00:00Z'),
          quantity: '200', // 200 ações elegíveis
          unitPrice: '0.50', // R$ 0,50 bruto por ação = R$ 100,00 bruto
          fees: '15.00', // R$ 15,00 de IRRF (15%) -> Líquido = R$ 85,00
        },
      ];

      const { position } = calculateAssetPosition(assetId, events, mockAsset);

      expect(position.quantity.toString()).toBe('200');
      expect(position.totalCost.toString()).toBe('3000');
      expect(position.averagePrice.toString()).toBe('15');
      // Provento líquido acumulado = 100 - 15 = 85
      expect(position.totalIncomeReceived.toString()).toBe('85');
    });

    it('deve rejeitar JCP se quantidade informada exceder a custódia na Data-Com', () => {
      const existingEvents: TimelineEvent[] = [
        {
          id: 'ev-buy-1',
          portfolioId,
          assetId,
          type: 'BUY',
          tradeDate: new Date('2026-01-10T12:00:00Z'),
          quantity: '50',
          unitPrice: '20.00',
          fees: '0.00',
        },
      ];

      const prospectiveJcp: TimelineEvent = {
        id: 'ev-jcp-oversize',
        portfolioId,
        assetId,
        type: 'JCP',
        tradeDate: new Date('2026-01-15T12:00:00Z'),
        settlementDate: new Date('2026-01-20T12:00:00Z'),
        quantity: '80', // 80 > 50
        unitPrice: '1.00',
        fees: '12.00',
      };

      expect(() => {
        validateTimelineConsistency(existingEvents, prospectiveJcp);
      }).toThrow(InsufficientPositionError);
    });
  });

  describe('8. Validação de Schemas Zod (Bonificação e Proventos)', () => {
    const validPortfolioId = '123e4567-e89b-12d3-a456-426614174000';
    const validAssetId = '223e4567-e89b-12d3-a456-426614174000';

    it('deve validar criação de BONUS_SHARE com unitPrice zero', () => {
      const parsed = createBonusEventSchema.parse({
        portfolioId: validPortfolioId,
        assetId: validAssetId,
        type: 'BONUS_SHARE',
        tradeDate: '2026-08-15T12:00:00.000Z',
        quantity: '10',
        unitPrice: '0',
      });

      expect(parsed.type).toBe('BONUS_SHARE');
      expect(parsed.quantity).toBe('10');
      expect(parsed.unitPrice).toBe('0');
    });

    it('deve rejeitar BONUS_SHARE com unitPrice negativo ou quantity <= 0', () => {
      expect(() => {
        createBonusEventSchema.parse({
          portfolioId: validPortfolioId,
          assetId: validAssetId,
          type: 'BONUS_SHARE',
          tradeDate: '2026-08-15T12:00:00.000Z',
          quantity: '0',
          unitPrice: '10',
        });
      }).toThrow();

      expect(() => {
        createBonusEventSchema.parse({
          portfolioId: validPortfolioId,
          assetId: validAssetId,
          type: 'BONUS_SHARE',
          tradeDate: '2026-08-15T12:00:00.000Z',
          quantity: '10',
          unitPrice: '-1',
        });
      }).toThrow();
    });

    it('deve validar criação de DIVIDEND e JCP com settlementDate válida', () => {
      const div = createIncomeEventSchema.parse({
        portfolioId: validPortfolioId,
        assetId: validAssetId,
        type: 'DIVIDEND',
        tradeDate: '2026-08-15T12:00:00.000Z',
        settlementDate: '2026-08-20T12:00:00.000Z',
        quantity: '100',
        unitPrice: '0.75',
      });

      expect(div.type).toBe('DIVIDEND');
      expect(div.quantity).toBe('100');

      const jcp = createIncomeEventSchema.parse({
        portfolioId: validPortfolioId,
        assetId: validAssetId,
        type: 'JCP',
        tradeDate: '2026-08-15T12:00:00.000Z',
        settlementDate: '2026-08-20T12:00:00.000Z',
        quantity: '100',
        unitPrice: '1.00',
        fees: '15.00',
      });

      expect(jcp.type).toBe('JCP');
      expect(jcp.fees).toBe('15');
    });

    it('deve rejeitar provento com settlementDate anterior à tradeDate', () => {
      expect(() => {
        createIncomeEventSchema.parse({
          portfolioId: validPortfolioId,
          assetId: validAssetId,
          type: 'DIVIDEND',
          tradeDate: '2026-08-20T12:00:00.000Z',
          settlementDate: '2026-08-15T12:00:00.000Z', // Anterior!
          quantity: '100',
          unitPrice: '0.75',
        });
      }).toThrow();
    });

    it('deve rejeitar JCP quando IRRF (fees) for maior ou igual ao valor bruto total', () => {
      expect(() => {
        createIncomeEventSchema.parse({
          portfolioId: validPortfolioId,
          assetId: validAssetId,
          type: 'JCP',
          tradeDate: '2026-08-15T12:00:00.000Z',
          settlementDate: '2026-08-20T12:00:00.000Z',
          quantity: '10',
          unitPrice: '1.00', // Gross = 10.00
          fees: '10.00', // Fees == Gross (Rejeita!)
        });
      }).toThrow();

      expect(() => {
        createIncomeEventSchema.parse({
          portfolioId: validPortfolioId,
          assetId: validAssetId,
          type: 'JCP',
          tradeDate: '2026-08-15T12:00:00.000Z',
          settlementDate: '2026-08-20T12:00:00.000Z',
          quantity: '10',
          unitPrice: '1.00', // Gross = 10.00
          fees: '12.00', // Fees > Gross (Rejeita!)
        });
      }).toThrow();
    });
  });

  describe('8. Testes de Regressão de Replay (Validações de Domínio Direto na Reconstrução de Linha do Tempo)', () => {
    it('deve lançar erro se evento SPLIT corrompido no banco possuir fator <= 0 durante o replay', () => {
      const corruptEvents: TimelineEvent[] = [
        {
          id: 'ev-1',
          portfolioId,
          assetId,
          type: 'BUY',
          tradeDate: new Date('2026-01-01'),
          quantity: '100',
          unitPrice: '10',
          fees: '0',
        },
        {
          id: 'ev-2',
          portfolioId,
          assetId,
          type: 'SPLIT',
          tradeDate: new Date('2026-01-02'),
          quantity: '0', // Fator inválido
          unitPrice: '0',
          fees: '0',
        },
      ];
      expect(() => calculateAssetPosition(assetId, corruptEvents, mockAsset)).toThrow(
        'Fator de desdobramento (SPLIT) deve ser maior que zero.'
      );
    });

    it('deve lançar erro se evento GROUPING corrompido no banco possuir fator <= 0 durante o replay', () => {
      const corruptEvents: TimelineEvent[] = [
        {
          id: 'ev-1',
          portfolioId,
          assetId,
          type: 'BUY',
          tradeDate: new Date('2026-01-01'),
          quantity: '100',
          unitPrice: '10',
          fees: '0',
        },
        {
          id: 'ev-2',
          portfolioId,
          assetId,
          type: 'GROUPING',
          tradeDate: new Date('2026-01-02'),
          quantity: '-2', // Fator negativo
          unitPrice: '0',
          fees: '0',
        },
      ];
      expect(() => calculateAssetPosition(assetId, corruptEvents, mockAsset)).toThrow(
        'Fator de grupamento (GROUPING) deve ser maior que zero.'
      );
    });

    it('deve lançar erro se evento BONUS_SHARE corrompido no banco possuir quantidade <= 0 durante o replay', () => {
      const corruptEvents: TimelineEvent[] = [
        {
          id: 'ev-1',
          portfolioId,
          assetId,
          type: 'BUY',
          tradeDate: new Date('2026-01-01'),
          quantity: '100',
          unitPrice: '10',
          fees: '0',
        },
        {
          id: 'ev-2',
          portfolioId,
          assetId,
          type: 'BONUS_SHARE',
          tradeDate: new Date('2026-01-02'),
          quantity: '0', // Qty inválida
          unitPrice: '5',
          fees: '0',
        },
      ];
      expect(() => calculateAssetPosition(assetId, corruptEvents, mockAsset)).toThrow(
        'Quantidade bonificada (BONUS_SHARE) deve ser maior que zero.'
      );
    });

    it('deve lançar erro se evento BONUS_SHARE corrompido no banco possuir preço negativo durante o replay', () => {
      const corruptEvents: TimelineEvent[] = [
        {
          id: 'ev-1',
          portfolioId,
          assetId,
          type: 'BUY',
          tradeDate: new Date('2026-01-01'),
          quantity: '100',
          unitPrice: '10',
          fees: '0',
        },
        {
          id: 'ev-2',
          portfolioId,
          assetId,
          type: 'BONUS_SHARE',
          tradeDate: new Date('2026-01-02'),
          quantity: '10',
          unitPrice: '-1.50', // Preço negativo inválido
          fees: '0',
        },
      ];
      expect(() => calculateAssetPosition(assetId, corruptEvents, mockAsset)).toThrow(
        'Custo unitário atribuído da bonificação não pode ser negativo.'
      );
    });

    it('deve lançar erro se evento DIVIDEND corrompido no banco possuir preço <= 0 durante o replay', () => {
      const corruptEvents: TimelineEvent[] = [
        {
          id: 'ev-1',
          portfolioId,
          assetId,
          type: 'BUY',
          tradeDate: new Date('2026-01-01'),
          quantity: '100',
          unitPrice: '10',
          fees: '0',
        },
        {
          id: 'ev-2',
          portfolioId,
          assetId,
          type: 'DIVIDEND',
          tradeDate: new Date('2026-01-02'),
          quantity: '100',
          unitPrice: '0', // Preço unitário zero
          fees: '0',
        },
      ];
      expect(() => calculateAssetPosition(assetId, corruptEvents, mockAsset)).toThrow(
        'Valor por ação do dividendo deve ser maior que zero.'
      );
    });

    it('deve lançar erro se evento JCP corrompido no banco possuir preço <= 0 durante o replay', () => {
      const corruptEvents: TimelineEvent[] = [
        {
          id: 'ev-1',
          portfolioId,
          assetId,
          type: 'BUY',
          tradeDate: new Date('2026-01-01'),
          quantity: '100',
          unitPrice: '10',
          fees: '0',
        },
        {
          id: 'ev-2',
          portfolioId,
          assetId,
          type: 'JCP',
          tradeDate: new Date('2026-01-02'),
          quantity: '100',
          unitPrice: '-0.50', // Preço unitário negativo
          fees: '0',
        },
      ];
      expect(() => calculateAssetPosition(assetId, corruptEvents, mockAsset)).toThrow(
        'Valor bruto por ação do JCP deve ser maior que zero.'
      );
    });

    it('deve lançar erro se evento JCP corrompido no banco possuir IRRF >= valor bruto total durante o replay', () => {
      const corruptEvents: TimelineEvent[] = [
        {
          id: 'ev-1',
          portfolioId,
          assetId,
          type: 'BUY',
          tradeDate: new Date('2026-01-01'),
          quantity: '100',
          unitPrice: '10',
          fees: '0',
        },
        {
          id: 'ev-2',
          portfolioId,
          assetId,
          type: 'JCP',
          tradeDate: new Date('2026-01-02'),
          quantity: '100',
          unitPrice: '1.00', // Gross = 100
          fees: '100.00', // Fees == Gross
        },
      ];
      expect(() => calculateAssetPosition(assetId, corruptEvents, mockAsset)).toThrow(
        'O valor do IRRF retido no JCP não pode ser igual ou superior ao valor bruto total.'
      );
    });
  });
});
