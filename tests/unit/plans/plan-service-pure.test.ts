import { describe, it, expect } from 'vitest';
import { assertPortfolioWritable } from '@/modules/plans/server/plan.service';
import {
  PortfolioFrozenError,
  PlanLimitExceededError,
  PlanNotFoundError,
} from '@/modules/plans/domain/errors';

describe('Plan Domain and Pure Functions (Unit)', () => {
  describe('assertPortfolioWritable', () => {
    it('não deve lançar erro se a carteira for "active"', () => {
      expect(() =>
        assertPortfolioWritable({ id: 'port-1', status: 'active' })
      ).not.toThrow();
    });

    it('não deve lançar erro se a carteira for "archived"', () => {
      expect(() =>
        assertPortfolioWritable({ id: 'port-1', status: 'archived' })
      ).not.toThrow();
    });

    it('deve lançar PortfolioFrozenError se a carteira for "frozen"', () => {
      expect(() =>
        assertPortfolioWritable({ id: 'port-frozen-123', status: 'frozen' })
      ).toThrow(PortfolioFrozenError);

      try {
        assertPortfolioWritable({ id: 'port-frozen-123', status: 'frozen' });
      } catch (err) {
        expect(err).toBeInstanceOf(PortfolioFrozenError);
        expect((err as PortfolioFrozenError).portfolioId).toBe('port-frozen-123');
        expect((err as PortfolioFrozenError).message).toContain('congelada');
      }
    });
  });

  describe('Domain Errors', () => {
    it('PlanLimitExceededError deve conter detalhes do plano e limite', () => {
      const err = new PlanLimitExceededError('Limite atingido.', {
        planId: 'free',
        maxAllowed: 2,
        currentCount: 2,
      });

      expect(err.name).toBe('PlanLimitExceededError');
      expect(err.planId).toBe('free');
      expect(err.maxAllowed).toBe(2);
      expect(err.currentCount).toBe(2);
    });

    it('PlanNotFoundError deve ser uma instância padrão de Error', () => {
      const err = new PlanNotFoundError('Plano não encontrado.');
      expect(err.name).toBe('PlanNotFoundError');
      expect(err.message).toBe('Plano não encontrado.');
    });
  });
});
