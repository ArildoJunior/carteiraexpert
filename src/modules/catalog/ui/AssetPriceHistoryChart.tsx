'use client';

import { useState, useTransition } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import type { PublicQuoteHistoryPoint } from '../domain/catalog.types';
import type { CatalogHistoryPeriod } from '../domain/catalog.schema';

interface AssetPriceHistoryChartProps {
  assetId: string;
  initialHistory: PublicQuoteHistoryPoint[];
  currency?: string;
  onPeriodChange?: (period: CatalogHistoryPeriod) => Promise<PublicQuoteHistoryPoint[]>;
}

export function AssetPriceHistoryChart({
  assetId,
  initialHistory,
  currency = 'BRL',
  onPeriodChange,
}: AssetPriceHistoryChartProps) {
  const [selectedPeriod, setSelectedPeriod] = useState<CatalogHistoryPeriod>('1M');
  const [history, setHistory] = useState<PublicQuoteHistoryPoint[]>(initialHistory);
  const [isPending, startTransition] = useTransition();

  const periods: CatalogHistoryPeriod[] = ['1M', '3M', '6M', '1Y', 'ALL'];

  async function handleSelectPeriod(p: CatalogHistoryPeriod) {
    setSelectedPeriod(p);
    if (onPeriodChange) {
      startTransition(async () => {
        try {
          const data = await onPeriodChange(p);
          setHistory(data);
        } catch {
          // Mantém o histórico anterior em caso de erro
        }
      });
    }
  }

  const chartData = history.map((item) => ({
    date: item.date,
    price: Number(item.price),
    rawQuoteDate: item.quoteDate,
  }));

  const hasData = chartData.length > 0;
  const isPositive =
    chartData.length >= 2 &&
    chartData[chartData.length - 1].price >= chartData[0].price;

  const strokeColor = isPositive ? '#10b981' : '#f43f5e';
  const fillColor = isPositive ? 'rgba(16, 185, 129, 0.12)' : 'rgba(244, 63, 94, 0.12)';

  return (
    <div className="rounded-xl border border-border-theme bg-surface p-5 shadow-xs">
      {/* Header do Gráfico */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <h3 className="text-sm font-semibold text-text-primary">
            Evolução de Preço
          </h3>
          <p className="text-xs text-text-muted mt-0.5">
            Histórico diário oficial de negociação ({currency})
          </p>
        </div>

        {/* Seletor de Período */}
        <div className="flex items-center gap-1 bg-surface-elevated p-1 rounded-lg border border-border-theme self-start sm:self-auto">
          {periods.map((p) => (
            <button
              key={p}
              id={`period-btn-${p}`}
              type="button"
              onClick={() => handleSelectPeriod(p)}
              disabled={isPending}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                selectedPeriod === p
                  ? 'bg-action-primary text-action-primary-text shadow-xs'
                  : 'text-text-secondary hover:text-text-primary hover:bg-surface'
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Conteúdo do Gráfico */}
      <div className="h-[280px] w-full">
        {!hasData ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-text-muted">
            <p className="text-sm font-medium">Histórico insuficiente para exibição gráfica</p>
            <p className="text-xs mt-1 text-text-muted">
              Novas cotações serão inseridas conforme os pregões forem concluídos.
            </p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chartData}
              margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
            >
              <defs>
                <linearGradient id={`gradient-${assetId}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={strokeColor} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={strokeColor} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="var(--color-border-theme, #e2e8f0)"
                opacity={0.5}
              />
              <XAxis
                dataKey="date"
                stroke="var(--color-text-muted, #94a3b8)"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                minTickGap={25}
              />
              <YAxis
                stroke="var(--color-text-muted, #94a3b8)"
                fontSize={11}
                tickLine={false}
                axisLine={false}
                domain={['auto', 'auto']}
                tickFormatter={(val) =>
                  currency === 'BRL'
                    ? `R$ ${val.toFixed(2)}`
                    : `$ ${val.toFixed(2)}`
                }
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length) {
                    const data = payload[0].payload;
                    return (
                      <div className="rounded-lg bg-surface border border-border-theme p-2.5 shadow-md text-xs">
                        <div className="font-semibold text-text-primary">
                          {currency === 'BRL' ? 'R$ ' : '$ '}
                          {Number(data.price).toLocaleString('pt-BR', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </div>
                        <div className="text-[11px] text-text-muted mt-0.5">
                          Pregão: {data.date}
                        </div>
                      </div>
                    );
                  }
                  return null;
                }}
              />
              <Area
                type="monotone"
                dataKey="price"
                stroke={strokeColor}
                strokeWidth={2}
                fillOpacity={1}
                fill={`url(#gradient-${assetId})`}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
