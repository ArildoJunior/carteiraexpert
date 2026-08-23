'use client';

import { useState, useMemo, useEffect } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import type {
  SerializedPortfolioEvolutionSummary,
  EvolutionPeriod,
  EvolutionViewMode,
} from '../domain/portfolio-evolution.types';
import { getPortfolioEvolutionAction } from '../server/portfolio.actions';
import { useTheme } from '@/lib/theme';

interface PortfolioEvolutionChartProps {
  initialSummary: SerializedPortfolioEvolutionSummary;
  onPeriodChange?: (period: EvolutionPeriod) => void;
  isLoading?: boolean;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    name: string;
    value: number | string | null;
    color: string;
    payload: {
      dateKey: string;
      shortDate: string;
      formattedDate?: string;
      investedCost: number;
      quotedInvestedCost: number;
      marketValue: number | null;
      unrealizedPnL: number | null;
      formattedInvestedCost: string;
      formattedQuotedInvestedCost: string;
      formattedMarketValue: string | null;
      formattedUnrealizedPnL: string | null;
      formattedUnrealizedPnLPercent: string | null;
      formattedCoveragePercent: string;
      quotedPositionsCount: number;
      totalPositionsCount: number;
      stalePositionsCount: number;
      unquotedPositionsCount: number;
      hasStaleQuotes: boolean;
      isPartiallyValued: boolean;
      hasOnlyUnquotedPositions: boolean;
      hasOnlyStaleQuotes: boolean;
    };
  }>;
  label?: string;
}

function EvolutionCustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || !payload.length) return null;

  const data = payload[0].payload;
  const isPnLNeg = data.formattedUnrealizedPnL?.includes('-');

  return (
    <div
      id="evolution-chart-tooltip"
      className="bg-surface-elevated border border-border-theme p-3.5 rounded-xl shadow-2xl space-y-2 text-xs min-w-[220px] max-w-[280px] text-text-primary z-50"
    >
      <div className="flex items-center justify-between border-b border-border-theme pb-1.5 font-semibold text-text-primary gap-2">
        <span>{data.formattedDate || data.shortDate}</span>
        <span className="text-[10px] font-mono text-text-secondary">
          Cobertura: {data.formattedCoveragePercent}
        </span>
      </div>

      <div className="space-y-1.5 font-mono tabular-nums text-[11px]">
        <div className="flex justify-between items-center text-text-secondary">
          <span>Custo Total:</span>
          <span className="font-semibold text-text-primary">{data.formattedInvestedCost}</span>
        </div>

        {data.isPartiallyValued && (
          <div className="flex justify-between items-center text-text-secondary">
            <span>Custo Base Cotada:</span>
            <span className="font-semibold text-text-primary">{data.formattedQuotedInvestedCost}</span>
          </div>
        )}

        {data.formattedMarketValue &&
          !data.hasOnlyUnquotedPositions &&
          !data.hasOnlyStaleQuotes && (
            <div className="flex justify-between items-center">
              <span className="text-text-secondary">
                {data.isPartiallyValued ? 'Mercado (Parcial):' : 'Valor Mercado:'}
              </span>
              <span className="font-bold text-text-primary">{data.formattedMarketValue}</span>
            </div>
          )}

        {data.formattedUnrealizedPnL &&
          !data.hasOnlyUnquotedPositions &&
          !data.hasOnlyStaleQuotes && (
            <div className="flex justify-between items-center pt-1 border-t border-border-theme">
              <span className="text-text-secondary">Resultado (PnL):</span>
              <span
                className={`font-bold ${
                  isPnLNeg ? 'text-negative-text' : 'text-positive-text'
                }`}
              >
                {data.formattedUnrealizedPnL}{' '}
                {data.formattedUnrealizedPnLPercent && `(${data.formattedUnrealizedPnLPercent})`}
              </span>
            </div>
          )}
      </div>

      {/* Badges de Qualidade de Dados */}
      {data.hasOnlyStaleQuotes && (
        <div className="pt-1.5 border-t border-border-theme text-[10px] text-amber-600 dark:text-amber-400">
          ⚠️ Todas as cotações estão obsoletas (&gt;7d).
        </div>
      )}

      {data.hasOnlyUnquotedPositions && (
        <div className="pt-1.5 border-t border-border-theme text-[10px] text-text-secondary italic">
          ℹ️ Nenhuma cotação de mercado disponível.
        </div>
      )}

      {data.isPartiallyValued && (
        <div className="pt-1.5 border-t border-border-theme text-[10px] text-amber-600 dark:text-amber-300 flex items-center justify-between">
          <span>Posições valorizadas:</span>
          <span className="font-mono font-bold">
            {data.quotedPositionsCount}/{data.totalPositionsCount}
          </span>
        </div>
      )}
    </div>
  );
}

