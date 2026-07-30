// @vitest-environment node
import "./_setup";
import { roles, userRoles, users } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { db } from "@/lib/db";
import { syncPlanRoles } from "@/lib/rbac/sync-plan-roles";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const TEST_TAG = `syncplan-it-${Date.now()}`;
let userId: string;

async function getUserSlugs(uid: string): Promise<string[]> {
  const rows = await db
    .select({ slug: roles.slug })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(eq(userRoles.userId, uid));
  return rows.map((r) => r.slug).sort();
}

beforeAll(async () => {
  const passwordHash = await hashPassword("test-password-1234");
  const [u] = await db
    .insert(users)
    .values({
      email: `${TEST_TAG}@example.com`,
      name: TEST_TAG,
      passwordHash,
    })
    .returning();
  if (!u) throw new Error("Falha ao criar user de teste");
  userId = u.id;
});

afterAll(async () => {
  if (userId) {
    await db.delete(users).where(eq(users.id, userId));
  }
});

describe("syncPlanRoles() [integration]", () => {
  it("user fresh + plan='free' -> user_roles = ['user']", async () => {
    const result = await syncPlanRoles(userId, "free");
    expect(result.granted).toContain("user");
    expect(result.revoked).toEqual([]);
    const slugs = await getUserSlugs(userId);
    expect(slugs).toEqual(["user"]);
  });

  it("plan='pro' -> user_roles contem 'premium' alem de 'user'", async () => {
    const result = await syncPlanRoles(userId, "pro");
    expect(result.granted).toContain("premium");
    const slugs = await getUserSlugs(userId);
    expect(slugs).toEqual(["premium", "user"]);
  });

  it("plan='free' novamente -> revoga 'premium' e mantem 'user'", async () => {
    const result = await syncPlanRoles(userId, "free");
    expect(result.revoked).toContain("premium");
    const slugs = await getUserSlugs(userId);
    expect(slugs).toEqual(["user"]);
  });

  it("3x chamadas com mesmo plano -> user_roles nao cresce", async () => {
    await syncPlanRoles(userId, "pro");
    await syncPlanRoles(userId, "pro");
    const slugs = await getUserSlugs(userId);
    expect(slugs).toEqual(["premium", "user"]);
    // Confere tambem que nao duplicou a linha
    const all = await db.select().from(userRoles).where(eq(userRoles.userId, userId));
    expect(all).toHaveLength(2);
    // E que sao exatamente 1 user + 1 premium
    const byRole = await db
      .select({ roleId: userRoles.roleId, slug: roles.slug })
      .from(userRoles)
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(and(eq(userRoles.userId, userId), eq(roles.slug, "user")));
    expect(byRole).toHaveLength(1);
  });
});
