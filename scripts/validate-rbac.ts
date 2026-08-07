/**
 * Cap. 9B.1 — RBAC: valida o catalogo no banco Neon.
 *
 *  1) Carrega .env explicitamente (caminho robusto, nao depende do cwd).
 *  2) Remove o orfao `admin.access` que ficou de uma rodada
 *     anterior (a FK role_permissions.permission_id tem
 *     ON DELETE CASCADE, entao a role_permission some junto).
 *  3) Confere as 3 contagens: roles=4, permissions=19,
 *     role_permissions=59.
 *  4) Lista a matriz role -> permissions para inspecao.
 *  5) Confere o enum user_plan e a coluna users.plan.
 *
 * Idempotente. Pode rodar quantas vezes quiser.
 *
 * Executar: pnpm validate:rbac
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import postgres from "postgres";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootEnv = path.resolve(__dirname, "..", ".env");
dotenv.config({ path: rootEnv });

// Mesma normalizacao aplicada em src/lib/env.ts: o .env do projeto
// vem com aspas externas literais no DATABASE_URL ("..."), e a
// postgres-js usa new URL() internamente, que rejeita URL com aspas.
const rawUrl = process.env.DATABASE_URL;
if (!rawUrl) {
  console.error(`DATABASE_URL nao definida (procurado em ${rootEnv})`);
  process.exit(1);
}
const url = rawUrl.replace(/^["']|["']$/g, "");
const sql = postgres(url, { ssl: "require" });

async function main() {
  // 1) Cleanup do orfao admin.access
  const deleted = await sql`DELETE FROM permissions WHERE key = 'admin.access' RETURNING key`;
  if (deleted.length > 0) {
    console.log(`[cleanup] permissao removida: ${deleted.map((r) => r.key).join(", ")}`);
  } else {
    console.log("[cleanup] nada a remover (ja limpo)");
  }

  // 2) Contagens (com guard para noUncheckedIndexedAccess)
  const rolesRow = (await sql<{ roles: number }[]>`SELECT count(*)::int AS roles FROM roles`)[0];
  const permsRow = (
    await sql<{ perms: number }[]>`SELECT count(*)::int AS perms FROM permissions`
  )[0];
  const rpsRow = (
    await sql<{ rps: number }[]>`SELECT count(*)::int AS rps FROM role_permissions`
  )[0];
  const r = rolesRow?.roles ?? 0;
  const p = permsRow?.perms ?? 0;
  const rp = rpsRow?.rps ?? 0;

  console.log("");
  console.log(`[counts] roles:            ${r}  (esperado 4)`);
  console.log(`[counts] permissions:      ${p}  (esperado 19)`);
  console.log(`[counts] role_permissions: ${rp} (esperado 59)`);

  if (r !== 4 || p !== 19 || rp !== 59) {
    throw new Error(`Contagens nao conferem: ${r}/${p}/${rp} (esperado 4/19/59)`);
  }

  // 3) Matriz
  console.log("");
  console.log("[matrix] role -> permissions");
  const rows = await sql<{ slug: string; key: string }[]>`
    SELECT r.slug, p.key
    FROM role_permissions rp
    JOIN roles r ON r.id = rp.role_id
    JOIN permissions p ON p.id = rp.permission_id
    ORDER BY r.slug, p.key`;
  const byRole = new Map<string, string[]>();
  for (const row of rows) {
    if (!byRole.has(row.slug)) byRole.set(row.slug, []);
    byRole.get(row.slug)?.push(row.key);
  }
  for (const slug of ["admin", "editor", "user", "premium"]) {
    const perms = byRole.get(slug) ?? [];
    console.log(`  ${slug.padEnd(8)} (${perms.length}) ${perms.join(", ")}`);
  }

  // 4) Schema
  const planRow = (
    await sql<{ plan_values: string }[]>`SELECT enum_range(NULL::user_plan)::text AS plan_values`
  )[0];
  const planValues = planRow?.plan_values ?? "<desconhecido>";
  console.log("");
  console.log(`[schema] user_plan enum: ${planValues}`);

  const planCol = await sql<
    { column_name: string; data_type: string; column_default: string | null }[]
  >`
    SELECT column_name, data_type, column_default
    FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'plan'`;
  if (planCol.length === 0) throw new Error("Coluna users.plan nao encontrada");
  const c = planCol[0];
  if (!c) throw new Error("Coluna users.plan nao encontrada (row vazia)");
  console.log(
    `[schema] users.plan: data_type=${c.data_type}, default=${c.column_default ?? "<null>"}`
  );

  console.log("");
  console.log("[validate-rbac] OK");
}

main()
  .catch((err: unknown) => {
    console.error("[validate-rbac] FALHOU:", err);
    process.exit(1);
  })
  .finally(() => sql.end());
