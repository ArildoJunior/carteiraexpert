/**
 * @vitest-environment jsdom
 */
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { B3HistoricalQuotesExplorer } from '@/modules/market-data/ui/B3HistoricalQuotesExplorer';
import type { B3HistoricalQuotesResult } from '@/modules/market-data/domain/b3-historical-quotes.types';

vi.mock('next/link', () => ({
  default: ({ children, href, id, className }: any) => (
    <a href={href} id={id} className={className}>
      {children}
    </a>
  ),
}));

describe('B3HistoricalQuotesExplorer — Testes Unitários de UI (jsdom)', () => {
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

  it('deve renderizar o estado vazio quando quotes for vazio', async () => {
    const emptyResult: B3HistoricalQuotesResult = {
      quotes: [],
      totalCount: 0,
      page: 1,
      limit: 20,
      totalPages: 1,
      ticker: 'NONEXIST99',
      order: 'desc',
    };

    await act(async () => {
      root!.render(<B3HistoricalQuotesExplorer initialResult={emptyResult} />);
    });

    const emptyState = container!.querySelector('#b3-empty-state');
    expect(emptyState).not.toBeNull();
    expect(emptyState?.textContent).toContain('NONEXIST99');
  });

  it('deve renderizar tabela com dados quando houver cotações', async () => {
    const populatedResult: B3HistoricalQuotesResult = {
      quotes: [
        {
          id: 'quote-1',
          batchId: 'batch-1',
          tradeDate: '2026-08-26',
          tradeDateFormatted: '26/08/2026',
          ticker: 'PETR4',
          bdiCode: '02',
          marketType: 10,
          marketTypeDescription: 'VISTA',
          shortName: 'PETROBRAS',
          specification: 'PN',
          forwardTermDays: null,
          currency: 'BRL',
          openPrice: '38.50000000',
          highPrice: '39.00000000',
          lowPrice: '38.10000000',
          averagePrice: '38.60000000',
          closePrice: '38.85000000',
          bestBidPrice: null,
          bestAskPrice: null,
          tradeCount: 15400,
          quantity: '25000000.0000000000',
          financialVolume: '965000000.0000000000',
          strikePrice: null,
          expirationDate: null,
          quotationFactor: 1,
          isin: 'BRPETRACNPR6',
          distributionNumber: 120,
          assetId: 'asset-petr4',
        },
      ],
      totalCount: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
      ticker: 'PETR4',
      order: 'desc',
    };

    await act(async () => {
      root!.render(<B3HistoricalQuotesExplorer initialResult={populatedResult} />);
    });

    const table = container!.querySelector('#b3-historical-table');
    expect(table).not.toBeNull();
    expect(table?.textContent).toContain('26/08/2026');
    expect(table?.textContent).toContain('PETR4');
    expect(table?.textContent).toContain('R$ 38,50');
    expect(table?.textContent).toContain('R$ 38,85');

    const emptyState = container!.querySelector('#b3-empty-state');
    expect(emptyState).toBeNull();
  });

  it('deve exibir controles de paginação quando totalPages > 1', async () => {
    const pagedResult: B3HistoricalQuotesResult = {
      quotes: [
        {
          id: 'quote-1',
          batchId: 'batch-1',
          tradeDate: '2026-08-26',
          tradeDateFormatted: '26/08/2026',
          ticker: 'VALE3',
          bdiCode: '02',
          marketType: 10,
          marketTypeDescription: 'VISTA',
          shortName: 'VALE',
          specification: 'ON',
          forwardTermDays: null,
          currency: 'BRL',
          openPrice: '60.00000000',
          highPrice: '61.00000000',
          lowPrice: '59.50000000',
          averagePrice: '60.50000000',
          closePrice: '60.80000000',
          bestBidPrice: null,
          bestAskPrice: null,
          tradeCount: 12000,
          quantity: '10000000.0000000000',
          financialVolume: '605000000.0000000000',
          strikePrice: null,
          expirationDate: null,
          quotationFactor: 1,
          isin: 'BRVALEACNOR0',
          distributionNumber: 100,
          assetId: 'asset-vale3',
        },
      ],
      totalCount: 45,
      page: 1,
      limit: 20,
      totalPages: 3,
      ticker: 'VALE3',
      order: 'desc',
    };

    await act(async () => {
      root!.render(<B3HistoricalQuotesExplorer initialResult={pagedResult} />);
    });

    const pageInfo = container!.querySelector('#b3-page-info');
    expect(pageInfo).not.toBeNull();
    expect(pageInfo?.textContent).toContain('Página 1 de 3');

    const nextBtn = container!.querySelector('#b3-pagination-next');
    expect(nextBtn).not.toBeNull();
  });
});
