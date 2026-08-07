//@vitest-environment node
import { ForbiddenError, UnauthorizedError } from "@/lib/auth/errors";
import { __resetForTests, __setPermissionFetcher } from "@/lib/rbac/can";
import { requirePermission } from "@/lib/rbac/require-permission";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Fetcher = (userId: string) => Promise<Set<string>>;

const buildFetcher = (map: Record<string, Set<string>>): Fetcher => {
  return async (userId: string) => map[userId] ?? new Set();
};

describe("requirePermission", () => {
  beforeEach(() => {
    __setPermissionFetcher(buildFetcher({}));
  });

  afterEach(() => {
    __resetForTests();
    vi.useRealTimers();
  });

  it("devolve a permissão quando o userId tem a permissão única", async () => {
    __setPermissionFetcher(buildFetcher({ u1: new Set(["users.read"]) }));

    await expect(requirePermission({ kind: "userId", userId: "u1" }, "users.read")).resolves.toBe(
      "users.read"
    );
  });

  it("devolve a primeira permissão permitida quando recebe um array", async () => {
    __setPermissionFetcher(buildFetcher({ u1: new Set(["positions.read", "users.read"]) }));

    await expect(
      requirePermission({ kind: "userId", userId: "u1" }, ["accounts.read", "users.read"] as const)
    ).resolves.toBe("users.read");
  });

  it("lança UnauthorizedError quando userId é null", async () => {
    await expect(
      requirePermission({ kind: "userId", userId: null }, "users.read")
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("lança UnauthorizedError quando userId é undefined", async () => {
    await expect(
      requirePermission({ kind: "userId", userId: undefined }, "users.read")
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("lança UnauthorizedError quando session é null", async () => {
    await expect(
      requirePermission({ kind: "session", session: null }, "users.read")
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("lança UnauthorizedError quando session não tem user.id", async () => {
    const session = { user: {} } as never;

    await expect(
      requirePermission({ kind: "session", session }, "users.read")
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("lança ForbiddenError quando o user não tem a permissão única", async () => {
    __setPermissionFetcher(buildFetcher({ u1: new Set([]) }));

    await expect(
      requirePermission({ kind: "userId", userId: "u1" }, "users.read")
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("lança ForbiddenError quando o user não tem nenhuma do array", async () => {
    __setPermissionFetcher(buildFetcher({ u1: new Set(["positions.read"]) }));

    await expect(
      requirePermission({ kind: "userId", userId: "u1" }, ["users.read", "users.write"] as const)
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("lança erro de defesa quando o array de permissões está vazio", async () => {
    __setPermissionFetcher(buildFetcher({ u1: new Set(["users.read"]) }));

    await expect(
      requirePermission({ kind: "userId", userId: "u1" }, [] as const)
    ).rejects.toThrow();
  });

  it("reutiliza o cache do can() entre chamadas para o mesmo userId", async () => {
    const fetcher = vi.fn<Fetcher>(async (userId: string) => {
      if (userId === "u1") return new Set(["users.read"]);
      return new Set();
    });

    __setPermissionFetcher(fetcher);

    await requirePermission({ kind: "userId", userId: "u1" }, "users.read");
    await requirePermission({ kind: "userId", userId: "u1" }, "users.read");

    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
