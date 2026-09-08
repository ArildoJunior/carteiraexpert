'use client';

import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
} from 'recharts';
import { Decimal } from '@/lib/decimal';
import type { SerializedCspAssetAllocation } from '@/modules/market-data/server/csp.service';

export interface CspAllocationChartsProps {
  allocations: SerializedCspAssetAllocation[];
  className?: string;
}

const PALETTE = [
  '#10B981', // emerald
  '#06B6D4', // cyan
  '#3B82F6', // blue
  '#6366F1', // indigo
  '#8B5CF6', // purple
  '#EC4899', // pink
  '#F59E0B', // amber
  '#14B8A6', // teal
  '#F97316', // orange
  '#64748B', // slate
];

interface TooltipPayloadItem {
  payload: {
    name: string;
    value: number;
    color: string;
    marginOfSafety?: string;
  };
}

function DonutTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const item = payload[0].payload;

  return (
    <div className="rounded-xl border border-border-theme bg-surface p-3 shadow-xl text-xs space-y-1 z-50">
      <div className="flex items-center gap-2">
        <span
          className="w-2.5 h-2.5 rounded-full inline-block shrink-0"
          style={{ backgroundColor: item.color }}
        />
        <span className="font-bold text-text-primary text-sm">{item.name}</span>
      </div>
      <div className="flex justify-between gap-4 text-text-secondary">
        <span>Peso na Carteira:</span>
        <span className="font-bold text-text-primary">{item.value.toFixed(2)}%</span>
      </div>
      {item.marginOfSafety && (
        <div className="flex justify-between gap-4 text-text-secondary">
          <span>Margem de Segurança:</span>
          <span className="font-bold text-emerald-600 dark:text-emerald-400">
            {item.marginOfSafety}%
          </span>
        </div>
      )}
    </div>
  );
}

function BarTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const item = payload[0].payload;

  return (
    <div className="rounded-xl border border-border-theme bg-surface p-3 shadow-xl text-xs space-y-1 z-50">
      <div className="flex items-center gap-2">
        <span
          className="w-2.5 h-2.5 rounded-full inline-block shrink-0"
          style={{ backgroundColor: item.color }}
        />
        <span className="font-bold text-text-primary">{item.name}</span>
      </div>
      <div className="flex justify-between gap-4 text-text-secondary">
        <span>Concentração Setorial:</span>
        <span className="font-bold text-text-primary">{item.value.toFixed(2)}%</span>
      </div>
    </div>
  );
}

export function CspAllocationCharts({
  allocations,
  className = '',
}: CspAllocationChartsProps) {
  // 1. Dados para o Donut de Ativos
  // Conversão para number estritamente na fronteira visual do Recharts (SVG)
  const assetData = useMemo(() => {
    return allocations.map((alloc, idx) => {
      const weightDecimal = new Decimal(alloc.weight);
      const percentNumber = Number(weightDecimal.times(100).toFixed(2));
      return {
        name: alloc.ticker,
        value: percentNumber,
        marginOfSafety: Number(alloc.marginOfSafetyPercent).toFixed(1),
        color: PALETTE[idx % PALETTE.length],
      };
    });
  }, [allocations]);

  // 2. Dados agregados por setor para o BarChart horizontal
  // Conversão para number estritamente na fronteira visual do Recharts (SVG)
  const sectorData = useMemo(() => {
    const sectorMap = new Map<string, Decimal>();

    for (const alloc of allocations) {
      const current = sectorMap.get(alloc.sector) || new Decimal(0);
      sectorMap.set(alloc.sector, current.plus(new Decimal(alloc.weight)));
    }

    return Array.from(sectorMap.entries())
      .map(([sector, totalWeight], idx) => ({
        name: sector,
        value: Number(totalWeight.times(100).toFixed(2)),
        color: PALETTE[idx % PALETTE.length],
      }))
      .sort((a, b) => b.value - a.value);
  }, [allocations]);

  if (!allocations || allocations.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border-theme bg-surface-elevated/40 p-8 text-center text-xs text-text-muted">
        Nenhum ativo alocado para visualização gráfica.
      </div>
    );
  }

  return (
    <div className={`grid grid-cols-1 lg:grid-cols-2 gap-6 ${className}`}>
      {/* Gráfico 1: Donut de Alocação por Ativo */}
      <div className="rounded-xl border border-border-theme bg-surface p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-border-theme">
          <h4 className="text-sm font-bold text-text-primary">
            Distribuição de Capital por Ativo
          </h4>
          <span className="text-[11px] text-text-muted font-medium">
            {allocations.length} {allocations.length === 1 ? 'ativo' : 'ativos'}
          </span>
        </div>

        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={assetData}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={95}
                paddingAngle={2}
              >
                {assetData.map((entry) => (
                  <Cell key={`cell-asset-${entry.name}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip content={<DonutTooltip />} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Legenda dos Ativos */}
        <div className="flex flex-wrap gap-2 pt-2 border-t border-border-theme/60 text-xs">
          {assetData.map((entry) => (
            <div
              key={`legend-asset-${entry.name}`}
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-surface-elevated border border-border-theme text-[11px]"
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: entry.color }}
              />
              <span className="font-semibold text-text-primary">{entry.name}:</span>
              <span className="text-text-muted">{entry.value.toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* Gráfico 2: Concentração por Setor (BarChart Horizontal) */}
      <div className="rounded-xl border border-border-theme bg-surface p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-border-theme">
          <h4 className="text-sm font-bold text-text-primary">
            Concentração Setorial
          </h4>
          <span className="text-[11px] text-text-muted font-medium">
            {sectorData.length} {sectorData.length === 1 ? 'setor' : 'setores'}
          </span>
        </div>

        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={sectorData}
              layout="vertical"
              margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
            >
              <XAxis
                type="number"
                unit="%"
                domain={[0, 'dataMax + 5']}
                tick={{ fontSize: 11, fill: 'currentColor' }}
                className="text-text-muted"
              />
              <YAxis
                type="category"
                dataKey="name"
                width={100}
                tick={{ fontSize: 11, fill: 'currentColor' }}
                className="text-text-secondary"
              />
              <Tooltip content={<BarTooltip />} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                {sectorData.map((entry) => (
                  <Cell key={`cell-sector-${entry.name}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Legenda dos Setores */}
        <div className="flex flex-wrap gap-2 pt-2 border-t border-border-theme/60 text-xs">
          {sectorData.map((entry) => (
            <div
              key={`legend-sec-${entry.name}`}
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-surface-elevated border border-border-theme text-[11px]"
            >
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: entry.color }}
              />
              <span className="font-semibold text-text-primary truncate max-w-[120px]">
                {entry.name}:
              </span>
              <span className="text-text-muted">{entry.value.toFixed(1)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
