import { assets, benchmarksHistory, portfolioSnapshots, positions } from "@/db/schema";
import { db } from "@/lib/db";
import type { AssetClass } from "@/lib/db/enums";
import { parseISO } from "date-fns";
import { and, asc, desc, eq, gte, lte } from "drizzle-orm";
import { getStartDate, toIsoDate } from "./period";
import type { Period } from "./types";

export type DbSnapshot = typeof portfolioSnapshots.$inferSelect;
export type Snapshot = DbSnapshot;
export type DbBenchmarkPoint = typeof benchmarksHistory.$inferSelect;
export type BenchmarkPoint = DbBenchmarkPoint;

export interface OpenPosition {
  id: string;
  assetId: string;
  quantity: string;
  averageCost: string;
  costCurrency: string;
  asset: {
    id: string;
    ticker: string;
    name: string;
    assetClass: AssetClass;
    sector: string | null;
  };
}

export interface MonthlyReturn {
  year: number;
  month: number;
  return: number;
}

export function getDateRangeFromPeriod(period: Period): {
  startDate: string;
  endDate: string;
} {
  const end = new Date();
  const endDate = toIsoDate(end);
  const start = getStartDate(period, end);
  if (start === null) return { startDate: "2000-01-01", endDate };
  return { startDate: toIsoDate(start), endDate };
}

export async function getLatestSnapshotForUser(userId: string): Promise<Snapshot | null> {
  const [row] = await db
    .select()
    .from(portfolioSnapshots)
    .where(eq(portfolioSnapshots.userId, userId))
    .orderBy(desc(portfolioSnapshots.date))
    .limit(1);
  return row ?? null;
}

export async function getSnapshotForUser(userId: string, date: string): Promise<Snapshot | null> {
  const [row] = await db
    .select()
    .from(portfolioSnapshots)
    .where(and(eq(portfolioSnapshots.userId, userId), eq(portfolioSnapshots.date, date)))
    .limit(1);
  return row ?? null;
}

export async function getSnapshotsInRange(
  userId: string,
  startDate: string,
  endDate: string
): Promise<Snapshot[]> {
  return db
    .select()
    .from(portfolioSnapshots)
    .where(
      and(
        eq(portfolioSnapshots.userId, userId),
        gte(portfolioSnapshots.date, startDate),
        lte(portfolioSnapshots.date, endDate)
      )
    )
    .orderBy(asc(portfolioSnapshots.date));
}

export async function getBenchmarksInRange(
  benchmark: string,
  startDate: string,
  endDate: string
): Promise<BenchmarkPoint[]> {
  return db
    .select()
    .from(benchmarksHistory)
    .where(
      and(
        eq(benchmarksHistory.benchmark, benchmark),
        gte(benchmarksHistory.date, startDate),
        lte(benchmarksHistory.date, endDate)
      )
    )
    .orderBy(asc(benchmarksHistory.date));
}

export async function getUserOpenPositions(userId: string): Promise<OpenPosition[]> {
  return db
    .select({
      id: positions.id,
      assetId: positions.assetId,
      quantity: positions.quantity,
      averageCost: positions.averageCost,
      costCurrency: positions.costCurrency,
      asset: {
        id: assets.id,
        ticker: assets.ticker,
        name: assets.name,
        assetClass: assets.assetClass,
        sector: assets.sector,
      },
    })
    .from(positions)
    .innerJoin(assets, eq(positions.assetId, assets.id))
    .where(and(eq(positions.userId, userId), eq(positions.isOpen, "true")));
}

export async function getMonthlyReturnsForUser(
  userId: string,
  startDate: string,
  endDate: string
): Promise<MonthlyReturn[]> {
  const snapshots = await getSnapshotsInRange(userId, startDate, endDate);
  if (snapshots.length < 2) return [];

  const buckets = new Map<string, { year: number; month: number; first: number; last: number }>();

  for (const s of snapshots) {
    const d = parseISO(s.date);
    const year = d.getUTCFullYear();
    const month = d.getUTCMonth() + 1;
    const key = `${year}-${String(month).padStart(2, "0")}`;
    const value = Number(s.totalValue);
    const existing = buckets.get(key);
    if (!existing) {
      buckets.set(key, { year, month, first: value, last: value });
    } else {
      existing.last = value;
    }
  }

  return Array.from(buckets.values()).map(({ year, month, first, last }) => ({
    year,
    month,
    return: first > 0 ? last / first - 1 : 0,
  }));
}
