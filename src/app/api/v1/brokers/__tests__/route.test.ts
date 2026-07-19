import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({
  auth: () => authMock(),
}));

const selectMock = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    select: (...args: unknown[]) => selectMock(...args),
  },
}));

import { GET } from "../route";

describe("GET /api/v1/brokers", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { id: "user-1" } });
  });

  it("retorna 401 sem autenticacao", async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("retorna lista de corretoras ativas", async () => {
    const mockRows = [
      {
        id: "b1",
        slug: "sofisa",
        name: "Sofisa",
        kind: "brokerage",
        provider: "manual",
        logoUrl: null,
      },
      {
        id: "b2",
        slug: "xp",
        name: "XP",
        kind: "brokerage",
        provider: "manual",
        logoUrl: "/x.png",
      },
    ];
    selectMock.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(mockRows),
      }),
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { brokers: Array<{ slug: string }> };
    expect(body.brokers).toHaveLength(2);
    expect(body.brokers[0]?.slug).toBe("sofisa");
  });

  it("retorna lista vazia quando nao ha corretoras ativas", async () => {
    selectMock.mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { brokers: unknown[] };
    expect(body.brokers).toEqual([]);
  });
});
