/**
 * Cap. 9B.1.b.ii — RBAC: migracao de usuarios existentes para
 * a tabela user_roles.
 *
 * Para cada usuario:
 *   - Atribui o papel correspondente a `users.role` legado
 *     ('user' | 'editor' | 'admin')
 *   - Se `users.plan = 'pro'`, tambem atribui o papel 'premium'
 *   - Garante que 'user' esteja sempre presente como base
 *
 * Idempotente: pode rodar varias vezes. Usa o padrao before/after
 * (mesmo do seed-rbac) para calcular quantos user_roles foram
 * inseridos de verdade.
 *
 * Executar: pnpm seed:migrate-roles
 */

import "dotenv/config";
import { roles, userRoles, users } from "@/db/schema";
import { db } from "@/lib/db";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL nao definida (verifique .env na raiz do projeto)");
}

type LegacyRole = "user" | "editor" | "admin";

async function main() {
  console.log("[migrate-user-roles] Iniciando migracao dos usuarios...");

  // 1) Mapa slug -> id de todos os papeis do catalogo
  const allRoles = await db.select({ id: roles.id, slug: roles.slug }).from(roles);
  const roleBySlug = new Map(allRoles.map((r) => [r.slug, r.id]));

  for (const required of ["user", "editor", "admin", "premium"]) {
    if (!roleBySlug.has(required)) {
      throw new Error(`Papel '${required}' nao esta no catalogo. Rode: pnpm seed:rbac`);
    }
  }

  // 2) Snapshot antes (chave userId::roleId)
  const before = await db
    .select({ userId: userRoles.userId, roleId: userRoles.roleId })
    .from(userRoles);
  const beforeSet = new Set(before.map((b) => `${b.userId}::${b.roleId}`));

  // 3) Lista de usuarios
  const allUsers = await db
    .select({ id: users.id, role: users.role, plan: users.plan })
    .from(users);
  console.log(`[migrate-user-roles] Encontrados ${allUsers.length} usuarios`);

  let invalidRole = 0;
  for (const u of allUsers) {
    const slugs = new Set<string>(["user"]); // sempre

    // Mapear users.role legado
    const legacy = u.role as LegacyRole | null;
    if (legacy === "admin" || legacy === "editor" || legacy === "user") {
      slugs.add(legacy);
    } else {
      // null ou valor nao esperado -> apenas 'user' como fallback
      invalidRole++;
    }

    // Se pro, tambem atribui 'premium'
    if (u.plan === "pro") {
      slugs.add("premium");
    }

    for (const slug of slugs) {
      const roleId = roleBySlug.get(slug);
      if (!roleId) continue;
      await db.insert(userRoles).values({ userId: u.id, roleId }).onConflictDoNothing();
    }
  }

  // 4) Snapshot depois
  const after = await db
    .select({ userId: userRoles.userId, roleId: userRoles.roleId })
    .from(userRoles);
  const afterSet = new Set(after.map((a) => `${a.userId}::${a.roleId}`));

  let inserted = 0;
  for (const k of afterSet) if (!beforeSet.has(k)) inserted++;

  const totalUserRoles = after.length;
  const usersWithRoles = new Set(after.map((a) => a.userId)).size;

  console.log("");
  console.log("[migrate-user-roles] OK");
  console.log(`  usuarios processados:     ${allUsers.length}`);
  console.log(`  role legado invalido:     ${invalidRole}`);
  console.log(`  user_roles inseridos:     ${inserted} novos`);
  console.log(`  user_roles total:         ${totalUserRoles}`);
  console.log(`  usuarios com papeis:      ${usersWithRoles}`);

  if (allUsers.length > 0 && usersWithRoles === 0) {
    throw new Error("Nenhum usuario recebeu papel — verifique a migracao");
  }
}

main()
  .catch((err: unknown) => {
    console.error("[migrate-user-roles] FALHOU:", err);
    process.exit(1);
  })
  .finally(() => process.exit(0));
