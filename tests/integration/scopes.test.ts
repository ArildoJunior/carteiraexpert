// @vitest-environment node
import "./_setup";
import { assets, brokerageAccounts, positions, users } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { db } from "@/lib/db";
import {
  getAccountForUser,
  getAlertForUser,
  getPositionForUser,
  getPreferencesForUser,
  getWatchlistForUser,
} from "@/lib/db/scopes";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let userA: string;
let userB: string;
let accountA: string;
let positionA: string;
let assetRealId: string;

beforeAll(async () => {
  const [a] = await db
    .insert(users)
    .values({
      email: `usera-${Date.now()}@exemplo.com`,
      name: "User A",
      passwordHash: await hashPassword("senhateste123segura"),
    })
    .returning();
  const [b] = await db
    .insert(users)
    .values({
      email: `userb-${Date.now()}@exemplo.com`,
      name: "User B",
      passwordHash: await hashPassword("senhateste123segura"),
    })
    .returning();
  if (!a || !b) throw new Error("Falha ao criar users");
  userA = a.id;
  userB = b.id;

  const [acc] = await db
    .insert(brokerageAccounts)
    .values({
      userId: userA,
      name: "Conta A",
      type: "brokerage",
      broker: "xp",
    })
    .returning();
  if (!acc) throw new Error("Falha");
  accountA = acc.id;

  // Cria asset real para satisfazer a FK de positions.asset_id
  const ticker = `TEST_SCOPE_${Date.now()}`;
  const [realAsset] = await db
    .insert(assets)
    .values({
      ticker,
      name: "Asset Scope Test",
      assetClass: "stock",
    })
    .returning();
  if (!realAsset) throw new Error("Falha ao criar asset real");
  assetRealId = realAsset.id;

  const [position] = await db
    .insert(positions)
    .values({
      userId: userA,
      accountId: accountA,
      assetId: assetRealId,
      quantity: "100",
      averageCost: "38.5",
    })
    .returning();
  if (!position) throw new Error("Falha");
  positionA = position.id;
});

afterAll(async () => {
  try {
    await db.delete(users).where(eq(users.id, userA));
  } catch {}
  try {
    await db.delete(users).where(eq(users.id, userB));
  } catch {}
});

describe("scopes - isolamento por user", () => {
  it("getAccountForUser retorna conta quando user e dono", async () => {
    const result = await getAccountForUser(accountA, userA);
    expect(result).not.toBeNull();
    expect(result?.userId).toBe(userA);
  });

  it("getAccountForUser retorna null quando user nao e dono", async () => {
    const result = await getAccountForUser(accountA, userB);
    expect(result).toBeNull();
  });

  it("getPositionForUser respeita user", async () => {
    const a = await getPositionForUser(positionA, userA);
    expect(a).not.toBeNull();

    const b = await getPositionForUser(positionA, userB);
    expect(b).toBeNull();
  });

  it("getWatchlistForUser retorna null para id inexistente", async () => {
    const result = await getWatchlistForUser("00000000-0000-0000-0000-000000000000", userA);
    expect(result).toBeNull();
  });

  it("getAlertForUser retorna null para id inexistente", async () => {
    const result = await getAlertForUser("00000000-0000-0000-0000-000000000000", userA);
    expect(result).toBeNull();
  });

  it("getPreferencesForUser retorna null se nao existe", async () => {
    const result = await getPreferencesForUser(userB);
    expect(result).toBeNull();
  });
});
