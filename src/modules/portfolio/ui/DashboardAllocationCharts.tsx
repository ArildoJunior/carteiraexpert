'use client';

import { useState, useMemo, useEffect, useRef } from 'react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
} from 'recharts';
import type { SerializedPortfolioPositionsSummary } from '../domain/position.types';
import type { AllocationBasis } from '../domain/chart.types';
import type { SerializedUserChartPreference } from '../domain/chart-preferences.types';
import {
  calculatePortfolioAllocation,
  CHART_PALETTE,
  formatChartMoney,
  formatChartPercent,
} from '../domain/chart-engine';
import { useChartPreferenceSync } from './useChartPreferenceSync';
import { Decimal } from '@/lib/decimal';
import { useTheme } from '@/lib/theme/ThemeContext';

interface DashboardAllocationChartsProps {
  portfolioSummaries: {
    portfolioId: string;
    portfolioName: string;
    baseCurrency: string;
    summary: SerializedPortfolioPositionsSummary;
  }[];
  initialPreference?: SerializedUserChartPreference;
}

type DashboardGroupingType = 'asset_type' | 'portfolio' | 'currency';

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

export interface DashboardAllocationPreferenceSnapshot {
  chartArea: 'dashboard_allocation';
  groupingType: DashboardGroupingType;
  basis: AllocationBasis;
}

