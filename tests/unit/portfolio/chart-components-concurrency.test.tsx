// @vitest-environment jsdom
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Habilita act(...) para React 19 em ambiente JSDOM
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
import { PortfolioEvolutionChart } from '../../../src/modules/portfolio/ui/PortfolioEvolutionChart';
import { DashboardAllocationCharts } from '../../../src/modules/portfolio/ui/DashboardAllocationCharts';
import { PortfolioAllocationCharts } from '../../../src/modules/portfolio/ui/PortfolioAllocationCharts';
import * as actionsModule from '../../../src/modules/portfolio/server/portfolio.actions';
import { ThemeProvider } from '../../../src/lib/theme/ThemeContext';
import type { SerializedPortfolioEvolutionSummary } from '../../../src/modules/portfolio/domain/portfolio-evolution.types';
import type { SerializedAssetPosition, SerializedPortfolioPositionsSummary } from '../../../src/modules/portfolio/domain/position.types';

// Mock do Recharts como elementos SVG nativos para evitar avisos de tag em HTML no JSDOM
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => <div className="responsive-container">{children}</div>,
  AreaChart: ({ children }: any) => <svg>{children}</svg>,
  Area: () => <g />,
  LineChart: ({ children }: any) => <svg>{children}</svg>,
  Line: () => <g />,
  PieChart: ({ children }: any) => <svg>{children}</svg>,
  Pie: () => <g />,
  Cell: () => <g />,
  XAxis: () => <g />,
  YAxis: () => <g />,
  Tooltip: () => <g />,
  CartesianGrid: () => <g />,
}));

