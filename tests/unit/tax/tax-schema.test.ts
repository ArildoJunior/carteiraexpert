import { describe, it, expect } from 'vitest';
import {
  capitalGainsRateSchema,
  dayTradeRateSchema,
  exemptThresholdSchema,
  userTaxPreferencesInputSchema,
  calculateTaxInputSchema,
} from '@/modules/tax/domain/tax.schema';

describe('Tax Schemas — Validação Estrita em Decimal e Regras Fiscais', () => {
  describe('Alíquotas de Imposto (capitalGainsRateSchema & dayTradeRateSchema)', () => {
    it('deve aceitar alíquota válida em formato string decimal', () => {
      expect(capitalGainsRateSchema.parse('0.15')).toBe('0.15');
      expect(dayTradeRateSchema.parse('0.20')).toBe('0.2');
    });

    it('deve rejeitar estritamente o tipo number do JavaScript', () => {
      expect(() => capitalGainsRateSchema.parse(0.15 as any)).toThrow();
      expect(() => dayTradeRateSchema.parse(0.20 as any)).toThrow();
    });

    it('deve rejeitar alíquota negativa', () => {
      expect(() => capitalGainsRateSchema.parse('-0.05')).toThrow();
    });

    it('deve rejeitar alíquota acima do limite de 30% (0.30)', () => {
      expect(() => capitalGainsRateSchema.parse('0.35')).toThrow();
      expect(() => dayTradeRateSchema.parse('0.40')).toThrow();
    });
  });

  describe('Limite de Isenção (exemptThresholdSchema)', () => {
    it('deve aceitar limite válido convencional', () => {
      expect(exemptThresholdSchema.parse('20000.00')).toBe('20000');
    });

    it('deve rejeitar limite negativo', () => {
      expect(() => exemptThresholdSchema.parse('-100.00')).toThrow();
    });

    it('deve rejeitar tipo number', () => {
      expect(() => exemptThresholdSchema.parse(20000 as any)).toThrow();
    });
  });

  describe('Preferências do Usuário (userTaxPreferencesInputSchema)', () => {
    it('deve aplicar defaults regulatórios se valores válidos forem passados', () => {
      const parsed = userTaxPreferencesInputSchema.parse({
        defaultCapitalGainsRate: '0.15',
        exemptThresholdBrl: '20000.00',
        dayTradeRate: '0.20',
        includeDayTrade: true,
        compensationEnabled: true,
      });

      expect(parsed.defaultCapitalGainsRate).toBe('0.15');
      expect(parsed.exemptThresholdBrl).toBe('20000');
      expect(parsed.dayTradeRate).toBe('0.2');
      expect(parsed.includeDayTrade).toBe(true);
      expect(parsed.compensationEnabled).toBe(true);
    });
  });

  describe('Entrada de Apuração (calculateTaxInputSchema)', () => {
    it('deve aceitar ano válido e mês opcional', () => {
      const valid = calculateTaxInputSchema.parse({
        year: 2024,
        month: 5,
        forceRecalculate: false,
      });
      expect(valid.year).toBe(2024);
      expect(valid.month).toBe(5);
    });

    it('deve rejeitar ano no futuro', () => {
      const futureYear = new Date().getFullYear() + 2;
      expect(() => {
        calculateTaxInputSchema.parse({
          year: futureYear,
        });
      }).toThrow('Não é permitido realizar apuração para anos no futuro.');
    });

    it('deve rejeitar mês inválido fora do intervalo 1..12', () => {
      expect(() => {
        calculateTaxInputSchema.parse({
          year: 2024,
          month: 13,
        });
      }).toThrow();
    });
  });
});