export function DashboardAllocationCharts({
  portfolioSummaries,
  initialPreference,
}: DashboardAllocationChartsProps) {
  const { tokens } = useTheme();
  const initialGrouping = (initialPreference?.groupingType as DashboardGroupingType) || 'asset_type';
  const initialBasis = initialPreference?.basis || 'market_value';

  const [basis, setBasis] = useState<AllocationBasis>(initialBasis);
  const [groupingType, setGroupingType] = useState<DashboardGroupingType>(initialGrouping);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const { syncPreference, syncStatus } = useChartPreferenceSync();

  const preferenceRef = useRef<DashboardAllocationPreferenceSnapshot>({
    chartArea: 'dashboard_allocation',
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
        const g = (initialPreference.groupingType as DashboardGroupingType) || 'asset_type';
        const b = initialPreference.basis || 'market_value';
        preferenceRef.current = {
          chartArea: 'dashboard_allocation',
          groupingType: g,
          basis: b,
        };
        setGroupingType(g);
        setBasis(b);
      }
    }
  }, [initialPreference]);

  const applyPreferenceChange = (
    change: Partial<Omit<DashboardAllocationPreferenceSnapshot, 'chartArea'>>
  ) => {
    hasLocalPreferenceChangeRef.current = true;
    const next: DashboardAllocationPreferenceSnapshot = {
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

  const handleGroupingChange = (type: DashboardGroupingType) => {
    applyPreferenceChange({ groupingType: type });
  };

  const handleBasisChange = (b: AllocationBasis) => {
    applyPreferenceChange({ basis: b });
  };

  // Reúne todas as posições ativas de todas as carteiras
  const allPositions = useMemo(() => {
    return portfolioSummaries.flatMap((p) => p.summary.positions || []);
  }, [portfolioSummaries]);

  // Calcula a alocação consolidada (100% Decimal, sem somar moedas diferentes sem conversão)
  const chartData = useMemo(() => {
    if (allPositions.length === 0) {
      return null;
    }

    if (groupingType === 'portfolio') {
      let totalCalculatedValue = new Decimal(0);
      let totalQuotedCount = 0;
      let totalUnquotedCount = 0;
      let totalUnquotedCost = new Decimal(0);

      const isCost = basis === 'cost_basis';

      interface PortfolioGroup {
        id: string;
        key: string;
        label: string;
        secondaryLabel: string;
        currency: string;
        rawValue: Decimal;
        positionsCount: number;
        quotedCount: number;
        unquotedCount: number;
      }

      const portfolioGroups: PortfolioGroup[] = portfolioSummaries.map((p) => {
        let portfolioValue = new Decimal(0);
        let quotedCount = 0;
        let unquotedCount = 0;

        for (const pos of p.summary.positions || []) {
          const isBrl = pos.currency === 'BRL';
          const posCost = new Decimal(pos.totalCost || '0');
          const fxRate = pos.fxRateUsed ? new Decimal(pos.fxRateUsed) : null;

          const isQuoted =
            pos.hasQuote &&
            (isBrl
              ? pos.marketValue !== null && new Decimal(pos.marketValue).greaterThan(0)
              : pos.marketValueBrl !== null && new Decimal(pos.marketValueBrl).greaterThan(0));

          if (isQuoted) {
            quotedCount++;
            totalQuotedCount++;
          } else {
            unquotedCount++;
            totalUnquotedCount++;
            if (isBrl) {
              totalUnquotedCost = totalUnquotedCost.plus(posCost);
            } else if (fxRate && fxRate.greaterThan(0)) {
              totalUnquotedCost = totalUnquotedCost.plus(posCost.times(fxRate));
            }
          }

          if (isCost) {
            // Em modo custo de aquisição, ativos estrangeiros exigem conversão válida
            if (isBrl) {
              if (posCost.greaterThan(0)) {
                portfolioValue = portfolioValue.plus(posCost);
              }
            } else if (fxRate && fxRate.greaterThan(0)) {
              portfolioValue = portfolioValue.plus(posCost.times(fxRate));
            }
          } else {
            // Em modo valor de mercado, somente ativos com cotação válida entram no total
            if (isQuoted) {
              const effectiveMv = isBrl
                ? new Decimal(pos.marketValue!)
                : new Decimal(pos.marketValueBrl!);
              if (effectiveMv.greaterThan(0)) {
                portfolioValue = portfolioValue.plus(effectiveMv);
              }
            }
          }
        }

        totalCalculatedValue = totalCalculatedValue.plus(portfolioValue);

        const positionsCount = p.summary.positions?.length || 0;
        const secondaryLabel =
          p.baseCurrency !== 'BRL'
            ? `${p.baseCurrency} consolidado em BRL (${positionsCount} ${positionsCount === 1 ? 'ativo' : 'ativos'})`
            : `${positionsCount} ${positionsCount === 1 ? 'ativo' : 'ativos'}`;

        return {
          id: p.portfolioId,
          key: p.portfolioId,
          label: p.portfolioName,
          secondaryLabel,
          currency: 'BRL',
          rawValue: portfolioValue,
          positionsCount,
          quotedCount,
          unquotedCount,
        };
      });

      const validGroups = portfolioGroups
        .filter((g) => g.rawValue.greaterThan(0))
        .sort((a, b) => {
          const diff = b.rawValue.minus(a.rawValue);
          if (!diff.isZero()) return diff.toNumber();
          return a.label.localeCompare(b.label);
        });

      const slices = validGroups.map((g, index) => {
        const percent = totalCalculatedValue.greaterThan(0)
          ? g.rawValue.dividedBy(totalCalculatedValue).times(100)
          : new Decimal(0);

        return {
          id: g.id,
          key: g.key,
          label: g.label,
          secondaryLabel: g.secondaryLabel,
          assetType: null,
          currency: g.currency,
          rawValue: g.rawValue,
          percent,
          formattedValue: formatChartMoney(g.rawValue, 'BRL'),
          formattedPercent: formatChartPercent(percent),
          color: CHART_PALETTE[index % CHART_PALETTE.length],
          hasQuote: g.unquotedCount === 0 && g.positionsCount > 0,
          positionsCount: g.positionsCount,
        };
      });

      const totalPositionsCount = totalQuotedCount + totalUnquotedCount;

      return {
        basis,
        groupingType,
        baseCurrency: 'BRL',
        totalCalculatedValue,
        formattedTotalValue: formatChartMoney(totalCalculatedValue, 'BRL'),
        slices,
        totalPositionsCount,
        quotedPositionsCount: totalQuotedCount,
        unquotedPositionsCount: totalUnquotedCount,
        unquotedTotalCost: totalUnquotedCost,
        formattedUnquotedTotalCost: formatChartMoney(totalUnquotedCost, 'BRL'),
        isPartiallyQuoted: totalQuotedCount > 0 && totalUnquotedCount > 0,
        hasOnlyUnquotedPositions: totalQuotedCount === 0 && totalPositionsCount > 0,
        isEmpty: slices.length === 0,
      };
    }

    // Agrupamento por Classe ou Moeda via chart-engine (100% Decimal e com conversão cambial)
    return calculatePortfolioAllocation(allPositions, {
      basis,
      groupingType: groupingType === 'currency' ? 'currency' : 'asset_type',
      baseCurrency: 'BRL',
    });
  }, [allPositions, portfolioSummaries, basis, groupingType]);

  // Conversão para number exclusivamente na fronteira visual do Recharts
  const visualSlices = useMemo(() => {
    if (!chartData) return [];
    return chartData.slices.map((slice) => ({
      ...slice,
      numericValue: Number(slice.rawValue),
    }));
  }, [chartData]);

  if (!chartData || allPositions.length === 0) {
    return null;
  }

  const isCostBasis = basis === 'cost_basis';

  return (
    <div
      id="dashboard-allocation-charts-container"
      data-sync-status={syncStatus}
      className="bg-surface border border-border-theme rounded-2xl p-5 sm:p-6 shadow-xs space-y-6 text-text-primary"
    >
      {/* ─── Header do Gráfico ────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-border-theme/60">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-action-primary/10 border border-action-primary/20 flex items-center justify-center text-action-primary shrink-0">
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z"
                />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-text-primary tracking-tight">
              Alocação Consolidada
            </h2>
          </div>
          <p className="text-xs text-text-secondary mt-1">
            Composição global do patrimônio calculada por{' '}
            <span className="font-semibold text-text-primary">
              {isCostBasis ? 'Custo de Aquisição' : 'Valor a Mercado'}
            </span>
            .
          </p>
        </div>

        {/* Controles de Visualização */}
        <div className="flex flex-wrap items-center gap-2.5 self-start md:self-auto">
          {/* Seletor de Agrupamento */}
          <div className="flex bg-background border border-border-theme p-1 rounded-xl text-xs font-semibold shadow-xs">
            <button
              id="dashboard-chart-tab-asset_type"
              type="button"
              aria-pressed={groupingType === 'asset_type'}
              onClick={() => handleGroupingChange('asset_type')}
              className={`px-3 py-1.5 rounded-lg transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-action-primary ${
                groupingType === 'asset_type'
                  ? 'bg-action-primary text-action-primary-text shadow-xs'
                  : 'text-text-secondary hover:text-text-primary hover:bg-surface-elevated'
              }`}
            >
              Por Classe
            </button>
            <button
              id="dashboard-chart-tab-portfolio"
              type="button"
              aria-pressed={groupingType === 'portfolio'}
              onClick={() => handleGroupingChange('portfolio')}
              className={`px-3 py-1.5 rounded-lg transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-action-primary ${
                groupingType === 'portfolio'
                  ? 'bg-action-primary text-action-primary-text shadow-xs'
                  : 'text-text-secondary hover:text-text-primary hover:bg-surface-elevated'
              }`}
            >
              Por Carteira
            </button>
            <button
              id="dashboard-chart-tab-currency"
              type="button"
              aria-pressed={groupingType === 'currency'}
              onClick={() => handleGroupingChange('currency')}
              className={`px-3 py-1.5 rounded-lg transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-action-primary ${
                groupingType === 'currency'
                  ? 'bg-action-primary text-action-primary-text shadow-xs'
                  : 'text-text-secondary hover:text-text-primary hover:bg-surface-elevated'
              }`}
            >
              Por Moeda
            </button>
          </div>

          {/* Seletor de Base (Mercado vs Custo) */}
          <div className="flex bg-background border border-border-theme p-1 rounded-xl text-xs font-semibold shadow-xs">
            <button
              id="dashboard-chart-basis-market_value"
              type="button"
              aria-pressed={basis === 'market_value'}
              onClick={() => handleBasisChange('market_value')}
              className={`px-3 py-1.5 rounded-lg transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-action-primary ${
                basis === 'market_value'
                  ? 'bg-action-primary text-action-primary-text shadow-xs'
                  : 'text-text-secondary hover:text-text-primary hover:bg-surface-elevated'
              }`}
            >
              Valor a Mercado
            </button>
            <button
              id="dashboard-chart-basis-cost_basis"
              type="button"
              aria-pressed={basis === 'cost_basis'}
              onClick={() => handleBasisChange('cost_basis')}
              className={`px-3 py-1.5 rounded-lg transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-action-primary ${
                basis === 'cost_basis'
                  ? 'bg-action-primary text-action-primary-text shadow-xs'
                  : 'text-text-secondary hover:text-text-primary hover:bg-surface-elevated'
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
          id="dashboard-chart-unquoted-warning"
          className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-700 dark:text-amber-300 shadow-xs"
        >
          <div className="flex items-center gap-2.5">
            <svg
              className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <span>
              <strong>{chartData.unquotedPositionsCount}</strong>{' '}
              {chartData.unquotedPositionsCount === 1 ? 'posição' : 'posições'} (custo de{' '}
              {chartData.formattedUnquotedTotalCost}) sem cotação de mercado não{' '}
              {chartData.unquotedPositionsCount === 1 ? 'está incluída' : 'estão incluídas'}{' '}
              na base de Valor a Mercado.
            </span>
          </div>
          <button
            type="button"
            onClick={() => handleBasisChange('cost_basis')}
            className="text-amber-700 dark:text-amber-200 underline font-semibold hover:opacity-80 shrink-0 self-start sm:self-auto focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 rounded px-1"
          >
            Ver por Custo de Aquisição →
          </button>
        </div>
      )}

      {/* ─── Conteúdo do Gráfico / Estado Vazio ───────────────────────────── */}
      {basis === 'market_value' && chartData.hasOnlyUnquotedPositions ? (
        <div
          id="dashboard-chart-only-unquoted-state"
          className="py-12 px-4 text-center space-y-4 bg-background/50 border border-dashed border-border-theme rounded-2xl shadow-xs"
        >
          <div className="w-12 h-12 rounded-2xl bg-surface-elevated border border-border-theme flex items-center justify-center text-text-secondary mx-auto shadow-xs">
            <svg
              className="w-6 h-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="1.5"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
              />
            </svg>
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-text-primary">
              Sem cotações de mercado disponíveis
            </h3>
            <p className="text-xs text-text-secondary max-w-md mx-auto">
              Nenhum ativo consolidado possui cotação cadastrada no banco interno para marcação a mercado.
            </p>
          </div>
          <button
            id="dashboard-chart-switch-to-cost-btn"
            type="button"
            onClick={() => handleBasisChange('cost_basis')}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-action-primary-text bg-action-primary hover:bg-action-primary-hover rounded-xl transition-all shadow-xs focus:outline-none focus-visible:ring-2 focus-visible:ring-action-primary"
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
                        key={`dashboard-cell-${slice.id}`}
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
          <div className="lg:col-span-6 space-y-2 max-h-[300px] overflow-y-auto pr-1">
            {chartData.slices.map((slice, index) => {
              const isHovered = activeIndex === index;

              return (
                <div
                  key={slice.id}
                  id={`dashboard-chart-legend-${slice.label}`}
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
                  className={`flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-action-primary ${
                    isHovered
                      ? 'bg-surface-elevated border-action-primary/50 shadow-sm translate-x-1'
                      : 'bg-background/70 border-border-theme hover:bg-surface-elevated'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className="w-3 h-3 rounded-full shrink-0 shadow-xs"
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
