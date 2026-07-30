/**
 * Cap. 9B.1.c — RBAC: checagem de permissao com cache in-process TTL 60s.
 *
 *   const ok = await can(userId, "accounts.write");
 *   const okAny = await canAny(userId, ["accounts.write", "users.write"]);
 *
 * Comportamento fail-closed:
 *   - userId null/undefined/""       -> false
 *   - permission fora do enum         -> false
 *   - user sem papel                  -> false
 *   - erro no DB                      -> false (logado, nao propaga)
 *
 * Cache:
 *   - Chave: userId
 *   - Valor: { perms: Set<Permission>, expiresAt: number }
 *   - TTL: 60s (constante CACHE_TTL_MS)
 *   - Invalidation: invalidateUser(userId) / invalidateAll()
 *   - Race: 5 reqs simultaneas para o mesmo userId = 1 query
 *     (outras esperam a mesma promise).
 *
 * Multi-instancia:
 *   - Cada instancia (ex.: Vercel lambda) tem seu proprio Map.
 *   - TTL 60s e curto o suficiente para que a divergencia entre
 *     instancias seja aceitavel. Se o caller precisa de consistencia
 *     estrita (ex.: grant-premium logo apos check), use
 *     invalidateAll() antes.
 *
 * Insercao em teste:
 *   - __setPermissionFetcher(fn) substitui o fetcher real por um mock.
 *   - __resetForTests() limpa cache + fetcher.
 *   - Ambos sao exportados com prefixo __ para indicar "interno".
 *
 * Nota: este modulo NAO usa `import "server-only"` propositalmente
 * (o pacote nao esta nas deps e o vitest nao o resolve). Porem,
 * o modulo continua sendo de servidor porque importa `db` (que
 * usa postgres-js). Em um client component, o build do Next vai
 * falhar com erro de importacao de `db`.
 */

import { permissions, rolePermissions, userRoles } from "@/db/schema";
import { db } from "@/lib/db";
import { type UserPermission, userPermissionEnum } from "@/lib/db/enums";
import { eq, inArray } from "drizzle-orm";

const CACHE_TTL_MS = 60_000;

type Permission = UserPermission;

type CacheEntry = {
  perms: Set<Permission>;
  expiresAt: number;
};

const cache = new Map<string, CacheEntry>();

// O fetcher devolve o conjunto cru de strings vindo do DB. A
// filtragem para permissions validas acontece na hora de popular
// o cache (uma unica vez por TTL).
type Fetcher = (userId: string) => Promise<Set<string>>;

const realFetcher: Fetcher = async (userId: string) => {
  const roleRows = await db
    .select({ roleId: userRoles.roleId })
    .from(userRoles)
    .where(eq(userRoles.userId, userId));
  if (roleRows.length === 0) return new Set<string>();

  const roleIds = roleRows.map((r) => r.roleId);

  const rows = await db
    .select({ key: permissions.key })
    .from(rolePermissions)
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(inArray(rolePermissions.roleId, roleIds));

  return new Set(rows.map((r) => r.key));
};

let fetcher: Fetcher = realFetcher;

// in-flight: evita 5 queries paralelas para o mesmo userId
const inflight = new Map<string, Promise<Set<Permission>>>();

function isValidPermission(p: string): p is Permission {
  return (userPermissionEnum as readonly string[]).includes(p);
}

function filterToPermissions(raw: Set<string>): Set<Permission> {
  const set = new Set<Permission>();
  for (const s of raw) {
    if (isValidPermission(s)) set.add(s);
  }
  return set;
}

async function loadPerms(userId: string): Promise<Set<Permission>> {
  // 1) cache hit (e nao expirado)
  const now = Date.now();
  const entry = cache.get(userId);
  if (entry && entry.expiresAt > now) {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.log(`[can] cache hit userId=${userId} ttl=${Math.max(0, entry.expiresAt - now)}ms`);
    }
    return entry.perms;
  }

  // 2) ja tem uma promise em voo para esse userId? reusa
  const pending = inflight.get(userId);
  if (pending) return pending;

  // 3) dispara a query
  const p = fetcher(userId)
    .then((raw) => {
      const filtered = filterToPermissions(raw);
      cache.set(userId, { perms: filtered, expiresAt: Date.now() + CACHE_TTL_MS });
      if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.log(`[can] cache miss userId=${userId} loaded=${filtered.size}`);
      }
      return filtered;
    })
    .catch((err) => {
      // Fail-closed: loga e devolve set vazio
      // eslint-disable-next-line no-console
      console.error(`[can] fetcher error userId=${userId}:`, err);
      return new Set<Permission>();
    })
    .finally(() => {
      inflight.delete(userId);
    });

  inflight.set(userId, p);
  return p;
}

/**
 * Retorna true se o user tem a permission. Fail-closed em qualquer
 * caso de erro (ver comentario no topo do arquivo).
 */
export async function can(userId: string | null | undefined, permission: string): Promise<boolean> {
  if (!userId) return false;
  if (!isValidPermission(permission)) return false;
  const perms = await loadPerms(userId);
  return perms.has(permission);
}

/**
 * Retorna true se o user tem pelo menos uma das permissions.
 * Lista vazia -> false.
 */
export async function canAny(
  userId: string | null | undefined,
  perms: ReadonlyArray<string>
): Promise<boolean> {
  if (!userId) return false;
  if (perms.length === 0) return false;
  const valid = perms.filter(isValidPermission);
  if (valid.length === 0) return false;
  const owned = await loadPerms(userId);
  return valid.some((p) => owned.has(p as Permission));
}

/**
 * Invalida o cache de um user especifico. Use apos grant/revoke de papel
 * (ex.: 9B.1.d quando users.plan muda para "pro").
 */
export function invalidateUser(userId: string): void {
  cache.delete(userId);
  // Nota: nao limpamos inflight — se a promise ja foi disparada,
  // seu resultado ainda vai para o cache, mas com TTL 60s. Em troca,
  // ganhamos consistencia de nao ter 2 fetches paralelos.
}

/**
 * Invalida todo o cache. Use em casos extremos (ex.: reset de permissoes).
 */
export function invalidateAll(): void {
  cache.clear();
}

/**
 * Helper de conveniencia para rotas que ja tem a session na mao.
 */
export async function canFromSession(
  session: { user?: { id?: string | null } } | null | undefined,
  permission: string
): Promise<boolean> {
  const id = session?.user?.id ?? null;
  return can(id, permission);
}

// ============================================================
// Escape hatches de teste (prefixo __)
// ============================================================

/** @internal Substitui o fetcher (uso de teste). */
export function __setPermissionFetcher(fn: Fetcher | null): void {
  fetcher = fn ?? realFetcher;
}

/** @internal Reseta cache + fetcher (uso de teste). */
export function __resetForTests(): void {
  cache.clear();
  inflight.clear();
  fetcher = realFetcher;
}
