"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { AllocationData } from "@/lib/api/dashboard";
import { formatCurrency, formatPercent } from "@/lib/dashboard/formatters";
import { useMemo } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

interface AllocationSectionProps {
  data: AllocationData;
}

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

const CLASS_LABELS: Record<string, string> = {
  stock: "Acoes",
  reit: "FIIs",
  fixed_income: "Renda Fixa",
  crypto: "Cripto",
  etf: "ETFs",
  bdr: "BDRs",
  fund: "Fundos",
  treasury: "Tesouro",
  commodity: "Commodities",
  other: "Outros",
  private: "Privado",
};

interface AllocationEntry {
  key: string;
  name: string;
  value: number;
  percent: number;
  count: number;
  color: string;
}

export function AllocationSection({ data }: AllocationSectionProps) {
  const entries = useMemo<AllocationEntry[]>(() => {
    const keys = Object.keys(data.byClass ?? {});
    const out: AllocationEntry[] = [];
    for (let idx = 0; idx < keys.length; idx++) {
      const key = keys[idx];
      if (key === undefined) continue;
      const val = data.byClass[key];
      if (!val) continue;
      const picked = COLORS[idx % COLORS.length];
      const color = picked ?? COLORS[0];
      if (color === undefined) continue;
      out.push({
        key,
        name: CLASS_LABELS[key] ?? key,
        value: val.value,
        percent: val.percent,
        count: val.count,
        color,
      });
    }
    return out;
  }, [data]);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Alocacao por classe</CardTitle>
          <span className="text-xs text-muted-foreground">{formatCurrency(data.totalValue)}</span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="h-[280px] w-full">
            <ResponsiveContainer>
              <PieChart>
                <Tooltip
                  formatter={
                    ((
                      value: number | string,
                      _name: string,
                      item: { payload?: AllocationEntry } | undefined
                    ) => {
                      const entry = item?.payload;
                      return `${formatCurrency(Number(value))} (${formatPercent((entry?.percent ?? 0) / 100)})`;
                    }) as never
                  }
                />
                <Pie
                  data={entries}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={50}
                  outerRadius={90}
                  strokeWidth={2}
                >
                  {entries.map((e) => (
                    <Cell key={e.key} fill={e.color} />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="space-y-2">
            {entries.map((e) => (
              <div key={e.key} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span
                    className="inline-block h-3 w-3 rounded-sm"
                    style={{ backgroundColor: e.color }}
                  />
                  <span>{e.name}</span>
                </div>
                <div className="tabular-nums text-muted-foreground">
                  {formatPercent(e.percent / 100)} ({e.count})
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
