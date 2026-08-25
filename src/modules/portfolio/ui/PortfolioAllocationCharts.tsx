'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
} from 'recharts';
import type { SerializedAssetPosition } from '../domain/position.types';
import type { AllocationBasis, ChartGroupingType } from '../domain/chart.types';
import type { SerializedUserChartPreference } from '../domain/chart-preferences.types';
import { calculatePortfolioAllocation } from '../domain/chart-engine';
import { useChartPreferenceSync } from './useChartPreferenceSync';
import { useTheme } from '@/lib/theme/ThemeContext';

interface PortfolioAllocationChartsProps {
  positions: SerializedAssetPosition[];
  baseCurrency?: string;
  initialPreference?: SerializedUserChartPreference;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: {
    payload: {
      label: string;
      secondaryLabel?: string | null;
      formattedValue: string;
      formattedPercent: string;
      color: string;
      positionsCount: number;
    };
  }[];
}

function ChartCustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const data = payload[0].payload;

  return (
    <div className="bg-surface-elevated border border-border-theme rounded-xl p-3.5 shadow-xl backdrop-blur-md text-xs space-y-1.5 min-w-[180px] z-50 text-text-primary">
      <div className="flex items-center gap-2">
        <span
          className="w-2.5 h-2.5 rounded-full inline-block shrink-0"
          style={{ backgroundColor: data.color }}
        />
        <p className="font-bold text-text-primary text-sm tracking-tight truncate">
          {data.label}
        </p>
      </div>

      {data.secondaryLabel && (
        <p className="text-text-secondary text-[11px] truncate">
          {data.secondaryLabel}
        </p>
      )}

      <div className="pt-1 border-t border-border-theme flex items-center justify-between gap-4 font-mono tabular-nums">
        <span className="text-text-secondary">Valor:</span>
        <span className="font-bold text-text-primary">{data.formattedValue}</span>
      </div>

      <div className="flex items-center justify-between gap-4 font-mono tabular-nums">
        <span className="text-text-secondary">Participação:</span>
        <span className="font-bold text-positive-text">{data.formattedPercent}</span>
      </div>
    </div>
  );
}

export interface PortfolioAllocationPreferenceSnapshot {
  chartArea: 'portfolio_allocation';
  groupingType: ChartGroupingType;
  basis: AllocationBasis;
}

