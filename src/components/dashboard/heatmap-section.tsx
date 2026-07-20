"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { MonthlyReturn } from "@/lib/api/dashboard";
import { formatSignedPercent } from "@/lib/dashboard/formatters";
import { cn } from "@/lib/utils";
import { useMemo } from "react";

interface HeatmapSectionProps {
  data: MonthlyReturn[];
}

const MONTHS = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function colorClass(value: number): string {
  if (!Number.isFinite(value) || value === 0) return "bg-muted text-muted-foreground";
  if (value > 0.05) return "bg-emerald-600 text-white";
  if (value > 0.02) return "bg-emerald-500 text-white";
  if (value > 0) return "bg-emerald-200 text-emerald-900";
  if (value > -0.02) return "bg-red-200 text-red-900";
  if (value > -0.05) return "bg-red-500 text-white";
  return "bg-red-600 text-white";
}

export function HeatmapSection({ data }: HeatmapSectionProps) {
  const grid = useMemo(() => {
    if (!data || data.length === 0)
      return { years: [] as number[], cells: new Map<string, number>() };
    const years = Array.from(new Set(data.map((d) => d.year))).sort();
    const cells = new Map<string, number>();
    for (const d of data) cells.set(`${d.year}-${d.month}`, d.return);
    return { years, cells };
  }, [data]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Retorno mensal</CardTitle>
      </CardHeader>
      <CardContent>
        {grid.years.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem dados para o periodo.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className="p-1 text-left font-normal text-muted-foreground">Ano</th>
                  {MONTHS.map((m) => (
                    <th key={m} className="p-1 text-center font-normal text-muted-foreground">
                      {m}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grid.years.map((y) => (
                  <tr key={y}>
                    <td className="p-1 font-medium tabular-nums">{y}</td>
                    {MONTHS.map((_, idx) => {
                      const month = idx + 1;
                      const value = grid.cells.get(`${y}-${month}`);
                      const hasData = value !== undefined;
                      return (
                        <td key={month} className="p-1">
                          <div
                            className={cn(
                              "rounded px-1 py-1 text-center tabular-nums text-[10px]",
                              hasData ? colorClass(value) : "bg-muted/30 text-muted-foreground/40"
                            )}
                          >
                            {hasData ? formatSignedPercent(value) : "—"}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
