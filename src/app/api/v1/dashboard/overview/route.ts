import { auth } from "@/lib/auth";
import {
  getBenchmarksInRange,
  getDateRangeFromPeriod,
  getLatestSnapshotForUser,
} from "@/lib/benchmarks/queries";
import { BENCHMARK_TYPES, type Period } from "@/lib/benchmarks/types";
import { overviewQuerySchema } from "@/lib/benchmarks/validations";
import { unstable_cache } from "next/cache";
import { NextResponse } from "next/server";

const REVALIDATE_SECONDS = 60 * 15;

async function computeOverview(userId: string, period: Period, benchmarks: string[]) {
  const latest = await getLatestSnapshotForUser(userId);
  if (!latest) {
    return { data: null, reason: "no_snapshot_yet" as const };
  }

  const { startDate, endDate } = getDateRangeFromPeriod(period);
  const series = await Promise.all(
    benchmarks.map(async (b) => ({
      benchmark: b,
      points: await getBenchmarksInRange(b, startDate, endDate),
    }))
  );

  return {
    data: {
      snapshotDate: latest.date,
      totalValue: Number(latest.totalValue),
      totalCost: Number(latest.totalCost),
      totalPnL: Number(latest.unrealizedPnl) + Number(latest.realizedPnl),
      dayChange: Number(latest.twrDaily),
      periodReturn: 0,
      twrCumulative: Number(latest.twrCumulative),
      positionsCount: Number(latest.positionsCount),
      benchmarks: series,
      degraded: false,
    },
  };
}

const cachedOverview = (userId: string, period: Period, benchmarks: string[]) =>
  unstable_cache(
    () => computeOverview(userId, period, benchmarks),
    ["dashboard-overview", userId, period, benchmarks.join(",")],
    {
      tags: ["dashboard", "dashboard-overview"],
      revalidate: REVALIDATE_SECONDS,
    }
  )();

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Nao autenticado" }, { status: 401 });
  }

  const url = new URL(req.url);
  const parsed = overviewQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ message: "Parametros invalidos" }, { status: 400 });
  }

  const result = await cachedOverview(
    session.user.id,
    parsed.data.period,
    parsed.data.benchmarks.length > 0 ? parsed.data.benchmarks : [...BENCHMARK_TYPES]
  );

  return NextResponse.json(result);
}