export function PortfolioEvolutionChart({
  initialSummary,
  onPeriodChange,
  isLoading: externalLoading = false,
}: PortfolioEvolutionChartProps) {
  const { tokens } = useTheme();
  const [summary, setSummary] = useState<SerializedPortfolioEvolutionSummary>(initialSummary);
  const [selectedPeriod, setSelectedPeriod] = useState<EvolutionPeriod>(
    initialSummary.period || 'YTD'
  );
  const [viewMode, setViewMode] = useState<EvolutionViewMode>('comparison');
  const [isMounted, setIsMounted] = useState(false);
  const [isFetching, setIsFetching] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    setSummary(initialSummary);
    if (initialSummary.period) {
      setSelectedPeriod(initialSummary.period);
    }
  }, [initialSummary]);

  const handlePeriodClick = async (p: EvolutionPeriod) => {
    if (p === selectedPeriod && summary.period === p) return;
    setSelectedPeriod(p);
    if (onPeriodChange) {
      onPeriodChange(p);
    }
    setIsFetching(true);
    try {
      const res = await getPortfolioEvolutionAction(summary.portfolioId, p);
      if (res.success && res.data) {
        setSummary(res.data);
      }
    } catch {
      // Preserva estado anterior se falhar
    } finally {
      setIsFetching(false);
    }
  };

  const isLoading = externalLoading || isFetching;

  const chartData = useMemo(() => {
    return summary.points.map((pt) => {
      const dateObj = new Date(pt.dateKey + 'T00:00:00Z');
      const shortDate = dateObj.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        timeZone: 'UTC',
      });
      const formattedDate = dateObj.toLocaleDateString('pt-BR', { timeZone: 'UTC' });

      return {
        dateKey: pt.dateKey,
        shortDate,
        formattedDate,
        investedCost: Number(pt.investedCost),
        quotedInvestedCost: Number(pt.quotedInvestedCost),
        marketValue: pt.marketValue !== null ? Number(pt.marketValue) : null,
        unrealizedPnL: pt.unrealizedPnL !== null ? Number(pt.unrealizedPnL) : null,
        formattedInvestedCost: pt.formattedInvestedCost,
        formattedQuotedInvestedCost: pt.formattedQuotedInvestedCost,
        formattedMarketValue: pt.formattedMarketValue,
        formattedUnrealizedPnL: pt.formattedUnrealizedPnL,
        formattedUnrealizedPnLPercent: pt.formattedUnrealizedPnLPercent,
        formattedCoveragePercent: pt.formattedCoveragePercent,
        quotedPositionsCount: pt.quotedPositionsCount,
        totalPositionsCount: pt.totalPositionsCount,
        stalePositionsCount: pt.stalePositionsCount,
        unquotedPositionsCount: pt.unquotedPositionsCount,
        hasStaleQuotes: pt.hasStaleQuotes,
        isPartiallyValued: pt.isPartiallyValued,
        hasOnlyUnquotedPositions: pt.hasOnlyUnquotedPositions,
        hasOnlyStaleQuotes: pt.hasOnlyStaleQuotes,
      };
    });
  }, [summary.points]);

  const isPeriodNegative = useMemo(() => {
    if (!summary.formattedCurrentUnrealizedPnL) return false;
    return summary.formattedCurrentUnrealizedPnL.includes('-');
  }, [summary.formattedCurrentUnrealizedPnL]);

  const marketColor = isPeriodNegative ? tokens.negativeChart : tokens.positiveChart;
  const pnlColor = isPeriodNegative ? tokens.negativeChart : tokens.positiveChart;
  const topGradientOpacity = tokens.chartGradientStartOpacity;
  const costColor = tokens.costColor;
  const quotedCostColor = tokens.quotedCostColor;

  const periods: { key: EvolutionPeriod; label: string }[] = [
    { key: '1M', label: '1 Mês' },
    { key: '3M', label: '3 Meses' },
    { key: '6M', label: '6 Meses' },
    { key: 'YTD', label: 'Ano Atual' },
    { key: '1Y', label: '1 Ano' },
    { key: 'ALL', label: 'Tudo' },
  ];

  const viewModes: { key: EvolutionViewMode; label: string }[] = [
    { key: 'comparison', label: 'Mercado vs Custo' },
    { key: 'market_value', label: 'Valor a Mercado' },
    { key: 'cost_basis', label: 'Custo de Aquisição' },
    { key: 'pnl', label: 'PnL (Resultado)' },
  ];

  if (!isMounted) {
    return (
      <div className="bg-surface border border-border-theme rounded-2xl p-6 shadow-sm space-y-4">
        <div className="h-6 w-48 bg-background rounded animate-pulse" />
        <div className="h-72 w-full bg-background rounded animate-pulse" />
      </div>
    );
  }

  if (!summary.points || summary.points.length === 0) {
    return (
      <div
        id="empty-evolution-chart-state"
        className="bg-surface border border-border-theme rounded-2xl p-8 text-center space-y-3"
      >
        <div className="w-12 h-12 rounded-2xl bg-action-primary/10 text-action-primary mx-auto flex items-center justify-center text-xl font-bold">
          📈
        </div>
        <h3 className="text-base font-bold text-text-primary">
          Evolução Patrimonial
        </h3>
        <p className="text-sm text-text-secondary max-w-md mx-auto">
          Esta carteira ainda não possui operações cadastradas. Registre compras ou transferências para visualizar a curva de evolução histórica.
        </p>
      </div>
    );
  }

  return (
    <div
      id="portfolio-evolution-card"
      className="bg-surface border border-border-theme rounded-2xl p-6 shadow-sm space-y-5"
    >
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-border-theme pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-bold text-text-primary tracking-tight">
              Evolução Patrimonial
            </h3>
            {summary.isCurrentlyPartiallyValued && (
              <span
                id="evolution-badge-partial-valuation"
                className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-300 border border-amber-500/30"
              >
                Valor a Mercado Parcial
              </span>
            )}
            {summary.hasOnlyMissingFx && (
              <span
                id="evolution-badge-missing-fx"
                className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-300 border border-amber-500/30"
              >
                Sem Taxa Cambial
              </span>
            )}
            {summary.hasOnlyStaleFx && !summary.hasOnlyMissingFx && (
              <span
                id="evolution-badge-stale-fx"
                className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-300 border border-amber-500/30"
              >
                Taxa Cambial Obsoleta
              </span>
            )}
            {summary.hasOnlyStaleQuotes && (
              <span
                id="evolution-badge-stale-quotes"
                className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-300 border border-amber-500/30"
              >
                Cotações Obsoletas
              </span>
            )}
            {summary.hasOnlyUnquotedPositions && !summary.hasOnlyMissingFx && (
              <span
                id="evolution-badge-unquoted"
                className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-background text-text-secondary border border-border-theme"
              >
                Sem Cotação (Modo Custo)
              </span>
            )}
          </div>
          <p className="text-xs text-text-secondary mt-1">
            Histórico diário da carteira reconstruído estritamente evento a evento.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4 bg-background border border-border-theme rounded-xl px-4 py-2 text-xs font-mono tabular-nums">
          <div>
            <span className="text-text-secondary block text-[10px]">Custo Atual</span>
            <span id="evolution-metric-cost" className="font-bold text-text-primary">
              {summary.formattedCurrentInvestedCost}
            </span>
          </div>

          {summary.formattedCurrentMarketValue && !summary.hasOnlyMissingFx && !summary.hasOnlyStaleFx && (
            <div className="border-l border-border-theme pl-4">
              <span className="text-text-secondary block text-[10px]">
                {summary.isCurrentlyPartiallyValued
                  ? 'Mercado (Parcial)'
                  : 'Mercado Atual'}
              </span>
              <span id="evolution-metric-market" className="font-bold text-positive-text">
                {summary.formattedCurrentMarketValue}
              </span>
            </div>
          )}

          {summary.formattedCurrentUnrealizedPnL && !summary.hasOnlyMissingFx && !summary.hasOnlyStaleFx && (
            <div className="border-l border-border-theme pl-4">
              <span className="text-text-secondary block text-[10px]">PnL Não Realizado</span>
              <span
                id="evolution-metric-pnl"
                className={`font-bold ${
                  isPeriodNegative
                    ? 'text-negative-text'
                    : 'text-positive-text'
                }`}
              >
                {summary.formattedCurrentUnrealizedPnL}{' '}
                {summary.formattedCurrentUnrealizedPnLPercent &&
                  `(${summary.formattedCurrentUnrealizedPnLPercent})`}
              </span>
            </div>
          )}
        </div>
      </div>

      {summary.hasOnlyMissingFx && (
        <div
          id="missing-fx-warning"
          className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2.5"
        >
          <span className="text-base leading-none">⚠️</span>
          <div>
            <p className="font-semibold">Taxa cambial ausente para a carteira</p>
            <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">
              Não foram encontradas taxas de câmbio para converter os ativos em moeda estrangeira para {summary.baseCurrency}. Os valores nominais não foram somados para evitar distorção patrimonial.
            </p>
          </div>
        </div>
      )}

      {summary.hasMissingFxInPeriod && !summary.hasOnlyMissingFx && (
        <div
          id="missing-fx-partial-warning"
          className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2.5"
        >
          <span className="text-base leading-none">⚠️</span>
          <div>
            <p className="font-semibold">Taxa cambial ausente para parte da carteira</p>
            <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">
              Algumas posições em moeda estrangeira não puderam ser convertidas para {summary.baseCurrency} por ausência de taxa cambial e foram excluídas do valor a mercado.
            </p>
          </div>
        </div>
      )}

      {summary.hasOnlyStaleQuotes && !summary.hasOnlyMissingFx && (
        <div
          id="stale-all-quotes-warning"
          className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2.5"
        >
          <span className="text-base leading-none">⚠️</span>
          <div>
            <p className="font-semibold">Cotações obsoletas na carteira</p>
            <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">
              Todas as cotações desta carteira possuem defasagem superior a 7 dias civis. A curva de valor a mercado não pôde ser calculada.
            </p>
          </div>
        </div>
      )}

      {summary.hasOnlyStaleFx && !summary.hasOnlyMissingFx && (
        <div
          id="stale-all-fx-warning"
          className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2.5"
        >
          <span className="text-base leading-none">⚠️</span>
          <div>
            <p className="font-semibold">Taxa cambial obsoleta na carteira</p>
            <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">
              Todas as taxas cambiais necessárias para conversão possuem defasagem superior a 7 dias civis. A curva de valor a mercado não pôde ser calculada.
            </p>
          </div>
        </div>
      )}

      {summary.hasStaleFxInPeriod && !summary.hasOnlyMissingFx && !summary.hasOnlyStaleFx && (
        <div
          id="stale-fx-warning"
          className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2.5"
        >
          <span className="text-base leading-none">⚠️</span>
          <div>
            <p className="font-semibold">Taxa cambial com defasagem no período</p>
            <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">
              Alguns pontos históricos contêm taxas cambiais com mais de 7 dias de defasagem. Posições com taxa cambial obsoleta foram excluídas do valor a mercado para preservar a fidelidade contábil.
            </p>
          </div>
        </div>
      )}

      {summary.hasStaleQuotesInPeriod && !summary.hasOnlyStaleQuotes && (
        <div
          id="stale-quotes-warning"
          className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2.5"
        >
          <span className="text-base leading-none">⚠️</span>
          <div>
            <p className="font-semibold">Cotações com defasagem no período</p>
            <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">
              Alguns pontos históricos contêm cotações com mais de 7 dias de defasagem. Posições com cotação obsoleta foram excluídas da curva de mercado e registradas na série de custo para preservar a fidelidade contábil.
            </p>
          </div>
        </div>
      )}

      {summary.isPeriodTruncated && (
        <div
          id="period-truncated-warning"
          className="bg-action-primary/10 border border-action-primary/30 rounded-xl p-3 text-xs text-text-primary flex items-start gap-2.5"
        >
          <span className="text-base leading-none">ℹ️</span>
          <div>
            <p className="font-semibold text-text-primary">Histórico limitado aos últimos 10 anos</p>
            <p className="text-[11px] text-text-secondary mt-0.5">
              A carteira possui operações anteriores a este intervalo (primeiro registro em {summary.truncatedHistoryStartDate ? new Date(summary.truncatedHistoryStartDate).toLocaleDateString('pt-BR') : 'data anterior'}). A série temporal foi iniciada no limite de 10 anos preservando o custo acumulado real.
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        <div
          className="inline-flex rounded-xl bg-background p-1 border border-border-theme"
          role="group"
          aria-label="Modo de Visualização"
        >
          {viewModes.map((mode) => (
            <button
              key={mode.key}
              type="button"
              id={`view-mode-btn-${mode.key}`}
              aria-pressed={viewMode === mode.key}
              onClick={() => setViewMode(mode.key)}
              className={`px-3 py-1.5 font-semibold rounded-lg transition-all ${
                viewMode === mode.key
                  ? 'bg-action-primary text-action-primary-text shadow-sm'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>

        <div
          className="inline-flex rounded-xl bg-background p-1 border border-border-theme self-start sm:self-auto"
          role="group"
          aria-label="Intervalo de Período"
        >
          {periods.map((p) => (
            <button
              key={p.key}
              type="button"
              id={`period-btn-${p.key}`}
              aria-pressed={selectedPeriod === p.key}
              disabled={isLoading}
              onClick={() => handlePeriodClick(p.key)}
              className={`px-2.5 py-1.5 font-semibold rounded-lg transition-all ${
                selectedPeriod === p.key
                  ? 'bg-action-primary text-action-primary-text shadow-sm'
                  : 'text-text-secondary hover:text-text-primary disabled:opacity-50'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div
        id="evolution-chart-container"
        className="w-full h-80 pt-2"
        style={{ minHeight: 320 }}
      >
        <ResponsiveContainer width="100%" height="100%">
          {viewMode === 'pnl' ? (
            <LineChart
              data={chartData}
              margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={tokens.border} opacity={0.7} />
              <XAxis
                dataKey="shortDate"
                stroke={tokens.textSecondary}
                tick={{ fontSize: 11, fill: tokens.textSecondary }}
                tickLine={{ stroke: tokens.border }}
              />
              <YAxis
                stroke={tokens.textSecondary}
                tick={{ fontSize: 11, fill: tokens.textSecondary }}
                tickLine={{ stroke: tokens.border }}
                tickFormatter={(val) =>
                  val >= 1000 || val <= -1000
                    ? `${(val / 1000).toFixed(0)}k`
                    : `${val}`
                }
              />
              <Tooltip content={<EvolutionCustomTooltip />} />
              <Line
                type="monotone"
                dataKey="unrealizedPnL"
                name="Resultado (PnL)"
                stroke={pnlColor}
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 5, fill: pnlColor }}
              />
            </LineChart>
          ) : viewMode === 'cost_basis' ? (
            <AreaChart
              data={chartData}
              margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
            >
              <defs>
                <linearGradient id="costGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={costColor} stopOpacity={topGradientOpacity} />
                  <stop offset="95%" stopColor={costColor} stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={tokens.border} opacity={0.7} />
              <XAxis
                dataKey="shortDate"
                stroke={tokens.textSecondary}
                tick={{ fontSize: 11, fill: tokens.textSecondary }}
                tickLine={{ stroke: tokens.border }}
              />
              <YAxis
                stroke={tokens.textSecondary}
                tick={{ fontSize: 11, fill: tokens.textSecondary }}
                tickLine={{ stroke: tokens.border }}
                tickFormatter={(val) =>
                  val >= 1000 ? `${(val / 1000).toFixed(0)}k` : `${val}`
                }
              />
              <Tooltip content={<EvolutionCustomTooltip />} />
              <Area
                type="monotone"
                dataKey="investedCost"
                name="Custo de Aquisição"
                stroke={costColor}
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#costGrad)"
              />
            </AreaChart>
          ) : viewMode === 'market_value' ? (
            <AreaChart
              data={chartData}
              margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
            >
              <defs>
                <linearGradient id="marketGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={marketColor} stopOpacity={topGradientOpacity} />
                  <stop offset="95%" stopColor={marketColor} stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={tokens.border} opacity={0.7} />
              <XAxis
                dataKey="shortDate"
                stroke={tokens.textSecondary}
                tick={{ fontSize: 11, fill: tokens.textSecondary }}
                tickLine={{ stroke: tokens.border }}
              />
              <YAxis
                stroke={tokens.textSecondary}
                tick={{ fontSize: 11, fill: tokens.textSecondary }}
                tickLine={{ stroke: tokens.border }}
                tickFormatter={(val) =>
                  val >= 1000 ? `${(val / 1000).toFixed(0)}k` : `${val}`
                }
              />
              <Tooltip content={<EvolutionCustomTooltip />} />
              <Area
                type="monotone"
                dataKey="marketValue"
                name={summary.isCurrentlyPartiallyValued ? 'Valor a Mercado Parcial' : 'Valor a Mercado'}
                stroke={marketColor}
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#marketGrad)"
              />
            </AreaChart>
          ) : (
            <AreaChart
              data={chartData}
              margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
            >
              <defs>
                <linearGradient id="compMarketGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={marketColor} stopOpacity={topGradientOpacity} />
                  <stop offset="95%" stopColor={marketColor} stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="compCostGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={costColor} stopOpacity={topGradientOpacity} />
                  <stop offset="95%" stopColor={costColor} stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="compQuotedCostGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={quotedCostColor} stopOpacity={topGradientOpacity} />
                  <stop offset="95%" stopColor={quotedCostColor} stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={tokens.border} opacity={0.7} />
              <XAxis
                dataKey="shortDate"
                stroke={tokens.textSecondary}
                tick={{ fontSize: 11, fill: tokens.textSecondary }}
                tickLine={{ stroke: tokens.border }}
              />
              <YAxis
                stroke={tokens.textSecondary}
                tick={{ fontSize: 11, fill: tokens.textSecondary }}
                tickLine={{ stroke: tokens.border }}
                tickFormatter={(val) =>
                  val >= 1000 ? `${(val / 1000).toFixed(0)}k` : `${val}`
                }
              />
              <Tooltip content={<EvolutionCustomTooltip />} />
              <Area
                type="monotone"
                dataKey="investedCost"
                name="Custo Total"
                stroke={costColor}
                strokeWidth={1.5}
                strokeDasharray="4 4"
                fillOpacity={0.05}
                fill="url(#compCostGrad)"
              />
              <Area
                type="monotone"
                dataKey="quotedInvestedCost"
                name="Custo Base Cotada"
                stroke={quotedCostColor}
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#compQuotedCostGrad)"
              />
              <Area
                type="monotone"
                dataKey="marketValue"
                name={summary.isCurrentlyPartiallyValued ? 'Valor a Mercado Parcial' : 'Valor a Mercado'}
                stroke={marketColor}
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#compMarketGrad)"
              />
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-border-theme text-[11px] text-text-secondary">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-full inline-block"
              style={{ backgroundColor: marketColor }}
            />
            {summary.isCurrentlyPartiallyValued ? 'Valor a Mercado Parcial' : 'Valor a Mercado'}
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-full inline-block"
              style={{ backgroundColor: quotedCostColor }}
            />
            Custo Base Cotada
          </span>
          <span className="flex items-center gap-1.5">
            <span
              className="w-2.5 h-2.5 rounded-full border border-dashed inline-block"
              style={{ borderColor: costColor }}
            />
            Custo Total
          </span>
        </div>

        <span id="evolution-period-interval">
          Período: {new Date(summary.startDate).toLocaleDateString('pt-BR')} até{' '}
          {new Date(summary.endDate).toLocaleDateString('pt-BR')}
        </span>
      </div>
    </div>
  );
}
