import { describe, it, expect, vi } from 'vitest';
import { getPublicAssetTheoreticalValuation } from '@/modules/market-data/server/theoretical-valuation.service';
import * as fundamentalsService from '@/modules/market-data/server/fundamentals.service';
import * as unifiedQuoteService from '@/modules/market-data/server/unified-quote.service';
import { Decimal } from '@/lib/decimal';

describe('theoretical-valuation.service (Unit)', () => {
  it('retorna null quando o ativo não existe no catálogo público', async () => {
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      }),
    };

    const result = await getPublicAssetTheoreticalValuation('INEXISTENTE', undefined, mockDb as any);
    expect(result).toBeNull();
  });

  it('retorna null quando o ativo existe mas não possui demonstrativos fundamentais cadastrados', async () => {
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                { id: 'asset-1', ticker: 'PETR4', currency: 'BRL' },
              ]),
            }),
          }),
        }),
      }),
    };

    const spyGetFundamentals = vi
      .spyOn(fundamentalsService, 'getRepresentativeFundamentals')
      .mockResolvedValue(null);

    const result = await getPublicAssetTheoreticalValuation('PETR4', undefined, mockDb as any);
    expect(result).toBeNull();
    spyGetFundamentals.mockRestore();
  });

  it('calcula e retorna o valuation teórico completo quando ativo e demonstrativo existem', async () => {
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                { id: 'asset-1', ticker: 'PETR4', currency: 'BRL' },
              ]),
            }),
          }),
        }),
      }),
    };

    const mockStatement: any = {
      id: 'stmt-1',
      assetId: 'asset-1',
      referencePeriod: '2025-4Q',
      periodType: 'annual',
      statementType: 'CONSOLIDATED',
      referenceDate: new Date('2025-12-31T00:00:00.000Z'),
      filingDate: new Date('2026-02-15T00:00:00.000Z'),
      source: 'cvm',
      version: 1,
      isRestated: false,
      currency: 'BRL',
      netRevenue: new Decimal('1000000000.00'),
      ebitda: new Decimal('300000000.00'),
      netIncome: new Decimal('150000000.00'),
      totalEquity: new Decimal('800000000.00'),
      totalAssets: new Decimal('2000000000.00'),
      grossDebt: new Decimal('400000000.00'),
      cashEquivalents: new Decimal('100000000.00'),
      sharesCount: new Decimal('50000000.00'),
      dividendsDeclared: new Decimal('150000000.00'),
    };

    const mockQuote: any = {
      closePrice: new Decimal('40.00'),
      tradeDate: new Date('2026-08-28T18:00:00.000Z'),
      source: 'cotahist',
      delayStatus: 'eod',
      dataAgeDays: 0,
      isOutdated: false,
      currency: 'BRL',
    };

    const spyGetFundamentals = vi
      .spyOn(fundamentalsService, 'getRepresentativeFundamentals')
      .mockResolvedValue(mockStatement);

    const spyGetQuote = vi
      .spyOn(unifiedQuoteService, 'getLatestUsableQuote')
      .mockResolvedValue(mockQuote);

    const result = await getPublicAssetTheoreticalValuation('PETR4', undefined, mockDb as any);

    expect(result).not.toBeNull();
    expect(result?.assetId).toBe('asset-1');
    expect(result?.ticker).toBe('PETR4');
    expect(result?.referencePeriod).toBe('2025-4Q');
    expect(result?.bazin.status).toBe('VALID');
    expect(result?.bazin.intrinsicValue).toBe('50.0000');
    expect(result?.graham.status).toBe('VALID');
    expect(result?.graham.intrinsicValue).toBe('32.8634');
    expect(result?.dcf.status).toBe('VALID');
    expect(result?.dcf.intrinsicValue).toBe('42.0923');

    spyGetFundamentals.mockRestore();
    spyGetQuote.mockRestore();
  });

  it('permite passar opções com premissas customizadas e valida rejeição de premissas inválidas', async () => {
    const mockDb = {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            orderBy: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue([
                { id: 'asset-1', ticker: 'VALE3', currency: 'BRL' },
              ]),
            }),
          }),
        }),
      }),
    };

    // Opção inválida: r <= gt no DCF
    await expect(
      getPublicAssetTheoreticalValuation(
        'VALE3',
        {
          dcf: {
            discountRate: '0.03',
            terminalGrowthRate: '0.04', // gt > r (inválido)
            growthRateStage1: '0.05',
            projectionYears: 5,
          },
        },
        mockDb as any
      )
    ).rejects.toThrow();
  });
});
