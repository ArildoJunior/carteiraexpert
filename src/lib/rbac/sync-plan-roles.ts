/**
 * Cap. 9B.1.d — RBAC: conector users.plan <-> papel "premium".
 *
 *   await syncPlanRoles(userId, "free");  // garante user, remove premium
 *   await syncPlanRoles(userId, "pro");   // garante user, adiciona premium
 *
 * Comportamento:
 *   - Garante que o papel 'user' esteja sempre presente (base).
 *   - 'pro' -> grant do papel 'premium' (idempotente).
 *   - 'free' (ou qualquer coisa diferente de 'pro') -> revoke de 'premium'.
 *   - Invalida o cache do can() para o user (invalidateUser).
 *
 * Idempotencia:
 *   - grant/revoke usam .onConflictDoNothing() / .where() com RETURNING,
 *     entao rodar N vezes tem o mesmo efeito que rodar 1 vez.
 *
 * Falhas:
 *   - Se o catalogo RBAC nao tiver 'user' ou 'premium', lanca erro
 *     explicativo (chame seed:rbac antes).
 *   - Erros de DB sao propagados (caller decide o que fazer — 500 etc).
 */

import { roles, userRoles } from "@/db/schema";
import { db } from "@/lib/db";
import { and, eq } from "drizzle-orm";
import { invalidateUser } from "./can";

export type UserPlan = "free" | "pro";

type DbExec = typeof db;

let executor: DbExec = db;

/** @internal Substitui o executor de DB (uso de teste). */
export function __setDbExecutor(fn: DbExec | null): void {
  executor = fn ?? db;
}

/** @internal Reseta o executor de DB (uso de teste). */
export function __resetDbExecutor(): void {
  executor = db;
}

async function getRoleId(slug: string): Promise<string> {
  const [row] = await executor
    .select({ id: roles.id })
    .from(roles)
    .where(eq(roles.slug, slug))
    .limit(1);
  if (!row) {
    throw new Error(`Papel '${slug}' nao esta no catalogo. Rode: pnpm seed:rbac`);
  }
  return row.id;
}

async function grantRole(userId: string, roleId: string): Promise<boolean> {
  const inserted = await executor
    .insert(userRoles)
    .values({ userId, roleId })
    .onConflictDoNothing()
    .returning({ userId: userRoles.userId });
  return inserted.length > 0;
}

async function revokeRole(userId: string, roleId: string): Promise<boolean> {
  const deleted = await executor
    .delete(userRoles)
    .where(and(eq(userRoles.userId, userId), eq(userRoles.roleId, roleId)))
    .returning({ userId: userRoles.userId });
  return deleted.length > 0;
}

/**
 * Sincroniza os papeis do user com o valor de users.plan.
 *
 *   - "pro"  -> garante 'user' e 'premium'
 *   - outro  -> garante 'user', remove 'premium' se existir
 *
 * Chama invalidateUser(userId) no final para o cache do can()
 * enxergar a mudanca na proxima checagem.
 */
export async function syncPlanRoles(
  userId: string,
  plan: string
): Promise<{ granted: string[]; revoked: string[] }> {
  if (!userId) {
    throw new Error("syncPlanRoles: userId obrigatorio");
  }

  const userRoleId = await getRoleId("user");
  const premiumRoleId = await getRoleId("premium");

  const granted: string[] = [];
  const revoked: string[] = [];

  // 1) Sempre garantir 'user' (base)
  if (await grantRole(userId, userRoleId)) {
    granted.push("user");
  }

  // 2) premium conforme o plano
  if (plan === "pro") {
    if (await grantRole(userId, premiumRoleId)) {
      granted.push("premium");
    }
  } else {
    if (await revokeRole(userId, premiumRoleId)) {
      revoked.push("premium");
    }
  }

  // 3) Invalida cache do can() para esse user
  invalidateUser(userId);

  return { granted, revoked };
}
