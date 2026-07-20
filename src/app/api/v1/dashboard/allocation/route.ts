import { auth } from "@/lib/auth";
import {
  getLatestSnapshotForUser,
  getSnapshotForUser,
  getUserOpenPositions,
} from "@/lib/benchmarks/queries";
import { allocationQuerySchema } from "@/lib/benchmarks/validations";
import type { AssetClass } from "@/lib/db/enums";
import { getQuote } from "@/lib/quotes/manager";
import { unstable_cache } from "next/cache";
import { NextResponse } from "next/server";

const REVALIDATE_SECONDS = 60 * 60;

interface AllocationBucket {
  value: number;
  percent: number;
  count: number;
}

async function computeAllocation(userId: string, date?: string) {
  let targetDate: string | undefined = date;
  let degraded = false;
  if (!targetDate) {
    const latest = await getLatestSnapshotForUser(userId);
    if (!latest) return { data: null, reason: "no_snapshot_yet" as const };
    targetDate = latest.date;
  } else {
    const snap = await getSnapshotForUser(userId, targetDate);
    if (!snap) degraded = true;
  }

  const openPositions = await getUserOpenPositions(userId);
  const quotes = await Promise.all(
    openPositions.map(async (p) => {
      const r = await getQuote(p.asset.ticker, p.asset.assetClass);
      if (!r.ok) {
        degraded = true;
        return { position: p, price: null, stale: r.staleQuote ?? null };
      }
      return { position: p, price: Number(r.quote.price), stale: null };
    })
  );

  const byClass = new Map<AssetClass, AllocationBucket>();
  let totalValue = 0;
  for (const { position, price, stale } of quotes) {
    const value =
      price !== null
        ? Number(position.quantity) * price
        : stale
          ? Number(position.quantity) * Number(stale.price)
          : Number(position.averageCost) * Number(position.quantity);
    totalValue += value;
    const current = byClass.get(position.asset.assetClass) ?? {
      value: 0,
      percent: 0,
      count: 0,
    };
    current.value += value;
    current.count += 1;
    byClass.set(position.asset.assetClass, current);
  }

  for (const [key, bucket] of byClass) {
    bucket.percent = totalValue > 0 ? (bucket.value / totalValue) * 100 : 0;
    byClass.set(key, bucket);
  }

  return {
    data: {
      date: targetDate,
      totalValue,
      byClass: Object.fromEntries(byClass),
      degraded,
    },
  };
}

const cachedAllocation = (userId: string, date?: string) =>
  unstable_cache(
    () => computeAllocation(userId, date),
    ["dashboard-allocation", userId, date ?? "latest"],
    {
      tags: ["dashboard", "dashboard-allocation"],
      revalidate: REVALIDATE_SECONDS,
    }
  )();

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Nao autenticado" }, { status: 401 });
  }

  const url = new URL(req.url);
  const parsed = allocationQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ message: "Parametros invalidos" }, { status: 400 });
  }

  const result = await cachedAllocation(session.user.id, parsed.data.date);

  return NextResponse.json(result);
}
