import { describe, it, expect } from 'vitest';
import {
  createOptionContractSchema,
  calculateGreeksInputSchema,
  payoffSimulationInputSchema,
} from '@/modules/options/domain/options.schema';
import { Decimal } from '@/lib/decimal';

describe('Options Zod Validation Schemas', () => {
  const validContractInput = {
    portfolioId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    underlyingAssetId: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a22',
    custodyAccountId: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a33',
    ticker: 'PETRH380',
    optionType: 'CALL' as const,
    optionStyle: 'AMERICAN' as const,
    direction: 'BUY' as const,
    strikePrice: '38.00',
    premiumPaidReceived: '1.50',
    quantity: '100',
    expirationDate: '2026-10-16',
    notes: 'Trava ou compra a seco informativa',
  };

  describe('createOptionContractSchema', () => {
    it('deve aceitar payload válido com strings numéricas canônicas', () => {
      const parsed = createOptionContractSchema.parse(validContractInput);
      expect(parsed.ticker).toBe('PETRH380');
      expect(new Decimal(parsed.strikePrice).toFixed(2)).toBe('38.00');
      expect(new Decimal(parsed.premiumPaidReceived).toFixed(2)).toBe('1.50');
      expect(parsed.quantity).toBe('100');
      expect(parsed.optionStyle).toBe('AMERICAN');
    });

    it('deve aceitar instâncias de Decimal', () => {
      const parsed = createOptionContractSchema.parse({
        ...validContractInput,
        strikePrice: new Decimal('38.50'),
        premiumPaidReceived: new Decimal('0.75'),
        quantity: new Decimal('500'),
      });
      expect(new Decimal(parsed.strikePrice).toFixed(2)).toBe('38.50');
      expect(new Decimal(parsed.premiumPaidReceived).toFixed(2)).toBe('0.75');
      expect(parsed.quantity).toBe('500');
    });

    it('deve REJEITAR estritamente o tipo number do JavaScript para strike, prêmio e quantidade', () => {
      expect(() =>
        createOptionContractSchema.parse({
          ...validContractInput,
          strikePrice: 38.0, // number proibido
        })
      ).toThrow();

      expect(() =>
        createOptionContractSchema.parse({
          ...validContractInput,
          premiumPaidReceived: 1.5, // number proibido
        })
      ).toThrow();

      expect(() =>
        createOptionContractSchema.parse({
          ...validContractInput,
          quantity: 100, // number proibido
        })
      ).toThrow();
    });

    it('deve bloquear strike zero ou negativo', () => {
      expect(() =>
        createOptionContractSchema.parse({
          ...validContractInput,
          strikePrice: '0',
        })
      ).toThrow();

      expect(() =>
        createOptionContractSchema.parse({
          ...validContractInput,
          strikePrice: '-10.50',
        })
      ).toThrow();
    });

    it('deve bloquear prêmio negativo mas permitir prêmio zero', () => {
      expect(() =>
        createOptionContractSchema.parse({
          ...validContractInput,
          premiumPaidReceived: '-0.01',
        })
      ).toThrow();

      const zeroPrem = createOptionContractSchema.parse({
        ...validContractInput,
        premiumPaidReceived: '0',
      });
      expect(zeroPrem.premiumPaidReceived).toBe('0');
    });

    it('deve bloquear data em formato inválido ou não existente no calendário', () => {
      expect(() =>
        createOptionContractSchema.parse({
          ...validContractInput,
          expirationDate: '16/10/2026', // Formato não ISO
        })
      ).toThrow();

      expect(() =>
        createOptionContractSchema.parse({
          ...validContractInput,
          expirationDate: '2026-02-30', // Dia inexistente
        })
      ).toThrow();
    });

    it('deve aceitar custodyAccountId nulo ou ausente', () => {
      const parsedWithoutCustody = createOptionContractSchema.parse({
        ...validContractInput,
        custodyAccountId: null,
      });
      expect(parsedWithoutCustody.custodyAccountId).toBeNull();
    });
  });

  describe('calculateGreeksInputSchema', () => {
    it('deve validar parâmetros numéricos do Black-Scholes em string canônica', () => {
      const parsed = calculateGreeksInputSchema.parse({
        spotPrice: '37.80',
        strikePrice: '38.00',
        timeToExpirationYears: '0.15',
        riskFreeRate: '0.105',
        volatility: '0.32',
        optionType: 'CALL',
        direction: 'BUY',
        premium: '1.45',
      });

      expect(parsed.spotPrice).toBe('37.8');
      expect(new Decimal(parsed.spotPrice).toFixed(2)).toBe('37.80');
      expect(parsed.volatility).toBe('0.32');
    });

    it('deve rejeitar volatilidade acima de 500% (5.0)', () => {
      expect(() =>
        calculateGreeksInputSchema.parse({
          spotPrice: '37.80',
          strikePrice: '38.00',
          timeToExpirationYears: '0.15',
          riskFreeRate: '0.105',
          volatility: '5.50',
          optionType: 'CALL',
        })
      ).toThrow();
    });
  });

  describe('payoffSimulationInputSchema', () => {
    it('deve aceitar payload de simulação válido', () => {
      const parsed = payoffSimulationInputSchema.parse({
        strikePrice: '40.00',
        premium: '2.00',
        quantity: '100',
        optionType: 'PUT',
        direction: 'SELL',
        stepsCount: 25,
      });

      expect(parsed.optionType).toBe('PUT');
      expect(parsed.direction).toBe('SELL');
      expect(parsed.stepsCount).toBe(25);
    });
  });
});
