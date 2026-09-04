import { describe, it, expect } from 'vitest';
import {
  createPortfolioSchema,
  updatePortfolioSchema,
} from '@/modules/portfolio/domain/portfolio.schema';
import {
  calculateUserDashboardSummary,
  serializeUserDashboardData,
} from '@/modules/portfolio/domain/position-engine';
import { Decimal } from '@/lib/decimal';
import type { DashboardPortfolioMetadata } from '@/modules/portfolio/domain/dashboard.types';
import { DuplicateRealPortfolioError, InvalidPortfolioPurposeError } from '@/modules/portfolio/domain/errors';

describe('Unidade — Finalidades de Carteira (REAL, ESTUDO, ANALISE)', () => {
  describe('Schemas Zod de Domínio', () => {
    it('deve aplicar default "REAL" na criação quando a finalidade não for informada', () => {
      const parsed = createPortfolioSchema.parse({
        name: 'Carteira Principal',
      });
      expect(parsed.purpose).toBe('REAL');
    });

    it('deve aceitar explicitamente finalidades válidas: REAL, ESTUDO e ANALISE', () => {
      const real = createPortfolioSchema.parse({
        name: 'Carteira Real',
        purpose: 'REAL',
      });
      expect(real.purpose).toBe('REAL');

      const estudo = createPortfolioSchema.parse({
        name: 'Carteira Estudo',
        purpose: 'ESTUDO',
      });
      expect(estudo.purpose).toBe('ESTUDO');

      const analise = createPortfolioSchema.parse({
        name: 'Carteira Análise',
        purpose: 'ANALISE',
      });
      expect(analise.purpose).toBe('ANALISE');
    });

    it('deve rejeitar finalidades inválidas no schema de criação', () => {
      expect(() =>
        createPortfolioSchema.parse({
          name: 'Carteira Inválida',
          purpose: 'SIMULACAO',
        })
      ).toThrow();
    });

    it('deve validar schema de atualização permitindo purpose e confirmPurposeChange opcionais', () => {
      const parsed = updatePortfolioSchema.parse({
        name: 'Carteira Editada',
        purpose: 'ESTUDO',
        confirmPurposeChange: true,
      });
      expect(parsed.purpose).toBe('ESTUDO');
      expect(parsed.confirmPurposeChange).toBe(true);
    });

    it('deve instanciar classes de erro customizadas com mensagens corretas', () => {
      const duplicateErr = new DuplicateRealPortfolioError();
      expect(duplicateErr.name).toBe('DuplicateRealPortfolioError');
      expect(duplicateErr.message).toContain('Patrimônio Real');

      const invalidPurposeErr = new InvalidPortfolioPurposeError('INVALID');
      expect(invalidPurposeErr.name).toBe('InvalidPortfolioPurposeError');
      expect(invalidPurposeErr.message).toContain('INVALID');
    });
  });

  describe('Motor Puro do Dashboard — Agregação Contextual', () => {
    const mockSelectedPortfolio: DashboardPortfolioMetadata = {
      id: 'p-real-1',
      name: 'Carteira Patrimonial',
      purpose: 'REAL',
      baseCurrency: 'BRL',
      status: 'active',
    };

    const mockAvailablePortfolios: DashboardPortfolioMetadata[] = [
      mockSelectedPortfolio,
      {
        id: 'p-estudo-1',
        name: 'Carteira de Teste',
        purpose: 'ESTUDO',
        baseCurrency: 'BRL',
        status: 'active',
      },
    ];

    it('deve propagar selectedPortfolio e availablePortfolios em calculateUserDashboardSummary', () => {
      const summary = calculateUserDashboardSummary(
        [],
        [],
        mockSelectedPortfolio,
        mockAvailablePortfolios
      );

      expect(summary.selectedPortfolio).toEqual(mockSelectedPortfolio);
      expect(summary.availablePortfolios).toHaveLength(2);
      expect(summary.availablePortfolios[0].purpose).toBe('REAL');
      expect(summary.availablePortfolios[1].purpose).toBe('ESTUDO');
    });

    it('deve serializar corretamente selectedPortfolio e availablePortfolios para SSR', () => {
      const summary = calculateUserDashboardSummary(
        [
          {
            portfolioId: 'p-real-1',
            portfolioName: 'Carteira Patrimonial',
            baseCurrency: 'BRL',
            summary: {
              portfolioId: 'p-real-1',
              positions: [],
              closedPositions: [],
              totalInvestedCost: new Decimal('10000.00'),
              totalFees: new Decimal('15.00'),
              totalRealizedPnL: new Decimal('500.00'),
              totalIncomeReceived: new Decimal('120.00'),
              totalMarketValue: new Decimal('10800.00'),
              totalUnrealizedPnL: new Decimal('800.00'),
              totalUnrealizedPnLPercent: new Decimal('8.00'),
              calculatedAt: new Date(),
            },
          },
        ],
        [],
        mockSelectedPortfolio,
        mockAvailablePortfolios
      );

      const serialized = serializeUserDashboardData(summary);

      expect(serialized.selectedPortfolio).toEqual(mockSelectedPortfolio);
      expect(serialized.availablePortfolios).toEqual(mockAvailablePortfolios);
      expect(serialized.currencyGroups[0].totalInvestedCost).toBe('10000.00000000');
      expect(serialized.currencyGroups[0].totalRealizedPnL).toBe('500.00000000');
    });
  });
});
