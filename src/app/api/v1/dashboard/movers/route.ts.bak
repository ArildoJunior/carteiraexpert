import { auth } from "@/lib/auth";
import { getUserOpenPositions } from "@/lib/benchmarks/queries";
import type { Period } from "@/lib/benchmarks/types";
import { moversQuerySchema } from "@/lib/benchmarks/validations";
import { getQuote } from "@/lib/quotes/manager";
import { unstable_cache } from "next/cache";
import { NextResponse } from "next/server";

const REVALIDATE_SECONDS = 60 * 60;

async function computeMovers(userId: string, _period: Period, limit: number) {
  const openPositions = await getUserOpenPositions(userId);
  const quotes = await Promise.all(
    openPositions.map(async (p) => {
      const r = await getQuote(p.asset.ticker, p.asset.assetClass);
      const price = r.ok ? Number(r.quote.price) : r.staleQuote ? Number(r.staleQuote.price) : null;
      const prev = Number(p.averageCost);
      const variation = price !== null && prev > 0 ? (price / prev - 1) * 100 : 0;
      const qty = Number(p.quantity);
      return {
        ticker: p.asset.ticker,
        name: p.asset.name,
        assetClass: p.asset.assetClass,
        variation,
        contribution: price !== null ? (price - prev) * qty : 0,
        price: price ?? prev,
      };
    })
  );

  const sorted = [...quotes].sort((a, b) => b.variation - a.variation);
  const winners = sorted.slice(0, limit);
  const losers = sorted.slice(-limit).reverse();
  return { data: { winners, losers } };
}

const cachedMovers = (userId: string, period: Period, limit: number) =>
  unstable_cache(
    () => computeMovers(userId, period, limit),
    ["dashboard-movers", userId, period, String(limit)],
    {
      tags: ["dashboard", "dashboard-movers"],
      revalidate: REVALIDATE_SECONDS,
    }
  )();

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ message: "Nao autenticado" }, { status: 401 });
  }

  const url = new URL(req.url);
  const parsed = moversQuerySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ message: "Parametros invalidos" }, { status: 400 });
  }

  const result = await cachedMovers(session.user.id, parsed.data.period, parsed.data.limit);

  return NextResponse.json(result);
}
