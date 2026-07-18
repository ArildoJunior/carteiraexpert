import { beforeEach, describe, expect, it, vi } from "vitest";

const authMock = vi.fn();
vi.mock("@/lib/auth", () => ({
  auth: () => authMock(),
}));

const logAuditMock = vi.fn();
vi.mock("@/lib/db/audit", () => ({
  logAudit: (...args: unknown[]) => logAuditMock(...args),
}));

const applyMock = vi.fn();
vi.mock("@/lib/integrations/apply", () => ({
  applyQueueItems: (...args: unknown[]) => applyMock(...args),
}));

import { POST } from "../route";

const makeJsonRequest = (body: unknown, throwsJson = false): Request => {
  return {
    json: async () => {
      if (throwsJson) throw new Error("invalid json");
      return body;
    },
  } as unknown as Request;
};

const makeUUIDs = (n: number): string[] => {
  // UUIDs validos pro Zod (qualquer UUID v4 serve)
  return Array.from(
    { length: n },
    (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`
  );
};

describe("POST /api/v1/imports/review", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    applyMock.mockResolvedValue({
      imported: 2,
      duplicates: 0,
      rejected: 0,
      errors: 0,
      details: [
        { itemId: makeUUIDs(2)[0], action: "imported", transactionId: "tx-1", positionId: "pos-1" },
        { itemId: makeUUIDs(2)[1], action: "imported", transactionId: "tx-2", positionId: "pos-2" },
      ],
    });
  });

  it("retorna 401 sem autenticacao", async () => {
    authMock.mockResolvedValueOnce(null);
    const req = makeJsonRequest({ itemIds: ["id-1"], decision: "accept" });
    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it("retorna 400 quando JSON do body e invalido", async () => {
    const req = makeJsonRequest(null, true);
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("retorna 400 quando itemIds esta ausente", async () => {
    const req = makeJsonRequest({ decision: "accept" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("retorna 400 quando decision e invalida", async () => {
    const req = makeJsonRequest({ itemIds: ["id-1"], decision: "wrong" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("retorna 400 quando itemIds tem mais de 500 itens", async () => {
    const ids = makeUUIDs(501);
    const req = makeJsonRequest({ itemIds: ids, decision: "accept" });
    const res = await POST(req);
    expect(res.status).toBe(400);
  });

  it("retorna 200 com payload e chama logAudit reviewed+applied em caso de sucesso", async () => {
    const req = makeJsonRequest({
      itemIds: makeUUIDs(2),
      decision: "accept",
    });
    const res = await POST(req);
    expect(res.status).toBe(200);

    const body = (await res.json()) as {
      applied: number;
      imported: number;
      duplicates: number;
      rejected: number;
      errors: number;
      details: unknown[];
    };
    expect(body.imported).toBe(2);
    expect(body.applied).toBe(2);
    expect(body.details).toHaveLength(2);

    // Audit duplo: reviewed antes, applied depois
    expect(logAuditMock).toHaveBeenCalledTimes(2);
    expect(logAuditMock).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        userId: "user-1",
        action: "import.reviewed",
        resourceType: "import_queue",
        metadata: { decision: "accept", count: 2 },
      })
    );
    expect(logAuditMock).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        userId: "user-1",
        action: "import.applied",
        resourceType: "import_queue",
        metadata: { decision: "accept", imported: 2, duplicates: 0, rejected: 0, errors: 0 },
      })
    );
  });

  it("retorna 409 quando applyQueueItems lanca erro (lock concorrente)", async () => {
    applyMock.mockRejectedValueOnce(new Error("Ja existe um apply em andamento para este usuario"));
    const req = makeJsonRequest({
      itemIds: makeUUIDs(1),
      decision: "accept",
    });
    const res = await POST(req);
    expect(res.status).toBe(409);
    const body = (await res.json()) as { message: string };
    expect(body.message).toContain("apply em andamento");

    // Log de reviewed roda antes do apply, mas log de applied NAO roda (caminho de erro)
    expect(logAuditMock).toHaveBeenCalledTimes(1);
    expect(logAuditMock).toHaveBeenCalledWith(
      expect.objectContaining({ action: "import.reviewed" })
    );
  });
});
