// @vitest-environment node
import "./_setup";
import { assets, brokerageAccounts, userPreferences, users } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { db } from "@/lib/db";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let testUserId: string;

beforeAll(async () => {
  const email = `test-${Date.now()}@exemplo.com`;
  const passwordHash = await hashPassword("senhateste123segura");
  const [u] = await db.insert(users).values({ email, name: "Test User", passwordHash }).returning();
  if (!u) throw new Error("Falha ao criar usuario de teste");
  testUserId = u.id;
});

afterAll(async () => {
  try {
    await db.delete(users).where(eq(users.id, testUserId));
  } catch (err) {
    console.error("[cleanup schema test] erro:", err);
  }
});

describe("schema integration", () => {
  it("insere brokerageAccount e retorna UUID", async () => {
    const [acc] = await db
      .insert(brokerageAccounts)
      .values({
        userId: testUserId,
        name: "Conta Teste",
        type: "brokerage",
        broker: "xp",
      })
      .returning();
    expect(acc).toBeDefined();
    expect(acc?.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("insere asset com ticker unico", async () => {
    const ticker = `TEST${Date.now().toString().slice(-6)}`;
    const [asset] = await db
      .insert(assets)
      .values({ ticker, name: "Ativo Teste", assetClass: "stock" })
      .returning();
    expect(asset).toBeDefined();
    expect(asset?.ticker).toBe(ticker);
  });

  it("rejeita asset com ticker duplicado", async () => {
    const ticker = `DUP${Date.now().toString().slice(-6)}`;
    await db.insert(assets).values({
      ticker,
      name: "Primeiro",
      assetClass: "stock",
    });
    await expect(
      db.insert(assets).values({
        ticker,
        name: "Duplicado",
        assetClass: "stock",
      })
    ).rejects.toThrow();
  });

  it("cascade: deletar user deleta brokerageAccount", async () => {
    const email = `cascade-${Date.now()}@exemplo.com`;
    const passwordHash = await hashPassword("senhateste123segura");
    const [u] = await db
      .insert(users)
      .values({ email, name: "Cascade Test", passwordHash })
      .returning();
    if (!u) throw new Error("Falha");
    const userId = u.id;

    await db.insert(brokerageAccounts).values({
      userId,
      name: "Conta Cascade",
      type: "brokerage",
      broker: "xp",
    });

    await db.delete(users).where(eq(users.id, userId));

    const remaining = await db
      .select()
      .from(brokerageAccounts)
      .where(eq(brokerageAccounts.userId, userId));
    expect(remaining).toHaveLength(0);
  });

  it("scopes: getAccountForUser retorna null para accountId errado", async () => {
    const { getAccountForUser } = await import("@/lib/db/scopes");
    const fakeId = "00000000-0000-0000-0000-000000000000";
    const result = await getAccountForUser(fakeId, testUserId);
    expect(result).toBeNull();
  });

  it("preferences: insere com default vazio", async () => {
    const [pref] = await db
      .insert(userPreferences)
      .values({ userId: testUserId, preferences: "{}" })
      .returning();
    expect(pref).toBeDefined();
    expect(pref?.preferences).toBe("{}");
  });
});
