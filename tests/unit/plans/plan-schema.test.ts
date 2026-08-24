import { describe, it, expect } from 'vitest';
import {
  commercialPlanIdSchema,
  userPlanStatusSchema,
  changeUserPlanSchema,
  applyPlanDowngradeSchema,
} from '@/modules/plans/domain/plan.schema';

describe('Plan Schemas (Unit)', () => {
  describe('commercialPlanIdSchema', () => {
    it('deve aceitar "free" e "pro"', () => {
      expect(commercialPlanIdSchema.parse('free')).toBe('free');
      expect(commercialPlanIdSchema.parse('pro')).toBe('pro');
    });

    it('deve rejeitar outros planos não autorizados (ex: family, enterprise)', () => {
      expect(() => commercialPlanIdSchema.parse('family')).toThrow();
      expect(() => commercialPlanIdSchema.parse('enterprise')).toThrow();
      expect(() => commercialPlanIdSchema.parse('premium')).toThrow();
      expect(() => commercialPlanIdSchema.parse('')).toThrow();
    });
  });

  describe('userPlanStatusSchema', () => {
    it('deve aceitar active, cancelled e past_due', () => {
      expect(userPlanStatusSchema.parse('active')).toBe('active');
      expect(userPlanStatusSchema.parse('cancelled')).toBe('cancelled');
      expect(userPlanStatusSchema.parse('past_due')).toBe('past_due');
    });

    it('deve rejeitar status desconhecidos', () => {
      expect(() => userPlanStatusSchema.parse('suspended')).toThrow();
      expect(() => userPlanStatusSchema.parse('frozen')).toThrow();
    });
  });

  describe('changeUserPlanSchema', () => {
    it('deve aceitar payload válido para PRO', () => {
      const parsed = changeUserPlanSchema.parse({
        planId: 'pro',
        status: 'active',
      });
      expect(parsed.planId).toBe('pro');
      expect(parsed.status).toBe('active');
    });

    it('deve aceitar payload de downgrade com keepPortfolioIds', () => {
      const parsed = changeUserPlanSchema.parse({
        planId: 'free',
        keepPortfolioIds: [
          '11111111-1111-4111-8111-111111111111',
          '22222222-2222-4222-8222-222222222222',
        ],
      });
      expect(parsed.planId).toBe('free');
      expect(parsed.keepPortfolioIds?.length).toBe(2);
    });

    it('deve rejeitar UUIDs inválidos em keepPortfolioIds', () => {
      expect(() =>
        changeUserPlanSchema.parse({
          planId: 'free',
          keepPortfolioIds: ['invalid-uuid'],
        })
      ).toThrow();
    });
  });

  describe('applyPlanDowngradeSchema', () => {
    it('deve aceitar lista de IDs opcionais', () => {
      const parsed = applyPlanDowngradeSchema.parse({});
      expect(parsed.keepPortfolioIds).toBeUndefined();
    });
  });
});
