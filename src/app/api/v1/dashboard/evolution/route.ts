import { auth } from "@/lib/auth";
import { fromIsoDate } from "@/lib/benchmarks/period";
import {
  getBenchmarksInRange,
  getDateRangeFromPeriod,
  getSnapshotsInRange,
} from "@/lib/benchmarks/queries";
import { alignSeries } from "@/lib/benchmarks/series";
import type { Period } from "@/lib/benchmarks/types";
import { evolutionQuerySchema } from "@/lib/benchmarks/validations";
import { unstable_cache } from "next/cache";
import { NextResponse } from "next/server";

const REVALIDATE_SECONDS = 60 * 60 * 6;

async function computeEvolution(userId: string, period: Period, benchmark: string) {
  const { startDate, endDate } = getDateRangeFromPeriod(period);
  const [snapshots, benchPoints] = await Promise.all([
    getSnapshotsInRange(userId, startDate, endDate),
    getBenchmarksInRange(benchmark, startDate, endDate),
  ]);

  const aligned = alignSeries(
    snapshots.map((s) => ({
      date: s.date,
      totalValue: Number(s.totalValue),
      totalCost: Number(s.totalCost),
      twrDaily: Number(s.twrDaily),
      twrCumulative: Number(s.twrCumulative),
    })),
    benchPoints.map((b) => ({ date: b.date, value: Number(b.value) })),
    fromIsoDate(startDate),
    fromIsoDate(endDate)
  );

  return { data: aligned };
}

const cachedEvolution = (userId: string, period: Period, benchmark: string) =>
  unstable_cache(
    () => computeEvolution(userId, period, benchmark),
    ["dashboard-evolution", userId, period, benchmark],
    {
      tags: ["dashboard", "dashboard-evolution"],
      revalidate: REVALIDATE_SECONDS,
    }
  )();

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Nao autenticado" }, { status: 401 });
  }

  const url = new URL(req.url);
  const parsed = evolutionQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ message: "Parametros invalidos" }, { status: 400 });
  }

  const result = await cachedEvolution(session.user.id, parsed.data.period, parsed.data.benchmark);

  return NextResponse.json(result);
}
