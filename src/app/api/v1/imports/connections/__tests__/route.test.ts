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

describe("GET /api/v1/imports/connections", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { id: "user-1" } });
  });

  it("retorna 401 sem autenticacao", async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("retorna lista vazia quando user nao tem conexoes", async () => {
    // Chain termina em orderBy (sem limit) - mocka orderBy pra resolver o array
    selectMock.mockReturnValue({
      from: vi.fn().mockReturnValue({
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue([]),
      }),
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { connections: unknown[] };
    expect(body.connections).toEqual([]);
  });

  it("retorna conexoes com join do broker (slug, name, logo_url)", async () => {
    const mockRows = [
      {
        id: "conn-1",
        status: "active",
        lastImportAt: new Date("2026-07-15"),
        lastImportError: null,
        createdAt: new Date("2026-07-01"),
        brokerSlug: "sofisa",
        brokerName: "Sofisa Direto",
        brokerLogoUrl: "/logos/sofisa.png",
      },
    ];
    // Chain termina em orderBy - mocka orderBy pra resolver o array
    selectMock.mockReturnValue({
      from: vi.fn().mockReturnValue({
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockResolvedValue(mockRows),
      }),
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      connections: Array<{
        id: string;
        broker_slug: string;
        broker_name: string;
        logo_url: string;
      }>;
    };
    expect(body.connections).toHaveLength(1);
    expect(body.connections[0]?.id).toBe("conn-1");
    expect(body.connections[0]?.broker_slug).toBe("sofisa");
    expect(body.connections[0]?.broker_name).toBe("Sofisa Direto");
    expect(body.connections[0]?.logo_url).toBe("/logos/sofisa.png");
  });
});
