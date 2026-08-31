import { describe, it, expect } from 'vitest';
import { Decimal } from '@/lib/decimal';
import { calculateFundamentalIndicators } from '@/modules/market-data/domain/fundamentals-engine';

describe('fundamentals-engine', () => {
  const baseStatement = {
    currency: 'BRL',
    netRevenue: new Decimal('1000000000.00'), // R$ 1.000.000.000,00
    ebitda: new Decimal('300000000.00'),     // R$ 300.000.000,00
    netIncome: new Decimal('150000000.00'),  // R$ 150.000.000,00
    totalEquity: new Decimal('800000000.00'),// R$ 800.000.000,00
    totalAssets: new Decimal('2000000000.00'),// R$ 2.000.000.000,00
    grossDebt: new Decimal('400000000.00'),  // R$ 400.000.000,00
    cashEquivalents: new Decimal('100000000.00'), // R$ 100.000.000,00
    sharesCount: new Decimal('50000000.00'), // 50.000.000 ações
    dividendsDeclared: new Decimal('50000000.00'), // R$ 50.000.000,00 declarados
  };

  const baseQuote = {
    price: new Decimal('30.00'),
    quoteDate: new Date('2026-08-28T18:00:00.000Z'),
    source: 'cotahist' as const,
    delayStatus: 'eod',
    isStale: false,
    currency: 'BRL',
  };

  it('calcula corretamente todos os 10 indicadores e grandeza derivada auxiliar em caso nominal', () => {
    const result = calculateFundamentalIndicators(baseStatement, baseQuote);

    // netDebt = 400M - 100M = 300M
    expect(result.netDebt).toBe('300000000.0000');

    // Margem Líquida = 150M / 1000M = 0.1500 (15%)
    expect(result.netMargin).toBe('0.1500');

    // Margem EBITDA = 300M / 1000M = 0.3000 (30%)
    expect(result.ebitdaMargin).toBe('0.3000');

    // ROE = 150M / 800M = 0.1875 (18,75%)
    expect(result.roe).toBe('0.1875');

    // ROA = 150M / 2000M = 0.0750 (7,5%)
    expect(result.roa).toBe('0.0750');

    // LPA = 150M / 50M = 3.0000
    expect(result.lpa).toBe('3.0000');

    // VPA = 800M / 50M = 16.0000
    expect(result.vpa).toBe('16.0000');

    // Dívida Líquida / EBITDA = 300M / 300M = 1.00
    expect(result.netDebtToEbitda).toBe('1.00');

    // P/L = 30.00 / 3.00 = 10.00
    expect(result.peRatio).toBe('10.00');

    // P/VP = 30.00 / 16.00 = 1.875 -> 1.88
    expect(result.pbRatio).toBe('1.88');

    // Dividend Yield = (50M / 50M) / 30.00 = 1.00 / 30.00 = 0.033333... -> 0.0333 (3,33%)
    expect(result.dividendYield).toBe('0.0333');

    // Metadados de auditoria da cotação
    expect(result.quoteAudit).toEqual({
      quotePriceUsed: '30.0000',
      quoteDateUsed: '2026-08-28T18:00:00.000Z',
      quoteSource: 'cotahist',
      quoteDelayStatus: 'eod',
      isQuoteStale: false,
      currency: 'BRL',
    });
    expect(result.currencyMismatch).toBe(false);
  });

  it('retorna netDebt nulo quando grossDebt ou cashEquivalents estiver ausente', () => {
    const stmtWithoutDebt = { ...baseStatement, grossDebt: null };
    const result1 = calculateFundamentalIndicators(stmtWithoutDebt);
    expect(result1.netDebt).toBeNull();
    expect(result1.netDebtToEbitda).toBeNull();

    const stmtWithoutCash = { ...baseStatement, cashEquivalents: null };
    const result2 = calculateFundamentalIndicators(stmtWithoutCash);
    expect(result2.netDebt).toBeNull();
    expect(result2.netDebtToEbitda).toBeNull();
  });

  it('trata denominador zero ou negativo retornando null sem lançar exceção', () => {
    const zeroStmt = {
      currency: 'BRL',
      netRevenue: new Decimal('0.00'),
      ebitda: new Decimal('0.00'),
      netIncome: new Decimal('-50000000.00'), // Prejuízo
      totalEquity: new Decimal('-100000000.00'), // PL negativo
      totalAssets: new Decimal('0.00'),
      grossDebt: new Decimal('100000000.00'),
      cashEquivalents: new Decimal('50000000.00'),
      sharesCount: new Decimal('0.00'), // Zero ações
      dividendsDeclared: null,
    };

    const result = calculateFundamentalIndicators(zeroStmt, baseQuote);

    expect(result.netMargin).toBeNull();
    expect(result.ebitdaMargin).toBeNull();
    expect(result.roe).toBeNull();
    expect(result.roa).toBeNull();
    expect(result.lpa).toBeNull();
    expect(result.vpa).toBeNull();
    expect(result.netDebtToEbitda).toBeNull();
    expect(result.peRatio).toBeNull();
    expect(result.pbRatio).toBeNull();
    expect(result.dividendYield).toBeNull();
    expect(result.netDebt).toBe('50000000.0000');
  });

  it('não calcula P/L quando LPA for negativo (prejuízo)', () => {
    const lossStmt = {
      ...baseStatement,
      netIncome: new Decimal('-100000000.00'), // LPA = -2.00
    };

    const result = calculateFundamentalIndicators(lossStmt, baseQuote);
    expect(result.lpa).toBe('-2.0000');
    expect(result.peRatio).toBeNull();
  });

  it('bloqueia cálculo de múltiplos quando moedas forem incompatíveis e reporta currencyMismatch', () => {
    const usdQuote = {
      price: new Decimal('5.50'),
      quoteDate: new Date('2026-08-28T18:00:00.000Z'),
      source: 'market_quotes' as const,
      delayStatus: 'realtime',
      isStale: false,
      currency: 'USD',
    };

    const result = calculateFundamentalIndicators(baseStatement, usdQuote);

    expect(result.currencyMismatch).toBe(true);
    expect(result.peRatio).toBeNull();
    expect(result.pbRatio).toBeNull();
    expect(result.dividendYield).toBeNull();
    expect(result.quoteAudit?.currency).toBe('USD');
  });

  it('permite cálculo de indicadores contábeis quando nenhuma cotação for fornecida', () => {
    const result = calculateFundamentalIndicators(baseStatement, null);

    expect(result.netMargin).toBe('0.1500');
    expect(result.roe).toBe('0.1875');
    expect(result.lpa).toBe('3.0000');
    expect(result.vpa).toBe('16.0000');
    expect(result.peRatio).toBeNull();
    expect(result.pbRatio).toBeNull();
    expect(result.dividendYield).toBeNull();
    expect(result.quoteAudit).toBeNull();
    expect(result.currencyMismatch).toBe(false);
  });
});
