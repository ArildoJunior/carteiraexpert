import { env } from "@/lib/env";

type CacheEntry = { value: unknown; expiresAt: number };
const memCache = new Map<string, CacheEntry>();

function memGet<T>(key: string): T | null {
  const entry = memCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    memCache.delete(key);
    return null;
  }
  return entry.value as T;
}

function memSet(key: string, value: unknown, ttlSeconds: number) {
  memCache.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
}

async function restGet<T>(key: string): Promise<T | null> {
  try {
    const res = await fetch(`${env.UPSTASH_REDIS_REST_URL}/get/${encodeURIComponent(key)}`, {
      headers: { Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { result: string | null };
    return data.result ? (JSON.parse(data.result) as T) : null;
  } catch {
    return null;
  }
}

async function restSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  try {
    await fetch(
      `${env.UPSTASH_REDIS_REST_URL}/set/${encodeURIComponent(key)}/${encodeURIComponent(JSON.stringify(value))}?EX=${ttlSeconds}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${env.UPSTASH_REDIS_REST_TOKEN}` },
        cache: "no-store",
      }
    );
  } catch {
    // silencioso: cache e melhor-esforco
  }
}

const useUpstash = Boolean(env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN);

export async function cacheGet<T>(key: string): Promise<T | null> {
  return useUpstash ? restGet<T>(key) : memGet<T>(key);
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  if (useUpstash) await restSet(key, value, ttlSeconds);
  else memSet(key, value, ttlSeconds);
}

export const cacheGetStale = cacheGet;
export const cacheSetStale = cacheSet;
