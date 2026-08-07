/**
 * Cap. 9B.1 — RBAC: seed do catalogo (roles, permissions, role_permissions).
 *
 * Insere:
 *   - 4 roles: admin, editor, user, premium
 *   - 19 permissions (chaves do `userPermissionEnum`)
 *   - Matriz role_permissions (4 x 19 = 59 entradas) conforme definido no cap.
 *
 * Idempotente: usa `onConflictDoNothing` em todos os inserts.
 * Pode rodar quantas vezes quiser sem duplicar.
 *
 * Executar: pnpm seed:rbac
 */

import "dotenv/config";
import { permissions, rolePermissions, roles } from "@/db/schema";
import { db } from "@/lib/db";
import { userPermissionEnum } from "@/lib/db/enums";
import { count } from "drizzle-orm";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL nao definida (verifique .env na raiz do projeto)");
}

type RoleSeed = { slug: string; name: string; description: string };

const ROLES: RoleSeed[] = [
  {
    slug: "admin",
    name: "Administrador",
    description: "Equipe interna com acesso total ao sistema, incluindo painel admin.",
  },
  {
    slug: "editor",
    name: "Editor",
    description: "Equipe interna com acesso de leitura/escrita a portfolio e quotes.",
  },
  {
    slug: "user",
    name: "Usuario",
    description: "Usuario final com acesso CRUD apenas aos proprios recursos.",
  },
  {
    slug: "premium",
    name: "Premium",
    description: "Usuario final com plano Pro. Herda `user` + permissao de refresh de quotes.",
  },
];

/**
 * Matriz role_permissions do cap. 9B.1.
 * Total: 19 + 17 + 11 + 12 = 59 entradas.
 */
const MATRIX: Record<string, ReadonlyArray<(typeof userPermissionEnum)[number]>> = {
  // Equipe interna: tudo.
  admin: [...userPermissionEnum],

  // Editor: leitura total + escrita em portfolio e quotes (sem deletar usuarios, sem admin).
  editor: [
    "users.read",
    "accounts.read",
    "accounts.write",
    "accounts.delete",
    "positions.read",
    "positions.write",
    "positions.delete",
    "transactions.read",
    "transactions.write",
    "transactions.delete",
    "quotes.read",
    "quotes.refresh",
    "documents.read",
    "documents.write",
    "documents.delete",
    "documents.review",
    "documents.publish",
  ],

  // User: CRUD apenas nos proprios recursos; sem refresh de quotes.
  user: [
    "users.read",
    "accounts.read",
    "accounts.write",
    "accounts.delete",
    "positions.read",
    "positions.write",
    "positions.delete",
    "transactions.read",
    "transactions.write",
    "transactions.delete",
    "quotes.read",
  ],

  // Premium: herda `user` e ganha refresh de quotes.
  premium: [
    "users.read",
    "accounts.read",
    "accounts.write",
    "accounts.delete",
    "positions.read",
    "positions.write",
    "positions.delete",
    "transactions.read",
    "transactions.write",
    "transactions.delete",
    "quotes.read",
    "quotes.refresh",
  ],
};

async function main() {
  console.log("[seed-rbac] Iniciando seed do catalogo RBAC...");

  // 1) Roles
  for (const r of ROLES) {
    await db.insert(roles).values(r).onConflictDoNothing({ target: roles.slug });
    console.log(`  role:   ${r.slug.padEnd(8)} ${r.name}`);
  }

  // 2) Permissions (espelha o enum userPermissionEnum)
  for (const key of userPermissionEnum) {
    await db
      .insert(permissions)
      .values({ key, description: null })
      .onConflictDoNothing({ target: permissions.key });
    console.log(`  perm:   ${key}`);
  }

  // 3) role_permissions
  //    Carrega mapa slug->id e key->id em memoria (são apenas 4 + 19 = 23 rows).
  const allRoles = await db.select({ id: roles.id, slug: roles.slug }).from(roles);
  const allPerms = await db.select({ id: permissions.id, key: permissions.key }).from(permissions);
  const roleBySlug = new Map(allRoles.map((r) => [r.slug, r.id]));
  const permByKey = new Map(allPerms.map((p) => [p.key, p.id]));

  // Conta quantos ja existem antes, para calcular o delta no final.
  const before = await db.select({ id: rolePermissions.roleId }).from(rolePermissions);
  const beforeSet = new Set(before.map((b) => `${b.id}`));

  for (const [roleSlug, permKeys] of Object.entries(MATRIX)) {
    const roleId = roleBySlug.get(roleSlug);
    if (!roleId) throw new Error(`Role nao encontrada: ${roleSlug}`);
    for (const key of permKeys) {
      const permId = permByKey.get(key);
      if (!permId) throw new Error(`Permission nao encontrada: ${key}`);
      await db
        .insert(rolePermissions)
        .values({ roleId, permissionId: permId })
        .onConflictDoNothing();
    }
  }
  const after = await db.select({ id: rolePermissions.roleId }).from(rolePermissions);
  const afterSet = new Set(after.map((a) => `${a.id}`));
  let inserted = 0;
  for (const id of afterSet) if (!beforeSet.has(id)) inserted++;
  const skipped = 59 - inserted;
  console.log(`  rp:     ${inserted} novos, ${skipped} ja existentes`);

  // 4) Validacao final (com guard para noUncheckedIndexedAccess)
  const rolesCountRow = (await db.select({ total: count() }).from(roles))[0];
  const permsCountRow = (await db.select({ total: count() }).from(permissions))[0];
  const rpCountRow = (await db.select({ total: count() }).from(rolePermissions))[0];

  const rolesCount = rolesCountRow?.total ?? 0;
  const permsCount = permsCountRow?.total ?? 0;
  const rpCount = rpCountRow?.total ?? 0;

  console.log("");
  console.log("[seed-rbac] OK");
  console.log(`  roles:           ${rolesCount} (esperado 4)`);
  console.log(`  permissions:     ${permsCount} (esperado 19)`);
  console.log(`  role_permissions: ${rpCount} (esperado 59)`);

  if (rolesCount !== 4 || permsCount !== 19 || rpCount !== 59) {
    throw new Error(
      `Contagens nao conferem: ${rolesCount}/${permsCount}/${rpCount} (esperado 4/19/59)`
    );
  }
}

main()
  .catch((err: unknown) => {
    console.error("[seed-rbac] FALHOU:", err);
    process.exit(1);
  })
  .finally(() => process.exit(0));
