// @vitest-environment node
import "./_setup";
import { roles, userRoles, users } from "@/db/schema";
import { hashPassword } from "@/lib/auth/password";
import { db } from "@/lib/db";
import { type UserPermission, userPermissionEnum } from "@/lib/db/enums";
import { __resetForTests, can } from "@/lib/rbac/can";
import { inArray } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const PWD = "test-password-1234";
const TAG = `canmatrix-${Date.now()}`;

type RoleSlug = "admin" | "editor" | "user" | "premium";

/**
 * Mesma matriz do role-permission-matrix.test.ts. Mantemos em
 * sincronia: se voce mudar uma, mude a outra.
 */
const MATRIX: Record<RoleSlug, ReadonlySet<UserPermission>> = {
  admin: new Set<UserPermission>([
    "accounts.delete",
    "accounts.read",
    "accounts.write",
    "positions.delete",
    "positions.read",
    "positions.write",
    "quotes.read",
    "quotes.refresh",
    "transactions.delete",
    "transactions.read",
    "transactions.write",
    "users.delete",
    "users.read",
    "users.write",
    "documents.read",
    "documents.write",
    "documents.delete",
    "documents.review",
    "documents.publish",
  ]),
  editor: new Set<UserPermission>([
    "accounts.delete",
    "accounts.read",
    "accounts.write",
    "positions.delete",
    "positions.read",
    "positions.write",
    "quotes.read",
    "quotes.refresh",
    "transactions.delete",
    "transactions.read",
    "transactions.write",
    "users.read",
    "documents.read",
    "documents.write",
    "documents.delete",
    "documents.review",
    "documents.publish",
  ]),
  user: new Set<UserPermission>([
    "accounts.delete",
    "accounts.read",
    "accounts.write",
    "positions.delete",
    "positions.read",
    "positions.write",
    "quotes.read",
    "transactions.delete",
    "transactions.read",
    "transactions.write",
    "users.read",
  ]),
  premium: new Set<UserPermission>([
    "accounts.delete",
    "accounts.read",
    "accounts.write",
    "positions.delete",
    "positions.read",
    "positions.write",
    "quotes.read",
    "quotes.refresh",
    "transactions.delete",
    "transactions.read",
    "transactions.write",
    "users.read",
  ]),
};

const userIds: Record<RoleSlug, string> = {
  admin: "",
  editor: "",
  user: "",
  premium: "",
};

beforeAll(async () => {
  const roleRows = await db.select({ id: roles.id, slug: roles.slug }).from(roles);
  const roleIdBySlug = new Map<string, string>(roleRows.map((r) => [r.slug, r.id]));

  for (const slug of Object.keys(userIds) as RoleSlug[]) {
    const roleId = roleIdBySlug.get(slug);
    if (!roleId) {
      throw new Error(`Role '${slug}' nao esta no catalogo. Rode: pnpm seed:rbac`);
    }

    const passwordHash = await hashPassword(PWD);
    const [u] = await db
      .insert(users)
      .values({
        email: `${TAG}-${slug}@exemplo.com`,
        name: `Matrix Test ${slug}`,
        passwordHash,
      })
      .returning();
    if (!u) throw new Error(`Falha ao criar user de teste '${slug}'`);

    await db.insert(userRoles).values({ userId: u.id, roleId });
    userIds[slug] = u.id;
  }
});

afterAll(async () => {
  const ids = Object.values(userIds).filter(Boolean);
  if (ids.length > 0) {
    await db.delete(users).where(inArray(users.id, ids));
  }
});

beforeEach(() => {
  // Limpa cache + inflight + reseta fetcher. Garante que cada
  // test comece do zero, sem cache stale de tests anteriores.
  __resetForTests();
});

describe("can() percorre a matriz 4 x 19", () => {
  for (const slug of Object.keys(MATRIX) as RoleSlug[]) {
    it(`${slug} tem exatamente as permissions esperadas`, async () => {
      const expected = MATRIX[slug];
      const userId = userIds[slug];
      if (!userId) throw new Error(`userId para '${slug}' nao foi criado`);

      // Percorre as 19 permissions do enum e checa cada can()
      for (const perm of userPermissionEnum) {
        const expectedResult = expected.has(perm);
        const actualResult = await can(userId, perm);
        expect(actualResult).toBe(expectedResult);
      }
    });
  }
});
