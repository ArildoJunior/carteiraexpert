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

describe("GET /api/v1/imports/jobs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { id: "user-1" } });
  });

  it("retorna 401 sem autenticacao", async () => {
    authMock.mockResolvedValueOnce(null);
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("retorna lista vazia quando user nao tem jobs", async () => {
    selectMock.mockReturnValue({
      from: vi.fn().mockReturnValue({
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        limit: vi.fn().mockResolvedValue([]),
      }),
    });
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as { jobs: unknown[] };
    expect(body.jobs).toEqual([]);
  });

  it("converte colunas text de contadores pra numero e faz join com broker", async () => {
    const mockRows = [
      {
        id: "job-1",
        connectionId: "conn-1",
        sourceFilename: "sofisa.csv",
        triggeredBy: "manual",
        status: "success",
        startedAt: new Date("2026-07-15"),
        finishedAt: new Date("2026-07-15"),
        rowsRead: "10",
        rowsImported: "8",
        rowsUpdated: "0",
        rowsSkipped: "2",
        rowsQueued: "0",
        errorMessage: null,
        durationMs: "1250",
        brokerSlug: "sofisa",
        brokerName: "Sofisa Direto",
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
    const res = await GET();
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      jobs: Array<{
        id: string;
        rows_read: number;
        rows_imported: number;
        duration_ms: number;
        broker_slug: string;
      }>;
    };
    expect(body.jobs).toHaveLength(1);
    expect(body.jobs[0]?.id).toBe("job-1");
    expect(body.jobs[0]?.rows_read).toBe(10);
    expect(body.jobs[0]?.rows_imported).toBe(8);
    expect(body.jobs[0]?.duration_ms).toBe(1250);
    expect(body.jobs[0]?.broker_slug).toBe("sofisa");
  });

  it("trata duration_ms null como null (nao como 0)", async () => {
    const mockRows = [
      {
        id: "job-2",
        connectionId: "conn-1",
        sourceFilename: null,
        triggeredBy: "manual",
        status: "running",
        startedAt: new Date(),
        finishedAt: null,
        rowsRead: "0",
        rowsImported: "0",
        rowsUpdated: "0",
        rowsSkipped: "0",
        rowsQueued: "0",
        errorMessage: null,
        durationMs: null,
        brokerSlug: "xp",
        brokerName: "XP",
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
    const res = await GET();
    const body = (await res.json()) as { jobs: Array<{ duration_ms: number | null }> };
    expect(body.jobs[0]?.duration_ms).toBeNull();
  });
});
