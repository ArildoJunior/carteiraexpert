/**
 * @vitest-environment jsdom
 */
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TheoreticalValuationCard } from '@/modules/catalog/ui/TheoreticalValuationCard';
import type { SerializedTheoreticalValuationResultSet } from '@/modules/market-data/domain/theoretical-valuation.types';

describe('TheoreticalValuationCard — Testes Unitários de UI (jsdom)', () => {
  let container: HTMLDivElement | null = null;
  let root: ReturnType<typeof createRoot> | null = null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root && container) {
      const currentRoot = root;
      act(() => {
        currentRoot.unmount();
      });
      container.remove();
    }
    container = null;
    root = null;
  });

  it('renderiza o estado vazio quando valuationData for nulo', async () => {
    await act(async () => {
      root!.render(<TheoreticalValuationCard valuationData={null} />);
    });

    expect(container!.textContent).toContain('Modelos Teóricos de Valuation');
    expect(container!.textContent).toContain('Demonstrações financeiras necessárias para cálculo');
  });

  it('renderiza os três modelos teóricos com valores e margens de segurança', async () => {
    const mockValuationData: SerializedTheoreticalValuationResultSet = {
      assetId: 'asset-1',
      ticker: 'PETR4',
      referencePeriod: '2025-4Q',
      currency: 'BRL',
      statementType: 'CONSOLIDATED',
      quoteAudit: {
        quotePriceUsed: '40.0000',
        quoteDateUsed: '2026-08-28T18:00:00.000Z',
        quoteSource: 'cotahist',
        quoteDelayStatus: 'eod',
        isQuoteStale: false,
        currency: 'BRL',
      },
      currencyMismatch: false,
      bazin: {
        model: 'BAZIN',
        modelName: 'Preço Teto de Bazin',
        status: 'VALID',
        statusReason: null,
        intrinsicValue: '50.0000',
        marginOfSafetyPercent: '25.00',
        marketPriceUsed: '40.0000',
        currency: 'BRL',
        premisesUsed: { targetDividendYield: '0.0600' },
        factualInputs: {
          dividendsDeclared: '150000000.0000',
          sharesCount: '50000000.0000',
          dpa: '3.0000',
          currency: 'BRL',
        },
        intermediates: { dpaDecimal: '3.000000' },
        disclaimer: 'Disclaimer Bazin',
      },
      graham: {
        model: 'GRAHAM',
        modelName: 'Fórmula de Graham',
        status: 'VALID',
        statusReason: null,
        intrinsicValue: '32.8634',
        marginOfSafetyPercent: '-17.84',
        marketPriceUsed: '40.0000',
        currency: 'BRL',
        premisesUsed: { grahamMultiplier: '22.50' },
        factualInputs: {
          netIncome: '150000000.0000',
          totalEquity: '800000000.0000',
          sharesCount: '50000000.0000',
          lpa: '3.0000',
          vpa: '16.0000',
          currency: 'BRL',
        },
        intermediates: {
          lpaDecimal: '3.000000',
          vpaDecimal: '16.000000',
          productLpaVpa: '1080.000000',
        },
        disclaimer: 'Disclaimer Graham',
      },
      dcf: {
        model: 'DCF_SIMPLIFIED',
        modelName: 'DCF Simplificado (2 Estágios)',
        status: 'VALID',
        statusReason: null,
        intrinsicValue: '42.0923',
        marginOfSafetyPercent: '5.23',
        marketPriceUsed: '40.0000',
        currency: 'BRL',
        premisesUsed: {
          discountRate: '0.1200',
          growthRateStage1: '0.0800',
          terminalGrowthRate: '0.0300',
          projectionYears: 5,
        },
        factualInputs: {
          netIncome: '150000000.0000',
          sharesCount: '50000000.0000',
          baseCashFlowPerShare: '3.0000',
          currency: 'BRL',
        },
        intermediates: {
          baseFlowPerShare: '3.000000',
          yearlyProjections: [],
          presentValueOfExplicitPeriod: '13.4678',
          terminalValueYearN: '50.4469',
          presentValueOfTerminalValue: '28.6248',
        },
        disclaimer: 'Disclaimer DCF',
      },
      globalDisclaimer: 'Aviso de Neutralidade Regulatória (CVM).',
      calculatedAt: '2026-09-04T12:00:00.000Z',
    };

    await act(async () => {
      root!.render(<TheoreticalValuationCard valuationData={mockValuationData} />);
    });

    const text = container!.textContent;
    // Bazin
    expect(text).toContain('Preço Teto de Bazin');
    expect(text).toContain('R$ 50,00');
    expect(text).toContain('+25,00%');

    // Graham
    expect(text).toContain('Fórmula de Graham');
    expect(text).toContain('R$ 32,86');
    expect(text).toContain('-17,84%');

    // DCF
    expect(text).toContain('DCF Simplificado');
    expect(text).toContain('R$ 42,09');
    expect(text).toContain('+5,23%');

    // Disclaimer
    expect(text).toContain('Finalidade Informativa e Educacional (CVM)');
    expect(text).toContain('Aviso de Neutralidade Regulatória (CVM)');
  });

  it('permite abrir o simulador de premissas interativo', async () => {
    const mockValuationData: SerializedTheoreticalValuationResultSet = {
      assetId: 'asset-1',
      ticker: 'PETR4',
      referencePeriod: '2025-4Q',
      currency: 'BRL',
      statementType: 'CONSOLIDATED',
      quoteAudit: null,
      currencyMismatch: false,
      bazin: {
        model: 'BAZIN',
        modelName: 'Preço Teto de Bazin',
        status: 'VALID',
        statusReason: null,
        intrinsicValue: '50.0000',
        marginOfSafetyPercent: null,
        marketPriceUsed: null,
        currency: 'BRL',
        premisesUsed: { targetDividendYield: '0.0600' },
        factualInputs: {
          dividendsDeclared: '150000000.0000',
          sharesCount: '50000000.0000',
          dpa: '3.0000',
          currency: 'BRL',
        },
        intermediates: { dpaDecimal: '3.000000' },
        disclaimer: 'Disclaimer Bazin',
      },
      graham: {
        model: 'GRAHAM',
        modelName: 'Fórmula de Graham',
        status: 'VALID',
        statusReason: null,
        intrinsicValue: '32.8634',
        marginOfSafetyPercent: null,
        marketPriceUsed: null,
        currency: 'BRL',
        premisesUsed: { grahamMultiplier: '22.50' },
        factualInputs: {
          netIncome: '150000000.0000',
          totalEquity: '800000000.0000',
          sharesCount: '50000000.0000',
          lpa: '3.0000',
          vpa: '16.0000',
          currency: 'BRL',
        },
        intermediates: {
          lpaDecimal: '3.000000',
          vpaDecimal: '16.000000',
          productLpaVpa: '1080.000000',
        },
        disclaimer: 'Disclaimer Graham',
      },
      dcf: {
        model: 'DCF_SIMPLIFIED',
        modelName: 'DCF Simplificado (2 Estágios)',
        status: 'VALID',
        statusReason: null,
        intrinsicValue: '42.0923',
        marginOfSafetyPercent: null,
        marketPriceUsed: null,
        currency: 'BRL',
        premisesUsed: {
          discountRate: '0.1200',
          growthRateStage1: '0.0800',
          terminalGrowthRate: '0.0300',
          projectionYears: 5,
        },
        factualInputs: {
          netIncome: '150000000.0000',
          sharesCount: '50000000.0000',
          baseCashFlowPerShare: '3.0000',
          currency: 'BRL',
        },
        intermediates: {
          baseFlowPerShare: '3.000000',
          yearlyProjections: [],
          presentValueOfExplicitPeriod: '13.4678',
          terminalValueYearN: '50.4469',
          presentValueOfTerminalValue: '28.6248',
        },
        disclaimer: 'Disclaimer DCF',
      },
      globalDisclaimer: 'Aviso de Neutralidade Regulatória (CVM).',
      calculatedAt: '2026-09-04T12:00:00.000Z',
    };

    await act(async () => {
      root!.render(<TheoreticalValuationCard valuationData={mockValuationData} />);
    });

    const toggleBtn = container!.querySelector('button');
    expect(toggleBtn?.textContent).toContain('Ajustar Premissas');

    await act(async () => {
      toggleBtn!.click();
    });

    expect(container!.textContent).toContain('Simulador Interativo de Premissas');
    expect(container!.textContent).toContain('Bazin: DY Alvo (%)');
    expect(container!.textContent).toContain('Graham: Multiplicador');
    expect(container!.textContent).toContain('DCF: Taxa de Desconto (r)');
    expect(container!.textContent).toContain('Múltiplos: P/L Alvo');
    expect(container!.textContent).toContain('Múltiplos: P/VP Alvo');
    expect(container!.textContent).toContain('Múltiplos: EV/EBITDA Alvo');
  });

  it('renderiza modelo de Múltiplos e card de Consenso Teórico com amplitude e dispersão', async () => {
    const mockValuationWithConsensus: SerializedTheoreticalValuationResultSet = {
      assetId: 'asset-1',
      ticker: 'PETR4',
      referencePeriod: '2025-4Q',
      currency: 'BRL',
      statementType: 'CONSOLIDATED',
      dataQualityStatus: 'VALID',
      quoteAudit: {
        quotePriceUsed: '40.0000',
        quoteDateUsed: '2026-08-28T18:00:00.000Z',
        quoteSource: 'cotahist',
        quoteDelayStatus: 'eod',
        isQuoteStale: false,
        currency: 'BRL',
      },
      currencyMismatch: false,
      bazin: {
        model: 'BAZIN',
        modelName: 'Preço Teto de Bazin',
        status: 'VALID',
        statusReason: null,
        intrinsicValue: '50.0000',
        marginOfSafetyPercent: '25.00',
        marketPriceUsed: '40.0000',
        currency: 'BRL',
        premisesUsed: { targetDividendYield: '0.0600' },
        factualInputs: {
          dividendsDeclared: '150000000.0000',
          sharesCount: '50000000.0000',
          dpa: '3.0000',
          currency: 'BRL',
        },
        intermediates: { dpaDecimal: '3.000000' },
        disclaimer: 'Disclaimer Bazin',
      },
      graham: {
        model: 'GRAHAM',
        modelName: 'Fórmula de Graham',
        status: 'VALID',
        statusReason: null,
        intrinsicValue: '32.8634',
        marginOfSafetyPercent: '-17.84',
        marketPriceUsed: '40.0000',
        currency: 'BRL',
        premisesUsed: { grahamMultiplier: '22.50' },
        factualInputs: {
          netIncome: '150000000.0000',
          totalEquity: '800000000.0000',
          sharesCount: '50000000.0000',
          lpa: '3.0000',
          vpa: '16.0000',
          currency: 'BRL',
        },
        intermediates: {
          lpaDecimal: '3.000000',
          vpaDecimal: '16.000000',
          productLpaVpa: '1080.000000',
        },
        disclaimer: 'Disclaimer Graham',
      },
      dcf: {
        model: 'DCF_SIMPLIFIED',
        modelName: 'DCF Simplificado (2 Estágios)',
        status: 'VALID',
        statusReason: null,
        intrinsicValue: '42.0923',
        marginOfSafetyPercent: '5.23',
        marketPriceUsed: '40.0000',
        currency: 'BRL',
        premisesUsed: {
          discountRate: '0.1200',
          growthRateStage1: '0.0800',
          terminalGrowthRate: '0.0300',
          projectionYears: 5,
        },
        factualInputs: {
          netIncome: '150000000.0000',
          sharesCount: '50000000.0000',
          baseCashFlowPerShare: '3.0000',
          currency: 'BRL',
        },
        intermediates: {
          baseFlowPerShare: '3.000000',
          yearlyProjections: [],
          presentValueOfExplicitPeriod: '13.4678',
          terminalValueYearN: '50.4469',
          presentValueOfTerminalValue: '28.6248',
        },
        disclaimer: 'Disclaimer DCF',
      },
      multiples: {
        model: 'MULTIPLES',
        modelName: 'Múltiplos de Mercado',
        status: 'VALID',
        statusReason: null,
        intrinsicValue: '38.0000',
        marginOfSafetyPercent: '-5.00',
        marketPriceUsed: '40.0000',
        currency: 'BRL',
        premisesUsed: {
          targetPe: '15.00',
          targetEvToEbitda: '8.00',
          targetPb: '1.50',
          selectedMultipleMethod: 'AVERAGE',
        },
        factualInputs: {
          netIncome: '150000000.0000',
          totalEquity: '800000000.0000',
          ebitda: '300000000.0000',
          grossDebt: '400000000.0000',
          cashEquivalents: '100000000.0000',
          netDebt: '300000000.0000',
          sharesCount: '50000000.0000',
          lpa: '3.0000',
          vpa: '16.0000',
          currency: 'BRL',
        },
        intermediates: {
          lpaDecimal: '3.000000',
          vpaDecimal: '16.000000',
          netDebtDecimal: '300000000.0000',
          fairPricePe: '45.0000',
          fairPriceEvToEbitda: '42.0000',
          fairPricePb: '24.0000',
          methodApplied: 'AVERAGE',
          modelsUsedCount: 3,
        },
        disclaimer: 'Disclaimer Múltiplos',
      },
      consensus: {
        model: 'CONSENSUS',
        modelName: 'Consenso Teórico dos Modelos',
        status: 'VALID',
        statusReason: null,
        dataQualityStatus: 'VALID',
        weightedTargetPrice: '40.7389',
        marginOfSafetyPercent: '1.85',
        marketPriceUsed: '40.0000',
        currency: 'BRL',
        modelsIncluded: ['BAZIN', 'GRAHAM', 'DCF_SIMPLIFIED', 'MULTIPLES'],
        modelWeights: [
          { model: 'BAZIN', modelName: 'Décio Bazin', targetPrice: '50.0000', weight: '0.2500', status: 'VALID' },
          { model: 'GRAHAM', modelName: 'Benjamin Graham', targetPrice: '32.8634', weight: '0.2500', status: 'VALID' },
          { model: 'DCF_SIMPLIFIED', modelName: 'DCF Simplificado', targetPrice: '42.0923', weight: '0.2500', status: 'VALID' },
          { model: 'MULTIPLES', modelName: 'Múltiplos', targetPrice: '38.0000', weight: '0.2500', status: 'VALID' },
        ],
        disclaimer: 'Disclaimer Consenso',
        calculatedAt: '2026-09-04T12:00:00.000Z',
      },
      globalDisclaimer: 'Aviso de Neutralidade Regulatória (CVM).',
      calculatedAt: '2026-09-04T12:00:00.000Z',
    };

    await act(async () => {
      root!.render(<TheoreticalValuationCard valuationData={mockValuationWithConsensus} />);
    });

    const text = container!.textContent ?? '';

    // Consenso
    expect(text).toContain('Consenso Teórico dos Modelos');
    expect(text).toContain('R$ 40,74');
    expect(text).toContain('+1,85%');
    expect(text).toContain('Amplitude dos Modelos');
    expect(text).toContain('Dispersão entre Modelos');

    // Múltiplos
    expect(text).toContain('Múltiplos de Mercado');
    expect(text).toContain('R$ 38,00');
    expect(text).toContain('-5,00%');
    expect(text).toContain('P/L Teórico:');
    expect(text).toContain('R$ 45,00');
    expect(text).toContain('P/VP Teórico:');
    expect(text).toContain('R$ 24,00');
    expect(text).toContain('EV/EBITDA Teórico:');
    expect(text).toContain('R$ 42,00');

    // Badge de qualidade
    expect(text).toContain('Dados Válidos');
  });

  it('exibe alerta de bloqueio por inconsistência cambial quando currencyMismatch for verdadeiro', async () => {
    const mockCurrencyMismatch: SerializedTheoreticalValuationResultSet = {
      assetId: 'asset-adr-1',
      ticker: 'PBR',
      referencePeriod: '2025-4Q',
      currency: 'BRL',
      statementType: 'CONSOLIDATED',
      dataQualityStatus: 'INCOMPATIBLE',
      quoteAudit: {
        quotePriceUsed: '15.0000',
        quoteDateUsed: '2026-08-28T18:00:00.000Z',
        quoteSource: 'market_quotes',
        quoteDelayStatus: 'delayed_15m',
        isQuoteStale: false,
        currency: 'USD',
      },
      currencyMismatch: true,
      bazin: {
        model: 'BAZIN',
        modelName: 'Preço Teto de Bazin',
        status: 'VALID',
        statusReason: null,
        intrinsicValue: '50.0000',
        marginOfSafetyPercent: null,
        marketPriceUsed: '15.0000',
        currency: 'BRL',
        premisesUsed: { targetDividendYield: '0.0600' },
        factualInputs: {
          dividendsDeclared: '150000000.0000',
          sharesCount: '50000000.0000',
          dpa: '3.0000',
          currency: 'BRL',
        },
        intermediates: { dpaDecimal: '3.000000' },
        disclaimer: 'Disclaimer Bazin',
      },
      graham: {
        model: 'GRAHAM',
        modelName: 'Fórmula de Graham',
        status: 'VALID',
        statusReason: null,
        intrinsicValue: '32.8634',
        marginOfSafetyPercent: null,
        marketPriceUsed: '15.0000',
        currency: 'BRL',
        premisesUsed: { grahamMultiplier: '22.50' },
        factualInputs: {
          netIncome: '150000000.0000',
          totalEquity: '800000000.0000',
          sharesCount: '50000000.0000',
          lpa: '3.0000',
          vpa: '16.0000',
          currency: 'BRL',
        },
        intermediates: {
          lpaDecimal: '3.000000',
          vpaDecimal: '16.000000',
          productLpaVpa: '1080.000000',
        },
        disclaimer: 'Disclaimer Graham',
      },
      dcf: {
        model: 'DCF_SIMPLIFIED',
        modelName: 'DCF Simplificado (2 Estágios)',
        status: 'VALID',
        statusReason: null,
        intrinsicValue: '42.0923',
        marginOfSafetyPercent: null,
        marketPriceUsed: '15.0000',
        currency: 'BRL',
        premisesUsed: {
          discountRate: '0.1200',
          growthRateStage1: '0.0800',
          terminalGrowthRate: '0.0300',
          projectionYears: 5,
        },
        factualInputs: {
          netIncome: '150000000.0000',
          sharesCount: '50000000.0000',
          baseCashFlowPerShare: '3.0000',
          currency: 'BRL',
        },
        intermediates: {
          baseFlowPerShare: '3.000000',
          yearlyProjections: [],
          presentValueOfExplicitPeriod: '13.4678',
          terminalValueYearN: '50.4469',
          presentValueOfTerminalValue: '28.6248',
        },
        disclaimer: 'Disclaimer DCF',
      },
      globalDisclaimer: 'Aviso de Neutralidade Regulatória (CVM).',
      calculatedAt: '2026-09-04T12:00:00.000Z',
    };

    await act(async () => {
      root!.render(<TheoreticalValuationCard valuationData={mockCurrencyMismatch} />);
    });

    const text = container!.textContent ?? '';
    expect(text).toContain('Bloqueio por inconsistência cambial');
    expect(text).toContain('A moeda da cotação de mercado difere da moeda contábil');
  });
});
