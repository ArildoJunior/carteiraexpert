import { portfolioSnapshots, users } from "@/db/schema";
import { inngest } from "@/inngest/client";
import { getLatestSnapshotForUser, getUserOpenPositions } from "@/lib/benchmarks/queries";
import { calculateDailyTWR } from "@/lib/benchmarks/twr";
import { db } from "@/lib/db";
import type { AssetClass } from "@/lib/db/enums";
import { getQuote } from "@/lib/quotes/manager";
import { eq } from "drizzle-orm";
import { revalidateTag } from "next/cache";

type Step = {
  run: <T>(name: string, fn: () => Promise<T>) => Promise<T>;
  sendEvent: (name: string, events: Array<{ name: string; data: unknown }>) => Promise<void>;
};

export const calculatePortfolioSnapshots = inngest.createFunction(
  {
    id: "calculate-portfolio-snapshots",
    name: "Calculate portfolio snapshots",
    triggers: [{ cron: "30 22 * * *", tz: "America/Sao_Paulo" }],
  },
  async ({ step }: { step: Step }) => {
    const userIds = await step.run("list-users", async () => {
      const rows = await db
        .select({ id: users.id })
        .from(users)
        .innerJoin(portfolioSnapshots, eq(portfolioSnapshots.userId, users.id))
        .groupBy(users.id);
      return rows.map((r) => r.id);
    });
    if (userIds.length === 0) return { processed: 0 };
    await step.sendEvent(
      "fanout-snapshots",
      userIds.map((userId) => ({
        name: "dashboard/snapshot.calculate",
        data: { userId },
      }))
    );
    return { processed: userIds.length };
  }
);

type OpenPosition = {
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
};

export const snapshotForUser = inngest.createFunction(
  {
    id: "snapshot-for-user",
    name: "Snapshot for a single user",
    triggers: [{ event: "dashboard/snapshot.calculate" }],
  },
  async ({ event, step }: { event: { data: { userId: string } }; step: Step }) => {
    const { userId } = event.data;
    const positions = (await step.run("fetch-positions", async () =>
      getUserOpenPositions(userId)
    )) as OpenPosition[];

    if (positions.length === 0) {
      return { userId, saved: false, reason: "no_positions" };
    }

    const quotes = (await step.run("fetch-quotes", async () => {
      return Promise.all(
        positions.map(async (p) => {
          const r = await getQuote(p.asset.ticker, p.asset.assetClass);
          const price = r.ok
            ? Number(r.quote.price)
            : r.staleQuote
              ? Number(r.staleQuote.price)
              : null;
          return { position: p, price };
        })
      );
    })) as Array<{ position: OpenPosition; price: number | null }>;

    let totalValue = 0;
    let totalCost = 0;
    const byClass = new Map<AssetClass, { value: number; count: number }>();
    for (const { position, price } of quotes) {
      const fallbackPrice = price ?? Number(position.averageCost) * Number(position.quantity);
      const value = price !== null ? Number(position.quantity) * price : fallbackPrice;
      const cost = Number(position.averageCost) * Number(position.quantity);
      totalValue += value;
      totalCost += cost;
      const cur = byClass.get(position.asset.assetClass) ?? { value: 0, count: 0 };
      cur.value += value;
      cur.count += 1;
      byClass.set(position.asset.assetClass, cur);
    }

    const unrealizedPnl = totalValue - totalCost;
    const positionsCount = positions.length;

    const twr = (await step.run("calc-twr", async () => {
      const prev = await getLatestSnapshotForUser(userId);
      if (!prev) return { twrDaily: 0, twrCumulative: 0 };
      const today = new Date().toISOString().slice(0, 10);
      const todaySnap = {
        date: today,
        totalValue,
        totalCost,
        twrDaily: 0,
        twrCumulative: 0,
      };
      const prevTyped = {
        date: prev.date,
        totalValue: Number(prev.totalValue),
        totalCost: Number(prev.totalCost),
        twrDaily: Number(prev.twrDaily),
        twrCumulative: Number(prev.twrCumulative),
      };
      const twrDaily = calculateDailyTWR(prevTyped, todaySnap);
      const twrCumulative = Number(prev.twrCumulative) * (1 + twrDaily);
      return { twrDaily, twrCumulative };
    })) as { twrDaily: number; twrCumulative: number };

    const today = new Date().toISOString().slice(0, 10);
    const allocationByClass = JSON.stringify(Object.fromEntries(Array.from(byClass.entries())));

    await step.run("persist", async () => {
      await db
        .insert(portfolioSnapshots)
        .values({
          userId,
          date: today,
          totalValue: String(totalValue),
          totalCost: String(totalCost),
          unrealizedPnl: String(unrealizedPnl),
          realizedPnl: "0",
          twrDaily: String(twr.twrDaily),
          twrCumulative: String(twr.twrCumulative),
          allocationByClass,
          positionsCount: String(positionsCount),
        })
        .onConflictDoNothing();
    });

    await step.run("revalidate", async () => {
      revalidateTag("dashboard", "default");
    });
    return { userId, saved: true, totalValue, twrCumulative: twr.twrCumulative };
  }
);
