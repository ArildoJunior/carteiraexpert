import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock do db com Proxy: qualquer chamada no chain retorna o proprio chain,
// e o chain e "thenable" (await resolve para []).
const dbChain = new Proxy(
  {},
  {
    get(_target: object, prop: string | symbol) {
      if (prop === "then") {
        return (resolve: (value: unknown) => void) => resolve([]);
      }
      return vi.fn(() => dbChain);
    },
  }
);

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    select: vi.fn(() => dbChain),
  },
}));
vi.mock("next/cache", () => ({
  unstable_cache: (fn: unknown) => fn,
  revalidateTag: vi.fn(),
}));

import { GET } from "../route";

const authMock = (await import("@/lib/auth")).auth as unknown as ReturnType<typeof vi.fn>;

describe("GET /api/v1/dashboard/overview", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retorna 401 sem sessao", async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await GET(new Request("http://localhost/api/v1/dashboard/overview"));
    expect(res.status).toBe(401);
  });

  it("retorna 200 com reason no_snapshot_yet quando vazio", async () => {
    authMock.mockResolvedValueOnce({ user: { id: "user-1" } });
    const res = await GET(new Request("http://localhost/api/v1/dashboard/overview"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toBeNull();
    expect(body.reason).toBe("no_snapshot_yet");
  });

  it("retorna 400 com query invalida", async () => {
    authMock.mockResolvedValueOnce({ user: { id: "user-1" } });
    const res = await GET(new Request("http://localhost/api/v1/dashboard/overview?period=INVALID"));
    expect(res.status).toBe(400);
  });
});
