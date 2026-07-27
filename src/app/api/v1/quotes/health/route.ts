import { providerBreakdown } from "@/db/schema/provider-breakdown";
// src/app/api/v1/quotes/health/route.ts
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { gte, sql } from "drizzle-orm";
import { NextResponse } from "next/server";

const HEALTH_WINDOW_MIN = 15;

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Nao autenticado" }, { status: 401 });
  }

  const since = new Date(Date.now() - HEALTH_WINDOW_MIN * 60 * 1000);

  const rows = await db
    .select({
      provider: providerBreakdown.provider,
      okCount: sql<number>`SUM(CASE WHEN ${providerBreakdown.status} = 'ok' THEN 1 ELSE 0 END)`,
      totalCount: sql<number>`COUNT(*)`,
      lastFetchedAt: sql<Date | null>`MAX(${providerBreakdown.fetchedAt})`,
    })
    .from(providerBreakdown)
    .where(gte(providerBreakdown.fetchedAt, since))
    .groupBy(providerBreakdown.provider);

  const providers: Record<
    string,
    { name: string; ok: boolean; lastChecked: string; successRate: number }
  > = {};

  for (const row of rows) {
    const total = Number(row.totalCount) || 0;
    const ok = Number(row.okCount) || 0;
    const successRate = total > 0 ? ok / total : 0;
    providers[row.provider] = {
      name: row.provider,
      ok: successRate > 0.5,
      lastChecked: (row.lastFetchedAt ?? new Date()).toISOString(),
      successRate,
    };
  }

  return NextResponse.json({ providers });
}
