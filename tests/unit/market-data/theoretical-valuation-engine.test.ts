import { describe, it, expect } from 'vitest';
import { Decimal } from '@/lib/decimal';
import {
  calculateBazinValuation,
  calculateGrahamValuation,
  calculateSimplifiedDcfValuation,
  calculateMultiplesValuation,
  calculateConsensusValuation,
  calculateTheoreticalValuations,
  serializeTheoreticalValuationResultSet,
  BAZIN_DISCLAIMER,
  GRAHAM_DISCLAIMER,
  DCF_DISCLAIMER,
  MULTIPLES_DISCLAIMER,
  CONSENSUS_DISCLAIMER,
  GLOBAL_VALUATION_DISCLAIMER,
  METHODOLOGY_VERSION,
} from '@/modules/market-data/domain/theoretical-valuation-engine';
import type {
  ValuationFundamentalContext,
  ValuationQuoteContext,
} from '@/modules/market-data/domain/theoretical-valuation.types';

describe('Theoretical Valuation Engine (Etapa 5 — Subetapa 5.1)', () => {
  const baseStatement: ValuationFundamentalContext = {
    netRevenue: new Decimal('1000000000.00'),
    ebitda: new Decimal('300000000.00'), // R$ 300M
    netIncome: new Decimal('150000000.00'), // R$ 150M
    totalEquity: new Decimal('800000000.00'), // R$ 800M
    totalAssets: new Decimal('2000000000.00'),
    grossDebt: new Decimal('400000000.00'), // R$ 400M
    cashEquivalents: new Decimal('100000000.00'), // R$ 100M -> Dívida Líquida = 300M
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
      expect(result.dataQualityStatus).toBe('VALID');
      expect(result.methodologyVersion).toBe(METHODOLOGY_VERSION);
      expect(result.statusReason).toBeNull();
      expect(result.intrinsicValue?.toFixed(2)).toBe('50.00');
      expect(result.marginOfSafetyPercent?.toFixed(2)).toBe('25.00');
      expect(result.factualInputs.dpa).toBe('3.0000');
      expect(result.premisesUsed.targetDividendYield.toFixed(2)).toBe('0.06');
      expect(result.disclaimer).toBe(BAZIN_DISCLAIMER);
      expect(result.traceability.formula).toContain('Preço Teto');
      expect(result.traceability.methodologyVersion).toBe(METHODOLOGY_VERSION);
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

    it('retorna NOT_APPLICABLE e UNAVAILABLE se a empresa não declarou proventos (dividendsDeclared = 0)', () => {
      const zeroDivStmt: ValuationFundamentalContext = {
        ...baseStatement,
        dividendsDeclared: new Decimal('0.00'),
      };

      const result = calculateBazinValuation(zeroDivStmt, baseQuote);
      expect(result.status).toBe('NOT_APPLICABLE');
      expect(result.dataQualityStatus).toBe('UNAVAILABLE');
      expect(result.intrinsicValue).toBeNull();
      expect(result.marginOfSafetyPercent).toBeNull();
      expect(result.statusReason).toContain('não declarou proventos');
    });

    it('retorna INSUFFICIENT_DATA e INCOMPLETE se dividendsDeclared for null', () => {
      const nullDivStmt: ValuationFundamentalContext = {
        ...baseStatement,
        dividendsDeclared: null,
      };

      const result = calculateBazinValuation(nullDivStmt, baseQuote);
      expect(result.status).toBe('INSUFFICIENT_DATA');
      expect(result.dataQualityStatus).toBe('INCOMPLETE');
      expect(result.intrinsicValue).toBeNull();
    });

    it('retorna INVALID_PREMISES se o targetDividendYield for zero ou negativo', () => {
      const result = calculateBazinValuation(baseStatement, baseQuote, {
        targetDividendYield: new Decimal('0.00'),
      });

      expect(result.status).toBe('INVALID_PREMISES');
      expect(result.dataQualityStatus).toBe('INCOMPLETE');
      expect(result.intrinsicValue).toBeNull();
      expect(result.statusReason).toContain('maior que zero');
    });

    it('marca dataQualityStatus como STALE quando a cotação é defasada', () => {
      const staleQuote: ValuationQuoteContext = {
        ...baseQuote,
        isStale: true,
      };

      const result = calculateBazinValuation(baseStatement, staleQuote);
      expect(result.status).toBe('VALID');
      expect(result.dataQualityStatus).toBe('STALE');
    });
  });

  // ─── 2. GRAHAM ────────────────────────────────────────────────────────────

  describe('Fórmula de Benjamin Graham', () => {
    it('calcula o valor intrínseco clássico com multiplicador padrão 22.5', () => {
      // LPA = 150M / 50M = 3.00
      // VPA = 800M / 50M = 16.00
      // Produto = 22.5 * 3.00 * 16.00 = 1080.00
      // sqrt(1080) = 32.863353... -> 32.86
      // Margem = (32.8634 - 40.00) / 40.00 * 100 = -17.84%
      const result = calculateGrahamValuation(baseStatement, baseQuote);

      expect(result.model).toBe('GRAHAM');
      expect(result.status).toBe('VALID');
      expect(result.dataQualityStatus).toBe('VALID');
      expect(result.intrinsicValue?.toFixed(4)).toBe('32.8634');
      expect(result.marginOfSafetyPercent?.toFixed(2)).toBe('-17.84');
      expect(result.factualInputs.lpa).toBe('3.0000');
      expect(result.factualInputs.vpa).toBe('16.0000');
      expect(result.intermediates.productLpaVpa).toBe('1080.000000');
      expect(result.disclaimer).toBe(GRAHAM_DISCLAIMER);
      expect(result.traceability.methodology).toBe('FORMULA_DE_GRAHAM');
    });

    it('retorna NOT_APPLICABLE e UNAVAILABLE quando LPA for negativo (prejuízo)', () => {
      const lossStmt: ValuationFundamentalContext = {
        ...baseStatement,
        netIncome: new Decimal('-50000000.00'), // -50M
      };

      const result = calculateGrahamValuation(lossStmt, baseQuote);
      expect(result.status).toBe('NOT_APPLICABLE');
      expect(result.dataQualityStatus).toBe('UNAVAILABLE');
      expect(result.intrinsicValue).toBeNull();
      expect(result.statusReason).toContain('negativo ou nulo');
    });

    it('retorna NOT_APPLICABLE quando VPA for negativo (passivo a descoberto)', () => {
      const negativeEquityStmt: ValuationFundamentalContext = {
        ...baseStatement,
        totalEquity: new Decimal('-100000000.00'),
      };

      const result = calculateGrahamValuation(negativeEquityStmt, baseQuote);
      expect(result.status).toBe('NOT_APPLICABLE');
      expect(result.dataQualityStatus).toBe('UNAVAILABLE');
      expect(result.intrinsicValue).toBeNull();
      expect(result.statusReason).toContain('passivo a descoberto');
    });
  });

  // ─── 3. DCF SIMPLIFICADO ──────────────────────────────────────────────────

  describe('Fluxo de Caixa Descontado Simplificado (2 Estágios)', () => {
    it('calcula o valor intrínseco de 2 estágios com premissas padrão', () => {
      // Base: LPA = 3.00, r = 12%, g1 = 8%, gt = 3%, anos = 5
      const result = calculateSimplifiedDcfValuation(baseStatement, baseQuote);

      expect(result.model).toBe('DCF_SIMPLIFIED');
      expect(result.status).toBe('VALID');
      expect(result.dataQualityStatus).toBe('VALID');
      expect(result.intrinsicValue).not.toBeNull();
      expect(result.marginOfSafetyPercent).not.toBeNull();
      expect(result.intermediates.yearlyProjections.length).toBe(5);
      expect(result.disclaimer).toBe(DCF_DISCLAIMER);
      expect(result.traceability.methodology).toBe('DCF_SIMPLIFICADO_2_ESTAGIOS');
    });

    it('rejeita premissa se taxa de desconto for menor ou igual à taxa terminal (divergência matemática)', () => {
      const result = calculateSimplifiedDcfValuation(baseStatement, baseQuote, {
        discountRate: new Decimal('0.03'),
        terminalGrowthRate: new Decimal('0.05'), // gt > r -> Denominador negativo na perpetuidade
      });

      expect(result.status).toBe('INVALID_PREMISES');
      expect(result.dataQualityStatus).toBe('INCOMPLETE');
      expect(result.intrinsicValue).toBeNull();
      expect(result.statusReason).toContain('estritamente maior que a taxa de crescimento terminal');
    });

    it('retorna NOT_APPLICABLE quando o fluxo base por ação for negativo', () => {
      const negativeStmt: ValuationFundamentalContext = {
        ...baseStatement,
        netIncome: new Decimal('-10000000.00'),
      };

      const result = calculateSimplifiedDcfValuation(negativeStmt, baseQuote);
      expect(result.status).toBe('NOT_APPLICABLE');
      expect(result.dataQualityStatus).toBe('UNAVAILABLE');
      expect(result.intrinsicValue).toBeNull();
    });
  });

  // ─── 4. VALUATION POR MÚLTIPLOS (SUBETAPA 5.1) ─────────────────────────────

  describe('Valuation por Múltiplos (Multiples Engine)', () => {
    it('calcula o preço justo determinístico por P/L, EV/EBITDA e P/VP com média (AVERAGE)', () => {
      // LPA = 150M / 50M = 3.00. Com targetPe = 10.0 -> fairPricePe = 30.00
      // VPA = 800M / 50M = 16.00. Com targetPb = 1.5 -> fairPricePb = 24.00
      // EV/EBITDA: EBITDA = 300M, targetEvToEbitda = 6.0 -> EV = 1.800M.
      // Dívida Líquida = 400M - 100M = 300M. Equity Value = 1.800M - 300M = 1.500M.
      // fairPriceEvToEbitda = 1.500M / 50M = 30.00
      // Média (AVERAGE) = (30.00 + 30.00 + 24.00) / 3 = 28.00
      // Margem com preço de mercado 40.00: (28.00 - 40.00) / 40.00 * 100 = -30.00%
      const result = calculateMultiplesValuation(baseStatement, baseQuote);

      expect(result.model).toBe('MULTIPLES');
      expect(result.status).toBe('VALID');
      expect(result.dataQualityStatus).toBe('VALID');
      expect(result.methodologyVersion).toBe(METHODOLOGY_VERSION);
      expect(result.intrinsicValue?.toFixed(2)).toBe('28.00');
      expect(result.marginOfSafetyPercent?.toFixed(2)).toBe('-30.00');
      expect(result.intermediates.fairPricePe).toBe('30.0000');
      expect(result.intermediates.fairPriceEvToEbitda).toBe('30.0000');
      expect(result.intermediates.fairPricePb).toBe('24.0000');
      expect(result.intermediates.modelsUsedCount).toBe(3);
      expect(result.disclaimer).toBe(MULTIPLES_DISCLAIMER);
      expect(result.traceability.formula).toContain('Preço Justo P/L');
    });

    it('permite seleção específica do método PE isolado', () => {
      const result = calculateMultiplesValuation(baseStatement, baseQuote, {
        selectedMultipleMethod: 'PE',
        targetPe: new Decimal('12.0'), // 12.0 * 3.00 = 36.00
      });

      expect(result.status).toBe('VALID');
      expect(result.intrinsicValue?.toFixed(2)).toBe('36.00');
      expect(result.marginOfSafetyPercent?.toFixed(2)).toBe('-10.00'); // (36 - 40) / 40 * 100
      expect(result.intermediates.methodApplied).toBe('PE');
      expect(result.intermediates.modelsUsedCount).toBe(1);
    });

    it('permite seleção específica do método EV_EBITDA isolado', () => {
      // targetEvToEbitda = 8.0 -> EV = 2.400M. Equity Value = 2.400M - 300M = 2.100M.
      // Preço = 2.100M / 50M = 42.00
      const result = calculateMultiplesValuation(baseStatement, baseQuote, {
        selectedMultipleMethod: 'EV_EBITDA',
        targetEvToEbitda: new Decimal('8.0'),
      });

      expect(result.status).toBe('VALID');
      expect(result.intrinsicValue?.toFixed(2)).toBe('42.00');
      expect(result.marginOfSafetyPercent?.toFixed(2)).toBe('5.00'); // (42 - 40) / 40 * 100
      expect(result.intermediates.methodApplied).toBe('EV_EBITDA');
    });

    it('permite seleção específica do método PB isolado', () => {
      // targetPb = 2.0 -> Preço = 2.0 * 16.00 = 32.00
      const result = calculateMultiplesValuation(baseStatement, baseQuote, {
        selectedMultipleMethod: 'PB',
        targetPb: new Decimal('2.0'),
      });

      expect(result.status).toBe('VALID');
      expect(result.intrinsicValue?.toFixed(2)).toBe('32.00');
      expect(result.marginOfSafetyPercent?.toFixed(2)).toBe('-20.00');
    });

    it('Ajuste 6 — bloqueia cálculo por divergência cambial estrita entre cotação e balanço', () => {
      const usdQuote: ValuationQuoteContext = {
        ...baseQuote,
        currency: 'USD',
      };

      const result = calculateMultiplesValuation(baseStatement, usdQuote);
      expect(result.status).toBe('INCOMPATIBLE');
      expect(result.dataQualityStatus).toBe('INCOMPATIBLE');
      expect(result.intrinsicValue).toBeNull();
      expect(result.marginOfSafetyPercent).toBeNull();
      expect(result.statusReason).toContain('Divergência cambial bloqueante');
      expect(result.statusReason).toContain('USD');
      expect(result.statusReason).toContain('BRL');
    });

    it('retorna INVALID_PREMISES se qualquer múltiplo alvo for nulo ou negativo', () => {
      const result = calculateMultiplesValuation(baseStatement, baseQuote, {
        targetPe: new Decimal('-5.0'),
      });

      expect(result.status).toBe('INVALID_PREMISES');
      expect(result.dataQualityStatus).toBe('INCOMPLETE');
      expect(result.intrinsicValue).toBeNull();
      expect(result.statusReason).toContain('estritamente maiores que zero');
    });

    it('retorna INSUFFICIENT_DATA se o número de ações for nulo ou zero', () => {
      const noSharesStmt: ValuationFundamentalContext = {
        ...baseStatement,
        sharesCount: new Decimal('0'),
      };

      const result = calculateMultiplesValuation(noSharesStmt, baseQuote);
      expect(result.status).toBe('INSUFFICIENT_DATA');
      expect(result.dataQualityStatus).toBe('INCOMPLETE');
      expect(result.intrinsicValue).toBeNull();
    });

    it('desconsidera métricas deficitárias na média e calcula apenas sobre as positivas', () => {
      const lossStmt: ValuationFundamentalContext = {
        ...baseStatement,
        netIncome: new Decimal('-50000000.00'), // Prejuízo -> fairPricePe = null
        // EBITDA = 300M (positivo) -> fairPriceEvToEbitda = 30.00
        // TotalEquity = 800M (positivo) -> fairPricePb = 24.00
      };

      const result = calculateMultiplesValuation(lossStmt, baseQuote);
      expect(result.status).toBe('VALID');
      expect(result.intermediates.fairPricePe).toBeNull();
      expect(result.intermediates.fairPriceEvToEbitda).toBe('30.0000');
      expect(result.intermediates.fairPricePb).toBe('24.0000');
      // Média dos 2 válidos: (30.00 + 24.00) / 2 = 27.00
      expect(result.intrinsicValue?.toFixed(2)).toBe('27.00');
      expect(result.intermediates.modelsUsedCount).toBe(2);
    });

    it('retorna NOT_APPLICABLE se todas as métricas contábeis forem deficitárias', () => {
      const fullyDistressedStmt: ValuationFundamentalContext = {
        ...baseStatement,
        netIncome: new Decimal('-100000000.00'), // Prejuízo
        ebitda: new Decimal('-50000000.00'), // EBITDA negativo
        totalEquity: new Decimal('-20000000.00'), // PL negativo
      };

      const result = calculateMultiplesValuation(fullyDistressedStmt, baseQuote);
      expect(result.status).toBe('NOT_APPLICABLE');
      expect(result.dataQualityStatus).toBe('UNAVAILABLE');
      expect(result.intrinsicValue).toBeNull();
      expect(result.statusReason).toContain('deficitárias ou insuficientes');
    });
  });

  // ─── 5. CONSENSO TEÓRICO (SUBETAPA 5.1) ────────────────────────────────────

  describe('Consenso Teórico de Preços (Consensus Engine)', () => {
    it('agrega todos os 4 modelos válidos (Bazin, Graham, DCF, Múltiplos) com pesos iguais (1/4)', () => {
      const bazin = calculateBazinValuation(baseStatement, baseQuote); // 50.00
      const graham = calculateGrahamValuation(baseStatement, baseQuote); // 32.8634
      const dcf = calculateSimplifiedDcfValuation(baseStatement, baseQuote); // 42.0923
      const multiples = calculateMultiplesValuation(baseStatement, baseQuote); // 28.00

      const consensus = calculateConsensusValuation(baseStatement, baseQuote, [
        bazin,
        graham,
        dcf,
        multiples,
      ]);

      expect(consensus.model).toBe('CONSENSUS');
      expect(consensus.status).toBe('VALID');
      expect(consensus.dataQualityStatus).toBe('VALID');
      expect(consensus.methodologyVersion).toBe(METHODOLOGY_VERSION);
      expect(consensus.modelsIncluded).toEqual(['BAZIN', 'GRAHAM', 'DCF_SIMPLIFIED', 'MULTIPLES']);
      expect(consensus.modelWeights.length).toBe(4);

      // Cada modelo tem peso 1/4 = 0.25
      for (const w of consensus.modelWeights) {
        expect(w.weight.toFixed(4)).toBe('0.2500');
        expect(w.status).toBe('VALID');
      }

      // Preço médio esperado = (50.00 + 32.863353 + 42.09228 + 28.00) / 4 = 38.2389
      expect(consensus.weightedTargetPrice).not.toBeNull();
      expect(consensus.weightedTargetPrice!.toFixed(2)).toBe('38.24');
      expect(consensus.marginOfSafetyPercent).not.toBeNull();
      expect(consensus.disclaimer).toBe(CONSENSUS_DISCLAIMER);
      expect(consensus.traceability.source).toBe('CARTEIRAEXPERT_CONSENSUS_ENGINE');
    });

    it('agrega apenas os modelos com status VALID se algum for NOT_APPLICABLE (ex: sem dividendos)', () => {
      const zeroDivStmt: ValuationFundamentalContext = {
        ...baseStatement,
        dividendsDeclared: new Decimal('0'),
      };

      const bazin = calculateBazinValuation(zeroDivStmt, baseQuote); // NOT_APPLICABLE
      const graham = calculateGrahamValuation(zeroDivStmt, baseQuote); // VALID
      const dcf = calculateSimplifiedDcfValuation(zeroDivStmt, baseQuote); // VALID
      const multiples = calculateMultiplesValuation(zeroDivStmt, baseQuote); // VALID

      const consensus = calculateConsensusValuation(zeroDivStmt, baseQuote, [
        bazin,
        graham,
        dcf,
        multiples,
      ]);

      expect(consensus.status).toBe('VALID');
      expect(consensus.modelsIncluded).toEqual(['GRAHAM', 'DCF_SIMPLIFIED', 'MULTIPLES']);
      expect(consensus.modelWeights.length).toBe(3);

      // Cada um com peso 1/3 = 0.3333
      for (const w of consensus.modelWeights) {
        expect(w.weight.toFixed(4)).toBe('0.3333');
      }
    });

    it('Ajuste 6 — bloqueia Consenso por divergência cambial e não emite preço-alvo', () => {
      const usdQuote: ValuationQuoteContext = {
        ...baseQuote,
        currency: 'USD',
      };

      const bazin = calculateBazinValuation(baseStatement, usdQuote);
      const graham = calculateGrahamValuation(baseStatement, usdQuote);
      const dcf = calculateSimplifiedDcfValuation(baseStatement, usdQuote);
      const multiples = calculateMultiplesValuation(baseStatement, usdQuote);

      const consensus = calculateConsensusValuation(baseStatement, usdQuote, [
        bazin,
        graham,
        dcf,
        multiples,
      ]);

      expect(consensus.status).toBe('INCOMPATIBLE');
      expect(consensus.dataQualityStatus).toBe('INCOMPATIBLE');
      expect(consensus.weightedTargetPrice).toBeNull();
      expect(consensus.marginOfSafetyPercent).toBeNull();
      expect(consensus.statusReason).toContain('Consenso bloqueado por divergência cambial');
    });

    it('retorna INSUFFICIENT_DATA se nenhum modelo atingir status VALID', () => {
      const distressedStmt: ValuationFundamentalContext = {
        ...baseStatement,
        netIncome: new Decimal('-100000000.00'),
        dividendsDeclared: new Decimal('0'),
        totalEquity: new Decimal('-20000000.00'),
        ebitda: new Decimal('-10000000.00'),
      };

      const bazin = calculateBazinValuation(distressedStmt, baseQuote);
      const graham = calculateGrahamValuation(distressedStmt, baseQuote);
      const dcf = calculateSimplifiedDcfValuation(distressedStmt, baseQuote);
      const multiples = calculateMultiplesValuation(distressedStmt, baseQuote);

      const consensus = calculateConsensusValuation(distressedStmt, baseQuote, [
        bazin,
        graham,
        dcf,
        multiples,
      ]);

      expect(consensus.status).toBe('INSUFFICIENT_DATA');
      expect(consensus.dataQualityStatus).toBe('INCOMPLETE');
      expect(consensus.weightedTargetPrice).toBeNull();
      expect(consensus.modelsIncluded.length).toBe(0);
    });
  });

  // ─── 6. MOTOR AGREGADO E GOVERNANÇA INTEGRADA ─────────────────────────────

  describe('Motor Agregado e Serialização (Governança v2)', () => {
    it('executa simultaneamente os quatro modelos + consenso com rastreabilidade completa', () => {
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
      expect(resultSet.dataQualityStatus).toBe('VALID');
      expect(resultSet.bazin.status).toBe('VALID');
      expect(resultSet.graham.status).toBe('VALID');
      expect(resultSet.dcf.status).toBe('VALID');
      expect(resultSet.multiples.status).toBe('VALID');
      expect(resultSet.consensus.status).toBe('VALID');
      expect(resultSet.consensus.weightedTargetPrice).not.toBeNull();
      expect(resultSet.globalDisclaimer).toBe(GLOBAL_VALUATION_DISCLAIMER);
      expect(resultSet.quoteAudit?.quotePriceUsed).toBe('40.0000');

      // Verificação da rastreabilidade em todos os modelos
      for (const m of [resultSet.bazin, resultSet.graham, resultSet.dcf, resultSet.multiples]) {
        expect(m.traceability.methodologyVersion).toBe(METHODOLOGY_VERSION);
        expect(m.traceability.formula).toBeDefined();
        expect(m.traceability.source).toBe('CVM_DFP');
        expect(m.traceability.limitations.length).toBeGreaterThan(0);
      }
      expect(resultSet.consensus.traceability.methodologyVersion).toBe(METHODOLOGY_VERSION);
    });

    it('Ajuste 6 — marca dataQualityStatus como INCOMPATIBLE quando a cotação é de outra moeda', () => {
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
      expect(resultSet.dataQualityStatus).toBe('INCOMPATIBLE');
      expect(resultSet.multiples.status).toBe('INCOMPATIBLE');
      expect(resultSet.multiples.intrinsicValue).toBeNull();
      expect(resultSet.consensus.status).toBe('INCOMPATIBLE');
      expect(resultSet.consensus.weightedTargetPrice).toBeNull();
    });

    it('serializa perfeitamente o conjunto completo para JSON/SSR', () => {
      const resultSet = calculateTheoreticalValuations(
        'asset-uuid-1',
        'VALE3',
        baseStatement,
        baseQuote
      );

      const serialized = serializeTheoreticalValuationResultSet(resultSet);

      expect(typeof serialized.calculatedAt).toBe('string');
      expect(serialized.dataQualityStatus).toBe('VALID');
      expect(serialized.bazin.intrinsicValue).toBe('50.0000');
      expect(serialized.bazin.marginOfSafetyPercent).toBe('25.00');
      expect(serialized.graham.intrinsicValue).toBe('32.8634');
      expect(serialized.dcf.intrinsicValue).toBe('42.0923');
      expect(serialized.multiples?.intrinsicValue).toBe('28.0000');
      expect(serialized.consensus?.weightedTargetPrice).toBe('38.2389');
      expect(serialized.consensus?.modelsIncluded).toContain('MULTIPLES');
      expect(serialized.globalDisclaimer).toBe(GLOBAL_VALUATION_DISCLAIMER);
    });
  });
});
