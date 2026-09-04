import React from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import type { SerializedPayoffAnalysis } from '../domain/options.types';

interface OptionsPayoffChartProps {
  ticker: string;
  optionType: 'CALL' | 'PUT';
  direction: 'BUY' | 'SELL';
  payoff: SerializedPayoffAnalysis;
}

export function OptionsPayoffChart({
  ticker,
  optionType,
  direction,
  payoff,
}: OptionsPayoffChartProps) {
  const chartData = payoff.points.map((pt) => ({
    spot: pt.spotPriceFormatted,
    spotNum: Number(pt.spotPrice),
    pnl: Number(pt.netProfitLoss),
    pnlUnitary: Number(pt.netProfitLossUnitary),
  }));

  const strikeNum = Number(payoff.strikePrice);
  const breakevenNum = Number(payoff.breakevenPrice);

  return (
    <div
      id="options-payoff-chart"
      role="region"
      aria-label={`Curva de Payoff no Vencimento para ${ticker}`}
      className="rounded-xl border border-border-theme bg-surface p-5 sm:p-6 shadow-sm space-y-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-theme pb-4">
        <div>
          <h3 className="text-base font-semibold text-text-primary tracking-tight">
            Curva de Payoff no Vencimento
          </h3>
          <p className="text-xs text-text-secondary mt-0.5">
            Lucro e prejuízo estimado (R$) em múltiplos cenários de preço do ativo-objeto no vencimento.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`text-xs font-bold px-2.5 py-1 rounded-full ${
              direction === 'BUY'
                ? 'bg-action-primary/10 text-action-primary'
                : 'bg-purple-500/10 text-purple-600 dark:text-purple-400'
            }`}
          >
            {direction === 'BUY' ? 'Titular (Comprada)' : 'Lançador (Vendida)'}
          </span>
          <span
            className={`text-xs font-bold px-2.5 py-1 rounded-full ${
              optionType === 'CALL'
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400'
            }`}
          >
            {optionType}
          </span>
        </div>
      </div>

      {/* Cartões de Parâmetros Críticos do Payoff */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg bg-surface-hover/40 border border-border-theme/60 p-3">
          <span className="text-[11px] text-text-muted block">Strike</span>
          <strong className="text-sm text-text-primary block mt-0.5">
            R$ {payoff.strikePrice}
          </strong>
        </div>

        <div className="rounded-lg bg-surface-hover/40 border border-border-theme/60 p-3">
          <span className="text-[11px] text-text-muted block">Breakeven</span>
          <strong className="text-sm text-action-primary block mt-0.5">
            R$ {payoff.breakevenPrice}
          </strong>
        </div>

        <div className="rounded-lg bg-surface-hover/40 border border-border-theme/60 p-3">
          <span className="text-[11px] text-text-muted block">Ganho Máximo</span>
          <strong className="text-sm text-emerald-600 dark:text-emerald-400 block mt-0.5">
            {payoff.maximumProfit === 'ILIMITADO' ? 'Ilimitado' : `R$ ${payoff.maximumProfit}`}
          </strong>
        </div>

        <div className="rounded-lg bg-surface-hover/40 border border-border-theme/60 p-3">
          <span className="text-[11px] text-text-muted block">Prejuízo Máximo</span>
          <strong className="text-sm text-rose-600 dark:text-rose-400 block mt-0.5">
            {payoff.maximumLoss === 'ILIMITADO' ? 'Ilimitado' : `R$ ${payoff.maximumLoss}`}
          </strong>
        </div>
      </div>

      {/* Gráfico Recharts de Payoff */}
      <div className="h-[280px] w-full pt-2" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 15, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" opacity={0.2} vertical={false} />
            <XAxis
              dataKey="spot"
              tickLine={false}
              tick={{ fontSize: 11, fill: 'var(--text-muted, #71717a)' }}
              tickFormatter={(val) => `R$ ${val}`}
            />
            <YAxis
              tickLine={false}
              tick={{ fontSize: 11, fill: 'var(--text-muted, #71717a)' }}
              tickFormatter={(val) => `R$ ${val}`}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload || payload.length === 0) return null;
                const data = payload[0].payload as { spot: string; pnl: number; pnlUnitary: number };
                const isPositive = data.pnl >= 0;
                return (
                  <div className="rounded-lg border border-border-theme bg-surface/95 p-3 shadow-lg text-xs space-y-1">
                    <div className="font-semibold text-text-primary">
                      Ativo a R$ {data.spot}
                    </div>
                    <div className={isPositive ? 'text-emerald-600 font-bold' : 'text-rose-600 font-bold'}>
                      Resultado Total: {isPositive ? '+' : ''}R$ {data.pnl.toFixed(2)}
                    </div>
                    <div className="text-[11px] text-text-muted">
                      Por ação: {isPositive ? '+' : ''}R$ {data.pnlUnitary.toFixed(2)}
                    </div>
                  </div>
                );
              }}
            />
            <ReferenceLine y={0} stroke="#71717a" strokeWidth={1} strokeDasharray="4 4" />
            <ReferenceLine
              x={payoff.points.find((p) => Math.abs(Number(p.spotPrice) - strikeNum) < 0.5)?.spotPriceFormatted}
              stroke="#eab308"
              strokeWidth={1.5}
              strokeDasharray="3 3"
              label={{ value: 'Strike', position: 'insideTopLeft', fill: '#eab308', fontSize: 10 }}
            />
            <ReferenceLine
              x={payoff.points.find((p) => Math.abs(Number(p.spotPrice) - breakevenNum) < 0.5)?.spotPriceFormatted}
              stroke="#3b82f6"
              strokeWidth={1.5}
              strokeDasharray="3 3"
              label={{ value: 'Breakeven', position: 'insideTopRight', fill: '#3b82f6', fontSize: 10 }}
            />
            <Line
              type="monotone"
              dataKey="pnl"
              stroke="#2563eb"
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 5, fill: '#2563eb' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="text-[11px] text-text-muted flex items-center justify-between border-t border-border-theme/40 pt-2.5">
        <span>Linha horizontal pontilhada indica PnL R$ 0,00 (equilíbrio contábil).</span>
        <span>Curva baseada no vencimento sem considerar custos adicionais.</span>
      </div>
    </div>
  );
}
