// @vitest-environment node
import "./_setup";
import {
  assets,
  brokerageAccounts,
  userPreferences,
  users,
  watchlistItems,
  watchlists,
} from "@/db/schema";
import { db } from "@/lib/db";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

let userId: string;
const SEED_EMAIL = "demo@carteiraexpert.com";

beforeAll(async () => {
  const [u] = await db.select().from(users).where(eq(users.email, SEED_EMAIL)).limit(1);
  if (u) userId = u.id;
});

describe("seed", () => {
  it("usuario demo existe", () => {
    if (!userId) {
      throw new Error("Seed nao foi executado. Rode: pnpm db:seed antes dos testes");
    }
    expect(userId).toBeTruthy();
  });

  it("11 ativos foram criados pelo seed", async () => {
    const all = await db.select().from(assets);
    const tickers = all.map((a) => a.ticker);
    expect(tickers).toContain("PETR4");
    expect(tickers).toContain("VALE3");
    expect(tickers).toContain("HGLG11");
    expect(tickers).toContain("BOVA11");
    expect(tickers).toContain("BTC");
    expect(tickers).toContain("ETH");
    expect(tickers).toContain("TESOURO_SELIC_2029");
  });

  it("conta XP foi criada", async () => {
    if (!userId) return;
    const [acc] = await db
      .select()
      .from(brokerageAccounts)
      .where(eq(brokerageAccounts.userId, userId))
      .limit(1);
    expect(acc).toBeDefined();
    expect(acc?.broker).toBe("xp");
  });

  it("watchlist com 3 ativos foi criada", async () => {
    if (!userId) return;
    const [w] = await db.select().from(watchlists).where(eq(watchlists.userId, userId)).limit(1);
    expect(w).toBeDefined();

    if (w) {
      const items = await db
        .select()
        .from(watchlistItems)
        .where(eq(watchlistItems.watchlistId, w.id));
      expect(items).toHaveLength(3);
    }
  });

  it("preferencias default foram criadas", async () => {
    if (!userId) return;
    const [p] = await db
      .select()
      .from(userPreferences)
      .where(eq(userPreferences.userId, userId))
      .limit(1);
    expect(p).toBeDefined();
    expect(p?.preferences).toContain("theme");
  });
});
