// Upstash Redis via REST (sem SDK externo).
// Cache com 2 namespaces: fresh (TTL curto) e stale (TTL longo, fallback).
const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

const enabled = Boolean(url && token);

type Entry = { value: unknown; expiresAt: number | null };

const freshStore = new Map<string, Entry>();
const staleStore = new Map<string, Entry>();

function isExpired(entry: Entry | undefined): boolean {
  if (!entry) return true;
  if (entry.expiresAt === null) return false;
  return Date.now() > entry.expiresAt;
}

async function restGet(key: string): Promise<unknown | null> {
  if (!enabled) return null;
  const fullUrl = `${url}/get/${encodeURIComponent(key)}`;
  const res = await fetch(fullUrl, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { result?: unknown };
  return body.result ?? null;
}

async function restSet(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
  if (!enabled) return;
  const fullUrl = `${url}/set/${encodeURIComponent(key)}`;
  await fetch(fullUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      value,
      ...(ttlSeconds ? { ex: ttlSeconds } : {}),
    }),
    cache: "no-store",
  });
}

async function restDel(key: string): Promise<void> {
  if (!enabled) return;
  const fullUrl = `${url}/del/${encodeURIComponent(key)}`;
  await fetch(fullUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
}

export async function cacheGet<T = unknown>(key: string): Promise<T | null> {
  if (enabled) {
    try {
      const v = await restGet(key);
      if (v !== null && v !== undefined) return v as T;
    } catch {
      // cai pro Map local
    }
  }
  const entry = freshStore.get(key);
  if (isExpired(entry)) {
    freshStore.delete(key);
    return null;
  }
  return (entry?.value ?? null) as T | null;
}

export async function cacheSet<T = unknown>(
  key: string,
  value: T,
  ttlSeconds?: number
): Promise<void> {
  if (enabled) {
    try {
      await restSet(key, value, ttlSeconds);
      return;
    } catch {
      // cai pro Map local
    }
  }
  const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : null;
  freshStore.set(key, { value, expiresAt });
}

export async function cacheGetStale<T = unknown>(key: string): Promise<T | null> {
  if (enabled) {
    try {
      const v = await restGet(`stale:${key}`);
      if (v !== null && v !== undefined) return v as T;
    } catch {
      // cai pro Map local
    }
  }
  const entry = staleStore.get(key);
  if (isExpired(entry)) {
    staleStore.delete(key);
    return null;
  }
  return (entry?.value ?? null) as T | null;
}

export async function cacheSetStale<T = unknown>(
  key: string,
  value: T,
  ttlSeconds?: number
): Promise<void> {
  if (enabled) {
    try {
      await restSet(`stale:${key}`, value, ttlSeconds);
      return;
    } catch {
      // cai pro Map local
    }
  }
  const expiresAt = ttlSeconds ? Date.now() + ttlSeconds * 1000 : null;
  staleStore.set(key, { value, expiresAt });
}

export async function cacheDelete(key: string): Promise<void> {
  if (enabled) {
    try {
      await restDel(key);
      await restDel(`stale:${key}`);
      return;
    } catch {
      // cai pro Map local
    }
  }
  freshStore.delete(key);
  staleStore.delete(key);
}
