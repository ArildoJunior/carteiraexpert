import { describe, it, expect } from 'vitest';
import { Decimal } from '@/lib/decimal';
import {
  calculateBazinValuation,
  calculateGrahamValuation,
  calculateSimplifiedDcfValuation,
  calculateTheoreticalValuations,
  serializeTheoreticalValuationResultSet,
  BAZIN_DISCLAIMER,
  GRAHAM_DISCLAIMER,
  DCF_DISCLAIMER,
  GLOBAL_VALUATION_DISCLAIMER,
} from '@/modules/market-data/domain/theoretical-valuation-engine';
import type {
  ValuationFundamentalContext,
  ValuationQuoteContext,
} from '@/modules/market-data/domain/theoretical-valuation.types';

describe('Theoretical Valuation Engine (Etapa 6)', () => {
  const baseStatement: ValuationFundamentalContext = {
    netRevenue: new Decimal('1000000000.00'),
    ebitda: new Decimal('300000000.00'),
    netIncome: new Decimal('150000000.00'), // R$ 150M
    totalEquity: new Decimal('800000000.00'), // R$ 800M
    totalAssets: new Decimal('2000000000.00'),
    grossDebt: new Decimal('400000000.00'),
    cashEquivalents: new Decimal('100000000.00'),
    sharesCount: new Decimal('50000000.00'), // 50M ações -> LPA = 3.00, VPA = 16.00
    dividendsDeclared: new Decimal('150000000.00'), // R$ 150M declarados -> DPA = 3.00
    currency: 'BRL',
    referencePeriod: '2025-4Q',
    referenceDate: new Date('2025-12-31T00:00:00.000Z'),
    statementType: 'CONSOLIDATED',
  };

  const baseQuote: ValuationQuoteContext = {
    price: new Decimal('40.00'),
    quoteDate: new Date('2026-08-28T18:00:00.000Z'),
    source: 'cotahist',
    delayStatus: 'eod',
    isStale: false,
    currency: 'BRL',
  };

  // ─── 1. BAZIN ─────────────────────────────────────────────────────────────

  describe('Preço Teto de Bazin', () => {
    it('calcula o preço teto nominal e a margem de segurança com DY alvo de 6%', () => {
      // DPA = 150M / 50M = 3.00
      // Preço Teto = 3.00 / 0.06 = 50.00
      // Margem = (50.00 - 40.00) / 40.00 * 100 = +25.00%
      const result = calculateBazinValuation(baseStatement, baseQuote);

      expect(result.model).toBe('BAZIN');
      expect(result.status).toBe('VALID');
      expect(result.statusReason).toBeNull();
      expect(result.intrinsicValue?.toFixed(2)).toBe('50.00');
      expect(result.marginOfSafetyPercent?.toFixed(2)).toBe('25.00');
      expect(result.factualInputs.dpa).toBe('3.0000');
      expect(result.premisesUsed.targetDividendYield.toFixed(2)).toBe('0.06');
      expect(result.disclaimer).toBe(BAZIN_DISCLAIMER);
    });

    it('recalcula o preço teto com premissa customizada de DY alvo (8%)', () => {
      // DPA = 3.00
      // Preço Teto = 3.00 / 0.08 = 37.50
      // Margem = (37.50 - 40.00) / 40.00 * 100 = -6.25%
      const result = calculateBazinValuation(baseStatement, baseQuote, {
        targetDividendYield: new Decimal('0.08'),
      });

      expect(result.status).toBe('VALID');
      expect(result.intrinsicValue?.toFixed(2)).toBe('37.50');
      expect(result.marginOfSafetyPercent?.toFixed(2)).toBe('-6.25');
    });

    it('retorna NOT_APPLICABLE se a empresa não declarou proventos (dividendsDeclared = 0)', () => {
      const zeroDivStmt: ValuationFundamentalContext = {
        ...baseStatement,
        dividendsDeclared: new Decimal('0.00'),
      };

      const result = calculateBazinValuation(zeroDivStmt, baseQuote);
      expect(result.status).toBe('NOT_APPLICABLE');
      expect(result.intrinsicValue).toBeNull();
      expect(result.marginOfSafetyPercent).toBeNull();
      expect(result.statusReason).toContain('não declarou proventos');
    });

    it('retorna INSUFFICIENT_DATA se dividendsDeclared for null', () => {
      const nullDivStmt: ValuationFundamentalContext = {
        ...baseStatement,
        dividendsDeclared: null,
      };

      const result = calculateBazinValuation(nullDivStmt, baseQuote);
      expect(result.status).toBe('INSUFFICIENT_DATA');
      expect(result.intrinsicValue).toBeNull();
    });

    it('retorna INVALID_PREMISES se targetDividendYield for zero ou negativo', () => {
      const resultZero = calculateBazinValuation(baseStatement, baseQuote, {
        targetDividendYield: new Decimal('0'),
      });
      expect(resultZero.status).toBe('INVALID_PREMISES');

      const resultNeg = calculateBazinValuation(baseStatement, baseQuote, {
        targetDividendYield: new Decimal('-0.05'),
      });
      expect(resultNeg.status).toBe('INVALID_PREMISES');
    });
  });

  // ─── 2. GRAHAM ────────────────────────────────────────────────────────────

  describe('Fórmula de Benjamin Graham', () => {
    it('calcula o valor intrínseco nominal de Graham com LPA=3.00 e VPA=16.00', () => {
      // LPA = 150M / 50M = 3.00
      // VPA = 800M / 50M = 16.00
      // Produto = 22.5 * 3.00 * 16.00 = 1080
      // sqrt(1080) = 32.863353450309968...
      // Margem = (32.86335... - 40.00) / 40.00 * 100 = -17.84%
      const result = calculateGrahamValuation(baseStatement, baseQuote);

      expect(result.model).toBe('GRAHAM');
      expect(result.status).toBe('VALID');
      expect(result.statusReason).toBeNull();
      expect(result.intrinsicValue?.toFixed(4)).toBe('32.8634');
      expect(result.marginOfSafetyPercent?.toFixed(2)).toBe('-17.84');
      expect(result.factualInputs.lpa).toBe('3.0000');
      expect(result.factualInputs.vpa).toBe('16.0000');
      expect(result.intermediates.productLpaVpa).toBe('1080.000000');
      expect(result.disclaimer).toBe(GRAHAM_DISCLAIMER);
    });

    it('retorna NOT_APPLICABLE se LPA for negativo (prejuízo contábil)', () => {
      const lossStmt: ValuationFundamentalContext = {
        ...baseStatement,
        netIncome: new Decimal('-50000000.00'), // Prejuízo
      };

      const result = calculateGrahamValuation(lossStmt, baseQuote);
      expect(result.status).toBe('NOT_APPLICABLE');
      expect(result.intrinsicValue).toBeNull();
      expect(result.statusReason).toContain('Lucro por Ação (LPA) negativo ou nulo');
    });

    it('retorna NOT_APPLICABLE se VPA for negativo (passivo a descoberto)', () => {
      const negativeEquityStmt: ValuationFundamentalContext = {
        ...baseStatement,
        totalEquity: new Decimal('-10000000.00'),
      };

      const result = calculateGrahamValuation(negativeEquityStmt, baseQuote);
      expect(result.status).toBe('NOT_APPLICABLE');
      expect(result.intrinsicValue).toBeNull();
      expect(result.statusReason).toContain('Valor Patrimonial por Ação (VPA) negativo ou nulo');
    });

    it('retorna INSUFFICIENT_DATA se dados essenciais forem nulos', () => {
      const incompleteStmt: ValuationFundamentalContext = {
        ...baseStatement,
        netIncome: null,
      };

      const result = calculateGrahamValuation(incompleteStmt, baseQuote);
      expect(result.status).toBe('INSUFFICIENT_DATA');
      expect(result.intrinsicValue).toBeNull();
    });

    it('retorna INVALID_PREMISES se grahamMultiplier for zero ou negativo', () => {
      const result = calculateGrahamValuation(baseStatement, baseQuote, {
        grahamMultiplier: new Decimal('0'),
      });
      expect(result.status).toBe('INVALID_PREMISES');
    });
  });

  // ─── 3. DCF SIMPLIFICADO ──────────────────────────────────────────────────

  describe('DCF Simplificado (2 Estágios)', () => {
    it('calcula o valor intrínseco nominal via DCF com projeção de 5 anos', () => {
      // LPA base = 3.00
      // r = 0.12 (12%), g1 = 0.08 (8%), gt = 0.03 (3%), N = 5
      // VP dos 5 anos somados = ~13.4678
      // TV_5 = Flow_5 * 1.03 / (0.12 - 0.03) = 4.40798 * 1.03 / 0.09 = ~50.4469
      // PV(TV_5) = 50.4469 / 1.12^5 = ~28.6251
      // Total = 13.4678 + 28.6251 = ~42.0929
      const result = calculateSimplifiedDcfValuation(baseStatement, baseQuote, {
        discountRate: new Decimal('0.12'),
        growthRateStage1: new Decimal('0.08'),
        terminalGrowthRate: new Decimal('0.03'),
        projectionYears: 5,
      });

      expect(result.model).toBe('DCF_SIMPLIFIED');
      expect(result.status).toBe('VALID');
      expect(result.statusReason).toBeNull();
      expect(result.intrinsicValue?.toFixed(2)).toBe('42.09');
      // Margem = (42.0929 - 40.00) / 40.00 * 100 = +5.23%
      expect(result.marginOfSafetyPercent?.toFixed(2)).toBe('5.23');
      expect(result.intermediates.yearlyProjections).toHaveLength(5);
      expect(result.disclaimer).toBe(DCF_DISCLAIMER);
    });

    it('rejeita com INVALID_PREMISES quando r <= gt (denominador nulo ou negativo)', () => {
      // r = 0.03, gt = 0.03 -> r - gt = 0
      const resultEqual = calculateSimplifiedDcfValuation(baseStatement, baseQuote, {
        discountRate: new Decimal('0.03'),
        terminalGrowthRate: new Decimal('0.03'),
      });
      expect(resultEqual.status).toBe('INVALID_PREMISES');
      expect(resultEqual.statusReason).toContain('estritamente maior que a taxa de crescimento terminal');

      // r = 0.02, gt = 0.03 -> r - gt < 0
      const resultLess = calculateSimplifiedDcfValuation(baseStatement, baseQuote, {
        discountRate: new Decimal('0.02'),
        terminalGrowthRate: new Decimal('0.03'),
      });
      expect(resultLess.status).toBe('INVALID_PREMISES');
    });

    it('rejeita com INVALID_PREMISES quando taxa de desconto for menor ou igual a zero', () => {
      const result = calculateSimplifiedDcfValuation(baseStatement, baseQuote, {
        discountRate: new Decimal('0'),
      });
      expect(result.status).toBe('INVALID_PREMISES');
    });

    it('retorna NOT_APPLICABLE se o fluxo base por ação for negativo ou nulo', () => {
      const deficitStmt: ValuationFundamentalContext = {
        ...baseStatement,
        netIncome: new Decimal('-100000000.00'),
      };

      const result = calculateSimplifiedDcfValuation(deficitStmt, baseQuote);
      expect(result.status).toBe('NOT_APPLICABLE');
      expect(result.intrinsicValue).toBeNull();
      expect(result.statusReason).toContain('negativo ou nulo');
    });
  });

  // ─── 4. MOTOR AGREGADO E SERIALIZAÇÃO ──────────────────────────────────────

  describe('Motor Agregado e Serialização', () => {
    it('executa os três modelos simultaneamente e inclui auditoria e disclaimer global', () => {
      const resultSet = calculateTheoreticalValuations(
        'asset-uuid-1',
        'PETR4',
        baseStatement,
        baseQuote
      );

      expect(resultSet.assetId).toBe('asset-uuid-1');
      expect(resultSet.ticker).toBe('PETR4');
      expect(resultSet.currency).toBe('BRL');
      expect(resultSet.currencyMismatch).toBe(false);
      expect(resultSet.bazin.status).toBe('VALID');
      expect(resultSet.graham.status).toBe('VALID');
      expect(resultSet.dcf.status).toBe('VALID');
      expect(resultSet.globalDisclaimer).toBe(GLOBAL_VALUATION_DISCLAIMER);
      expect(resultSet.quoteAudit?.quotePriceUsed).toBe('40.0000');
    });

    it('desativa margem de segurança quando a cotação possuir moeda diferente do demonstrativo', () => {
      const usdQuote: ValuationQuoteContext = {
        ...baseQuote,
        currency: 'USD',
      };

      const resultSet = calculateTheoreticalValuations(
        'asset-uuid-1',
        'PETR4',
        baseStatement,
        usdQuote
      );

      expect(resultSet.currencyMismatch).toBe(true);
      expect(resultSet.bazin.marginOfSafetyPercent).toBeNull();
      expect(resultSet.graham.marginOfSafetyPercent).toBeNull();
      expect(resultSet.dcf.marginOfSafetyPercent).toBeNull();
    });

    it('serializa perfeitamente o conjunto de resultados para JSON/SSR', () => {
      const resultSet = calculateTheoreticalValuations(
        'asset-uuid-1',
        'VALE3',
        baseStatement,
        baseQuote
      );

      const serialized = serializeTheoreticalValuationResultSet(resultSet);

      expect(typeof serialized.calculatedAt).toBe('string');
      expect(serialized.bazin.intrinsicValue).toBe('50.0000');
      expect(serialized.bazin.marginOfSafetyPercent).toBe('25.00');
      expect(serialized.graham.intrinsicValue).toBe('32.8634');
      expect(serialized.dcf.intrinsicValue).toBe('42.0923');
      expect(serialized.globalDisclaimer).toBe(GLOBAL_VALUATION_DISCLAIMER);
    });
  });
});
