import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: new Proxy({}, { get: () => undefined }),
}));

describe("quotes cache (memory mode)", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("cacheGet retorna null para chave inexistente", async () => {
    const { cacheGet } = await import("@/lib/redis/upstash");
    expect(await cacheGet("nope")).toBeNull();
  });

  it("cacheSet + cacheGet retorna o valor dentro do TTL", async () => {
    const { cacheGet, cacheSet } = await import("@/lib/redis/upstash");
    await cacheSet("k1", { foo: 1 }, 60);
    expect(await cacheGet<{ foo: number }>("k1")).toEqual({ foo: 1 });
  });

  it("cacheGet retorna null apos TTL expirar", async () => {
    vi.useFakeTimers();
    const { cacheGet, cacheSet } = await import("@/lib/redis/upstash");
    await cacheSet("k1", "v1", 60);
    vi.advanceTimersByTime(61_000);
    expect(await cacheGet("k1")).toBeNull();
    vi.useRealTimers();
  });

  it("cacheSetStale usa chave separada do cacheSet", async () => {
    const { cacheGet, cacheSet, cacheGetStale, cacheSetStale } = await import(
      "@/lib/redis/upstash"
    );
    await cacheSet("quote:ABC", "fresh", 60);
    await cacheSetStale("quote:stale:ABC", "stale", 86400);
    expect(await cacheGet("quote:ABC")).toBe("fresh");
    expect(await cacheGetStale("quote:stale:ABC")).toBe("stale");
    // cacheGetStale e alias de cacheGet (mesmo Map); a separacao e por chave,
    // nao por funcao. Por isso cacheGet tbm le o que cacheSetStale gravou.
    expect(await cacheGet("quote:stale:ABC")).toBeNull();
    expect(await cacheGetStale("quote:stale:ABC")).toBe("stale");
  });

  it("memory mode nao chama fetch", async () => {
    const fetchSpy = vi.spyOn(global, "fetch");
    const { cacheGet } = await import("@/lib/redis/upstash");
    await cacheGet("any");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
