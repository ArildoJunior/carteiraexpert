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
    expect(container?.textContent).toContain('Fonte oficial CVM / B3');
  });

  it('renderiza estado de carregamento com skeleton animado', async () => {
    await act(async () => {
      root?.render(<AssetFundamentalsCard isLoading={true} />);
    });

    expect(container?.querySelector('.animate-pulse')).not.toBeNull();
  });

  it('renderiza estado de erro com mensagem explicativa', async () => {
    await act(async () => {
      root?.render(<AssetFundamentalsCard error="Falha de conexão com a base de dados" />);
    });

    expect(container?.textContent).toContain('Não foi possível carregar as demonstrações contábeis');
    expect(container?.textContent).toContain('Falha de conexão com a base de dados');
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

  it('renderiza metadados oficiais da companhia CVM quando disponíveis', async () => {
    const mockWithCompany: AssetFundamentalsViewData = {
      statement: {
        referencePeriod: '2024-FY',
        periodType: 'annual',
        statementType: 'CONSOLIDATED',
        referenceDate: '2024-12-31',
        filingDate: '2025-03-01',
        source: 'cvm',
        sourceReference: 'DFP-2024-009512',
        version: 2,
        isRestated: true,
        currency: 'BRL',
        netRevenue: '511000000000.0000',
        ebitda: '250000000000.0000',
        netIncome: '124000000000.0000',
        totalEquity: '410000000000.0000',
        totalAssets: '1065000000000.0000',
        grossDebt: '280000000000.0000',
        cashEquivalents: '70000000000.0000',
        sharesCount: '13044496930.0000000000',
        dividendsDeclared: '40000000000.0000',
        notes: null,
      },
      indicators: {
        netDebt: '210000000000.0000',
        netMargin: '0.2427',
        ebitdaMargin: '0.4892',
        roe: '0.3024',
        roa: '0.1164',
        lpa: '9.5059',
        vpa: '31.4309',
        netDebtToEbitda: '0.84',
        peRatio: '4.58',
        pbRatio: '1.39',
        dividendYield: '0.0705',
        quoteAudit: {
          quotePriceUsed: '43.5500',
          quoteDateUsed: '2026-08-28T18:00:00.000Z',
          quoteSource: 'cotahist',
          quoteDelayStatus: 'eod',
          isQuoteStale: false,
          currency: 'BRL',
        },
        currencyMismatch: false,
      },
      cvmCompany: {
        cnpj: '33000167000101',
        cvmCode: '009512',
        legalName: 'PETRÓLEO BRASILEIRO S.A. - PETROBRAS',
        tradeName: 'PETROBRAS',
        industrySector: 'Petróleo e Gás',
        marketType: 'BOLSA',
      },
    };

    await act(async () => {
      root?.render(<AssetFundamentalsCard fundamentals={mockWithCompany} />);
    });

    const text = container?.textContent ?? '';
    expect(text).toContain('PETRÓLEO BRASILEIRO S.A. - PETROBRAS');
    expect(text).toContain('33.000.167/0001-01');
    expect(text).toContain('009512');
    expect(text).toContain('Petróleo e Gás');
    expect(text).toContain('BOLSA');
    expect(text).toContain('v2 • Retificado');
    expect(text).toContain('DFP-2024-009512');
    expect(text).toContain('R$ 511.000.000.000,00');
    expect(text).toContain('R$ 124.000.000.000,00');
    expect(text).toContain('R$ 280.000.000.000,00');
    expect(text).toContain('13.044.496.930');
  });

  it('renderiza valores negativos e demonstração individual corretamente', async () => {
    const mockNegative: AssetFundamentalsViewData = {
      statement: {
        referencePeriod: '2024-FY',
        periodType: 'annual',
        statementType: 'INDIVIDUAL',
        referenceDate: '2024-12-31',
        filingDate: null,
        source: 'cvm',
        sourceReference: null,
        version: 1,
        isRestated: false,
        currency: 'BRL',
        netRevenue: '100000000.0000',
        ebitda: '-20000000.0000',
        netIncome: '-50000000.0000', // Prejuízo
        totalEquity: '-120000000.0000', // Passivo a descoberto
        totalAssets: '500000000.0000',
        grossDebt: '200000000.0000',
        cashEquivalents: '10000000.0000',
        sharesCount: '10000000.0000000000',
        dividendsDeclared: null,
        notes: null,
      },
      indicators: {
        netDebt: '190000000.0000',
        netMargin: '-0.5000',
        ebitdaMargin: '-0.2000',
        roe: null,
        roa: null,
        lpa: null,
        vpa: null,
        netDebtToEbitda: null,
        peRatio: null,
        pbRatio: null,
        dividendYield: null,
        quoteAudit: null,
        currencyMismatch: false,
      },
    };

    await act(async () => {
      root?.render(<AssetFundamentalsCard fundamentals={mockNegative} />);
    });

    const text = container?.textContent ?? '';
    expect(text).toContain('Individual');
    expect(text).toContain('-R$ 50.000.000,00');
    expect(text).toContain('-R$ 120.000.000,00');
    expect(text).toContain('-50,00%');
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

  it('não deve exibir JSON bruto de protocolo e metadados técnicos de ingestão', async () => {
    const mockJsonProtocol: AssetFundamentalsViewData = {
      statement: {
        referencePeriod: '2024-FY',
        periodType: 'annual',
        statementType: 'CONSOLIDATED',
        referenceDate: '2024-12-31',
        filingDate: null,
        source: 'cvm',
        sourceReference: JSON.stringify({
          source: 'cvm_dfp',
          fileId: '429a070e-d83b-4a71-8b9b-f2f20eb17dd6',
          runId: '2d4068da-c0de-48cd-a53d-a4e8b8abafa6',
          cnpj: '42771949000135',
          cvmCode: '024058',
          referenceDate: '2024-12-31',
          periodType: 'annual',
          statementType: 'CONSOLIDATED',
          exerciseOrder: 'ÚLTIMO',
          version: 2,
          parserVersion: '1.0.0',
        }),
        version: 2,
        isRestated: true,
        currency: 'BRL',
        netRevenue: '1000000.0000',
        ebitda: '200000.0000',
        netIncome: '100000.0000',
        totalEquity: '500000.0000',
        totalAssets: '1500000.0000',
        grossDebt: '400000.0000',
        cashEquivalents: '100000.0000',
        sharesCount: '1000000.0000000000',
        dividendsDeclared: null,
        notes: null,
      },
      indicators: {
        netDebt: '300000.0000',
        netMargin: '0.1000',
        ebitdaMargin: '0.2000',
        roe: '0.2000',
        roa: '0.0667',
        lpa: '0.1000',
        vpa: '0.5000',
        netDebtToEbitda: '1.50',
        peRatio: null,
        pbRatio: null,
        dividendYield: null,
        quoteAudit: null,
        currencyMismatch: false,
      },
      cvmCompany: {
        cnpj: '42771949000135',
        cvmCode: '024058',
        legalName: 'ALLIANÇA SAÚDE E PARTICIPAÇÕES S.A.',
        tradeName: 'ALLIANÇA',
        industrySector: 'Serviços Médicos',
        marketType: 'NOVO MERCADO',
      },
    };

    await act(async () => {
      root?.render(<AssetFundamentalsCard fundamentals={mockJsonProtocol} />);
    });

    const text = container?.textContent ?? '';
    // Confirma que o JSON bruto NÃO aparece
    expect(text).not.toContain('{"source"');
    expect(text).not.toContain('fileId');
    expect(text).not.toContain('runId');
    expect(text).not.toContain('429a070e');
    expect(text).not.toContain('2d4068da');
    expect(text).not.toContain('parserVersion');

    // Confirma que as informações úteis e legíveis aparecem
    expect(text).toContain('ALLIANÇA SAÚDE E PARTICIPAÇÕES S.A.');
    expect(text).toContain('42.771.949/0001-35');
    expect(text).toContain('024058');
    expect(text).toContain('DFP (2024)');
    expect(text).toContain('v2 • Retificado');
    expect(text).not.toContain('v2 (Reapresentado) Retificado'); // Sem duplicidade
  });

  it('renderiza v1 Original sem indicação indevida de retificação', async () => {
    const mockV1: AssetFundamentalsViewData = {
      statement: {
        referencePeriod: '2024-FY',
        periodType: 'annual',
        statementType: 'CONSOLIDATED',
        referenceDate: '2024-12-31',
        filingDate: null,
        source: 'cvm',
        sourceReference: null,
        version: 1,
        isRestated: false,
        currency: 'BRL',
        netRevenue: '1000000.0000',
        ebitda: '200000.0000',
        netIncome: '100000.0000',
        totalEquity: '500000.0000',
        totalAssets: '1500000.0000',
        grossDebt: '400000.0000',
        cashEquivalents: '100000.0000',
        sharesCount: '1000000.0000000000',
        dividendsDeclared: null,
        notes: null,
      },
      indicators: {
        netDebt: '300000.0000',
        netMargin: '0.1000',
        ebitdaMargin: '0.2000',
        roe: '0.2000',
        roa: '0.0667',
        lpa: '0.1000',
        vpa: '0.5000',
        netDebtToEbitda: '1.50',
        peRatio: null,
        pbRatio: null,
        dividendYield: null,
        quoteAudit: null,
        currencyMismatch: false,
      },
    };

    await act(async () => {
      root?.render(<AssetFundamentalsCard fundamentals={mockV1} />);
    });

    const text = container?.textContent ?? '';
    expect(text).toContain('v1 • Original');
    expect(text).not.toContain('Retificado');
    expect(text).not.toContain('Reapresentado');
  });
});
