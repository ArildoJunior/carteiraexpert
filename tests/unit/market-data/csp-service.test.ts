import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Decimal } from '@/lib/decimal';
import {
  getCspUniverseAssets,
  buildCspAssetInput,
  serializeCspPortfolioResult,
  runCspSimulation,
} from '@/modules/market-data/server/csp.service';
import { runCspSimulationAction } from '@/modules/market-data/server/csp.actions';
import * as fundamentalsService from '@/modules/market-data/server/fundamentals.service';
import * as unifiedQuoteService from '@/modules/market-data/server/unified-quote.service';
import * as theoreticalValuationService from '@/modules/market-data/server/theoretical-valuation.service';
import * as cspEngine from '@/modules/market-data/domain/csp-engine';
import {
  CspMixedAssetClassError,
  CspInfeasibleConstraintsError,
  type CspPortfolioResult,
} from '@/modules/market-data/domain/csp.types';

describe('csp.service (Unit)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getCspUniverseAssets', () => {
    it('retorna a lista de ativos do universo mapeada e deduplicada por ticker', async () => {
      const mockRows = [
        {
          id: 'asset-1',
          ticker: 'PETR4',
          name: 'Petrobras PN',
          currency: 'BRL',
          industrySector: 'Petróleo e Gás',
        },
        {
          id: 'asset-1-dup',
          ticker: 'PETR4', // Duplicata por múltiplos bindings CVM
          name: 'Petrobras PN',
          currency: 'BRL',
          industrySector: 'Petróleo e Gás',
        },
        {
          id: 'asset-2',
          ticker: 'VALE3',
          name: 'Vale ON',
          currency: 'BRL',
          industrySector: 'Mineração',
        },
        {
          id: 'asset-3',
          ticker: 'WEGE3',
          name: 'Weg ON',
          currency: 'BRL',
          industrySector: null, // Sem setor definido
        },
      ];

      const mockDb = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            leftJoin: vi.fn().mockReturnValue({
              leftJoin: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  orderBy: vi.fn().mockResolvedValue(mockRows),
                }),
              }),
            }),
          }),
        }),
      };

      const result = await getCspUniverseAssets('STOCK', mockDb as any);

      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({
        id: 'asset-1',
        ticker: 'PETR4',
        name: 'Petrobras PN',
        sector: 'Petróleo e Gás',
        currency: 'BRL',
        assetClass: 'STOCK',
      });
      expect(result[1]).toEqual({
        id: 'asset-2',
        ticker: 'VALE3',
        name: 'Vale ON',
        sector: 'Mineração',
        currency: 'BRL',
        assetClass: 'STOCK',
      });
      expect(result[2].sector).toBe('OUTROS');
    });
  });

  describe('buildCspAssetInput', () => {
    const mockAsset = {
      id: 'asset-1',
      ticker: 'PETR4',
      name: 'Petrobras',
      sector: 'Petróleo',
      currency: 'BRL',
      assetClass: 'STOCK' as const,
    };

    it('retorna null quando demonstrativo contábil não é encontrado', async () => {
      vi.spyOn(fundamentalsService, 'getRepresentativeFundamentals').mockResolvedValue(null);
      vi.spyOn(unifiedQuoteService, 'getLatestUsableQuote').mockResolvedValue({
        closePrice: new Decimal('30.00'),
        tradeDate: new Date(),
        source: 'cotahist',
        delayStatus: 'eod',
        dataAgeDays: 0,
        isOutdated: false,
        currency: 'BRL',
      } as any);
      vi.spyOn(theoreticalValuationService, 'getPublicAssetTheoreticalValuation').mockResolvedValue(null);

      const result = await buildCspAssetInput(mockAsset, {} as any);
      expect(result).toBeNull();
    });

    it('retorna null quando cotação está ausente ou é zero', async () => {
      vi.spyOn(fundamentalsService, 'getRepresentativeFundamentals').mockResolvedValue({
        referencePeriod: '2025-4Q',
        referenceDate: new Date('2025-12-31'),
        currency: 'BRL',
      } as any);
      vi.spyOn(unifiedQuoteService, 'getLatestUsableQuote').mockResolvedValue(null);
      vi.spyOn(theoreticalValuationService, 'getPublicAssetTheoreticalValuation').mockResolvedValue(null);

      const result = await buildCspAssetInput(mockAsset, {} as any);
      expect(result).toBeNull();
    });

    it('retorna null quando valuation de consenso não está disponível', async () => {
      vi.spyOn(fundamentalsService, 'getRepresentativeFundamentals').mockResolvedValue({
        referencePeriod: '2025-4Q',
        referenceDate: new Date('2025-12-31'),
        currency: 'BRL',
        totalEquity: new Decimal('1000'),
        netIncome: new Decimal('100'),
      } as any);
      vi.spyOn(unifiedQuoteService, 'getLatestUsableQuote').mockResolvedValue({
        closePrice: new Decimal('30.00'),
        tradeDate: new Date(),
        source: 'cotahist',
        delayStatus: 'eod',
        dataAgeDays: 0,
        isOutdated: false,
        currency: 'BRL',
      } as any);
      vi.spyOn(theoreticalValuationService, 'getPublicAssetTheoreticalValuation').mockResolvedValue(null);

      const result = await buildCspAssetInput(mockAsset, {} as any);
      expect(result).toBeNull();
    });

    it('monta o CspAssetInput completo com Decimal e status de qualidade corretos', async () => {
      vi.spyOn(fundamentalsService, 'getRepresentativeFundamentals').mockResolvedValue({
        referencePeriod: '2025-4Q',
        referenceDate: new Date('2025-12-31T00:00:00.000Z'),
        currency: 'BRL',
        netRevenue: new Decimal('1000'),
        ebitda: new Decimal('300'),
        netIncome: new Decimal('150'),
        totalEquity: new Decimal('800'),
        totalAssets: new Decimal('2000'),
        grossDebt: new Decimal('400'),
        cashEquivalents: new Decimal('100'),
        sharesCount: new Decimal('100'),
        dividendsDeclared: new Decimal('50'),
      } as any);

      vi.spyOn(unifiedQuoteService, 'getLatestUsableQuote').mockResolvedValue({
        closePrice: new Decimal('30.00'),
        tradeDate: new Date('2026-08-28T00:00:00.000Z'),
        source: 'cotahist',
        delayStatus: 'eod',
        dataAgeDays: 0,
        isOutdated: false,
        currency: 'BRL',
      } as any);

      vi.spyOn(theoreticalValuationService, 'getPublicAssetTheoreticalValuation').mockResolvedValue({
        consensus: {
          weightedTargetPrice: '45.00',
          marginOfSafetyPercent: '50.00',
          dataQualityStatus: 'VALID',
        },
      } as any);

      const result = await buildCspAssetInput(mockAsset, {} as any);

      expect(result).not.toBeNull();
      expect(result?.ticker).toBe('PETR4');
      expect(result?.assetClass).toBe('STOCK');
      expect(result?.sector).toBe('Petróleo');
      expect(result?.marketPrice.toString()).toBe('30');
      expect(result?.theoreticalPrice.toString()).toBe('45');
      expect(result?.marginOfSafetyPercent.toFixed(2)).toBe('50.00');
      expect(result?.dataQualityStatus).toBe('VALID');
      expect(result?.referenceDate).toBe('2026-08-28');
      expect(result?.roe).not.toBeNull();
    });

    it('aplica maxStaleDays configurado (ex: 1 dia) na classificação de STALE', async () => {
      vi.spyOn(fundamentalsService, 'getRepresentativeFundamentals').mockResolvedValue({
        referencePeriod: '2025-4Q',
        referenceDate: new Date('2025-12-31T00:00:00.000Z'),
        currency: 'BRL',
        netRevenue: new Decimal('1000'),
        ebitda: new Decimal('300'),
        netIncome: new Decimal('150'),
        totalEquity: new Decimal('800'),
        totalAssets: new Decimal('2000'),
        grossDebt: new Decimal('400'),
        cashEquivalents: new Decimal('100'),
        sharesCount: new Decimal('100'),
        dividendsDeclared: new Decimal('50'),
      } as any);

      vi.spyOn(unifiedQuoteService, 'getLatestUsableQuote').mockResolvedValue({
        closePrice: new Decimal('30.00'),
        tradeDate: new Date('2026-08-28T00:00:00.000Z'),
        source: 'cotahist',
        delayStatus: 'eod',
        dataAgeDays: 2,
        isOutdated: false,
        currency: 'BRL',
      } as any);

      vi.spyOn(theoreticalValuationService, 'getPublicAssetTheoreticalValuation').mockResolvedValue({
        consensus: {
          weightedTargetPrice: '45.00',
          marginOfSafetyPercent: '50.00',
          dataQualityStatus: 'VALID',
        },
      } as any);

      // Com maxStaleDays = 1, dataAgeDays (2) > 1 -> STALE
      const resultStale = await buildCspAssetInput(mockAsset, {} as any, 1);
      expect(resultStale?.dataQualityStatus).toBe('STALE');

      // Com maxStaleDays = 5 (padrão), dataAgeDays (2) <= 5 -> VALID
      const resultValid = await buildCspAssetInput(mockAsset, {} as any, 5);
      expect(resultValid?.dataQualityStatus).toBe('VALID');
    });
  });

  describe('serializeCspPortfolioResult', () => {
    it('converte todos os Decimals em strings preservando precisão e formato', () => {
      const mockResult: CspPortfolioResult = {
        assetClass: 'STOCK',
        weightingMethod: 'EQUIPONDERADA',
        methodologyVersion: '1.0.0',
        dataQualityStatus: 'VALID',
        allocations: [
          {
            ticker: 'PETR4',
            sector: 'Petróleo',
            marketPrice: new Decimal('30.00'),
            theoreticalPrice: new Decimal('45.00'),
            marginOfSafetyPercent: new Decimal('50.00'),
            weight: new Decimal('0.5000'),
            contribution: new Decimal('25.0000'),
          },
        ],
        excludedAssets: [
          {
            ticker: 'VALE3',
            reason: 'MARGEM_NEGATIVA',
            detail: 'Margem negativa',
          },
        ],
        summary: {
          totalEvaluated: 2,
          totalEligible: 1,
          totalAllocated: 1,
          totalWeightAllocated: new Decimal('0.5000'),
        },
        traceability: {
          methodologyVersion: '1.0.0',
          weightingMethod: 'EQUIPONDERADA',
          criteria: {
            minMarginOfSafetyPercent: new Decimal('0.00'),
            maxNetDebtToEbitda: new Decimal('3.50'),
            maxNetDebtToEquity: new Decimal('2.00'),
            minRoe: new Decimal('0.05'),
            maxStaleDays: 5,
            evaluationDate: '2026-08-28',
          },
          constraints: {
            maxWeightPerAsset: new Decimal('0.2000'),
            maxWeightPerSector: new Decimal('0.4000'),
          },
          generatedAt: '2026-08-28T12:00:00.000Z',
          sources: ['CVM_DFP', 'B3_COTAHIST'],
        },
        disclaimer: 'Disclaimer teste',
      };

      const serialized = serializeCspPortfolioResult(mockResult);

      expect(serialized.allocations[0].weight).toBe('0.5000');
      expect(serialized.allocations[0].marketPrice).toBe('30.00');
      expect(serialized.summary.totalWeightAllocated).toBe('0.5000');
      expect(serialized.traceability.constraints.maxWeightPerAsset).toBe('0.2000');
    });
  });

  describe('runCspSimulation', () => {
    it('retorna erro de validação Zod quando entrada contém formato inválido', async () => {
      const invalidInput: any = {
        assetClass: 'STOCK',
        criteria: {
          minMarginOfSafetyPercent: 'nao-e-numero',
        },
      };

      const response = await runCspSimulation(invalidInput);
      expect(response.success).toBe(false);
      if (!response.success) {
        expect(response.error.code).toBe('VALIDATION_ERROR');
      }
    });

    it('captura CspInfeasibleConstraintsError e propaga erro estruturado', async () => {
      const mockDb = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            leftJoin: vi.fn().mockReturnValue({
              leftJoin: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  orderBy: vi.fn().mockResolvedValue([]),
                }),
              }),
            }),
          }),
        }),
      };

      vi.spyOn(cspEngine, 'generateSuggestedPortfolio').mockImplementation(() => {
        throw new CspInfeasibleConstraintsError(new Decimal('0.40'), {
          maxWeightPerAsset: new Decimal('0.20'),
          maxWeightPerSector: new Decimal('0.40'),
        });
      });

      const response = await runCspSimulation(
        {
          assetClass: 'STOCK',
          weightingMethod: 'EQUIPONDERADA',
          criteria: {
            minMarginOfSafetyPercent: '0.00',
            maxNetDebtToEbitda: '3.50',
            maxNetDebtToEquity: '2.00',
            minRoe: '0.05',
            maxStaleDays: 5,
          },
          constraints: {
            maxWeightPerAsset: '0.20',
            maxWeightPerSector: '0.40',
          },
        },
        mockDb as any
      );

      expect(response.success).toBe(false);
      if (!response.success) {
        expect(response.error.code).toBe('INFEASIBLE_CONSTRAINTS');
      }
    });

    it('captura CspMixedAssetClassError e propaga erro estruturado', async () => {
      const mockDb = {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            leftJoin: vi.fn().mockReturnValue({
              leftJoin: vi.fn().mockReturnValue({
                where: vi.fn().mockReturnValue({
                  orderBy: vi.fn().mockResolvedValue([]),
                }),
              }),
            }),
          }),
        }),
      };

      vi.spyOn(cspEngine, 'generateSuggestedPortfolio').mockImplementation(() => {
        throw new CspMixedAssetClassError(['STOCK', 'FII']);
      });

      const response = await runCspSimulation(
        {
          assetClass: 'STOCK',
          weightingMethod: 'EQUIPONDERADA',
        },
        mockDb as any
      );

      expect(response.success).toBe(false);
      if (!response.success) {
        expect(response.error.code).toBe('MIXED_ASSET_CLASS');
      }
    });

    it('retorna mensagem genérica segura em INTERNAL_ERROR sem expor err.message', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      vi.spyOn(cspEngine, 'generateSuggestedPortfolio').mockImplementation(() => {
        throw new Error('FATAL: connection to db at 192.168.1.50:5432 failed with password=secret');
      });

      const response = await runCspSimulation(
        {
          assetClass: 'STOCK',
          weightingMethod: 'EQUIPONDERADA',
        },
        {} as any
      );

      expect(response.success).toBe(false);
      if (!response.success) {
        expect(response.error.code).toBe('INTERNAL_ERROR');
        expect(response.error.message).toBe('Não foi possível concluir a simulação da CSP.');
        expect(response.error.message).not.toContain('secret');
        expect(response.error.message).not.toContain('5432');
      }

      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe('runCspSimulationAction', () => {
    it('retorna erro estruturado quando entrada bruta falha no safeParse', async () => {
      const response = await runCspSimulationAction({
        assetClass: 'CLASSE_INEXISTENTE',
      });

      expect(response.success).toBe(false);
      if (!response.success) {
        expect(response.error.code).toBe('VALIDATION_ERROR');
      }
    });
  });
});
