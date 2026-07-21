import { AllocationSection } from "@/components/dashboard/allocation-section";
import { EmptyCard } from "@/components/dashboard/empty-card";
import { EvolutionSection } from "@/components/dashboard/evolution-section";
import { HeatmapSection } from "@/components/dashboard/heatmap-section";
import { MoversSection } from "@/components/dashboard/movers-section";
import { OverviewSection } from "@/components/dashboard/overview-section";
import { PeriodFilter } from "@/components/dashboard/period-filter";
import {
  type Benchmark,
  type Period,
  fetchAllocation,
  fetchEvolution,
  fetchHeatmap,
  fetchMovers,
  fetchOverview,
} from "@/lib/api/dashboard";
import { auth } from "@/lib/auth";
import { BENCHMARKS } from "@/lib/dashboard/formatters";
import { redirect } from "next/navigation";

interface DashboardPageProps {
  searchParams: Promise<{ period?: string; benchmark?: string }>;
}

function parsePeriod(v: string | undefined, fallback: Period = "1Y"): Period {
  const valid: Period[] = ["1M", "3M", "6M", "1Y", "2Y", "5Y", "MAX"];
  if (v && (valid as string[]).includes(v)) return v as Period;
  return fallback;
}

function parseBenchmark(v: string | undefined, fallback: Benchmark = "IBOV"): Benchmark {
  const valid: Benchmark[] = ["IBOV", "IFIX", "CDI"];
  if (v && (valid as string[]).includes(v)) return v as Benchmark;
  return fallback;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const params = await searchParams;
  const period = parsePeriod(params.period);
  const benchmark = parseBenchmark(params.benchmark);
  const benchmarkLabel = BENCHMARKS.find((b) => b.value === benchmark)?.label ?? benchmark;

  const [overview, evolution, allocation, movers, heatmap] = await Promise.all([
    fetchOverview(period, [benchmark]),
    fetchEvolution(period, benchmark),
    fetchAllocation(),
    fetchMovers(period, 5),
    fetchHeatmap(period),
  ]);

  return (
    <div className="space-y-6 p-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <PeriodFilter currentPeriod={period} currentBenchmark={benchmark} />
      </header>

      {overview.data ? (
        <OverviewSection data={overview.data} />
      ) : (
        <EmptyCard
          title="Visao geral"
          message="Nenhum snapshot ainda. Importe transacoes para ver seus indicadores."
        />
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {evolution.data && evolution.data.length > 0 ? (
          <EvolutionSection data={evolution.data} benchmarkLabel={benchmarkLabel} />
        ) : (
          <EmptyCard title="Evolucao" message="Sem dados de evolucao no periodo." />
        )}

        {allocation.data ? (
          <AllocationSection data={allocation.data} />
        ) : (
          <EmptyCard title="Alocacao" message="Sem dados de alocacao." />
        )}
      </div>

      {movers.data && (movers.data.winners.length > 0 || movers.data.losers.length > 0) ? (
        <MoversSection winners={movers.data.winners} losers={movers.data.losers} />
      ) : (
        <EmptyCard title="Maiores altas e baixas" message="Nenhuma movimentacao no periodo." />
      )}

      {heatmap.data && heatmap.data.length > 0 ? (
        <HeatmapSection data={heatmap.data} />
      ) : (
        <EmptyCard title="Retorno mensal" message="Sem dados de retorno mensal." />
      )}
    </div>
  );
}
