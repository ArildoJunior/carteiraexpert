import { auth } from "@/lib/auth";
import { getDateRangeFromPeriod, getMonthlyReturnsForUser } from "@/lib/benchmarks/queries";
import type { Period } from "@/lib/benchmarks/types";
import { heatmapQuerySchema } from "@/lib/benchmarks/validations";
import { unstable_cache } from "next/cache";
import { NextResponse } from "next/server";

const REVALIDATE_SECONDS = 60 * 60 * 12;

async function computeHeatmap(userId: string, period: Period) {
  const { startDate, endDate } = getDateRangeFromPeriod(period);
  const returns = await getMonthlyReturnsForUser(userId, startDate, endDate);
  return { data: returns };
}

const cachedHeatmap = (userId: string, period: Period) =>
  unstable_cache(() => computeHeatmap(userId, period), ["dashboard-heatmap", userId, period], {
    tags: ["dashboard", "dashboard-heatmap"],
    revalidate: REVALIDATE_SECONDS,
  })();

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Nao autenticado" }, { status: 401 });
  }

  const url = new URL(req.url);
  const parsed = heatmapQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ message: "Parametros invalidos" }, { status: 400 });
  }

  const result = await cachedHeatmap(session.user.id, parsed.data.period);

  return NextResponse.json(result);
}
