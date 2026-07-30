import {
  __resetForTests,
  __setPermissionFetcher,
  can,
  canAny,
  canFromSession,
  invalidateAll,
  invalidateUser,
} from "@/lib/rbac/can";
// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Fetcher = (userId: string) => Promise<Set<string>>;

const buildFetcher = (map: Record<string, Set<string>>): Fetcher => {
  return async (userId: string) => map[userId] ?? new Set();
};

describe("can()", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    __resetForTests();
  });

  it("userId null/undefined -> false (fail-closed)", async () => {
    expect(await can(null, "accounts.write")).toBe(false);
    expect(await can(undefined, "accounts.write")).toBe(false);
    expect(await can("", "accounts.write")).toBe(false);
  });

  it("permission invalida -> false (fail-closed)", async () => {
    const fetcher = vi.fn(async () => new Set(["accounts.read"] as string[]));
    __setPermissionFetcher(fetcher);
    expect(await can("u1", "nao.existe")).toBe(false);
    expect(fetcher).not.toHaveBeenCalled(); // nao chega a carregar
  });

  it("cache miss: chama fetcher e consulta permissao", async () => {
    const fetcher = vi.fn(buildFetcher({ u1: new Set(["accounts.read"]) }));
    __setPermissionFetcher(fetcher);
    expect(await can("u1", "accounts.read")).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("cache hit dentro do TTL: nao chama fetcher de novo", async () => {
    const fetcher = vi.fn(buildFetcher({ u1: new Set(["accounts.read"]) }));
    __setPermissionFetcher(fetcher);
    expect(await can("u1", "accounts.read")).toBe(true);
    expect(await can("u1", "accounts.write")).toBe(false);
    expect(await can("u1", "accounts.read")).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1); // so 1x
  });

  it("cache expirou (TTL 60s): recarrega", async () => {
    const fetcher = vi.fn(buildFetcher({ u1: new Set(["accounts.read"]) }));
    __setPermissionFetcher(fetcher);
    expect(await can("u1", "accounts.read")).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
    // avanca 61s
    vi.advanceTimersByTime(61_000);
    expect(await can("u1", "accounts.read")).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("user sem nenhum papel -> false (e cache guarda set vazio)", async () => {
    const fetcher = vi.fn(async () => new Set<string>());
    __setPermissionFetcher(fetcher);
    expect(await can("u-novo", "accounts.read")).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
    // segunda chamada nao precisa recarregar
    expect(await can("u-novo", "accounts.read")).toBe(false);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("fetcher lanca erro -> fail-closed (false) sem propagar", async () => {
    const fetcher = vi.fn(async () => {
      throw new Error("DB offline");
    });
    __setPermissionFetcher(fetcher);
    // Suprime o console.error do can (esperado nesse teste)
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(await can("u-err", "accounts.read")).toBe(false);
    errSpy.mockRestore();
  });

  it("invalidateUser limpa o cache para 1 user", async () => {
    const fetcher = vi.fn(buildFetcher({ u1: new Set(["accounts.read"]) }));
    __setPermissionFetcher(fetcher);
    expect(await can("u1", "accounts.read")).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
    invalidateUser("u1");
    expect(await can("u1", "accounts.read")).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("invalidateAll limpa tudo", async () => {
    const fetcher = vi.fn(
      buildFetcher({
        u1: new Set(["accounts.read"]),
        u2: new Set(["users.write"]),
      })
    );
    __setPermissionFetcher(fetcher);
    await can("u1", "accounts.read");
    await can("u2", "users.write");
    expect(fetcher).toHaveBeenCalledTimes(2);
    invalidateAll();
    await can("u1", "accounts.read");
    await can("u2", "users.write");
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
});

describe("canAny()", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    __resetForTests();
  });

  it("retorna true se tem pelo menos 1 das permissions", async () => {
    __setPermissionFetcher(buildFetcher({ u1: new Set(["accounts.read"]) }));
    expect(await canAny("u1", ["accounts.read", "accounts.write"])).toBe(true);
  });

  it("retorna false se nao tem nenhuma", async () => {
    __setPermissionFetcher(buildFetcher({ u1: new Set(["accounts.read"]) }));
    expect(await canAny("u1", ["users.write", "users.delete"])).toBe(false);
  });

  it("lista vazia -> false", async () => {
    const fetcher = vi.fn(async () => new Set(["accounts.read"]));
    __setPermissionFetcher(fetcher);
    expect(await canAny("u1", [])).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("permissions invalidas (todas) -> false sem chamar fetcher", async () => {
    const fetcher = vi.fn(async () => new Set(["accounts.read"]));
    __setPermissionFetcher(fetcher);
    expect(await canAny("u1", ["nao.existe", "outro.tbm.nao"])).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("userId null -> false", async () => {
    expect(await canAny(null, ["accounts.read"])).toBe(false);
  });
});

describe("canFromSession()", () => {
  afterEach(() => {
    __resetForTests();
  });

  it("extrai userId da session e delega para can()", async () => {
    __setPermissionFetcher(buildFetcher({ u1: new Set(["accounts.write"]) }));
    expect(await canFromSession({ user: { id: "u1" } }, "accounts.write")).toBe(true);
    expect(await canFromSession({ user: { id: "u1" } }, "users.delete")).toBe(false);
  });

  it("session null ou sem id -> false", async () => {
    expect(await canFromSession(null, "accounts.write")).toBe(false);
    expect(await canFromSession({}, "accounts.write")).toBe(false);
    expect(await canFromSession({ user: {} }, "accounts.write")).toBe(false);
  });
});