describe('Unit: Concorrência e Snapshots Síncronos nos Componentes de Gráficos (React)', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;
  let saveCalls: any[] = [];

  beforeEach(() => {
    saveCalls = [];
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    vi.spyOn(actionsModule, 'saveChartPreferenceAction').mockImplementation(
      (input: any) =>
        new Promise((resolve) => {
          setTimeout(() => {
            saveCalls.push(input);
            resolve({ success: true, data: input });
          }, 25);
        })
    );

    vi.spyOn(actionsModule, 'getPortfolioEvolutionAction').mockResolvedValue({
      success: true,
      data: mockEvolutionSummary,
    });
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    if (container && container.parentNode) {
      container.parentNode.removeChild(container);
    }
    vi.restoreAllMocks();
  });

  const mockEvolutionSummary = {
    portfolioId: '00000000-0000-0000-0000-000000000001',
    portfolioName: 'Carteira Teste',
    baseCurrency: 'BRL',
    period: 'YTD',
    startDate: '2026-01-01',
    endDate: '2026-08-25',
    points: [
      {
        dateKey: '2026-08-25',
        investedCost: '1000.00',
        quotedInvestedCost: '1000.00',
        marketValue: '1200.00',
        unrealizedPnL: '200.00',
        unrealizedPnLPercent: '20.00',
        coveragePercent: '100.00',
        totalPositionsCount: 1,
        quotedPositionsCount: 1,
        stalePositionsCount: 0,
        unquotedPositionsCount: 0,
        hasStaleQuotes: false,
        isPartiallyValued: false,
        hasOnlyUnquotedPositions: false,
        hasOnlyStaleQuotes: false,
        formattedInvestedCost: 'R$ 1.000,00',
        formattedQuotedInvestedCost: 'R$ 1.000,00',
        formattedMarketValue: 'R$ 1.200,00',
        formattedUnrealizedPnL: '+R$ 200,00',
        formattedUnrealizedPnLPercent: '+20,00%',
        formattedCoveragePercent: '100%',
      },
    ],
    isCurrentlyPartiallyValued: false,
    hasOnlyUnquotedPositions: false,
    hasOnlyStaleQuotes: false,
    currentCoveragePercent: '100.00',
    formattedCurrentCoveragePercent: '100%',
    formattedCurrentInvestedCost: 'R$ 1.000,00',
    formattedCurrentMarketValue: 'R$ 1.200,00',
    formattedCurrentUnrealizedPnL: '+R$ 200,00',
    formattedCurrentUnrealizedPnLPercent: '+20,00%',
  } as unknown as SerializedPortfolioEvolutionSummary;

  const mockPositions = [
    {
      assetId: 'asset-1',
      ticker: 'PETR4',
      name: 'Petrobras PN',
      assetType: 'EQUITY_BR',
      currency: 'BRL',
      quantity: '100',
      totalCost: '3000.00',
      latestQuote: '35.00',
      quoteDate: '2026-08-25',
      delayStatus: 'eod',
      isStale: false,
      marketValue: '3500.00',
      unrealizedPnL: '500.00',
      unrealizedPnLPercent: '16.67',
      portfolioWeightPercent: '100.00',
      formattedQuantity: '100',
      formattedAverageCost: 'R$ 30,00',
      formattedTotalCost: 'R$ 3.000,00',
      formattedLatestQuote: 'R$ 35,00',
      formattedMarketValue: 'R$ 3.500,00',
      formattedUnrealizedPnL: '+R$ 500,00',
      formattedUnrealizedPnLPercent: '+16,67%',
      formattedPortfolioWeightPercent: '100,00%',
    },
  ] as unknown as SerializedAssetPosition[];

  const mockPortfolioSummaries = [
    {
      portfolioId: '00000000-0000-0000-0000-000000000001',
      portfolioName: 'Carteira Principal',
      baseCurrency: 'BRL',
      summary: {
        portfolioId: '00000000-0000-0000-0000-000000000001',
        totalCost: '3000.00',
        marketValue: '3500.00',
        unrealizedPnL: '500.00',
        unrealizedPnLPercent: '16.67',
        positionsCount: 1,
        quotedPositionsCount: 1,
        unquotedPositionsCount: 0,
        staleQuotesPositionsCount: 0,
        positions: mockPositions,
        formattedTotalCost: 'R$ 3.000,00',
        formattedMarketValue: 'R$ 3.500,00',
        formattedUnrealizedPnL: '+R$ 500,00',
        formattedUnrealizedPnLPercent: '+16,67%',
      } as unknown as SerializedPortfolioPositionsSummary,
    },
  ];

  it('1. Evolução: alteração rápida de período (1M) e modo (pnl) deve persistir a combinação final { period: "1M", viewMode: "pnl" }', async () => {
    await act(async () => {
      root?.render(
        <ThemeProvider defaultTheme="light">
          <PortfolioEvolutionChart
            initialSummary={mockEvolutionSummary}
            initialPreference={{
              chartArea: 'portfolio_evolution',
              period: 'YTD',
              viewMode: 'comparison',
            }}
          />
        </ThemeProvider>
      );
    });

    const periodBtn1M = container?.querySelector('#period-btn-1M') as HTMLButtonElement;
    const viewModeBtnPnL = container?.querySelector('#view-mode-btn-pnl') as HTMLButtonElement;

    expect(periodBtn1M).not.toBeNull();
    expect(viewModeBtnPnL).not.toBeNull();

    // Executa as duas alterações de forma síncrona/rápida, sem aguardar re-render entre elas
    await act(async () => {
      periodBtn1M.click();
      viewModeBtnPnL.click();
      await new Promise((r) => setTimeout(r, 60));
    });

    // Aguarda conclusão assíncrona do salvamento
    await vi.waitFor(
      () => {
        expect(saveCalls.length).toBeGreaterThanOrEqual(1);
        const lastPayload = saveCalls[saveCalls.length - 1];
        expect(lastPayload).toEqual({
          chartArea: 'portfolio_evolution',
          period: '1M',
          viewMode: 'pnl',
        });
      },
      { timeout: 1000 }
    );

    const finalPayload = saveCalls[saveCalls.length - 1];
    expect(finalPayload.period).toBe('1M');
    expect(finalPayload.viewMode).toBe('pnl');
  });

  it('2. Dashboard: alteração rápida de agrupamento (currency) e base (cost_basis) deve persistir { groupingType: "currency", basis: "cost_basis" }', async () => {
    await act(async () => {
      root?.render(
        <ThemeProvider defaultTheme="light">
          <DashboardAllocationCharts
            portfolioSummaries={mockPortfolioSummaries}
            initialPreference={{
              chartArea: 'dashboard_allocation',
              groupingType: 'asset_type',
              basis: 'market_value',
            }}
          />
        </ThemeProvider>
      );
    });

    const currencyTab = container?.querySelector('#dashboard-chart-tab-currency') as HTMLButtonElement;
    const costBasisBtn = container?.querySelector('#dashboard-chart-basis-cost_basis') as HTMLButtonElement;

    expect(currencyTab).not.toBeNull();
    expect(costBasisBtn).not.toBeNull();

    // Dispara dois cliques sucessivos na mesma área antes do render seguinte
    await act(async () => {
      currencyTab.click();
      costBasisBtn.click();
      await new Promise((r) => setTimeout(r, 60));
    });

    await vi.waitFor(
      () => {
        expect(saveCalls.length).toBeGreaterThanOrEqual(1);
        const lastPayload = saveCalls[saveCalls.length - 1];
        expect(lastPayload).toEqual({
          chartArea: 'dashboard_allocation',
          groupingType: 'currency',
          basis: 'cost_basis',
        });
      },
      { timeout: 1000 }
    );

    const finalPayload = saveCalls[saveCalls.length - 1];
    expect(finalPayload.groupingType).toBe('currency');
    expect(finalPayload.basis).toBe('cost_basis');
  });

  it('3. Alocação da Carteira: alteração rápida de agrupamento (asset_type) e base (cost_basis) deve persistir { groupingType: "asset_type", basis: "cost_basis" }', async () => {
    await act(async () => {
      root?.render(
        <ThemeProvider defaultTheme="light">
          <PortfolioAllocationCharts
            positions={mockPositions}
            baseCurrency="BRL"
            initialPreference={{
              chartArea: 'portfolio_allocation',
              groupingType: 'asset',
              basis: 'market_value',
            }}
          />
        </ThemeProvider>
      );
    });

    const assetTypeTab = container?.querySelector('#chart-grouping-tab-asset_type') as HTMLButtonElement;
    const costBasisBtn = container?.querySelector('#chart-basis-cost_basis') as HTMLButtonElement;

    expect(assetTypeTab).not.toBeNull();
    expect(costBasisBtn).not.toBeNull();

    // Dispara dois cliques sucessivos antes do próximo render
    await act(async () => {
      assetTypeTab.click();
      costBasisBtn.click();
      await new Promise((r) => setTimeout(r, 60));
    });

    await vi.waitFor(
      () => {
        expect(saveCalls.length).toBeGreaterThanOrEqual(1);
        const lastPayload = saveCalls[saveCalls.length - 1];
        expect(lastPayload).toEqual({
          chartArea: 'portfolio_allocation',
          groupingType: 'asset_type',
          basis: 'cost_basis',
        });
      },
      { timeout: 1000 }
    );

    const finalPayload = saveCalls[saveCalls.length - 1];
    expect(finalPayload.groupingType).toBe('asset_type');
    expect(finalPayload.basis).toBe('cost_basis');
  });

  it('4. Regressão Corrigida (Evolução): conclusão da sincronização (idle) não deve reverter 1M para YTD inicial', async () => {
    await act(async () => {
      root?.render(
        <ThemeProvider defaultTheme="light">
          <PortfolioEvolutionChart
            initialSummary={mockEvolutionSummary}
            initialPreference={{
              chartArea: 'portfolio_evolution',
              period: 'YTD',
              viewMode: 'comparison',
            }}
          />
        </ThemeProvider>
      );
    });

    const periodBtn1M = container?.querySelector('#period-btn-1M') as HTMLButtonElement;
    expect(periodBtn1M).not.toBeNull();

    // Usuário clica em 1M
    await act(async () => {
      periodBtn1M.click();
      // Aguarda resolução da Server Action e transição de status para idle
      await new Promise((r) => setTimeout(r, 80));
    });

    // Confirma que o botão 1M permanece selecionado após a conclusão da persistência
    const periodBtn1MAfter = container?.querySelector('#period-btn-1M') as HTMLButtonElement;
    const periodBtnYTDAfter = container?.querySelector('#period-btn-YTD') as HTMLButtonElement;

    expect(periodBtn1MAfter.getAttribute('aria-pressed')).toBe('true');
    expect(periodBtnYTDAfter.getAttribute('aria-pressed')).toBe('false');

    // Confirma que card exibe data-sync-status="idle"
    const card = container?.querySelector('#portfolio-evolution-card');
    expect(card?.getAttribute('data-sync-status')).toBe('idle');
  });

  it('5. Regressão Corrigida (Dashboard): conclusão da sincronização (idle) deve manter currency e cost_basis ativos', async () => {
    await act(async () => {
      root?.render(
        <ThemeProvider defaultTheme="light">
          <DashboardAllocationCharts
            portfolioSummaries={mockPortfolioSummaries}
            initialPreference={{
              chartArea: 'dashboard_allocation',
              groupingType: 'asset_type',
              basis: 'market_value',
            }}
          />
        </ThemeProvider>
      );
    });

    const currencyTab = container?.querySelector('#dashboard-chart-tab-currency') as HTMLButtonElement;
    const costBasisBtn = container?.querySelector('#dashboard-chart-basis-cost_basis') as HTMLButtonElement;

    await act(async () => {
      currencyTab.click();
      costBasisBtn.click();
      await new Promise((r) => setTimeout(r, 80));
    });

    const currencyTabAfter = container?.querySelector('#dashboard-chart-tab-currency') as HTMLButtonElement;
    const assetTypeTabAfter = container?.querySelector('#dashboard-chart-tab-asset_type') as HTMLButtonElement;
    const costBasisBtnAfter = container?.querySelector('#dashboard-chart-basis-cost_basis') as HTMLButtonElement;

    expect(currencyTabAfter.getAttribute('aria-pressed')).toBe('true');
    expect(assetTypeTabAfter.getAttribute('aria-pressed')).toBe('false');
    expect(costBasisBtnAfter.getAttribute('aria-pressed')).toBe('true');

    const containerDiv = container?.querySelector('#dashboard-allocation-charts-container');
    expect(containerDiv?.getAttribute('data-sync-status')).toBe('idle');
  });

  it('6. Atualização de Dados e Isolamento de Preferência: novo initialSummary atualiza métricas sem reverter preferência local', async () => {
    // 1. Renderiza componente com initialPreference YTD
    await act(async () => {
      root?.render(
        <ThemeProvider defaultTheme="light">
          <PortfolioEvolutionChart
            initialSummary={mockEvolutionSummary}
            initialPreference={{
              chartArea: 'portfolio_evolution',
              period: 'YTD',
              viewMode: 'comparison',
            }}
          />
        </ThemeProvider>
      );
    });

    const costMetricInitial = container?.querySelector('#evolution-metric-cost');
    expect(costMetricInitial?.textContent).toBe('R$ 1.000,00');

    // 2. Altera período para 1M
    const periodBtn1M = container?.querySelector('#period-btn-1M') as HTMLButtonElement;
    await act(async () => {
      periodBtn1M.click();
      await new Promise((r) => setTimeout(r, 80));
    });

    // 3. Confirma que 1M está selecionado
    expect(periodBtn1M.getAttribute('aria-pressed')).toBe('true');

    // 4. Re-renderiza o mesmo componente com um novo initialSummary legítimo (ex: após nova compra ou refresh do servidor)
    const newUpdatedSummary: SerializedPortfolioEvolutionSummary = {
      ...mockEvolutionSummary,
      period: 'YTD',
      formattedCurrentInvestedCost: 'R$ 5.500,00',
      formattedCurrentMarketValue: 'R$ 6.800,00',
      formattedCurrentUnrealizedPnL: '+R$ 1.300,00',
      points: [
        {
          ...mockEvolutionSummary.points[0],
          investedCost: '5500.00',
          marketValue: '6800.00',
          formattedInvestedCost: 'R$ 5.500,00',
          formattedMarketValue: 'R$ 6.800,00',
        },
      ],
    };

    await act(async () => {
      root?.render(
        <ThemeProvider defaultTheme="light">
          <PortfolioEvolutionChart
            initialSummary={newUpdatedSummary}
            initialPreference={{
              chartArea: 'portfolio_evolution',
              period: 'YTD',
              viewMode: 'comparison',
            }}
          />
        </ThemeProvider>
      );
    });

    // 5. Confirma simultaneamente:
    // a) Métrica financeira foi atualizada para o novo resumo
    const costMetricUpdated = container?.querySelector('#evolution-metric-cost');
    expect(costMetricUpdated?.textContent).toBe('R$ 5.500,00');

    // b) Preferência visual do usuário (1M) NÃO foi revertida para YTD
    const periodBtn1MAfter = container?.querySelector('#period-btn-1M') as HTMLButtonElement;
    const periodBtnYTDAfter = container?.querySelector('#period-btn-YTD') as HTMLButtonElement;

    expect(periodBtn1MAfter.getAttribute('aria-pressed')).toBe('true');
    expect(periodBtnYTDAfter.getAttribute('aria-pressed')).toBe('false');
  });
});
