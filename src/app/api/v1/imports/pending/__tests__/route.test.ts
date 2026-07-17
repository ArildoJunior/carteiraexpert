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

describe("GET /api/v1/imports/pending", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { id: "user-1" } });
  });

  it("retorna 401 sem autenticacao", async () => {
    authMock.mockResolvedValueOnce(null);
    const req = new Request("http://localhost/api/v1/imports/pending");
    const res = await GET(req);
    expect(res.status).toBe(401);
  });

  it("retorna lista vazia quando nao ha pendentes", async () => {
    selectMock.mockReturnValue({
      from: vi.fn().mockReturnValue({
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      }),
    });
    const req = new Request("http://localhost/api/v1/imports/pending");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: unknown[]; total: number };
    expect(body.data).toEqual([]);
    expect(body.total).toBe(0);
  });

  it("retorna transacoes pendentes com payload parseado", async () => {
    const mockRows = [
      {
        id: "q1",
        payload: JSON.stringify({ ticker: "PETR4", side: "buy", quantity: 100 }),
        canonicalHash: "abc123",
        createdAt: new Date("2026-07-17"),
        brokerName: "Sofisa",
        brokerSlug: "sofisa",
        connectionId: "conn-1",
      },
    ];
    selectMock.mockReturnValue({
      from: vi.fn().mockReturnValue({
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue(mockRows),
      }),
    });
    const req = new Request("http://localhost/api/v1/imports/pending");
    const res = await GET(req);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      data: Array<{ id: string; payload: { ticker: string } }>;
      total: number;
    };
    expect(body.total).toBe(1);
    expect(body.data[0]?.id).toBe("q1");
    expect(body.data[0]?.payload.ticker).toBe("PETR4");
  });

  it("limita a 200 mesmo se o query param pedir mais", async () => {
    let capturedLimit = 0;
    selectMock.mockReturnValue({
      from: vi.fn().mockReturnValue({
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockImplementation((n: number) => {
          capturedLimit = n;
          return Promise.resolve([]);
        }),
      }),
    });
    const req = new Request("http://localhost/api/v1/imports/pending?limit=999");
    await GET(req);
    expect(capturedLimit).toBe(200);
  });
});
