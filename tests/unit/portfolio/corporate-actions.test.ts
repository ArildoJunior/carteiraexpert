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
});
