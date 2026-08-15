import { describe, it, expect } from 'vitest';
import {
  createPortfolioSchema,
  updatePortfolioSchema,
} from '../../../src/modules/portfolio/domain/portfolio.schema';
import {
  createCustomAssetSchema,
  searchAssetsSchema,
} from '../../../src/modules/portfolio/domain/asset.schema';
import {
  createPortfolioEventSchema,
  cancelPortfolioEventSchema,
} from '../../../src/modules/portfolio/domain/portfolio-event.schema';
import crypto from 'node:crypto';

describe('Unitário: Schemas e Validações das Server Actions de Portfólio', () => {
  // ─── 1. Criação e Edição de Carteira ─────────────────────────────────────────
  describe('createPortfolioSchema & updatePortfolioSchema', () => {
    it('deve aceitar dados válidos de criação de carteira', () => {
      const parsed = createPortfolioSchema.parse({
        name: 'Carteira Principal',
        description: 'Foco em dividendos',
        baseCurrency: 'BRL',
      });

      expect(parsed.name).toBe('Carteira Principal');
      expect(parsed.description).toBe('Foco em dividendos');
      expect(parsed.baseCurrency).toBe('BRL');
    });

    it('deve rejeitar nome de carteira vazio ou composto apenas por espaços', () => {
      expect(() =>
        createPortfolioSchema.parse({
          name: '   ',
          baseCurrency: 'BRL',
        })
      ).toThrow();
    });

    it('deve rejeitar moeda base inválida', () => {
      expect(() =>
        createPortfolioSchema.parse({
          name: 'Carteira Inválida',
          baseCurrency: 'BTC',
        })
      ).toThrow();
    });

    it('deve aceitar atualização parcial de nome e status', () => {
      const parsed = updatePortfolioSchema.parse({
        name: 'Novo Nome',
        status: 'archived',
      });

      expect(parsed.name).toBe('Novo Nome');
      expect(parsed.status).toBe('archived');
    });
  });

  // ─── 2. Ativos Customizados e Busca ──────────────────────────────────────────
  describe('createCustomAssetSchema & searchAssetsSchema', () => {
    const userId = crypto.randomUUID();

    it('deve aceitar criação de ativo customizado com ticker e moeda válidos', () => {
      const parsed = createCustomAssetSchema.parse({
        ticker: 'meuativo11',
        name: 'Meu Ativo Customizado',
        currency: 'BRL',
        userId,
      });

      expect(parsed.ticker).toBe('MEUATIVO11');
      expect(parsed.assetType).toBe('custom');
      expect(parsed.market).toBe('CUSTOM');
      expect(parsed.currency).toBe('BRL');
      expect(parsed.userId).toBe(userId);
    });

    it('deve rejeitar ticker com caracteres especiais proibidos', () => {
      expect(() =>
        createCustomAssetSchema.parse({
          ticker: 'MEU ATIVO!',
          name: 'Ativo Inválido',
          userId,
        })
      ).toThrow();
    });

    it('deve aplicar limites padrão e validar busca de ativos', () => {
      const parsed = searchAssetsSchema.parse({
        query: 'petr',
      });

      expect(parsed.query).toBe('petr');
      expect(parsed.limit).toBe(20);
    });
  });

  // ─── 3. Eventos Patrimoniais (Compra / Venda / Cancelamento) ─────────────────
  describe('createPortfolioEventSchema & cancelPortfolioEventSchema', () => {
    const portfolioId = crypto.randomUUID();
    const assetId = crypto.randomUUID();

    it('deve aceitar operação manual de compra com valores decimais válidos', () => {
      const parsed = createPortfolioEventSchema.parse({
        portfolioId,
        assetId,
        type: 'BUY',
        tradeDate: '2026-08-14T12:00:00.000Z',
        settlementDate: '2026-08-16T12:00:00.000Z',
        quantity: '100.5',
        unitPrice: '35.40',
        fees: '4.50',
        currency: 'BRL',
        notes: 'Ordem de compra teste',
        source: 'manual',
      });

      expect(parsed.portfolioId).toBe(portfolioId);
      expect(parsed.assetId).toBe(assetId);
      expect(parsed.type).toBe('BUY');
      expect(parsed.quantity).toBe('100.5');
      expect(parsed.unitPrice).toBe('35.4');
      expect(parsed.fees).toBe('4.5');
    });

    it('deve aceitar operação manual de venda mesmo sem checagem de posição (Pacote 03.01-D)', () => {
      const parsed = createPortfolioEventSchema.parse({
        portfolioId,
        assetId,
        type: 'SELL',
        tradeDate: '2026-08-14T12:00:00.000Z',
        quantity: '9999999',
        unitPrice: '50.00',
        fees: '0',
        currency: 'BRL',
      });

      expect(parsed.type).toBe('SELL');
      expect(parsed.quantity).toBe('9999999');
    });

    it('deve rejeitar quantidade negativa ou zero', () => {
      expect(() =>
        createPortfolioEventSchema.parse({
          portfolioId,
          assetId,
          type: 'BUY',
          tradeDate: '2026-08-14T12:00:00.000Z',
          quantity: '0',
          unitPrice: '10.00',
        })
      ).toThrow();

      expect(() =>
        createPortfolioEventSchema.parse({
          portfolioId,
          assetId,
          type: 'BUY',
          tradeDate: '2026-08-14T12:00:00.000Z',
          quantity: '-5',
          unitPrice: '10.00',
        })
      ).toThrow();
    });

    it('deve rejeitar preço unitário ou taxas negativas', () => {
      expect(() =>
        createPortfolioEventSchema.parse({
          portfolioId,
          assetId,
          type: 'BUY',
          tradeDate: '2026-08-14T12:00:00.000Z',
          quantity: '10',
          unitPrice: '-1.00',
        })
      ).toThrow();

      expect(() =>
        createPortfolioEventSchema.parse({
          portfolioId,
          assetId,
          type: 'BUY',
          tradeDate: '2026-08-14T12:00:00.000Z',
          quantity: '10',
          unitPrice: '10.00',
          fees: '-0.50',
        })
      ).toThrow();
    });

    it('deve rejeitar data de liquidação anterior à data de negociação', () => {
      expect(() =>
        createPortfolioEventSchema.parse({
          portfolioId,
          assetId,
          type: 'BUY',
          tradeDate: '2026-08-15T12:00:00.000Z',
          settlementDate: '2026-08-14T12:00:00.000Z',
          quantity: '10',
          unitPrice: '10.00',
        })
      ).toThrow();
    });

    it('deve exigir justificativa de cancelamento com no mínimo 5 caracteres', () => {
      const valid = cancelPortfolioEventSchema.parse({
        cancellationReason: 'Erro de digitação no preço da ordem',
      });
      expect(valid.cancellationReason).toBe(
        'Erro de digitação no preço da ordem'
      );

      expect(() =>
        cancelPortfolioEventSchema.parse({
          cancellationReason: 'abc',
        })
      ).toThrow();

      expect(() =>
        cancelPortfolioEventSchema.parse({
          cancellationReason: '     ',
        })
      ).toThrow();
    });
  });
});
