import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { OverviewData } from "@/lib/api/dashboard";
import {
  formatCurrency,
  formatDate,
  formatNumber,
  formatSignedPercent,
} from "@/lib/dashboard/formatters";

interface OverviewSectionProps {
  data: OverviewData;
}

export function OverviewSection({ data }: OverviewSectionProps) {
  const items = [
    { label: "Patrimonio", value: formatCurrency(data.totalValue) },
    { label: "Custo total", value: formatCurrency(data.totalCost) },
    { label: "P&L nao realizado", value: formatCurrency(data.totalPnL) },
    { label: "Variacao do dia", value: formatSignedPercent(data.dayChange) },
    { label: "TWR acumulado", value: formatSignedPercent(data.twrCumulative) },
    { label: "Posicoes abertas", value: formatNumber(data.positionsCount) },
  ];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Visao geral</CardTitle>
          <span className="text-xs text-muted-foreground">
            Snapshot: {formatDate(data.snapshotDate)}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
          {items.map((it) => (
            <div key={it.label} className="space-y-1">
              <dt className="text-xs text-muted-foreground">{it.label}</dt>
              <dd className="text-lg font-semibold tabular-nums">{it.value}</dd>
            </div>
          ))}
        </dl>
        {data.degraded && (
          <p className="mt-3 text-xs text-amber-600">Algumas cotacoes estao desatualizadas.</p>
        )}
      </CardContent>
    </Card>
  );
}
