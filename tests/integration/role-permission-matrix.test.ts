// @vitest-environment node
import "./_setup";
import { permissions, rolePermissions, roles } from "@/db/schema";
import { db } from "@/lib/db";
import { userPermissionEnum } from "@/lib/db/enums";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";

/**
 * Cap. 9B.1.e — RBAC: matriz esperada role x permission.
 *
 * Espelho fiel do seed-rbac. Se voce adicionar/remover uma permission
 * ou um vinculo, atualize ESTE arquivo JUNTO com o seed-rbac.
 *
 * Contagens (validadas pelo validate:rbac):
 *   admin    = 19
 *   editor   = 17
 *   user     = 11
 *   premium  = 12
 *   total    = 59
 */
const EXPECTED_MATRIX: Record<string, ReadonlySet<string>> = {
  admin: new Set([
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
  editor: new Set([
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
  user: new Set([
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
  premium: new Set([
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

async function loadMatrixFromDb(): Promise<Map<string, Set<string>>> {
  const rows = await db
    .select({ slug: roles.slug, key: permissions.key })
    .from(rolePermissions)
    .innerJoin(roles, eq(roles.id, rolePermissions.roleId))
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId));
  const map = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!map.has(r.slug)) map.set(r.slug, new Set<string>());
    map.get(r.slug)?.add(r.key);
  }
  return map;
}

describe("matriz role x permission no DB", () => {
  it("admin tem as 19 permissions esperadas", async () => {
    const actual = await loadMatrixFromDb();
    const admin = actual.get("admin") ?? new Set<string>();
    expect(admin.size).toBe(19);
    expect(admin).toEqual(EXPECTED_MATRIX.admin);
  });

  it("editor tem as 17 permissions esperadas", async () => {
    const actual = await loadMatrixFromDb();
    const editor = actual.get("editor") ?? new Set<string>();
    expect(editor.size).toBe(17);
    expect(editor).toEqual(EXPECTED_MATRIX.editor);
  });

  it("user tem as 11 permissions esperadas", async () => {
    const actual = await loadMatrixFromDb();
    const user = actual.get("user") ?? new Set<string>();
    expect(user.size).toBe(11);
    expect(user).toEqual(EXPECTED_MATRIX.user);
  });

  it("premium tem as 12 permissions esperadas", async () => {
    const actual = await loadMatrixFromDb();
    const premium = actual.get("premium") ?? new Set<string>();
    expect(premium.size).toBe(12);
    expect(premium).toEqual(EXPECTED_MATRIX.premium);
  });

  it("nao existe role extra alem dos 4 esperados", async () => {
    const actual = await loadMatrixFromDb();
    const expectedSlugs = new Set(Object.keys(EXPECTED_MATRIX));
    const extra = [...actual.keys()].filter((s) => !expectedSlugs.has(s));
    expect(extra).toEqual([]);
  });

  it("todas as permissions do DB estao no enum (sem orfaos)", async () => {
    const actual = await loadMatrixFromDb();
    const enumSet = new Set<string>(userPermissionEnum as readonly string[]);
    for (const perms of actual.values()) {
      for (const key of perms) {
        expect(enumSet.has(key)).toBe(true);
      }
    }
  });
});
