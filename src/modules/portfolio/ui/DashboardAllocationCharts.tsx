'use client';

import { useState, useMemo, useEffect } from 'react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
} from 'recharts';
import type { SerializedPortfolioPositionsSummary } from '../domain/position.types';
import type { AllocationBasis } from '../domain/chart.types';
import {
  calculatePortfolioAllocation,
  CHART_PALETTE,
  formatChartMoney,
  formatChartPercent,
} from '../domain/chart-engine';
import { Decimal } from '@/lib/decimal';

interface DashboardAllocationChartsProps {
  portfolioSummaries: {
    portfolioId: string;
    portfolioName: string;
    baseCurrency: string;
    summary: SerializedPortfolioPositionsSummary;
  }[];
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
    <div className="bg-slate-900/95 border border-slate-700/80 rounded-xl p-3.5 shadow-2xl backdrop-blur-md text-xs space-y-1.5 min-w-[180px] z-50">
      <div className="flex items-center gap-2">
        <span
          className="w-2.5 h-2.5 rounded-full inline-block shrink-0"
          style={{ backgroundColor: data.color }}
        />
        <p className="font-bold text-white text-sm tracking-tight truncate">
          {data.label}
        </p>
      </div>

      {data.secondaryLabel && (
        <p className="text-slate-400 text-[11px] truncate">
          {data.secondaryLabel}
        </p>
      )}

      <div className="pt-1 border-t border-slate-800 flex items-center justify-between gap-4 font-mono">
        <span className="text-slate-400">Valor:</span>
        <span className="font-bold text-white">{data.formattedValue}</span>
      </div>

      <div className="flex items-center justify-between gap-4 font-mono">
        <span className="text-slate-400">Participação:</span>
        <span className="font-bold text-emerald-400">{data.formattedPercent}</span>
      </div>
    </div>
  );
}

export function DashboardAllocationCharts({
  portfolioSummaries,
}: DashboardAllocationChartsProps) {
  const [basis, setBasis] = useState<AllocationBasis>('market_value');
  const [groupingType, setGroupingType] = useState<DashboardGroupingType>('asset_type');
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

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
      className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl space-y-6"
    >
      {/* ─── Header do Gráfico ────────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-800/80">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="text-xl">📊</span>
            <h2 className="text-lg font-bold text-white tracking-tight">
              Alocação Consolidada
            </h2>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Composição global do patrimônio calculada por{' '}
            <span className="font-semibold text-slate-300">
              {isCostBasis ? 'Custo de Aquisição' : 'Valor a Mercado'}
            </span>
            .
          </p>
        </div>

        {/* Controles de Visualização */}
        <div className="flex flex-wrap items-center gap-2.5 self-start md:self-auto">
          {/* Seletor de Agrupamento */}
          <div className="flex bg-slate-950/80 border border-slate-800 p-1 rounded-xl text-xs font-semibold">
            <button
              id="dashboard-chart-tab-asset_type"
              type="button"
              aria-pressed={groupingType === 'asset_type'}
              onClick={() => setGroupingType('asset_type')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                groupingType === 'asset_type'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Por Classe
            </button>
            <button
              id="dashboard-chart-tab-portfolio"
              type="button"
              aria-pressed={groupingType === 'portfolio'}
              onClick={() => setGroupingType('portfolio')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                groupingType === 'portfolio'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Por Carteira
            </button>
            <button
              id="dashboard-chart-tab-currency"
              type="button"
              aria-pressed={groupingType === 'currency'}
              onClick={() => setGroupingType('currency')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                groupingType === 'currency'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Por Moeda
            </button>
          </div>

          {/* Seletor de Base (Mercado vs Custo) */}
          <div className="flex bg-slate-950/80 border border-slate-800 p-1 rounded-xl text-xs font-semibold">
            <button
              id="dashboard-chart-basis-market_value"
              type="button"
              aria-pressed={basis === 'market_value'}
              onClick={() => setBasis('market_value')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                basis === 'market_value'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Valor a Mercado
            </button>
            <button
              id="dashboard-chart-basis-cost_basis"
              type="button"
              aria-pressed={basis === 'cost_basis'}
              onClick={() => setBasis('cost_basis')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                basis === 'cost_basis'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
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
          className="bg-amber-950/30 border border-amber-800/50 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-amber-300"
        >
          <div className="flex items-center gap-2">
            <span>⚠️</span>
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
            onClick={() => setBasis('cost_basis')}
            className="text-amber-200 underline font-semibold hover:text-white shrink-0 self-start sm:self-auto"
          >
            Ver por Custo de Aquisição →
          </button>
        </div>
      )}

      {/* ─── Conteúdo do Gráfico / Estado Vazio ───────────────────────────── */}
      {basis === 'market_value' && chartData.hasOnlyUnquotedPositions ? (
        <div
          id="dashboard-chart-only-unquoted-state"
          className="py-12 px-4 text-center space-y-3 bg-slate-950/40 border border-dashed border-slate-800 rounded-2xl"
        >
          <div className="w-12 h-12 rounded-full bg-slate-800/80 flex items-center justify-center text-xl mx-auto">
            📉
          </div>
          <h3 className="text-sm font-bold text-white">
            Sem cotações de mercado disponíveis
          </h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            Nenhum ativo consolidado possui cotação cadastrada no banco interno para marcação a mercado.
          </p>
          <button
            id="dashboard-chart-switch-to-cost-btn"
            type="button"
            onClick={() => setBasis('cost_basis')}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-sky-600 hover:bg-sky-500 rounded-xl transition-all shadow-sm"
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
                    stroke="#0f172a"
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
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                {isCostBasis ? 'Custo Total' : 'Valor a Mercado'}
              </span>
              <span className="text-base sm:text-lg font-bold font-mono text-white tracking-tight">
                {chartData.formattedTotalValue}
              </span>
              <span className="text-[10px] text-slate-500 font-medium mt-0.5">
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
                  className={`flex items-center justify-between p-2.5 rounded-xl border transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-sky-500 ${
                    isHovered
                      ? 'bg-slate-800/90 border-slate-600 shadow-md translate-x-1'
                      : 'bg-slate-950/40 border-slate-800/60 hover:bg-slate-800/50'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span
                      className="w-3 h-3 rounded-full shrink-0 shadow-sm"
                      style={{ backgroundColor: slice.color }}
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white truncate">
                        {slice.label}
                      </p>
                      {slice.secondaryLabel && (
                        <p className="text-[11px] text-slate-400 truncate">
                          {slice.secondaryLabel}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="text-right shrink-0 pl-3 font-mono">
                    <p className="text-xs font-bold text-white">
                      {slice.formattedValue}
                    </p>
                    <p className="text-[11px] font-semibold text-emerald-400">
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