export function PortfolioAllocationCharts({
  positions,
  baseCurrency = 'BRL',
  initialPreference,
}: PortfolioAllocationChartsProps) {
  const { tokens } = useTheme();
  const initialGrouping = (initialPreference?.groupingType as ChartGroupingType) || 'asset';
  const initialBasis = initialPreference?.basis || 'market_value';

  const [basis, setBasis] = useState<AllocationBasis>(initialBasis);
  const [groupingType, setGroupingType] = useState<ChartGroupingType>(initialGrouping);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const { syncPreference, syncStatus } = useChartPreferenceSync();

  const preferenceRef = useRef<PortfolioAllocationPreferenceSnapshot>({
    chartArea: 'portfolio_allocation',
    groupingType: initialGrouping,
    basis: initialBasis,
  });
  const hasLocalPreferenceChangeRef = useRef(false);
  const lastPropPreferenceRef = useRef(initialPreference);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (initialPreference !== lastPropPreferenceRef.current) {
      lastPropPreferenceRef.current = initialPreference;
      if (!hasLocalPreferenceChangeRef.current && initialPreference) {
        const g = (initialPreference.groupingType as ChartGroupingType) || 'asset';
        const b = initialPreference.basis || 'market_value';
        preferenceRef.current = {
          chartArea: 'portfolio_allocation',
          groupingType: g,
          basis: b,
        };
        setGroupingType(g);
        setBasis(b);
      }
    }
  }, [initialPreference]);

  const applyPreferenceChange = (
    change: Partial<Omit<PortfolioAllocationPreferenceSnapshot, 'chartArea'>>
  ) => {
    hasLocalPreferenceChangeRef.current = true;
    const next: PortfolioAllocationPreferenceSnapshot = {
      ...preferenceRef.current,
      ...change,
    };
    preferenceRef.current = next;

    if (change.groupingType !== undefined) {
      setGroupingType(next.groupingType);
    }
    if (change.basis !== undefined) {
      setBasis(next.basis);
    }

    syncPreference(next);
  };

  const handleGroupingChange = (type: ChartGroupingType) => {
    applyPreferenceChange({ groupingType: type });
  };

  const handleBasisChange = (b: AllocationBasis) => {
    applyPreferenceChange({ basis: b });
  };

  // Calcula a alocação de forma determinística (100% Decimal no domínio)
  const chartData = useMemo(() => {
    return calculatePortfolioAllocation(positions, {
      basis,
      groupingType,
      baseCurrency,
    });
  }, [positions, basis, groupingType, baseCurrency]);

  // Conversão para number exclusivamente na fronteira visual do Recharts
  const visualSlices = useMemo(() => {
    return chartData.slices.map((slice) => ({
      ...slice,
      numericValue: Number(slice.rawValue),
    }));
  }, [chartData.slices]);

  if (positions.length === 0) {
    return null;
  }

  const isCostBasis = basis === 'cost_basis';

  return (
    <div
      id="portfolio-allocation-charts-container"
      data-sync-status={syncStatus}
      className="bg-surface border border-border-theme rounded-2xl p-5 sm:p-6 shadow-sm space-y-6 text-text-primary"
    >
      {/* ─── Header do Gráfico ────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-border-theme">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="text-xl">📊</span>
            <h2 className="text-lg font-bold text-text-primary tracking-tight">
              Alocação e Composição Patrimonial
            </h2>
          </div>
          <p className="text-xs text-text-secondary mt-1">
            Distribuição proporcional da carteira calculada por{' '}
            <span className="font-semibold text-text-primary">
              {isCostBasis ? 'Custo de Aquisição' : 'Valor a Mercado'}
            </span>
            .
          </p>
        </div>

        {/* Controles de Visualização */}
        <div className="flex flex-wrap items-center gap-2.5 self-start md:self-auto">
          {/* Seletor de Agrupamento */}
          <div className="flex bg-background border border-border-theme p-1 rounded-xl text-xs font-semibold">
            <button
              id="chart-grouping-tab-asset"
              type="button"
              aria-pressed={groupingType === 'asset'}
              onClick={() => handleGroupingChange('asset')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                groupingType === 'asset'
                  ? 'bg-action-primary text-action-primary-text shadow-sm'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              Por Ativo
            </button>
            <button
              id="chart-grouping-tab-asset_type"
              type="button"
              aria-pressed={groupingType === 'asset_type'}
              onClick={() => handleGroupingChange('asset_type')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                groupingType === 'asset_type'
                  ? 'bg-action-primary text-action-primary-text shadow-sm'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              Por Classe
            </button>
            <button
              id="chart-grouping-tab-currency"
              type="button"
              aria-pressed={groupingType === 'currency'}
              onClick={() => handleGroupingChange('currency')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                groupingType === 'currency'
                  ? 'bg-action-primary text-action-primary-text shadow-sm'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              Por Moeda
            </button>
          </div>

          {/* Seletor de Base (Mercado vs Custo) */}
          <div className="flex bg-background border border-border-theme p-1 rounded-xl text-xs font-semibold">
            <button
              id="chart-basis-market_value"
              type="button"
              aria-pressed={basis === 'market_value'}
              onClick={() => handleBasisChange('market_value')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                basis === 'market_value'
                  ? 'bg-action-primary text-action-primary-text shadow-sm'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              Valor a Mercado
            </button>
            <button
              id="chart-basis-cost_basis"
              type="button"
              aria-pressed={basis === 'cost_basis'}
              onClick={() => handleBasisChange('cost_basis')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                basis === 'cost_basis'
                  ? 'bg-action-primary text-action-primary-text shadow-sm'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              Custo de Aquisição
            </button>
          </div>
        </div>
      </div>

      {/* ─── Alertas Informativos sobre Cotações ──────────────────────────── */}
      {basis === 'market_value' && chartData.isPartiallyQuoted && (
        <div
          id="chart-unquoted-warning"
          className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-700 dark:text-amber-300"
        >
          <div className="flex items-center gap-2">
            <span>⚠️</span>
            <span>
              <strong>{chartData.unquotedPositionsCount}</strong>{' '}
              {chartData.unquotedPositionsCount === 1 ? 'ativo' : 'ativos'} (custo de{' '}
              {chartData.formattedUnquotedTotalCost}) sem cotação de mercado não{' '}
              {chartData.unquotedPositionsCount === 1 ? 'está incluído' : 'estão incluídos'}{' '}
              na base de Valor a Mercado.
            </span>
          </div>
          <button
            type="button"
            onClick={() => handleBasisChange('cost_basis')}
            className="text-amber-700 dark:text-amber-200 underline font-semibold hover:opacity-80 shrink-0 self-start sm:self-auto"
          >
            Ver por Custo de Aquisição →
          </button>
        </div>
      )}

      {/* ─── Conteúdo do Gráfico / Estado Vazio ───────────────────────────── */}
      {basis === 'market_value' && chartData.hasOnlyUnquotedPositions ? (
        <div
          id="chart-only-unquoted-state"
          className="py-12 px-4 text-center space-y-3 bg-background border border-dashed border-border-theme rounded-2xl"
        >
          <div className="w-12 h-12 rounded-full bg-surface-elevated flex items-center justify-center text-xl mx-auto">
            📉
          </div>
          <h3 className="text-sm font-bold text-text-primary">
            Sem cotações de mercado disponíveis
          </h3>
          <p className="text-xs text-text-secondary max-w-md mx-auto">
            Os ativos em custódia ainda não possuem cotações cadastradas no banco interno para marcação a mercado.
          </p>
          <button
            id="chart-switch-to-cost-btn"
            type="button"
            onClick={() => handleBasisChange('cost_basis')}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-action-primary-text bg-action-primary hover:opacity-90 rounded-xl transition-all shadow-sm"
          >
            Visualizar por Custo de Aquisição
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Gráfico Donut/Rosca */}
          <div className="lg:col-span-6 flex items-center justify-center relative min-h-[280px]">
            {isMounted ? (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie
                    data={visualSlices}
                    dataKey="numericValue"
                    nameKey="label"
                    cx="50%"
                    cy="50%"
                    innerRadius={72}
                    outerRadius={105}
                    paddingAngle={2}
                    stroke={tokens.surface}
                    strokeWidth={2}
                    onMouseEnter={(_, index) => setActiveIndex(index)}
                    onMouseLeave={() => setActiveIndex(null)}
                  >
                    {visualSlices.map((slice, index) => (
                      <Cell
                        key={`cell-${slice.id}`}
                        fill={slice.color}
                        opacity={
                          activeIndex === null || activeIndex === index ? 1 : 0.4
                        }
                        className="transition-opacity duration-200 cursor-pointer"
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<ChartCustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="w-full h-[280px]" />
            )}

            {/* Totalizador no centro da Rosca */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none text-center">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-text-secondary">
                {isCostBasis ? 'Custo Total' : 'Valor a Mercado'}
              </span>
              <span className="text-base sm:text-lg font-bold font-mono tabular-nums text-text-primary tracking-tight">
                {chartData.formattedTotalValue}
              </span>
              <span className="text-[10px] text-text-secondary font-medium mt-0.5">
                {chartData.slices.length}{' '}
                {chartData.slices.length === 1 ? 'categoria' : 'categorias'}
              </span>
            </div>
          </div>

          {/* Lista de Legendas e Percentuais */}
          <div className="lg:col-span-6 space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
            {chartData.slices.map((slice, index) => {
              const isHovered = activeIndex === index;

              return (
                <div
                  key={slice.id}
                  id={`chart-legend-item-${slice.label}`}
                  role="button"
                  tabIndex={0}
                  aria-label={`${slice.label}: valor ${slice.formattedValue}, participação ${slice.formattedPercent}`}
                  onMouseEnter={() => setActiveIndex(index)}
                  onMouseLeave={() => setActiveIndex(null)}
                  onFocus={() => setActiveIndex(index)}
                  onBlur={() => setActiveIndex(null)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setActiveIndex(activeIndex === index ? null : index);
                    }
                  }}
                  className={`flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-action-primary ${
                    isHovered
                      ? 'bg-surface-elevated border-action-primary/50 shadow-md translate-x-1'
                      : 'bg-background border-border-theme hover:bg-surface-elevated'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className="w-3 h-3 rounded-full shrink-0 shadow-sm"
                      style={{ backgroundColor: slice.color }}
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-text-primary truncate">
                        {slice.label}
                      </p>
                      {slice.secondaryLabel && (
                        <p className="text-[11px] text-text-secondary truncate">
                          {slice.secondaryLabel}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="text-right shrink-0 pl-3 font-mono tabular-nums">
                    <p className="text-xs font-bold text-text-primary">
                      {slice.formattedValue}
                    </p>
                    <p className="text-[11px] font-semibold text-positive-text">
                      {slice.formattedPercent}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
