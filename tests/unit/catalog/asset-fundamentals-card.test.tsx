/**
 * @vitest-environment jsdom
 */
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AssetFundamentalsCard } from '@/modules/catalog/ui/AssetFundamentalsCard';
import type { AssetFundamentalsViewData } from '@/modules/market-data';

describe('AssetFundamentalsCard — Testes Unitários de UI (jsdom)', () => {
  let container: HTMLDivElement | null = null;
  let root: ReturnType<typeof createRoot> | null = null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root && container) {
      act(() => {
        root?.unmount();
      });
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    container = null;
    root = null;
  });

  it('renderiza estado vazio quando fundamentals for nulo', async () => {
    await act(async () => {
      root?.render(<AssetFundamentalsCard fundamentals={null} />);
    });

    expect(container?.textContent).toContain('Demonstrações Contábeis e Fundamentos');
    expect(container?.textContent).toContain('ainda não cadastradas para este ativo no catálogo público');
  });

  it('renderiza dados fundamentais completos com indicadores e aviso legal', async () => {
    const mockData: AssetFundamentalsViewData = {
      statement: {
        referencePeriod: '2025-4Q',
        periodType: 'quarterly',
        statementType: 'CONSOLIDATED',
        referenceDate: '2025-12-31',
        filingDate: '2026-02-15',
        source: 'cvm',
        sourceReference: 'ITR-2025-PETR4',
        version: 1,
        isRestated: false,
        currency: 'BRL',
        netRevenue: '1000000000.0000',
        ebitda: '300000000.0000',
        netIncome: '150000000.0000',
        totalEquity: '800000000.0000',
        totalAssets: '2000000000.0000',
        grossDebt: '400000000.0000',
        cashEquivalents: '100000000.0000',
        sharesCount: '50000000.0000000000',
        dividendsDeclared: '50000000.0000',
        notes: null,
      },
      indicators: {
        netDebt: '300000000.0000',
        netMargin: '0.1500',
        ebitdaMargin: '0.3000',
        roe: '0.1875',
        roa: '0.0750',
        lpa: '3.0000',
        vpa: '16.0000',
        netDebtToEbitda: '1.00',
        peRatio: '10.00',
        pbRatio: '1.88',
        dividendYield: '0.0333',
        quoteAudit: {
          quotePriceUsed: '30.0000',
          quoteDateUsed: '2026-08-28T18:00:00.000Z',
          quoteSource: 'cotahist',
          quoteDelayStatus: 'eod',
          isQuoteStale: false,
          currency: 'BRL',
        },
        currencyMismatch: false,
      },
    };

    await act(async () => {
      root?.render(<AssetFundamentalsCard fundamentals={mockData} />);
    });

    const text = container?.textContent ?? '';
    expect(text).toContain('Demonstrações e Indicadores Fundamentais');
    expect(text).toContain('2025-4Q');
    expect(text).toContain('Consolidado');
    expect(text).toContain('CVM');
    expect(text).toContain('ITR-2025-PETR4');
    expect(text).toContain('10,00'); // P/L
    expect(text).toContain('1,88');  // P/VP
    expect(text).toContain('3,33%'); // DY
    expect(text).toContain('15,00%'); // Margem Líquida
    expect(text).toContain('18,75%'); // ROE
    expect(text).toContain('R$ 3,00'); // LPA
    expect(text).toContain('R$ 16,00'); // VPA
    expect(text).toContain('Finalidade Informativa e Educacional');
  });

  it('exibe alerta de incompatibilidade de moeda quando currencyMismatch for true', async () => {
    const mockMismatch: AssetFundamentalsViewData = {
      statement: {
        referencePeriod: '2025-FY',
        periodType: 'annual',
        statementType: 'CONSOLIDATED',
        referenceDate: '2025-12-31',
        filingDate: null,
        source: 'cvm',
        sourceReference: null,
        version: 1,
        isRestated: false,
        currency: 'BRL',
        netRevenue: null,
        ebitda: null,
        netIncome: null,
        totalEquity: null,
        totalAssets: null,
        grossDebt: null,
        cashEquivalents: null,
        sharesCount: null,
        dividendsDeclared: null,
        notes: null,
      },
      indicators: {
        netDebt: null,
        netMargin: null,
        ebitdaMargin: null,
        roe: null,
        roa: null,
        lpa: null,
        vpa: null,
        netDebtToEbitda: null,
        peRatio: null,
        pbRatio: null,
        dividendYield: null,
        quoteAudit: {
          quotePriceUsed: '5.0000',
          quoteDateUsed: '2026-08-28T18:00:00.000Z',
          quoteSource: 'market_quotes',
          quoteDelayStatus: 'realtime',
          isQuoteStale: false,
          currency: 'USD',
        },
        currencyMismatch: true,
      },
    };

    await act(async () => {
      root?.render(<AssetFundamentalsCard fundamentals={mockMismatch} />);
    });

    const text = container?.textContent ?? '';
    expect(text).toContain('Aviso: Cotação e demonstrativo contábil possuem moedas diferentes');
  });
});
