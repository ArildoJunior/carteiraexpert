import { cacheGet, cacheGetStale, cacheSet, cacheSetStale } from "@/lib/redis/upstash";

const TTL = {
  benchmark: 60 * 60 * 6, // 6h
  snapshot: 60 * 60 * 12, // 12h
  overview: 60 * 15, // 15min
} as const;

const STALE_TTL = {
  benchmark: 60 * 60 * 24 * 7, // 7d
  snapshot: 60 * 60 * 24 * 7,
  overview: 60 * 60 * 2,
} as const;

export const cacheKeys = {
  benchmark: (b: string, s: string, e: string) => `dashboard:benchmark:${b}:${s}:${e}`,
  snapshot: (u: string, d: string) => `dashboard:snapshot:${u}:${d}`,
  overview: (u: string) => `dashboard:overview:${u}`,
};

export async function cacheGetBenchmark<T>(key: string): Promise<T | null> {
  return cacheGet<T>(key);
}
export async function cacheSetBenchmark<T>(key: string, value: T): Promise<void> {
  await cacheSet(key, value, TTL.benchmark);
}
export async function cacheGetBenchmarkStale<T>(key: string): Promise<T | null> {
  return cacheGetStale<T>(key);
}
export async function cacheSetBenchmarkStale<T>(key: string, value: T): Promise<void> {
  await cacheSetStale(key, value, STALE_TTL.benchmark);
}
export async function cacheGetSnapshot<T>(key: string): Promise<T | null> {
  return cacheGet<T>(key);
}
export async function cacheSetSnapshot<T>(key: string, value: T): Promise<void> {
  await cacheSet(key, value, TTL.snapshot);
}
export async function cacheGetOverview<T>(key: string): Promise<T | null> {
  return cacheGet<T>(key);
}
export async function cacheSetOverview<T>(key: string, value: T): Promise<void> {
  await cacheSet(key, value, TTL.overview);
}
