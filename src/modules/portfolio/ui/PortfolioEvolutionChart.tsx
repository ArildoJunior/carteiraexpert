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
  EvolutionPeriod,
  EvolutionViewMode,
  SerializedPortfolioEvolutionSummary,
} from '../domain/portfolio-evolution.types';
import { getPortfolioEvolutionAction } from '../server/portfolio.actions';

interface PortfolioEvolutionChartProps {
  initialSummary: SerializedPortfolioEvolutionSummary;
  onPeriodChange?: (period: EvolutionPeriod) => void;
  isLoading?: boolean;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: {
    value: number;
    dataKey: string;
    payload: {
      dateKey: string;
      formattedDate: string;
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
  }[];
}

function EvolutionCustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null;

  const data = payload[0].payload;

  return (
    <div className="bg-slate-900/95 border border-slate-700/80 rounded-xl p-3.5 shadow-2xl backdrop-blur-md text-xs space-y-2 min-w-[220px] z-50">
      <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-1.5">
        <span className="font-bold text-white tracking-tight">
          {data.formattedDate}
        </span>
        <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
          Cobertura: {data.formattedCoveragePercent}
        </span>
      </div>

      <div className="space-y-1 font-mono">
        <div className="flex items-center justify-between gap-4">
          <span className="text-slate-400">Custo Total:</span>
          <span className="font-bold text-white">
            {data.formattedInvestedCost}
          </span>
        </div>

        {data.isPartiallyValued && (
          <div className="flex items-center justify-between gap-4">
            <span className="text-slate-400">Custo Base Cotada:</span>
            <span className="font-bold text-indigo-300">
              {data.formattedQuotedInvestedCost}
            </span>
          </div>
        )}

        {data.formattedMarketValue && !data.hasOnlyUnquotedPositions && !data.hasOnlyStaleQuotes && (
          <div className="flex items-center justify-between gap-4">
            <span className="text-slate-400">
              {data.isPartiallyValued ? 'Mercado (Parcial):' : 'Valor Mercado:'}
            </span>
            <span className="font-bold text-emerald-400">
              {data.formattedMarketValue}
            </span>
          </div>
        )}

        {data.formattedUnrealizedPnL && !data.hasOnlyUnquotedPositions && !data.hasOnlyStaleQuotes && (
          <div className="flex items-center justify-between gap-4">
            <span className="text-slate-400">Resultado (PnL):</span>
            <span
              className={`font-bold ${
                data.formattedUnrealizedPnL.includes('-')
                  ? 'text-rose-400'
                  : 'text-emerald-400'
              }`}
            >
              {data.formattedUnrealizedPnL}{' '}
              {data.formattedUnrealizedPnLPercent &&
                `(${data.formattedUnrealizedPnLPercent})`}
            </span>
          </div>
        )}
      </div>

      {data.hasOnlyStaleQuotes && (
        <div className="pt-1 border-t border-slate-800 text-[10px] text-amber-400">
          ⚠️ Todas as cotações estão obsoletas (&gt;7d).
        </div>
      )}

      {data.hasOnlyUnquotedPositions && (
        <div className="pt-1 border-t border-slate-800 text-[10px] text-slate-400">
          ℹ️ Nenhuma cotação de mercado disponível.
        </div>
      )}

      {data.isPartiallyValued && (
        <div className="pt-1 border-t border-slate-800 text-[10px] text-amber-400 flex items-center gap-1">
          <span>⚠️</span> {data.quotedPositionsCount}/{data.totalPositionsCount} posições valorizadas.
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
    setSelectedPeriod(initialSummary.period || 'YTD');
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

  // Prepara os dados numéricos exclusivamente para a camada do Recharts
  const chartData = useMemo(() => {
    return summary.points.map((p) => {
      const [year, month, day] = p.dateKey.split('-');
      const formattedDate = `${day}/${month}/${year}`;

      const numCost = Number.parseFloat(p.investedCost) || 0;
      const numQuotedCost = Number.parseFloat(p.quotedInvestedCost) || 0;
      const numMarket =
        p.marketValue !== null ? Number.parseFloat(p.marketValue) : null;
      const numPnL =
        p.unrealizedPnL !== null ? Number.parseFloat(p.unrealizedPnL) : null;

      return {
        dateKey: p.dateKey,
        formattedDate,
        shortDate: `${day}/${month}`,
        investedCost: numCost,
        quotedInvestedCost: numQuotedCost,
        marketValue: numMarket,
        unrealizedPnL: numPnL,
        formattedInvestedCost: p.formattedInvestedCost,
        formattedQuotedInvestedCost: p.formattedQuotedInvestedCost,
        formattedMarketValue: p.formattedMarketValue,
        formattedUnrealizedPnL: p.formattedUnrealizedPnL,
        formattedUnrealizedPnLPercent: p.formattedUnrealizedPnLPercent,
        formattedCoveragePercent: p.formattedCoveragePercent,
        quotedPositionsCount: p.quotedPositionsCount,
        totalPositionsCount: p.totalPositionsCount,
        stalePositionsCount: p.stalePositionsCount,
        unquotedPositionsCount: p.unquotedPositionsCount,
        hasStaleQuotes: p.hasStaleQuotes,
        isPartiallyValued: p.isPartiallyValued,
        hasOnlyUnquotedPositions: p.hasOnlyUnquotedPositions,
        hasOnlyStaleQuotes: p.hasOnlyStaleQuotes,
        hasOnlyMissingFx: p.hasOnlyMissingFx,
        hasStaleFx: p.hasStaleFx,
        currencyMismatchPositionsCount: p.currencyMismatchPositionsCount,
        fxMissingPositionsCount: p.fxMissingPositionsCount,
        fxStalePositionsCount: p.fxStalePositionsCount,
      };
    });
  }, [summary.points]);

  const periods: { key: EvolutionPeriod; label: string }[] = [
    { key: '1M', label: '1M' },
    { key: '3M', label: '3M' },
    { key: '6M', label: '6M' },
    { key: 'YTD', label: 'YTD' },
    { key: '1Y', label: '1 Ano' },
    {
      key: 'ALL',
      label: summary.isPeriodTruncated ? 'Tudo (10 Anos)' : 'Tudo',
    },
  ];

  const viewModes: { key: EvolutionViewMode; label: string }[] = [
    { key: 'comparison', label: 'Comparativo (Mercado vs Custo)' },
    { key: 'market_value', label: 'Valor a Mercado' },
    { key: 'cost_basis', label: 'Custo de Aquisição' },
    { key: 'pnl', label: 'Resultado (PnL)' },
  ];

  if (!isMounted) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
        <div className="h-6 w-48 bg-slate-800 rounded animate-pulse" />
        <div className="h-72 w-full bg-slate-800/50 rounded animate-pulse" />
      </div>
    );
  }

  if (summary.isEmptyPortfolio) {
    return (
      <div
        id="empty-evolution-chart-state"
        className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center space-y-3 shadow-xl"
      >
        <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center text-slate-500 text-xl font-bold mx-auto">
          📈
        </div>
        <h3 className="text-base font-bold text-white">
          Evolução Patrimonial
        </h3>
        <p className="text-sm text-slate-400 max-w-md mx-auto">
          Esta carteira ainda não possui operações cadastradas. Registre compras ou transferências para visualizar a curva de evolução histórica.
        </p>
      </div>
    );
  }

  return (
    <div
      id="portfolio-evolution-card"
      className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5"
    >
      {/* ─── Cabeçalho com Métricas Atuais e Controles ────────────────── */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-bold text-white tracking-tight">
              Evolução Patrimonial
            </h3>
            {summary.isCurrentlyPartiallyValued && (
              <span
                id="evolution-badge-partial-valuation"
                className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-950/80 text-amber-300 border border-amber-800/80"
              >
                Valor a Mercado Parcial
              </span>
            )}
            {summary.hasOnlyMissingFx && (
              <span
                id="evolution-badge-missing-fx"
                className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-950/80 text-amber-300 border border-amber-800/80"
              >
                Sem Taxa Cambial
              </span>
            )}
            {summary.hasOnlyStaleFx && !summary.hasOnlyMissingFx && (
              <span
                id="evolution-badge-stale-fx"
                className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-950/80 text-amber-300 border border-amber-800/80"
              >
                Taxa Cambial Obsoleta
              </span>
            )}
            {summary.hasOnlyStaleQuotes && (
              <span
                id="evolution-badge-stale-quotes"
                className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-950/80 text-amber-300 border border-amber-800/80"
              >
                Cotações Obsoletas
              </span>
            )}
            {summary.hasOnlyUnquotedPositions && !summary.hasOnlyMissingFx && (
              <span
                id="evolution-badge-unquoted"
                className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700"
              >
                Sem Cotação (Modo Custo)
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Histórico diário da carteira reconstruído estritamente evento a evento.
          </p>
        </div>

        {/* Resumo Atual Rápido */}
        <div className="flex flex-wrap items-center gap-4 bg-slate-950/60 border border-slate-800/80 rounded-xl px-4 py-2 text-xs font-mono">
          <div>
            <span className="text-slate-400 block text-[10px]">Custo Atual</span>
            <span id="evolution-metric-cost" className="font-bold text-white">
              {summary.formattedCurrentInvestedCost}
            </span>
          </div>

          {summary.formattedCurrentMarketValue && !summary.hasOnlyMissingFx && !summary.hasOnlyStaleFx && (
            <div className="border-l border-slate-800 pl-4">
              <span className="text-slate-400 block text-[10px]">
                {summary.isCurrentlyPartiallyValued
                  ? 'Mercado (Parcial)'
                  : 'Mercado Atual'}
              </span>
              <span id="evolution-metric-market" className="font-bold text-emerald-400">
                {summary.formattedCurrentMarketValue}
              </span>
            </div>
          )}

          {summary.formattedCurrentUnrealizedPnL && !summary.hasOnlyMissingFx && !summary.hasOnlyStaleFx && (
            <div className="border-l border-slate-800 pl-4">
              <span className="text-slate-400 block text-[10px]">PnL Não Realizado</span>
              <span
                id="evolution-metric-pnl"
                className={`font-bold ${
                  summary.formattedCurrentUnrealizedPnL.includes('-')
                    ? 'text-rose-400'
                    : 'text-emerald-400'
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

      {/* ─── Alertas de Defasagem, Cobertura ou Truncamento ────────────── */}
      {summary.hasOnlyMissingFx && (
        <div
          id="missing-fx-warning"
          className="bg-amber-950/40 border border-amber-800/60 rounded-xl p-3 text-xs text-amber-300 flex items-start gap-2.5"
        >
          <span className="text-base leading-none">⚠️</span>
          <div>
            <p className="font-semibold">Taxa cambial ausente para a carteira</p>
            <p className="text-[11px] text-amber-400/90 mt-0.5">
              Não foram encontradas taxas de câmbio para converter os ativos em moeda estrangeira para {summary.baseCurrency}. Os valores nominais não foram somados para evitar distorção patrimonial.
            </p>
          </div>
        </div>
      )}

      {summary.hasMissingFxInPeriod && !summary.hasOnlyMissingFx && (
        <div
          id="missing-fx-partial-warning"
          className="bg-amber-950/40 border border-amber-800/60 rounded-xl p-3 text-xs text-amber-300 flex items-start gap-2.5"
        >
          <span className="text-base leading-none">⚠️</span>
          <div>
            <p className="font-semibold">Taxa cambial ausente para parte da carteira</p>
            <p className="text-[11px] text-amber-400/90 mt-0.5">
              Algumas posições em moeda estrangeira não puderam ser convertidas para {summary.baseCurrency} por ausência de taxa cambial e foram excluídas do valor a mercado.
            </p>
          </div>
        </div>
      )}

      {summary.hasOnlyStaleQuotes && !summary.hasOnlyMissingFx && (
        <div
          id="stale-all-quotes-warning"
          className="bg-amber-950/40 border border-amber-800/60 rounded-xl p-3 text-xs text-amber-300 flex items-start gap-2.5"
        >
          <span className="text-base leading-none">⚠️</span>
          <div>
            <p className="font-semibold">Cotações obsoletas na carteira</p>
            <p className="text-[11px] text-amber-400/90 mt-0.5">
              Todas as cotações desta carteira possuem defasagem superior a 7 dias civis. A curva de valor a mercado não pôde ser calculada.
            </p>
          </div>
        </div>
      )}

      {summary.hasOnlyStaleFx && !summary.hasOnlyMissingFx && (
        <div
          id="stale-all-fx-warning"
          className="bg-amber-950/40 border border-amber-800/60 rounded-xl p-3 text-xs text-amber-300 flex items-start gap-2.5"
        >
          <span className="text-base leading-none">⚠️</span>
          <div>
            <p className="font-semibold">Taxa cambial obsoleta na carteira</p>
            <p className="text-[11px] text-amber-400/90 mt-0.5">
              Todas as taxas cambiais necessárias para conversão possuem defasagem superior a 7 dias civis. A curva de valor a mercado não pôde ser calculada.
            </p>
          </div>
        </div>
      )}

      {summary.hasStaleFxInPeriod && !summary.hasOnlyMissingFx && !summary.hasOnlyStaleFx && (
        <div
          id="stale-fx-warning"
          className="bg-amber-950/40 border border-amber-800/60 rounded-xl p-3 text-xs text-amber-300 flex items-start gap-2.5"
        >
          <span className="text-base leading-none">⚠️</span>
          <div>
            <p className="font-semibold">Taxa cambial com defasagem no período</p>
            <p className="text-[11px] text-amber-400/90 mt-0.5">
              Alguns pontos históricos contêm taxas cambiais com mais de 7 dias de defasagem. Posições com taxa cambial obsoleta foram excluídas do valor a mercado para preservar a fidelidade contábil.
            </p>
          </div>
        </div>
      )}

      {summary.hasStaleQuotesInPeriod && !summary.hasOnlyStaleQuotes && (
        <div
          id="stale-quotes-warning"
          className="bg-amber-950/40 border border-amber-800/60 rounded-xl p-3 text-xs text-amber-300 flex items-start gap-2.5"
        >
          <span className="text-base leading-none">⚠️</span>
          <div>
            <p className="font-semibold">Cotações com defasagem no período</p>
            <p className="text-[11px] text-amber-400/90 mt-0.5">
              Alguns pontos históricos contêm cotações com mais de 7 dias de defasagem. Posições com cotação obsoleta foram excluídas da curva de mercado e registradas na série de custo para preservar a fidelidade contábil.
            </p>
          </div>
        </div>
      )}

      {summary.isPeriodTruncated && (
        <div
          id="period-truncated-warning"
          className="bg-sky-950/40 border border-sky-800/60 rounded-xl p-3 text-xs text-sky-300 flex items-start gap-2.5"
        >
          <span className="text-base leading-none">ℹ️</span>
          <div>
            <p className="font-semibold">Histórico limitado aos últimos 10 anos</p>
            <p className="text-[11px] text-sky-400/90 mt-0.5">
              A carteira possui operações anteriores a este intervalo (primeiro registro em {summary.truncatedHistoryStartDate ? new Date(summary.truncatedHistoryStartDate).toLocaleDateString('pt-BR') : 'data anterior'}). A série temporal foi iniciada no limite de 10 anos preservando o custo acumulado real.
            </p>
          </div>
        </div>
      )}

      {/* ─── Barra de Filtros de Período e Modo de Visão ─────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
        {/* Modos de Visão */}
        <div
          className="inline-flex rounded-xl bg-slate-950/80 p-1 border border-slate-800"
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
              className={`px-3 py-1.5 font-medium rounded-lg transition-all ${
                viewMode === mode.key
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {mode.label}
            </button>
          ))}
        </div>

        {/* Filtros de Período */}
        <div
          className="inline-flex rounded-xl bg-slate-950/80 p-1 border border-slate-800 self-start sm:self-auto"
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
              className={`px-2.5 py-1.5 font-medium rounded-lg transition-all ${
                selectedPeriod === p.key
                  ? 'bg-slate-700 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white disabled:opacity-50'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* ─── Área do Gráfico Interativo Recharts ─────────────────────── */}
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
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
              <XAxis
                dataKey="shortDate"
                stroke="#64748b"
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                tickLine={{ stroke: '#334155' }}
              />
              <YAxis
                stroke="#64748b"
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                tickLine={{ stroke: '#334155' }}
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
                stroke="#38bdf8"
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 5, fill: '#38bdf8' }}
              />
            </LineChart>
          ) : viewMode === 'cost_basis' ? (
            <AreaChart
              data={chartData}
              margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
            >
              <defs>
                <linearGradient id="costGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
              <XAxis
                dataKey="shortDate"
                stroke="#64748b"
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                tickLine={{ stroke: '#334155' }}
              />
              <YAxis
                stroke="#64748b"
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                tickLine={{ stroke: '#334155' }}
                tickFormatter={(val) =>
                  val >= 1000 ? `${(val / 1000).toFixed(0)}k` : `${val}`
                }
              />
              <Tooltip content={<EvolutionCustomTooltip />} />
              <Area
                type="monotone"
                dataKey="investedCost"
                name="Custo de Aquisição"
                stroke="#6366f1"
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
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
              <XAxis
                dataKey="shortDate"
                stroke="#64748b"
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                tickLine={{ stroke: '#334155' }}
              />
              <YAxis
                stroke="#64748b"
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                tickLine={{ stroke: '#334155' }}
                tickFormatter={(val) =>
                  val >= 1000 ? `${(val / 1000).toFixed(0)}k` : `${val}`
                }
              />
              <Tooltip content={<EvolutionCustomTooltip />} />
              <Area
                type="monotone"
                dataKey="marketValue"
                name={summary.isCurrentlyPartiallyValued ? 'Valor a Mercado Parcial' : 'Valor a Mercado'}
                stroke="#10b981"
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#marketGrad)"
              />
            </AreaChart>
          ) : (
            /* Modo Comparativo (Mercado vs Custo) */
            <AreaChart
              data={chartData}
              margin={{ top: 10, right: 10, left: 10, bottom: 0 }}
            >
              <defs>
                <linearGradient id="compMarketGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="compCostGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="compQuotedCostGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#818cf8" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#818cf8" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} />
              <XAxis
                dataKey="shortDate"
                stroke="#64748b"
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                tickLine={{ stroke: '#334155' }}
              />
              <YAxis
                stroke="#64748b"
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                tickLine={{ stroke: '#334155' }}
                tickFormatter={(val) =>
                  val >= 1000 ? `${(val / 1000).toFixed(0)}k` : `${val}`
                }
              />
              <Tooltip content={<EvolutionCustomTooltip />} />
              {/* Custo Total da Carteira (linha pontilhada para contexto) */}
              <Area
                type="monotone"
                dataKey="investedCost"
                name="Custo Total"
                stroke="#6366f1"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                fillOpacity={0.1}
                fill="url(#compCostGrad)"
              />
              {/* Custo da Base Cotada (base direta comparável com marketValue) */}
              <Area
                type="monotone"
                dataKey="quotedInvestedCost"
                name="Custo Base Cotada"
                stroke="#818cf8"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#compQuotedCostGrad)"
              />
              {/* Valor a Mercado */}
              <Area
                type="monotone"
                dataKey="marketValue"
                name={summary.isCurrentlyPartiallyValued ? 'Valor a Mercado Parcial' : 'Valor a Mercado'}
                stroke="#10b981"
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#compMarketGrad)"
              />
            </AreaChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* ─── Legenda Inferior Explicativa ────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-slate-800/80 text-[11px] text-slate-400">
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
            {summary.isCurrentlyPartiallyValued ? 'Valor a Mercado Parcial' : 'Valor a Mercado'}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-400 inline-block" />
            Custo Base Cotada
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full border border-dashed border-indigo-500 inline-block" />
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
