import { describe, it, expect } from 'vitest';
import {
  createPortfolioSchema,
  updatePortfolioSchema,
} from '../../../src/modules/portfolio/domain/portfolio.schema';

describe('Portfolio Domain Schemas (Unit Tests)', () => {
  describe('createPortfolioSchema', () => {
    it('deve aceitar payload válido com valores padrão', () => {
      const result = createPortfolioSchema.safeParse({
        name: 'Minha Carteira Principal',
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.name).toBe('Minha Carteira Principal');
      expect(result.data.baseCurrency).toBe('BRL');
      expect(result.data.description).toBeUndefined();
    });

    it('deve aceitar moedas estrangeiras suportadas', () => {
      const resultUsd = createPortfolioSchema.safeParse({
        name: 'Carteira Internacional USD',
        baseCurrency: 'USD',
      });
      expect(resultUsd.success).toBe(true);

      const resultEur = createPortfolioSchema.safeParse({
        name: 'Carteira Europa EUR',
        baseCurrency: 'EUR',
      });
      expect(resultEur.success).toBe(true);
    });

    it('deve fazer trim no nome e na descrição', () => {
      const result = createPortfolioSchema.safeParse({
        name: '   Carteira Com Espaços   ',
        description: '   Descrição com espaços nas pontas   ',
      });

      expect(result.success).toBe(true);
      if (!result.success) return;

      expect(result.data.name).toBe('Carteira Com Espaços');
      expect(result.data.description).toBe('Descrição com espaços nas pontas');
    });

    it('deve rejeitar nome vazio ou apenas com espaços', () => {
      const resultEmpty = createPortfolioSchema.safeParse({
        name: '',
      });
      expect(resultEmpty.success).toBe(false);

      const resultSpaces = createPortfolioSchema.safeParse({
        name: '     ',
      });
      expect(resultSpaces.success).toBe(false);
    });

    it('deve rejeitar nome que excede 100 caracteres', () => {
      const result = createPortfolioSchema.safeParse({
        name: 'A'.repeat(101),
      });
      expect(result.success).toBe(false);
    });

    it('deve rejeitar descrição que excede 500 caracteres', () => {
      const result = createPortfolioSchema.safeParse({
        name: 'Carteira Válida',
        description: 'A'.repeat(501),
      });
      expect(result.success).toBe(false);
    });

    it('deve rejeitar moeda não suportada', () => {
      const result = createPortfolioSchema.safeParse({
        name: 'Carteira Invalida',
        baseCurrency: 'BTC',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('updatePortfolioSchema', () => {
    it('deve permitir atualizar apenas o nome', () => {
      const result = updatePortfolioSchema.safeParse({
        name: 'Novo Nome',
      });
      expect(result.success).toBe(true);
      if (!result.success) return;
      expect(result.data.name).toBe('Novo Nome');
      expect(result.data.status).toBeUndefined();
    });

    it('deve permitir arquivar ou ativar a carteira alterando status', () => {
      const resultArchived = updatePortfolioSchema.safeParse({
        status: 'archived',
      });
      expect(resultArchived.success).toBe(true);
      if (!resultArchived.success) return;
      expect(resultArchived.data.status).toBe('archived');

      const resultActive = updatePortfolioSchema.safeParse({
        status: 'active',
      });
      expect(resultActive.success).toBe(true);
      if (!resultActive.success) return;
      expect(resultActive.data.status).toBe('active');
    });

    it('deve REJEITAR explicitamente status "frozen" no schema de atualização pública', () => {
      const result = updatePortfolioSchema.safeParse({
        status: 'frozen',
      });
      expect(result.success).toBe(false);
    });

    it('deve rejeitar status desconhecido', () => {
      const result = updatePortfolioSchema.safeParse({
        status: 'deleted',
      });
      expect(result.success).toBe(false);
    });
  });
});
