import { describe, it, expect } from 'vitest';
import { Decimal } from '@/lib/decimal';
import {
  calculateFundamentalIndicators,
  FUNDAMENTALS_METHODOLOGY_VERSION,
} from '@/modules/market-data/domain/fundamentals-engine';

describe('fundamentals-engine (Etapa 5 — Subetapa 5.2)', () => {
  const baseStatement = {
    currency: 'BRL',
    netRevenue: new Decimal('1000000000.00'), // R$ 1.000.000.000,00
    ebitda: new Decimal('300000000.00'), // R$ 300.000.000,00
    netIncome: new Decimal('150000000.00'), // R$ 150.000.000,00
    totalEquity: new Decimal('800000000.00'), // R$ 800.000.000,00
    totalAssets: new Decimal('2000000000.00'), // R$ 2.000.000.000,00
    grossDebt: new Decimal('400000000.00'), // R$ 400.000.000,00
    cashEquivalents: new Decimal('100000000.00'), // R$ 100.000.000,00
    sharesCount: new Decimal('50000000.00'), // 50.000.000 ações
    dividendsDeclared: new Decimal('50000000.00'), // R$ 50.000.000,00 declarados
    referencePeriod: '2024-FY',
    referenceDate: new Date('2024-12-31T00:00:00.000Z'),
    source: 'CVM_DFP',
  };

  const baseQuote = {
    price: new Decimal('30.00'),
    quoteDate: new Date('2026-08-28T18:00:00.000Z'),
    source: 'cotahist' as const,
    delayStatus: 'eod',
    isStale: false,
    currency: 'BRL',
  };

  // ─── CASO NOMINAL E COMPATIBILIDADE LEGADA ──────────────────────────────────

  it('calcula corretamente todos os indicadores, grandezas auxiliares e governança em caso nominal', () => {
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

    // Novos campos da Subetapa 5.2:
    // CapitalInvestido = 800M + 300M = 1.100M. NOPAT (34%) = 300M * 0.66 = 198M. ROIC = 198M / 1.100M = 0.1800
    expect(result.roic).toBe('0.1800');

    // Enterprise Value = (30.00 * 50M) + 300M = 1.500M + 300M = 1.800M
    expect(result.enterpriseValue).toBe('1800000000.00');

    // EV/EBITDA = 1.800M / 300M = 6.00
    expect(result.evToEbitda).toBe('6.00');

    // Alavancagem Patrimonial:
    // Dívida Bruta / PL = 400M / 800M = 0.50
    expect(result.grossDebtToEquity).toBe('0.50');
    // Dívida Líquida / PL = 300M / 800M = 0.375 -> 0.38
    expect(result.netDebtToEquity).toBe('0.38');

    // Governança v2
    expect(result.dataQualityStatus).toBe('VALID');
    expect(result.methodologyVersion).toBe(FUNDAMENTALS_METHODOLOGY_VERSION);
    expect(result.traceability).toBeDefined();

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
    expect(result1.netDebtToEquity).toBeNull();

    const stmtWithoutCash = { ...baseStatement, cashEquivalents: null };
    const result2 = calculateFundamentalIndicators(stmtWithoutCash);
    expect(result2.netDebt).toBeNull();
    expect(result2.netDebtToEbitda).toBeNull();
    expect(result2.netDebtToEquity).toBeNull();
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
    expect(result.roic).toBeNull();
    expect(result.lpa).toBeNull();
    expect(result.vpa).toBeNull();
    expect(result.netDebtToEbitda).toBeNull();
    expect(result.grossDebtToEquity).toBeNull();
    expect(result.netDebtToEquity).toBeNull();
    expect(result.peRatio).toBeNull();
    expect(result.pbRatio).toBeNull();
    expect(result.evToEbitda).toBeNull();
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
    expect(result.dataQualityStatus).toBe('INCOMPATIBLE');
    expect(result.peRatio).toBeNull();
    expect(result.pbRatio).toBeNull();
    expect(result.evToEbitda).toBeNull();
    expect(result.enterpriseValue).toBeNull();
    expect(result.dividendYield).toBeNull();
    expect(result.quoteAudit?.currency).toBe('USD');
  });

  it('permite cálculo de indicadores contábeis quando nenhuma cotação for fornecida', () => {
    const result = calculateFundamentalIndicators(baseStatement, null);

    expect(result.netMargin).toBe('0.1500');
    expect(result.roe).toBe('0.1875');
    expect(result.roic).toBe('0.1800');
    expect(result.lpa).toBe('3.0000');
    expect(result.vpa).toBe('16.0000');
    expect(result.grossDebtToEquity).toBe('0.50');
    expect(result.netDebtToEquity).toBe('0.38');
    expect(result.peRatio).toBeNull();
    expect(result.pbRatio).toBeNull();
    expect(result.evToEbitda).toBeNull();
    expect(result.enterpriseValue).toBeNull();
    expect(result.dividendYield).toBeNull();
    expect(result.quoteAudit).toBeNull();
    expect(result.currencyMismatch).toBe(false);
  });

  // ─── REQUISITOS OBRIGATÓRIOS DA SUBETAPA 5.2 ───────────────────────────────

  describe('1. ROIC com diferentes alíquotas de IR/CSLL', () => {
    it('calcula ROIC com alíquota padrão de 34%', () => {
      // CapitalInvestido = 800M + 300M = 1.100M
      // NOPAT = 300M * (1 - 0.34) = 198M
      // ROIC = 198M / 1.100M = 0.1800
      const result = calculateFundamentalIndicators(baseStatement, baseQuote);
      expect(result.roic).toBe('0.1800');
    });

    it('calcula ROIC com alíquota explícita de 0% (EBIT puro)', () => {
      // CapitalInvestido = 1.100M
      // NOPAT = 300M * (1 - 0) = 300M
      // ROIC = 300M / 1.100M = 0.272727... -> 0.2727
      const result = calculateFundamentalIndicators(baseStatement, baseQuote, {
        taxRate: new Decimal('0'),
      });
      expect(result.roic).toBe('0.2727');
    });

    it('calcula ROIC com alíquota arbitrária de 25%', () => {
      // CapitalInvestido = 1.100M
      // NOPAT = 300M * (1 - 0.25) = 225M
      // ROIC = 225M / 1.100M = 0.204545... -> 0.2045
      const result = calculateFundamentalIndicators(baseStatement, baseQuote, {
        taxRate: new Decimal('0.25'),
      });
      expect(result.roic).toBe('0.2045');
    });

    it('retorna ROIC nulo quando o capital investido for nulo ou zero', () => {
      // TotalEquity = 100M, NetDebt = -100M -> CapitalInvestido = 0
      const zeroCapitalStmt = {
        ...baseStatement,
        totalEquity: new Decimal('100000000.00'),
        grossDebt: new Decimal('50000000.00'),
        cashEquivalents: new Decimal('150000000.00'), // NetDebt = -100M
      };

      const result = calculateFundamentalIndicators(zeroCapitalStmt, baseQuote);
      expect(result.roic).toBeNull();
    });

    it('retorna ROIC nulo quando o capital investido for negativo', () => {
      // TotalEquity = -100M, NetDebt = -50M -> CapitalInvestido = -150M
      const negativeCapitalStmt = {
        ...baseStatement,
        totalEquity: new Decimal('-100000000.00'),
        grossDebt: new Decimal('50000000.00'),
        cashEquivalents: new Decimal('100000000.00'), // NetDebt = -50M
      };

      const result = calculateFundamentalIndicators(negativeCapitalStmt, baseQuote);
      expect(result.roic).toBeNull();
    });

    it('utiliza EBIT explícito deduzido de D&A quando fornecidos', () => {
      const stmtWithDa = {
        ...baseStatement,
        ebitda: new Decimal('300000000.00'),
        depreciationAmortization: new Decimal('80000000.00'), // EBIT = 220M
      };

      // NOPAT (34%) = 220M * 0.66 = 145.200.000
      // CapitalInvestido = 1.100.000.000
      // ROIC = 145.2M / 1.100M = 0.1320 (13,20%)
      const result = calculateFundamentalIndicators(stmtWithDa, baseQuote);
      expect(result.roic).toBe('0.1320');
    });
  });

  describe('2. EV / EBITDA e Enterprise Value (EV)', () => {
    it('calcula EV e EV/EBITDA com cotação e moeda compatíveis', () => {
      // Preço: 30.00, Ações: 50M -> MarketCap = 1.500M
      // NetDebt = 300M
      // EV = 1.500M + 300M = 1.800M -> '1800000000.00'
      // EV/EBITDA = 1.800M / 300M = 6.00
      const result = calculateFundamentalIndicators(baseStatement, baseQuote);
      expect(result.enterpriseValue).toBe('1800000000.00');
      expect(result.evToEbitda).toBe('6.00');
    });

    it('bloqueia EV/EBITDA quando houver divergência cambial e marca dataQualityStatus INCOMPATIBLE', () => {
      const usdQuote = {
        ...baseQuote,
        currency: 'USD',
      };

      const result = calculateFundamentalIndicators(baseStatement, usdQuote);
      expect(result.currencyMismatch).toBe(true);
      expect(result.dataQualityStatus).toBe('INCOMPATIBLE');
      expect(result.evToEbitda).toBeNull();
      expect(result.enterpriseValue).toBeNull();
    });

    it('retorna evToEbitda nulo quando EBITDA for nulo', () => {
      const nullEbitdaStmt = {
        ...baseStatement,
        ebitda: null,
      };

      const result = calculateFundamentalIndicators(nullEbitdaStmt, baseQuote);
      expect(result.evToEbitda).toBeNull();
      // Enterprise Value continua sendo derivável: 1.800M
      expect(result.enterpriseValue).toBe('1800000000.00');
    });

    it('retorna evToEbitda nulo quando EBITDA for negativo', () => {
      const negativeEbitdaStmt = {
        ...baseStatement,
        ebitda: new Decimal('-50000000.00'),
      };

      const result = calculateFundamentalIndicators(negativeEbitdaStmt, baseQuote);
      expect(result.evToEbitda).toBeNull();
    });
  });

  describe('3. Alavancagem Patrimonial', () => {
    it('calcula Dívida Bruta / PL e Dívida Líquida / PL', () => {
      // GrossDebt: 400M, TotalEquity: 800M -> 400/800 = 0.50
      // NetDebt: 300M, TotalEquity: 800M -> 300/800 = 0.38
      const result = calculateFundamentalIndicators(baseStatement, baseQuote);
      expect(result.grossDebtToEquity).toBe('0.50');
      expect(result.netDebtToEquity).toBe('0.38');
    });

    it('retorna null para alavancagem quando Patrimônio Líquido for negativo', () => {
      const negativeEquityStmt = {
        ...baseStatement,
        totalEquity: new Decimal('-50000000.00'),
      };

      const result = calculateFundamentalIndicators(negativeEquityStmt, baseQuote);
      expect(result.grossDebtToEquity).toBeNull();
      expect(result.netDebtToEquity).toBeNull();
    });

    it('preserva valores negativos de dívida líquida quando houver caixa líquido', () => {
      // GrossDebt: 100M, Cash: 250M -> NetDebt = -150M (Caixa Líquido)
      // TotalEquity: 800M
      // NetDebt / TotalEquity = -150M / 800M = -0.1875 -> -0.19
      // GrossDebt / TotalEquity = 100M / 800M = 0.125 -> 0.13
      const netCashStmt = {
        ...baseStatement,
        grossDebt: new Decimal('100000000.00'),
        cashEquivalents: new Decimal('250000000.00'),
      };

      const result = calculateFundamentalIndicators(netCashStmt, baseQuote);
      expect(result.netDebt).toBe('-150000000.0000');
      expect(result.grossDebtToEquity).toBe('0.13');
      expect(result.netDebtToEquity).toBe('-0.19');
    });
  });

  describe('4. Rastreabilidade Completa e Governança v2', () => {
    it('preenche metadados de rastreabilidade para cada indicador calculado', () => {
      const result = calculateFundamentalIndicators(baseStatement, baseQuote);

      expect(result.dataQualityStatus).toBe('VALID');
      expect(result.methodologyVersion).toBe(FUNDAMENTALS_METHODOLOGY_VERSION);

      const t = result.traceability!;
      expect(t).toBeDefined();

      // ROIC
      expect(t.ROIC).toBeDefined();
      expect(t.ROIC.formula).toContain('ROIC = [EBIT * (1 - taxRate)] / (TotalEquity + NetDebt)');
      expect(t.ROIC.source).toBe('CVM_DFP');
      expect(t.ROIC.currency).toBe('BRL');
      expect(t.ROIC.referencePeriod).toBe('2024-FY');
      expect(t.ROIC.methodologyVersion).toBe(FUNDAMENTALS_METHODOLOGY_VERSION);
      expect(t.ROIC.limitations.length).toBeGreaterThan(0);

      // EV/EBITDA
      expect(t.EV_EBITDA).toBeDefined();
      expect(t.EV_EBITDA.formula).toContain('EV/EBITDA = [(Preço * Ações) + NetDebt] / EBITDA');

      // Alavancagem
      expect(t.GROSS_DEBT_TO_EQUITY.formula).toContain('DívidaBruta/PL');
      expect(t.NET_DEBT_TO_EQUITY.formula).toContain('DívidaLíquida/PL');

      // Múltiplos
      expect(t.PE_RATIO.formula).toContain('P/L');
      expect(t.PB_RATIO.formula).toContain('P/VP');
      expect(t.DIVIDEND_YIELD.formula).toContain('DY');
    });

    it('marca dataQualityStatus como STALE quando a cotação é defasada', () => {
      const staleQuote = {
        ...baseQuote,
        isStale: true,
      };

      const result = calculateFundamentalIndicators(baseStatement, staleQuote);
      expect(result.dataQualityStatus).toBe('STALE');
    });

    it('marca dataQualityStatus como INCOMPLETE quando dados fundamentais estão ausentes', () => {
      const incompleteStmt = {
        ...baseStatement,
        netIncome: null,
      };

      const result = calculateFundamentalIndicators(incompleteStmt, baseQuote);
      expect(result.dataQualityStatus).toBe('INCOMPLETE');
    });
  });
});
