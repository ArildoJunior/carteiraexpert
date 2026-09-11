'use client';

import { useState, useMemo } from 'react';
import { Decimal } from '@/lib/decimal';
import type { SerializedCspAssetAllocation } from '@/modules/market-data/server/csp.service';

export interface CspAllocationTableProps {
  allocations: SerializedCspAssetAllocation[];
  currency?: string;
  className?: string;
}

type SortField = 'ticker' | 'sector' | 'marketPrice' | 'theoreticalPrice' | 'marginOfSafetyPercent' | 'weight';
type SortOrder = 'asc' | 'desc';

function formatCurrency(valStr: string | null | undefined, currency = 'BRL'): string {
  if (!valStr) { return '—'; }
  try {
    const d = new Decimal(valStr);
    const isNegative = d.isNegative();
    const absD = d.abs();
    const parts = absD.toFixed(2).split('.');
    const integerPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const decimalPart = parts[1] || '00';
    const prefix = currency === 'BRL' ? 'R$ ' : `${currency} `;
    return `${isNegative ? '-' : ''}${prefix}${integerPart},${decimalPart}`;
  } catch {
    return '—';
  }
}

function formatPercent(valStr: string | null | undefined): string {
  if (!valStr) { return '—'; }
  try {
    const d = new Decimal(valStr);
    const isNegative = d.isNegative();
    const absD = d.abs();
    const parts = absD.toFixed(2).split('.');
    const integerPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    const decimalPart = parts[1] || '00';
    return `${isNegative ? '-' : '+'}${integerPart},${decimalPart}%`;
  } catch {
    return '—';
  }
}

function formatWeightPercent(valStr: string | null | undefined): string {
  if (!valStr) { return '0,00%'; }
  try {
    const d = new Decimal(valStr).times(100);
    return `${d.toFixed(2).replace('.', ',')}%`;
  } catch {
    return '—';
  }
}

export function CspAllocationTable({
  allocations,
  currency = 'BRL',
  className = '',
}: CspAllocationTableProps) {
  const [sortField, setSortField] = useState<SortField>('marginOfSafetyPercent');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('desc');
    }
  };

  const sortedAllocations = useMemo(() => {
    return [...allocations].sort((a, b) => {
      let comp = 0;
      switch (sortField) {
        case 'ticker':
          comp = a.ticker.localeCompare(b.ticker);
          break;
        case 'sector':
          comp = a.sector.localeCompare(b.sector);
          break;
        case 'marketPrice':
          comp = new Decimal(a.marketPrice).minus(new Decimal(b.marketPrice)).toNumber();
          break;
        case 'theoreticalPrice':
          comp = new Decimal(a.theoreticalPrice).minus(new Decimal(b.theoreticalPrice)).toNumber();
          break;
        case 'marginOfSafetyPercent':
          comp = new Decimal(a.marginOfSafetyPercent).minus(new Decimal(b.marginOfSafetyPercent)).toNumber();
          break;
        case 'weight':
          comp = new Decimal(a.weight).minus(new Decimal(b.weight)).toNumber();
          break;
      }
      return sortOrder === 'asc' ? comp : -comp;
    });
  }, [allocations, sortField, sortOrder]);

  if (!allocations || allocations.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border-theme bg-surface-elevated/40 p-8 text-center text-xs text-text-muted">
        Nenhum ativo alocado pela simulação.
      </div>
    );
  }

  return (
    <div className={`rounded-xl border border-border-theme bg-surface overflow-hidden shadow-xs ${className}`}>
      <div className="p-4 border-b border-border-theme flex items-center justify-between">
        <div>
          <h4 className="text-sm font-bold text-text-primary">
            Ativos Alocados na Carteira
          </h4>
          <p className="text-xs text-text-muted">
            {allocations.length} {allocations.length === 1 ? 'ativo selecionado' : 'ativos selecionados'} com desconto sobre o preço teórico.
          </p>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-surface-elevated/60 text-text-secondary uppercase text-[10px] tracking-wider border-b border-border-theme">
            <tr>
              <th
                scope="col"
                className="py-3 px-4 font-bold cursor-pointer hover:text-text-primary transition-colors"
                onClick={() => handleSort('ticker')}
              >
                Ticker {sortField === 'ticker' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
              </th>
              <th
                scope="col"
                className="py-3 px-4 font-bold cursor-pointer hover:text-text-primary transition-colors"
                onClick={() => handleSort('sector')}
              >
                Setor {sortField === 'sector' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
              </th>
              <th
                scope="col"
                className="py-3 px-4 font-bold text-right cursor-pointer hover:text-text-primary transition-colors"
                onClick={() => handleSort('marketPrice')}
              >
                Cotação {sortField === 'marketPrice' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
              </th>
              <th
                scope="col"
                className="py-3 px-4 font-bold text-right cursor-pointer hover:text-text-primary transition-colors"
                onClick={() => handleSort('theoreticalPrice')}
              >
                Preço Teórico {sortField === 'theoreticalPrice' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
              </th>
              <th
                scope="col"
                className="py-3 px-4 font-bold text-right cursor-pointer hover:text-text-primary transition-colors"
                onClick={() => handleSort('marginOfSafetyPercent')}
              >
                Margem % {sortField === 'marginOfSafetyPercent' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
              </th>
              <th
                scope="col"
                className="py-3 px-4 font-bold text-right cursor-pointer hover:text-text-primary transition-colors"
                onClick={() => handleSort('weight')}
              >
                Peso % {sortField === 'weight' ? (sortOrder === 'asc' ? '▲' : '▼') : ''}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-theme/60">
            {sortedAllocations.map((alloc) => {
              const marginDec = new Decimal(alloc.marginOfSafetyPercent);
              const isMarginPositive = !marginDec.isNegative();

              return (
                <tr
                  key={`alloc-row-${alloc.ticker}`}
                  className="hover:bg-surface-elevated/40 transition-colors"
                >
                  <td className="py-3 px-4 font-bold text-text-primary">
                    <span className="px-2 py-0.5 rounded bg-surface-elevated border border-border-theme font-mono">
                      {alloc.ticker}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-text-secondary truncate max-w-[160px]">
                    {alloc.sector}
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-text-secondary">
                    {formatCurrency(alloc.marketPrice, currency)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-semibold text-text-primary">
                    {formatCurrency(alloc.theoreticalPrice, currency)}
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-bold">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-[11px] ${
                        isMarginPositive
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20'
                          : 'text-text-muted'
                      }`}
                    >
                      {formatPercent(alloc.marginOfSafetyPercent)}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right font-mono font-black text-brand">
                    {formatWeightPercent(alloc.weight)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
